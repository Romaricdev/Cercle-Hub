---
name: cc-interface-responsive
description: "Construire ou revoir un écran Cercle Complet selon le design validé, les deux thèmes et les trois formats appareil."
---

# cc-interface-responsive

## Références

Lire les sections utiles à la tâche, pas toute la liste systématiquement.

- [13-design-system.md](../../../docs/13-design-system.md)
- [06-ecrans.md](../../../docs/06-ecrans.md)
- [conception/03-fiches-ecrans.md](../../../docs/conception/03-fiches-ecrans.md)
- [10-ajouts-techniques-et-responsive.md](../../../docs/10-ajouts-techniques-et-responsive.md)
- [12-identite-et-design-ui.md](../../../docs/12-identite-et-design-ui.md)

## Méthode

Identifier la fiche E et le workflow, puis états/actions/champs autorisés. Réutiliser tokens et composants Tailwind/shadcn/Motion plutôt que créer une nouvelle identité par page.
Manrope/Inter locales, bleu vif/vert citron, clair/sombre/système. Séparer par espace/surfaces ; bordure seulement utile, focus obligatoire. Traiter chargement, vide, erreurs, offline et confirmation serveur réelle.
Vérifier téléphone/tablette/ordinateur, portrait/paysage, tactile/clavier, dialogues avec clavier virtuel, zoom et reduced-motion. Les fonctions restent disponibles au format petit écran sans élargir les droits. Tester les interactions avec Testing Library puis parcours/présentation avec Playwright ; noter les essais matériels restants. Ne pas changer le logo approuvé en concevant une page.
