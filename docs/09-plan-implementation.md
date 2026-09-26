# Plan d’implémentation pour Codex et Cursor

Le plan de référence est désormais [15-phases-developpement.md](15-phases-developpement.md). Il remplace les anciens lots 0 à 7 par les phases P00 à P12 et contient leur correspondance, les dépendances, livrables, tests et critères de passage.

**Phase actuelle : documentation uniquement.** Ce renvoi et la feuille de route ne démarrent pas l’implémentation. Une instruction explicite du porteur reste nécessaire pour commencer le développement.

## Utilisation

1. Lire AGENTS.md, les décisions/règles métier et la feuille de route.
2. Consulter [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) pour reprendre l’état réel.
3. Réaliser des parcours complets par phase, avec les documents de domaine concernés.
4. Appliquer [la stack technique](10-ajouts-techniques-et-responsive.md), [les tests](11-stack-et-strategie-tests.md), [le design system](13-design-system.md) et [la sécurité](14-securite-conception-et-recette.md).
5. Consigner résultats, défauts et prochaines tâches ; ne jamais confondre documentation, code écrit et logiciel testé.

Les commandes applicatives restent à créer en P01 : pnpm dev, lint, typecheck, test, test:integration, test:e2e, build, db:migrate, db:seed:dev, owner:create et worker. Les commandes détaillées de tests sont décrites dans le document 11.

Aucune fonctionnalité ni règle de la conception existante n’est retirée par le nouveau découpage.
