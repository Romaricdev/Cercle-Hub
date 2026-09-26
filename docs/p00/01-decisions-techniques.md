# Registre des décisions techniques P00

Statut : décisions de conception prises le 24 septembre 2026. Priorité sur les mentions antérieures « proposé » pour les choix explicitement tranchés ici. P01 garde les contrôles d’intégration ci-dessous comme critères de sortie, sans changement silencieux de stack.

| ADR | Décision | Conséquence / preuve à produire |
|---|---|---|
| ADR-001 | Monorepo pnpm, apps/web Next.js, apps/api NestJS/Fastify, apps/worker ; contrats et database partagés | Un seul backend métier ; pas de microservices, appels DB interdits dans web |
| ADR-002 | Node 24 LTS ; versions stables compatibles, sans tag flottant | Snapshot documenté ; résolution/build obligatoires en P01 |
| ADR-003 | Prisma 7.10.0 client/CLI/adapter-pg alignés ; PostgreSQL 18.6 | Le tag Prisma latest est une RC 8 : l’exclure. Transactions/verrous SQL paramétrés, tests de rollback/concurrence |
| ADR-004 | Better Auth retenu, adaptateur Prisma et plugin TOTP ; pont HTTP Fastify local mince | Aucun protocole crypto maison. Éviter le wrapper NestJS communautaire dont Fastify est annoncé bêta ; test d’intégration P01-03 |
| ADR-005 | SeaweedFS retenu comme fournisseur S3 auto-hébergé de référence | Contrat SDK S3 portable ; test privé/URL/restore P01-05, pas de garantie de compatibilité S3 exhaustive |
| ADR-006 | Redis + BullMQ pour tâches secondaires ; outbox PostgreSQL atomique | Redis indisponible ne supprime pas une vente ; publication répétée tolérée ; adaptateur Nest/BullMQ contrôlé |
| ADR-007 | Reverse proxy unique, même origine pour web, /api/v1 et /api/auth | CORS simplifié, pas de relais métier dans Next ; TLS/proxy trusted explicitement configurés |
| ADR-008 | Téléversement V1 via API en streaming vers S3 privé/quarantaine ; lecture contrôlée ou URL courte après droits | Éviter l’exposition directe de l’administration S3 ; ClamAV isolé pour CLEAN, indisponibilité non permissive |
| ADR-009 | Tailwind/shadcn et paquet motion, imports motion/react | Respect du choix Framer Motion ; pas de double installation framer-motion + motion ; tokens, deux thèmes et bordures limitées |
| ADR-010 | Zod pour contrats et validation serveur, React Hook Form pour saisie | Un schéma d’entrée ne vaut pas autorisation ; erreurs filtrées, OpenAPI à générer en P01 puis par domaine |
| ADR-011 | pnpm workspace et packages explicitement exportés ; ESM visé, compilation Nest avec métadonnées préservées | TypeScript 7 candidat à éprouver (P01-02) ; si échec, consigner dernière stable compatible, sans downgrader silencieusement |
| ADR-012 | Vitest/Testing Library, Fastify inject et PostgreSQL réel ; Playwright pour E2E | Versions connues, tests en environnement dédié ; pas de mock DB pour concurrence |
| ADR-013 | Dexie pour file dès les ventes P04, sans droit offline activé avant P08 | Pas de transport temporaire divergent ; capacité/prévalidation ONLINE distinctes, protocole documenté |
| ADR-014 | Docker Compose en interne et sur VPS ; images Linux Debian slim pour Node comme base proposée | Digests/architecture/volumes validés en P01 ; aucun déploiement ni compte payant dans P00 |

## Intégration auth à vérifier en P01-03

Monter /api/auth sur l’instance Fastify de Nest via le handler Better Auth, sans ajouter de serveur HTTP parallèle ni réécrire ses endpoints. Convertir requête/réponse correctement, conserver chaque Set-Cookie, statuts et cookies multiples ; construire l’URL depuis l’origine configurée (pas Host libre). Vérifier parsing JSON, corps des endpoints auth, CSP/origines, sessions et logout. Garder un guard Nest qui utilise la session et les affectations métier en base, sans faire confiance aux rôles fournis par le client.

Générer les tables auth et MFA avec l’outil versionné, relire puis migrer avec Prisma ; conserver la relation auth user ↔ app_users, sans double source de mots de passe. Tester envoi/validation TOTP, récupération, révocation, compte owner sans MFA limité au parcours d’activation. Sortie attendue : test Fastify réel + Prisma/PostgreSQL + navigateur avec cookies. Si incompatibilité, produire diagnostic reproductible et décision mise à jour avant P02 ; ne pas basculer vers Express/JWT maison pour contourner.

## Corrections de cohérence relevées en P00

| Constat | Arbitrage |
|---|---|
| Document sécurité dit batch sync jusqu’à 100, protocole dit 50 | Retenir la limite la plus stricte : 50 événements ET 1 Mo |
| Ancien audit exige une maquette avant UI | Le porteur a choisi les écrans applicatifs directement ; validation ergonomique progressive, pas de prototype préalable obligatoire |
| Documents récents imposent MFA owner mais E01 ne décrit que le mot de passe | Étapes internes E01 : activation TOTP, challenge et secours/récupération ; E37 : réauth et gestion du facteur. Pas de nouvel écran E41 artificiel |
| Même phase de catalogue mentionne déjà tests de ventes/réceptions | Préparer les modèles en P03 ; valider chaque assertion complète quand les domaines dépendants existent, avec tests transversaux P07/P08/P10 |
| Versions PostgreSQL 17 et SQL sans ORM dans anciennes propositions | PostgreSQL 18.6 et Prisma 7 de ce registre ; invariants métier inchangés |

Références : [adaptateur Prisma Better Auth](https://better-auth.com/docs/adapters/prisma), [Fastify Better Auth](https://better-auth.com/docs/integrations/fastify), [intégration NestJS communautaire](https://better-auth.com/docs/integrations/nestjs), [TOTP](https://better-auth.com/docs/plugins/2fa), [Motion](https://motion.dev/docs/react-installation). Sources consultées, intégration non exécutée.
