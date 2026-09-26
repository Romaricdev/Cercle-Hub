# Identité et design UI

Date : 24 septembre 2026. Conception uniquement, aucune installation applicative.

## Identité confirmée

Nom de l’entreprise fourni par le porteur : **Cercle Complet Sarl**. Respecter cette orthographe dans l’interface, les documents et l’initialisation. Ne pas inventer adresse, numéro fiscal, coordonnées ou mentions juridiques complémentaires. Les noms des boutiques restent à renseigner.

## Stack UI choisie par le porteur

- **Tailwind CSS** : styles, responsive, thèmes et tokens de design partagés.
- **shadcn/ui** : base des composants réutilisables (boutons, champs, dialogues, menus, onglets, tableaux, alertes). Personnaliser les composants de manière cohérente et préserver leurs comportements accessibles.
- **Framer Motion** : transitions et animations React ciblées. Vérifier au bootstrap le nom du paquet et les imports officiels de la version stable compatible retenue (écosystème Motion), sans installer deux bibliothèques équivalentes.

Cette décision remplace le statut simplement proposé de Tailwind et des primitives UI dans l’architecture. Next.js/React restent le socle ; aucune bibliothèque de composants supplémentaire sans besoin justifié. Dernières versions stables compatibles et versions exactes verrouillées selon le document 10.

## Principes visuels et interactions

Interface propre, lisible, sobre et fluide, pour les deux rôles et tous les formats. Définir des tokens communs : couleurs sémantiques, typographie, espacements, rayons, ombres, tailles de contrôles, focus et durées. Le design system est désormais validé et détaillé dans [13-design-system.md](13-design-system.md), y compris couleurs, polices, deux thèmes et limitation des bordures.

La direction produit prend les dashboards Cloudflare comme référence de densité, de navigation contextuelle et de sobriété, tout en conservant intégralement l’identité Cercle Complet. Le shell repose sur une sidebar iconée avec sous-menus, une topbar compacte et un sélecteur global/boutique. Les pages privilégient surfaces plates, listes et tableaux opérationnels ; les grands blocs promotionnels ne remplacent pas l’information métier.

Priorité à la lecture des montants, quantités, états et actions. Utiliser les composants selon leur fonction : dialogue pour confirmation engageante, alerte persistante pour une erreur bloquante, notification temporaire seulement pour une information non essentielle. Une notification de succès doit correspondre à un résultat réellement acquis ; distinguer enregistrement local et confirmation serveur.

Transitions recommandées : changement d’onglet/panneau, ouverture et fermeture d’un dialogue, apparition d’un retour d’action. Durées indicatives de 120 à 220 ms, à ajuster sur les appareils réels. Préférer opacity/transform, limiter les animations de mise en page et éviter rebonds, mouvements permanents ou délais décoratifs sur la caisse. Une animation ne doit jamais bloquer une saisie, retarder une validation ni masquer une erreur.

Respecter `prefers-reduced-motion` : désactiver les mouvements non essentiels et préserver les retours d’état. Gérer focus et navigation clavier pendant les transitions ; ne pas animer un montant d’une manière qui rend sa valeur ambiguë. Sur appareils modestes, la réactivité et la conservation des données priment sur les effets.

Appliquer RSP01 à RSP10 aux composants shadcn personnalisés : tablette, téléphone, ordinateur, tactile et clavier. Tests Testing Library pour les interactions ; Playwright pour responsive, focus, dialogues, réduction des mouvements et parcours critiques. Ne pas tester des durées internes à la milliseconde ; vérifier le comportement observable.

## Logo validé

[Logo validé V1](../assets/brand/cercle-complet-logo-proposition-v1.png), créé avec l’outil intégré de génération d’images. Direction : double C circulaire, nom lisible et mention Sarl subordonnée. Le symbole évoque la continuité et le nom de l’entreprise, sans limiter l’identité à un logiciel de comptabilité.

Statut : logo V1 validé par le porteur dans la conversation. Livrable actuel PNG raster, pas un master vectoriel. Avant diffusion définitive : préparer les déclinaisons vectorielles, monochromes, fonds clairs/sombres et icône seule, en vérifiant la lisibilité aux petites tailles. Ne pas utiliser le logo horizontal complet comme favicon.

Le prompt de création est conservé dans [le fichier de traçabilité](../assets/brand/logo-v1-prompt.txt). Aucun code de l’application n’a été commencé pour cette création graphique.
