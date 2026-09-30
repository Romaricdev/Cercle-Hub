# Instructions de réalisation

## Documents faisant autorité

Phase actuelle : P00 documentaire réalisée ; P01 socle technique réalisé localement ; P02 accès sécurisés et design system réalisée localement ; P03 boutiques/catalogue, P04 ventes, P05 caisse/clôture aveugle et P06 réapprovisionnement/achats/transferts réalisées localement. P07–P12 non démarrées. Le registre `docs/p00/README.md` précise les décisions et le backlog. L’état exécuté est dans `docs/IMPLEMENTATION_STATUS.md`. Lire `docs/conception/00-audit.md` et les compléments 2.1 liés, puis `docs/README.md`, `docs/00-decisions.md` et `docs/01-regles-metier.md` avant toute implémentation. Lire ensuite les documents du domaine concerné. `DOCUMENTATION_PROJET.md` conserve le cadrage historique ; ses propositions ouvertes sont remplacées par les décisions de `docs/`.

## Contraintes impératives

- Simplicité d’usage pour un gérant unique par boutique ; options avancées activables, pas de formulaire surchargé par défaut.
- Aucun flottant pour argent ; calculs et quantités selon RM01.
- Vente/stock/paiement atomiques quand l’opération le nécessite ; PostgreSQL réel dans tests de concurrence.
- Aucun UPDATE/DELETE silencieux de journal ou document posté ; corrections liées et audit.
- Idempotence serveur sur toutes commandes à effets.
- Permissions serveur sur lectures, mutations, exports et fichiers.
- Caisse attendue absente des DTO gérant avant comptage ; ne pas seulement la masquer dans UI.
- Aucun chiffre de démonstration dans tableau de bord de production.
- Hors ligne selon `docs/05-hors-connexion.md`, aucun élargissement implicite des permissions.
- Pas de suppression des événements locaux non acquittés.
- Contradiction stock/fonds/droits : documenter et résoudre avant code concerné.

## Organisation

Lire aussi `docs/10-ajouts-techniques-et-responsive.md`, complément prioritaire du 24 septembre 2026. Cible : Next.js pour l’interface, NestJS avec Fastify pour l’API métier, Prisma/PostgreSQL, Redis/BullMQ et stockage S3 auto-hébergé (SeaweedFS retenu en P00, intégration à éprouver en P01). Backend modulaire, sans microservices. Contrôleurs fins, services indépendants de l’UI, transactions explicites et SQL paramétré si nécessaire. Dernières versions stables compatibles, verrouillées après vérification ; Node.js LTS. Ne pas reprendre l’ancienne interdiction de Prisma/Redis.

Responsive obligatoire pour les deux rôles et les 40 écrans : téléphone, tablette, ordinateur, portrait/paysage, tactile/souris/clavier. La tablette privilégiée en boutique ne limite ni les formats ni les fonctions. Conserver les restrictions d’appareil principal et de permissions, indépendantes du format d’écran. Appliquer la recette complémentaire RSP du document 10 à chaque lot.

Suivre `docs/15-phases-developpement.md` (plan actif P00–P12, remplaçant les lots historiques), tenir `docs/IMPLEMENTATION_STATUS.md`. À chaque lot, indiquer commandes exécutées et résultats ; ne pas inventer des tests passés. Ne pas confondre plan et réalisation. Aucun déploiement public ou abonnement payant implicite.

## Vérifications

Créer en P01 puis exécuter scripts lint/typecheck/test/build ; tests d’intégration et E2E adaptés au lot. Rejouer migrations sur base de test vide. Ne jamais effacer une base réelle pour exécuter un test. La recette métier est dans `docs/08-recette.md`.

Stack de tests prescrite dans `docs/11-stack-et-strategie-tests.md` : Vitest, React Testing Library, intégration NestJS/Fastify avec PostgreSQL réel sous Docker et Playwright pour E2E/responsive/hors connexion. Appliquer ses règles d’isolation et consigner les résultats réels.

## Identité et UI

Entreprise : Cercle Complet Sarl. Stack UI choisie : Tailwind CSS, shadcn/ui et Framer Motion. Lire `docs/12-identite-et-design-ui.md` ; appliquer responsive, accessibilité et réduction des animations. Le logo V1 et le design system sont validés par le porteur. Lire obligatoirement `docs/13-design-system.md` : Manrope/Inter, bleu vif/vert citron, thèmes clair/sombre/système et bordures rares, justifiées par une fonction. Privilégier espace et surfaces ; préserver les repères de focus.

## Sécurité impérative

Lire `docs/14-securite-conception-et-recette.md` avant tout lot : prévention XSS/SQLi/CSRF, permissions objet, limites anti-abus, MFA propriétaire avant données réelles, quarantaine fichiers, secrets et durcissement VPS. Appliquer SEC01 à SEC21 selon les lots. Documenter les preuves et risques restants ; aucune affirmation de sécurité sur la seule présence des spécifications. Le document 14 remplace les anciennes politiques incompatibles du document 07.

## Configuration Cursor du projet

Voir `docs/16-guide-cursor.md`. Règles dans `.cursor/rules`, skills spécialisées dans `.cursor/skills`. Lire la skill pertinente lorsque le travail le justifie ; ces fichiers ne donnent aucune autorisation supplémentaire. La racine de travail demandée est `C:\stock` ; les références internes sont portables.
