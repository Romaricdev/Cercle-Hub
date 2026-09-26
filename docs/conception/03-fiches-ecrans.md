# Fiches des interfaces et écrans
Version 2.1. Les 40 fiches remplacent le seul inventaire synthétique comme référence de détail. `*` = obligatoire. Les exigences générales de 06-ecrans restent applicables. Les routes à ID sont paramètres, pas liens vers une application déjà existante.
## Contrat commun de chaque écran
- En-tête : boutique active, titre, statut réseau ; ne jamais cacher la boutique lors d’une saisie financière.
- Corps : lecture contexte → champs utiles → résumé des effets. Options avancées repliées.
- Pied : une action principale nommée selon l’effet réel ; retour et brouillon secondaires.
- Chargement : aucune valeur zéro simulée ; erreur réseau conserve saisie et référence de tentative.
- Validation : obligatoire près du champ, erreur métier au-dessus du bouton ; aucune remise à zéro du formulaire.
- Double action : bouton en attente, même clé de commande jusqu’au résultat ; aucune nouvelle tentative avec nouvel ID après timeout inconnu.
- Droits : absence de bouton interdit + contrôle serveur ; lecteur secondaire voit une bannière et aucune commande.
- Hors ligne : seuls E04/E05 cash, brouillons E10/E11 et E08 sont exécutables ; autres pages en lecture snapshot datée ou indisponibles si jamais chargées.
- Sortie avec changements : conserver brouillon ou demander abandon ; jamais perdre événement déjà soumis.
- Lecture mobile : cartes empilées, pas tableau large obligatoire ; desktop peut montrer liste + détail.
## Maquettes fonctionnelles des parcours critiques
### Vente sur téléphone
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

## E01 — Connexion
**Route :** `/login`. **Utilisateur :** Tous.
**Entrée :** Lien ou session expirée. **Après action :** E02 si entreprise non initialisée, sinon E03 ou E17.
| Champ ou bloc | Règle |
|---|---|
| E-mail | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Mot de passe | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Activation TOTP owner obligatoire | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Challenge second facteur si activé | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Code de secours à usage unique | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Lien de récupération | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Se connecter.

**Contrats :** `/api/auth/*`.
**Données :** `app_users`. **Transitions :** S01. **Recette :** T02.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E02 — Initialisation
**Route :** `/setup`. **Utilisateur :** Propriétaire et gérant SETUP pour comptages.
**Entrée :** Première connexion ou nouvelle boutique E26. **Après action :** Récapitulatif figé puis E26 ACTIVE ; gérant revient E03.
| Champ ou bloc | Règle |
|---|---|
| Entreprise | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Devise | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Fuseau | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Boutique | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Gérant | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Produits et prix | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Coupures initiales | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Stocks par lot | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Valeurs ou estimations | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Créances et dettes initiales facultatives | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Valider les données initiales (owner).

**Contrats :** `POST /shops/:id/opening-balances`; `POST /shops/:id/activate`.
**Données :** `opening_drafts`, `opening_stock_lines`, `opening_obligations`, `shops`. **Transitions :** S01, S12. **Recette :** T01, T78.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E03 — Accueil gérant
**Route :** `/manager`. **Utilisateur :** Gérant.
**Entrée :** Connexion réussie. **Après action :** E04 ou ouverture E07 si nécessaire.
| Champ ou bloc | Règle |
|---|---|
| Session en lecture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Tâches | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Réceptions | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Demandes | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Dernière synchronisation | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Nouvelle vente.

**Contrats :** `GET /me`; `GET /notifications`; `GET /cash-sessions/current`.
**Données :** `cash_sessions`, `notifications`, `devices`. **Transitions :** S01, S02, S03. **Recette :** T02, T38.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E04 — Panier de vente
**Route :** `/manager/sale`. **Utilisateur :** Gérant principal.
**Entrée :** E03 ou navigation Vendre. **Après action :** E05 avec panier conservé ; retour depuis E05 sans perte.
| Champ ou bloc | Règle |
|---|---|
| Recherche produit | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Variante si multiple | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Unité | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Quantité | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Remise facultative sous plafond | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Passer au paiement.

**Contrats :** `GET /stock`; `POST /sales/quote`.
**Données :** `products`, `variants`, `sale_units`, `prices`, `stock_balances`. **Transitions :** S02. **Recette :** T08, T09, T10, T11, T12, T15, T14.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E05 — Paiement vente
**Route :** `/manager/sale/payment`. **Utilisateur :** Gérant principal.
**Entrée :** Panier valide E04. **Après action :** E06 après POSTED ; reçu local si offline ; erreur conserve panier.
| Champ ou bloc | Règle |
|---|---|
| Mode | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Montant par mode | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Espèces reçues si cash | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Client si crédit | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Échéance si crédit | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Référence externe facultative | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Confirmer la vente.

**Contrats :** `POST /sales/quote`; `POST /sales`.
**Données :** `sales`, `sale_lines`, `payments`, `customer_payment_allocations`. **Transitions :** S02, S12, S14. **Recette :** T03, T04, T05, T06, T07, T16, T45.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E06 — Reçu et détail vente
**Route :** `/manager/sales/[id]`. **Utilisateur :** Gérant boutique et owner via E35.
**Entrée :** Confirmation vente ou recherche historique. **Après action :** Impression même page ; retour E33 ; nouvelle vente E04.
| Champ ou bloc | Règle |
|---|---|
| Référence | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Lignes figées | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Paiements | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Dette | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Retours | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Statut local/serveur | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Imprimer ou demander un retour.

**Contrats :** `GET /sales/:id`; `POST /sales/:id/reversal-request`.
**Données :** `sales`, `returns`, `payments`. **Transitions :** S02, S06. **Recette :** T20, T21, T22.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E07 — Session de caisse
**Route :** `/manager/cash`. **Utilisateur :** Gérant principal.
**Entrée :** Navigation Plus ou vente sans session. **Après action :** E08 si comptage, E03 si ouverture.
| Champ ou bloc | Règle |
|---|---|
| Statut | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Historique clôtures | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Alertes de synchronisation | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Aucun attendu courant | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Ouvrir ou compter ma caisse.

**Contrats :** `POST /cash-sessions/open`; `POST /cash-sessions/:id/start-count`.
**Données :** `cash_sessions`, `cash_closures`. **Transitions :** S01, S03. **Recette :** T37, T38, T61.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E08 — Comptage aveugle
**Route :** `/manager/cash/count`. **Utilisateur :** Gérant principal.
**Entrée :** Session COUNTING ou comptage local autorisé. **Après action :** Résultat figé sur même écran ; correction ouvre E36 avec type RECOUNT.
| Champ ou bloc | Règle |
|---|---|
| Nombre par coupure | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Total déclaré calculé | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Après soumission explication si écart | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Enregistrer mon comptage.

**Contrats :** `POST /cash-sessions/:id/submit-count`; `POST /cash-sessions/:id/cancel-count`.
**Données :** `cash_closures`, `money_events`, `discrepancy_cases`. **Transitions :** S03, S14. **Recette :** T37, T38, T39, T41, T50, T64.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E09 — Dépense
**Route :** `/manager/expenses/new`. **Utilisateur :** Gérant principal.
**Entrée :** Plus ou demande autorisée E11. **Après action :** E11 si accord demandé ; détail dépense si paiement confirmé.
| Champ ou bloc | Règle |
|---|---|
| Catégorie | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Description | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Montant | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Source | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Justificatif ou absence motivée | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Indication déjà payé seulement parcours irrégulier | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Demander accord ou enregistrer paiement (libellés distincts).

**Contrats :** `POST /expenses`; `POST /expenses/:id/submit`; `POST /expenses/:id/pay`; `POST /expenses/declare-irregular`.
**Données :** `expenses`, `requests`, `approvals`, `payments`. **Transitions :** S05. **Recette :** T23, T24, T25, T26, T53.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E10 — Demandes
**Route :** `/manager/requests`. **Utilisateur :** Gérant.
**Entrée :** Navigation Demandes. **Après action :** Formulaire puis E11 ; brouillon offline indiqué non envoyé.
| Champ ou bloc | Règle |
|---|---|
| Filtre type/état | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Nouvelle demande type | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Priorité | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Recherche référence | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Demander des produits ou des fonds.

**Contrats :** `GET /requests`; `POST /requests`.
**Données :** `requests`, `request_lines`. **Transitions :** S04. **Recette :** T27, T28.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E11 — Détail demande
**Route :** `/manager/requests/[id]`. **Utilisateur :** Gérant boutique.
**Entrée :** Liste ou notification. **Après action :** Reste détail après soumission ; E12 pour achat autorisé.
| Champ ou bloc | Règle |
|---|---|
| Lignes demandées | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Lignes accordées | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Budget | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Source | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Validité | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Question à compléter | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Justificatifs | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Soumettre / compléter / acheter selon état.

**Contrats :** `PATCH /requests/:id`; `POST /requests/:id/submit`; `GET /requests/:id`.
**Données :** `requests`, `approvals`, `approval_lines`. **Transitions :** S04, S07. **Recette :** T27, T28, T72.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E12 — Achat par gérant
**Route :** `/manager/purchases/new`. **Utilisateur :** Gérant principal désigné.
**Entrée :** Demande approuvée E11. **Après action :** Détail achat ; E13 si réception différée ; écart renvoie demande de complément.
| Champ ou bloc | Règle |
|---|---|
| Accord en lecture | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Fournisseur | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Lignes réelles | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Frais facture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Frais transport distincts | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Paiements | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Réception immédiate oui/non | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Pièces | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Acheter et recevoir ou enregistrer achat.

**Contrats :** `POST /purchases`; `POST /purchases/with-receipt`.
**Données :** `purchases`, `purchase_lines`, `purchase_fees`, `receipts`. **Transitions :** S07, S08. **Recette :** T27, T29, T34, T68.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E13 — Réception
**Route :** `/manager/receipts/[id]`. **Utilisateur :** Gérant destinataire principal.
**Entrée :** Accueil ou notification livraison. **Après action :** Résumé quantités mises en stock et restant ; dossier si écart.
| Champ ou bloc | Règle |
|---|---|
| Attendu restant en lecture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Reçu vendable | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Reçu abîmé | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Surplus déclaré | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Lots/dates selon produit | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Livraison terminée oui/non | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Confirmer cette réception.

**Contrats :** `POST /receipts`; `GET /shipments/:id`.
**Données :** `receipts`, `receipt_lines`, `cost_layers`, `discrepancy_cases`. **Transitions :** S08. **Recette :** T31, T32, T33, T71.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E14 — Stock boutique
**Route :** `/manager/stock`. **Utilisateur :** Gérant.
**Entrée :** Navigation Stock. **Après action :** E10 demande préremplie ; E31 perte ; détail mouvements local.
| Champ ou bloc | Règle |
|---|---|
| Recherche | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Filtre seuil/expiration | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Disponible | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Non vendable | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Unité | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Lots | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Historique sans coût | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Demander produits ou déclarer problème.

**Contrats :** `GET /stock`; `GET /stock/movements`.
**Données :** `stock_balances`, `stock_entries`, `lots`. **Transitions :** S04, S11. **Recette :** T12, T13, T44.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E15 — Clients et créances
**Route :** `/manager/customers`. **Utilisateur :** Gérant en ligne.
**Entrée :** Plus si crédit actif ou dette existante. **Après action :** Reçu et dettes restantes sur détail client.
| Champ ou bloc | Règle |
|---|---|
| Nom | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Téléphone | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Dettes en lecture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Montant règlement | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Mode | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Aperçu affectation | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Enregistrer le règlement.

**Contrats :** `GET /customers`; `POST /customers`; `POST /customer-payments/preview`; `POST /customer-payments`.
**Données :** `customers`, `customer_payment_allocations`, `opening_obligations`. **Transitions :** S12. **Recette :** T17, T18, T19, T55, T78.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E16 — Synchronisation
**Route :** `/manager/sync`. **Utilisateur :** Gérant.
**Entrée :** Bandeau statut ou Plus. **Après action :** Même écran, lien dossier de conflit ; aucun bouton effacer.
| Champ ou bloc | Règle |
|---|---|
| Dernier succès | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Événements en attente | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Échecs | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Séquence | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Motifs compréhensibles | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Réessayer la synchronisation.

**Contrats :** `POST /sync/handshake`; `POST /sync/push`; `GET /sync/pull`.
**Données :** `device_events`, `sync_changes`, `devices`. **Transitions :** S14. **Recette :** T45, T46, T47, T48, T49, T50, T51, T52, T62, T63.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E17 — Vue propriétaire
**Route :** `/owner`. **Utilisateur :** Propriétaire.
**Entrée :** Connexion ou navigation. **Après action :** E18 ou listes détaillées E27/E35.
| Champ ou bloc | Règle |
|---|---|
| Période | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Boutique/toutes | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Ventes | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Encaissements | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Dépenses | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Créances | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Résultat brut estimé | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Stock disponible et valeur | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Écarts | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Décisions en attente | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Alertes | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Fraîcheur | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Traiter les actions prioritaires ou ouvrir un indicateur.

**Contrats :** `GET /reports/overview`; `GET /notifications`.
**Données :** `sales`, `payments`, `money_entries`, `stock_balances`, `discrepancy_cases`, `sync_cursors`. **Transitions :** S13. **Recette :** T60, T80, T84.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E18 — Décider une demande
**Route :** `/owner/requests/[id]`. **Utilisateur :** Propriétaire.
**Entrée :** Liste des demandes ou notification. **Après action :** Même dossier avec décision figée ; gérant notifié.
| Champ ou bloc | Règle |
|---|---|
| Besoin | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Stock connu | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Lignes approuvées | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Budget | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Acheteur | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Source | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Validité | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif si partiel/refus | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Approuver, demander complément ou refuser.

**Contrats :** `POST /requests/:id/decision`.
**Données :** `requests`, `approvals`, `approval_lines`. **Transitions :** S04. **Recette :** T27, T28, T72.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E19 — Achats propriétaire
**Route :** `/owner/purchases`. **Utilisateur :** Propriétaire.
**Entrée :** Navigation Achats. **Après action :** Détail avec réception/répartition/règlement ; E20 envoi ou E34 paiement.
| Champ ou bloc | Règle |
|---|---|
| Fournisseur | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Produits/unités/prix | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Frais séparés | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Destination par ligne | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Paiements | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Échéance | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Réception immédiate facultative | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Enregistrer achat.

**Contrats :** `GET /purchases`; `POST /purchases`; `POST /purchases/with-receipt`.
**Données :** `purchases`, `purchase_destinations`, `purchase_fees`. **Transitions :** S07, S08. **Recette :** T31, T34, T68, T69.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E20 — Transferts propriétaire
**Route :** `/owner/transfers`. **Utilisateur :** Propriétaire.
**Entrée :** Navigation Stock/transferts ou achat. **Après action :** Détail transfert, bordereau, notification destinataire.
| Champ ou bloc | Règle |
|---|---|
| Origine | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Destination | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Lignes/quantités | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Transit et réceptions en lecture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Autoriser puis expédier si détenteur.

**Contrats :** `POST /shipments`; `POST /shipments/:id/approve`; `POST /shipments/:id/dispatch`.
**Données :** `shipments`, `shipment_lines`, `shipment_cost_allocations`. **Transitions :** S08. **Recette :** T31, T32, T60, T71.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E21 — Fonds propriétaire
**Route :** `/owner/funds`. **Utilisateur :** Propriétaire.
**Entrée :** Navigation Fonds. **Après action :** Détail remise avec transit/reliquat distinct.
| Champ ou bloc | Règle |
|---|---|
| Sources et soldes déclarés | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Montant | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Destination | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Avance liée facultative | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Reçus | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Enregistrer remise ou confirmer réception.

**Contrats :** `GET /fund-transfers`; `POST /fund-transfers`; `POST /fund-transfers/:id/send`; `POST /fund-transfers/:id/receive`.
**Données :** `fund_transfers`, `fund_receipts`, `money_entries`. **Transitions :** S09. **Recette :** T29, T30, T65.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E22 — Liste des contrôles
**Route :** `/owner/controls`. **Utilisateur :** Propriétaire.
**Entrée :** Navigation Contrôles. **Après action :** E23, E24 ou E36 selon type.
| Champ ou bloc | Règle |
|---|---|
| Type | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Boutique | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Statut | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Ancienneté | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Montant/quantité | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Action attendue | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Examiner un dossier.

**Contrats :** `GET /discrepancies`; `GET /stock-counts`.
**Données :** `discrepancy_cases`, `cash_closures`, `stock_counts`. **Transitions :** S13. **Recette :** T37, T40, T42.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E23 — Dossier d’écart
**Route :** `/owner/controls/[id]`. **Utilisateur :** Propriétaire.
**Entrée :** E22 ou opération signalée. **Après action :** Dossier mis à jour ; ne résoudre que résiduel traité.
| Champ ou bloc | Règle |
|---|---|
| Original | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Résiduel | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Historique | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Justificatifs | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Type décision | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Correction spécifique | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Appliquer décision.

**Contrats :** `GET /discrepancies/:id`; `POST /discrepancies/:id/resolve`.
**Données :** `discrepancy_cases`, `discrepancy_actions`, `money_events`, `stock_events`. **Transitions :** S13. **Recette :** T40, T41, T73, T74.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E24 — Inventaire propriétaire
**Route :** `/owner/inventories/[id]`. **Utilisateur :** Propriétaire.
**Entrée :** Créer depuis Contrôles ou demande soumise. **Après action :** Rapport ajustements et historique ; notifications gérant.
| Champ ou bloc | Règle |
|---|---|
| Lieu | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Scope | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Comptages | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Différences | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Coût estimé si nécessaire | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Motif par écart | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Démarrer / demander recomptage / valider selon état.

**Contrats :** `POST /stock-counts`; `POST /stock-counts/:id/start`; `POST /stock-counts/:id/decision`.
**Données :** `stock_counts`, `stock_count_lines`, `stock_count_locks`. **Transitions :** S11. **Recette :** T42, T43, T75, T76.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E25 — Catalogue et prix
**Route :** `/owner/products`. **Utilisateur :** Propriétaire.
**Entrée :** Navigation Produits. **Après action :** Liste filtrée et détail ; jamais stock créé par catalogue.
| Champ ou bloc | Règle |
|---|---|
| Nom | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Référence | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Unité | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Précision | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Variante standard automatique | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Options avancées | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Prix par boutique | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Seuils | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Enregistrer produit ou nouvelle version de prix.

**Contrats :** `POST /products`; `POST /products/:id/variants`; `POST /variants/:id/units`; `POST /prices`.
**Données :** `products`, `variants`, `sale_units`, `prices`, `shop_products`. **Transitions :** S01. **Recette :** T10, T11, T12, T13.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E26 — Boutique et responsabilité
**Route :** `/owner/shops/[id]`. **Utilisateur :** Propriétaire.
**Entrée :** Liste boutiques. **Après action :** E02 pour initialisation ; E36 secours ; historique conservé.
| Champ ou bloc | Règle |
|---|---|
| Nom/code | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Contact | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Gérant | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Statut | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Paramètres effectifs | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Blocages de fermeture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Activer / suspendre / remplacer selon état.

**Contrats :** `POST /shops`; `POST /shops/:id/activate`; `POST /shops/:id/suspend`; `POST /shops/:id/close`.
**Données :** `shops`, `manager_assignments`, `opening_drafts`. **Transitions :** S01, S15. **Recette :** T01, T56, T77.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E27 — Rapports
**Route :** `/owner/reports`. **Utilisateur :** Propriétaire.
**Entrée :** Navigation Rapports. **Après action :** Table détail ; état job puis téléchargement autorisé.
| Champ ou bloc | Règle |
|---|---|
| Type | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Période | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Boutique | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Date activité explicitée | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Filtre produit/mode selon rapport | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Format CSV/PDF | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Afficher ou exporter.

**Contrats :** `GET /reports/overview`; `POST /exports`; `GET /exports/:id`.
**Données :** `export_jobs`, `sales`, `money_entries`, `stock_entries`. **Transitions :** S13. **Recette :** T54, T60, T80, T81.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E28 — Paramètres métier
**Route :** `/owner/settings`. **Utilisateur :** Propriétaire.
**Entrée :** Navigation Paramètres. **Après action :** Résumé des changements et date d’effet ; historiques inchangés.
| Champ ou bloc | Règle |
|---|---|
| Portée réseau/boutique | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Remise max | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Dépense unitaire/session | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Crédits | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Péremption | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Délai retours | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Sources/liens admin | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Enregistrer nouvelle version.

**Contrats :** `GET /policies`; `POST /policies`.
**Données :** `policies`. **Transitions :** S04, S12. **Recette :** T26, T55, T83.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E29 — Expédition gérant
**Route :** `/manager/transfers/[id]`. **Utilisateur :** Gérant source principal.
**Entrée :** Plus > Transferts ou notification accord. **Après action :** Bordereau et transit ; pas réception automatique.
| Champ ou bloc | Règle |
|---|---|
| Destinataire en lecture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Quantités autorisées | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Quantités réellement remises | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Lots proposés | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Motif si partiel | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Confirmer l’expédition.

**Contrats :** `POST /shipments/:id/dispatch`; `POST /shipments/:id/submit`.
**Données :** `shipments`, `shipment_lines`, `stock_entries`. **Transitions :** S08. **Recette :** T32, T71.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E30 — Fonds du gérant
**Route :** `/manager/funds`. **Utilisateur :** Gérant principal.
**Entrée :** Plus > Fonds ou notification remise. **Après action :** Détail reçus et reliquat ; jamais attendu courant.
| Champ ou bloc | Règle |
|---|---|
| Liste remises sans solde global | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Montant reçu à confirmer | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Montant à remettre | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Destinataire | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Confirmer reçu ou enregistrer remise réelle.

**Contrats :** `POST /fund-transfers`; `POST /fund-transfers/:id/send`; `POST /fund-transfers/:id/receive`.
**Données :** `fund_transfers`, `fund_receipts`. **Transitions :** S09. **Recette :** T29, T30, T65.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E31 — Perte ou casse
**Route :** `/manager/losses/new`. **Utilisateur :** Gérant principal.
**Entrée :** Stock > Signaler problème. **Après action :** Quantité isolée, dossier en attente, lien suivi.
| Champ ou bloc | Règle |
|---|---|
| Produit | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Lot selon produit | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Quantité | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Présent abîmé ou manquant | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Photo facultative | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Déclarer le problème.

**Contrats :** `POST /loss-reports`.
**Données :** `loss_reports`, `stock_entries`, `discrepancy_cases`. **Transitions :** S11. **Recette :** T44, T75.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E32 — Comptage inventaire gérant
**Route :** `/manager/inventories/[id]`. **Utilisateur :** Gérant de la boutique.
**Entrée :** Notification inventaire ouvert. **Après action :** Lecture figée en attente owner ; aucun déblocage automatique.
| Champ ou bloc | Règle |
|---|---|
| Produits/lot/compartiment | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Quantités comptées | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif différences à soumission | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Progression | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Soumettre le comptage.

**Contrats :** `PUT /stock-counts/:id/lines`; `POST /stock-counts/:id/submit`.
**Données :** `stock_counts`, `stock_count_lines`. **Transitions :** S11. **Recette :** T42, T43, T76.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E33 — Retour et remboursement client
**Route :** `/manager/returns/[id]`. **Utilisateur :** Gérant principal.
**Entrée :** Vente E06 ou liste retours. **Après action :** Détail retour avec obligation restante ; reçu remboursement.
| Champ ou bloc | Règle |
|---|---|
| Vente en lecture | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Lignes/quantités | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif | Obligatoire selon condition indiquée ; vérifier côté serveur |
| État produit | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Après accord quantités reçues | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Source/montant remboursement | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Demander / recevoir / rembourser selon étape.

**Contrats :** `POST /returns`; `POST /returns/:id/receive`; `POST /returns/:id/refund`.
**Données :** `returns`, `return_receipts`, `return_value_allocations`, `refund_allocations`. **Transitions :** S06. **Recette :** T20, T21, T22, T70, T82.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E34 — Fournisseurs et paiements
**Route :** `/owner/suppliers/[id]`. **Utilisateur :** Propriétaire ; vue restreinte gérant /manager/suppliers/[id].
**Entrée :** Achats > Fournisseur. **Après action :** Reçu et solde restant ; retour fournisseur sous onglet dédié.
| Champ ou bloc | Règle |
|---|---|
| Achats et dettes | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Sélection obligations | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Montant par obligation | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Source | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Référence facultative | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Payer ou enregistrer remboursement fournisseur.

**Contrats :** `POST /supplier-payments`; `POST /supplier-returns`; `POST /supplier-returns/:id/confirm-credit`.
**Données :** `suppliers`, `supplier_payment_allocations`, `supplier_returns`. **Transitions :** S10, S12. **Recette :** T35, T36, T79.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E35 — Historique détaillé propriétaire
**Route :** `/owner/sales/[id]`. **Utilisateur :** Propriétaire.
**Entrée :** Rapport ventes ou recherche référence. **Après action :** Gérant notifié pour exécution physique ; pas sortie cash immédiate.
| Champ ou bloc | Règle |
|---|---|
| Vente | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Paiements | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Coûts | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Demande retour/annulation | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Motif décision | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Autoriser/refuser une correction.

**Contrats :** `GET /sales/:id`; `POST /returns/:id/decision`; `POST /requests/:id/decision`.
**Données :** `sales`, `approvals`, `returns`. **Transitions :** S02, S06. **Recette :** T20, T22, T74.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E36 — Correction et reprise
**Route :** `/owner/takeovers/[id]`. **Utilisateur :** Propriétaire ; gérant accès à sa demande uniquement.
**Entrée :** Écart, recomptage ou appareil perdu. **Après action :** Chronologie, opérations liées, reprise appareil après rapprochement.
| Champ ou bloc | Règle |
|---|---|
| Type | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Source | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Motif | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Éléments connus | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Montants/quantités selon action | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Limites de données | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Valider une étape de reprise.

**Contrats :** `POST /cash-closures/:id/recounts`; `POST /recounts/:id/decision`; `POST /recovery-cases`.
**Données :** `recount_requests`, `opening_and_recovery_cases`, `device_sequence_resolutions`. **Transitions :** S03, S13, S14, S15. **Recette :** T41, T48, T63, T77.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E37 — Utilisateurs et affectations
**Route :** `/owner/users`. **Utilisateur :** Propriétaire.
**Entrée :** Paramètres > Utilisateurs. **Après action :** Confirmation étapes, pas deux affectations actives.
| Champ ou bloc | Règle |
|---|---|
| Nom | Obligatoire selon condition indiquée ; vérifier côté serveur |
| E-mail | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Boutique | Obligatoire selon condition indiquée ; vérifier côté serveur |
| État invitation | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Dates affectations | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Motif désactivation/remplacement | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Réauthentification sensible | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Gestion du second facteur owner | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Inviter ou remplacer le gérant.

**Contrats :** `POST /users`; `POST /shops/:id/assign-manager`; `POST /users/:id/deactivate`.
**Données :** `app_users`, `manager_assignments`. **Transitions :** S01, S15. **Recette :** T02, T61, T77.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E38 — Appareil principal
**Route :** `/owner/devices`. **Utilisateur :** Propriétaire ; gérant enregistrement /manager/device.
**Entrée :** Première utilisation ou Paramètres. **Après action :** Confirmation principale, gérant peut ouvrir caisse ; secours E36.
| Champ ou bloc | Règle |
|---|---|
| Nom appareil | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Boutique | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Dernier contact | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| File connue | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Statut capacité | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Motif révocation | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Approuver cet appareil ou révoquer.

**Contrats :** `POST /devices/register`; `POST /devices/:id/approve`; `POST /devices/:id/revoke`.
**Données :** `devices`, `device_capabilities`. **Transitions :** S01, S14. **Recette :** T48, T51, T61, T62.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E39 — Sources de paiement
**Route :** `/owner/sources`. **Utilisateur :** Propriétaire.
**Entrée :** Paramètres > Sources de fonds. **Après action :** Compte et historique ; solde jamais édité directement après usage.
| Champ ou bloc | Règle |
|---|---|
| Nom | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Type | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Responsable/lieu | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Solde initial | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Actif | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Motif correction | Obligatoire selon condition indiquée ; vérifier côté serveur |

**Action principale :** Créer source ou enregistrer apport réel.

**Contrats :** `POST /payment-sources`; `POST /owner-fund-events`.
**Données :** `payment_sources`, `money_accounts`, `money_events`. **Transitions :** S01, S09. **Recette :** T25, T29, T66.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.

## E40 — Lieux et dépôt
**Route :** `/owner/locations`. **Utilisateur :** Propriétaire.
**Entrée :** Stock > Lieux. **Après action :** E20 transfert ; désactivation conserve soldes existants consultables.
| Champ ou bloc | Règle |
|---|---|
| Stock owner permanent | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Dépôt optionnel | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Nom | Obligatoire selon condition indiquée ; vérifier côté serveur |
| Activation | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |
| Quantités par état | Lecture ou facultatif selon libellé ; ne produit aucun effet seul |

**Action principale :** Activer dépôt ou consulter/déplacer stock.

**Contrats :** `GET /locations`; `POST /locations/depot`; `PATCH /locations/:id`.
**Données :** `locations`, `stock_balances`. **Transitions :** S08, S15. **Recette :** T31, T56, T67.
**Contrôle des états :** appliquer le contrat commun ci-dessus ; condition d’autorisation dans les transitions citées. Si refus métier, afficher la raison et conserver la saisie ; si résultat réseau inconnu, rechercher la commande originale avant toute nouvelle exécution.
