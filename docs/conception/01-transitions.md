# Transitions et responsabilités de référence

Toute transition non listée est interdite. Les noms techniques restent hors interface ; les libellés français sont dans les fiches écrans. Toutes commandes mutantes : acteur authentifié, droits, version optimiste, idempotence, audit. Les effets indiqués sont atomiques sauf lorsque deux étapes physiques séparées sont explicitement prévues. Les événements modifient le statut courant, jamais le contenu financier ou les quantités d’un document posté.

## S01 — Initialisation, compte et appareil

| Origine → cible | Acteur et action | Conditions | Effets / échec |
|---|---|---|---|
| Compte INVITED→ACTIVE | Gérant définit son mot de passe via activation sécurisée | Invitation valide ; entreprise/boutique assignées | Pas de mouvement de fonds |
| Appareil absent→PENDING | Gérant enregistre clé et nom | Session web valide ; boutique assignée | Demande owner, aucune capacité offline |
| PENDING→ACTIVE | Owner confirme appareil | Aucun autre actif ou remplacement contrôlé | L’appareil peut ouvrir une caisse en ligne |
| Boutique SETUP→ACTIVE | Owner valide initialisation | Gérant assigné, unités/prix valides, solde zéro confirmé ou solde renseigné | Journaux OPENING, dettes d’ouverture, stocks et valeurs |
| Session absente→OPEN | Gérant ouvre | Boutique active, appareil actif, précédente session fermée et réconciliée | Snapshot session ; ensuite capacité offline |

Un gérant peut préparer le catalogue initial autorisé et l’inventaire avant appareil principal ; ce mode SETUP ne permet aucune vente. Si création de capacité échoue après ouverture, la session reste ouverte en ligne, l’UI propose réessayer : pas besoin d’ouvrir une seconde session.

## S02 — Vente et annulation

| Transition | Acteur / garde | Effets |
|---|---|---|
| DRAFT→POSTED | Gérant, session OPEN, stock et prix valides, crédit autorisé si besoin | Lignes figées + allocations coût + journal paiements + créance |
| DRAFT→abandonné | Gérant, aucun posting | Brouillon supprimable ; pas de référence comptabilisée |
| POSTED→POSTED avec demande | Gérant demande retour/annulation | Document lié en attente ; stock/cash inchangés |
| POSTED→REVERSED | Exécution gérant après accord owner, ou secours owner explicite | Compensations d’origine, seulement si aucun retour/recouvrement ultérieur ; motif erreur de saisie, produits non remis |

L’annulation est indisponible si livraison physique déjà effectuée ou dépendances : passer par retour. Autorisation n’exécute pas le remboursement. Owner n’écrit pas directement la caisse boutique sous capacité active ; le gérant exécute après accord et synchronisation.

Vente en ligne peut être cash, mixte ou crédit : autorisation par session web courante avec `executionMode=ONLINE`, séquence device. Offline exige `executionMode=OFFLINE` et capacité cash-only. Le client ne peut pas déclarer ONLINE sur une vieille vente pour éviter contrôle : token en ligne court (2 minutes), lié au hash exact du devis, généré par serveur connecté avant confirmation. Expiration avant exécution demande un devis neuf ; timeout après commit se rejoue par opération d’origine.

## S03 — Comptage et correction

OPEN→COUNTING par gérant : file réconciliée, mutations suspendues. COUNTING→OPEN par annulation avant soumission seulement. COUNTING→CLOSED par soumission : snapshot attendu, coupures, delta, écriture variance si nécessaire et cas OPEN. Réponse affiche l’attendu seulement après commit. L’explication peut venir après soumission sans modifier la clôture.

Offline : l’état client devient COUNTING_LOCAL puis CLOSED_PENDING. Au replay, serveur vérifie toutes séquences précédentes traitées puis effectue OPEN→COUNTING→CLOSED dans une seule transaction avec mêmes gardes. Aucun appel préalable start-count au serveur n’est supposé pendant la panne.

Recomptage REQUESTED→APPROVED/REJECTED par owner : conserver premier montant ; approuver une correction du cash uniquement après contrôle du résiduel et dans une session autorisée. Si le problème est une dépense oubliée déjà absorbée dans variance, reclasser sans deuxième sortie (RM06).

## S04 — Demandes et décisions

| Transition | Acteur | Conditions/effets |
|---|---|---|
| DRAFT→SUBMITTED | Gérant | Lignes valides, aucune écriture |
| SUBMITTED→NEEDS_INFO | Owner | Question obligatoire, décision historisée |
| NEEDS_INFO→SUBMITTED | Gérant | Nouvelle révision, ancienne conservée |
| SUBMITTED→APPROVED/PARTIAL/REJECTED | Owner | Accord sur lignes, plafond, source, validité ; motif partiel/refus |
| DRAFT/SUBMITTED/NEEDS_INFO→CANCELLED | Demandeur | Aucune consommation ; sinon annuler reliquat seulement |
| APPROVED/PARTIAL→CLOSED | Owner ou clôture explicite contrôlée | Toutes lignes traitées ou abandonnées et fonds expliqués |

Types : RESTOCK, FUNDS, EXPENSE, SALE_EXCEPTION, CREDIT_EXCEPTION, CORRECTION. Chaque type a son formulaire, même si stockage commun. Cible requise pour exception/correction (devis ou document), lignes de produits seulement pour RESTOCK. TRANSFER ne passe pas par request générique : shipment DRAFT soumis au propriétaire. Une demande approuvée n’a pas besoin d’être réapprouvée pour chaque réception partielle conforme.

## S05 — Dépense

DRAFT→REQUESTED si hors plafonds ; REQUESTED→AUTHORIZED/REJECTED par décision owner. DRAFT→POSTED si dans plafonds ; AUTHORIZED→POSTED si accord valide et argent payé. Paiement extérieur à boutique n’affecte jamais sa caisse.

Sortie passée irrégulière : créer déclaration EXECUTED_UNREVIEWED indépendante du refus commercial. Si source et solde reconstitués sont cohérents, journal sortie + cas ; sinon cas BLOCKED_PENDING_FACTS conservant montant et date, pas fausse dépense payée. Ce document compte dans « faits à régulariser », pas dans chiffre officiel tant que journal absent. Le propriétaire voit les deux séparément.

Le cumul des dépenses autonomes est calculé sous verrou session. Restitution ultérieure ne réouvre pas automatiquement un plafond. Justificatif manquant exige soit état contrôle à compléter, soit exception owner ; jamais perte du fait payé.

## S06 — Retour client

REQUESTED→APPROVED/REJECTED owner ; APPROVED→PARTIALLY_RECEIVED/RECEIVED par gérant avec quantités physiques ; RECEIVED→SETTLED lorsque remboursement/reliquat dette traité. Chaque réception partielle crée lignes immutables ; état calculé sur quantités approuvées et effectuées.

Motif et vente d’origine obligatoires. Sans reçu, rechercher vente par date/client/produit ; si impossible, owner doit ouvrir dossier de correction, pas remboursement anonyme automatique. Délai proposé 30 jours, owner peut autoriser au-delà avec motif ; ce délai est un paramètre commercial, pas une affirmation légale.

Retour diminue le net commercial uniquement pour les quantités reçues acceptées dans la décision. Dette vivante puis abandon lié sont absorbés avant cash (RM11). Remboursement peut être partiel et différé. Reste dû au client visible même si sa dette est nulle.

## S07 — Achat

DRAFT→POSTED fixe fournisseur, produits, quantités, prix, frais facturés et échéance. Achat gérant consomme une approbation ; achat owner sans demande conserve motif. Le statut de réception (NONE/PARTIAL/COMPLETE) et celui de paiement (DUE/PARTIAL/PAID) sont des projections distinctes de contrôle (OPEN/CLOSED).

POSTED ne devient CANCELLED que par événement owner si aucune réception/paiement ; sinon retourner les produits et corriger les obligations via documents associés. Abandon de reste à livrer : créer adjustment de quantité attendue et d’obligation fournisseur si accord reconnu ; si prépayé, créance de remboursement fournisseur. Ne pas juste fermer la ligne en conservant une dette incorrecte.

Acheter-et-recevoir n’est qu’un raccourci d’une transaction commerciale + réception, mêmes validations. Paiement fournisseur et frais payés à un transporteur sont deux obligations distinctes.

## S08 — Livraison et transfert

Shipment DRAFT→SUBMITTED par gérant, SUBMITTED→APPROVED/REJECTED owner ; owner peut DRAFT→APPROVED. APPROVED→DISPATCHED par détenteur physique après contrôle stock. Réceptions fragmentées : DISPATCHED→PARTIAL→RECEIVED. DISPUTED est un indicateur de cas, pas une remise à zéro de la quantité expédiée. CLOSED seulement si tout reliquat reçu, retourné ou perdu par décision.

Bon d’achat : une ligne peut être livrée à plusieurs lieux. `purchase_destinations` autorise le destinataire à recevoir dans sa limite ; ligne reçue cumulée réseau <= quantité achetée. Livraison directe évite un transit fictif par owner.

Surplus : reçu physiquement mais QUARANTINE, coût UNVALUED, cas. Correction de source peut reclasser ce surplus sans compter deux entrées. Missing sur envoi : stock TRANSIT maintenu jusqu’à traitement, pas quantité disponible chez destinataire.

## S09 — Fonds

DRAFT→SENT émetteur après remise réelle ; SENT→PARTIAL→RECEIVED via reçus successifs du destinataire. Chaque reçu a montant >0, destinataire, date, idempotence et journal. Somme reçue <= envoyé ; réception totale calculée, pas modification du reçu précédent. Cas litige séparé ; CLOSED si transit restant 0 après réception/restitution/perte.

Avance reste une affectation analytique dans la caisse. Si un achat est annulé mais l’argent n’a pas été restitué, la remise ne peut pas être annulée rétroactivement. Reclasser l’affectation ou enregistrer la vraie restitution.

## S10 — Retour fournisseur

REQUESTED→APPROVED/REJECTED owner ; APPROVED→DISPATCHED détenteur physique ; DISPATCHED→CREDIT_CONFIRMED owner sur justificatif/exception motivée ; SETTLED quand dette réduite et remboursement attendu soldé. La sortie physique seule ne réduit pas la dette : elle est en litige tant que l’avoir n’est pas confirmé. Avoir peut être inférieur au prix historique ; différence = perte/charge commerciale explicite, pas cash fictif.

## S11 — Inventaire et perte

Inventaire DRAFT→COUNTING : snapshot, capacité suspendue et verrous produits. Comptage de AVAILABLE, DAMAGED, QUARANTINE par lot séparé. MISSING_PENDING et TRANSIT sont affichés pour contexte mais ne sont pas recomptés comme physiquement présents ; traiter leur dossier existant pour éviter une seconde perte. Produit découvert non prévu : ajouter ligne au scope sous owner et verrou, jamais champ libre sans produit.

COUNTING→SUBMITTED par compteur ; SUBMITTED→APPROVED owner avec ajustements ou →RECOUNT_REQUESTED puis COUNTING nouvelle version conservant précédent. CANCELLED libère verrous sans mouvement, motif. Approbation d’un inventaire avec UNVALUED réclame estimation ou maintien explicitement non valorisé en quarantaine, jamais auto-valorisation zéro.

Perte DECLARED→NEEDS_INFO→WRITTEN_OFF/RESTORED. Déclaration diminue le vendable en le déplaçant vers compartiment approprié ; décision définitive seule sort le réseau ou restaure. Deux déclarations du même produit ne peuvent consommer la même quantité.

## S12 — Crédit, paiements et ouverture

Paiement POSTED affecté atomiquement à documents précis sous verrou ; aucune créance négative. Solde d’ouverture client/fournisseur : `opening_obligation`, sans vente/achat/stock fictif. Paiements, remises de dette et retours éventuels se rattachent à cette obligation identifiable ; pas de retour produit sur dette d’ouverture sans vente connue, dossier owner.

Répartition automatique client : échéance puis date puis ID ; approbation utilisateur affiche liste, serveur revalide hash. Fournisseur : choix explicite. Désactiver crédit bloque nouveaux engagements mais laisse règlements et remboursements existants.

## S13 — Anomalies

OPEN→NEEDS_INFO→OPEN→RESOLVED. Déclaration de décision précise montant/quantité résiduelle traitée. RESOLVED seulement si résiduel 0 ou acceptation motivée de perte totale restante ; correction et fermeture atomiques. REOPEN crée nouvelle action liée, pas suppression de résolution. Documents liés consultables selon droits.

## S14 — Séquence offline

États persistés : RECEIVED, POSTED, REVIEW_REQUIRED, REJECTED_VALIDATION, VOIDED. WAITING_PREVIOUS est une réponse calculée, DUPLICATE est un résultat de transport contenant l’état persistant original.

Une séquence est finalisée par POSTED, REJECTED_VALIDATION (action en ligne explicitement non exécutée) ou VOIDED (owner confirme que fait soumis n’a pas eu lieu). REVIEW_REQUIRED bloque les suivants. Un rejet de format avant lecture de l’enveloppe ne consomme pas une séquence.

Refus en ligne connu avant remise d’argent/produit : annuler la projection locale dans même transaction que réception du refus, conserver événement et raison, puis prochaine séquence. Si résultat inconnu après coupure : ne pas réémettre avec nouvel ID ; récupérer résultat original. Fait déclaré exécuté offline : pas REJECTED_VALIDATION automatique, seulement examen et replay ou VOIDED après owner. Correction de payload = nouvel événement lié, l’original reste conservé.

Trous irrécupérables après perte d’appareil : pas de skip automatique ; procédure de reprise owner crée `sequence_gap_decision` pour intervalle précis avec motif, clôture de reprise et nouvel appareil. Rapports signalent période incomplète.

## S15 — Suspension, passation et fermeture

ACTIVE→SUSPENDED bloque nouveau commerce et révoque capacité. Deux modes : SECURITY (lecture + reprise owner uniquement) et SETTLEMENT (règlements en ligne, remises, retours, corrections autorisées ; aucune nouvelle vente/achat). Une session de règlement dédiée peut être ouverte par gérant, `purpose=SETTLEMENT`, incapable de vendre.

Passation requiert clôture, file traitée, fin affectation et révocation ancien appareil avant activation nouveau. Si impossible : reprise owner documente soldes, limites des données, puis démarre nouvelle période sans reconstituer arbitrairement anciennes ventes.

Fermeture définitive exige soldes/stock/obligations/reliquats 0, dossiers résolus. Ne pas déplacer une dette vers une boutique arbitraire pour fermer. Archivage garde lecture historique. Réouverture d’une boutique CLOSED = nouvelle boutique en V1 ; pas mélange de périodes de responsabilité.
