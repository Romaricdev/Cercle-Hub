---
name: cc-donnees-migrations
description: "Traduire le modèle en Prisma/PostgreSQL et réaliser des migrations ou vérifier les transactions sans perdre l’historique."
---

# cc-donnees-migrations

## Références

Lire les sections utiles à la tâche, pas toute la liste systématiquement.

- [03-modele-donnees.md](../../../docs/03-modele-donnees.md)
- [conception/02-donnees-et-relations.md](../../../docs/conception/02-donnees-et-relations.md)
- [04-architecture.md](../../../docs/04-architecture.md)
- [14-securite-conception-et-recette.md](../../../docs/14-securite-conception-et-recette.md)

## Méthode

Lire modèles et contraintes avant le schéma Prisma. Vérifier la version ORM choisie et ses API officielles ; ne pas reprendre une recette d’une autre version. Employer SQL paramétré ciblé pour les contraintes/verrous non couverts par le modèle.
Préparer migration et données de reprise avec limites et sauvegarde adaptées. Préserver compatibilité des clients offline et objets historiques ; ne pas imposer de down destructif. Tester base vide et schéma précédent sur cible dédiée vérifiée.
Vérifier transaction unique pour document, journal, projection, audit, idempotence et outbox. Tests de concurrence sur PostgreSQL réel ; clients indépendants, ordre de verrou stable, retries bornés sur erreurs techniques seulement. Livrer migration, preuve des invariants et limites de retour arrière.
