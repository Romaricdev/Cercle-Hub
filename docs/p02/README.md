# P02 — Accès sécurisés et design system

Date : 25 septembre 2026. Réalisée localement. P03 non commencée.

## Livré

- Tokens, thèmes clair/sombre/système, logo validé, shells propriétaire et gérant.
- Better Auth sur Fastify : cookies, CSRF `/api/v1`, origines, Helmet/CSP, rate limit Redis, MFA TOTP propriétaire, codes de secours.
- E01 `/login`, E37 `/owner/users`, E38 `/owner/devices` et `/manager/device`.
- Migration `20260925010000_p02_access` : boutiques, affectations, invitations, appareils. Aucune capacité hors ligne à l’approbation.

## Preuves

Voir [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md). Suites exécutées : lint, typecheck, unitaires, intégration PostgreSQL, E2E Chromium, build.

## Limites

Firefox/WebKit, Gitleaks et Trivy non exécutés. Hors connexion Dexie reporté à P08. Aucune boutique métier créée : l’état vide E37 est réel.
