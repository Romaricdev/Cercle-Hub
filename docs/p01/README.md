# P01 — Versions verrouillées

Date : 24 septembre 2026. Le registre [P00](../p00/02-versions-compatibilite.md) reste l’instantané des candidats lus avant installation. Le graphe réellement installé est `pnpm-lock.yaml`.

## Écarts assumés

| Composant | Candidat P00 | Version verrouillée | Raison |
|---|---|---|---|
| prisma, @prisma/client, @prisma/adapter-pg | 7.10.0 | 7.10.0 | Le tag npm `latest` de Prisma pointait vers 8.0.0-rc.15. Préversion exclue. L’adaptateur PostgreSQL déclare Prisma 5, 6 ou 7. |
| better-auth, @better-auth/prisma-adapter | 1.7.5 | 1.7.6 | Dernière stable lue au registre le 24 septembre 2026, compatible avec l’adaptateur Prisma. |
| typescript | 7.0.2 | 6.0.3 | TypeScript 7.0.2 émet bien les métadonnées de décorateurs Nest avec `experimentalDecorators` et `"types": ["node"]`. `typescript-eslint` 8.70.1 exige `typescript` `>=4.8.4 <6.1.0` et refuse 7.0.2. 6.0.3 est la dernière stable sous cette borne. |

Node.js verrouillé par `engines` : `>=24.21.0 <25`. L’hôte de développement utilisait Node 24.14.0, insuffisant pour jsdom 30.1.1 (`^24.15`). Les commandes de preuve ont été lancées avec Node 24.21.0. pnpm 12.6.0 via Corepack.

Les réglages pnpm 12 sont dans `pnpm-workspace.yaml` (`catalog`, `overrides`, `allowBuilds`). Le champ `pnpm` de `package.json` est ignoré par cette version.

## Ports locaux

Les ports 3000, 3001 et 3002 tombent dans une plage d’exclusion Windows Hyper-V observée sur la machine de développement (2913–3012). Le socle écoute donc en local sur 4310 (web), 4311 (API) et 4312 (worker). Caddy reste sur `127.0.0.1:8080` et proxy vers ces ports. PostgreSQL, Redis et SeaweedFS restent liés à `127.0.0.1` uniquement.
