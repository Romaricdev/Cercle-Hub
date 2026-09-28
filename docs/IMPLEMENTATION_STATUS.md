# État d’implémentation

Mise à jour : 26 septembre 2026. P00 documentaire et P01–P04 réalisées localement. P04-GATE est terminé ; P05–P12 ne sont pas commencées.

Plan actif : [phases P00 à P12](15-phases-developpement.md). Les livrables P00 sont disponibles dans [docs/p00](p00/README.md). La rédaction du backlog ne vaut pas implémentation des tâches.

## Complément P03 — médias produit et refonte de gestion

Le catalogue accepte une image principale JPEG, PNG ou WebP (750 Ko maximum), stockée dans le bucket S3 privé et servie par une route authentifiée. La migration `20260925144000_p03_product_images` a été appliquée localement. Le catalogue utilise un assistant séquentiel avec prévisualisation réelle et une vue visuelle des produits. Une fiche produit de consultation regroupe identité, image, famille, options de suivi, variantes, formats, prix courants et stock réel détaillé par variante et lieu, avec accès séparé à la modification. La fiche boutique expose état, responsable, progression d’initialisation, lieux et actions sensibles structurées.

Vérifications exécutées après ce complément : lint réussi, typecheck monorepo réussi, tests unitaires 19/19 et migration locale réussie. La suite d’intégration n’a pas démarré ses tests : son processus enfant a résolu Node 24.14.0 alors que le dépôt exige >=24.21.0 <25. Cette limite reste ouverte et n’est pas présentée comme une réussite.

| Phase | État | Preuves / prochaine action |
|---|---|---|
| P00 — Préparation et backlog | VALIDÉE DOCUMENTAIREMENT | Registre de décisions/versions, 72 tâches et 170 références ; contrôles documentaires passés, compatibilité runtime à éprouver en P01 |
| P01 — Socle technique et qualité | RÉALISÉE LOCALEMENT | Commandes de socle exécutées sur Node 24.21.0 ; limites listées dans le compte rendu P01 |
| P02 — Accès sécurisés et design system | RÉALISÉE LOCALEMENT ; P02-GATE TERMINÉ | Preuves dans le compte rendu P02 et la stabilisation SEC12 ci-dessous |
| P03 — Boutiques, catalogue et initialisation | RÉALISÉE LOCALEMENT ; P03-GATE TERMINÉ | Migrations, API, écrans et recette locale décrits dans le compte rendu P03 |
| P04 — Ventes en ligne | RÉALISÉE LOCALEMENT ; P04-GATE TERMINÉ | Vente gérant, historique et fiche propriétaire, dashboard commercial P04 et recette locale ; P05 non commencée |
| P05 — Caisse, dépenses et clôture | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |
| P06 — Achats et réapprovisionnement | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |
| P07 — Crédit, retours et inventaires | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |
| P08 — Hors connexion | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |
| P09 — Supervision et rapports | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |
| P10 — Recette générale et préparation VPS | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |
| P11 — Pilote et production | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |
| P12 — Exploitation continue | NON COMMENCÉE | Aucun livrable applicatif ; démarrage non autorisé |

Les contrats métier hors accès restent des spécifications. P02 ajoute l’authentification utilisable, les dashboards d’administration et les appareils, sans ventes ni caisse.

## Ajouts documentaires 2.2

Ce paragraphe décrit l’état au moment de l’ajout documentaire, avant le socle P01. Stack et déploiement révisés ; exigences responsive, tablettes/PWA et versions documentées dans `10-ajouts-techniques-et-responsive.md`. Anciennes consignes sans ORM/Redis remplacées. SeaweedFS et Better Auth étaient encore des propositions à cette date.

Stack de tests documentée dans `11-stack-et-strategie-tests.md` : Vitest/Testing Library, intégration Docker et Playwright. Configurations et suites applicatives non créées ; résultats de test applicatif toujours inexistants.

Identité Cercle Complet Sarl et stack Tailwind CSS/shadcn/ui/Framer Motion documentées dans le document 12 ; logo PNG V1 créé comme proposition graphique. Aucun développement applicatif ni test logiciel réalisé.

## Validation visuelle ultérieure

Le porteur a validé le logo V1 puis Manrope/Inter, la palette bleu vif/vert citron et les thèmes clair/sombre, avec bordures limitées. Référence : `13-design-system.md`. Cette validation remplace le statut de proposition mentionné plus haut. Déclinaisons du logo non produites ; aucun composant ni test UI implémenté.

## Référentiel sécurité

Document 14 ajouté : politiques techniques détaillées et SEC01 à SEC21, toutes au statut prévu. Anciennes mentions PostgreSQL géré, mot de passe 12 caractères et MFA différé remplacées. MFA propriétaire requis avant données réelles. Aucun contrôle applicatif, scan ou restauration exécuté à ce stade.

## Modèle de compte rendu à renseigner pendant la réalisation

- Phase et tâche stable :
- Date / statut :
- Objectif et dépendances :
- Références E / S / T / RSP / SEC :
- Fichiers, migrations et livrables réellement produits :
- Commandes exécutées et résultats :
- Tests requis non exécutés et raison :
- Défauts / risques / blocages :
- Critères de sortie satisfaits et restants :
- Prochaine tâche :
- Validation technique / validation pilote (distinctes) :

## Matrices de suivi à remplir dès P00

Inventorier E01–E40, T01–T84, RSP01–RSP10 et SEC01–SEC21 avec phase responsable, statut, fichier de test/preuve et assertions restantes. Le catalogue et les matrices de conception existants servent de point de départ ; ne pas déclarer leur couverture applicative acquise. Les contrôles Python de documentation ont passé lors de la rédaction du plan, sans exécution de code métier.

## Compte rendu P00 — 24 septembre 2026

Périmètre demandé : préparer les décisions et le backlog exécutable. Décisions sous délégation : Better Auth avec pont Fastify, Prisma stable 7.10.0, PostgreSQL 18.6, SeaweedFS S3, origine unique et contrat de commande durable. Versions candidates relevées directement dans le registre npm, sans installation ; Node LTS et releases services vérifiés sur sources officielles.

Livrables : [dossier P00](p00/README.md), backlog JSON/Markdown de 72 tâches, matrice de 170 références (40 E, 15 S, 84 T, 10 RSP, 21 SEC), informations client à collecter, gates d’intégration P01 et corrections de cohérence documentaire.

Vérifications exécutées sur la copie de revue avant écriture dans le projet :

- `python scripts/check_docs.py` : liens, fiches et références valides (38 documents contrôlés).
- `python scripts/check_design_examples.py` : exemples arithmétiques documentaires cohérents.
- `python scripts/check_cursor_setup.py` : 8 règles et 8 skills valides structurellement.
- `python scripts/check_p00.py` : 72 tâches, dépendances sans cycle et couverture complète des 170 références.

Non exécutés : résolution du lockfile, build, migrations PostgreSQL, authentification/MFA réels, tests applicatifs, Docker, scans de vulnérabilités et essais matériels. Les gates P01-02 à P01-05 sont des vérifications futures bornées ; aucun risque de compatibilité n’est présenté comme déjà levé par un test.

Critères P00 satisfaits au niveau documentaire. Les données d’exploitation listées dans P00 ne bloquent pas le socle local ; elles devront être renseignées avant leurs échéances.

## Compte rendu P01 — 24 septembre 2026

Périmètre demandé : P01 uniquement, tâches P01-01 à P01-GATE. P02 non commencée. Node des preuves : 24.21.0. pnpm 12.6.0. Les ports applicatifs sont 4310, 4311 et 4312 parce que Windows exclut 2913–3012 sur cette machine.

Commandes exécutées et résultats :

- `corepack pnpm install` : code 0. Lockfile et scripts de build Prisma, esbuild et msgpackr-extract autorisés dans `pnpm-workspace.yaml`.
- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0.
- `corepack pnpm test` : code 0. Vitest 5.0.1, 4 fichiers, 12 tests. Avertissement Vite : `vitest.config.ts` encore vu comme CommonJS par le chargeur natif.
- `corepack pnpm test:integration` : code 0. 2 fichiers, 10 tests. La préparation supprime et recrée `cercle_complet_test`, puis `prisma migrate deploy`. PostgreSQL réel, pas SQLite. Rollback, idempotence, concurrence, tri, révocation du journal, inbox, retry BullMQ et S3 privé après redémarrage de SeaweedFS.
- `corepack pnpm test:e2e` : premier essai code 1, `EACCES` sur `127.0.0.1:3001` (plage Hyper-V). Après bascule des ports, code 0. Chromium, 4 tests : page de santé, largeurs 320 et 1440, cookie httpOnly de session. Avertissement `DEP0190` lors de l’appel `pnpm` avec `shell: true`.
- `corepack pnpm build` : code 0. Next.js 16.3.6, routes statiques `/`, `/_not-found`, `/sante`.
- `corepack pnpm audit --audit-level=moderate` : code 1. Trois avis transitifs de Prisma : `deepmerge-ts` avant 8.0.0, `mysql2` avant 3.22.0 et `mysql2` jusqu’à 3.23.0. L’application utilise PostgreSQL. Aucun correctif forcé : Prisma 8 reste une RC, et le client MySQL n’est pas le chemin d’exécution.
- Démarrage réel après build : API `{"status":"ok","service":"api"}` sur `/api/v1/health/live` ; ready `database`, `redis` et `storage` à `ok` ; worker `{"status":"ok","service":"worker"}` ; page web 200 ; Caddy `127.0.0.1:8080` sert `/sante` et `/api/v1/health/live`. Processus arrêtés ensuite.
- Docker : `postgres:18.6`, `redis:8.10.2`, `chrislusf/seaweedfs:4.47` et `caddy:2.10.2`, digests épinglés, santé `healthy`, publications limitées à `127.0.0.1`. Le volume PostgreSQL 18 est monté sur `/var/lib/postgresql`.

Tests et contrôles non exécutés :

- `pnpm test:e2e:cross-browser` : Firefox et WebKit non installés.
- `pnpm test:e2e:responsive` en tant que script séparé : les deux largeurs ont toutefois réussi dans `pnpm test:e2e`.
- Workflow `.github/workflows/ci.yml` : écrit, jamais lancé sur GitHub.
- `gitleaks` et `trivy` : absents de la machine.
- ClamAV : non déployé ; le circuit de fichiers relève de P05.
- Dexie, shadcn/ui, Motion et les écrans P02 : hors périmètre.
- `@nestjs/bullmq` : présent au catalogue P00, non installé. Le worker parle à BullMQ directement.

La migration `20260924180000_p01_foundation` a été appliquée à `cercle_complet` et rejouée sur une base de test vide par la préparation d’intégration. Aucune validation pilote.

## Compte rendu P02 — 25 septembre 2026

Périmètre demandé : P02-01, P02-02, P02-E01, P02-E37, P02-E38, P02-GATE. P03 non commencée. Node des preuves : 24.21.0.

Skills utilisées : cc-pilotage-phase (ouverture et clôture), cc-securite (auth/MFA/CSRF/permissions), cc-interface-responsive (tokens, shells, E01/E37/E38), cc-donnees-migrations (schéma et migration P02), cc-recette-tests (Vitest/Playwright/PostgreSQL). Garde-fous : cc-workflow-metier limité à l’administration, cc-hors-connexion pour ne pas livrer Dexie, cc-exploitation-vps pour Caddy/origines locales.

Commandes exécutées et résultats :

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0.
- `corepack pnpm test` : code 0. Vitest 5.0.1, 8 fichiers, 17 tests.
- `corepack pnpm test:integration` : d’abord 16/17 (SEC12) ; voir la stabilisation ci-dessous pour le 17/17.
- `corepack pnpm test:e2e` : code 0 sur Chromium, 13 tests puis 1 capture visuelle supplémentaire. Connexion gérant/propriétaire, MFA, thèmes, clavier, reduced-motion, 320–1920, menu téléphone, refus de route propriétaire, session expirée, erreur réseau. Firefox et WebKit non exécutés.
- `corepack pnpm build` : code 0. Routes `/connexion`, `/proprietaire`, `/proprietaire/utilisateurs`, `/proprietaire/appareils`, `/proprietaire/compte`, `/gerant`, `/gerant/appareil`.
- `python scripts/check_docs.py`, `check_design_examples.py`, `check_cursor_setup.py`, `check_p00.py` : code 0.

Dimensions réellement exercées en E2E : 320, 375, 768, 1024, 1100, 1440, 1920, plus un paysage 1024×768. Captures lues : connexion clair/sombre, gérant 1440/375, menu téléphone, utilisateurs sans boutique.

Migration `20260925010000_p02_access` rejouée sur `cercle_complet_test` vide par la préparation d’intégration. `pnpm db:migrate` sur `cercle_complet` : « No pending migrations to apply » (déjà présente).

Santé locale après `docker compose ps` (services healthy) : API live `{"status":"ok","service":"api"}` ; ready `database`, `redis` et `storage` à `ok` ; worker `{"status":"ok","service":"worker"}` ; web `/sante` 200 ; Caddy `127.0.0.1:8080` sert `/sante` et `/api/v1/health/live` ; `/connexion` 200 avec CSP sans `unsafe-eval`.

Tests et contrôles non exécutés :

- `pnpm test:e2e:cross-browser` : Firefox et WebKit non installés.
- `gitleaks` et `trivy` : absents de la machine.
- Scan actif externe : interdit.
- Hors connexion Dexie/PWA métier : P08.
- Affectation E2E avec boutique réelle : aucune boutique n’est créée hors tests d’intégration.

P02-GATE était réalisé avec réserve tant que SEC12 n’était pas 17/17. Voir le compte rendu de stabilisation. Aucune validation pilote. P03 non commencée.

## Stabilisation P02-GATE / SEC12 — 25 septembre 2026

Périmètre demandé : stabiliser la sortie P02 sans démarrer P03. Reproduire l’échec SEC12, inspecter SeaweedFS sans supprimer les volumes, corriger la cause, exiger 17/17, puis passer P02-GATE à TERMINÉ seulement après la suite complète.

### Cause

SeaweedFS combined server expose le filer S3 avant que le volume server n’enregistre sa topologie auprès du master. Après `docker restart`, `HeadBucket` réussit dès que le port 8333 répond ; `GetObject` échoue avec `InternalError` / `volume N not found` jusqu’au heartbeat. Les objets et le volume Docker `cercle-complet_seaweeddata` persistent : 14 volumes relus sur `/data`, dont 7 collections `cercle-private`. Le bucket reste privé (identité `cercle-app` dans `infra/seaweedfs/s3.json`).

Preuve live (logs du conteneur, volume non effacé) :

- 00:10:38.029 — S3 écoute sur 8333.
- 00:10:38.471 — `GetObject` de `cercle-private/foundation/….bin` : `volume 8 not found`.
- 00:10:39.815 — heartbeat : `added volume server` / topologie enregistrée.

Le healthcheck Compose ne testait que HTTP sur 8333. `waitForStorage` et `/ready` ne testaient que `HeadBucket`. Isolation : SEC12 est le seul test qui redémarre SeaweedFS ; `fileParallelism: false` ; les autres fichiers d’intégration n’utilisent pas S3.

Course reproduite ensuite par `docker restart` : à 00:20:12 le conteneur redémarre ; leader 00:20:29 ; volume 00:20:29.933 ; S3 00:20:31.142. L’ordre S3/volumes n’est pas stable : parfois S3 précède le heartbeat (échec 16/17), parfois l’inverse (succès isolé).

### Correction

Pas de retry d’assertion, pas de skip, pas d’attente aveugle du contenu.

- `docker-compose.yml` : healthcheck = `vol/status` contient `"Id":` **et** HTTP S3. Recréation du conteneur (`docker compose up -d --no-deps --force-recreate seaweedfs`) sans supprimer `seaweeddata`. Après recréation : healthy, 14 volumes, 7 collections `cercle-private`.
- `@cercle/storage` : `storageServesPrivateObjects` (écriture/lecture `.cercle-health/ready`) et `waitUntilPrivateObjectReadable` (GetObject de la clé persistée jusqu’à timeout, puis échec si l’objet a disparu).
- API `/ready` : storage `ok` seulement si put+get réussit, pas seulement `HeadBucket`.
- SEC12 : après restart, attendre `healthy` Docker puis lisibilité réelle de la clé ; assertion inchangée `toBe("prive")`, anonyme refusé, URL signée expirée ≥ 400. Timeout du cas 120 s (Raft ~16–20 s).

Pendant la relance E2E, le scénario TOTP a échoué une fois (13/14) : le test visuel enrôlait le même propriétaire en parallèle, puis le cas d’activation voyait l’écran « code » au lieu de « second facteur ». Correction d’isolation : compte `owner.p02.totp@example.test` réservé à l’enrôlement ; assertion TOTP inchangée.

### Commandes exécutées et résultats

- Inspection : `docker inspect` / `docker logs` / `wget http://127.0.0.1:9333/vol/status` — volumes persistés, healthcheck initial = HTTP 8333 seul.
- `docker compose up -d --no-deps --force-recreate seaweedfs` : conteneur recréé, volume conservé, nouveau healthcheck actif, statut healthy.
- `corepack pnpm lint` : code 0 (rejoué après isolation E2E : code 0).
- `corepack pnpm typecheck` : code 0. 7 projets.
- `corepack pnpm test` : code 0. Vitest 5.0.1, 8 fichiers, 17 tests.
- `corepack pnpm test:integration` : code 0. 3 fichiers, **17/17**. Durée 49,01 s.
- `corepack pnpm test:e2e` : premier essai 13/14 (course TOTP) ; après isolation des comptes, code 0. Chromium, **14/14**, 23,8 s.
- `corepack pnpm build` : code 0. Next.js 16.3.6, mêmes routes P02.

P02-GATE : TERMINÉ (preuves locales ci-dessus). P03 non commencée.

Les routes d’écran sont désormais en anglais (`/login`, `/owner`, `/owner/users`, `/owner/devices`, `/owner/account`, `/manager`, `/manager/device`, `/health`, `/setup` et le catalogue E01–E40). L’interface reste en français. Les comptes rendus P01/P02 ci-dessus citent les URL d’alors.

### Limites restantes

- Firefox et WebKit non installés (`test:e2e:cross-browser` non exécuté).
- `gitleaks` et `trivy` absents.
- Scan actif externe interdit.
- Dexie / PWA métier : P08.
- SeaweedFS 4.47 : le master Raft met ~16–20 s après restart avant d’accepter les heartbeats ; la readiness attend cette topologie, elle ne la supprime pas.
- `pnpm audit` (avis Prisma transitifs) non rejoué sur cette passe.
- Aucune validation pilote.

## Compte rendu P03 — 25 septembre 2026

Périmètre livré : P03-01, P03-E02, P03-E14, P03-E25, P03-E26, P03-E28, P03-E39, P03-E40, dashboard propriétaire P03 et P03-GATE. P04 n’a pas été commencée.

### Livrables

- Moteur P03 dans `packages/domain/src/p03.ts` : commandes idempotentes, audit et outbox transactionnels, journaux équilibrés append-only, quantités `numeric(20,6)`, montants `bigint`, couches de coût FIFO/FEFO et corrections de fonds liées.
- Migrations `20260925120000_p03_business` et `20260925130000_p03_opening_obligations` : catalogue, prix versionnés, boutiques et responsabilités, lieux, stock, fonds, politiques, brouillons et obligations d’ouverture, contraintes, index partiels et triggers d’immutabilité.
- API dans `apps/api/src/p03/p03.controller.ts` : boutiques et transitions, produits/variantes/unités/prix, sources/comptes/événements de fonds, lieux/dépôt, politiques, brouillon/validation d’ouverture, stock/mouvements et `GET /reports/overview`.
- Interfaces françaises aux URL anglaises : `/owner/shops`, `/owner/shops/[id]`, `/owner/products`, `/owner/sources`, `/owner/locations`, `/owner/settings`, `/owner/stock`, `/manager/stock` et `/setup`. `/owner` reste l’entrée dashboard unique et reçoit du serveur l’état `SETUP` ou `EMPTY`.
- Initialisation propriétaire : brouillon reprenable et plusieurs lots successifs possibles tant que la boutique reste `SETUP`. Chaque lot de stock, coûts, fonds et obligations est posté atomiquement avec journal, stock, comptes, audit et outbox ; un lot validé reste immuable et tout complément obtient une nouvelle version. L’activation de la boutique clôture l’initialisation. Elle ne crée ni vente, ni encaissement de vente, ni chiffre d’affaires.
- Permissions serveur : mutations P03 réservées au propriétaire ; lectures gérant limitées à son affectation active, sans coût ni solde de fonds et sans lieu d’une autre boutique.

Le backlog P00 associait encore E14 aux demandes/pertes et E40 aux transferts, alors que le cadrage P03 du 25 septembre interdit de commencer ces workflows P06/P07. Les critères de P03 ont été alignés sur la consultation du stock et l’activation du dépôt ; E10, E20 et E31 restent à faire dans leurs phases.

### Recette réellement exécutée

- `corepack pnpm db:migrate` : code 0 ; migration additive des obligations appliquée à la base locale.
- `corepack pnpm db:replay-test` : code 0 ; base `cercle_complet_test` recréée vide et quatre migrations rejouées.
- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0 ; sept projets.
- `corepack pnpm test` : code 0 ; Vitest 5.0.1, **9 fichiers, 19/19 tests**.
- La recette P03 historique couvrait 25/25 tests. Le scénario d’ouverture couvre désormais les lots complémentaires avant activation, leur cumul et l’immutabilité des écritures. La réexécution locale du 25 septembre 2026 reste bloquée avant les tests par Node.js 24.14.0, inférieur au moteur requis `>=24.21.0 <25`.
- `corepack pnpm test:e2e` : code 0 ; Chromium, **15/15 tests**, un worker. Le parcours P03 crée catalogue, boutique, source, dépôt facultatif, brouillon, stock/fonds/obligation, valide et active, contrôle `SETUP → EMPTY`, stock réel, absence de chiffre d’affaires fictif, permissions, thèmes et largeurs 320/768/1024/1440.
- `corepack pnpm build` : code 0 ; Next.js 16.3.6, **19 routes**.

### Limites et risques restants

- Firefox et WebKit ont été demandés à Playwright mais leurs exécutables ne sont pas installés sur cette machine ; aucun succès cross-browser n’est revendiqué.
- Zoom navigateur à 200 %, clavier virtuel, tactile réel et appareils physiques non testés. Les contrôles automatisés couvrent le clavier existant et les viewports simulés, pas une recette matérielle.
- Pas de validation pilote, de déploiement public, de scan actif externe, ni de nouvelle passe `pnpm audit`.
- Les transferts, ventes, caisse, reçus, dépenses, workflows complets de pertes/réapprovisionnement et mode hors connexion restent dans leurs phases futures.

P03-GATE : **TERMINÉ** sur preuves locales ci-dessus. Aucun défaut critique P03 connu à cette clôture. P04 non commencée.

## Compte rendu P04 — 26 septembre 2026

Périmètre livré : vente en ligne gérant, session de caisse, recherche et panier, devis serveur, remises autorisées, paiement immédiat simple ou multiple, rendu espèces, posting atomique, reçu et historique. La clôture de caisse reste en P05, le crédit/retour en P07 et le mode hors connexion en P08.

### Livrables

- Migration `20260926130000_p04_sales` : sessions, autorisations en ligne, ventes, lignes, paiements et allocations de coût, index d’unicité de session ouverte et protections append-only des documents postés.
- Moteur `packages/domain/src/p04.ts` : contrôle de l’affectation et de l’appareil actif, calcul exact en `bigint`/décimaux bornés, prix serveur, FIFO/FEFO, idempotence, verrous de concurrence, stock, fonds, journal équilibré, audit et outbox dans une transaction unique.
- API : `GET /manager/sales/context`, `POST /cash-sessions/open`, `POST /sales/quote`, `POST /sales`, `GET /sales`, `GET /sales/:id`. Les commandes à effets exigent `Idempotency-Key`; la confirmation consomme une autorisation en ligne courte liée au devis.
- Interfaces gérant : `/manager/sale`, `/manager/sale/payment`, `/manager/sales` et `/manager/sales/[id]`, navigation caisse, panier conservé pendant le passage au paiement, paiement partagé, monnaie à rendre, reçu imprimable et adaptation 320/768/1024/1440.
- Dashboard propriétaire : indicateurs de ventes issus des écritures réelles, sans chiffre de démonstration.

### Recette réellement exécutée

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm test` : code 0, **9 fichiers, 19/19 tests**.
- `corepack pnpm db:replay-test` : code 0, base de test recréée vide et six migrations rejouées.
- `corepack pnpm test:integration` : code 0, **5 fichiers, 32/32 tests** sur PostgreSQL réel. P04 couvre espèces avec rendu, Mobile Money, paiement mixte, quantités décimales, mismatch d’idempotence, concurrence sur la dernière unité, remise refusée et immutabilité.
- `corepack pnpm build` : code 0, Next.js 16.3.6, **22 routes**.
- `corepack pnpm exec playwright test --project=chromium` : code 0, **16/16 tests** après actualisation des parcours P02/P03 à l’interface courante et isolation réexécutable des fixtures.
- `python scripts/check_docs.py` et `python scripts/check_design_examples.py` : résultats consignés après la mise à jour documentaire finale.

### Limites et risques restants

- Firefox et WebKit ne sont pas installés ; aucun succès cross-browser n’est revendiqué.
- Aucun essai tactile ou matériel réel, aucune validation pilote et aucun déploiement public.
- Le panier préparatoire reste local à la session du navigateur ; aucune capacité hors connexion n’est revendiquée avant P08.
- P04 utilise l’appareil actif unique de l’affectation gérant. La délivrance et la synchronisation des capacités hors ligne restent hors périmètre.
- La clôture/comptage, les dépenses et les écarts de caisse commencent en P05.

P04-GATE : **TERMINÉ** sur preuves locales. Aucun défaut critique P04 connu à cette clôture. P05 non commencée.

### Complément P04 — encaissement espèces et gestion des sources

- L’encaissement espèces distingue désormais le montant affecté à la vente, le montant remis par le client, la monnaie calculée et la monnaie réellement rendue. La confirmation explicite est conservée sur le reçu ; toute divergence est refusée dans la transaction serveur sans mouvement de stock ni de fonds.
- L’écran de paiement présente le contexte boutique/appareil/session, préremplit le cas simple, contrôle les paiements partagés et interdit l’emploi deux fois du même compte dans une vente.
- La fiche de vente détaille les lignes, les remises, chaque moyen de paiement et, pour les espèces, le montant reçu et la monnaie rendue.
- La page propriétaire des sources affiche solde réel, ventes et variation du jour, filtres, évolution quotidienne, événements récents, apport audité et gestion du libellé/statut/rattachement. Aucun solde n’est éditable directement. Une source utilisée par une session ouverte ne peut pas être désactivée ; une source ayant des écritures ne peut pas changer de boutique.
- Migration `20260926190000_p04_cash_change_sources` : champs de monnaie, contrainte de cohérence et reprise des ventes espèces historiques comme paiements exacts sans monnaie, avec réactivation immédiate du trigger append-only.

Recette du complément exécutée le 26 septembre 2026 :

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm test` : code 0, **9 fichiers, 19/19 tests**.
- `corepack pnpm db:replay-test` : code 0, base de test recréée vide et sept migrations rejouées.
- `corepack pnpm db:migrate` : code 0 sur la base locale existante après reprise contrôlée des ventes espèces historiques.
- `corepack pnpm test:integration` : code 0, **5 fichiers, 34/34 tests** sur PostgreSQL réel, dont rejet atomique d’une monnaie incohérente et protection d’une source liée à une session ouverte.
- `corepack pnpm build` : code 0, Next.js 16.3.6, **22 routes**.
- `corepack pnpm test:e2e` : code 0, Chromium, **16/16 tests**, dont saisie et restitution de la monnaie sur le reçu.

Les limites P04 déjà consignées restent inchangées. La clôture de caisse demeure en P05 ; crédit, retours et remboursements comptables demeurent en P07 ; le hors connexion demeure en P08.

### Correctif d’affichage des fonds initiaux — 26 septembre 2026

La consultation d’une initialisation clôturée affichait les champs temporaires vidés du formulaire et uniquement le dernier lot. L’API restitue désormais le cumul des fonds et toutes les lignes de stock des lots validés de la boutique ; l’interface liste chaque source avec son montant et le total initial validé. Les écritures financières existantes n’ont été ni recréées ni modifiées.

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm exec playwright test tests/e2e/p03-business.spec.ts --project=chromium` : code 0, **1/1**, avec contrôle du libellé de la source et du montant initial après activation.

### Correctif d’ergonomie du paiement unique — 26 septembre 2026

Pour un paiement unique, le total du panier est désormais affecté automatiquement au compte choisi et affiché en lecture seule. La saisie d’un montant n’apparaît qu’après l’action explicite de partage entre plusieurs moyens de paiement, sous le libellé « Montant payé avec ce moyen ».

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm build` : code 0, 22 routes.
- `corepack pnpm exec playwright test tests/e2e/p04-sale.spec.ts --project=chromium` : code 0, **1/1**.

### Raffinement ergonomique de la vue générale propriétaire — 28 septembre 2026

La vue `/owner` utilise désormais un en-tête opérationnel compact, des raccourcis vers les ventes et les sources, une barre unique de périmètre/période et quatre indicateurs commerciaux prioritaires. En l’absence de ventes, un seul état vide contextualisé remplace les tableaux et répétitions de montants nuls. Les ventes récentes, encaissements non nuls, comparaisons multi-boutiques et produits vendus ne sont affichés que lorsqu’ils apportent une information exploitable. La variation n’est plus mise en avant lorsque la période ne contient aucune vente.

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm build` : code 0, 23 routes.
- `corepack pnpm exec playwright test tests/e2e/p02-responsive.spec.ts --project=chromium` : code 0, **2/2**.
- `corepack pnpm exec playwright test tests/e2e/p04-owner-sales.spec.ts --project=chromium` : code 0, **1/1** après adaptation des libellés de filtre et d’action.

### Raffinement ergonomique de l’historique des ventes — 28 septembre 2026

Sur `/owner/sales`, la période est désormais formulée en français, les indicateurs complets ne sont rendus qu’en présence de ventes et les filtres gérant/statut/source/recherche sont regroupés dans une zone avancée repliable. La réinitialisation n’apparaît qu’avec des filtres actifs. L’état sans résultat est compact, distingue une recherche filtrée d’une absence de vente et propose un retour à la vue générale sans présenter une vente comme la conséquence d’un simple encaissement.

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm build` : code 0, 23 routes.
- `corepack pnpm exec playwright test tests/e2e/p04-owner-sales.spec.ts --project=chromium` : code 0, **1/1**, avec contrôle explicite de l’état sans résultat et des quatre largeurs cibles.

### Raffinement ergonomique de la fiche de vente propriétaire — 28 septembre 2026

La fiche `/owner/sales/[id]` hiérarchise désormais le ticket autour du total net et du montant encaissé. La référence, la boutique, le gérant, l’appareil et la journée d’activité sont regroupés dans un en-tête compact ; les remises et restes à payer n’apparaissent que lorsqu’ils existent. Les coûts et la marge sont identifiés comme informations de rentabilité réservées au propriétaire. Les lignes de produit distinguent variante, format, calcul de quantité et total. Le paiement en espèces résume le cas exact sans répéter trois zéros, tout en conservant le détail reçu/à rendre/rendu lorsqu’une monnaie existe. La traçabilité est présentée sous forme de chronologie et le texte interne annonçant une phase future a été retiré.

Vérifications du complément :

- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm lint` : code 0.
- `corepack pnpm build` : code 0, Next.js 16.3.6, **23 routes**.
- `corepack pnpm exec playwright test tests/e2e/p04-owner-sales.spec.ts --project=chromium` : code 0, **1/1**, avec contrôle de la fiche aux largeurs 320, 768, 1024 et 1440 px.
- `python scripts/check_docs.py` : code 0, **41 fichiers Markdown**, 84 scénarios et 40 écrans.

### Raffinement ergonomique des boutiques et appareils — 28 septembre 2026

La liste des boutiques présente désormais chaque point de vente comme une fiche opérationnelle : état formulé en français, gérant responsable, progression compréhensible de l’initialisation et actions explicites pour ouvrir la fiche ou reprendre la préparation. Une recherche par nom, code ou gérant et un filtre d’état facilitent la gestion de plusieurs boutiques. La liste n’invente aucun indicateur de stock, de fonds ou d’activité non fourni par l’API.

La page des appareils distingue les accès à approuver, autorisés et révoqués. Elle affiche la boutique rattachée, la date d’enregistrement, le dernier contact réel et la restriction à une utilisation connectée. Le libellé interne de phase a été retiré et l’action destructive est présentée comme un retrait d’autorisation, avec confirmation et motif obligatoire. La page conserve son contenu lorsqu’une action échoue afin d’afficher l’erreur dans son contexte.

Vérifications du complément :

- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm lint` : code 0.
- `corepack pnpm build` : code 0, Next.js 16.3.6, **23 routes**.
- `corepack pnpm exec playwright test tests/e2e/owner-management-ux.spec.ts --project=chromium` : code 0, **1/1**, avec recherche, filtres et contrôle responsive à 320, 768, 1024 et 1440 px.
- `corepack pnpm exec playwright test tests/e2e/p03-business.spec.ts --project=chromium` : code 0, **1/1**, parcours complet de création, initialisation et activation d’une boutique.
- `python scripts/check_docs.py` : code 0, **41 fichiers Markdown**, 84 scénarios et 40 écrans.

### Complément P04 — consultation propriétaire et synthèse commerciale

Le propriétaire consulte les ventes réellement postées, ouvre une fiche détaillée et dispose sur `/owner` d’indicateurs issus des écritures P04. Aucune donnée fictive n’est affichée. Une donnée indisponible n’est pas convertie en zéro. Les coûts et la marge estimée restent dans le DTO propriétaire. Le DTO gérant continue d’exclure les coûts. Les encaissements mesurent les paiements postés de la période, distincts du solde actuel d’une source. La période civile utilise le fuseau de la boutique sélectionnée, sinon `Africa/Douala`. La période précédente a la même durée inclusive ; la variation est indisponible si le chiffre d’affaires précédent est nul ou négatif.

Livrables :

- Routes `GET /owner/sales` et `GET /owner/sales/:id` ; `GET /reports/overview` accepte `from`/`to` en plus de `shopId`.
- Interfaces `/owner/sales` et `/owner/sales/[id]`, navigation « Ventes », dashboard `/owner` enrichi (périmètre, période, fraîcheur, ventes récentes, comparaison de boutiques, encaissements par type, produits vendus).
- Agrégats `packages/contracts/src/sales-metrics.ts` et requêtes `packages/domain/src/p04-overview.ts`.
- Migration additive `20260926200000_p04_owner_sales_indexes` : index de liste par organisation/boutique/gérant/date.

Recette réellement exécutée le 26 septembre 2026 :

- `corepack pnpm lint` : code 0.
- `corepack pnpm typecheck` : code 0, tous les projets.
- `corepack pnpm test` : code 0, **10 fichiers, 25/25 tests**.
- `corepack pnpm db:replay-test` : code 0, base `cercle_complet_test` recréée vide.
- `corepack pnpm db:migrate` : code 0 sur la base locale existante ; application de `20260926200000_p04_owner_sales_indexes` sans suppression de données.
- `corepack pnpm test:integration` : code 0, **7 fichiers, 42/42 tests** sur PostgreSQL réel, dont liste multi-boutiques, filtres, pagination, détail, monnaie, coût/marge, isolation inter-organisation, 401/403, paramètres invalides et absence de coût dans le DTO gérant.
- `corepack pnpm build` : code 0, Next.js 16.3.6, routes `/owner/sales` et `/owner/sales/[id]` ajoutées.
- `corepack pnpm exec playwright test --project=chromium` : code 0, **17/17**. Le premier `corepack pnpm test:e2e` a échoué parce que le port 4311 était encore occupé par un serveur précédent ; après libération et démarrage via `corepack pnpm`, la suite Chromium complète a réussi, y compris le parcours propriétaire 320/768/1024/1440.
- `python scripts/check_docs.py` : code 0, 41 fichiers Markdown, 84 scénarios et 40 écrans.
- `python scripts/check_design_examples.py` : code 0, exemples RM02, RM10, RM11, T57 et T84 cohérents.

Limites restantes : P05 (clôture, comptage, dépenses) non commencée ; P07 (crédits, retours, remboursements) non commencée ; P08 hors connexion non commencé ; P09 exports CSV/PDF et graphiques analytiques non commencés. Aucun seuil de stock n’est inventé. Firefox et WebKit ne sont pas revendiqués. Node local observé : 24.14.0, inférieur à l’exigence `>=24.21.0` ; les lancements de tests passent par `corepack pnpm` et `PNPM_IGNORE_ENGINE=1` uniquement pour les processus enfants de recette.
