# Revue de conception avant développement

Version 2.1 — 24 septembre 2026.

## Conclusion et niveau de confiance

La version 2.0 était un cadrage détaillé, mais pas encore un contrat de conception suffisamment fermé : certains états, relations et écrans manquaient. Cette revue complète les règles et fournit une traçabilité entre usages, interfaces, commandes, données et scénarios. Aucun logiciel applicatif n’est créé pendant cette étape.

On peut vérifier la cohérence documentaire ; on ne peut pas garantir une application « parfaite » par lecture seule. Le porteur a choisi une réalisation directe sans maquette cliquable séparée : la compréhension des écrans sera vérifiée progressivement sur les parcours applicatifs, et les garanties de concurrence, sécurité et synchronisation par les tests. Ces étapes ne doivent pas être présentées comme déjà exécutées.

## Périmètre de la revue

Deux acteurs humains, un seul gérant par boutique ; création et remplacement des comptes ; initialisation ; ventes et crédits ; caisse ; dépenses ; achats par les deux acteurs ; fonds ; réception ; transferts ; retours ; pertes et inventaires ; rapports ; documents ; déconnexion et reprise.

Les tableaux de transitions 2.1 sont normatifs. Le dictionnaire 2.1 précise les associations et champs manquants du modèle 2.0. Les fiches écrans décrivent l’organisation fonctionnelle, les champs, permissions et retours utilisateur ; elles ne constituent pas une validation graphique ou d’utilisabilité.

## Constats corrigés

| ID | Constat 2.0 | Décision de conception 2.1 | Référence |
|---|---|---|---|
| A01 | Appareil/capacité/session risquaient une dépendance circulaire à la première connexion | Enregistrer appareil sans capacité ; ouvrir session ; émettre capacité ensuite | transitions S01 |
| A02 | Capacité cash-only utilisée implicitement pour toute vente en ligne | Autorisation en ligne distincte ; même consommateur, types de preuve différents | transitions S02, S14 |
| A03 | Refus de vente pouvait bloquer indéfiniment la séquence locale | Refus avant exécution peut consommer séquence sans posting ; fait exécuté exige examen ; tombstone VOIDED audité | transitions S14 |
| A04 | Clôture offline supposait un état COUNTING serveur absent | Consommateur réalise OPEN→COUNTING→CLOSED atomiquement après high-water-mark | transitions S03 |
| A05 | Réceptions partielles de fonds n’avaient qu’un champ total | Table append-only de réceptions, somme dérivée et verrou sur remise | données 2.1 |
| A06 | Coûts des lots et compartiments insuffisamment reliés | Couche porte compartiment et envoi éventuel, FEFO puis FIFO du lot réel | données 2.1 |
| A07 | Frais d’achat pouvaient gonfler la dette d’un mauvais fournisseur | Frais sur facture séparés des dépenses externes, total fournisseur explicite | données 2.1, RM10 |
| A08 | Achat propriétaire réseau non attribuable clairement aux boutiques | Boutique gestionnaire nullable + destinations de lignes ; propriété réseau et valeur localisée | données 2.1 |
| A09 | Relations polymorphes laissaient l’intégrité au choix du codeur | Registre de documents typés, liens d’origine exclusifs sur réceptions ; FK explicites | données 2.1 |
| A10 | Annulation/retour et état immuable se contredisaient | Contenu posté figé, transitions lifecycle autorisées par événements ; pas édition des montants | transitions S02/S06 |
| A11 | Gérant sans écrans d’envoi, remise de fonds, inventaire ou correction | Ajout E29–E40, avec navigation et formulaires | fiches écrans |
| A12 | Inventaire pouvait constater deux fois un manquant déjà isolé | Compter AVAILABLE/DAMAGED/QUARANTINE séparément ; MISSING_PENDING traité dans dossier existant | transitions S11 |
| A13 | Remboursement après abandon de créance pas défini | Retour réduit d’abord dette vivante puis abandon rattaché, remboursement plafonné au paiement net reçu | RM11 |
| A14 | Rapports pouvaient confondre mouvements de cash et chiffre d’affaires | Formules issues des documents, encaissements et ventes distincts | reporting 2.1 |
| A15 | Suspension empêchait aussi de solder boutique avant fermeture | Mode règlement limité explicite, aucun nouveau commerce mais recouvrement autorisé | transitions S15 |
| A16 | Écran dépôt, utilisateur et appareil implicite | Administration détaillée E37/E38/E40 | fiches écrans |
| A17 | Demandes génériques pas assez reliées aux objets exécutés | Nature/cible typées et état de décision distinct des états d’exécution | transitions S04 |
| A18 | Les soldes initiaux clients/fournisseurs étaient évoqués sans modèle ni écran | Lignes de solde d’ouverture sans vente/achat fictif, avec paiements affectés | données et E02 |

Ces corrections sont des arbitrages de conception délégués ; elles ne prouvent pas leur implémentation. Les spécifications 2.0 concernées ont été rectifiées là où la règle générale change, et les précisions transversales sont centralisées ici.

## Critères de sortie de la conception

1. Chaque parcours métier identifié a au moins un écran, une commande, des données et un scénario : vérification documentaire automatisée.
2. Les états et transitions comportent acteur, conditions et effets : revue dans 01-transitions.
3. Les écrans comportent données saisies, lecture, action, erreurs et permissions : 03-fiches-ecrans.
4. Les relations importantes sont explicites, notamment preuves, dettes, retours et partialités : 02-donnees-et-relations.
5. Les chiffres ont une définition et une source : 05-reporting-et-exemples.
6. Les parcours critiques sont relus avec des exemples chiffrés et un scénario de démonstration papier.
7. Vérifier progressivement les interfaces réalisées avec le porteur ou un utilisateur représentatif, sans maquette préalable obligatoire. Cette validation en situation n’a pas encore eu lieu.

## Ce qui n’est pas bloquant pour concevoir

Nom de l’entreprise, vraies boutiques, noms des comptes, catalogue/prix réels et soldes initiaux : collectés dans l’assistant. Fournisseur d’hébergement, domaine et coûts d’exploitation : décider avant déploiement, pas inventer. Les seuils métier ont des défauts documentés et seront réglables.

## Vérifications effectuées le 24 septembre 2026

- Contrôle structurel des liens locaux, blocs Markdown et identifiants : réussi.
- Catalogue : 40 fiches E01–E40, références à transitions, chemins API et tables présentes.
- Recette : 84 scénarios T01–T84, reliés à fiches écran ou contrôle technique (T57–T59).
- Arithmétique documentaire : remise/arrondi, coûts fractionnés, frais d’achat, retour après abandon et scénario de caisse complet : vérifiée par script.
- Non exécutés : migration SQL, services applicatifs, tests de sécurité/concurrence/offline, validation ergonomique en situation réelle. Aucun résultat de ces tests n’est revendiqué.

## Démarrage conseillé de la revue humaine

Lire les schémas et les maquettes textuelles de 03-fiches-ecrans. Jouer le scénario : ouverture → vente cash → demande de produits → achat gérant → réception partielle → dépense → comptage → explication d’écart. Puis achat propriétaire → transfert → réception gérant. Enfin simuler une coupure. L’utilisateur doit pouvoir expliquer à chaque confirmation ce qui sera enregistré sans connaître les noms des tables ou des états techniques.
