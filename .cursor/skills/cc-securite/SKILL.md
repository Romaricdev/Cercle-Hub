---
name: cc-securite
description: "Appliquer ou auditer la sécurité applicative et infrastructure de Cercle Complet, avec contrôles SEC et preuves."
---

# cc-securite

## Références

Lire les sections utiles à la tâche, pas toute la liste systématiquement.

- [14-securite-conception-et-recette.md](../../../docs/14-securite-conception-et-recette.md)
- [07-securite-exploitation.md](../../../docs/07-securite-exploitation.md)
- [02-permissions.md](../../../docs/02-permissions.md)

## Méthode

Identifier surface touchée et frontière de confiance. Lire les sections correspondantes et associer SEC avant intervention. Pour un audit, distinguer configuration absente, vulnérabilité démontrée et hypothèse ; ne pas annoncer une conformité globale.
Vérifier permissions objet, validation, XSS/CSP, SQL paramétré, CSRF, sessions/MFA, limitation compte/IP, fichiers et secrets selon le périmètre. Les protections doivent fonctionner avec le proxy, les sessions offline et le build production.
Utiliser tests négatifs locaux, scans de dépendances et configuration. Scan actif seulement sur une cible autorisée avec données de test ; ce skill n’accorde aucune permission d’attaquer production ou tiers. Corriger les causes et ajouter une régression utile, sans désactiver un contrôle pour satisfaire la suite.
Livrer constats avec emplacement, impact, preuve, correction et risque restant. MFA propriétaire et restauration requises avant données réelles conformément au référentiel.
