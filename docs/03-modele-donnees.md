# Modèle relationnel cible

Complément normatif 2.1 : [relations et dictionnaire complémentaire](conception/02-donnees-et-relations.md). Il précise le registre de documents, les frais/destinations, les réceptions successives, les soldes d’ouverture et les états manquants. Les associations et types corrigés dans ce complément remplacent les raccourcis des tableaux ci-dessous.

Ce modèle est une prescription pour les migrations, pas une migration exécutable. PostgreSQL, clés UUID, snake_case. Tous les liens métier portent `organization_id` ; utiliser FK composites `(organization_id,id)` pour empêcher des références croisées. Clés externes `RESTRICT` par défaut, jamais cascade sur journaux et documents postés.

## Conventions

Colonnes communes aux agrégats : `id uuid`, `organization_id uuid`, `created_at timestamptz`, `created_by uuid`, `updated_at timestamptz`, `version integer not null default 1`. Toutes sauf exception explicite NOT NULL. `?` = nullable. Tables d’historique immutables ne portent pas `updated_at/version`. Pour documents : `number text`, `occurred_at`, `recorded_at`, `reason? text`. `amount` = bigint ; `qty` = numeric(20,6). Un événement valide possède un `business_event_id` utilisé pour l’audit et la traçabilité.

## Identité et configuration

| Table | Colonnes spécifiques et contraintes |
|---|---|
| organizations | name, currency_code char(3), currency_scale smallint 0..3, timezone, initialized_at? ; une ligne en V1 |
| users | ID provenant de Better Auth, organization_id, role OWNER/MANAGER, active boolean, display_name ; aucune copie de password dans métier |
| shops | code unique/org, name, address?, phone?, status SETUP/ACTIVE/SUSPENDED/CLOSED, activated_at?, closed_at? |
| manager_assignments | shop_id, user_id, started_at, ended_at? ; index unique partiel sur shop et sur user où ended_at IS NULL |
| policies | shop_id? (NULL = défaut réseau), revision, effective_at, discount_max_bps, expense_single_limit, expense_session_limit, credit_enabled, supplier_credit_enabled, depot_enabled, expiration_alert_days ; versions append-only |
| devices | shop_id, user_id, public_key, status ACTIVE/REVOKED/REPLACED, last_seen_at?, registered_at ; unique appareil ACTIVE/shop |
| device_capabilities | device_id, session_id, policy_revision, starts_at, expires_at, token_hash, revoked_at?, last_sequence ; pas de secret brut dans logs |
| locations | type SHOP/OWNER/DEPOT/TRANSIT, shop_id?, name, active ; un SHOP par boutique, un OWNER, un DEPOT actif max |
| payment_sources | location_id?, type CASH/MOBILE_MONEY/BANK/CARD/OWNER, label, money_account_id, active ; CASH boutique unique |

Tables sessions/comptes d’authentification générées par Better Auth puis versionnées dans migrations. Les sessions d’authentification sont distinctes des sessions de caisse. Initialisation propriétaire via commande CLI locale, pas de route publique de création OWNER.

## Catalogue et parties

| Table | Champs et invariants |
|---|---|
| categories | name unique/org, active |
| products | sku unique/org, name, category_id?, base_unit PIECE/KG/L/M, qty_precision 0..3, track_lots, track_expiry, active ; expiry implique lots |
| variants | product_id, sku unique/org, label, attributes jsonb validé, active ; une Standard auto |
| sale_units | variant_id, label, factor numeric(20,6)>0, barcode? unique/org, active ; unité de base facteur 1 obligatoire |
| shop_products | shop_id, variant_id, min_stock_qty>=0, enabled ; unique shop/variant |
| prices | shop_id, sale_unit_id, price_minor>=0, valid_from, valid_to? ; une version active/combinaison |
| lots | variant_id, code, expires_on? date ; unique variante/code ; expiré non supprimé |
| customers | shop_id, name, phone, normalized_phone, credit_limit_minor>=0, active ; doublon téléphone averti, pas unicité absolue |
| suppliers | name, phone?, address?, active |

Prix par boutique initialisés depuis un prix commun lors de l’activation. Pas de `NULL` interprété différemment selon les écrans. La grille des prix résout toujours un prix explicite.

## Documents commerciaux

| Table | Champs et invariants |
|---|---|
| sales | shop_id, session_id, customer_id?, device_id, status DRAFT/POSTED/REVERSED, gross_minor, discount_minor, total_minor, due_date?, policy_revision, source ONLINE/OFFLINE, reversal_of?, client_operation_id unique/org |
| sale_lines | sale_id, variant_id, sale_unit_id, label_snapshot, factor_snapshot, qty_sale_unit, qty_base, unit_price_minor, discount_bps, gross_minor, discount_minor, net_minor ; index sale |
| sale_cost_allocations | sale_line_id, cost_layer_id, qty, cost_minor ; immutable |
| payments | direction IN/OUT, amount_minor>0, source_id, session_id? requis si CASH boutique, external_reference?, occurred_at, status POSTED/REVERSED, reversal_of?, business_event_id |
| customer_payment_allocations | payment_id, sale_id, amount_minor>0 ; soldes vérifiés sous verrou vente/client |
| purchases | supplier_id, buyer_user_id, managing_shop_id? (NULL si achat propriétaire réseau), request_id?, status DRAFT/POSTED/CANCELLED, total_minor, due_date?, received_status calculé, payment_status calculé, control_status ; montant après POSTED immutable |
| purchase_lines | purchase_id, variant_id, unit_id, factor_snapshot, ordered_qty_base, unit_price_minor, goods_minor, allocated_fees_minor ; quantité >0 |
| supplier_payment_allocations | payment_id, purchase_id, amount_minor>0 |
| returns | sale_id, shop_id, status REQUESTED/APPROVED/RECEIVED/SETTLED/REJECTED, approved_by?, approved_at?, refund_due_minor, credit_reduction_minor, reason |
| return_lines | return_id, sale_line_id, qty_base, disposition AVAILABLE/DAMAGED, net_minor, cost_minor |
| refund_allocations | return_id, payment_id, amount_minor ; total <= refund_due |
| supplier_returns | purchase_id, status REQUESTED/APPROVED/DISPATCHED/SETTLED/REJECTED, debt_reduction_minor, reimbursement_due_minor, reason |
| supplier_return_lines | return_id, purchase_line_id, qty_base, amount_minor ; couches d’origine via allocations |
| supplier_refund_allocations | supplier_return_id, payment_id, amount_minor |
| debt_adjustments | target SALE/PURCHASE, target_id, amount_minor signé, type RETURN/WRITE_OFF/CORRECTION, approved_by, reason, source_document_id ; pas de float ni suppression |

Ne pas stocker un `due` mutable seul : calcul depuis montants et allocations, projection facultative réconciliée. La somme des paiements mixtes est validée dans le même service que la vente.

## Demandes, autorisations et dépenses

| Table | Champs |
|---|---|
| requests | shop_id, type RESTOCK/FUNDS/EXPENSE/SALE_EXCEPTION/CREDIT_EXCEPTION/CORRECTION, state DRAFT/SUBMITTED/NEEDS_INFO/APPROVED/PARTIAL/REJECTED/CANCELLED/CLOSED, revision, urgency NORMAL/URGENT, comment?, current_approval_id? |
| request_lines | request_id, variant_id? selon type, qty_base?, estimated_amount_minor, description |
| approvals | request_id, request_revision, actor_id, decided_at, outcome APPROVED/PARTIAL/REJECTED/NEEDS_INFO, buyer OWNER/MANAGER?, budget_minor, funding_source_id?, valid_until, reason? ; immutable |
| approval_lines | approval_id, request_line_id, variant_id?, max_qty_base?, max_amount_minor ; seule cette version autorise l’exécution |
| approval_consumptions | approval_id, document_type, document_id, amount_minor, qty_line_allocations jsonb typé ; unique document, contrôlé sous verrou approbation |
| expenses | shop_id, category, description, amount_minor, approval_id?, source_id, payment_id?, status DRAFT/REQUESTED/AUTHORIZED/POSTED/IRREGULAR/REJECTED, policy_revision, receipt_exception_reason? |
| fund_transfers | source_account_id, destination_account_id, shop_id?, approval_id?, amount_sent_minor, amount_received_minor?, state DRAFT/SENT/PARTIAL/RECEIVED/DISPUTED/CLOSED, sent_at?, received_at?, purpose PURCHASE_ADVANCE/REMITTANCE/FLOAT, purchase_request_id? |
| advance_allocations | transfer_id, purchase_payment_id?, returned_transfer_id?, reallocation_approval_id?, amount_minor ; exactement une destination et pas dépassement |

Chaque référence polymorphe (type/id) exige validation métier et trigger de cohérence ou tables spécialisées. Cursor ne doit pas prétendre qu’une FK existe lorsqu’elle ne peut pas être déclarée. Réduire le polymorphisme si un schéma avec colonnes FK exclusives rend les garanties plus claires.

## Stock

| Table | Champs |
|---|---|
| receipts | purchase_id?, shipment_id?, destination_location_id, received_by, received_at, status DRAFT/POSTED, surplus_case_id? ; une origine exactement |
| receipt_lines | receipt_id, purchase_line_id?, shipment_line_id?, variant_id, lot_id?, received_qty, damaged_qty, accepted_qty, remarks? |
| shipments | source_location_id, destination_location_id, request_id?, status DRAFT/APPROVED/DISPATCHED/PARTIAL/RECEIVED/DISPUTED/CLOSED, dispatched_by?, dispatched_at? |
| shipment_lines | shipment_id, variant_id, lot_id?, requested_qty, dispatched_qty ; allocations de couches associées |
| stock_events | type OPENING/RECEIPT/SALE/TRANSFER/RETURN/QUARANTINE/WRITE_OFF/COUNT/CORRECTION, source_type, source_id, occurred_at, recorded_at, actor_id, reversal_of? |
| stock_entries | event_id, location_id, variant_id, lot_id?, compartment, qty_signed non nul ; immutable |
| stock_balances | location_id, variant_id, lot_id?, compartment, qty>=0, version ; unicité NULLS NOT DISTINCT pour lot nullable |
| cost_layers | location_id, variant_id, lot_id?, receipt_line_id?, origin_layer_id?, received_at, initial_qty, remaining_qty, initial_value_minor, remaining_value_minor, valuation_origin PURCHASE/OPENING/ESTIMATE/TRANSFER/UNVALUED, compartment, shipment_line_id? requis si transit |
| stock_cost_allocations | stock_event_id, cost_layer_id, qty_signed, value_signed_minor ; immutables, liens pour retours et transferts |
| stock_counts | location_id, state DRAFT/COUNTING/SUBMITTED/APPROVED/REJECTED/CANCELLED, cutoff_at?, counted_by?, approved_by? |
| stock_count_lines | count_id, variant_id, lot_id?, compartment, expected_qty_snapshot, counted_qty?, unit_cost_estimate_minor?, reason? |
| stock_count_locks | location_id, variant_id, count_id ; unique location/variant, suppression à fin transactionnelle |

Quantités reçues acceptées + endommagées = reçu physiquement. Surplus séparé en QUARANTINE avec cas lié. Les transit envois s’identifient via `shipment_id` sur allocations : même produit de deux envois ne doit pas permettre une réception sur le mauvais envoi.

## Caisse, journal, contrôle

| Table | Champs |
|---|---|
| cash_sessions | shop_id, manager_id, device_id, status OPEN/COUNTING/CLOSED, opened_at, closed_at?, business_date, opening_minor, count_started_at?, last_accepted_device_sequence ; unique session non CLOSED/shop |
| cash_closures | session_id unique, declared_minor, expected_minor, variance_minor, denomination_counts jsonb validé, submitted_at, submitted_by, local_sequence?, version=1 immutable |
| recount_requests | closure_id, new_denomination_counts, reason, state REQUESTED/APPROVED/REJECTED, resolved_by?, corrective_event_id? |
| money_accounts | kind CASH/OWNER/TRANSIT/SETTLEMENT/CONTROL, code unique/org, opening_event_id? |
| money_events | type, source_type, source_id, session_id?, occurred_at, recorded_at, actor_id, reversal_of?, idempotency_id |
| money_entries | event_id, account_id, amount_signed_minor ; somme événement 0 via trigger différé |
| money_balances | account_id unique, balance_minor, version ; projection modifiée sous verrou |
| discrepancy_cases | type CASH/STOCK/RECEIPT/BUDGET/OFFLINE/DOCUMENT, shop_id?, source_type, source_id, original_amount_minor?, original_qty?, residual_amount_minor?, state OPEN/NEEDS_INFO/RESOLVED, owner_decision?, resolved_at?, resolved_by? |
| discrepancy_actions | case_id, action_type COMMENT/REQUEST_INFO/RECLASSIFY/ADJUST/RESOLVE, actor_id, text, event_id?, created_at ; append-only |

## Fichiers, audit et synchronisation

| Table | Champs |
|---|---|
| attachments | owner_document_type/id, storage_key, original_name, mime, size, sha256, scan_status PENDING/CLEAN/REJECTED, uploaded_by ; téléchargements autorisés côté serveur |
| audit_events | actor_id?, action, entity_type/id, shop_id?, before_json?, after_json?, reason?, request_id, created_at ; sans mots de passe/tokens |
| idempotency_keys | org_id, actor_id, key uuid, request_hash, state PROCESSING/DONE, response_status, response_json, created_at ; unique org/actor/key |
| device_events | device_id, capability_id, seq bigint, operation_id uuid, type, canonical_payload jsonb, payload_hash, signature, occurred_at, received_at, state RECEIVED/POSTED/REVIEW_REQUIRED/REJECTED_VALIDATION/VOIDED, result_json?, business_document_id? ; unique device/seq et org/operation |
| sync_cursors | shop_id unique, revision bigint ; changements diffusés par revision, jamais par horloge seule |
| outbox_events | topic, aggregate_id, payload jsonb minimal, created_at, processed_at?, attempts, next_attempt_at |
| notifications | recipient_id, type, document_id, read_at?, created_at |

## Tables de support des commandes

| Table | Champs |
|---|---|
| opening_drafts | shop_id unique, revision, cash_minor, zero_confirmations jsonb, submitted_by?, approved_at? ; supprimable seulement avant activation |
| opening_stock_lines | opening_draft_id, variant_id, lot_code?, expires_on?, qty_base, value_minor, estimate_reason? |
| loss_reports | location_id, variant_id, lot_id?, qty_base, type DAMAGED/MISSING, state DECLARED/NEEDS_INFO/WRITTEN_OFF/RESTORED, reason, quarantine_event_id, decision_event_id?, decided_by? |
| shipment_cost_allocations | shipment_line_id, origin_cost_layer_id, transit_cost_layer_id, qty, value_minor ; réception consomme ces liens |
| export_jobs | requester_id, type, format CSV/PDF, filters jsonb validé, state QUEUED/RUNNING/DONE/FAILED, storage_key?, expires_at?, error_code? |
| opening_and_recovery_cases | shop_id, type DEVICE_LOSS/REASSIGNMENT/REOPEN, reason, revoked_device_id?, approved_by?, state OPEN/RESOLVED, opening_event_id? |

Une pièce est liée à un seul document via `attachments` en V1 ; pas de table redondante spécifique aux dépenses. Les brouillons d’initialisation sont séparés des journaux jusqu’à activation.

Les références fournisseur/vente déjà définies doivent porter les événements d’acceptation d’avoir, distincts de l’expédition/retour physique. Un `supplier_returns` conserve `credit_confirmed_at?` et `credit_confirmed_by?` ; dette réduite seulement à confirmation owner de l’avoir, pas automatiquement à l’envoi.

## Contraintes SQL indispensables

- Index uniques partiels affectation/session/appareil actifs.
- Check montants, quantité, états et exclusivité des origines.
- FK cohérentes entreprise/boutique et rattachement session/vente.
- Rôle DB applicatif interdit UPDATE/DELETE sur journaux, allocations et audit ; fonctions ou triggers protecteurs pour champs postés.
- Trigger différé d’équilibre financier ; protection des projections contre mise à jour hors service.
- Index sur `(shop_id,business_date,id)`, `(supplier_id,occurred_at,id)`, état demandes, envois, notifications non lues, lots/date, device/seq.
- Pas de recherche pleine table : pagination 50, maximum 100, curseur stable `(created_at,id)`.

## Ordre de migrations

Identité/configuration → catalogue/parties → comptes/sessions → journaux/stock → ventes/allocations → demandes/achats/transferts → inventaires/retours → synchronisation → reporting. Les contraintes différées nécessaires sont ajoutées après tables liées, jamais abandonnées pour éviter une erreur de migration. Données démo hors migrations de production.
