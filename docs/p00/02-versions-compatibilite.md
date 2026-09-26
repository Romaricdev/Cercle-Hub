# Versions candidates et compatibilités

Instantané en lecture seule du 24 septembre 2026 depuis le registre npm et sources officielles. Aucun paquet installé, aucun lockfile généré. « Candidat » ne signifie pas « testé ensemble ». Dernières versions stables mutuellement compatibles recherchées, pas le tag latest aveuglément.

| Composant npm | Version observée | Candidat P01 | Source |
|---|---|---|---|
| next | 16.3.6 | 16.3.6 | [registre](https://registry.npmjs.org/next/latest) |
| react | 19.3.0 | 19.3.0 | [registre](https://registry.npmjs.org/react/latest) |
| react-dom | 19.3.0 | 19.3.0 | [registre](https://registry.npmjs.org/react-dom/latest) |
| @nestjs/core | 12.1.0 | 12.1.0 | [registre](https://registry.npmjs.org/@nestjs/core/latest) |
| @nestjs/platform-fastify | 12.1.0 | 12.1.0 | [registre](https://registry.npmjs.org/@nestjs/platform-fastify/latest) |
| fastify | 5.12.5 | 5.12.5 | [registre](https://registry.npmjs.org/fastify/latest) |
| prisma | 8.0.0-rc.15 | 7.10.0 | [registre](https://registry.npmjs.org/prisma/latest) |
| @prisma/client | 7.10.0 | 7.10.0 | [registre](https://registry.npmjs.org/@prisma/client/latest) |
| @prisma/adapter-pg | 7.10.0 | 7.10.0 | [registre](https://registry.npmjs.org/@prisma/adapter-pg/latest) |
| better-auth | 1.7.5 | 1.7.5 | [registre](https://registry.npmjs.org/better-auth/latest) |
| @better-auth/prisma-adapter | 1.7.5 | 1.7.5 | [registre](https://registry.npmjs.org/@better-auth/prisma-adapter/latest) |
| bullmq | 6.3.8 | 6.3.8 | [registre](https://registry.npmjs.org/bullmq/latest) |
| ioredis | 6.0.0 | 6.0.0 | [registre](https://registry.npmjs.org/ioredis/latest) |
| dexie | 4.4.6 | 4.4.6 | [registre](https://registry.npmjs.org/dexie/latest) |
| tailwindcss | 4.3.3 | 4.3.3 | [registre](https://registry.npmjs.org/tailwindcss/latest) |
| shadcn | 4.21.0 | 4.21.0 | [registre](https://registry.npmjs.org/shadcn/latest) |
| motion | 13.4.3 | 13.4.3 | [registre](https://registry.npmjs.org/motion/latest) |
| vitest | 5.0.1 | 5.0.1 | [registre](https://registry.npmjs.org/vitest/latest) |
| @vitest/coverage-v8 | 5.0.1 | 5.0.1 | [registre](https://registry.npmjs.org/@vitest/coverage-v8/latest) |
| @playwright/test | 1.63.0 | 1.63.0 | [registre](https://registry.npmjs.org/@playwright/test/latest) |
| typescript | 7.0.2 | 7.0.2 | [registre](https://registry.npmjs.org/typescript/latest) |
| pnpm | 12.6.0 | 12.6.0 | [registre](https://registry.npmjs.org/pnpm/latest) |
| zod | 4.6.5 | 4.6.5 | [registre](https://registry.npmjs.org/zod/latest) |
| react-hook-form | 7.88.0 | 7.88.0 | [registre](https://registry.npmjs.org/react-hook-form/latest) |
| @testing-library/react | 16.3.3 | 16.3.3 | [registre](https://registry.npmjs.org/@testing-library/react/latest) |
| @testing-library/user-event | 14.6.7 | 14.6.7 | [registre](https://registry.npmjs.org/@testing-library/user-event/latest) |
| @testing-library/jest-dom | 7.0.1 | 7.0.1 | [registre](https://registry.npmjs.org/@testing-library/jest-dom/latest) |
| jsdom | 30.1.1 | 30.1.1 | [registre](https://registry.npmjs.org/jsdom/latest) |
| @nestjs/bullmq | 12.0.0 | 12.0.0 | [registre](https://registry.npmjs.org/@nestjs/bullmq/latest) |
| @nestjs/common | 12.1.0 | 12.1.0 | [registre](https://registry.npmjs.org/@nestjs/common/latest) |
| @nestjs/testing | 12.1.0 | 12.1.0 | [registre](https://registry.npmjs.org/@nestjs/testing/latest) |

## Services et runtime

| Composant | Candidat | Source / contrôle restant |
|---|---|---|
| Node.js | 24.21.0 LTS | [index officiel](https://nodejs.org/dist/index.json), relève du 7 septembre ; Node 26 Current exclu |
| PostgreSQL | 18.6 | [versions supportées](https://www.postgresql.org/support/versioning/), 19 encore bêta ; migration et PITR à tester |
| Redis | 8.10.2 | [release officielle](https://github.com/redis/redis/releases/tag/8.10.2), ACL/AOF/noeviction et BullMQ à tester |
| SeaweedFS | 4.47 | [release officielle](https://github.com/seaweedfs/seaweedfs/releases/tag/4.47), persistance/restauration et accès S3 à tester |
| Reverse proxy | Caddy retenu pour Compose | Version stable exacte/digest à relever en P01-05 ; TLS et origine unique à tester |
| Antivirus | ClamAV | Version stable/digest et fraîcheur des signatures à relever P01-05, circuit testé P05 |
| Docker Engine/Compose | Versions stables de l’hôte | Inventaire OS/architecture à relever P01-05 ; aucune version d’hôte supposée |

## Lecture des compatibilités

- Next 16.3.6 accepte React 19 ; react et react-dom 19.3.0 alignés. Motion accepte React 18/19.
- Nest core/common/testing/platform-fastify 12.1.0 alignés ; l’adaptateur déclare Fastify 5.12.5. Ne pas installer Express pour satisfaire un peer optionnel.
- Prisma CLI latest pointe vers 8.0.0-rc.15 ; retenir explicitement 7.10.0 (existence vérifiée) avec client/adapter 7.10.0. L’adaptateur Better Auth déclare Prisma 5/6/7, pas 8.
- Better Auth et son adaptateur Prisma 1.7.5 alignés ; la voie Fastify directe documentée reste à intégrer dans Nest. Pas de présomption de support stable du wrapper communautaire.
- @nestjs/bullmq 12.0.0 déclare Nest 12 et BullMQ 6 ; BullMQ 6.3.8 accepte ioredis >=5, candidat 6.0.0. Vérifier vraie reprise/job idempotent avec Redis choisi.
- Vitest/coverage-v8 5.0.1 alignés ; jsdom 30.1.1 exige notamment Node >=24.15 dans la branche 24, satisfait par 24.21.0. La transformation Nest et TypeScript 7 restent un gate spécifique.
- shadcn est une CLI de génération, pas une bibliothèque UI versionnée unique : consigner les composants générés, primitives et dépendances réellement sélectionnées. Éviter les appels CLI latest non verrouillés.

Fichiers de preuve : [versions.json](versions.json) et [métadonnées complémentaires](compatibility-evidence.json). Les contraintes partielles ne constituent pas une résolution exhaustive des dépendances transitives.

## Vérifications bornées avant verrouillage P01

P01-01 actualise les tags et exclut les préversions ; P01-02 compile web/API/worker avec TypeScript retenu et tests de DI ; P01-03 démontre auth/cookies/MFA ; P01-04 démontre Prisma transaction/rollback ; P01-05 démontre Redis/BullMQ et S3 privé. Un résultat d’échec produit une décision de compatibilité datée et un candidat stable de remplacement, puis un nouveau test. Pas de retour arbitraire aux anciennes versions.

Les paquets auxiliaires (SDK S3, pg, RxJS, reflect-metadata, plugins Fastify, Zod resolver, types, lint et outils de sécurité) sont inventoriés puis verrouillés dans P01-01 avec les parents choisis ; pas de patch inventé ici. Aucun téléchargement d’image, build, audit de vulnérabilités ou benchmark n’a été exécuté pendant cette lecture.
