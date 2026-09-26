# Écrans et expérience utilisateur

Version 2.1 : les [40 fiches détaillées](conception/03-fiches-ecrans.md) précisent les champs, entrées/sorties, commandes et données. Le tableau ci-dessous conserve les 28 écrans initiaux ; les 12 compléments sont listés en fin de document. La [matrice de couverture](conception/04-couverture.md) fait foi pour le rapprochement des parcours.

## Principes

Une action principale par écran. Téléphone 360 px minimum sans défilement horizontal pour les opérations quotidiennes. Cibles tactiles >=44 px, labels persistants, contraste et navigation clavier. Aucun code d’erreur brut seul. Afficher monnaie et unité partout où une confusion est possible. Pas de cartes décoratives remplies de métriques inutiles.

Terminologie française : « Nouvelle vente », « Demander des produits », « Enregistrer une dépense », « Recevoir des produits », « Compter ma caisse ». Éviter « ledger », « commit », « idempotence » dans le produit.

## Navigation gérant

Bas d’écran : **Accueil, Vendre, Stock, Demandes, Plus**. Plus : caisse, dépenses, clients/crédits si activés, achats, historique, synchronisation et compte.

Accueil : bouton Vendre, session ouverte/fermée, réceptions à confirmer, décisions reçues, stock bas, anomalies demandant réponse. Pas de solde théorique de caisse ni marge. Bandeau discret « Hors connexion · 3 ventes à envoyer » avec bouton détail. Une donnée serveur obsolète porte son horodatage.

## Navigation propriétaire

Barre latérale : Vue d’ensemble, Boutiques, Demandes, Achats, Stock et transferts, Fonds et dépenses, Clients et fournisseurs, Contrôles, Rapports, Paramètres. Un filtre boutique persistant, « Toutes » par défaut. Les pages de modules désactivés avec données résiduelles restent consultables pour règlement.

## Inventaire des écrans

| ID / route | Contenu et saisie | Action / états |
|---|---|---|
| E01 `/login` | E-mail, mot de passe, affichage password, récupération | Erreur générique ; chargement empêche double soumission |
| E02 `/setup` | Assistant entreprise, devise/fuseau, boutique, gérant | Brouillon possible, activation après soldes confirmés |
| E03 `/manager` | Raccourcis et tâches | Premier usage explique caisse en 3 phrases, pas tutoriel obligatoire long |
| E04 `/manager/sale` | Recherche nom/SKU/code-barres, quantités et unité, panier | Variante simple ajout direct ; variante multiple sélecteur ; scanner ajoute une ligne |
| E05 `/manager/sale/payment` | Total, mode, cash reçu, rendu, client si crédit | Défaut espèces ; options mixtes dans « Autres paiements » ; confirmation unique |
| E06 `/manager/sales/[id]` | Reçu et statut paiement, retours liés | Réimprimer, demander retour ; attente sync clairement indiquée |
| E07 `/manager/cash` | Statut session, bouton ouvrir/compter, clôtures passées | Aucun attendu courant dans DOM, API ou export |
| E08 `/manager/cash/count` | Grille coupures vide, +/−, total déclaré | Confirmation puis écran résultat figé, explication si écart |
| E09 `/manager/expenses/new` | Catégorie, motif, montant, source, photo | Libellé bouton adapté « Demander accord » / « Enregistrer paiement » |
| E10 `/manager/requests` | Liste état et date, nouvelle demande | Filtres en attente/à compléter/terminées |
| E11 `/manager/requests/[id]` | Lignes demandées et accordées, budget, décisions | Compléter, acheter si désigné, joindre justificatif ; aucune approbation |
| E12 `/manager/purchases/new` | Accord prérempli, fournisseur, prix réels, frais, paiements | « Acheter et recevoir » par défaut, option réception ultérieure |
| E13 `/manager/receipts/[id]` | Attendu, reçu vendable, abîmé, lots/dates | Confirmer reçu ; confirmer partiel explicitement ; pas bouton silencieux « tout reçu » |
| E14 `/manager/stock` | Recherche, disponible, unité, seuil, péremption | Demander réapprovisionnement ; détail mouvements sans marge |
| E15 `/manager/customers` | Nom/téléphone, dû, échéances | Créer client, encaisser règlement avec aperçu affectation |
| E16 `/manager/sync` | Dernier succès, file envoi, conflits | Réessayer, exporter sauvegarde chiffrée support si nécessaire ; jamais « tout effacer » |
| E17 `/owner` | Ventes, encaissements, dépenses, créances, résultat brut estimé, stock, écarts, décisions, alertes et fraîcheur | Entrée décisionnelle unique ; filtres dates/boutique ; états SETUP/EMPTY/ACTIVE/STALE/PARTIAL/ERROR ; liens vers écritures sources ; voir document 17 |
| E18 `/owner/requests/[id]` | Besoin, stock connu, historique, circuit et budget | Approver/partiel/complément/refuser ; motif selon décision |
| E19 `/owner/purchases` | Achats, paiements, réceptions, dettes | Nouvel achat, payer fournisseur, répartir produits |
| E20 `/owner/transfers` | Origine/destination, quantités, transit | Autoriser, expédier si source owner/dépôt, suivre écarts |
| E21 `/owner/funds` | Comptes déclarés, remises en transit, avances | Envoyer, confirmer reçu, examiner reliquat |
| E22 `/owner/controls` | Clôtures, écarts, inventaires, anomalies offline | Filtrer priorité/action requise, ouvrir dossier |
| E23 `/owner/controls/[id]` | Déclaration, attendu, actions, justificatifs | Demander explication, décider correction, résoudre |
| E24 `/owner/inventories/[id]` | Périmètre, comptages, différences | Démarrer/verrouiller, soumettre, valider, annuler avec motif |
| E25 `/owner/products` | Catalogue et grille prix par boutique | Créer/archiver, options avancées repliées |
| E26 `/owner/shops/[id]` | Gérant, soldes initiaux si SETUP, paramètres | Activer, suspendre, remplacer, fermer selon conditions |
| E27 `/owner/reports` | Période, boutique, type de rapport | CSV/PDF, progression exports longs, contenu selon filtres |
| E28 `/owner/settings` | Seuils simples, crédits, dépôt, sources, utilisateurs | Aperçu conséquences, enregistrer nouvelle version |

## Champs et validation ergonomique

- Texte : trim, nom 2..120, commentaire 0..1000, motif obligatoire 10..1000 pour correction/exception.
- Téléphone : accepter saisie locale/internationale, normaliser à partir pays choisi ; ne pas inventer format du client lors de l’initialisation.
- Montants : clavier numérique, séparateur de milliers d’affichage, décimales selon devise ; refuser NaN, exponentiel, négatif sauf champs spécifiés.
- Quantité : unité visible près du champ, conversion affichée « 2 cartons = 48 unités » avant validation.
- Photo : capture proposée, aperçu compressé, progression, erreur fichier explicite ; une panne n’efface pas le formulaire.
- Date : défaut aujourd’hui/échéance prescrite, date de péremption obligatoire si produit concerné.

## États communs

Vide : texte utile + bouton de première action. Chargement : squelette limité, pas valeurs zéro simulant absence de données. Erreur : conserver saisie, afficher action de reprise. Refus droits : écran accessible en lecture si permis, bouton non affiché mais protection API obligatoire. Réussite : référence et prochaines actions, pas redirection qui laisse douter du résultat.

Formulaire sale : avertissement navigation. Mode hors ligne : badge permanent, pas toast éphémère seul. Session clôturée : vente désactivée et bouton ouvrir. Autorisation attendue : « Envoyée au propriétaire », jamais « Paiement enregistré ».

## Reçus et rapports

Reçu : entreprise/boutique, référence, date, vendeur, lignes quantité/unité/prix/remise/net, total, modes, payé, dû si crédit. Pas coûts ou marges. Reçu hors ligne identifiant local conservé, référence serveur ajoutée après sync sans seconde vente.

Rapport caisse owner : solde début, flux cash, attendu avant comptage, déclaré, différence, corrections, statut de justification. Rapport réseau exclut doubles transferts ; distingue règlement de crédit ancien et vente du jour. Toutes pages datées indiquent fuseau et fraîcheur.

## Compléments identifiés à la revue

| ID / route | Rôle et but | Action principale |
|---|---|---|
| E29 `/manager/transfers/[id]` | Expéditeur boutique | Confirmer expédition réelle |
| E30 `/manager/funds` | Gérant détenteur ou destinataire | Remettre ou confirmer fonds |
| E31 `/manager/losses/new` | Déclaration de casse/manquant | Isoler et soumettre |
| E32 `/manager/inventories/[id]` | Comptage par gérant | Soumettre quantités |
| E33 `/manager/returns/[id]` | Retour et remboursement | Demander, recevoir puis rembourser |
| E34 `/owner/suppliers/[id]` | Dettes/règlements/retours, vue gérant restreinte | Payer ou rapprocher |
| E35 `/owner/sales/[id]` | Historique commercial et coût | Décider demande corrective |
| E36 `/owner/takeovers/[id]` | Recomptage/reprise appareil/passation | Appliquer correction liée |
| E37 `/owner/users` | Comptes et affectations | Inviter/remplacer |
| E38 `/owner/devices` | Appareil principal | Approuver/révoquer |
| E39 `/owner/sources` | Comptes déclarés et apports | Créer source/apport |
| E40 `/owner/locations` | Stock propriétaire et dépôt | Activer/consulter/transférer |

## Responsive transversal

Les règles de présentation et la recette RSP01 à RSP10 du complément s’appliquent à tous les écrans E01 à E40, aux deux rôles et à chaque état. Les tablettes prévues ne restreignent pas le support téléphone/ordinateur. Voir [le complément 2.2](10-ajouts-techniques-et-responsive.md).

## Design system validé

Appliquer [13-design-system.md](13-design-system.md) aux 40 écrans : thèmes clair/sombre/système, Manrope/Inter, palette vive et séparation par espace/surfaces avant toute bordure.

## Précision P00 : MFA

E01 comprend activation TOTP propriétaire, challenge et récupération par code de secours. E37 comprend la gestion du second facteur et la réauthentification sensible. Ce sont des étapes internes aux écrans existants ; les fiches générées détaillent leurs champs.
