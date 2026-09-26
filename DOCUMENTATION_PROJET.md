> Mise à jour documentaire du 24 septembre 2026 : consulter [le complément technique et responsive 2.2](docs/10-ajouts-techniques-et-responsive.md), prioritaire sur les anciennes propositions de stack et de formats d’écran de ce cadrage historique.

# Documentation du projet de gestion des boutiques

Version 1.0 — Consolidation des échanges au 23 septembre 2026.

> **Mise à jour de référence :** après délégation des arbitrages et revue de conception, les spécifications version 2.1 sont disponibles dans [docs/README.md](docs/README.md). Les décisions de ce dossier remplacent les propositions ouvertes et questions non résolues ci-dessous. Ce fichier reste la trace consolidée du cadrage initial. La phase actuelle est la conception, sans démarrage du développement. Lire `AGENTS.md` et `docs/conception/00-audit.md`.

## 1. Objet et statut de ce document

Ce fichier rassemble les besoins, décisions, règles fonctionnelles et workflows discutés pour l’application. Il constitue la référence de travail pour la conception détaillée et le développement. Il ne s’agit pas d’une transcription littérale de la conversation.

Le client a validé le cahier des charges fonctionnel et donné son accord pour réaliser l’application. Cette validation a été rapportée par le porteur du projet. Les propositions détaillées formulées ensuite ne doivent pas toutes être considérées comme des décisions déjà approuvées par le client.

Trois statuts sont utilisés :

- **Confirmé** : besoin ou choix explicitement exprimé ou accepté dans les échanges.
- **Proposé** : règle de fonctionnement élaborée pendant la réflexion, à confirmer avant implémentation si elle structure le comportement métier.
- **À préciser** : donnée ou arbitrage encore manquant.

Document de référence existant : [Cahier des charges fonctionnel Word](Cahier_des_charges_fonctionnel_Gestion_des_boutiques.docx), version 1.0 du 19 septembre 2026, 16 pages. Le présent fichier intègre les précisions ultérieures ; il ne signifie pas que le document Word a été mis à jour.

## 2. Contexte et finalité

Le client possède actuellement trois boutiques vendant différents produits. Il est régulièrement en déplacement et confie les boutiques à des gérants. Les enregistrements actuels sont archaïques et peu fiables. Il manque une visibilité claire sur les recettes, dépenses, fonds confiés et stocks, globalement et par boutique. Des fonds peuvent être détournés sans trace suffisante.

L’application web doit devenir le registre de référence de l’activité et permettre de retracer :

- Ce qui a été vendu et réellement encaissé.
- Ce qui a été dépensé et depuis quelle source de fonds.
- Les fonds confiés, reçus, utilisés et reversés.
- Les produits acquis, reçus, vendus, transférés, retournés, endommagés ou perdus.
- Les responsables, autorisations, justificatifs et corrections.
- Les écarts entre les données enregistrées et les déclarations ou comptages physiques.

La solution doit permettre d’ajouter de nouvelles boutiques sans modification spécifique de l’application.

### Limite de la fiabilité informatique

Une application peut garantir la cohérence et l’historique des opérations saisies, mais ne constate pas seule la présence de billets ou de marchandises. Une vente physique non enregistrée peut rester invisible jusqu’à un rapprochement ou un inventaire. Une déclaration de caisse n’est pas une vérification indépendante.

Le vocabulaire du produit doit distinguer données calculées, données déclarées et données contrôlées. Un écart déclaré de zéro ne prouve pas la présence réelle des fonds.

## 3. Décisions confirmées et évolution du périmètre

| Sujet | Décision retenue | Statut |
|---|---|---|
| Boutiques | Trois au démarrage, création de boutiques supplémentaires possible | Confirmé |
| Responsabilité | Un seul gérant actif par boutique, avec son espace et sa caisse | Confirmé |
| Propriétaire | Vue globale et par boutique, autorisations et contrôle | Confirmé |
| Réapprovisionnement par le gérant | Le gérant demande, le propriétaire valide, le gérant achète et acquiert les produits | Confirmé |
| Réapprovisionnement par le propriétaire | Le propriétaire peut acheter puis remettre ou transférer les produits au gérant | Confirmé |
| Produits | Prendre en compte unité, poids, volume, conditionnements, variantes, lots, péremption et codes-barres | Confirmé |
| Dépôt | Fonctionnalité disponible de manière optionnelle ; existence réelle d’un dépôt inconnue | Confirmé |
| Crédit | Prévoir ventes à crédit et achats à crédit, activables selon le besoin | Confirmé |
| Connexion | Utilisation quotidienne en ligne, continuité temporaire en cas de coupure | Confirmé |
| Autorisations | Seuils, exceptions et droits paramétrables | Confirmé |
| Conservation des recettes | Ne pas imposer au gérant de conserver ou reverser les fonds selon une politique prédéfinie | Confirmé |
| Clôture | Comptage sans afficher le montant attendu avant soumission | Confirmé |
| Contrôles physiques indépendants | Hors du périmètre initial pour simplifier | Confirmé |

### Précision sur l’argent physique

Le logiciel ne doit pas imposer une politique de conservation ou de reversement des recettes. Pour calculer une caisse cohérente, il doit néanmoins enregistrer les remises, achats, dépenses et autres mouvements réellement effectués. Les fonds conservés restent dans la caisse ; une remise au propriétaire doit être enregistrée lorsqu’elle a réellement lieu.

### Évolution par rapport au premier cahier des charges

Les variantes, conditionnements, lots, péremption, codes-barres, crédits, dépôt optionnel et fonctionnement temporaire hors ligne, initialement présentés comme des possibilités à confirmer, sont désormais à prendre en compte. Leur paramétrage précis reste à définir. Les contrôles physiques indépendants ont été discutés puis exclus du périmètre initial.

## 4. Principes métier transversaux

1. Un brouillon n’a aucun effet sur les soldes, la caisse ou les stocks.
2. Une demande exprime un besoin ; une autorisation fixe ce qui peut être réalisé.
3. Une autorisation ne constitue ni un paiement ni une réception.
4. Vente, achat, paiement, réception et contrôle sont distincts mais reliés.
5. Toute opération validée possède une référence unique, une boutique ou un lieu, un auteur, une date réelle et une date de saisie.
6. Une opération ne produit ses effets qu’une seule fois, même après double clic ou retransmission.
7. Les opérations validées ne sont pas supprimées silencieusement. Les corrections conservent l’original et leur motif.
8. Les modifications de prix, conversions et règles ne réécrivent pas les opérations passées.
9. Un transfert interne n’est ni une vente ni un revenu supplémentaire.
10. Un achat, son paiement et son transfert ne doivent pas produire plusieurs dépenses pour le même fait.
11. Les réceptions et paiements partiels sont représentés explicitement.
12. Un fait réel déjà survenu doit rester déclarable, même s’il est irrégulier ; son enregistrement ne vaut pas autorisation.
13. Une explication ne résout pas automatiquement un écart.
14. Une absence de réponse du propriétaire ne vaut pas accord.
15. Les opérations du propriétaire restent historisées ; il ne demande pas son propre accord pour ses actions autorisées.

### Objets fonctionnels à distinguer

| Objet | Rôle |
|---|---|
| Demande | Exprimer un besoin de produits, fonds, dépense ou correction |
| Autorisation | Définir produits, quantités, montants et conditions approuvés |
| Vente ou achat | Décrire l’opération commerciale |
| Paiement ou mouvement de fonds | Retracer l’argent effectivement reçu, payé ou confié |
| Mouvement de stock | Retracer la quantité et sa localisation |
| Contrôle ou dossier d’écart | Comparer, expliquer et traiter les différences |

L’interface doit rester simple : ces distinctions ne nécessitent pas forcément un écran séparé pour chaque objet.

## 5. Utilisateurs et espaces

### 5.1 Propriétaire

Accès à toutes les boutiques, gestion des boutiques et utilisateurs, catalogue et paramètres, traitement des demandes, achats directs, mouvements de fonds, transferts, corrections autorisées, rapports et historique.

Son accueil doit faire ressortir les demandes en attente, réceptions non confirmées, dossiers incomplets, écarts ouverts, clôtures manquantes et boutiques non synchronisées.

### 5.2 Gérant

Accès à sa boutique uniquement : ventes, paiements, stock, demandes, achats autorisés, dépenses, réceptions, clôtures, explications et justificatifs.

Un gérant ne peut pas approuver sa propre demande lorsqu’elle exige l’accord du propriétaire.

### 5.3 Comptes et responsabilités

Comptes nominatifs, conservation de l’auteur après départ, désactivation sans effacement, droits appliqués aussi aux recherches, exports et justificatifs.

La caisse et le stock appartiennent à la boutique, pas au compte personnel du gérant. Une réaffectation ne change pas l’origine des opérations passées.

Les profils vendeur, caissier, comptable ou superviseur ont été évoqués mais ne sont pas retenus comme nécessaires au démarrage. Le besoin actuel est un gérant actif par boutique et le propriétaire.

## 6. Produits et stocks

### 6.1 Catalogue

Référence unique, désignation, catégorie, unité de stock, statut, prix, coûts d’achat, boutiques concernées et seuils de stock minimum. Options activables par produit : variantes, lots, péremption, conditionnements et codes-barres.

Chaque variante gère son propre stock. Les quantités entières ou décimales dépendent de l’unité et d’une précision définie.

### 6.2 Conversions

Unité de référence unique par produit. Exemple : 1 carton = 24 bouteilles ; achat de 10 cartons = entrée de 240 bouteilles ; vente d’un carton = sortie de 24 bouteilles.

La conversion utilisée est conservée dans l’opération. Sa modification future ne change pas le passé.

### 6.3 Lots et péremption

Les entrées et sorties des produits suivis sont rattachées aux lots. Proposition : suggérer le lot vendable expirant le plus tôt. Alertes avant échéance et blocage des produits expirés selon règle à définir.

### 6.4 États et localisations

Stock disponible, non vendable, en transit et éventuellement réservé doivent être distingués. Localisations possibles : boutique, dépôt optionnel, produits détenus par le propriétaire, produits acquis à retirer chez un fournisseur.

Une commande ou une demande approuvée ne crée pas de stock disponible. Une marchandise ne doit pas être comptée deux fois dans le total réseau.

### 6.5 Valorisation

Les coûts historiques nécessaires aux marges sont conservés. La méthode de valorisation et d’affectation des frais d’achat reste à choisir. Une marge ne doit pas apparaître comme fiable lorsque les coûts sont manquants.

## 7. Fonds, ventes et résultats

Distinctions obligatoires :

- Chiffre d’affaires : ventes nettes des corrections applicables.
- Encaissements : sommes réellement reçues, y compris règlements différés.
- Caisse en espèces : argent théorique détenu physiquement dans la caisse.
- Autres moyens de paiement : suivis séparément des espèces.
- Créances : sommes restant dues par les clients.
- Dettes fournisseurs : sommes restant à payer pour les achats.
- Avances : fonds confiés dont l’utilisation ou le reliquat reste à suivre.
- Marge brute estimée : ventes nettes moins coût des produits vendus, selon méthode validée.

La marge brute n’est pas le bénéfice net. Un apport du propriétaire n’est pas une vente. Une remise interne n’est pas une nouvelle charge. Les retraits personnels sont identifiés séparément des charges d’activité.

Formule de caisse : **fonds de départ + entrées en espèces − sorties en espèces**.

Les paiements Mobile Money, carte et virement n’augmentent pas les espèces attendues. Un paiement mixte ne les augmente que pour sa composante en espèces, nette de la monnaie rendue.

## 8. Paramètres à prévoir

Paramètres réseau, avec exceptions par boutique si nécessaire :

- Catégories et plafonds des dépenses autorisées.
- Autorisation préalable, justificatifs et traitement des urgences.
- Prix applicables et limites de remise.
- Retours, remboursements et annulations.
- Activation du crédit, plafonds et échéances.
- Budgets d’achat, substitutions et dépassements.
- Ajustements de stock et pertes.
- Seuils de stock minimum et alertes de péremption.
- Modes de paiement.
- Activation du dépôt.
- Opérations et durée autorisées hors connexion.
- Fréquence des clôtures et inventaires.

Proposition : règles simples pour la première version, sans moteur de conditions complexe. Les changements de paramètres sont historisés et ne réécrivent pas les accords passés.

## 9. Workflows fonctionnels

Les parcours ci-dessous sont la base proposée pour la spécification détaillée. Les étapes relevant de besoins confirmés sont conservées ; les choix opérationnels fins restent soumis aux arbitrages recensés en fin de document.

### WF01 — Création et mise en service d’une boutique

**Parcours :** création → configuration → affectation du gérant → soldes initiaux → activation.

1. Le propriétaire crée la boutique en préparation.
2. Il définit ses paramètres, prix, moyens de paiement et droits.
3. Il affecte un gérant actif.
4. Le stock initial est enregistré à partir d’un comptage physique.
5. La caisse initiale est déclarée à partir des fonds présents.
6. Le propriétaire valide les soldes et active la boutique.

Un zéro doit être confirmé. Les soldes initiaux ne constituent pas des achats ou ventes du jour. Les corrections après activation passent par des ajustements tracés. Les créances et dettes de départ sont reprises si ces fonctions sont utilisées.

### WF02 — Création et activation d’un produit

**Parcours :** création → unités et options → prix → activation dans les boutiques.

Le propriétaire renseigne le catalogue, les variantes, conversions et options utiles. Aucun stock n’est créé par la simple création du produit. Un produit déjà utilisé est désactivable sans effacement de son historique.

### WF03 — Ouverture de caisse

**Proposition : une seule session ouverte par boutique.**

1. Le gérant se connecte et vérifie la session précédente.
2. À la première ouverture, le solde de départ est le montant initial validé.
3. Ensuite, il reprend le montant déclaré à la clôture précédente, corrigé des mouvements enregistrés entre sessions.
4. Si une session est encore ouverte, il la reprend ou la clôture avant d’en créer une autre.

Le gérant ne remplace pas librement le fonds de départ. Les ajouts et retraits sont des mouvements distincts. L’écart précédent reste visible ; la reprise du montant physique déclaré ne le résout pas. Les modalités de mouvements entre sessions restent à détailler.

### WF04 — Vente avec paiement immédiat

**Parcours :** produits → quantités → prix et remise → paiement → validation.

Contrôles : disponibilité, unité, lot éventuel, prix autorisé, remise et cohérence des paiements.

À validation, la vente, la sortie de stock et le paiement sont enregistrés de manière cohérente et une seule fois. Une remise dépassant les droits attend l’autorisation. Le stock insuffisant est bloquant par défaut, règle proposée à confirmer.

Un abandon de brouillon n’a aucun effet. Une erreur après validation suit un workflow correctif. Un reçu reprend la référence et les données de vente ; format et impression restent à préciser.

### WF05 — Vente à crédit et règlement client

**Parcours :** client identifié → vente → paiement initial éventuel → contrôle des limites → validation → règlements.

Le stock diminue pour toute la vente. Seul le montant reçu augmente les encaissements. Le reste constitue une créance rattachée au client et à la vente, avec échéance si applicable.

Un règlement ultérieur réduit la créance et enregistre un encaissement, sans nouvelle vente ni sortie de stock. Les dépassements de plafond et abandons de créance sont encadrés. La portée du solde client entre plusieurs boutiques reste à préciser.

### WF06 — Demande de réapprovisionnement

**Parcours :** brouillon → soumission → examen → décision.

Le gérant renseigne produits, quantités, prix estimés, frais, fournisseur éventuel, motif et urgence. Le propriétaire approuve tout ou partie, ajuste, demande un complément ou refuse avec motif.

Il choisit le circuit : achat par le gérant, achat par le propriétaire ou prélèvement dans un stock existant. L’autorisation conserve les lignes, quantités, budget et conditions. Elle ne déplace ni fonds ni stock.

### WF07 — Réapprovisionnement acheté par le gérant

**Parcours :** autorisation → financement → achat → réception → justification → clôture.

1. L’autorisation précise l’usage de la caisse ou l’avance à recevoir.
2. Une remise de fonds fait l’objet d’une confirmation de réception.
3. Le gérant achète et renseigne fournisseur, produits, quantités, prix réels, frais et justificatifs.
4. Les paiements précisent la source des fonds ; un solde fournisseur est possible si le crédit est activé.
5. Le gérant confirme les quantités reçues, leur état, les lots et dates requis.
6. Les quantités reçues et vendables deviennent disponibles.
7. Le propriétaire rapproche accord, achats, paiements, réceptions et reliquat.

Proposition : les produits reçus peuvent être vendus avant le contrôle documentaire final, avec mention « déclaré reçu, contrôle en attente ».

Exceptions : complément préalable pour dépassement prévisible ; déclaration d’anomalie si dépassement déjà réalisé ; substitution autorisée ; réception partielle ; justificatif manquant ; reliquat à restituer, maintenir dans une caisse identifiée ou réaffecter avec accord.

Le contrôle ne crée aucune seconde dépense ni entrée de stock. La clôture exige que les quantités et fonds restants soient expliqués et traités. Le fait que le gérant achète et réceptionne lui-même reste visible.

### WF08 — Réapprovisionnement acheté par le propriétaire

**Parcours :** initiative ou demande → achat → localisation → répartition → expédition/remise → réception → contrôle.

Le propriétaire enregistre achat, fournisseur, coûts, justificatifs et paiements. Les dates d’achat, paiement et réception peuvent différer. Un achat peut alimenter plusieurs boutiques.

Les produits sont localisés : remise directe, détention par le propriétaire, dépôt ou retrait fournisseur. Chaque envoi conserve sa destination et ses quantités.

À l’expédition, le disponible au départ diminue et le transit augmente. Le gérant confirme les quantités réellement reçues et leur état sans modifier les quantités expédiées.

Les manquants restent en transit ou litigieux jusqu’à décision ; les détériorations sont isolées. Un surplus nécessite un rapprochement de son origine. Une remise directe conserve les deux confirmations, même rapprochées dans le temps.

Exemple : 50 articles expédiés, 45 reçus ; 45 deviennent disponibles et les 5 restants demeurent à résoudre. La distribution ne crée pas une seconde dépense d’achat.

### WF09 — Transfert entre boutiques ou depuis un dépôt

**Parcours :** demande/initiative → autorisation → expédition → réception → clôture.

| Étape | Départ disponible | Transit | Arrivée disponible |
|---|---|---|---|
| Autorisation | Inchangé | Inchangé | Inchangé |
| Expédition | Diminue | Augmente | Inchangé |
| Réception | Inchangé | Diminue des quantités reçues | Augmente des quantités reçues |

Le stock total reste inchangé hors perte ou correction justifiée. Proposition de simplification : pas de réservation à l’autorisation, vérification du disponible à l’expédition. Une réservation future a été évoquée mais n’est pas une décision confirmée.

Une annulation après expédition exige un retour ou un autre mouvement réel. Les réceptions partielles et écarts restent visibles.

### WF10 — Dépense de fonctionnement

**Parcours :** contrôle des droits → demande si requise → autorisation → paiement → justificatif → contrôle.

Le gérant indique catégorie, motif, montant estimé et urgence. Les dépenses dans ses droits peuvent être réalisées directement. Les autres attendent une décision.

Au paiement : montant réel, date, bénéficiaire, source et mode de paiement, justificatif. Une dépense payée par le propriétaire ne diminue pas la caisse du gérant. Une avance utilisée diminue le montant restant à justifier.

Une dépense non autorisée déjà survenue est déclarée comme irrégulière. Son refus ultérieur n’efface pas la sortie réelle. Les urgences et obligations de justificatif restent à paramétrer.

### WF11 — Remise de fonds

**Parcours :** déclaration de remise réelle → confirmation du destinataire → rapprochement.

Une remise future annoncée ne déplace pas de fonds. La remise effective diminue les fonds détenus par l’émetteur et reste suivie comme non confirmée jusqu’à réception. Le destinataire confirme son montant ; toute différence ouvre un écart.

Ce circuit s’applique dans les deux sens entre propriétaire et gérant. Les modalités précises des confirmations de paiements non physiques restent à préciser. Aucun reversement périodique n’est imposé par défaut.

### WF12 — Achat à crédit et règlement fournisseur

**Parcours :** achat → réceptions → dette → règlements → solde.

La réception augmente le stock indépendamment du paiement. Chaque règlement réduit la dette et les fonds de sa source sans nouvel achat ni réception. Proposition : affectation explicite de chaque règlement à un ou plusieurs achats.

Les échéances, paiements partiels, soldes et éventuels retours fournisseur doivent rester reliés. Le workflow détaillé de retour fournisseur reste à rédiger.

### WF13 — Retour client et remboursement

**Parcours :** vente d’origine → déclaration → autorisation → réception du produit → traitement financier.

Traitement physique : article reçu vendable remis au disponible ; article endommagé classé non vendable ; article non reçu sans entrée de stock.

Traitement financier : remboursement si payé, diminution de créance si impayé, combinaison des deux si paiement partiel. La réception et le remboursement peuvent avoir des dates différentes.

Proposition : un échange correspond à un retour lié à une nouvelle vente. Les règles de retour, plafonds et délais restent à définir.

### WF14 — Perte ou casse

**Parcours :** déclaration → justification → décision → traitement définitif.

Proposition : les quantités signalées deviennent indisponibles pendant examen. Distinguer un produit endommagé présent et un produit manquant. Le propriétaire valide la perte, demande un contrôle ou autorise la correction appropriée.

Un refus ne rend pas automatiquement vendable un produit absent ou inutilisable. Les conséquences exactes sur les états provisoires doivent être précisées lors de la conception.

### WF15 — Inventaire

**Parcours :** ouverture → suspension des mouvements concernés → comptage → comparaison → décision → ajustement.

Inventaire complet ou ciblé. Proposition initiale : synchroniser les opérations en attente et bloquer les mouvements des articles concernés pendant le comptage. Une heure de référence est conservée.

Le comptage et les écarts restent enregistrés. Seul un ajustement validé modifie le stock officiel. Un refus conserve le dossier ouvert ou en attente de nouveau comptage. Fréquence et personnes habilitées restent à déterminer.

### WF16 — Clôture de caisse avec comptage sans attendu

**Choix confirmé : ne pas afficher le montant attendu avant soumission.**

**Parcours :** lancement → comptage → soumission figée → calcul/affichage de l’écart → explication → revue.

1. Le gérant renseigne le nombre de billets et pièces par valeur.
2. L’application affiche uniquement le total de son comptage.
3. Le montant attendu et les récapitulatifs qui l’exposent directement ne sont pas affichés sur ce parcours.
4. À confirmation, le comptage est figé.
5. L’application affiche ensuite le montant calculé et l’écart.
6. Une explication est demandée en cas de différence.
7. Le propriétaire retrouve la clôture et ses éventuelles anomalies.

Proposition : suspendre brièvement les mouvements de caisse pendant le comptage. Une correction ultérieure nécessite un motif et conserve la déclaration initiale. Elle ne doit pas permettre de remplacer discrètement le montant après découverte de l’attendu.

Sans écart, la clôture est une déclaration sans écart, pas une vérification physique. Avec écart, une nouvelle journée peut commencer selon les règles de session, sans masquer l’anomalie précédente. Aucune fausse dépense ni vente n’est créée pour équilibrer les chiffres.

Le masquage du montant attendu réduit la copie directe mais n’empêche pas un gérant de le reconstituer ou de mentir. La portée du masquage dans les autres écrans et exports reste à détailler.

### WF17 — Écart et correction

**Parcours :** constat → explication → examen → décision → correction éventuelle → résolution.

Conserver opération d’origine, écart initial, responsable du traitement, pièces, décisions, mouvements correctifs, date et auteur de résolution.

Le propriétaire peut demander un complément, confirmer une erreur, constater une perte, enregistrer une restitution ou une livraison complémentaire. La résolution ne supprime pas l’historique. Une correction après clôture reste liée à la période et à la clôture initiales.

### WF18 — Remplacement du gérant

**Parcours proposé :** désignation → passation → constat des écarts → transfert de responsabilité → désactivation de l’ancien accès.

Les fonds, stocks et dossiers restent dans la boutique. Les anciennes opérations conservent leur auteur. Aucun chevauchement de deux gérants actifs. Le degré d’inventaire requis, les signatures et la gestion d’une passation impossible restent à préciser.

### WF19 — Désactivation d’une boutique

Le propriétaire conserve les historiques. Stocks, fonds, créances, dettes et dossiers ouverts doivent être traités avant clôture définitive. La suspension temporaire doit être distinguée de la fermeture définitive ; le parcours détaillé reste à rédiger.

## 10. États des demandes et dossiers

Éviter un unique statut « terminé » qui masquerait les dimensions restantes.

| Dimension | États proposés |
|---|---|
| Décision | Brouillon, soumise, complément demandé, approuvée, partiellement approuvée, refusée, annulée |
| Exécution | À réaliser, en cours, partiellement réalisée, réalisée |
| Réception | Non reçue, partiellement reçue, reçue, écart à résoudre |
| Financement | À financer, fonds reçus, utilisés partiellement, reliquat à solder, soldé |
| Contrôle | À contrôler, complément demandé, écart en traitement, clôturé |

Une modification importante après approbation crée une version à valider sans effacer l’accord précédent. Une annulation n’efface pas les paiements ou livraisons déjà survenus. Les dossiers clos ne sont réouverts qu’avec trace.

## 11. Fonctionnement temporaire hors connexion

### 11.1 Besoin confirmé

Les boutiques travaillent normalement avec Internet. Elles doivent continuer temporairement pendant une panne. La durée et la liste exacte des opérations restent à confirmer.

### 11.2 Propositions de simplification

- Un seul appareil par boutique autorisé à enregistrer hors connexion.
- Connexion et synchronisation préalables obligatoires ; pas de première authentification hors ligne.
- Conservation sécurisée des produits, prix, unités, stock connu, session, règles et autorisations nécessaires.
- Signalement permanent des opérations locales non synchronisées.
- Aucun accord supposé du propriétaire en son absence.

| Action | Comportement proposé |
|---|---|
| Vente ordinaire | Possible avec stock et paramètres locaux |
| Encaissement espèces | Enregistrable localement |
| Paiement Mobile Money/carte | Déclaration si réellement effectué ; aucune confirmation prestataire inventée |
| Demande | Brouillon ou soumission en attente d’envoi |
| Dépense autorisée | Possible dans les limites déjà connues |
| Nouvelle autorisation | En ligne uniquement |
| Vente à crédit | Désactivée hors ligne au démarrage |
| Réception et transfert définitifs | En ligne au démarrage |
| Inventaire et ajustement définitifs | En ligne |
| Clôture | Comptage figé localement, clôture provisoire jusqu’à synchronisation |

### 11.3 Synchronisation

Les opérations possèdent des identifiants uniques et un ordre local. Une retransmission ne crée pas de doublon. Les données restent sur l’appareil jusqu’à confirmation de réception. Date réelle et date de synchronisation sont distinctes.

Une opération réellement effectuée n’est pas effacée en cas de conflit ; elle est conservée et signalée pour régularisation. Le propriétaire voit la dernière synchronisation et le caractère incomplet des chiffres pendant une coupure.

### 11.4 Clôture déconnectée

Le comptage reste figé avant découverte de l’attendu. Proposition la plus récente : attendu définitif après synchronisation ; pas d’ouverture d’une nouvelle session tant que la clôture déconnectée n’est pas rapprochée. Cette restriction doit être confirmée car elle limite la continuité lors d’une panne prolongée.

### 11.5 Arbitrages techniques et métier ouverts

Durée maximale de déconnexion, changement d’appareil, suppression des données locales, révocation d’un gérant pendant une coupure, modification des prix et autorisations, écritures concurrentes du propriétaire, quantités insuffisantes à la synchronisation et protection des données locales restent à spécifier.

## 12. Prévention des déclarations fictives

Le risque soulevé est un gérant qui déclare une caisse fictive pour correspondre aux indicateurs. L’attendu est toujours calculé par le système ; seul le comptage est déclaré.

### Retenu au démarrage

- Comptage sans attendu visible avant soumission.
- Saisie des coupures et calcul automatique du total déclaré.
- Conservation de la première déclaration et des corrections.
- Explication des écarts.
- Libellés « caisse déclarée » et « écart déclaré ».
- Absence de mention trompeuse de vérification physique.

### Discuté mais non retenu comme dispositif initial

Contrôles physiques inopinés par le propriétaire ou un mandataire, compte de contrôleur indépendant et processus de constat physique séparé. Un plafond de conservation d’espèces et des analyses avancées de comportements inhabituels ont été évoqués sans décision d’inclusion initiale.

Les justificatifs et photos peuvent compléter une explication mais ne prouvent pas seuls la présence de fonds. Les alertes sont des signaux d’examen, pas des preuves de détournement. Les inventaires opérationnels demeurent dans le périmètre de gestion du stock.

## 13. Tableaux de bord et rapports

Vue propriétaire globale et par boutique, filtrable par période, produit, utilisateur et statut selon pertinence. Chaque total doit permettre de retrouver ses opérations sources.

Indicateurs : ventes nettes, encaissements, dépenses par catégorie, fonds et avances, caisse théorique, caisse déclarée, écarts, créances, dettes fournisseurs, quantités disponibles/en transit/non vendables, produits sous seuil, demandes et réceptions en attente, marge brute estimée.

Qualité des données : dernières clôtures, derniers inventaires, opérations à contrôler, justificatifs manquants, écarts ouverts, dernière synchronisation. Ne pas présenter une période incomplète comme entièrement vérifiée.

Exports évoqués : Excel/CSV pour listes, PDF pour synthèses. Formats et modèles restent à confirmer. Ils doivent reprendre filtres, période, date d’édition et références, et respecter les droits d’accès.

Notifications internes : demandes, décisions, seuils de stock, péremption, réceptions en retard, écarts et clôtures manquantes. E-mail, SMS et WhatsApp restent des options non confirmées.

## 14. Traçabilité, protection et expérience utilisateur

- Interface en français, adaptée au téléphone, à la tablette et à l’ordinateur.
- Formulaires rapides, totaux automatiques, erreurs compréhensibles et confirmations utiles.
- Identification des opérations sensibles sans bloquer chaque vente ordinaire.
- Authentification, récupération d’accès, désactivation et droits par boutique.
- Historique des valeurs, décisions, versions et pièces jointes.
- Correction par opérations liées pour les impacts financiers et de stock.
- Sauvegarde des données et justificatifs, restauration à tester.
- Fréquence de sauvegarde, durée de conservation et objectifs de reprise à définir.
- Double authentification du propriétaire à confirmer.
- Aucune exécution automatique de paiement externe dans le périmètre de base.

## 15. Scénarios de recette déjà définis

| Réf. | Scénario | Résultat attendu |
|---|---|---|
| R01 | Créer une quatrième boutique et affecter un gérant | Accès limité à la boutique autorisée |
| R02 | Vente en espèces | Vente, paiement et stock liés, effets uniques |
| R03 | Vente Mobile Money | Aucun accroissement des espèces attendues |
| R04 | Avance de 100 000, achat de 92 000 | 8 000 restants localisés et expliqués |
| R05 | Achat propriétaire réparti sur deux boutiques | Un achat, deux envois/réceptions, aucune double dépense |
| R06 | 50 articles envoyés, 45 reçus | 45 disponibles, 5 à résoudre |
| R07 | Refus d’une demande non exécutée | Aucun paiement ni stock créé |
| R08 | Transfert entre boutiques | Stock global sans double comptage |
| R09 | Caisse déclarée inférieure à l’attendu | Écart expliqué et conservé |
| R10 | Inventaire différent du théorique | Ajustement soumis à validation |
| R11 | Correction après clôture | Original et clôture conservés, rapports cohérents |
| R12 | Retransmission après coupure | Une seule prise en compte |
| R13 | Comptage de caisse | Attendu masqué jusqu’à soumission, première déclaration conservée |
| R14 | Vente à crédit puis règlement | Pas de nouvelle vente lors du règlement |
| R15 | Achat à crédit puis règlement | Pas de nouvelle entrée de stock lors du règlement |
| R16 | Achat en cartons et vente à l’unité | Conversion exacte vers l’unité de stock |
| R17 | Clôture hors connexion | Déclaration figée, statut provisoire et rapprochement ultérieur |

R01 à R12 proviennent du cadrage initial. R13 à R17 formalisent les précisions ultérieures pour la future recette. Les montants d’exemple ne fixent pas la devise du projet.

## 16. Mise en service

Préparer boutiques, utilisateurs, catalogue, unités, prix, fournisseurs, moyens de paiement et paramètres. Réaliser inventaire et comptage initiaux, puis faire valider les soldes et leur date de référence.

Ne reprendre des anciennes données que si leur qualité est connue. Identifier explicitement les informations incertaines. Volume et modalités d’import à cadrer.

Déploiement proposé : boutique pilote, formation, scénarios de recette, premières clôtures contrôlées, correction des anomalies puis ouverture des autres boutiques. Prévoir un guide couvrant ventes, demandes, achats, dépenses, réceptions, clôtures, inventaires et corrections.

Support, maintenance, hébergement, performances, calendrier et budget ne sont pas définis dans ces échanges.

## 17. Hors périmètre et fonctions non confirmées

Hors périmètre initial proposé : comptabilité générale réglementaire, déclarations fiscales, paie, boutique en ligne, exécution de virements ou paiements, intégrations automatiques bancaires ou autres services externes.

Également non retenus au démarrage : contrôles physiques indépendants dédiés. Profils supplémentaires, notifications externes, relances automatiques et intégrations matérielles spécifiques restent à confirmer.

La présence des crédits, du dépôt optionnel, des caractéristiques produits et du mode hors connexion dans le périmètre ne signifie pas que tous leurs réglages ont déjà été validés.

## 18. Décisions encore nécessaires

1. Devise et éventuel besoin de plusieurs devises ; pays/règles de prix ou taxes applicables.
2. Liste concrète des produits, unités, conversions, précisions et variantes.
3. Méthode de valorisation du stock et traitement des frais d’achat.
4. Règles de péremption, lots, retours et produits non vendables.
5. Seuils d’autorisation, urgences, justificatifs et substitutions.
6. Visibilité des coûts, marges et informations financières pour le gérant.
7. Portée et limites du crédit client entre boutiques ; échéances et affectation des règlements.
8. Fréquence des clôtures, période d’une session et mouvements entre sessions.
9. Modalités de correction du comptage et visibilité de l’attendu dans les autres écrans.
10. Modalités des avances et remises, paiements directs et écarts de réception de fonds.
11. Activation et responsabilité opérationnelle des dépôts.
12. Un appareil hors ligne par boutique, opérations autorisées et durée maximale.
13. Blocage éventuel d’une nouvelle session avant synchronisation d’une clôture.
14. Gestion des conflits, révocations et changements d’appareil hors ligne.
15. Fréquence des inventaires, suspension des mouvements et passation des gérants.
16. Reçus, impressions, exports, pièces jointes et reprise des anciens registres.
17. Détails des retours fournisseurs, fermeture des boutiques et réouverture des dossiers.
18. Hébergement, sauvegardes, restauration, support et engagements de performance.

## 19. Prochaine étape de conception

Ordre proposé :

1. Définir les registres de stock et d’argent et leurs invariants.
2. Détailler le socle : mise en service → ouverture de caisse → vente → dépense → clôture.
3. Détailler achats, financements, réceptions et transferts.
4. Ajouter crédits, retours, inventaires et corrections.
5. Formaliser synchronisation et conflits hors connexion.
6. Définir écrans, champs, droits, transitions et critères de recette.
7. Choisir l’architecture technique et planifier l’implémentation.

Pour chaque workflow : déclencheur, acteur, préconditions, champs obligatoires, états, transitions, effets sur stock/fonds, exceptions, permissions, notifications et tests d’acceptation.

Aucune stack technique ni architecture de déploiement n’a encore été arrêtée. Aucun développement applicatif n’est considéré comme réalisé à ce stade.

## 20. Historique documentaire

- 19 septembre 2026 : cahier des charges fonctionnel Word de 16 pages produit.
- Validation client rapportée ensuite : accord pour réaliser l’application.
- Précisions retenues : options produits, gérant unique, dépôt facultatif, crédits activables, continuité hors connexion, autorisations paramétrables.
- Simplification retenue : clôture par comptage sans affichage préalable de l’attendu ; contrôles physiques indépendants exclus du démarrage.
- 23 septembre 2026 : consolidation du cadrage et des workflows dans ce fichier.
