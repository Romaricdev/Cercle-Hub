---
name: cc-pilotage-phase
description: "Planifier ou reprendre une phase P00–P12 de Cercle Complet, identifier les dépendances et tenir le suivi de réalisation."
---

# cc-pilotage-phase

## Références

Lire les sections utiles à la tâche, pas toute la liste systématiquement.

- [15-phases-developpement.md](../../../docs/15-phases-developpement.md)
- [IMPLEMENTATION_STATUS.md](../../../docs/IMPLEMENTATION_STATUS.md)
- [README.md](../../../docs/README.md)

## Méthode

Lire l’état réel et le périmètre demandé. Pour une demande documentaire, ne pas initialiser l’application. Pour un développement autorisé, identifier la première tâche dont les dépendances sont satisfaites, sans réinitialiser ce qui fonctionne déjà.
Associer tâche à phase, écrans E, transitions S et scénarios T/RSP/SEC pertinents à partir des matrices existantes. Prévoir migration, service, API, UI et tests comme une tranche vérifiable. Fermer les ambiguïtés avec les décisions déjà prises ; demander une information uniquement si elle bloque réellement.
Exécuter dans le périmètre autorisé, corriger les erreurs rencontrées et suivre la définition de fini. Rapporter livrables, commandes/résultats, risques restants et prochaine tâche dans IMPLEMENTATION_STATUS. Une phase n’est VALIDÉE TECHNIQUEMENT que si ses critères ont des preuves ; le pilote utilisateur est une validation distincte.
