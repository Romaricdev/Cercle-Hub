# Décisions et périmètre

## D01 — Application et utilisateurs

Une entreprise, un propriétaire actif, plusieurs boutiques et un gérant actif par boutique. Un gérant n’est affecté qu’à une boutique active à la fois. Pas de vendeurs secondaires ni de SaaS multi-entreprises à livrer. Un `organization_id` est néanmoins présent sur les données métier pour une isolation explicite.

Interface française, responsive obligatoire sur téléphone, tablette et ordinateur pour les deux rôles. Tablettes prévues pour les gérants, sans limitation des autres formats. Voir `10-ajouts-techniques-et-responsive.md`. Propriétaire : supervision et décisions. Gérant : exploitation quotidienne. Un appareil principal enregistré par boutique autorise les écritures ; les autres appareils du gérant restent en lecture. Cela évite deux caisses concurrentes pendant une coupure. Le propriétaire écrit depuis son espace, mais ne crée pas de vente au nom du gérant.

## D02 — Monnaie, dates et prix

Devise par défaut XAF, fuseau Africa/Douala, configurables à l’initialisation avant toute écriture. Une seule devise pour toute l’entreprise ; verrouillage après première écriture. Le choix XAF est un défaut de produit, pas une affirmation sur le pays du client. Montants en unités monétaires mineures entières ; XAF a ici zéro décimale. UI « FCFA » lorsque XAF.

Les prix saisis sont les montants finaux payables. Aucun moteur fiscal, facture fiscale certifiée ou calcul de taxes n’est promis. Reçu commercial simple. Toutes les dates persistées en UTC avec fuseau d’affichage d’entreprise. Journée = date locale d’ouverture de session, pas découpage arbitraire à minuit.

## D03 — Options disponibles sans complexifier le quotidien

Variantes, ventes au poids/volume, conditionnements, lots, péremption et codes-barres inclus, activés produit par produit. Un produit simple a automatiquement une variante « Standard » et une unité de base. Pas de scan caméra en V1 : recherche textuelle et lecteur code-barres USB/Bluetooth agissant comme clavier.

Dépôt, crédit client et crédit fournisseur sont présents mais désactivés par défaut. Leur activation par le propriétaire ne demande pas de modification du code. Pas de mini-ERP fournisseurs : fiche simple nom/contact et solde dû.

## D04 — Stock et coût

Stock vendable jamais négatif dans les registres officiels. Lots expirés non vendables, sans dérogation gérant. Pour les sorties, FEFO si péremption, sinon FIFO. Valorisation par les couches effectivement sorties : FEFO choisit le lot, puis FIFO les couches de ce lot ; pas de coût pris dans un autre lot par FIFO global. Une couche conserve quantité restante et valeur restante ; aucun recalcul historique après modification du prix courant.

Un dépôt facultatif unique suffit au lancement. Un lieu système « Stock du propriétaire » existe même sans dépôt ; ce n’est pas un écran supplémentaire obligatoire. Aucun emplacement rayon/étagère.

Pas de réservation à l’approbation d’un transfert. Vérifier la disponibilité à l’expédition. Réceptions partielles autorisées. Surplus non rapproché conservé en quarantaine, jamais rendu vendable automatiquement.

## D05 — Règles d’autorisation par défaut

Remise gérant : 0 %. Dépense gérant sans autorisation : plafond 0. Ajustements, pertes définitives, annulations, remboursements et dépassements de budget : propriétaire. Demande de réapprovisionnement : propriétaire décide du circuit et du budget.

Le propriétaire peut définir un plafond de remise de 0 à 30 % et un plafond de dépense par opération ET par session. Somme des dépenses autonomes de session <= plafond de session. Les dépenses sont réservées dans ce plafond à leur validation et non à la création du brouillon. Urgence = priorité de notification, pas contournement des droits.

Les achats utilisent une autorisation dédiée, pas le plafond des dépenses ordinaires. Aucune substitution de produit automatique ; révision de demande nécessaire. Les documents déjà autorisés conservent leur version et leur plafond. Révocation bloque les usages futurs en ligne, pas les faits déjà exécutés.

## D06 — Crédit

Créance rattachée à la boutique et à un client de cette boutique, pas de crédit partagé interboutiques en V1. Client identifié par nom et téléphone ; doublons signalés, pas fusion automatique. Par défaut chaque vente à crédit attend une autorisation du propriétaire tant qu’aucun plafond client n’a été fixé. Plafond explicite > 0 : autonomie dans ce plafond. Échéance proposée 14 jours, modifiable avant validation. Client avec échéance impayée dépassée : nouveau crédit bloqué sauf autorisation pour une vente précise.

Encaissement affecté aux ventes les plus anciennes par échéance puis date, avec aperçu avant confirmation. Pas d’acompte supérieur à la dette, pas de portefeuille client. Les avoirs sont consommés pour diminuer la créance ou remboursés ; pas de bons cadeaux. Abandon de créance exclusivement propriétaire, documenté.

Achats à crédit : seulement lorsque l’option est activée et la commande autorisée. Échéance proposée 30 jours. Règlement fournisseur affecté explicitement aux achats sélectionnés. Paiement supérieur au solde interdit ; avances fournisseur hors périmètre V1.

## D07 — Session et clôture

Une session ouverte par boutique ; clôture quotidienne recommandée, session > 24 heures signalée, pas de clôture automatique. Pas de mouvements dans la caisse boutique entre sessions. Les fonds en attente peuvent rester détenus par le propriétaire ou en transit.

Comptage en coupures aveugle, soumis une fois, puis révélation de l’attendu. Les tableaux gérant ne livrent pas le solde théorique courant ; ses reçus et opérations restent accessibles pour travailler. Ceci empêche la copie directe, pas toute reconstitution arithmétique.

La session suivante reprend les espèces déclarées. Un écart produit une écriture de différence de comptage clairement identifiée, jamais une vente ou dépense fictive. Le dossier d’écart reste ouvert. Un recomptage est une annotation à approuver ; aucune substitution du premier comptage. Si la session suivante a commencé, la correction passe dans cette session sous forme d’ajustement explicite et ne réécrit pas son ouverture.

## D08 — Hors connexion

Maximum 24 heures depuis dernier renouvellement de capacité par le serveur, uniquement durant une session déjà ouverte. Ventes immédiates intégralement en espèces, sans remise exceptionnelle, brouillons de demandes, et comptage de clôture. Ni dépenses, crédit, remboursements, réceptions ni transferts exécutés hors ligne en V1. Ce périmètre remplace les possibilités plus larges évoquées auparavant.

Clôture locale possible ; nouvelle session en ligne uniquement. Le gérant est averti avant de clôturer hors ligne qu’il ne pourra pas reprendre les ventes avant reconnexion. Données locales en attente conservées même à expiration du droit d’écriture.

## D09 — Documents et contrôles

Justificatif obligatoire pour clôturer un achat ou valider une dépense contrôlée ; exception propriétaire motivée « justificatif indisponible ». Ne pas empêcher la déclaration d’une sortie déjà réalisée. Téléversement en ligne uniquement. Reçu imprimable navigateur en A4 ou 80 mm ; exports CSV UTF-8 et PDF synthétique inclus. XLSX et export comptable normalisé différés.

Inventaire mensuel rappelé, ciblé ou complet. Mouvements sur les articles bloqués pendant le comptage. Aucune validation aveugle d’une session, d’un inventaire ou d’une anomalie.

## D10 — Simplicité et limites

Pas de comptabilité générale, paie, fiscalité automatisée, commerce en ligne, intégration bancaire ni exécution de paiements. Notifications internes uniquement, interrogation périodique 30 secondes lorsque l’application est visible. Pas de contrôle physique indépendant dédié en V1. Support et contrôle manuel de l’activité restent nécessaires.

## D11 — Livraison

Application web installable PWA, monolithe modulaire, PostgreSQL, fichiers privés en stockage objet. Tous les modules confirmés sont inclus dans la cible ; l’ordre des lots n’est pas une suppression des fonctionnalités avancées. La fin de chaque lot exige tests, migrations et parcours utilisable. Pas de déploiement payé ou public autorisé par cette documentation seule.

## D12 — Dashboard propriétaire unique et progressif

`/owner` est l’unique page d’entrée décisionnelle du propriétaire. Son état de préparation P02 n’est pas un second dashboard : la même route évolue de `SETUP` vers `EMPTY`, `ACTIVE`, `STALE`, `PARTIAL` ou `ERROR` selon l’initialisation et la fraîcheur.

La structure définitive commence en P03 et reçoit les données réelles de chaque phase métier. P09 finalise consolidation, comparaisons, tendances, rapports et exports. Aucun faux chiffre, faux zéro ou graphique décoratif n’est autorisé. Chaque indicateur disponible mène à ses documents sources et expose période, périmètre et fraîcheur. Voir [dashboard décisionnel du propriétaire](17-dashboard-proprietaire.md).

## Identité et interface confirmées

Entreprise : **Cercle Complet Sarl**. Tailwind CSS, shadcn/ui et Framer Motion choisis par le porteur. Voir [identité et design UI](12-identite-et-design-ui.md). Le logo V1 est validé par le porteur ; le design system validé figure dans [13-design-system.md](13-design-system.md), avec bordures limitées.
