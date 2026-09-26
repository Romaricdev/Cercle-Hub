# Workflows caisse et ventes

Normatif avec RM01–RM09. Toute commande de validation exige clé d’idempotence et version attendue. Les formulaires non soumis peuvent être sauvegardés en brouillon sans effet métier. Les états UI « paiement partiel » ou « remboursé » sont calculés depuis allocations, pas des drapeaux éditables.

## C01 — Ouvrir

Acteur gérant sur appareil principal en ligne. Préconditions : boutique ACTIVE, affectation actuelle, aucune session OPEN/COUNTING, précédente clôture synchronisée, aucune inbox hors ligne non rapprochée pour boutique.

Entrées : `shopId`, `deviceId`. Pas de montant libre. Ouverture initiale utilise le journal OPENING validé ; suivantes utilisent solde après dernier comptage et mouvements correctifs autorisés, sans écritures cash entre sessions. Sortie : session ID, businessDate, statut OPEN et capacité hors ligne si appareil compatible. Pas de `opening_minor` exposé au gérant.

Si fonds nouveaux présents, ouvrir puis utiliser remise reçue. Si montant physique d’ouverture semble incorrect : bouton « Signaler un problème », pas édition du solde. Propriétaire décide d’un ajustement explicite avant vente si besoin.

## C02 — Vendre

Formulaire : lignes `(variantId,saleUnitId,quantity,priceVersionId,discountBps)`, `customerId?`, paiements `(sourceId,amountMinor,reference?)`, `cashTenderedMinor?`. Données dérivées non fiables côté client ; serveur recalcule total et valide la version de prix. Prix obsolète en ligne : 409 PRICE_CHANGED avec nouveau devis, nouvelle confirmation requise.

Gérant peut retirer les lignes avant confirmation. Minimum une ligne, maximum 100. Regrouper même variante/unité/prix sauf lots explicitement différents ; FIFO/FEFO choisi serveur avec allocations affichables propriétaire.

Transitions : DRAFT→POSTED par validation atomique. Pas d’état payé avant commit. Paiement externe = « déclaré reçu », pas « vérifié par banque ». Si transaction échoue aucun journal ; retry même clé. Reçu imprimable après résultat. Hors ligne reçu porte « En attente de synchronisation » et identifiant local.

Après POSTED : gérant demande annulation/retour, il ne modifie pas les lignes. Annulation totale avant remise physique peut être autorisée ; si marchandises déjà sorties, suivre retour. Les effets compensatoires utilisent prix, montant et coûts d’origine.

## C03 — Crédit et paiement ultérieur

Acteur gérant en ligne. Préconditions crédit activé, client de la boutique, dette future <= plafond ou autorisation spécifique non consommée. Impayé en retard bloque crédit autonome. Demande d’autorisation affiche montant supplémentaire et dette actuelle au propriétaire ; autorisation expire après 24h, liée au devis exact.

Vente conserve échéance et paiement initial. Pour règlement : sélectionner client, montant, mode ; aperçu de répartition automatique par échéance puis date. Confirmation verrouille créances et client ; si soldes ont changé, 409 ALLOCATION_CHANGED et nouvel aperçu. Une même somme ne s’applique pas deux fois. Pas d’encaissement d’une créance d’une autre boutique par gérant.

Abandon de dette : propriétaire saisit montant <= restant et motif ; `debt_adjustment WRITE_OFF`, dossier de contrôle ; aucun encaissement ou mouvement cash. Rapport distingue vente et créance abandonnée.

## C04 — Dépense

Acteur gérant en ligne. Champs catégorie `RENT/UTILITIES/TRANSPORT/SUPPLIES/OTHER`, description 5..500 caractères, montant, source, justificatif ou motif d’absence. Pour un achat de produits, orienter vers achat, pas catégorie OTHER.

Si hors seuil : DRAFT→REQUESTED ; propriétaire APPROVE/REJECT. APPROVE fige plafond, catégorie, source et validité (7 jours par défaut). Puis paiement : AUTHORIZED→POSTED, journal créé une fois. Dans seuils, DRAFT→POSTED avec décision automatique explicite liée à policy revision. Cumul session inclut les dépenses autonomes postées, même corrigées ultérieurement ; restitution ne réouvre pas automatiquement le plafond.

Dépense réellement exécutée sans autorisation : commande dédiée `declare-irregular`, gérant confirme « L’argent a déjà été payé ». Elle poste la sortie réelle si solde cohérent, état IRREGULAR et dossier OPEN ; propriétaire peut accepter le justificatif mais ne gomme pas l’irrégularité. Si solde cash impossible, conserver dans inbox de régularisation sans inventer des fonds ; bloquer clôture définitive tant que résolution non documentée. Modalités d’exception testées, pas retour silencieux vers brouillon.

## C05 — Comptage et clôture

États session : OPEN→COUNTING→CLOSED. `start-count` en ligne vérifie outbox locale vide par high-water-mark device serveur, aucune opération bloquante, puis verrouille la session. Réponse ne contient aucun solde. `cancel-count` est permis avant soumission seulement, reason facultatif ; audit compteur de tentatives sans accuser le gérant.

Écran billets/pièces selon devise : XAF par défaut 10 000, 5 000, 2 000, 1 000, 500, 100, 50, 25, 10, 5, 2, 1. Valeurs uniques, nombres entiers >=0, total borné. Pas de bouton « recopier attendu » ni préremplissage du dernier comptage. Confirmer affiche « Ce comptage sera enregistré. Vous pourrez demander une correction, sans effacer cette déclaration. »

`submit-count` : verrouille session, calcule attendu avant écriture de variance, persiste snapshot, crée écart et écriture RM06, ferme session. Réponse expose attendu et delta après commit. Si delta non nul, demander explication (minimum 10 caractères) sur dossier. Le comptage ne doit pas être perdu si l’utilisateur ferme l’écran d’explication ; clôture porte « explication attendue ». Session suivante autorisée même si écart ouvert, après synchronisation.

Double soumission même clé retourne première clôture ; clé différente donne 409 ALREADY_CLOSED avec référence autorisée. Le gérant ne peut pas relancer COUNTING sur session fermée.

## C06 — Demander correction de comptage

POST recount avec nouvelles coupures, motif, justificatif facultatif. État REQUESTED. Propriétaire voit première déclaration, attendu, demande et historique. Accepter produit une action de dossier et, si impact physique confirmé, un ajustement dans session ouverte. Aucune ligne de clôture initiale éditée. Reclassification d’une dépense oubliée n’entraîne pas de nouveau cash (RM06). Le service distingue `RECOUNT_CASH_CHANGE` et `EXPLAIN_EXISTING_VARIANCE` ; UI ne les fusionne pas.

## C07 — Retour et remboursement

Demande : vente d’origine, lignes et quantités, motif, état annoncé produit. Quantité cumulée retournée <= vendue. Propriétaire approuve/refuse, pas de remboursement automatique. Gérant reçoit physiquement, choisit AVAILABLE ou DAMAGED ; lots/allocations d’origine conservés. Si rien reçu, garder APPROVED.

À réception : événement RETURN stock, diminution créance éventuelle, calcul obligation remboursement. `refund` séparé exige source, montant <= obligation restante, session cash ouverte si espèces. Retour statut SETTLED lorsque produits attendus reçus et obligation soldée. Échange = retour + nouvelle vente, pas édition prix historique. Retours hors connexion interdits.

## Erreurs communes

SESSION_REQUIRED : ouvrir caisse ; COUNT_IN_PROGRESS : terminer ou annuler comptage ; DEVICE_READ_ONLY : utiliser appareil principal ; INSUFFICIENT_STOCK : réduire quantité ; INSUFFICIENT_CASH : choisir source réellement disponible, ne pas inventer apport ; APPROVAL_REQUIRED : soumettre demande ; CUSTOMER_OVER_LIMIT : demander accord ; VERSION_CONFLICT : relire avant confirmer ; SYNC_REQUIRED : synchroniser.
