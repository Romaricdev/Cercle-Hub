# Spécifications de réalisation

Version 2.2 — 24 septembre 2026 — Décisions prises sur délégation du porteur du projet.

Lire en priorité le [complément technique et responsive](10-ajouts-techniques-et-responsive.md) pour les décisions récentes : stack, VPS/Docker, versions stables et adaptation de tous les écrans. Les précisions métier 2.1 restent applicables.

## Autorité documentaire

Ces spécifications résolvent les arbitrages du cadrage et servent de contrat à l’implémentation. Elles priment sur les propositions ouvertes de `../DOCUMENTATION_PROJET.md` et sur le Word initial en cas de divergence. Elles ne prétendent pas que chaque arbitrage a été individuellement signé par le client. Le porteur du projet a donné carte blanche pour privilégier simplicité et facilité de prise en main.

Ordre de lecture et de priorité : décisions → règles métier → workflows → modèle de données et API → écrans → recette. Une contradiction constatée doit être corrigée dans les documents concernés avant le code. Ne pas choisir silencieusement la règle la plus facile.

## Revue de conception avant développement

Lire d’abord [conception/00-audit.md](conception/00-audit.md), [conception/01-transitions.md](conception/01-transitions.md), [conception/02-donnees-et-relations.md](conception/02-donnees-et-relations.md) et [conception/03-fiches-ecrans.md](conception/03-fiches-ecrans.md). Ces précisions 2.1 ferment les ambiguïtés recensées ; elles priment sur une formulation générale 2.0 restante. La [matrice de couverture](conception/04-couverture.md) relie parcours, écrans, commandes, tables et scénarios.

Les statuts de conception restent documentaires pour les parcours métier non livrés. Le socle P01 et l’accès P02 sont installés et testés localement ; P03 n’est pas commencée.

## Phase P00 réalisée, socle P01 installé

Lire [les décisions, versions et le backlog exécutable](p00/README.md), puis [le verrouillage P01](p01/README.md). L’état des commandes réellement exécutées est dans [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Carte des documents

| Document | Usage |
|---|---|
| [00-decisions.md](00-decisions.md) | Périmètre, défauts et arbitrages fermes |
| [01-regles-metier.md](01-regles-metier.md) | Calculs, écritures, invariants |
| [02-permissions.md](02-permissions.md) | Autorisations et protection des données |
| [03-modele-donnees.md](03-modele-donnees.md) | Tables, contraintes et index |
| [p01/README.md](p01/README.md) | Versions verrouillées du socle et écarts assumés par rapport aux candidats P00 |
| [p02/README.md](p02/README.md) | Accès sécurisés et design system livrés localement |
| [16-guide-cursor.md](16-guide-cursor.md) | Utilisation des règles et skills du projet dans Cursor |
| [17-dashboard-proprietaire.md](17-dashboard-proprietaire.md) | Cible décisionnelle de `/owner`, états et enrichissement P03–P09 |
| [15-phases-developpement.md](15-phases-developpement.md) | Plan actif P00–P12, dépendances, livrables et critères de passage |
| [14-securite-conception-et-recette.md](14-securite-conception-et-recette.md) | Sécurité détaillée, protections et 21 scénarios SEC |
| [13-design-system.md](13-design-system.md) | Référence UI validée : couleurs, typographie, thèmes et bordures limitées |
| [12-identite-et-design-ui.md](12-identite-et-design-ui.md) | Cercle Complet Sarl, stack UI, animations et proposition de logo |
| [11-stack-et-strategie-tests.md](11-stack-et-strategie-tests.md) | Outils unitaires/intégration/E2E, commandes et validation |
| [10-ajouts-techniques-et-responsive.md](10-ajouts-techniques-et-responsive.md) | Ajouts récents, statuts de décision et recette responsive RSP01 à RSP10 |
| [04-architecture.md](04-architecture.md) | Stack, structure, transactions |
| [workflows/01-caisse-ventes.md](workflows/01-caisse-ventes.md) | Sessions, ventes, retours, dépenses, crédit |
| [workflows/02-achats-stock.md](workflows/02-achats-stock.md) | Demandes, achats, fonds, livraisons et inventaires |
| [workflows/03-administration.md](workflows/03-administration.md) | Initialisation, produits, gérants, fermeture |
| [05-hors-connexion.md](05-hors-connexion.md) | Protocole local et synchronisation |
| [06-ecrans.md](06-ecrans.md) | Navigation, champs, actions et erreurs |
| [api/contrats.md](api/contrats.md) | Contrats REST et commandes |
| [07-securite-exploitation.md](07-securite-exploitation.md) | Authentification, sauvegardes, exploitation |
| [08-recette.md](08-recette.md) | Scénarios déterministes et propriétés |
| [09-plan-implementation.md](09-plan-implementation.md) | Lots et critères de livraison |

## Ce qui reste une donnée à renseigner

Le nom de l’entreprise est Cercle Complet Sarl. Les noms des boutiques et utilisateurs, le vrai catalogue, les prix, stocks et fonds initiaux, l’hébergement et le domaine ne sont pas inventés. Un assistant d’initialisation les collecte. Les défauts ci-dessous permettent de développer sans attendre ces données.

Le socle P01 compile, migre et se teste localement. Les parcours métier, écrans E01–E40 et données d’exploitation ne sont pas implémentés. Cursor ne doit pas déclarer ces parcours terminés sur la seule présence du socle.

## Vérification documentaire

`python scripts/check_docs.py` depuis la racine vérifie liens locaux, blocs Markdown, inventaire de 84 scénarios et 40 écrans, ainsi que les références des fiches aux transitions, chemins API et noms de tables. `python scripts/check_design_examples.py` vérifie l’arithmétique des exemples financiers. Ces contrôles ne valident ni migrations SQL ni application. Les sources techniques officielles sont référencées dans l’architecture.

Les fiches et la matrice sont générées à partir du catalogue déclaré dans `scripts/build_design_docs.py` ; le script produit `docs/conception/catalogue-ecrans.json` et les deux Markdown correspondants. Modifier la source puis régénérer pour éviter leur divergence. Les règles métier et contrats restent la référence normative, le catalogue en est la carte de couverture.

## Plan de réalisation actif

Suivre [les phases P00 à P12](15-phases-developpement.md) et [leur état réel](IMPLEMENTATION_STATUS.md). Ce découpage remplace les lots historiques, avec correspondance explicite. P01 et P02 sont réalisées localement ; la prochaine phase autorisée séparément est P03.
