# Stack et stratégie de tests

Date : 24 septembre 2026. Décisions de conception pour Codex et Cursor. Aucun outil installé ni test applicatif exécuté à ce stade. Appliquer les dernières versions stables compatibles puis les verrouiller selon [le document 10](10-ajouts-techniques-et-responsive.md).

## Outils retenus

| Niveau | Stack | Usage |
|---|---|---|
| Unitaire métier et backend | Vitest, `@nestjs/testing` pour les services avec injection | Calculs, arrondis, règles de décision, transitions et autorisations ; environnement Node |
| Composants web | Vitest, React Testing Library, `@testing-library/user-event`, `@testing-library/jest-dom`, jsdom | Comportement observable des formulaires et composants interactifs ; environnement DOM séparé |
| Intégration API | Vitest, `@nestjs/testing`, Fastify `inject()` | Application NestJS initialisée avec son vrai adaptateur, validation, guards, sérialisation et services |
| Intégration infrastructure | Docker Compose de test, PostgreSQL, Redis et stockage S3 retenu | Prisma/migrations réels, verrous, concurrence, outbox, BullMQ et pièces jointes |
| End-to-end navigateur | `@playwright/test` | Parcours complets web → API → base et worker si nécessaire, responsive et hors connexion |
| Couverture unitaire | `@vitest/coverage-v8` | Rapports texte, HTML et LCOV ; identifier les branches critiques non exercées |

Un seul runner unitaire, Vitest, pour le projet. Ne pas ajouter Jest ou Cypress en parallèle sans besoin documenté. Docker Compose est le mécanisme initial d’infrastructure de test ; Testcontainers pourra être évalué ultérieurement si l’isolation devient difficile, sans être une dépendance obligatoire.

Vérifier au lot 0 le transformateur TypeScript et les métadonnées de décorateurs requis par la version NestJS retenue avec Vitest. Ne pas déduire qu’un test de fonctions pures suffit à valider l’injection NestJS. Les pages Next.js impliquant le rendu serveur asynchrone sont couvertes par Playwright ; tester séparément leurs fonctions pures sans forcer leur rendu dans jsdom.

## Séparation des responsabilités

### Tests unitaires

Pas de réseau, base ou Redis. Doubles uniquement aux frontières externes, fixtures explicites, horloge contrôlée si utile. Cibler les résultats métier : montants entiers, répartitions de remise, conversions, variance de caisse, plafonds, transitions interdites, retours et règles d’allocation. Éviter les tests qui reproduisent ligne par ligne l’implémentation ou ne vérifient que l’appel d’un mock.

Pour l’UI, sélectionner les éléments par rôle et nom accessible ; vérifier saisie, erreurs, navigation clavier et actions permises. jsdom ne valide pas la disposition responsive : celle-ci relève du navigateur réel.

### Tests d’intégration

Utiliser PostgreSQL réel, jamais SQLite en remplacement pour les preuves de transaction/concurrence. Appliquer les migrations sur base vide ; vérifier aussi une migration depuis le schéma précédent lorsqu’il existe. Utiliser le même modèle de données et les mêmes services que la production.

Cas obligatoires : rollback complet vente/stock/caisse, commandes concurrentes sur dernier stock, concurrence vente/clôture, idempotence avec même clé et avec payload différent, isolation des boutiques, absence du montant attendu dans les réponses gérant avant soumission.

Fastify `inject()` couvre la chaîne HTTP interne après initialisation de Nest et disponibilité de Fastify. Cela ne teste pas le reverse proxy/TLS : prévoir un smoke test du déploiement cible avant pilote.

Avec Redis et worker réels : publication outbox, reprise après panne, publication répétée et absence de double effet durable. Avec S3 réel : droits privés, envoi/lecture autorisés, refus interboutique, rattachement après confirmation et gestion d’un échec d’envoi. Ne pas remplacer ces preuves par des mocks.

### Tests end-to-end

Lancer les builds de production Next.js/API contre les services de test isolés ; worker réel pour les scénarios différés. Aucun mock de l’API métier pour les parcours d’acceptation. Des réponses simulées sont possibles dans une suite UI distincte pour provoquer des erreurs rares, sans les présenter comme validation du workflow complet.

Parcours prioritaires : connexion des deux rôles ; vente et reçu ; demande/validation/achat/réception par gérant ; achat propriétaire/transfert/réception gérant ; dépense ; comptage aveugle et écart ; retour ; permissions ; synchronisation hors connexion sans doublon.

Playwright : Chromium pour la suite complète initiale, puis parcours critiques aussi sur Firefox et WebKit. Émulation téléphone/tablette et largeurs RSP01 à RSP10 du document 10. WebKit n’est pas une preuve d’exécution sur Safari iPad : compléter par les appareils réels et navigateurs précisément retenus dans la matrice de support.

Hors connexion : couper/restaurer le réseau du contexte navigateur, vérifier persistance IndexedDB après rechargement, séquences et reprise sans doublon. Ne pas bloquer les service workers dans la suite PWA. Vérifier également côté serveur qu’une commande rejouée n’a produit qu’un seul effet. La veille système, le clavier mobile et les politiques de stockage demandent des essais matériels complémentaires.

## Isolation et fiabilité

- Environnement dédié par exécution ou worker de test : base/schéma, files Redis et buckets/préfixes distincts, données synthétiques uniquement.
- Garde-fou obligatoire avant nettoyage : configuration explicitement de test, cible vérifiée, aucun accès aux secrets ou bases de production. Le simple nom d’une base ne suffit pas comme protection.
- Fixtures reproductibles : propriétaire, gérants de boutiques différentes, produits, fonds et stocks connus ; scénarios indépendants de leur ordre.
- Fermer clients Prisma, applications NestJS, workers et connexions Redis après les suites.
- Utiliser les attentes observables Playwright et des attentes bornées sur jobs ; pas de temporisations arbitraires pour masquer une course.
- Traces et captures Playwright à l’échec, rapports JUnit/HTML pour la CI. Éviter les données sensibles dans les artefacts ; n’utiliser que des comptes de test.
- Un retry diagnostique ne transforme pas un test instable en preuve acceptable : documenter et corriger les flakies sur les parcours critiques.

## Commandes à créer au lot 0

| Commande | Contrat |
|---|---|
| `pnpm test` | Alias de la suite unitaire en exécution unique, sans mode watch |
| `pnpm test:unit` | Tests Vitest métier/backend et composants, configurations séparées Node/DOM |
| `pnpm test:unit:watch` | Mode interactif local |
| `pnpm test:coverage` | Couverture Vitest avec V8 |
| `pnpm test:integration` | API/infrastructure réelles sur environnement dédié, erreurs si prérequis absents |
| `pnpm test:e2e` | Parcours Playwright Chromium contre la stack de test |
| `pnpm test:e2e:cross-browser` | Parcours critiques Chromium/Firefox/WebKit |
| `pnpm test:e2e:responsive` | Scénarios responsive et formats définis dans RSP |
| `pnpm test:e2e:offline` | Scénarios PWA et synchronisation, ajoutés au lot hors connexion |

Ces commandes sont un contrat futur, pas des scripts déjà disponibles. Documenter démarrage/arrêt de l’infrastructure, migrations et fixtures dans le README applicatif. Le runner doit échouer clairement si l’environnement est indisponible, sans déclarer la suite passée ou ignorer silencieusement les tests.

## Validation et livraison

Chaque lot exécute lint, typecheck, tests unitaires, build et suites d’intégration/E2E applicables aux changements. Toute correction d’un défaut critique de calcul, stock, autorisation ou synchronisation ajoute un test de non-régression utile. Pas de pourcentage global arbitraire remplaçant la recette : toutes les branches métier critiques et erreurs connues doivent être couvertes explicitement, avec rapport pour repérer les lacunes.

En CI avant intégration : lint/typecheck, unitaires, build, intégration et E2E critiques disponibles. Avant livraison/pilote : suite complète disponible, parcours critiques multi-navigateurs, responsive et essais matériels prévus. Ne pas répéter une suite coûteuse sans changement ou risque nouveau.

Relier les tests aux références T01 à T84 et RSP01 à RSP10 dans leurs noms ou métadonnées ; un scénario peut être couvert à plusieurs niveaux, sans dupliquer inutilement tous ses détails. Consigner commandes, résultats, cas non exécutés et raisons dans [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Les contrôles Python de documentation et d’arithmétique ne sont pas des tests de l’application.

## Références officielles

- [Tests NestJS et injection Fastify](https://docs.nestjs.com/fundamentals/testing)
- [Vitest avec Next.js](https://nextjs.org/docs/app/guides/testing/vitest)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Couverture Vitest](https://vitest.dev/guide/coverage)
- [Playwright avec Next.js](https://nextjs.org/docs/app/guides/testing/playwright)
- [Émulation Playwright](https://playwright.dev/docs/emulation)

## Recette sécurité

Compléter les suites par [SEC01 à SEC21](14-securite-conception-et-recette.md), analyses de secrets/dépendances/images et scan dynamique contrôlé en recette. Les outils sécurité et contrôles manuels complètent Vitest/Playwright. Aucun scan actif de production ou tiers implicitement autorisé.
