# Design system — Cercle Complet Sarl

Date : 24 septembre 2026. Référence normative pour Codex et Cursor, applicable aux 40 écrans et aux espaces propriétaire/gérant. Le porteur a validé le logo V1, la direction bleu vif/vert citron, Manrope/Inter et les modes clair/sombre, avec une exigence explicite : **bordures limitées, non systématiques**. Ce document précise leur traduction en conception ; aucune interface n’est encore implémentée.

## 1. Direction visuelle et hiérarchie

Interface moderne, vive, propre et confortable pour une utilisation quotidienne. Fonds calmes, couleurs franches sur les actions, sélections et informations utiles. La couleur ne doit pas surcharger chaque panneau. Distinguer les groupes d’abord par l’espace, la typographie et les niveaux de surface, puis par une ombre légère lorsque nécessaire.

### Référence de produit : densité et clarté de Cloudflare

Le porteur retient comme référence qualitative les dashboards Cloudflare : navigation contextuelle stable, densité maîtrisée, pages plates, titres compacts, sous-menus prévisibles, sélecteur de contexte visible et interactions rapides. Cette référence ne doit pas être copiée à l’identique et n’autorise ni reprise de marque, ni couleurs, ni composants propriétaires.

La traduction Cercle Complet est obligatoire :

- logo officiel bleu/vert et tokens de la marque ;
- sidebar compacte avec icônes Lucide cohérentes, groupes et sous-menus repliables ;
- topbar sobre contenant contexte boutique, thème, notifications et profil ;
- changement entre vue globale et boutique sans ambiguïté ;
- surface principale large, peu de cartes imbriquées et aucun bandeau marketing permanent ;
- composants shadcn personnalisés, rayons modérés et séparateurs uniquement fonctionnels ;
- tableaux/listes denses mais tactiles, actions principales explicites ;
- transitions Motion de faible amplitude et sans animation décorative répétitive ;
- recherche rapide et raccourcis clavier à introduire lorsque le nombre d’écrans le justifie.

La structure du shell doit rester stable pendant l’ajout des phases : un nouveau domaine ajoute une entrée ou un sous-menu sans déplacer arbitrairement le contexte boutique, le profil ou les actions globales.

Ne pas entourer automatiquement les cartes, sections, tableaux ou indicateurs. Éviter les cartes imbriquées, les grilles quadrillées et les séparateurs répétés. Les composants shadcn/ui doivent être adaptés à cette direction : leurs bordures par défaut ne sont pas une décision graphique du projet.

## 2. Palette et tokens sémantiques

Les valeurs ci-dessous constituent la palette validée. Les couleurs de statut ne sont pas nécessairement des fonds de boutons ; vérifier chaque couple texte/fond. La teinte de marque est une approximation graphique du bleu du logo, pas une mesure du fichier source.

| Token logique | Clair | Sombre | Usage |
|---|---|---|---|
| background | `#F4F7FB` | `#0B1220` | Fond de page |
| surface / card / popover | `#FFFFFF` | `#131F32` | Cartes, menus et dialogues |
| foreground | `#10243A` | `#F1F5F9` | Texte principal |
| brand | `#06365B` | `#60A5FA` | Identité et accents de marque |
| primary | `#2563EB` | `#2563EB` | Action principale |
| primary-foreground | `#FFFFFF` | `#FFFFFF` | Texte sur action principale |
| brand-accent | `#A3E635` | `#A3E635` | Accent vif et sélection mise en avant |
| brand-accent-foreground | `#10243A` | `#10243A` | Texte sur vert citron |
| success | `#15803D` | `#4ADE80` | Résultat favorable |
| warning | `#B45309` | `#FBBF24` | Attention ou anomalie à traiter |
| destructive | `#DC2626` | `#F87171` | Erreur ou action destructive |

Tokens complémentaires de conception à vérifier au lot UI : muted-foreground `#526378` / `#A9B7CB`, surface-subtle `#EAF0F7` / `#1B2A40`, separator `#D8E1EC` / `#2A3B52`, focus-ring `#2563EB` / `#60A5FA`. Ces valeurs servent à compléter la palette, pas à imposer des contours partout. Pour un champ dont le contour est indispensable à l’identification, utiliser un token input-edge suffisamment contrasté, distinct du separator décoratif.

Créer des variables CSS sémantiques partagées puis les relier à Tailwind et shadcn/ui selon leurs versions retenues. Ne pas recopier des couleurs hexadécimales dans chaque écran. Séparer `brand-accent` du token technique `accent` de shadcn : tous les survols de menu ne doivent pas devenir vert citron.

Prévoir et vérifier séparément les états hover/pressed/disabled. Le disabled conserve une lisibilité suffisante et un état sémantique ; ne pas se limiter à rendre tout le composant presque transparent. Les alertes combinent libellé, icône et couleur. Une information de statut n’est jamais indiquée uniquement par une couleur.

## 3. Bordures : règle impérative

Ordre de préférence pour séparer : espace → niveau de fond → typographie → ombre discrète → bordure seulement si elle clarifie l’usage.

| Élément | Traitement |
|---|---|
| Cartes de dashboard | Pas de contour par défaut ; surface distincte, marge et éventuellement ombre légère |
| Sections de page | Titre et espace vertical ; pas de boîte ni ligne systématique |
| Navigation | Fond/texte/icône pour l’élément actif ; pas de cadre autour de chaque entrée |
| Tableaux | Pas de grille verticale ; en-tête distinct, espacement, survol ou bandes très légères ; séparateurs horizontaux seulement si nécessaires à la lecture |
| Champs | Fond subtil et libellé explicite ; contour discret admis si nécessaire pour reconnaître le contrôle |
| Boutons | Primaire rempli, secondaires tonals/ghost ; variante outline exceptionnelle, motivée par la hiérarchie |
| Dialogues et menus | Surface et élévation ; fin contour facultatif si le fond sombre ne suffit pas à délimiter |
| Focus clavier | Anneau visible obligatoire : ce repère fonctionnel n’est pas supprimé par la règle esthétique |
| Erreur de saisie | Message et icône ; contour de champ possible, sans encadrer tout le formulaire |

Une bordure décorative éventuelle est de 1 pixel, sobre. Ne pas remplacer toutes les bordures par des ombres lourdes. En mode sombre, privilégier les différences de surface aux ombres noires peu visibles. Si un contrôle devient ambigu sans contour, la compréhension et l’accessibilité priment.

## 4. Typographie

- **Manrope** : titres, navigation et boutons ; graisses 500/600/700 selon importance.
- **Inter** : textes, formulaires, tableaux, libellés et montants ; graisses 400/500/600, éventuellement 700 pour indicateurs.
- Héberger les fichiers de police dans l’application, avec fallbacks système ; ne pas dépendre d’un CDN externe pour leur affichage hors connexion. Charger seulement les styles utiles, respecter les licences distribuées avec les polices.
- Chiffres tabulaires pour montants et quantités comparés ; alignement à droite des valeurs dans les tableaux. Conserver devise, signe et formatage métier cohérents.

Échelle de départ : titre de page 24–32 px selon largeur, titre de section 18–20 px, corps et saisie 16 px, tableau/libellé secondaire 14 px, annotation non essentielle 12 px minimum. Interligne 1,45 à 1,6 pour le corps, 1,2 à 1,3 pour les titres. Ne pas réduire les montants ou actions essentielles à une taille illisible pour faire entrer une colonne. Zoom autorisé, pas de hauteur fixe coupant du texte agrandi.

## 5. Espacements, formes et élévation

Échelle commune fondée sur 4/8 px : 4, 8, 12, 16, 24, 32, 48. Marges de page indicatives : 16 px téléphone, 24 px tablette, 32 px grand écran. Espacement vertical plus généreux entre sections qu’entre champs d’un même groupe.

Rayons : champs/boutons 6–8 px, cartes 8–12 px, grands dialogues 12 px. Les rayons supérieurs sont réservés à une composition exceptionnelle et justifiée. Pastilles seulement pour badges et éléments qui le justifient. Cibles tactiles d’au moins 44 × 44 px ; hauteur usuelle de bouton/champ 48 px. Ne pas miniaturiser l’interface sur tablette.

Trois niveaux d’élévation suffisent : aucune ombre pour les surfaces ordinaires, ombre légère pour une carte si utile, ombre plus nette pour menu/dialogue flottant. La hiérarchie ne doit pas dépendre de l’ombre seule.

## 6. Composants et comportements

Utiliser Tailwind CSS pour les styles/tokens, shadcn/ui comme base des composants, Framer Motion pour les transitions ciblées. Construire des variantes partagées avant de multiplier les pages.

Une action principale par contexte visible : exemple « Encaisser » dans la caisse. Les actions secondaires restent sobres ; une suppression ou annulation engageante se distingue par son libellé et sa confirmation. Les sélections vert citron ne doivent pas être confondues avec une validation métier.

Chaque composant interactif définit : normal, hover lorsqu’applicable, focus, pressed/selected, disabled, loading et erreur. Les chargements conservent la place du contenu ; un clic répété ne crée pas une double commande. Les erreurs importantes persistent jusqu’à résolution ou acquittement approprié. Les toasts ne sont pas le seul moyen d’accéder à une information bloquante.

Icônes de style cohérent, taille usuelle 20–24 px ; libellé visible pour les actions importantes. Une action icône seule possède un nom accessible. Les dialogues gèrent focus initial, fermeture adaptée et restitution du focus ; les animations ne changent pas ces garanties.

## 7. Dashboards et visualisation de données

Cartes de synthèse sobres et peu encadrées, avec titre, valeur, unité/période et contexte utile. Accent vif ponctuel ; pas de grande surface saturée sur chaque indicateur. Revenus en bleu, information favorable en vert, attention en ambre, erreurs en rouge. Ne pas attribuer ces sens à des catégories qui ne les portent pas (une boutique n’est pas « en erreur » parce qu’elle est rouge sur une courbe).

Conserver la même couleur pour la même série entre écrans et fournir une légende. Prévoir palettes de séries supplémentaires vérifiées dans les deux thèmes, labels, marqueurs ou motifs en complément ; accès aux valeurs au toucher/clavier et présentation tabulaire si nécessaire. Ne pas inventer des tendances ou chiffres pour embellir un dashboard. Afficher période, fraîcheur et dernière synchronisation selon les règles métier.

## 8. Modes clair, sombre et système

Trois choix : **Clair · Sombre · Système**, disponibles aux deux rôles. Choix initial : Système. Pour ce produit, le mode Système utilise l’apparence claire ; le sombre reste un choix explicite. Conserver le choix localement sur l’appareil et l’appliquer sans différence d’hydratation. Le choix reste utilisable hors connexion.

Thématiser toute l’application : navigation, caisse, formulaires, tableaux, graphiques, menus, tooltips, dialogues, notifications et états de chargement. Ne pas limiter le sombre aux pages de dashboard. Une bascule ne perd ni panier, ni saisie, ni filtre et ne déclenche aucune commande métier.

Utiliser des tokens, pas un filtre d’inversion globale. Les photos de justificatifs conservent leurs couleurs. Impression : fond clair, contenu lisible et économe en encre, indépendamment du thème de consultation.

## 9. Logo validé

Le [logo V1](../assets/brand/cercle-complet-logo-proposition-v1.png) est approuvé par le porteur. Préserver ses proportions, le double C et le nom **Cercle Complet Sarl**. Ne pas recolorer arbitrairement le fichier pour le rapprocher du vert citron UI : accent de l’interface et couleur du logo peuvent différer.

Déclinaisons à produire avant intégration définitive : version adaptée au fond sombre avec bleu éclairci et vert conservé, monochrome, symbole seul pour petits formats et master vectoriel. Ces déclinaisons ne sont pas encore créées ni inspectées. En attendant, un support clair discret peut accueillir le PNG en thème sombre ; ne pas appliquer un filtre automatique qui dénature le logo.

Laisser une zone de respiration autour du logo ; vérifier sa taille minimale sur l’interface réelle. Ne pas utiliser le logo horizontal complet comme favicon, ni étirer ou rogner le nom pour le faire entrer dans la navigation.

## 10. Mouvement

Transitions courtes et souples : 120 ms pour un état simple, 180 ms pour panneau/onglet, jusqu’à 220 ms pour dialogue. Valeurs de départ à tester sur matériel réel. Préférer opacity/transform, mouvements de faible amplitude et courbes sans rebond. Pas d’animation d’entrée en cascade sur chaque ligne ni de compteur animé pour l’argent.

Respecter `prefers-reduced-motion` : supprimer déplacements/zooms non essentiels, conserver les informations d’état. Aucun délai décoratif avant une vente, une erreur ou une validation. Les interactions critiques fonctionnent indépendamment de la fin d’une animation.

## 11. Responsive et accessibilité

Appliquer intégralement [RSP01 à RSP10](10-ajouts-techniques-et-responsive.md) sur téléphone/tablette/ordinateur et les deux orientations. Aucune action uniquement au survol ; tactile, souris et clavier utilisables. La caisse devient une disposition adaptée au petit écran, sans suppression des fonctionnalités autorisées.

Objectifs de recette de contraste : au moins 4,5:1 pour texte courant, 3:1 pour grand texte et repères fonctionnels concernés. Mesurer les couples effectivement rendus, y compris transparence, survol et thème sombre ; la palette ne constitue pas à elle seule une preuve d’accessibilité. Ajuster la nuance d’un token si nécessaire, en conservant la direction validée et en documentant la correction.

Les séparateurs purement décoratifs n’ont pas à être renforcés pour simuler un contrôle ; à l’inverse, un focus ou une limite indispensable à la compréhension doit rester visible. Vérifier zoom 200 %, labels longs, erreurs et clavier virtuel.

## 12. Checklist de livraison UI

- Tokens centralisés, Manrope/Inter locales et variantes communes Tailwind/shadcn.
- Bordures justifiées par une fonction ; pas d’encadrement automatique de toutes les cartes/sections.
- Deux thèmes complets et choix Système persistant, sans perte d’état ni flash gênant.
- Hiérarchie lisible, focus visible, navigation tactile/clavier, contrastes mesurés.
- Mouvements sobres et réduction des animations prise en charge.
- Scénarios RSP applicables exécutés selon [la stratégie de tests](11-stack-et-strategie-tests.md) ; vérifications sur matériel réel pour clavier/veille.
- Tester une bascule de thème avec formulaire rempli et panier actif ; vérifier menus/dialogues/graphiques dans les deux thèmes.
- Consigner les résultats et les déclinaisons graphiques encore manquantes dans le statut d’implémentation ; ne pas déclarer des tests passés parce que ce document existe.

Ce document complète [l’identité et la stack UI](12-identite-et-design-ui.md) et fait autorité sur leur ancienne mention de palette/logo non validés. Il ne lance pas l’implémentation.
