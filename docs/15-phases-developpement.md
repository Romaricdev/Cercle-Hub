# Feuille de route de développement — Cercle Complet Sarl

## Statut et mode d’emploi

Plan établi le 24 septembre 2026. Aucun développement commencé. Ce document remplace le découpage opérationnel historique en lots 0 à 7 ; les références à ces lots dans les anciens documents restent interprétables via la correspondance en fin de fichier. Les fonctionnalités, règles et critères de recette ne sont pas réduits par ce nouveau découpage.

Lire AGENTS.md, les décisions et règles métier, puis les fiches E01–E40 et les documents 10 à 14. Réaliser les phases dans l’ordre des dépendances. À l’intérieur de chaque phase, travailler par parcours complet : données/migration → service et permissions → API → interface → tests → documentation. Éviter un backend entier sans interface vérifiable, ou tous les écrans remplis de données fictives avant les règles métier.

Le début de l’implémentation reste soumis à une instruction explicite du porteur. Une fois le développement autorisé pour un périmètre, avancer dans ce périmètre sans redemander une autorisation à chaque tâche réversible. Les critères de passage sont des preuves techniques, pas des demandes de validation administrative systématiques. Déploiement public, souscription ou mise en service restent dans leur périmètre d’autorisation propre.

## Vue d’ensemble

| Phase | Objectif | Dépendance |
|---|---|---|
| P00 | Préparer les décisions et le backlog exécutable | Documentation existante |
| P01 | Installer le socle technique et les tests | P00 |
| P02 | Sécuriser les accès et construire l’interface commune | P01 |
| P03 | Initialiser boutiques, catalogue, fonds et stocks | P02 |
| P04 | Réaliser les ventes et encaissements en ligne | P03 |
| P05 | Gérer dépenses, mouvements de fonds et clôture aveugle | P04 |
| P06 | Réaliser les deux circuits de réapprovisionnement | P05 |
| P07 | Gérer crédit, retours, inventaires et passations | P06 |
| P08 | Activer et éprouver le hors connexion | P07 ; protocole préparé dès P01/P04 |
| P09 | Finaliser supervision, rapports et exports | P08 ; vues utiles livrées dès les phases métier |
| P10 | Valider la recette complète et préparer le VPS | P09 |
| P11 | Piloter puis mettre en production | P10 et autorisation du périmètre de déploiement |
| P12 | Maintenir, surveiller et faire évoluer | P11 |

Pas d’estimation calendaire inventée : estimer les tâches après décomposition P00 et recalibrer selon les premières phases. Chaque phase peut comporter plusieurs itérations ; ne pas la déclarer terminée sur la seule présence des fichiers.

## P00 — Préparation de réalisation

**But :** rendre le démarrage reproductible sans réouvrir les choix déjà validés.

Travaux : inventorier les versions stables compatibles et dépendances ; confirmer l’intégration auth/MFA NestJS/Fastify/Prisma et le fournisseur S3 (SeaweedFS recommandé). Consigner les arbitrages dans des décisions techniques datées. Identifier les dimensions/navigateurs cibles, les données client disponibles et celles collectées par l’assistant d’initialisation. Définir les contrats du transport en ligne/hors ligne et les frontières web/API/worker avant le code.

Décomposer chaque phase en tâches à identifiant stable, avec critères d’acceptation, dépendances, écrans E, transitions S et tests T/RSP/SEC. Dresser un inventaire de couverture des 40 écrans et 84 scénarios pour éviter les oublis. La matrice conception reste la source de ces références ; ne pas inventer une correspondance à partir du titre d’un écran.

**Livrables :** registre des versions et décisions, backlog par phase, matrice de couverture initiale, liste des informations d’exploitation encore manquantes.

**Passage :** aucune contradiction bloquante sur argent/stock/droits ; choix nécessaires à P01/P02 tranchés ou tâche de vérification bornée identifiée. Domaine et coordonnées réelles peuvent rester à renseigner jusqu’à la préparation d’exploitation. Aucun abonnement requis pour clore P00.

## P01 — Socle technique et qualité

**But :** pouvoir lancer et tester le projet localement à partir d’un environnement propre.

Créer le monorepo web Next.js, API NestJS/Fastify et worker ; TypeScript strict, contrats partagés, Prisma et migrations. Docker Compose pour PostgreSQL, Redis et stockage S3 retenu ; configuration test isolée, secrets factices uniquement dans exemples. Préparer outbox/inbox, idempotence, journalisation et interfaces de transactions sans simuler des opérations métier terminées.

Configurer Vitest Node/DOM, React Testing Library, tests NestJS/Fastify et Playwright, lint/typecheck/build et CI. Isoler données synthétiques et production. Configurer scans secrets/dépendances/images et healthchecks minimaux. Préparer les migrations futures et le transport séquencé des commandes pour éviter une refonte lors de P08.

**Livrables :** dépôt exécutable, commandes documentées, migrations initiales, fixture de test, preuve de démarrage web/API/worker et communication DB/queue/S3.

**Passage :** installation reproductible, lint/typecheck/build et tests de socle passent, migration base vide réussie, aucune dépendance cachée à un service de production. Un smoke test ne vaut pas validation des workflows futurs.

## P02 — Accès sécurisés et design system

**But :** le propriétaire et un gérant de test peuvent se connecter et naviguer dans leur espace autorisé.

Implémenter sessions, création/activation de comptes, récupération, MFA propriétaire, affectations et cycle d’approbation d’appareil. Permissions par défaut fermées, CSRF/CORS, protections XSS/CSP, limites anti-abus et logs filtrés. Tester le cycle appareil PENDING→ACTIVE avant ouverture, sans capacité hors ligne prématurée.

Construire tokens Tailwind, composants shadcn/ui et transitions Motion, Manrope/Inter locales, thèmes clair/sombre/système, navigation responsive et états vide/erreur/chargement. Respecter les bordures limitées. Préparer les déclinaisons du logo validé nécessaires à l’interface, sans changer sa direction. Aucun dashboard rempli de faux chiffres en production.

**Livrables :** connexion des deux rôles, gestion des comptes/appareils, composants et shell utilisables sur téléphone/tablette/ordinateur.

**Passage :** T02 et T61 selon leur périmètre ; tests SEC d’authentification, permissions et navigateur applicables ; RSP sur shell/formulaires, bascule de thème sans perte d’état. MFA et récupération exercés sur comptes de test. Les tests de permissions sont étendus à chaque nouvelle route ensuite.

## P03 — Boutiques, catalogue et initialisation

**But :** préparer une boutique avec des soldes de départ cohérents, sans activité commerciale fictive.

Installer sur `/owner` la structure définitive du dashboard décisionnel décrite dans le document 17 : contexte boutique, période, fraîcheur, alertes et emplacements d’indicateurs. À ce stade seuls les blocs alimentés par l’initialisation, les boutiques, les fonds et le stock initial sont actifs. La même route passe de `SETUP` à `EMPTY` après initialisation ; aucun composant ne simule les domaines futurs.

Créer plusieurs boutiques et leur gérant unique, produits/variantes, unités/conversions, prix, lots/péremption, options activables et dépôt facultatif. Créer dès maintenant les journaux, comptes, balances et couches de coût nécessaires. Assistant d’initialisation : fonds, stocks physiques, coûts et dettes initiales selon les permissions. Une préparation pouvant durer plusieurs jours, le propriétaire peut comptabiliser plusieurs lots successifs, chacun atomique, idempotent, immuable et audité. Un lot validé n’est jamais réédité : tout complément crée une nouvelle version et de nouvelles écritures. L’activation de la boutique clôture la période d’initialisation et interdit tout nouveau lot d’ouverture. Les créances initiales ne génèrent pas de faux chiffre d’affaires.

**Livrables :** configuration simple puis avancée, catalogue exploitable et soldes initiaux audités.

**Passage :** T01, T10–T13, T57, T66 et partie initialisation de T78 ; contraintes, décimales, permissions et migrations vérifiées. Les règlements de T78 seront complétés en P07. Options désactivées restent simples à comprendre.

## P04 — Vente et encaissement en ligne

**But :** vendre réellement avec mise à jour atomique du stock et des fonds.

Ouvrir une session ; rechercher/ajouter produits, choisir quantités, remises autorisées et paiements immédiats/multiples selon spécification. Calculer prix, coûts et montants serveur, poster la vente avec stock/encaissement/audit/idempotence. Reçu imprimable et historique réel. Le paiement manuel déclaré ne constitue pas une intégration bancaire automatique.

Employer dès cette phase le contrat séquencé et les preuves ONLINE prévus ; préparer l’interface de stockage local sans prétendre que le mode offline est actif. Tester refus de validation suivi d’une commande valide. UI caisse adaptée aux trois formats.

**Livrables :** premier parcours complet ouverture→vente→reçu→consultation des effets.

**Passage :** T03–T09, T14–T15, T58, T62–T63 et T81 pour les ventes concernées ; rollback et concurrence sur stock/session, absence de double vente, règles de date d’activité ; tests RSP caisse. La clôture complète est livrée en P05 : pas encore de pilote boutique réelle.

## P05 — Caisse, dépenses et clôture aveugle

**But :** terminer une journée et expliquer toute variation de fonds.

Demandes et validations de dépenses, plafonds, apports/remises/transit/réceptions fractionnées, justificatifs privés et première intégration de quarantaine/antivirus. Distinguer autorisation et mouvement effectif. Implémenter comptage aveugle, verrouillage de session, différence déclarée-attendue, dossier d’écart, corrections liées et ouverture suivante sur le déclaré.

Le socle de pièces jointes sécurisé est requis dès qu’une dépense en dépend, sans attendre P06. Les actions successives du propriétaire et du gérant respectent l’autorité d’écriture de la caisse.

**Livrables :** parcours journée complète vente→dépense→comptage→écart→nouvelle session.

**Passage :** T23–T26, T29–T30, T37–T41, T65 et tests de fichiers applicables. Attendu absent des DTO avant comptage, concurrence vente/clôture correcte, première déclaration conservée. Scans des fichiers et droits de lecture effectifs, pas seulement interface de dépôt.

## P06 — Réapprovisionnement, achats et transferts

**But :** livrer les deux circuits validés sans confusion entre approbation, paiement et acquisition physique.

Circuit A : gérant demande → propriétaire approuve budget/quantités → gérant achète et acquiert → paiements/réception/justificatifs rapprochés. Circuit B : propriétaire achète → répartit/expédie → gérant confirme réception. Fournisseurs, frais d’acquisition, fonds, livraisons partielles, reliquats, transit, manquants/surplus et quarantaine métier (distincte de la quarantaine antivirus).

Réutiliser stockage privé et approbations ; conserver les versions des demandes et les consommations après révision. Affecter les coûts aux bonnes couches sans doubler stock ou charges. Le moteur de dettes fournisseur peut être posé ici ; son interface de règlements et cas avancés est finalisée en P07.

**Livrables :** deux parcours de bout en bout et traçabilité de chaque achat jusqu’à la réception.

**Passage :** T27–T28, T31–T33, T60 selon ses assertions, T68–T69, T71–T73 ; réception concurrente sans dépassement, justificatif global non divulgué au gérant, frais et valorisation cohérents.

## P07 — Crédit, retours et contrôle des stocks

**But :** couvrir les corrections et les cycles financiers au-delà de la vente immédiate.

Itération P07-A : crédit client/fournisseur optionnel, créances/dettes, règlements/allocation, échéances et abandon autorisé ; initialisation et désactivation d’options avec soldes existants.

Itération P07-B : retours client/fournisseur, remboursements approuvés, avoirs, retours partiels cumulés et reprises après abandon ; pas de réécriture de vente d’origine.

Itération P07-C : inventaires, recomptages, pertes/casse, couches non vendables, passation gérant, suspension SETTLEMENT/SECURITY et fermeture boutique.

**Livrables :** cycles crédit/règlement et contrôle des écarts complets, options avancées activables sans surcharger le quotidien.

**Passage :** T16–T22, T34–T36, T42–T44, T55–T56, T67, T70, T74–T79, T82–T83. Pas de dette comptée comme nouvelle vente au règlement ; pas de double sortie pour articles déjà manquants ; conflits de session et droits testés.

## P08 — Hors connexion et reprise

**But :** fonctionner temporairement sans réseau dans le périmètre autorisé, puis se rapprocher fidèlement.

Dexie/IndexedDB transactionnelle, service worker, installation PWA, capacité limitée, file locale, séquences, inbox et reprise. Autoriser uniquement les opérations prévues au document 05. Une seule voie ordonnée pour commandes en ligne et offline ; suspendre/reprendre le canal selon le protocole. Comptage/clôture différée, traitement des rejets et examen des faits ambigus, révocation et remplacement d’appareil.

Préserver la file lors de mise à jour, réveil, expiration ou déconnexion. Distinguer local/en attente/confirmé/refusé/à examiner. Afficher fraîcheur de chaque boutique sans inventer le nombre d’opérations que le serveur ne connaît pas.

**Livrables :** parcours coupure→ventes autorisées→fermeture/réouverture→reconnexion→confirmation unique et écran de rapprochement.

**Passage :** T45–T52, T64, T80 et reprise T61–T63/T74 dans le contexte offline ; RSP08–RSP10, SEC16 et intégrité/replay. Tests serveur + navigateur, puis veille/reprise sur matériel réel. Pas de promesse d’effacement distant instantané d’une tablette déconnectée.

## P09 — Supervision, rapports et exports

**But :** fournir une vue globale et par boutique fondée sur les écritures réelles.

Finaliser dashboards, filtres/périodes, détails des indicateurs, coûts/marges autorisés, suivi achats/stock/écarts, alertes et centre des tâches. Exports CSV/PDF par worker, autorisations au téléchargement et expiration. Vérifier cohérence des agrégats, date d’activité, fraîcheur et indisponibilité explicite.

Finaliser `/owner` comme entrée décisionnelle unique selon le document 17 : ventes, encaissements, créances, dépenses, résultat brut estimé, stock disponible et valorisé, comparaison des boutiques, écarts, décisions, alertes, tendances et activité récente. Les états `STALE` et `PARTIAL` indiquent la couverture réelle ; aucun manque de données n’est présenté comme zéro.

Les historiques et informations nécessaires au travail quotidien sont déjà livrés avec P03–P08 ; cette phase les consolide, elle ne reporte pas toutes les lectures utiles à la fin.

**Livrables :** supervision réseau et boutique, rapports traçables jusqu’aux documents sources, exports privés.

**Passage :** T53–T54, T59–T60 selon périmètre, T80–T81 et scénario complet T84. Vérifier tous les indicateurs de l’exemple de référence, export sans formule injectée et états de queue/échec réels. Contrôler clair/sombre et graphiques accessibles.

## P10 — Recette générale et préparation d’exploitation

**But :** prouver que l’application est prête pour un pilote contrôlé.

Exécuter les 84 scénarios métier et les critères RSP/SEC applicables ; vérifier chaque écran E01–E40 et workflow S de la matrice. Contrôles de concurrence, charge, navigateur, appareils réels, compatibilité migrations et mise à jour offline. Corriger les régressions sans reporter les défauts critiques à la production.

Préparer configuration VPS/proxy/TLS, limites ressources, comptes de service, sauvegardes hors serveur/PITR, restauration, alertes et procédures incident/rotation. Scans actifs uniquement sur environnement autorisé de recette. Préparer guides courts propriétaire/gérant et procédures démarrage/arrêt/déploiement/retour applicatif. Identifier responsable d’exploitation et informations nécessaires avant production.

**Livrables :** rapport de recette avec preuves et défauts restants, configuration de livraison, restauration chronométrée, matrice appareils/navigateurs et guide utilisateur.

**Passage :** aucune anomalie critique d’accès, argent, stock ou perte de données ; critères bloquants du document 14 satisfaits, MFA prêt, fichiers privés, RPO/RTO mesurés. Une ligne non applicable doit être justifiée, pas ignorée. Les objectifs non atteints sont corrigés ou font l’objet d’un arbitrage explicite documenté ; ne pas déclarer la recette complète si des tests requis restent non exécutés.

## P11 — Pilote et mise en production

**But :** passer à l’usage réel de façon vérifiable.

Dans le périmètre de déploiement autorisé : préparer production sans données démo, comptes nominatifs et MFA. Faire une répétition sur trois boutiques de test et former les utilisateurs. Initialiser stocks/fonds/dettes à partir de comptages validés et conserver leur provenance.

Pilote réel recommandé : une boutique pendant au moins un cycle ouverture/vente/réapprovisionnement/clôture/reprise, puis extension aux deux autres après résolution des anomalies. Choisir le moment de bascule et préciser la source de référence pour éviter deux systèmes modifiant concurremment les mêmes soldes. Suivre les incidents et comparer documents/compteurs/exports aux faits disponibles.

**Livrables :** procès-verbal de démarrage, soldes initiaux validés, suivi du pilote et accès aux sauvegardes/alertes opérationnels.

**Passage :** parcours critiques confirmés avec les utilisateurs, écarts expliqués, aucun défaut bloquant, décision de généralisation tracée. En cas d’échec, suspendre les écritures concernées et rapprocher les événements avant retour ; une restauration aveugle ne doit pas effacer des ventes déjà réalisées.

## P12 — Exploitation et évolution continue

**But :** conserver la fiabilité après livraison.

Surveiller jobs/synchronisation/sauvegardes/espace/erreurs et alertes sécurité ; appliquer correctifs testés, vérifier sauvegardes et restauration trimestrielle, revoir les accès lors des passations. Prioriser évolutions et retours utilisateurs avec critères d’acceptation, migration et tests de non-régression. Ne pas ajouter une fonctionnalité qui contourne la traçabilité pour résoudre un incident.

**Livrables récurrents :** journal de versions, suivi incidents et vulnérabilités, preuves de restauration, backlog actualisé. Cette phase est continue, pas une liste de tâches déjà exécutées ni une automatisation programmée par ce document.

## Règles transversales de passage

Pour chaque tâche : références métier/écrans → contrat et données → implémentation → tests proportionnés → revue de résultat → statut. Chaque phase UI inclut clair/sombre/système, bordures limitées, responsive, clavier/tactile et états d’erreur. Chaque phase métier inclut permissions serveur, audit, idempotence, transactions et tests négatifs.

Exécuter lint/typecheck/build et suites applicables ; ne pas répéter toutes les suites coûteuses sans modification ou risque nouveau. Rejouer les suites complètes lors des jalons d’intégration qui le justifient, notamment P10. Les contrôles documentaires ne remplacent jamais les tests logiciels.

Statuts autorisés : NON COMMENCÉE, EN COURS, À CORRIGER, VALIDÉE TECHNIQUEMENT, BLOQUÉE (dépendance précise). P12 peut être EN EXPLOITATION. Un statut contient date, preuves, défauts et prochaine action. « Code écrit » sans tests requis n’est pas une phase validée. La validation client/pilote reste distincte de la validation technique.

## Correspondance avec les anciens lots

| Ancien lot | Nouvelles phases |
|---|---|
| 0 Socle | P00–P02 |
| 1 Catalogue | P03 |
| 2 Ventes | P04 |
| 3 Caisse | P05 |
| 4 Achats | P06 ; fichiers communs démarrés P05 |
| 5 Crédit et stock | P07 |
| 6 Hors connexion | P08 ; contrats préparés P01/P04 |
| 7 Rapports et exploitation | P09–P12 |

Les références T de chaque phase guident la réalisation ; la couverture exhaustive des 84 scénarios, 40 écrans, 10 RSP et 21 SEC doit être maintenue dans le suivi. Un cas transversal peut être validé progressivement sur plusieurs phases, avec assertions restantes explicitement indiquées.

## Instructions de reprise pour Codex/Cursor

Une fois le développement autorisé : lire AGENTS.md, ce plan et IMPLEMENTATION_STATUS ; reprendre la première tâche non terminée dont les dépendances sont satisfaites. Consigner ce qui existe réellement, les commandes exécutées et les problèmes. Ne pas recréer un socle déjà fonctionnel, ne pas sauter au lot suivant pour contourner une erreur, ne pas déclarer toutes les phases livrées après quelques écrans.

Formulation possible pour lancer un périmètre : « Suis AGENTS.md et docs/15-phases-developpement.md. Réalise les phases P00 et P01, vérifie leurs critères de sortie et mets à jour docs/IMPLEMENTATION_STATUS.md. Ne commence pas P02 dans cette demande. » Cet exemple n’est pas une autorisation de démarrage à lui seul.
