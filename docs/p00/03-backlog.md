# Backlog exécutable

Source éditable : [backlog.json](backlog.json). IDs stables ; les écrans conservent les références du catalogue. Dépendances = tâches terminées avant de commencer ; chaque GATE dépend de sa phase. Les tâches P01 sans dépendance partent de P00 terminée.

Les assertions d’un écran impliquant un domaine ultérieur sont complétées par P07/P08/P10 : une UI initiale ne vaut pas succès du scénario complet. Tous les tests restent NON TESTÉS. Les liens de couverture expriment une responsabilité prévue, pas une preuve.


## P01-01 — Actualiser versions et verrouiller le workspace

Statut : TERMINE. Dépendances : P00 documentée.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Registre actualisé, préversions exclues, lockfile et scripts reproductibles
- Packages parents et auxiliaires recensés ; aucune clé de production

**Références :** .

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P01-02 — Compiler web/API/worker et installer les tests

Statut : TERMINE. Dépendances : P01-01.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Nest/Fastify DI et Next/React compilent avec TypeScript retenu
- Vitest Node/DOM et Playwright smoke fonctionnent ; lint/typecheck/build

**Références :** .

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P01-03 — Démontrer le pont Better Auth/Fastify/Prisma

Statut : TERMINE. Dépendances : P01-02.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Cookies multiples, login/logout, session et TOTP prouvés sur base de test
- Pas de wrapper Fastify bêta requis ; génération/migration auth revue

**Références :** SEC06, SEC07.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P01-04 — Contrats et transactions de référence

Statut : TERMINE. Dépendances : P01-02.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Money/Quantity, enveloppe et erreurs versionnées ; canonicalisation et hash testés
- Transaction Prisma avec verrou SQL, rollback, journal et outbox atomiques

**Références :** T57, T58, SEC03, SEC15.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P01-05 — Services Docker et stockage privé

Statut : TERMINE. Dépendances : P01-02.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Digests et volumes vérifiés ; test S3 privé, persistance redémarrage
- BullMQ/Redis : retry sans double effet ; réseau et logs bornés

**Références :** SEC12, SEC17.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P01-GATE — Valider la sortie P01

Statut : TERMINE. Dépendances : P01-01, P01-02, P01-03, P01-04, P01-05.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P02-01 — Design tokens, thèmes, navigation et logo

Statut : TERMINE. Dépendances : P01-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Manrope/Inter locales ; thèmes persistants, composants peu bordés
- Logo adapté sans altérer identité ; clavier et reduced-motion vérifiés

**Références :** RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P02-02 — Protections HTTP et secrets

Statut : TERMINE. Dépendances : P01-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- CSP production, CSRF, origins, rate limit compte/IP/proxy et récupération testés
- MFA propriétaire requis ; fuite/erreurs génériques et contrôle objet testés

**Références :** SEC01, SEC02, SEC04, SEC05, SEC06, SEC07, SEC08, SEC17.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P02-E01 — Connexion

Statut : TERMINE. Dépendances : P01-GATE, P02-02.

**Livrables :** /api/auth/*; Tests et états UI de E01.

**Acceptation :**

- Réaliser le parcours Lien ou session expirée → E02 si entreprise non initialisée, sinon E03 ou E17
- Action : Se connecter ; champs/DTO et droits de la fiche respectés
- Données : app_users ; états et effets selon S01
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E01, S01, T02, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P02-E37 — Utilisateurs et affectations

Statut : TERMINE. Dépendances : P01-GATE, P02-02.

**Livrables :** POST /users; POST /shops/:id/assign-manager; POST /users/:id/deactivate; Tests et états UI de E37.

**Acceptation :**

- Réaliser le parcours Paramètres > Utilisateurs → Confirmation étapes, pas deux affectations actives
- Action : Inviter ou remplacer le gérant ; champs/DTO et droits de la fiche respectés
- Données : app_users, manager_assignments ; états et effets selon S01, S15
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E37, S01, S15, T02, T61, T77, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P02-E38 — Appareil principal

Statut : TERMINE. Dépendances : P01-GATE, P02-02.

**Livrables :** POST /devices/register; POST /devices/:id/approve; POST /devices/:id/revoke; Tests et états UI de E38.

**Acceptation :**

- Réaliser le parcours Première utilisation ou Paramètres → Confirmation principale, gérant peut ouvrir caisse ; secours E36
- Action : Approuver cet appareil ou révoquer ; champs/DTO et droits de la fiche respectés
- Données : devices, device_capabilities ; états et effets selon S01, S14
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E38, S01, S14, T48, T51, T61, T62, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P02-GATE — Valider la sortie P02

Statut : TERMINE. Dépendances : P02-01, P02-02, P02-E01, P02-E37, P02-E38.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P03-01 — Moteur de journaux, couches et nombres

Statut : TERMINE. Dépendances : P02-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Contraintes bigint/numeric et journal équilibré
- FEFO/FIFO, valeur résiduelle et initialisation sans chiffre d’affaires artificiel

**Références :** T57, T58, T66, T78, SEC03, SEC09, SEC15.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P03-E02 — Initialisation

Statut : TERMINE. Dépendances : P02-GATE, P03-01.

**Livrables :** POST /shops/:id/opening-balances; POST /shops/:id/activate; Tests et états UI de E02.

**Acceptation :**

- Réaliser le parcours Première connexion ou nouvelle boutique E26 → Récapitulatif figé puis E26 ACTIVE ; accueil gérant E03 reste en P04
- Action : Valider les données initiales (owner) ; champs/DTO et droits de la fiche respectés
- Données : opening_drafts, opening_stock_lines, opening_obligations, shops ; états et effets selon S01, S12
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E02, S01, S12, T01, T78, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P03-E14 — Stock boutique

Statut : TERMINE. Dépendances : P02-GATE.

**Livrables :** GET /stock; GET /stock/movements; Tests et états UI de E14.

**Acceptation :**

- Réaliser le parcours Navigation Stock → consultation et détail des mouvements ; demandes E10 et pertes E31 restent dans leurs phases
- Action P03 : rechercher et filtrer le stock autorisé ; aucun workflow futur simulé
- Données : stock_balances, stock_entries, lots ; états et effets selon S04, S11
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E14, S04, S11, T12, T13, T44, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P03-E25 — Catalogue et prix

Statut : TERMINE. Dépendances : P02-GATE.

**Livrables :** POST /products; POST /products/:id/variants; POST /variants/:id/units; POST /prices; Tests et états UI de E25.

**Acceptation :**

- Réaliser le parcours Navigation Produits → Liste filtrée et détail ; jamais stock créé par catalogue
- Action : Enregistrer produit ou nouvelle version de prix ; champs/DTO et droits de la fiche respectés
- Données : products, variants, sale_units, prices, shop_products ; états et effets selon S01
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E25, S01, T10, T11, T12, T13, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P03-E26 — Boutique et responsabilité

Statut : TERMINE. Dépendances : P02-GATE.

**Livrables :** POST /shops; POST /shops/:id/activate; POST /shops/:id/suspend; POST /shops/:id/close; Tests et états UI de E26.

**Acceptation :**

- Réaliser le parcours Liste boutiques → E02 pour initialisation ; E36 secours ; historique conservé
- Action : Activer / suspendre / remplacer selon état ; champs/DTO et droits de la fiche respectés
- Données : shops, manager_assignments, opening_drafts ; états et effets selon S01, S15
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E26, S01, S15, T01, T56, T77, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P03-E28 — Paramètres métier

Statut : TERMINE. Dépendances : P02-GATE.

**Livrables :** GET /policies; POST /policies; Tests et états UI de E28.

**Acceptation :**

- Réaliser le parcours Navigation Paramètres → Résumé des changements et date d’effet ; historiques inchangés
- Action : Enregistrer nouvelle version ; champs/DTO et droits de la fiche respectés
- Données : policies ; états et effets selon S04, S12
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E28, S04, S12, T26, T55, T83, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P03-E39 — Sources de paiement

Statut : TERMINE. Dépendances : P02-GATE.

**Livrables :** POST /payment-sources; POST /owner-fund-events; Tests et états UI de E39.

**Acceptation :**

- Réaliser le parcours Paramètres > Sources de fonds → Compte et historique ; solde jamais édité directement après usage
- Action : Créer source ou enregistrer apport réel ; champs/DTO et droits de la fiche respectés
- Données : payment_sources, money_accounts, money_events ; états et effets selon S01, S09
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E39, S01, S09, T25, T29, T66, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P03-E40 — Lieux et dépôt

Statut : TERMINE. Dépendances : P02-GATE.

**Livrables :** GET /locations; POST /locations/depot; PATCH /locations/:id; Tests et états UI de E40.

**Acceptation :**

- Réaliser le parcours Stock > Lieux → activation facultative du dépôt ; transfert E20 reste en P06
- Action P03 : activer, consulter ou désactiver un lieu cohérent ; aucun déplacement de stock
- Données : locations, stock_balances ; états et effets selon S08, S15
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E40, S08, S15, T31, T56, T67, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P03-GATE — Valider la sortie P03

Statut : TERMINE. Dépendances : P03-01, P03-E02, P03-E14, P03-E25, P03-E26, P03-E28, P03-E39, P03-E40.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P04-01 — File séquencée et posting de vente en ligne

Statut : A_FAIRE. Dépendances : P03-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Transport document 06 P00, preuve ONLINE distincte de capacité cash-only
- Retry même ID, validation refusée finalisée, concurrence stock/session correcte

**Références :** T03, T04, T05, T06, T07, T08, T58, T62, T63, T81, SEC09, SEC15.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P04-E03 — Accueil gérant

Statut : A_FAIRE. Dépendances : P03-GATE.

**Livrables :** GET /me; GET /notifications; GET /cash-sessions/current; Tests et états UI de E03.

**Acceptation :**

- Réaliser le parcours Connexion réussie → E04 ou ouverture E07 si nécessaire
- Action : Nouvelle vente ; champs/DTO et droits de la fiche respectés
- Données : cash_sessions, notifications, devices ; états et effets selon S01, S02, S03
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E03, S01, S02, S03, T02, T38, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P04-E04 — Panier de vente

Statut : A_FAIRE. Dépendances : P03-GATE.

**Livrables :** GET /stock; POST /sales/quote; Tests et états UI de E04.

**Acceptation :**

- Réaliser le parcours E03 ou navigation Vendre → E05 avec panier conservé ; retour depuis E05 sans perte
- Action : Passer au paiement ; champs/DTO et droits de la fiche respectés
- Données : products, variants, sale_units, prices, stock_balances ; états et effets selon S02
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E04, S02, T08, T09, T10, T11, T12, T15, T14, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P04-E05 — Paiement vente

Statut : A_FAIRE. Dépendances : P03-GATE, P04-01.

**Livrables :** POST /sales/quote; POST /sales; Tests et états UI de E05.

**Acceptation :**

- Réaliser le parcours Panier valide E04 → E06 après POSTED ; reçu local si offline ; erreur conserve panier
- Action : Confirmer la vente ; champs/DTO et droits de la fiche respectés
- Données : sales, sale_lines, payments, customer_payment_allocations ; états et effets selon S02, S12, S14
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E05, S02, S12, S14, T03, T04, T05, T06, T07, T16, T45, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P04-E06 — Reçu et détail vente

Statut : A_FAIRE. Dépendances : P03-GATE.

**Livrables :** GET /sales/:id; POST /sales/:id/reversal-request; Tests et états UI de E06.

**Acceptation :**

- Réaliser le parcours Confirmation vente ou recherche historique → Impression même page ; retour E33 ; nouvelle vente E04
- Action : Imprimer ou demander un retour ; champs/DTO et droits de la fiche respectés
- Données : sales, returns, payments ; états et effets selon S02, S06
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E06, S02, S06, T20, T21, T22, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P04-E07 — Session de caisse

Statut : A_FAIRE. Dépendances : P03-GATE.

**Livrables :** POST /cash-sessions/open; POST /cash-sessions/:id/start-count; Tests et états UI de E07.

**Acceptation :**

- Réaliser le parcours Navigation Plus ou vente sans session → E08 si comptage, E03 si ouverture
- Action : Ouvrir ou compter ma caisse ; champs/DTO et droits de la fiche respectés
- Données : cash_sessions, cash_closures ; états et effets selon S01, S03
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E07, S01, S03, T37, T38, T61, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P04-GATE — Valider la sortie P04

Statut : A_FAIRE. Dépendances : P04-01, P04-E03, P04-E04, P04-E05, P04-E06, P04-E07.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P05-01 — Fichiers privés et quarantaine antivirus

Statut : TERMINE. Dépendances : P04-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- PDF/images contrôlés, CLEAN requis et téléchargement scoped
- Antivirus indisponible garde quarantaine, fichiers orphelins traités

**Références :** SEC11, SEC12, SEC13.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P05-E08 — Comptage aveugle

Statut : TERMINE. Dépendances : P04-GATE.

**Livrables :** POST /cash-sessions/:id/submit-count; POST /cash-sessions/:id/cancel-count; Tests et états UI de E08.

**Acceptation :**

- Réaliser le parcours Session COUNTING ou comptage local autorisé → Résultat figé sur même écran ; correction ouvre E36 avec type RECOUNT
- Action : Enregistrer mon comptage ; champs/DTO et droits de la fiche respectés
- Données : cash_closures, money_events, discrepancy_cases ; états et effets selon S03, S14
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E08, S03, S14, T37, T38, T39, T41, T50, T64, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09, SEC10.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P05-E09 — Dépense

Statut : TERMINE. Dépendances : P04-GATE, P05-01.

**Livrables :** POST /expenses; POST /expenses/:id/submit; POST /expenses/:id/pay; POST /expenses/declare-irregular; Tests et états UI de E09.

**Acceptation :**

- Réaliser le parcours Plus ou demande autorisée E11 → E11 si accord demandé ; détail dépense si paiement confirmé
- Action : Demander accord ou enregistrer paiement (libellés distincts) ; champs/DTO et droits de la fiche respectés
- Données : expenses, requests, approvals, payments ; états et effets selon S05
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E09, S05, T23, T24, T25, T26, T53, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P05-E21 — Fonds propriétaire

Statut : TERMINE. Dépendances : P04-GATE.

**Livrables :** GET /fund-transfers; POST /fund-transfers; POST /fund-transfers/:id/send; POST /fund-transfers/:id/receive; Tests et états UI de E21.

**Acceptation :**

- Réaliser le parcours Navigation Fonds → Détail remise avec transit/reliquat distinct
- Action : Enregistrer remise ou confirmer réception ; champs/DTO et droits de la fiche respectés
- Données : fund_transfers, fund_receipts, money_entries ; états et effets selon S09
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E21, S09, T29, T30, T65, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P05-E22 — Liste des contrôles

Statut : TERMINE. Dépendances : P04-GATE.

**Livrables :** GET /discrepancies; GET /stock-counts; Tests et états UI de E22.

**Acceptation :**

- Réaliser le parcours Navigation Contrôles → E23, E24 ou E36 selon type
- Action : Examiner un dossier ; champs/DTO et droits de la fiche respectés
- Données : discrepancy_cases, cash_closures, stock_counts ; états et effets selon S13
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E22, S13, T37, T40, T42, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P05-E23 — Dossier d’écart

Statut : TERMINE. Dépendances : P04-GATE.

**Livrables :** GET /discrepancies/:id; POST /discrepancies/:id/resolve; Tests et états UI de E23.

**Acceptation :**

- Réaliser le parcours E22 ou opération signalée → Dossier mis à jour ; ne résoudre que résiduel traité
- Action : Appliquer décision ; champs/DTO et droits de la fiche respectés
- Données : discrepancy_cases, discrepancy_actions, money_events, stock_events ; états et effets selon S13
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E23, S13, T40, T41, T73, T74, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P05-E30 — Fonds du gérant

Statut : TERMINE. Dépendances : P04-GATE.

**Livrables :** POST /fund-transfers; POST /fund-transfers/:id/send; POST /fund-transfers/:id/receive; Tests et états UI de E30.

**Acceptation :**

- Réaliser le parcours Plus > Fonds ou notification remise → Détail reçus et reliquat ; jamais attendu courant
- Action : Confirmer reçu ou enregistrer remise réelle ; champs/DTO et droits de la fiche respectés
- Données : fund_transfers, fund_receipts ; états et effets selon S09
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E30, S09, T29, T30, T65, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P05-GATE — Valider la sortie P05

Statut : TERMINE. Dépendances : P05-01, P05-E08, P05-E09, P05-E21, P05-E22, P05-E23, P05-E30.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P06-01 — Réapprovisionnement dans les deux circuits

Statut : A_FAIRE. Dépendances : P05-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Gérant achète après accord ; owner achète/transfère puis gérant reçoit
- Paiement/réception/contrôle distincts ; frais et surplus non doublés

**Références :** T27, T28, T31, T68, T69, T71, T72, T73, SEC08, SEC09, SEC15.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P06-E10 — Demandes

Statut : A_FAIRE. Dépendances : P05-GATE.

**Livrables :** GET /requests; POST /requests; Tests et états UI de E10.

**Acceptation :**

- Réaliser le parcours Navigation Demandes → Formulaire puis E11 ; brouillon offline indiqué non envoyé
- Action : Demander des produits ou des fonds ; champs/DTO et droits de la fiche respectés
- Données : requests, request_lines ; états et effets selon S04
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E10, S04, T27, T28, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-E11 — Détail demande

Statut : A_FAIRE. Dépendances : P05-GATE.

**Livrables :** PATCH /requests/:id; POST /requests/:id/submit; GET /requests/:id; Tests et états UI de E11.

**Acceptation :**

- Réaliser le parcours Liste ou notification → Reste détail après soumission ; E12 pour achat autorisé
- Action : Soumettre / compléter / acheter selon état ; champs/DTO et droits de la fiche respectés
- Données : requests, approvals, approval_lines ; états et effets selon S04, S07
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E11, S04, S07, T27, T28, T72, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-E12 — Achat par gérant

Statut : A_FAIRE. Dépendances : P05-GATE, P06-01.

**Livrables :** POST /purchases; POST /purchases/with-receipt; Tests et états UI de E12.

**Acceptation :**

- Réaliser le parcours Demande approuvée E11 → Détail achat ; E13 si réception différée ; écart renvoie demande de complément
- Action : Acheter et recevoir ou enregistrer achat ; champs/DTO et droits de la fiche respectés
- Données : purchases, purchase_lines, purchase_fees, receipts ; états et effets selon S07, S08
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E12, S07, S08, T27, T29, T34, T68, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-E13 — Réception

Statut : A_FAIRE. Dépendances : P05-GATE.

**Livrables :** POST /receipts; GET /shipments/:id; Tests et états UI de E13.

**Acceptation :**

- Réaliser le parcours Accueil ou notification livraison → Résumé quantités mises en stock et restant ; dossier si écart
- Action : Confirmer cette réception ; champs/DTO et droits de la fiche respectés
- Données : receipts, receipt_lines, cost_layers, discrepancy_cases ; états et effets selon S08
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E13, S08, T31, T32, T33, T71, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-E18 — Décider une demande

Statut : A_FAIRE. Dépendances : P05-GATE.

**Livrables :** POST /requests/:id/decision; Tests et états UI de E18.

**Acceptation :**

- Réaliser le parcours Liste des demandes ou notification → Même dossier avec décision figée ; gérant notifié
- Action : Approuver, demander complément ou refuser ; champs/DTO et droits de la fiche respectés
- Données : requests, approvals, approval_lines ; états et effets selon S04
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E18, S04, T27, T28, T72, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-E19 — Achats propriétaire

Statut : A_FAIRE. Dépendances : P05-GATE, P06-01.

**Livrables :** GET /purchases; POST /purchases; POST /purchases/with-receipt; Tests et états UI de E19.

**Acceptation :**

- Réaliser le parcours Navigation Achats → Détail avec réception/répartition/règlement ; E20 envoi ou E34 paiement
- Action : Enregistrer achat ; champs/DTO et droits de la fiche respectés
- Données : purchases, purchase_destinations, purchase_fees ; états et effets selon S07, S08
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E19, S07, S08, T31, T34, T68, T69, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-E20 — Transferts propriétaire

Statut : A_FAIRE. Dépendances : P05-GATE.

**Livrables :** POST /shipments; POST /shipments/:id/approve; POST /shipments/:id/dispatch; Tests et états UI de E20.

**Acceptation :**

- Réaliser le parcours Navigation Stock/transferts ou achat → Détail transfert, bordereau, notification destinataire
- Action : Autoriser puis expédier si détenteur ; champs/DTO et droits de la fiche respectés
- Données : shipments, shipment_lines, shipment_cost_allocations ; états et effets selon S08
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E20, S08, T31, T32, T60, T71, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-E29 — Expédition gérant

Statut : A_FAIRE. Dépendances : P05-GATE.

**Livrables :** POST /shipments/:id/dispatch; POST /shipments/:id/submit; Tests et états UI de E29.

**Acceptation :**

- Réaliser le parcours Plus > Transferts ou notification accord → Bordereau et transit ; pas réception automatique
- Action : Confirmer l’expédition ; champs/DTO et droits de la fiche respectés
- Données : shipments, shipment_lines, stock_entries ; états et effets selon S08
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E29, S08, T32, T71, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P06-GATE — Valider la sortie P06

Statut : A_FAIRE. Dépendances : P06-01, P06-E10, P06-E11, P06-E12, P06-E13, P06-E18, P06-E19, P06-E20, P06-E29.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P07-01 — Finaliser crédit et retours dans la vente

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Règlement ne crée pas de nouvelle vente ; retour après abandon plafonné
- Options désactivées laissent solder ; reçus historiques fidèles

**Références :** E02, E05, E06, E28, S01, S02, S04, S06, S12, S14, T16, T17, T18, T19, T20, T21, T22, T70, T78, T79, T82, T83, SEC09, SEC15.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P07-02 — Passation et suspension sans perte

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- SETTLEMENT versus SECURITY, clôture et révocation ancien appareil
- Fermeture exige soldes/dossiers résolus ; dépôt non supprimé avec stock

**Références :** E26, E37, E38, E40, S01, S08, S14, S15, T56, T61, T67, T75, T76, T77, T83, SEC08, SEC16, SEC21.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P07-E15 — Clients et créances

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** GET /customers; POST /customers; POST /customer-payments/preview; POST /customer-payments; Tests et états UI de E15.

**Acceptation :**

- Réaliser le parcours Plus si crédit actif ou dette existante → Reçu et dettes restantes sur détail client
- Action : Enregistrer le règlement ; champs/DTO et droits de la fiche respectés
- Données : customers, customer_payment_allocations, opening_obligations ; états et effets selon S12
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E15, S12, T17, T18, T19, T55, T78, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P07-E24 — Inventaire propriétaire

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** POST /stock-counts; POST /stock-counts/:id/start; POST /stock-counts/:id/decision; Tests et états UI de E24.

**Acceptation :**

- Réaliser le parcours Créer depuis Contrôles ou demande soumise → Rapport ajustements et historique ; notifications gérant
- Action : Démarrer / demander recomptage / valider selon état ; champs/DTO et droits de la fiche respectés
- Données : stock_counts, stock_count_lines, stock_count_locks ; états et effets selon S11
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E24, S11, T42, T43, T75, T76, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P07-E31 — Perte ou casse

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** POST /loss-reports; Tests et états UI de E31.

**Acceptation :**

- Réaliser le parcours Stock > Signaler problème → Quantité isolée, dossier en attente, lien suivi
- Action : Déclarer le problème ; champs/DTO et droits de la fiche respectés
- Données : loss_reports, stock_entries, discrepancy_cases ; états et effets selon S11
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E31, S11, T44, T75, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P07-E32 — Comptage inventaire gérant

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** PUT /stock-counts/:id/lines; POST /stock-counts/:id/submit; Tests et états UI de E32.

**Acceptation :**

- Réaliser le parcours Notification inventaire ouvert → Lecture figée en attente owner ; aucun déblocage automatique
- Action : Soumettre le comptage ; champs/DTO et droits de la fiche respectés
- Données : stock_counts, stock_count_lines ; états et effets selon S11
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E32, S11, T42, T43, T76, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P07-E33 — Retour et remboursement client

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** POST /returns; POST /returns/:id/receive; POST /returns/:id/refund; Tests et états UI de E33.

**Acceptation :**

- Réaliser le parcours Vente E06 ou liste retours → Détail retour avec obligation restante ; reçu remboursement
- Action : Demander / recevoir / rembourser selon étape ; champs/DTO et droits de la fiche respectés
- Données : returns, return_receipts, return_value_allocations, refund_allocations ; états et effets selon S06
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E33, S06, T20, T21, T22, T70, T82, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P07-E34 — Fournisseurs et paiements

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** POST /supplier-payments; POST /supplier-returns; POST /supplier-returns/:id/confirm-credit; Tests et états UI de E34.

**Acceptation :**

- Réaliser le parcours Achats > Fournisseur → Reçu et solde restant ; retour fournisseur sous onglet dédié
- Action : Payer ou enregistrer remboursement fournisseur ; champs/DTO et droits de la fiche respectés
- Données : suppliers, supplier_payment_allocations, supplier_returns ; états et effets selon S10, S12
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E34, S10, S12, T35, T36, T79, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P07-E35 — Historique détaillé propriétaire

Statut : A_FAIRE. Dépendances : P06-GATE.

**Livrables :** GET /sales/:id; POST /returns/:id/decision; POST /requests/:id/decision; Tests et états UI de E35.

**Acceptation :**

- Réaliser le parcours Rapport ventes ou recherche référence → Gérant notifié pour exécution physique ; pas sortie cash immédiate
- Action : Autoriser/refuser une correction ; champs/DTO et droits de la fiche respectés
- Données : sales, approvals, returns ; états et effets selon S02, S06
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E35, S02, S06, T20, T22, T74, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P07-GATE — Valider la sortie P07

Statut : A_FAIRE. Dépendances : P07-01, P07-02, P07-E15, P07-E24, P07-E31, P07-E32, P07-E33, P07-E34, P07-E35.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P08-01 — Activer offline, PWA et reprise durable

Statut : A_FAIRE. Dépendances : P07-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Cash-only <=24h ; coupure/veille/reload/replay sans doublon
- Clôture offline dernier événement ; file préservée sur logout/update
- Tester appareil réel, quotas et manque d’API ; résultat inconnu visible

**Références :** E05, E07, E08, E16, E36, E38, S01, S02, S03, S12, S13, S14, S15, T45, T46, T47, T48, T49, T50, T51, T52, T61, T62, T63, T64, T74, T80, RSP08, RSP09, RSP10, SEC10, SEC15, SEC16, SEC21, SEC10.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P08-E16 — Synchronisation

Statut : A_FAIRE. Dépendances : P07-GATE, P08-01.

**Livrables :** POST /sync/handshake; POST /sync/push; GET /sync/pull; Tests et états UI de E16.

**Acceptation :**

- Réaliser le parcours Bandeau statut ou Plus → Même écran, lien dossier de conflit ; aucun bouton effacer
- Action : Réessayer la synchronisation ; champs/DTO et droits de la fiche respectés
- Données : device_events, sync_changes, devices ; états et effets selon S14
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E16, S14, T45, T46, T47, T48, T49, T50, T51, T52, T62, T63, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P08-E36 — Correction et reprise

Statut : A_FAIRE. Dépendances : P07-GATE, P08-01.

**Livrables :** POST /cash-closures/:id/recounts; POST /recounts/:id/decision; POST /recovery-cases; Tests et états UI de E36.

**Acceptation :**

- Réaliser le parcours Écart, recomptage ou appareil perdu → Chronologie, opérations liées, reprise appareil après rapprochement
- Action : Valider une étape de reprise ; champs/DTO et droits de la fiche respectés
- Données : recount_requests, opening_and_recovery_cases, device_sequence_resolutions ; états et effets selon S03, S13, S14, S15
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E36, S03, S13, S14, S15, T41, T48, T63, T77, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P08-GATE — Valider la sortie P08

Statut : A_FAIRE. Dépendances : P08-01, P08-E16, P08-E36.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P09-01 — Worker exports et indicateurs réconciliés

Statut : A_FAIRE. Dépendances : P08-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- CSV sans formule, PDF contrôlé et liens privés périssables
- Chiffres T84 et fraîcheur T80 cohérents avec journaux ; pas de faux zéro

**Références :** E03, E17, E22, E23, E27, S01, S02, S03, S13, T53, T54, T60, T80, T81, T84, SEC08, SEC10, SEC13, SEC19.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P09-E17 — Vue propriétaire

Statut : A_FAIRE. Dépendances : P08-GATE, P09-01.

**Livrables :** GET /reports/overview; GET /notifications; Tests et états UI de E17.

**Acceptation :**

- Réaliser le parcours Connexion ou navigation → E18 ou listes détaillées E27/E35
- Conserver /owner comme entrée décisionnelle unique et gérer SETUP, EMPTY, ACTIVE, STALE, PARTIAL et ERROR
- Action : Traiter les actions prioritaires ou ouvrir un indicateur jusqu’aux écritures sources autorisées
- Données : sales, payments, money_entries, stock_balances, discrepancy_cases, sync_cursors ; états et effets selon S13
- Afficher période, périmètre boutique, fraîcheur et couverture ; absence de données distincte de zéro
- Consolider ventes, encaissements, dépenses, créances, résultat brut estimé, stock, écarts, décisions et alertes sans chiffre fictif
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E17, S13, T60, T80, T84, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`, `docs/17-dashboard-proprietaire.md`.


## P09-E27 — Rapports

Statut : A_FAIRE. Dépendances : P08-GATE, P09-01.

**Livrables :** GET /reports/overview; POST /exports; GET /exports/:id; Tests et états UI de E27.

**Acceptation :**

- Réaliser le parcours Navigation Rapports → Table détail ; état job puis téléchargement autorisé
- Action : Afficher ou exporter ; champs/DTO et droits de la fiche respectés
- Données : export_jobs, sales, money_entries, stock_entries ; états et effets selon S13
- UI et API réelles, vide/erreur/chargement et recette du périmètre disponible ; assertions de domaines futurs explicitement reprises par les tâches transversales P07/P08/P10

**Références :** E27, S13, T54, T60, T80, T81, RSP01, RSP02, RSP03, RSP04, RSP05, RSP06, RSP07, SEC08, SEC09.

**Lire :** `docs/conception/03-fiches-ecrans.md`, `docs/conception/01-transitions.md`, `docs/api/contrats.md`, `docs/13-design-system.md`.


## P09-GATE — Valider la sortie P09

Statut : A_FAIRE. Dépendances : P09-01, P09-E17, P09-E27.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P10-01 — Recette complète et charge

Statut : A_FAIRE. Dépendances : P09-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Chaque T/RSP/SEC a une preuve ou inapplicabilité motivée
- Aucune fuite/erreur financière, charge mesurée et navigateurs/appareils listés

**Références :** T58, SEC14, SEC17, SEC19.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P10-02 — Préparer VPS et restaurer hors serveur

Statut : A_FAIRE. Dépendances : P09-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Ports externes/TLS/roles/secrets vérifiés sur cible autorisée
- PITR/objets restaurés, RPO/RTO mesurés et séquences rapprochées

**Références :** T59, SEC18, SEC19, SEC20, SEC21.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P10-GATE — Valider la sortie P10

Statut : A_FAIRE. Dépendances : P10-01, P10-02.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P11-01 — Formation et initialisation réelle

Statut : A_FAIRE. Dépendances : P10-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Comptes nominatifs et soldes validés avec provenance
- Production autorisée sans démo ; guide des limites offline remis

**Références :** T01, T61, T78, SEC07, SEC21.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P11-02 — Pilote puis généralisation

Statut : A_FAIRE. Dépendances : P11-01.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Un cycle boutique complet et écarts rapprochés avant extension
- Décision de généralisation et limites tracées ; pas de restauration aveugle

**Références :** T84.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P11-GATE — Valider la sortie P11

Statut : A_FAIRE. Dépendances : P11-01, P11-02.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.


## P12-01 — Maintenance et revue périodique

Statut : A_FAIRE. Dépendances : P11-GATE.

**Livrables :** Code, tests et preuve de recette du périmètre.

**Acceptation :**

- Runbook incidents, accès, correctifs et backlog de demandes opérationnel
- Contrôles de sauvegardes/restore trimestriels avec destinataire réel

**Références :** T59, SEC17, SEC19, SEC20, SEC21.

**Lire :** `docs/15-phases-developpement.md`, `docs/11-stack-et-strategie-tests.md`, `docs/14-securite-conception-et-recette.md`.


## P12-GATE — Valider la sortie P12

Statut : A_FAIRE. Dépendances : P12-01.

**Livrables :** Compte rendu de phase.

**Acceptation :**

- Preuves de chaque tâche du périmètre consignées, aucun défaut critique non résolu
- Mettre à jour IMPLEMENTATION_STATUS et matrice de couverture ; pas de validation implicite des assertions reportées

**Références :** .

**Lire :** `docs/15-phases-developpement.md`.
