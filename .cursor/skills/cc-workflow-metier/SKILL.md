---
name: cc-workflow-metier
description: "Concevoir ou implémenter ventes, caisse, achats, crédit, retours et mouvements de stock de Cercle Complet."
---

# cc-workflow-metier

## Références

Lire les sections utiles à la tâche, pas toute la liste systématiquement.

- [01-regles-metier.md](../../../docs/01-regles-metier.md)
- [02-permissions.md](../../../docs/02-permissions.md)
- [conception/01-transitions.md](../../../docs/conception/01-transitions.md)
- [api/contrats.md](../../../docs/api/contrats.md)
- [workflows/01-caisse-ventes.md](../../../docs/workflows/01-caisse-ventes.md)
- [workflows/02-achats-stock.md](../../../docs/workflows/02-achats-stock.md)
- [workflows/03-administration.md](../../../docs/workflows/03-administration.md)

## Méthode

Choisir le workflow concerné et lire seulement ses sections pertinentes. Décrire acteur, préconditions, état initial/final, écritures et corrections. Distinguer autorisation, paiement et possession physique dans les deux circuits de réapprovisionnement.
Implémenter les invariants dans le service transactionnel et ses contraintes, avec DTO filtrés et droits serveur. Argent entier et quantités selon RM01 ; coût FEFO/FIFO par couche ; clé d’idempotence stable. Caisse attendue jamais envoyée au gérant avant sa déclaration ; aucune réécriture d’un comptage soumis.
Tester succès, refus d’autorisation, répétition et concurrence lorsqu’il y a stock/fonds partagés. Vérifier soldes ET journal/audit, pas seulement le statut HTTP. Relier les tests à la recette ; une opération physique ambiguë doit être conservée pour examen plutôt qu’effacée.
