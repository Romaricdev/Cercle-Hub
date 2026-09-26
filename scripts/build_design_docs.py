"""Produit les fiches et la matrice à partir d'un catalogue de conception explicite."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/conception'
OUT.mkdir(parents=True,exist_ok=True)

# ID, titre, route, rôle, entrée, champs, action, sortie, API, tables, transitions, tests
SCREENS=[
('E01','Connexion','/login','Tous','Lien ou session expirée','E-mail*;Mot de passe*;Activation TOTP owner obligatoire;Challenge second facteur si activé;Code de secours à usage unique;Lien de récupération','Se connecter','E02 si entreprise non initialisée, sinon E03 ou E17','/api/auth/*','app_users','S01','T02'),
('E02','Initialisation','/setup','Propriétaire et gérant SETUP pour comptages','Première connexion ou nouvelle boutique E26','Entreprise*;Devise*;Fuseau*;Boutique*;Gérant*;Produits et prix*;Coupures initiales*;Stocks par lot*;Valeurs ou estimations*;Créances et dettes initiales facultatives','Valider les données initiales (owner)','Récapitulatif figé puis E26 ACTIVE ; gérant revient E03','POST /shops/:id/opening-balances;POST /shops/:id/activate','opening_drafts,opening_stock_lines,opening_obligations,shops','S01,S12','T01,T78'),
('E03','Accueil gérant','/manager','Gérant','Connexion réussie','Session en lecture;Tâches;Réceptions;Demandes;Dernière synchronisation','Nouvelle vente','E04 ou ouverture E07 si nécessaire','GET /me;GET /notifications;GET /cash-sessions/current','cash_sessions,notifications,devices','S01,S02,S03','T02,T38'),
('E04','Panier de vente','/manager/sale','Gérant principal','E03 ou navigation Vendre','Recherche produit*;Variante si multiple*;Unité*;Quantité*;Remise facultative sous plafond','Passer au paiement','E05 avec panier conservé ; retour depuis E05 sans perte','GET /stock;POST /sales/quote','products,variants,sale_units,prices,stock_balances','S02','T08,T09,T10,T11,T12,T15'),
('E05','Paiement vente','/manager/sale/payment','Gérant principal','Panier valide E04','Mode*;Montant par mode*;Espèces reçues si cash*;Client si crédit*;Échéance si crédit*;Référence externe facultative','Confirmer la vente','E06 après POSTED ; reçu local si offline ; erreur conserve panier','POST /sales/quote;POST /sales','sales,sale_lines,payments,customer_payment_allocations','S02,S12,S14','T03,T04,T05,T06,T07,T16,T45'),
('E06','Reçu et détail vente','/manager/sales/[id]','Gérant boutique et owner via E35','Confirmation vente ou recherche historique','Référence;Lignes figées;Paiements;Dette;Retours;Statut local/serveur','Imprimer ou demander un retour','Impression même page ; retour E33 ; nouvelle vente E04','GET /sales/:id;POST /sales/:id/reversal-request','sales,returns,payments','S02,S06','T20,T21,T22'),
('E07','Session de caisse','/manager/cash','Gérant principal','Navigation Plus ou vente sans session','Statut;Historique clôtures;Alertes de synchronisation;Aucun attendu courant','Ouvrir ou compter ma caisse','E08 si comptage, E03 si ouverture','POST /cash-sessions/open;POST /cash-sessions/:id/start-count','cash_sessions,cash_closures','S01,S03','T37,T38,T61'),
('E08','Comptage aveugle','/manager/cash/count','Gérant principal','Session COUNTING ou comptage local autorisé','Nombre par coupure*;Total déclaré calculé;Après soumission explication si écart*','Enregistrer mon comptage','Résultat figé sur même écran ; correction ouvre E36 avec type RECOUNT','POST /cash-sessions/:id/submit-count;POST /cash-sessions/:id/cancel-count','cash_closures,money_events,discrepancy_cases','S03,S14','T37,T38,T39,T41,T50,T64'),
('E09','Dépense','/manager/expenses/new','Gérant principal','Plus ou demande autorisée E11','Catégorie*;Description*;Montant*;Source*;Justificatif ou absence motivée*;Indication déjà payé seulement parcours irrégulier','Demander accord ou enregistrer paiement (libellés distincts)','E11 si accord demandé ; détail dépense si paiement confirmé','POST /expenses;POST /expenses/:id/submit;POST /expenses/:id/pay;POST /expenses/declare-irregular','expenses,requests,approvals,payments','S05','T23,T24,T25,T26'),
('E10','Demandes','/manager/requests','Gérant','Navigation Demandes','Filtre type/état;Nouvelle demande type*;Priorité;Recherche référence','Demander des produits ou des fonds','Formulaire puis E11 ; brouillon offline indiqué non envoyé','GET /requests;POST /requests','requests,request_lines','S04','T27,T28'),
('E11','Détail demande','/manager/requests/[id]','Gérant boutique','Liste ou notification','Lignes demandées;Lignes accordées;Budget;Source;Validité;Question à compléter;Justificatifs','Soumettre / compléter / acheter selon état','Reste détail après soumission ; E12 pour achat autorisé','PATCH /requests/:id;POST /requests/:id/submit;GET /requests/:id','requests,approvals,approval_lines','S04,S07','T27,T28,T72'),
('E12','Achat par gérant','/manager/purchases/new','Gérant principal désigné','Demande approuvée E11','Accord en lecture*;Fournisseur*;Lignes réelles*;Frais facture;Frais transport distincts;Paiements;Réception immédiate oui/non*;Pièces','Acheter et recevoir ou enregistrer achat','Détail achat ; E13 si réception différée ; écart renvoie demande de complément','POST /purchases;POST /purchases/with-receipt','purchases,purchase_lines,purchase_fees,receipts','S07,S08','T27,T29,T34,T68'),
('E13','Réception','/manager/receipts/[id]','Gérant destinataire principal','Accueil ou notification livraison','Attendu restant en lecture;Reçu vendable*;Reçu abîmé*;Surplus déclaré;Lots/dates selon produit*;Livraison terminée oui/non*','Confirmer cette réception','Résumé quantités mises en stock et restant ; dossier si écart','POST /receipts;GET /shipments/:id','receipts,receipt_lines,cost_layers,discrepancy_cases','S08','T31,T32,T33,T71'),
('E14','Stock boutique','/manager/stock','Gérant','Navigation Stock','Recherche;Filtre seuil/expiration;Disponible;Non vendable;Unité;Lots;Historique sans coût','Demander produits ou déclarer problème','E10 demande préremplie ; E31 perte ; détail mouvements local','GET /stock;GET /stock/movements','stock_balances,stock_entries,lots','S04,S11','T12,T13,T44'),
('E15','Clients et créances','/manager/customers','Gérant en ligne','Plus si crédit actif ou dette existante','Nom*;Téléphone*;Dettes en lecture;Montant règlement*;Mode*;Aperçu affectation','Enregistrer le règlement','Reçu et dettes restantes sur détail client','GET /customers;POST /customers;POST /customer-payments/preview;POST /customer-payments','customers,customer_payment_allocations,opening_obligations','S12','T17,T18,T19,T55,T78'),
('E16','Synchronisation','/manager/sync','Gérant','Bandeau statut ou Plus','Dernier succès;Événements en attente;Échecs;Séquence;Motifs compréhensibles','Réessayer la synchronisation','Même écran, lien dossier de conflit ; aucun bouton effacer','POST /sync/handshake;POST /sync/push;GET /sync/pull','device_events,sync_changes,devices','S14','T45,T46,T47,T48,T49,T50,T51,T52,T62,T63'),
('E17','Vue propriétaire','/owner','Propriétaire','Connexion ou navigation','Période*;Boutique/toutes*;Ventes;Encaissements;Dépenses;Créances;Résultat brut estimé;Stock disponible et valeur;Écarts;Décisions en attente;Alertes;Fraîcheur','Traiter les actions prioritaires ou ouvrir un indicateur','E18 ou listes détaillées E27/E35','GET /reports/overview;GET /notifications','sales,payments,money_entries,stock_balances,discrepancy_cases,sync_cursors','S13','T60,T80'),
('E18','Décider une demande','/owner/requests/[id]','Propriétaire','Liste des demandes ou notification','Besoin;Stock connu;Lignes approuvées*;Budget*;Acheteur*;Source*;Validité*;Motif si partiel/refus*','Approuver, demander complément ou refuser','Même dossier avec décision figée ; gérant notifié','POST /requests/:id/decision','requests,approvals,approval_lines','S04','T27,T28,T72'),
('E19','Achats propriétaire','/owner/purchases','Propriétaire','Navigation Achats','Fournisseur*;Produits/unités/prix*;Frais séparés;Destination par ligne*;Paiements;Échéance;Réception immédiate facultative','Enregistrer achat','Détail avec réception/répartition/règlement ; E20 envoi ou E34 paiement','GET /purchases;POST /purchases;POST /purchases/with-receipt','purchases,purchase_destinations,purchase_fees','S07,S08','T31,T34,T68,T69'),
('E20','Transferts propriétaire','/owner/transfers','Propriétaire','Navigation Stock/transferts ou achat','Origine*;Destination*;Lignes/quantités*;Motif;Transit et réceptions en lecture','Autoriser puis expédier si détenteur','Détail transfert, bordereau, notification destinataire','POST /shipments;POST /shipments/:id/approve;POST /shipments/:id/dispatch','shipments,shipment_lines,shipment_cost_allocations','S08','T31,T32,T60,T71'),
('E21','Fonds propriétaire','/owner/funds','Propriétaire','Navigation Fonds','Sources et soldes déclarés;Montant*;Destination*;Motif*;Avance liée facultative;Reçus','Enregistrer remise ou confirmer réception','Détail remise avec transit/reliquat distinct','GET /fund-transfers;POST /fund-transfers;POST /fund-transfers/:id/send;POST /fund-transfers/:id/receive','fund_transfers,fund_receipts,money_entries','S09','T29,T30,T65'),
('E22','Liste des contrôles','/owner/controls','Propriétaire','Navigation Contrôles','Type;Boutique;Statut;Ancienneté;Montant/quantité;Action attendue','Examiner un dossier','E23, E24 ou E36 selon type','GET /discrepancies;GET /stock-counts','discrepancy_cases,cash_closures,stock_counts','S13','T37,T40,T42'),
('E23','Dossier d’écart','/owner/controls/[id]','Propriétaire','E22 ou opération signalée','Original;Résiduel;Historique;Justificatifs;Type décision*;Motif*;Correction spécifique','Appliquer décision','Dossier mis à jour ; ne résoudre que résiduel traité','GET /discrepancies/:id;POST /discrepancies/:id/resolve','discrepancy_cases,discrepancy_actions,money_events,stock_events','S13','T40,T41,T73,T74'),
('E24','Inventaire propriétaire','/owner/inventories/[id]','Propriétaire','Créer depuis Contrôles ou demande soumise','Lieu*;Scope*;Comptages;Différences;Coût estimé si nécessaire;Motif par écart*','Démarrer / demander recomptage / valider selon état','Rapport ajustements et historique ; notifications gérant','POST /stock-counts;POST /stock-counts/:id/start;POST /stock-counts/:id/decision','stock_counts,stock_count_lines,stock_count_locks','S11','T42,T43,T75,T76'),
('E25','Catalogue et prix','/owner/products','Propriétaire','Navigation Produits','Nom*;Référence*;Unité*;Précision*;Variante standard automatique;Options avancées;Prix par boutique*;Seuils','Enregistrer produit ou nouvelle version de prix','Liste filtrée et détail ; jamais stock créé par catalogue','POST /products;POST /products/:id/variants;POST /variants/:id/units;POST /prices','products,variants,sale_units,prices,shop_products','S01','T10,T11,T12,T13'),
('E26','Boutique et responsabilité','/owner/shops/[id]','Propriétaire','Liste boutiques','Nom/code*;Contact;Gérant*;Statut;Paramètres effectifs;Blocages de fermeture','Activer / suspendre / remplacer selon état','E02 pour initialisation ; E36 secours ; historique conservé','POST /shops;POST /shops/:id/activate;POST /shops/:id/suspend;POST /shops/:id/close','shops,manager_assignments,opening_drafts','S01,S15','T01,T56,T77'),
('E27','Rapports','/owner/reports','Propriétaire','Navigation Rapports','Type*;Période*;Boutique*;Date activité explicitée;Filtre produit/mode selon rapport;Format CSV/PDF','Afficher ou exporter','Table détail ; état job puis téléchargement autorisé','GET /reports/overview;POST /exports;GET /exports/:id','export_jobs,sales,money_entries,stock_entries','S13','T54,T60,T80'),
('E28','Paramètres métier','/owner/settings','Propriétaire','Navigation Paramètres','Portée réseau/boutique*;Remise max;Dépense unitaire/session;Crédits;Péremption;Délai retours;Sources/liens admin','Enregistrer nouvelle version','Résumé des changements et date d’effet ; historiques inchangés','GET /policies;POST /policies','policies','S04,S12','T26,T55,T83'),
('E29','Expédition gérant','/manager/transfers/[id]','Gérant source principal','Plus > Transferts ou notification accord','Destinataire en lecture;Quantités autorisées;Quantités réellement remises*;Lots proposés;Motif si partiel','Confirmer l’expédition','Bordereau et transit ; pas réception automatique','POST /shipments/:id/dispatch;POST /shipments/:id/submit','shipments,shipment_lines,stock_entries','S08','T32,T71'),
('E30','Fonds du gérant','/manager/funds','Gérant principal','Plus > Fonds ou notification remise','Liste remises sans solde global;Montant reçu à confirmer*;Montant à remettre*;Destinataire*;Motif*','Confirmer reçu ou enregistrer remise réelle','Détail reçus et reliquat ; jamais attendu courant','POST /fund-transfers;POST /fund-transfers/:id/send;POST /fund-transfers/:id/receive','fund_transfers,fund_receipts','S09','T29,T30,T65'),
('E31','Perte ou casse','/manager/losses/new','Gérant principal','Stock > Signaler problème','Produit*;Lot selon produit*;Quantité*;Présent abîmé ou manquant*;Motif*;Photo facultative','Déclarer le problème','Quantité isolée, dossier en attente, lien suivi','POST /loss-reports','loss_reports,stock_entries,discrepancy_cases','S11','T44,T75'),
('E32','Comptage inventaire gérant','/manager/inventories/[id]','Gérant de la boutique','Notification inventaire ouvert','Produits/lot/compartiment;Quantités comptées*;Motif différences à soumission*;Progression','Soumettre le comptage','Lecture figée en attente owner ; aucun déblocage automatique','PUT /stock-counts/:id/lines;POST /stock-counts/:id/submit','stock_counts,stock_count_lines','S11','T42,T43,T76'),
('E33','Retour et remboursement client','/manager/returns/[id]','Gérant principal','Vente E06 ou liste retours','Vente en lecture;Lignes/quantités*;Motif*;État produit*;Après accord quantités reçues*;Source/montant remboursement*','Demander / recevoir / rembourser selon étape','Détail retour avec obligation restante ; reçu remboursement','POST /returns;POST /returns/:id/receive;POST /returns/:id/refund','returns,return_receipts,return_value_allocations,refund_allocations','S06','T20,T21,T22,T70'),
('E34','Fournisseurs et paiements','/owner/suppliers/[id]','Propriétaire ; vue restreinte gérant /manager/suppliers/[id]','Achats > Fournisseur','Achats et dettes;Sélection obligations*;Montant par obligation*;Source*;Référence facultative','Payer ou enregistrer remboursement fournisseur','Reçu et solde restant ; retour fournisseur sous onglet dédié','POST /supplier-payments;POST /supplier-returns;POST /supplier-returns/:id/confirm-credit','suppliers,supplier_payment_allocations,supplier_returns','S10,S12','T35,T36,T79'),
('E35','Historique détaillé propriétaire','/owner/sales/[id]','Propriétaire','Rapport ventes ou recherche référence','Vente;Paiements;Coûts;Demande retour/annulation;Motif décision*','Autoriser/refuser une correction','Gérant notifié pour exécution physique ; pas sortie cash immédiate','GET /sales/:id;POST /returns/:id/decision;POST /requests/:id/decision','sales,approvals,returns','S02,S06','T20,T22,T74'),
('E36','Correction et reprise','/owner/takeovers/[id]','Propriétaire ; gérant accès à sa demande uniquement','Écart, recomptage ou appareil perdu','Type*;Source*;Motif*;Éléments connus;Montants/quantités selon action;Limites de données','Valider une étape de reprise','Chronologie, opérations liées, reprise appareil après rapprochement','POST /cash-closures/:id/recounts;POST /recounts/:id/decision;POST /recovery-cases','recount_requests,opening_and_recovery_cases,device_sequence_resolutions','S03,S13,S14,S15','T41,T48,T63,T77'),
('E37','Utilisateurs et affectations','/owner/users','Propriétaire','Paramètres > Utilisateurs','Nom*;E-mail*;Boutique*;État invitation;Dates affectations;Motif désactivation/remplacement*;Réauthentification sensible;Gestion du second facteur owner','Inviter ou remplacer le gérant','Confirmation étapes, pas deux affectations actives','POST /users;POST /shops/:id/assign-manager;POST /users/:id/deactivate','app_users,manager_assignments','S01,S15','T02,T61,T77'),
('E38','Appareil principal','/owner/devices','Propriétaire ; gérant enregistrement /manager/device','Première utilisation ou Paramètres','Nom appareil*;Boutique;Dernier contact;File connue;Statut capacité;Motif révocation*','Approuver cet appareil ou révoquer','Confirmation principale, gérant peut ouvrir caisse ; secours E36','POST /devices/register;POST /devices/:id/approve;POST /devices/:id/revoke','devices,device_capabilities','S01,S14','T48,T51,T61,T62'),
('E39','Sources de paiement','/owner/sources','Propriétaire','Paramètres > Sources de fonds','Nom*;Type*;Responsable/lieu*;Solde initial*;Actif;Motif correction*','Créer source ou enregistrer apport réel','Compte et historique ; solde jamais édité directement après usage','POST /payment-sources;POST /owner-fund-events','payment_sources,money_accounts,money_events','S01,S09','T25,T29,T66'),
('E40','Lieux et dépôt','/owner/locations','Propriétaire','Stock > Lieux','Stock owner permanent;Dépôt optionnel;Nom*;Activation;Quantités par état','Activer dépôt ou consulter/déplacer stock','E20 transfert ; désactivation conserve soldes existants consultables','GET /locations;POST /locations/depot;PATCH /locations/:id','locations,stock_balances','S08,S15','T31,T56,T67'),
]

def split(s): return [x.strip() for x in s.split(',')]
records=[]
md=['# Fiches des interfaces et écrans\n','Version 2.1. Les 40 fiches remplacent le seul inventaire synthétique comme référence de détail. `*` = obligatoire. Les exigences générales de 06-ecrans restent applicables. Les routes à ID sont paramètres, pas liens vers une application déjà existante.\n',
'## Contrat commun de chaque écran\n',
'- En-tête : boutique active, titre, statut réseau ; ne jamais cacher la boutique lors d’une saisie financière.\n- Corps : lecture contexte → champs utiles → résumé des effets. Options avancées repliées.\n- Pied : une action principale nommée selon l’effet réel ; retour et brouillon secondaires.\n- Chargement : aucune valeur zéro simulée ; erreur réseau conserve saisie et référence de tentative.\n- Validation : obligatoire près du champ, erreur métier au-dessus du bouton ; aucune remise à zéro du formulaire.\n- Double action : bouton en attente, même clé de commande jusqu’au résultat ; aucune nouvelle tentative avec nouvel ID après timeout inconnu.\n- Droits : absence de bouton interdit + contrôle serveur ; lecteur secondaire voit une bannière et aucune commande.\n- Hors ligne : seuls E04/E05 cash, brouillons E10/E11 et E08 sont exécutables ; autres pages en lecture snapshot datée ou indisponibles si jamais chargées.\n- Sortie avec changements : conserver brouillon ou demander abandon ; jamais perdre événement déjà soumis.\n- Lecture mobile : cartes empilées, pas tableau large obligatoire ; desktop peut montrer liste + détail.\n',
'## Maquettes fonctionnelles des parcours critiques\n',
'''### Vente sur téléphone
```text
[Boutique A]                         [En ligne]
Nouvelle vente
[Rechercher ou scanner un produit____________]
Produit P        [Unité v]      [−] 2 [+]
Prix unitaire 1 000             Ligne 2 000
[Ajouter un produit]
Total 2 000 FCFA
[                 Passer au paiement        ]
```
Paiement : total en tête, Espèces sélectionné, somme reçue et monnaie rendue ; crédit et paiement mixte derrière « Autres modes ». Aucun coût/marge exposé. Le reçu n’apparaît comme confirmé qu’après résultat serveur ou comme reçu local explicitement signalé.

### Comptage de caisse
```text
Compter ma caisse                    [Étape 1/2]
10 000 FCFA      [nombre de billets : ___]
 5 000 FCFA      [nombre de billets : ___]
 ...
Total de votre comptage              58 000
[               Enregistrer mon comptage    ]
```
Étape 2 seulement après soumission : déclaré58 000, attendu58 500, écart−500, explication. Première déclaration figée ; demande de correction secondaire. L’écran avant soumission ne contient jamais l’attendu dans payload/DOM.

### Demande et décision
```text
Gérant : produits → quantités → estimation → Envoyer
Owner  : demandé | accordé | budget | qui achète ?
         [Le gérant] [Moi-même] [Stock existant]
         Source des fonds / date de validité
         [Approuver] [Complément] [Refuser]
```
Après accord, gérant voit « Acheter ces produits » uniquement s’il est acheteur. Si owner achète, il voit « En préparation », puis « Confirmer réception ». Pas de bouton achat trompeur dans l’autre circuit.

### Réception
```text
Envoi EXP-...          Origine : propriétaire
Produit P             Attendu restant : 50
Vendables reçus [45]   Abîmés reçus [0]
Livraison annoncée terminée ? [Oui]
Résumé : 45 disponibles ; 5 à résoudre
[                 Confirmer réception       ]
```
Le résumé annonce l’effet avant confirmation ; une réception partielle ne vaut pas dossier terminé.
''']
for row in SCREENS:
    sid,title,route,role,entry,fields,action,destination,api,tables,transitions,tests=row
    r=dict(id=sid,title=title,route=route,role=role,entry=entry,fields=fields.split(';'),primary_action=action,exit=destination,api=api.split(';'),tables=split(tables),transitions=split(transitions),tests=split(tests))
    extra_tests={'E04':['T14'],'E09':['T53'],'E17':['T84'],'E27':['T81'],'E33':['T82']}
    r['tests'].extend(extra_tests.get(sid,[]))
    records.append(r)
    md.extend([f'\n## {sid} — {title}\n',f'**Route :** `{route}`. **Utilisateur :** {role}.\n',f'**Entrée :** {entry}. **Après action :** {destination}.\n','| Champ ou bloc | Règle |\n|---|---|\n'])
    for fld in r['fields']:
        md.append(f'| {fld.replace("*", "")} | {"Obligatoire selon condition indiquée ; vérifier côté serveur" if "*" in fld else "Lecture ou facultatif selon libellé ; ne produit aucun effet seul"} |\n')
    md.append(f'\n**Action principale :** {action}.\n\n**Contrats :** '+ '; '.join(f'`{x}`' for x in r['api'])+'.\n')
    md.append('**Données :** '+', '.join(f'`{x}`' for x in r['tables'])+'. **Transitions :** '+', '.join(r['transitions'])+'. **Recette :** '+', '.join(r['tests'])+'.\n')
    md.append('**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.\n')
(OUT/'catalogue-ecrans.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'03-fiches-ecrans.md').write_text(''.join(md),encoding='utf-8')

md=['# Matrice de couverture de la conception\n\nUne ligne par écran principal, avec transitions, commandes, données et scénarios. Les fiches comprennent les formulaires, panneaux et étapes internes pour ne pas multiplier artificiellement les pages. La présence d’un lien ne prouve pas qu’un test a été exécuté.\n\n', '| Écran | Utilisateur | Transitions | Commandes | Tables | Scénarios |\n|---|---|---|---|---|---|\n']
for r in records:
    md.append('| '+ ' | '.join([r['id']+' '+r['title'],r['role'],', '.join(r['transitions']),'<br>'.join('`'+x+'`' for x in r['api']),', '.join(r['tables']),', '.join(r['tests'])])+' |\n')
md.append('\n## Couverture des responsabilités\n\nLe gérant prépare et déclare ; le propriétaire autorise et tranche les écarts. Une réception de boutique exige le gérant destinataire ; une autorisation ne remplace jamais la réception. Les tâches sans écran dédié (notification, expiration, journal, calcul de coût) sont des traitements système déclenchés par les commandes, sans nouvel utilisateur artificiel.\n')
md.append('\n## Scénarios techniques sans écran propre\n\n| Scénario | Traitement | Vérification future |\n|---|---|---|\n| T57 | Arrondis et couches de coût | Test de conservation des valeurs |\n| T58 | Atomicité journal et projections | Injection de panne dans transaction PostgreSQL |\n| T59 | Sauvegarde et restauration | Exercice exploitation en environnement isolé |\n')
(OUT/'04-couverture.md').write_text(''.join(md),encoding='utf-8')
print(f'{len(records)} écrans détaillés, catalogue JSON et matrice produits.')
