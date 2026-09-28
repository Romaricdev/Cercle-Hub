# Cercle Complet Sarl

Application locale de gestion des boutiques. P03 livre les boutiques, le catalogue, les prix, les lieux, les sources de fonds, les paramètres, l’initialisation, le stock et le premier dashboard propriétaire alimenté par des données réelles. Les ventes et la caisse restent hors périmètre.

## Prérequis

- Node.js 24.21.0 LTS ou une version 24 supérieure et inférieure à 25
- Corepack et pnpm 12.6.0 (`packageManager` du dépôt)
- Docker, avec Compose, pour PostgreSQL, Redis, SeaweedFS et Caddy

Les terminaux ouverts dans Cursor pour ce dossier placent automatiquement `.tools\node-v24.21.0-win-x64` devant le `PATH`. Inutile de répéter la version à chaque commande. Ouvre un nouveau terminal, puis vérifie avec `node -v` : le résultat attendu est `v24.21.0`.

Les secrets de `.env.example` sont factices et réservés à la machine de développement. Ne pas les réutiliser ailleurs. Aucun fichier `.env` n’est versionné : s’il est absent, les processus chargent `.env.example`.

## Installation

```powershell
corepack pnpm install
docker compose up -d
corepack pnpm db:migrate
```

`db:migrate` applique les migrations sur la base de développement `cercle_complet` avec le rôle `cercle_migrator`. L’application s’y connecte ensuite avec `cercle_app`.

L’inscription publique est fermée. Pour ouvrir les shells localement :

```powershell
corepack pnpm db:seed-local
```

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Propriétaire | `owner.local@example.test` | `local-dev-password-15` |
| Gérant | `manager.local@example.test` | `local-dev-password-15` |

Le propriétaire doit activer le TOTP à la première connexion. Ces comptes ne vont que sur `cercle_complet` local.

Pour charger aussi le périmètre P03 (boutique active initialisée, catalogue, fonds, stock, dépôt, politiques et boutique brouillon `CC02`) :

```powershell
corepack pnpm db:seed-local-full
```

Équivalent : `db:seed-local` puis `db:seed-local-p03`. Réservé à la machine locale ; aucune donnée démo en production.

## Démarrage

```powershell
corepack pnpm --filter @cercle/api start
corepack pnpm --filter @cercle/worker start
corepack pnpm --filter @cercle/web start
```

| Service | URL locale |
|---|---|
| Web | http://127.0.0.1:4310/health |
| API live | http://127.0.0.1:4311/api/v1/health/live |
| API ready | http://127.0.0.1:4311/api/v1/health/ready |
| Worker | http://127.0.0.1:4312/ |
| Même origine via Caddy | http://127.0.0.1:8080 |
| Connexion | http://127.0.0.1:8080/login |
| Propriétaire | http://127.0.0.1:8080/owner |
| Ventes propriétaire | http://127.0.0.1:8080/owner/sales |
| Initialisation | http://127.0.0.1:8080/setup |
| Stock gérant | http://127.0.0.1:8080/manager/stock |

Sur Windows, les ports 3000–3002 peuvent être réservés par Hyper-V. Les valeurs par défaut évitent la plage observée. Le détail est dans [docs/p01/README.md](docs/p01/README.md).

## Vérifications

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
corepack pnpm test:e2e
corepack pnpm build
```

`test:integration` supprime et recrée uniquement une base locale dont le nom se termine par `_test`, puis rejoue les migrations. `test:e2e` installe Chromium au préalable : `corepack pnpm exec playwright install chromium`.

Les résultats réellement obtenus sont dans [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md).
