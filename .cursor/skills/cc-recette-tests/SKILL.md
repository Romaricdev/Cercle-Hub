---
name: cc-recette-tests
description: "Écrire ou exécuter les tests unitaires, intégration et E2E de Cercle Complet et établir une preuve de recette."
---

# cc-recette-tests

## Références

Lire les sections utiles à la tâche, pas toute la liste systématiquement.

- [11-stack-et-strategie-tests.md](../../../docs/11-stack-et-strategie-tests.md)
- [08-recette.md](../../../docs/08-recette.md)
- [10-ajouts-techniques-et-responsive.md](../../../docs/10-ajouts-techniques-et-responsive.md)
- [14-securite-conception-et-recette.md](../../../docs/14-securite-conception-et-recette.md)

## Méthode

Choisir le niveau selon l’invariant : Vitest pour fonctions, Testing Library pour comportement UI, Fastify inject + DB réelle pour API, Playwright pour parcours de bout en bout. Relier cas aux T/RSP/SEC pertinents.
Vérifier scripts et environnement réellement disponibles avant exécution ; les commandes documentées ne sont pas encore toutes implémentées. Cibles de test isolées, jeu synthétique, horloge contrôlée lorsque nécessaire. Ne pas remplacer la preuve de concurrence par mocks ou SQLite.
Diagnostiquer l’échec avant modifier les assertions. Rejouer les suites concernées après correction ; broaden seulement si modification/risque le justifie. Garder traces utiles sans secrets. Fournir commandes, résultats, limites et tâches restantes ; jamais confondre lint, contrôle documentaire et E2E réussi.
