---
name: cc-hors-connexion
description: "Implémenter ou diagnostiquer Dexie, service worker et synchronisation des boutiques en préservant les commandes non acquittées."
---

# cc-hors-connexion

## Références

Lire les sections utiles à la tâche, pas toute la liste systématiquement.

- [05-hors-connexion.md](../../../docs/05-hors-connexion.md)
- [02-permissions.md](../../../docs/02-permissions.md)
- [conception/01-transitions.md](../../../docs/conception/01-transitions.md)
- [14-securite-conception-et-recette.md](../../../docs/14-securite-conception-et-recette.md)

## Méthode

Reconstituer le trajet local→inbox→validation→journal→acquittement avec identifiants et séquences. Ne jamais commencer le diagnostic en vidant IndexedDB ou la file.
Capacité liée à acteur/appareil/boutique/session, durée et actions limitées. Vente online et replay empruntent les services communs, avec modes explicites. L’heure locale et le contenu du navigateur ne font pas autorité.
Tester panne avant/après commit et avant/après acquittement, duplication, ordre, expiration et révocation. Les faits ambigus restent à examiner. Préserver la file durant migrations/service worker/logout ; pas de rechargement forcé en cours de vente.
Valider dans navigateur réel avec service worker actif et PostgreSQL réel, puis sur tablette pour veille/reprise. Rapporter freshness inconnue correctement ; pas de promesse de révocation offline instantanée.
