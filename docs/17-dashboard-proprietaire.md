# Dashboard décisionnel du propriétaire

Date de décision : 25 septembre 2026. Ce document précise la cible de l’écran E17 et son enrichissement progressif de P03 à P09. Il complète les fiches d’écrans, le design system et le plan de développement.

## Décision de navigation

La route `/owner` est l’unique page d’entrée du propriétaire après connexion. Elle devient progressivement son tableau de bord décisionnel global. Aucune seconde page concurrente ne doit obliger le propriétaire à naviguer avant de connaître la situation de son activité.

Le contenu actuel de préparation n’est pas un dashboard métier distinct : il constitue l’état `SETUP` de la même page. Après initialisation, les sections décisionnelles remplacent progressivement ce contenu avec des données réelles.

Chaque indicateur est calculé côté serveur à partir des écritures autorisées. Aucun chiffre de démonstration, faux zéro ou tendance décorative n’est affiché en production.

## Questions auxquelles la page doit répondre

La lecture initiale doit permettre au propriétaire de comprendre rapidement :

- la valeur des ventes sur la période choisie ;
- les montants réellement encaissés ;
- les créances clients encore dues ;
- les dépenses et autres sorties validées ;
- le résultat brut estimé, avec définition et périmètre visibles ;
- le stock disponible, sa valeur et les risques de rupture ;
- les boutiques qui progressent, régressent ou n’ont pas transmis de données fraîches ;
- les écarts de caisse ou de stock ouverts ;
- les demandes et décisions en attente ;
- les produits bientôt en rupture, expirés, immobilisés ou non vendables ;
- les opérations locales encore en attente de synchronisation ;
- les événements qui nécessitent une action immédiate.

La page ne prétend pas fournir une comptabilité générale ou un résultat fiscal. Chaque libellé précise ce qui est inclus dans son calcul.

## Organisation cible

L’ordre de lecture est le suivant :

1. contexte et période ;
2. fraîcheur et couverture des données ;
3. alertes et décisions prioritaires ;
4. indicateurs financiers ;
5. situation comparative des boutiques ;
6. situation du stock ;
7. tendances et répartitions ;
8. activité récente traçable.

### Contexte et filtres

Le bandeau de contrôle contient :

- toutes les boutiques ou une boutique autorisée ;
- aujourd’hui, semaine, mois ou période personnalisée ;
- date et heure de dernière consolidation ;
- état complet, partiel ou ancien des données ;
- fuseau et devise de l’entreprise lorsque leur rappel évite une ambiguïté.

Les filtres s’appliquent de manière cohérente à toutes les sections. Un changement de filtre conserve le contexte pendant la navigation vers un détail lorsque cela est pertinent.

### Indicateurs financiers

| Indicateur | Sens attendu |
|---|---|
| Ventes | Valeur des ventes validées sur la période |
| Encaissements | Argent effectivement reçu sur la période, séparé des ventes à crédit |
| Créances | Solde restant dû par les clients autorisés |
| Dépenses | Sorties validées selon les catégories et sources retenues |
| Résultat brut estimé | Ventes diminuées du coût des produits sortis et des dépenses incluses ; définition affichée |
| Stock disponible | Quantité et valeur du stock vendable selon les couches réelles |
| Écarts ouverts | Dossiers de caisse, inventaire, réception ou synchronisation non résolus |
| Décisions en attente | Demandes, dépenses, achats ou exceptions nécessitant le propriétaire |

Chaque indicateur est cliquable lorsque son détail existe. Le détail mène aux écritures ou documents sources autorisés. Un indicateur indisponible affiche sa raison ; une absence de données ne devient jamais automatiquement zéro.

### Comparaison des boutiques

La comparaison globale expose, selon les domaines déjà livrés :

- ventes ;
- encaissements ;
- dépenses ;
- marge ou résultat brut estimé ;
- stock disponible ;
- ruptures ou seuils atteints ;
- écarts ouverts ;
- dernière clôture ;
- fraîcheur et dernière synchronisation.

Une boutique dont les données sont anciennes ou partielles reste visible avec son statut. Elle n’est pas classée comme si ses chiffres étaient complets.

### Alertes prioritaires

Les alertes actionnables précèdent les graphiques. Exemples :

- demandes de réapprovisionnement à décider ;
- écarts de caisse à examiner ;
- produits sous le seuil ;
- boutique sans clôture récente ;
- appareil ou boutique non synchronisé ;
- réception incomplète ou anomalie de stock ;
- créance échue ou dette fournisseur selon options activées.

Une alerte contient un nombre réel, une priorité, une date, un périmètre et un lien vers le dossier concerné. Une notification purement informative est distinguée d’une action obligatoire.

### Graphiques et tableaux

Les visualisations pertinentes comprennent :

- ventes et encaissements dans le temps ;
- comparaison des boutiques ;
- répartition par famille de produits ;
- évolution des dépenses ;
- produits les plus vendus ;
- stock faible, expirant ou immobile.

Un graphique affiche période, unité, légende, fraîcheur et accès aux valeurs au clavier ou au toucher. Une présentation tabulaire équivalente est fournie lorsque nécessaire. Les couleurs seules ne portent pas le sens.

## États de la route `/owner`

| État | Comportement |
|---|---|
| `SETUP` | Entreprise non initialisée : étapes restantes, accès utilisateurs/appareils et action d’initialisation ; aucun indicateur fictif |
| `EMPTY` | Entreprise initialisée sans activité : indicateurs explicitement sans données et actions pour commencer |
| `ACTIVE` | Données consolidées et indicateurs réels |
| `STALE` | Dernière donnée trop ancienne : heure affichée, avertissement et chiffres marqués anciens |
| `PARTIAL` | Certaines boutiques ou sources manquent : couverture affichée et agrégats marqués partiels |
| `ERROR` | Consolidation indisponible : cause compréhensible, dernière donnée fiable éventuelle et action de reprise |

Le serveur fournit l’état et la fraîcheur. Le client ne les déduit pas uniquement d’une absence de lignes.

## Enrichissement par phase

| Phase | Contenu ajouté à `/owner` |
|---|---|
| P02 | Shell, sécurité, navigation, état `SETUP`, utilisateurs et appareils ; aucun chiffre métier |
| P03 | Structure définitive, boutiques, catalogue, fonds et stocks initiaux ; passage `SETUP` vers `EMPTY` |
| P04 | Ventes, encaissements immédiats et situation de caisse disponible selon les droits |
| P05 | Dépenses, clôtures aveugles, écarts et alertes de contrôle |
| P06 | Demandes, achats, réapprovisionnements, transferts et décisions en attente |
| P07 | Créances, dettes, retours, pertes, inventaires et contrôles avancés |
| P08 | Fraîcheur, couverture, synchronisation, états `STALE` et `PARTIAL` fiables |
| P09 | Consolidation finale, comparaisons, tendances, rapports, exports et traçabilité complète |

Chaque phase ajoute seulement les blocs alimentés par des données et contrats réels. P09 finalise le dashboard ; elle ne reporte pas les lectures quotidiennes utiles des phases antérieures.

## Contrats et traçabilité

La cible principale reste `GET /api/v1/reports/overview`, complétée par `GET /api/v1/notifications` et les routes de détail des domaines concernés. La réponse de synthèse doit inclure au minimum :

- période demandée et période réellement couverte ;
- boutique ou périmètre global ;
- devise et fuseau ;
- date de calcul ;
- fraîcheur globale et par boutique ;
- couverture complète ou partielle ;
- valeurs et statut de disponibilité de chaque indicateur ;
- compteurs d’alertes et décisions ;
- liens ou identifiants permettant d’ouvrir les sources autorisées.

Les agrégats sont réconciliés avec les journaux et projections. Les permissions s’appliquent aux synthèses, détails et exports. Les données d’une boutique non autorisée ne sont jamais envoyées puis masquées par l’interface.

## Présentation

Le dashboard suit le design system :

- sidebar et topbar communes ;
- hiérarchie compacte et lisible ;
- bordures rares ;
- rayons modérés ;
- surfaces sobres ;
- Manrope pour la hiérarchie et Inter pour les valeurs ;
- animations courtes qui expliquent un changement d’état ;
- modes clair, sombre et système ;
- téléphone, tablette et ordinateur sans suppression d’une fonction autorisée.

Sur petit écran, les alertes et indicateurs prioritaires précèdent les graphiques. Les tableaux deviennent des listes ou vues détaillées sans perdre les valeurs essentielles.

## Recette minimale

La recette doit vérifier :

- aucun chiffre avant données réelles ;
- exactitude des agrégats par rapport aux écritures sources ;
- séparation ventes, encaissements, créances et dépenses ;
- sélection toutes boutiques ou boutique unique ;
- périodes et fuseau ;
- drill-down vers les sources ;
- état vide distinct de zéro ;
- données anciennes ou partielles explicitement signalées ;
- absence de fuite interboutiques ;
- cohérence téléphone/tablette/ordinateur ;
- clair/sombre et accessibilité des graphiques ;
- export conforme au même périmètre que l’écran.
