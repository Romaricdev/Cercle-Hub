# Recette et tests d’acceptation

## Jeu de données commun

Entreprise XAF, fuseau Africa/Douala. Owner O, boutiques A et B, gérants GA/GB, appareils DA/DB. A : cash initial 50 000, produit P en pièces, prix 1 000, couche 20 pièces valeur 12 000 (coût 600). B vide et caisse 0. Q vendu au kg, prix/kg 2 000, stock 10 kg valeur 12 000. Conditionnement P carton=24 unités. Tous tests isolent fixture, ne dépendent pas d’ordre d’exécution.

Exigence globale après chaque commande réussie : journaux équilibrés, projections égales à somme écritures, aucune quantité/espèce négative, aucune ressource hors portée. Échec métier doit laisser DB identique hors audit de tentative autorisé.

## Matrice de scénarios

| ID | Action | Résultat exact attendu |
|---|---|---|
| T01 | Activer A deux fois même clé | Un seul stock initial 20, cash 50 000 |
| T02 | GA lit les ventes B par URL/filtre/export | 404/absence selon route, aucune donnée B |
| T03 | Vendre 2 P cash 2 000, reçu 5 000 | Stock 18, cash 52 000, coût 1 200, rendu 3 000 |
| T04 | Vendre 2 P Mobile Money | Stock 18, cash 50 000, règlement déclaré +2 000 |
| T05 | Vendre 2 P : cash 500 + Mobile 1 500 | Cash 50 500, total 2 000, une vente |
| T06 | Timeout après commit, retry T03 même clé | Pas de nouvelle ligne/entrée ; même ID |
| T07 | Même clé avec quantité 3 au lieu de 2 | 409 IDEMPOTENCY_PAYLOAD_MISMATCH |
| T08 | Stock P réduit à 1, deux ventes simultanées de 1 | Une réussit, autre stock insuffisant, stock 0 |
| T09 | Vendre 0,125 kg Q | CA 250, stock 9,875 kg, coût 150 |
| T10 | Pièce quantité 0,5 | INVALID_PRECISION, aucun effet |
| T11 | Recevoir 2 cartons P puis vendre 1 carton | +48 puis −24 pièces ; conservation valeurs |
| T12 | Lot expiré hier | Vente refusée LOT_EXPIRED |
| T13 | Deux lots même produit, dates distinctes | FEFO sort lot expirant d’abord, FIFO dans lot |
| T14 | Remise 5 % avec plafond 0 | Demande requise, pas de vente |
| T15 | Plafond 10 %, prix 999, quantité 1, remise 5 % | Remise 50, net 949 (HALF_UP) |
| T16 | Vente crédit 5 000, cash 2 000, limite 4 000 | Dû 3 000, cash +2 000, pas +5 000 |
| T17 | Règlement dette T16 de 1 000 cash | Dû 2 000, cash +1 000, aucun stock/CA nouveau |
| T18 | Deux règlements concurrents dépassant solde | Un est refusé ou allocation révisée, pas dette négative |
| T19 | Client en retard, nouvelle vente crédit sans exception | CUSTOMER_OVERDUE |
| T20 | Retour de vente 5 000 dont 2 000 déjà payés, retour 4 000 | Dû réduit 3 000, remboursement dû 1 000 ; pas cash avant exécution |
| T21 | Retour endommagé | DAMAGED augmente, AVAILABLE inchangé |
| T22 | Retour cumulé supérieur à quantité vendue | Refus, aucun double remboursement |
| T23 | Dépense autonome 1 000 avec plafonds 0 | REQUESTED, cash inchangé |
| T24 | Dépense autorisée payée cash 1 000 | Cash 49 000, une charge, justificatif lié |
| T25 | Dépense propriétaire concernant A | Source owner diminue, cash A inchangé |
| T26 | Deux dépenses simultanées 700, plafond session 1 000 | Une autonome, autre requiert accord |
| T27 | Achat gérant budget 10 000, achat 11 000 | BUDGET_EXCEEDED avant posting |
| T28 | Demande refusée | Stock/cash inchangés, refus visible |
| T29 | Avance owner 100 000, réception puis achat 92 000 | Caisse reçoit 100 000 puis paie 92 000, reliquat affecté 8 000, dépense non doublée |
| T30 | Réception avance répétée | Un seul crédit de caisse |
| T31 | Achat owner 50 P, envoyé A 30/B 20 | Un achat, envois total 50, pas nouveau coût global |
| T32 | Envoi 50, réception 45 | Destination +45, transit 5, dossier écart si livraison terminée |
| T33 | Réception de 52 sur envoi 50 | 50 attendus traités, surplus 2 en quarantaine à rapprocher |
| T34 | Achat à crédit 10 000 réceptionné | Stock augmente, cash inchangé, dette 10 000 |
| T35 | Règlement fournisseur 4 000 | Dette 6 000, source −4 000, pas nouvelle réception |
| T36 | Retour fournisseur accepté 3 000 sur dette 2 000 | Dette 0, remboursement à recevoir 1 000 ; pas cash avant réception |
| T37 | Compter caisse déclarée 48 000 vs attendu 50 000 | Clôture delta −2 000, cash repris 48 000, dossier ouvert |
| T38 | Lire API/HTML/export gérant avant T37 soumission | Aucun champ attendu/solde caché ; propriétaire le voit |
| T39 | Deux submit-count concurrents | Une clôture, une écriture variance ; seconde conflit/rejeu |
| T40 | Identifier dépense oubliée 2 000 après T37 | Reclassification écart, pas nouvelle sortie cash |
| T41 | Corriger comptage après nouvelle session | Original préservé, ajustement lié dans session courante |
| T42 | Inventaire P attendu 20, compté 18 | Aucun ajustement avant accord ; ensuite stock 18, sortie coût 1 200 |
| T43 | Vente pendant verrou inventaire P | Refus contrôlé, aucun faux écart |
| T44 | Déclarer casse 2 P, propriétaire valide | AVAILABLE 18, DAMAGED 2 puis write-off, valeur perdue 1 200 |
| T45 | Vente offline 2 P puis reconnexion | Une vente, stock 18, cash 52 000, deux dates conservées |
| T46 | Batch offline envoyé deux fois | Même résultats, aucun doublon |
| T47 | Séquence 1 puis 3 sans 2 | 3 WAITING_PREVIOUS, aucune clôture prématurée |
| T48 | Révocation avant retour appareil | Événements conservés REVIEW_REQUIRED, pas auto-posting |
| T49 | Nouveau prix 1 100 serveur, vente offline autorisée prix 1 000 | Prix snapshot conservé, annotation ancien tarif |
| T50 | Clôture offline avec vente antérieure en conflit | Comptage conservé, attendu non révélé, clôture attend |
| T51 | Appareil secondaire ou deuxième onglet écrit | Blocage explicite, lecture disponible |
| T52 | Disque IndexedDB plein à vente | Pas message « vente enregistrée », aucune décrémentation partielle |
| T53 | Fichier HTML renommé JPG | Refus par type réel |
| T54 | CSV client nommé =HYPERLINK(...) | Texte neutralisé, pas formule exécutée |
| T55 | Désactiver crédit avec dette existante | Nouvelles ventes crédit bloquées, règlement toujours possible |
| T56 | Fermer boutique avec transit/créance | Refus liste raisons, pas perte de données |
| T57 | Couches valeur 100 pour 3 unités, trois sorties de 1 | Coûts alloués total 100, dernier prend reliquat |
| T58 | Panne après écriture journal avant projection | Transaction rollback intégral |
| T59 | Restauration DB de test + pièces | Documents retrouvés et sommes réconciliées |
| T60 | Rapport réseau transferts internes | Pas de CA/charge supplémentaire dû au transfert |

## Scénarios complémentaires de revue 2.1

| ID | Action | Résultat exact attendu |
|---|---|---|
| T61 | Nouveau gérant, aucun appareil ni session | Device PENDING puis ACTIVE sans capacité ; ouverture en ligne ; capacité ensuite, pas de dépendance circulaire |
| T62 | Vente en ligne par Mobile Money avec capability cash-only | Utiliser preuve ONLINE liée au devis ; pas élargissement du droit OFFLINE |
| T63 | Refus en ligne avant exécution puis nouvelle vente | Première séquence REJECTED_VALIDATION sans journal, suivante traitable ; fait offline exécuté reste REVIEW_REQUIRED |
| T64 | Clôture offline sans start-count transmis au serveur | OPEN→COUNTING→CLOSED atomique au replay après séquences antérieures ; aucun attendu prématuré |
| T65 | Remise 10 000 reçue en 4 000 puis 6 000 | Deux reçus immutables, transit 6 000 puis 0 ; retry premier reçu ne double pas |
| T66 | Créer source owner à solde 0 puis apporter 20 000 | Compte/source sans FK circulaire ; apport +20 000, CA 0 |
| T67 | Déplacer couche AVAILABLE vers DAMAGED puis dépôt | Coût suit même lot/couche, non vendable reste non vendable ; aucune couche réutilisée deux fois |
| T68 | Achat biens 10 000 + frais fournisseur 500 + transport externe 300 | Dette fournisseur 10 500, valeur stock 10 800, sorties 10 800 après paiements ; pas double charge capitalisée |
| T69 | Achat owner 50 unités réparti A30/B20 | Réception A31 interdite dans attendu A, surplus isolé ; B ne voit pas justificatif global non autorisé |
| T70 | Vente 5 000, payé 2 000, dette 2 000, abandon 1 000 ; retour 4 000 | Réduction dette 2 000, reprise abandon 1 000, remboursement 1 000 ; pas remboursement 2 000 |
| T71 | Approuver transfert puis confirmer deux réceptions simultanées au-delà du restant | Verrou origine ; aucune quantité reçue attendue > expédiée |
| T72 | Demande NEEDS_INFO resoumise puis approuvée partiellement | Versions conservées, quantités/budget valables sans remise à zéro consommations |
| T73 | Réception surplus 2 UNVALUED puis achat complémentaire régularisé | Quantité physique toujours 2 ; reclassification valorisée sans doubler le stock |
| T74 | Owner autorise retour pendant capacité boutique active | Aucun remboursement cash direct ; gérant exécute après handshake |
| T75 | Deux manquants déjà MISSING_PENDING puis inventaire du disponible | Pas seconde sortie des mêmes 2 unités ; cas original conservé |
| T76 | Recomptage d’inventaire | Nouvelle révision, premier comptage consultable, verrous conservés jusqu’à décision finale |
| T77 | Boutique suspendue pour règlement, créance cash à recouvrer | Session SETTLEMENT permet règlement, interdit vente nouvelle ; SECURITY interdit hors reprise |
| T78 | Créance initiale client 3 000, règlement 1 000 | Dette restante 2 000, cash +1 000, aucune vente/stock/CA initial fictif |
| T79 | Retour fournisseur expédié sans avoir confirmé | Stock sorti, dette inchangée, avoir en attente ; dette réduite à confirmation seulement |
| T80 | Boutique offline sans événements connus serveur | Afficher fraîcheur incomplète, pas faux « 0 opération en attente » |
| T81 | Session lundi23h, vente mardi00h30 | Date activité lundi, heure reçu mardi ; rapports utilisent convention affichée |
| T82 | Réception retour partiel puis second retour même ligne | Allocations cumulées <= vendu, remboursements/coûts exacts avec reliquat final |
| T83 | Désactiver dépôt avec stock ou crédit avec dettes | Aucun nouvel engagement, consultation et solde restent possibles |
| T84 | Scénario complet décrit dans reporting 2.1 | Clôture attendue58 500, déclarée58 000, écart−500, CA5 000, créance2 000 ; suite après règlement/retour caisse59 000 |

Ces scénarios sont des critères de recette à implémenter, pas des tests exécutés du logiciel par le seul fait d’être listés ici. Les preuves locales réellement obtenues sont consignées dans [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). La vérification de leurs liens et de l’arithmétique documentaire ne prouve pas à elle seule la conformité d’une application.

## Tests de propriétés

Générer suites de ventes/retours/réceptions fractionnés : jamais quantité retournée > vendue ; coût sorti + restant exact ; journal équilibré ; équivalence série de réceptions partielles et réception totale ; idempotence sur doublons ; concurrence sur soldes et plafonds. Employer générateur déterministe et seed affiché pour reproduire échec.

## Couverture par couche

Unitaires : prix, remise, précision, allocations, échéances, permissions. Intégration PostgreSQL réelle : locks, contraintes différées, rollback, idempotence, branches de correction. API : schémas, droits, champs interdits et erreurs. E2E : parcours gérant mobile et owner, coupures, impression et formulaires.

Critère de passage : tous tests du lot, lint, typecheck, build. Ne pas remplacer intégration SQL par mocks pour les invariants financiers. En fin de projet, exécuter matrice complète et test restauration. Une maquette avec données hardcodées ne valide aucun scénario de caisse.

## Recette responsive complémentaire

Les scénarios RSP01 à RSP10 complètent T01 à T84 ; ils sont à appliquer à chaque lot concerné. Aucun résultat de test n’est acquis par leur rédaction. Voir [le complément 2.2](10-ajouts-techniques-et-responsive.md).

## Outils de réalisation de la recette

Appliquer [11-stack-et-strategie-tests.md](11-stack-et-strategie-tests.md). Relier les tests unitaires, intégration et E2E aux scénarios métier et RSP applicables.

## Recette sécurité complémentaire

[14-securite-conception-et-recette.md](14-securite-conception-et-recette.md) définit SEC01 à SEC21 : contrôles négatifs web/API, fichiers, infrastructure, sauvegarde et incidents. Ces références complètent T et RSP sans renumérotation ; aucun résultat encore acquis.
