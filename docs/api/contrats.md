# Contrats API REST

Base `/api/v1`. JSON UTF-8 ; dates ISO UTC, dates civiles YYYY-MM-DD, UUID pour IDs, montants chaînes d’entiers et quantités chaînes décimales. Les schémas Zod ci-dessous doivent être matérialisés puis OpenAPI généré et vérifié dans le lot concerné. Le présent document prescrit les formes et commandes ; aucun endpoint implicite supplémentaire n’est autorisé à contourner un workflow.

## Enveloppes et conventions

GET objet : `{data: object, meta:{requestId,asOf}}`. Liste : `{data:object[],meta:{requestId,asOf,nextCursor:null|string}}`. Pagination cursor opaque, limit 1..100 défaut 50, tri stable createdAt/id. Filtres autorisés par endpoint, pas paramètres SQL libres.

Commande : `Idempotency-Key: UUID` obligatoire, `If-Match: version` pour document existant ; body inclut uniquement données métier, jamais actorId/organizationId autoritaires. Réponse 201 création, 200 transition/rejeu, 202 export ou dépôt sync ; version dans DTO. `DELETE` seulement brouillons sans effets, jamais documents postés.

Erreur : `{error:{code,message,fieldErrors?:{path,message}[],details?:object},meta:{requestId}}`. 400 validation, 401 auth, 403 rôle/action, 404 ressource inexistante OU hors portée, 409 état/version/stock/clé, 422 règle métier, 429 quota. Ne pas exposer attendu cash dans erreur avant comptage. Stack SQL jamais renvoyée.

Prévalidation `/quote` ne réserve rien et ne vaut pas transaction. La commande finale revalide ; un token de devis contient un hash, pas une promesse de stock.

## DTO communs

`Money = string /^\d+$/`, signed money uniquement sorties RM ; `Quantity = string /^\d+(\.\d{1,6})?$/` et précision produit contrôlée.

`PaymentInput={sourceId:UUID,amountMinor:Money,externalReference?:string<=120}`.
`SaleLineInput={variantId:UUID,saleUnitId:UUID,quantity:Quantity,priceVersionId:UUID,discountBps:int[0,10000]}`.
`SaleInput={operationId:UUID,sessionId:UUID,lines:SaleLineInput[1..100],payments:PaymentInput[0..5],customerId?:UUID,dueDate?:date,approvalId?:UUID,cashTenderedMinor?:Money}`.
`DenominationCount={valueMinor:Money,count:int[0,100000]}` ; uniques et liste autorisée devise.
`DecisionInput={outcome:APPROVED|PARTIAL|REJECTED|NEEDS_INFO,reason?:string,lines?:{requestLineId,maxQtyBase?,maxAmountMinor}[],buyer?:OWNER|MANAGER,budgetMinor?:Money,sourceId?:UUID,validUntil?:datetime}`.
`ReceiptInput={operationId:UUID,originType:PURCHASE|SHIPMENT,originId:UUID,destinationLocationId:UUID,lines:{originLineId,variantId,lotCode?,expiresOn?,acceptedQty:Quantity,damagedQty:Quantity,surplusQty?:Quantity}[],deliveryFinished:boolean,comment?:string}`.

DTO vente : `{id,number,version,shopId,sessionId,status,source,occurredAt,businessDate,lines:[snapshots],totalMinor,paidMinor,dueMinor,payments:[...],syncStatus}`. Coûts exclus du DTO gérant. DTO clôture avant soumission : uniquement sessionId/status/countStartedAt ; après : id/sessionId/expectedMinor/declaredMinor/varianceMinor/caseId. Pas de DTO universel retournant toutes colonnes DB.

## Authentification

Routes Better Auth sous `/api/auth/*`, non réimplémentées. `/api/v1/me` fournit profil, boutique, droits calculés et appareil. Changement mot de passe via bibliothèque. Provisionnement utilisateurs OWNER only ; pas d’inscription publique. Actions financières utilisent cookie HttpOnly et contrôle Origin/CSRF documenté.

## Catalogue et administration

| Méthode et route | Entrée | Résultat / contrôle |
|---|---|---|
| GET `/shops` et `/shops/:id` | liste/détail | Owner ; responsabilités et progression d’initialisation |
| POST `/shops` | code,name,currency?,timezone? | SETUP ; crée son lieu boutique sans stock |
| PATCH `/shops/:id` | name?,currency?,timezone? | Owner |
| GET/POST `/shops/:id/opening-draft` | lecture / step,stockLines[],funds[]?,obligations[]? | Brouillon versionné et reprenable, aucun posting |
| POST `/shops/:id/opening-balances` | même DTO que le brouillon | Validation atomique : journaux, stock, coûts, fonds, obligations, audit et outbox |
| POST `/shops/:id/activate` | aucun total client | ACTIVE seulement après validation |
| POST `/shops/:id/suspend` | reason | SUSPENDED, capacité révoquée |
| POST `/shops/:id/close` | reason | CLOSED si soldes/dossiers nuls |
| POST `/users` | email,displayName,role=MANAGER | Compte à activation sécurisée |
| POST `/shops/:id/assign-manager` | userId,reason? | Affectation atomique |
| POST `/users/:id/deactivate` | reason | Révocation et audit |
| GET/POST `/products` | shopId?,search? / name,sku?,family?,tracksLots?,tracksExpiry?,shopIds? | Lecture scopée ; owner écrit ; créer ne crée aucun stock |
| GET/PATCH `/products/:id` | détail / name?,family?,status?,shopIds? | Désactivation sans destruction d’historique |
| POST `/products/:id/variants` | name,sku?,barcode? | Variante |
| POST `/variants/:id/units` | name,symbol,factor,precision,isReference? | Conversion positive et version protégée |
| POST `/prices` | saleUnitId,shopId?,amountMinor,validFrom? | Ferme la version précédente puis crée la nouvelle |
| GET `/policies` | shopId? | Effective policy sans secrets |
| POST `/policies` | shopId?,values,reason,effectiveAt? | Révision historisée |
| GET/POST `/payment-sources` | shopId? / name,type,shopId?,currency? | Source et compte associé |
| GET `/money-accounts` | shopId? | Owner uniquement, soldes calculés |
| POST `/owner-fund-events` | accountId,amountMinor,reason,type?,direction?,correctionOfId? | Apport ou correction compensatrice liée |
| GET `/locations` | shopId? | Owner toutes ; gérant son lieu boutique |
| POST `/locations/depot` | name | Active le dépôt facultatif sans stock |
| PATCH `/locations/:id` | name?,status? | Refuse l’inactivation incohérente |
| GET/POST `/customers` | shopId / name,phone,shopId | Boutique autorisée |
| PATCH `/customers/:id/credit-policy` | limitMinor,active | Owner |
| GET/POST `/suppliers` | recherche / name,phone?,address? | Owner ; gérant crée fiche simple durant achat autorisé |

## Caisse, ventes, dépenses

| Route | Entrée / comportement |
|---|---|
| POST `/cash-sessions/open` | shopId,deviceId ; C01 |
| GET `/cash-sessions/current?shopId=` | DTO filtré rôle |
| POST `/cash-sessions/:id/start-count` | lastAcceptedSequence ; C05 |
| POST `/cash-sessions/:id/cancel-count` | reason? ; aucune révélation |
| POST `/cash-sessions/:id/submit-count` | denominations[],lastAcceptedSequence ; clôture atomique |
| GET `/cash-closures/:id` | Snapshot autorisé |
| POST `/cash-closures/:id/recounts` | denominations[],reason ; REQUESTED |
| POST `/recounts/:id/decision` | outcome,reason,correctionMode ; owner |
| POST `/sales/quote` | lignes/client/paiements sans posting |
| POST `/sales` | Enveloppe device `{capabilityId,seq,operationId,payload:SaleInput,hash,signature,occurredAt}` ; même consommateur ordonné que sync/push |
| GET `/sales` | shopId,from,to,customerId,status,cursor |
| GET `/sales/:id` | Reçu, allocations visibles selon droits |
| POST `/sales/:id/reversal-request` | reason ; ne poste rien |
| POST `/sales/:id/reverse` | approvalId,reason ; owner, si aucun retour/paiement postérieur contradictoire |
| POST `/customer-payments/preview` | customerId,amountMinor ; allocation suggérée |
| POST `/customer-payments` | customerId,payment,allocations[{saleId,amountMinor}],allocationHash,sessionId? |
| POST `/customers/:id/write-offs` | saleId,amountMinor,reason ; owner |
| GET/POST `/expenses` | liste / shopId,category,description,amountMinor,sourceId,attachmentIds[] |
| POST `/expenses/:id/submit` | Demande si nécessaire |
| POST `/expenses/:id/pay` | approvalId?,sessionId?,attachmentIds[],receiptExceptionReason? |
| POST `/expenses/declare-irregular` | mêmes données + occurredAt,reason ; C04 |
| POST `/returns` | saleId,lines[{saleLineId,qtyBase,disposition}],reason |
| POST `/returns/:id/decision` | APPROVED/REJECTED,reason |
| POST `/returns/:id/receive` | lignes réelles, lots, reason? |
| POST `/returns/:id/refund` | payment,sessionId? ; <= obligation |

## Achats, fonds et stock

| Route | Entrée / comportement |
|---|---|
| GET/POST `/requests` | liste / shopId,type,lines[],estimatedFeesMinor,comment?,urgency |
| PATCH `/requests/:id` | brouillon ou nouvelle révision autorisée |
| POST `/requests/:id/submit` | version courante |
| POST `/requests/:id/decision` | DecisionInput |
| POST `/requests/:id/cancel-remainder` | reason ; owner, reliquat seul |
| GET/POST `/purchases` | liste / supplierId,approvalId?,lines[{variantId,unitId,quantity,unitPriceMinor}],feesMinor,dueDate?,payments[],attachmentIds[] |
| POST `/purchases/with-receipt` | purchase + ReceiptInput sans originId préexistant ; atomique |
| POST `/purchases/:id/control-close` | receiptExceptionReason?,reason? ; owner |
| POST `/supplier-payments` | supplierId,payment,allocations[{purchaseId,amountMinor}],sessionId? |
| POST `/supplier-returns` | purchaseId,lines[{purchaseLineId,qtyBase}],reason |
| POST `/supplier-returns/:id/decision` | outcome,reason |
| POST `/supplier-returns/:id/dispatch` | sourceLocationId,lines,confirmationAttachmentId? |
| POST `/supplier-returns/:id/confirm-credit` | acceptedAmountMinor,reason ; owner, crée dette réduite/remboursement attendu |
| POST `/supplier-returns/:id/receive-refund` | payment,sessionId? |
| GET/POST `/fund-transfers` | liste / sourceId,destinationId,amountMinor,purpose,requestId? |
| POST `/fund-transfers/:id/send` | occurredAt ; remet réellement |
| POST `/fund-transfers/:id/receive` | amountMinor,comment?,sessionId? |
| POST `/advances/:id/reallocate` | amountMinor,newRequestId?,reason ; owner |
| GET/POST `/shipments` | liste / sourceLocationId,destinationLocationId,lines[{variantId,qtyBase}],requestId? |
| POST `/shipments/:id/approve` | approvedLines,reason? |
| POST `/shipments/:id/dispatch` | lines[{lineId,qtyBase,lotId?}] |
| POST `/receipts` | ReceiptInput |
| GET `/stock` | shopId?,locationId?,variantId? ; coûts owner seulement, gérant limité à sa boutique |
| GET `/stock/movements` | mêmes filtres ; écritures append-only et origine |
| POST `/loss-reports` | locationId,variantId,lotId?,qtyBase,type,reason |
| POST `/loss-reports/:id/decision` | WRITE_OFF/RESTORE/NEEDS_INFO,reason |
| GET/POST `/stock-counts` | liste / locationId,variantIds[] ou full=true |
| POST `/stock-counts/:id/start` | deviceHighWaterMark si boutique |
| PUT `/stock-counts/:id/lines` | lines[{lineId,countedQty,reason?,costEstimateMinor?}] |
| POST `/stock-counts/:id/submit` | version |
| POST `/stock-counts/:id/decision` | APPROVED/RECOUNT/REJECTED,reason |
| POST `/stock-counts/:id/cancel` | reason |

Tous les GET détail correspondants sont disponibles avec DTO métier et pagination des historiques. Les PATCH des documents commerciaux sont limités à DRAFT ; pour posted retourner 409 IMMUTABLE_DOCUMENT.

Les routes `/sales` et `/sync/push` ne constituent pas deux chemins de posting : elles déposent dans la même inbox puis appellent le même consommateur. Une vente en ligne doit être POSTED avant affichage de réussite serveur ; sinon son état local reste explicite. `operationId` extérieur et celui du payload doivent correspondre. Appareil principal vérifié côté serveur, pas seulement dans le navigateur.

## Contrôle, fichiers, rapports et sync

| Route | Entrée / sortie |
|---|---|
| GET `/discrepancies` et `/:id` | shopId,type,state ; dossier et actions |
| POST `/discrepancies/:id/comments` | text,attachmentIds[] |
| POST `/discrepancies/:id/resolve` | decision,reason,correction? typée ; owner |
| POST `/attachments/upload-intent` | documentType/id,mime,size,name,sha256 ; URL privée temporaire |
| POST `/attachments/:id/complete` | vérification objet puis scan |
| GET `/attachments/:id/download` | URL signée après autorisation |
| GET `/reports/overview` | shopId? ; état serveur SETUP/EMPTY, périmètre, devise, fuseau, calculatedAt, fraîcheur, couverture, indicateurs P03 et alertes sourcées |
| POST `/exports` | type,format CSV/PDF,filters ; jobId |
| GET `/exports/:id` | état et URL courte après droits |
| GET `/notifications` | cursor,unreadOnly |
| POST `/notifications/:id/read` | Aucun effet métier |
| POST `/devices/register` | publicKey,shopId,name ; owner autorise activation |
| POST `/devices/:id/revoke` | reason ; owner |
| POST `/sync/handshake` | deviceId,lastSequence,cursor ; capacité/snapshot ou blocage |
| POST `/sync/push` | capabilityId,events[{seq,operationId,type,payload,hash,signature,occurredAt}] ; résultats par élément |
| GET `/sync/pull` | cursor,deviceId ; delta + revision + acceptedSequence |
| POST `/sync/cases/:id/replay` | owner reason après correction ; réutilise événement original |

## Exemple minimal de vente

### Contrat P04 effectivement livré

Le premier chemin en ligne utilise les routes ci-dessous. L’enveloppe signée `device/seq/capability` décrite plus haut sera introduite avec la synchronisation hors connexion P08 ; elle n’est pas simulée par P04.

| Méthode et route | Entrée / résultat P04 |
|---|---|
| GET `/manager/sales/context` | Boutique et appareil actifs du gérant, session ouverte éventuelle, catalogue vendable, prix et sources de paiement autorisées |
| POST `/cash-sessions/open` | Aucun body ; `Idempotency-Key` UUID obligatoire ; ouvre une session `TRADING` pour la boutique et l’appareil actifs |
| POST `/sales/quote` | `{lines:[{saleUnitId,quantity,discountMinor?}]}` ; recalcule prix/remise/total et émet une autorisation en ligne courte liée au devis |
| POST `/sales` | `{authorizationId,lines,payments:[{accountId,amountMinor,cashReceivedMinor?,externalReference?}]}` ; `Idempotency-Key` UUID obligatoire ; revalide puis poste atomiquement |
| GET `/sales` | Historique de la boutique affectée au gérant |
| GET `/sales/:id` | Reçu autorisé de la boutique affectée ; coûts internes exclus de l’interface gérant |

Une ligne P04 référence le format vendu (`saleUnitId`) et une quantité décimale bornée à six chiffres. Le serveur résout la variante, le prix courant et le facteur de stock. `discountMinor` est un montant par ligne contrôlé par la politique effective. Pour les espèces, `amountMinor` est le montant affecté à la vente et `cashReceivedMinor` le montant remis par le client ; seul `amountMinor` crédite la caisse et le chiffre d’affaires.

```json
{
  "operationId":"00000000-0000-4000-8000-000000000001",
  "sessionId":"00000000-0000-4000-8000-000000000002",
  "lines":[{"variantId":"00000000-0000-4000-8000-000000000003","saleUnitId":"00000000-0000-4000-8000-000000000004","quantity":"2","priceVersionId":"00000000-0000-4000-8000-000000000005","discountBps":0}],
  "payments":[{"sourceId":"00000000-0000-4000-8000-000000000006","amountMinor":"2000"}],
  "cashTenderedMinor":"5000"
}
```

Prix snapshot 1 000 : total 2 000, rendu 3 000, mouvement cash +2 000. Le serveur ne prend pas le montant reçu 5 000 pour chiffre d’affaires.

## Erreurs métier stables

`APPROVAL_REQUIRED`, `APPROVAL_EXPIRED`, `BUDGET_EXCEEDED`, `INSUFFICIENT_STOCK`, `INSUFFICIENT_CASH`, `LOT_EXPIRED`, `INVALID_PRECISION`, `PRICE_CHANGED`, `SESSION_REQUIRED`, `COUNT_IN_PROGRESS`, `ALREADY_CLOSED`, `DEVICE_READ_ONLY`, `SYNC_REQUIRED`, `CUSTOMER_OVER_LIMIT`, `CUSTOMER_OVERDUE`, `ALLOCATION_CHANGED`, `VERSION_CONFLICT`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `IMMUTABLE_DOCUMENT`, `REVIEW_REQUIRED`.

Chaque code doit avoir un message français et une action proposée. Les réponses d’erreur sont testées autant que les succès. API de rapport gérant refuse fields arbitraires permettant de lire l’attendu.

## Compléments et corrections 2.1

### Vente et séquence

Enveloppe commune : `{seq,operationId,executionMode:ONLINE|OFFLINE,declaredExecution:NOT_EXECUTED|EXECUTED|UNKNOWN,onlineAuthorizationId?,capabilityId?,payload,hash,signature,occurredAt}`. XOR preuve ONLINE/OFFLINE. `/sales/quote` peut émettre autorisation en ligne de deux minutes liée au hash si appareil authentifié, mais ne réserve ni stock ni fonds. Confirmation en ligne utilise ce jeton pour tous modes de paiement ; la capacité OFFLINE reste cash-only.

Après refus métier certain d’une action en ligne non exécutée, état REJECTED_VALIDATION finalise la séquence sans posting. Après fait exécuté ou résultat inconnu, REVIEW_REQUIRED ou lookup du résultat ; pas suppression automatique. Toute nouvelle saisie corrigée a un nouvel operationId lié à l’ancien, jamais réutilisation de même clé avec payload différent.

### Commandes supplémentaires

| Route | Payload et contraintes | Sortie |
|---|---|---|
| POST `/devices/:id/approve` | owner, version, aucun actif incompatible | Device ACTIVE, sans capacité avant session |
| GET `/devices` | owner ou appareil propre gérant | Liste filtrée sans secrets |
| POST `/users/:id/resend-invitation` | owner session fraîche, compte INVITED, limite de débit | Nouvelle invitation usage unique, ancien jeton invalidé |
| GET `/locations` | filtres de portée | Lieux autorisés et option dépôt |
| POST `/locations/depot` | owner, name 2..120, unicité dépôt actif | DEPOT |
| PATCH `/locations/:id` | name,active ; interdiction suppression avec soldes | Mise à jour auditée |
| GET `/payment-sources` | shopId? ; owner soldes, gérant labels seulement | DTO filtré |
| POST `/payment-sources` | owner, label,type,locationId?,openingMinor,zeroConfirmed | Compte + source + journal initial, sans cycle FK |
| POST `/owner-fund-events` | owner, sourceId,type CONTRIBUTION/WITHDRAWAL,amountMinor>0,reason | Journal source/contrôle, pas vente/dépense |
| POST `/shipments/:id/submit` | gérant source, version, motif | SUBMITTED, notification owner |
| POST `/purchases/:id/destinations` | owner ou acheteur gérant limité à sa boutique, lines[{purchaseLineId,locationId,qtyBase}] | Répartition sous verrou quantités restantes |
| POST `/purchases/:id/cancel-remainder` | owner, lines[{lineId,qtyBase,creditMinor}],reason,proofOrException | Ajustements documentés et éventuel remboursement fournisseur attendu |
| POST `/purchases/declare-irregular` | gérant, faits achat, paiement annoncé, produits détenus, reason | Cas à régulariser et quarantaine, pas approbation normale |
| POST `/requests/:id/withdraw` | auteur, aucune consommation, reason | CANCELLED |
| POST `/discrepancies/:id/request-info` | owner, question non vide | NEEDS_INFO |
| POST `/discrepancies/:id/reopen` | owner, reason | OPEN + action, ancienne résolution conservée |
| POST `/sync/events/:operationId/void` | owner, reason, confirmationNotExecuted=true | VOIDED, reprise séquence sans effets métier |
| POST `/recovery-cases` | owner, shopId,type,reason,deviceId?,knownLastSequence? | Dossier RECOVERY, boutique SECURITY |
| POST `/recovery-cases/:id/resolve` | owner, comptages/obligations déclarées, sequenceGap?, limitationsAcknowledged=true | Reprise auditée, pas reconstitution fictive |
| POST `/opening-obligations` | owner ou saisie gérant SETUP, direction,partyId,amountMinor,reference,effectiveDate,dueDate? | Brouillon ouverture, posté lors activation owner |

`/cash-sessions/open` accepte `purpose=TRADING|SETTLEMENT`, contrôlé au serveur selon statut boutique. RECOVERY exclusivement via résolution owner, pas paramètre gérant libre. Suspension inclut `mode=SECURITY|SETTLEMENT` et motif.

`ReceiptInput` lignes corrigé : `purchaseLineId?` ou `shipmentLineId?` (XOR), variante validée depuis origine, quantities acceptées/abîmées/surplus. Stock surplus distinct. Retour client `/returns/:id/receive` crée un reçu de retour immutable et supporte partiel.

`PurchaseInput` distingue `supplierFeesMinor` et `externalFees[{expenseId,amountMinor,allocation}]`, avec destination par ligne. La dette utilise supplierTotal, pas valeur globale capitalisée. Une dépense externe déjà utilisée ne se capitalise pas deux fois. Champs `feesMinor` historique supprimés du nouveau schéma typé au bootstrap.

Paiements clients/fournisseurs : allocation XOR `{saleId|purchaseId|openingObligationId,amountMinor}` selon route ; schémas discriminés, pas trois IDs renseignés ensemble. Retours/remboursements fournisseurs ont confirmation d’avoir avant réduction dette.

DTO lignes de fonds expose `receipts[]` et `remainingInTransitMinor`, pas un montant reçu modifiable. Types techniques source_type/id sont remplacés par documentId typé pour ressources commerciales (dictionnaire 2.1).

### Lectures détaillées explicitement exposées

GET `/requests/:id`, `/purchases/:id`, `/shipments/:id`, `/returns/:id`, `/supplier-returns/:id`, `/fund-transfers/:id`, `/stock-counts/:id`, `/loss-reports/:id`, `/recovery-cases/:id`, `/devices/:id` : document local autorisé, lignes et historique paginé ; pas de contenu d’autres boutiques dans DTO gérant. GET `/me` est la route relative au préfixe `/api/v1` déjà définie plus haut.
