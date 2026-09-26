# Matrice de couverture de la conception

Une ligne par écran principal, avec transitions, commandes, données et scénarios. Les fiches comprennent les formulaires, panneaux et étapes internes pour ne pas multiplier artificiellement les pages. La présence d’un lien ne prouve pas qu’un test a été exécuté.

| Écran | Utilisateur | Transitions | Commandes | Tables | Scénarios |
|---|---|---|---|---|---|
| E01 Connexion | Tous | S01 | `/api/auth/*` | app_users | T02 |
| E02 Initialisation | Propriétaire et gérant SETUP pour comptages | S01, S12 | `POST /shops/:id/opening-balances`<br>`POST /shops/:id/activate` | opening_drafts, opening_stock_lines, opening_obligations, shops | T01, T78 |
| E03 Accueil gérant | Gérant | S01, S02, S03 | `GET /me`<br>`GET /notifications`<br>`GET /cash-sessions/current` | cash_sessions, notifications, devices | T02, T38 |
| E04 Panier de vente | Gérant principal | S02 | `GET /stock`<br>`POST /sales/quote` | products, variants, sale_units, prices, stock_balances | T08, T09, T10, T11, T12, T15, T14 |
| E05 Paiement vente | Gérant principal | S02, S12, S14 | `POST /sales/quote`<br>`POST /sales` | sales, sale_lines, payments, customer_payment_allocations | T03, T04, T05, T06, T07, T16, T45 |
| E06 Reçu et détail vente | Gérant boutique et owner via E35 | S02, S06 | `GET /sales/:id`<br>`POST /sales/:id/reversal-request` | sales, returns, payments | T20, T21, T22 |
| E07 Session de caisse | Gérant principal | S01, S03 | `POST /cash-sessions/open`<br>`POST /cash-sessions/:id/start-count` | cash_sessions, cash_closures | T37, T38, T61 |
| E08 Comptage aveugle | Gérant principal | S03, S14 | `POST /cash-sessions/:id/submit-count`<br>`POST /cash-sessions/:id/cancel-count` | cash_closures, money_events, discrepancy_cases | T37, T38, T39, T41, T50, T64 |
| E09 Dépense | Gérant principal | S05 | `POST /expenses`<br>`POST /expenses/:id/submit`<br>`POST /expenses/:id/pay`<br>`POST /expenses/declare-irregular` | expenses, requests, approvals, payments | T23, T24, T25, T26, T53 |
| E10 Demandes | Gérant | S04 | `GET /requests`<br>`POST /requests` | requests, request_lines | T27, T28 |
| E11 Détail demande | Gérant boutique | S04, S07 | `PATCH /requests/:id`<br>`POST /requests/:id/submit`<br>`GET /requests/:id` | requests, approvals, approval_lines | T27, T28, T72 |
| E12 Achat par gérant | Gérant principal désigné | S07, S08 | `POST /purchases`<br>`POST /purchases/with-receipt` | purchases, purchase_lines, purchase_fees, receipts | T27, T29, T34, T68 |
| E13 Réception | Gérant destinataire principal | S08 | `POST /receipts`<br>`GET /shipments/:id` | receipts, receipt_lines, cost_layers, discrepancy_cases | T31, T32, T33, T71 |
| E14 Stock boutique | Gérant | S04, S11 | `GET /stock`<br>`GET /stock/movements` | stock_balances, stock_entries, lots | T12, T13, T44 |
| E15 Clients et créances | Gérant en ligne | S12 | `GET /customers`<br>`POST /customers`<br>`POST /customer-payments/preview`<br>`POST /customer-payments` | customers, customer_payment_allocations, opening_obligations | T17, T18, T19, T55, T78 |
| E16 Synchronisation | Gérant | S14 | `POST /sync/handshake`<br>`POST /sync/push`<br>`GET /sync/pull` | device_events, sync_changes, devices | T45, T46, T47, T48, T49, T50, T51, T52, T62, T63 |
| E17 Vue propriétaire | Propriétaire | S13 | `GET /reports/overview`<br>`GET /notifications` | sales, payments, money_entries, stock_balances, discrepancy_cases, sync_cursors | T60, T80, T84 |
| E18 Décider une demande | Propriétaire | S04 | `POST /requests/:id/decision` | requests, approvals, approval_lines | T27, T28, T72 |
| E19 Achats propriétaire | Propriétaire | S07, S08 | `GET /purchases`<br>`POST /purchases`<br>`POST /purchases/with-receipt` | purchases, purchase_destinations, purchase_fees | T31, T34, T68, T69 |
| E20 Transferts propriétaire | Propriétaire | S08 | `POST /shipments`<br>`POST /shipments/:id/approve`<br>`POST /shipments/:id/dispatch` | shipments, shipment_lines, shipment_cost_allocations | T31, T32, T60, T71 |
| E21 Fonds propriétaire | Propriétaire | S09 | `GET /fund-transfers`<br>`POST /fund-transfers`<br>`POST /fund-transfers/:id/send`<br>`POST /fund-transfers/:id/receive` | fund_transfers, fund_receipts, money_entries | T29, T30, T65 |
| E22 Liste des contrôles | Propriétaire | S13 | `GET /discrepancies`<br>`GET /stock-counts` | discrepancy_cases, cash_closures, stock_counts | T37, T40, T42 |
| E23 Dossier d’écart | Propriétaire | S13 | `GET /discrepancies/:id`<br>`POST /discrepancies/:id/resolve` | discrepancy_cases, discrepancy_actions, money_events, stock_events | T40, T41, T73, T74 |
| E24 Inventaire propriétaire | Propriétaire | S11 | `POST /stock-counts`<br>`POST /stock-counts/:id/start`<br>`POST /stock-counts/:id/decision` | stock_counts, stock_count_lines, stock_count_locks | T42, T43, T75, T76 |
| E25 Catalogue et prix | Propriétaire | S01 | `POST /products`<br>`POST /products/:id/variants`<br>`POST /variants/:id/units`<br>`POST /prices` | products, variants, sale_units, prices, shop_products | T10, T11, T12, T13 |
| E26 Boutique et responsabilité | Propriétaire | S01, S15 | `POST /shops`<br>`POST /shops/:id/activate`<br>`POST /shops/:id/suspend`<br>`POST /shops/:id/close` | shops, manager_assignments, opening_drafts | T01, T56, T77 |
| E27 Rapports | Propriétaire | S13 | `GET /reports/overview`<br>`POST /exports`<br>`GET /exports/:id` | export_jobs, sales, money_entries, stock_entries | T54, T60, T80, T81 |
| E28 Paramètres métier | Propriétaire | S04, S12 | `GET /policies`<br>`POST /policies` | policies | T26, T55, T83 |
| E29 Expédition gérant | Gérant source principal | S08 | `POST /shipments/:id/dispatch`<br>`POST /shipments/:id/submit` | shipments, shipment_lines, stock_entries | T32, T71 |
| E30 Fonds du gérant | Gérant principal | S09 | `POST /fund-transfers`<br>`POST /fund-transfers/:id/send`<br>`POST /fund-transfers/:id/receive` | fund_transfers, fund_receipts | T29, T30, T65 |
| E31 Perte ou casse | Gérant principal | S11 | `POST /loss-reports` | loss_reports, stock_entries, discrepancy_cases | T44, T75 |
| E32 Comptage inventaire gérant | Gérant de la boutique | S11 | `PUT /stock-counts/:id/lines`<br>`POST /stock-counts/:id/submit` | stock_counts, stock_count_lines | T42, T43, T76 |
| E33 Retour et remboursement client | Gérant principal | S06 | `POST /returns`<br>`POST /returns/:id/receive`<br>`POST /returns/:id/refund` | returns, return_receipts, return_value_allocations, refund_allocations | T20, T21, T22, T70, T82 |
| E34 Fournisseurs et paiements | Propriétaire ; vue restreinte gérant /manager/suppliers/[id] | S10, S12 | `POST /supplier-payments`<br>`POST /supplier-returns`<br>`POST /supplier-returns/:id/confirm-credit` | suppliers, supplier_payment_allocations, supplier_returns | T35, T36, T79 |
| E35 Historique détaillé propriétaire | Propriétaire | S02, S06 | `GET /sales/:id`<br>`POST /returns/:id/decision`<br>`POST /requests/:id/decision` | sales, approvals, returns | T20, T22, T74 |
| E36 Correction et reprise | Propriétaire ; gérant accès à sa demande uniquement | S03, S13, S14, S15 | `POST /cash-closures/:id/recounts`<br>`POST /recounts/:id/decision`<br>`POST /recovery-cases` | recount_requests, opening_and_recovery_cases, device_sequence_resolutions | T41, T48, T63, T77 |
| E37 Utilisateurs et affectations | Propriétaire | S01, S15 | `POST /users`<br>`POST /shops/:id/assign-manager`<br>`POST /users/:id/deactivate` | app_users, manager_assignments | T02, T61, T77 |
| E38 Appareil principal | Propriétaire ; gérant enregistrement /manager/device | S01, S14 | `POST /devices/register`<br>`POST /devices/:id/approve`<br>`POST /devices/:id/revoke` | devices, device_capabilities | T48, T51, T61, T62 |
| E39 Sources de paiement | Propriétaire | S01, S09 | `POST /payment-sources`<br>`POST /owner-fund-events` | payment_sources, money_accounts, money_events | T25, T29, T66 |
| E40 Lieux et dépôt | Propriétaire | S08, S15 | `GET /locations`<br>`POST /locations/depot`<br>`PATCH /locations/:id` | locations, stock_balances | T31, T56, T67 |

## Couverture des responsabilités

Le gérant prépare et déclare ; le propriétaire autorise et tranche les écarts. Une réception de boutique exige le gérant destinataire ; une autorisation ne remplace jamais la réception. Les tâches sans écran dédié (notification, expiration, journal, calcul de coût) sont des traitements système déclenchés par les commandes, sans nouvel utilisateur artificiel.

## Scénarios techniques sans écran propre

| Scénario | Traitement | Vérification future |
|---|---|---|
| T57 | Arrondis et couches de coût | Test de conservation des valeurs |
| T58 | Atomicité journal et projections | Injection de panne dans transaction PostgreSQL |
| T59 | Sauvegarde et restauration | Exercice exploitation en environnement isolé |
