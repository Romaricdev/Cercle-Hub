# Architecture et choix techniques

## Architecture de référence révisée

Le [complément technique et responsive](10-ajouts-techniques-et-responsive.md) fait autorité pour les ajouts du 24 septembre 2026. La phase reste documentaire.

- Next.js App Router, React compatible et TypeScript strict pour le web/PWA.
- NestJS avec adaptateur Fastify pour toute l’API métier, les permissions et la synchronisation.
- Prisma ORM et PostgreSQL ; migrations versionnées, contraintes et SQL paramétré ciblé pour les verrous si nécessaire.
- Redis et BullMQ pour les tâches différées, avec outbox PostgreSQL et consommateurs idempotents.
- Stockage S3 privé auto-hébergé sur VPS ; SeaweedFS retenu en P00, intégration à éprouver en P01.
- Dexie/IndexedDB, manifeste et service worker ; pas de dépendance à Background Sync pour garantir la livraison.
- Better Auth retenu en P00 pour identité/sessions, comptes créés par le propriétaire ; vérifier l’intégration NestJS/Fastify/Prisma.
- Tailwind CSS, shadcn/ui et Framer Motion sont choisis pour l’UI : voir [design et identité](12-identite-et-design-ui.md). Zod et React Hook Form restent proposés pour validation et formulaires.
- pnpm, tests unitaires, PostgreSQL réel sous Docker pour intégration et Playwright pour les parcours ; dernières versions stables compatibles, Node.js LTS, versions exactes verrouillées au bootstrap.
- Docker pour l’environnement interne ; Compose proposé aussi sur le VPS, avec volumes persistants et sauvegardes hors serveur.

## Structure cible

```text
apps/web/                Next.js, composants responsive, PWA, Dexie
apps/api/                NestJS/Fastify, contrôleurs et modules métier
apps/worker/             relais outbox et traitements BullMQ
packages/contracts/      DTO et validations partagés sans secrets
packages/database/       Prisma, migrations et accès transactionnels
packages/domain/         services partagés si requis par API et worker
infra/                   Docker Compose et configuration d’exploitation
tests/                   unitaires, intégration, E2E
docs/                    contrat de conception
```

Backend modulaire : identity, catalog, sales, cash, purchasing, inventory, finance, control, sync et reports. Les services ne dépendent ni de React ni d’une requête Next.js. Les pages n’écrivent pas directement en base. Contrôleurs NestJS et rejeu utilisent les mêmes services, avec mode ONLINE/OFFLINE_REPLAY explicite. Fastify est intégré à NestJS, sans serveur métier supplémentaire. Aucun microservice requis.

## Transaction de commande

1. Authentifier, valider le payload et la portée entreprise.
2. Ouvrir une transaction Prisma ; tous les accès concernés utilisent son client transactionnel, y compris le SQL de verrouillage.
3. Verrouiller clé d’idempotence ; même hash retourne le résultat déjà créé, hash différent donne 409.
4. Verrouiller ressources dans un ordre stable : boutique/session → client ou fournisseur → approbation → balances de stock triées → couches triées → comptes triés.
5. Vérifier versions, session, disponibilité et plafonds DANS la transaction.
6. Créer documents, écritures, projections, audit, résultat d’idempotence et outbox.
7. COMMIT ; envoyer réponse. En erreur ROLLBACK. Aucun appel réseau tiers dans la transaction.

Isolation READ COMMITTED avec verrous explicites et contraintes. Rejouer au maximum trois fois deadlock/serialization failure avec même clé. Pas de retry aveugle d’une erreur métier. Le même client transactionnel doit servir à toute la transaction. Vérifier et documenter les API de transaction/isolation de la version stable Prisma retenue ; ne pas transposer aveuglément une API d’une autre version.

Création balance manquante : INSERT ON CONFLICT DO NOTHING puis SELECT FOR UPDATE pour éviter le verrou d’une ligne inexistante. Projection + journal toujours dans même transaction. Exports longs en lecture seulement, pas de verrou transactionnel prolongé.

## Concurrence et fermeture de caisse

Vente, dépense, remise reçue et clôture verrouillent toutes la même session avant effets cash. Une clôture passe OPEN→COUNTING, ce qui bloque toute nouvelle écriture de caisse. Soumission compte et passage CLOSED sont atomiques. Annulation de comptage avant soumission rend OPEN, sans révéler attendu. Une déconnexion ne doit pas annuler implicitement COUNTING.

## Reporting et tâches

Lectures depuis journaux/projections PostgreSQL, pas de chiffres fictifs calculés dans composants. Endpoint gérant sélectionne uniquement les champs permis. L’outbox PostgreSQL alimente BullMQ après commit pour notifications, PDF et alertes. Le relais utilise une acquisition exclusive (par exemple lease avec `FOR UPDATE SKIP LOCKED`) ; reprise après arrêt et publication en double prévues. Les consommateurs dédupliquent durablement leurs effets. Tentatives bornées et échecs visibles propriétaire/support. Redis ne conserve pas seul un fait métier officiel.

Pas de WebSocket obligatoire. Refetch après mutation et toutes les 30 secondes en fenêtre visible. Rapports affichent `asOf` et dernière synchronisation par boutique.

## Sources techniques

Voir les [sources et critères de compatibilité du complément](10-ajouts-techniques-et-responsive.md). Les invariants transactionnels décrivent le résultat à garantir et restent à vérifier sur PostgreSQL réel avec les versions choisies. Aucun test logiciel n’a été exécuté à ce stade.

## Stack de tests

Voir [11-stack-et-strategie-tests.md](11-stack-et-strategie-tests.md) : Vitest, React Testing Library, NestJS Testing/Fastify inject, services réels sous Docker et Playwright.
