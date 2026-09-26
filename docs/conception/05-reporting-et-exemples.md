# Définitions des chiffres et exemples de rapprochement

## RM10 — Frais d’achat et dettes

Achat 10 articles ×1 000 =10 000 ; frais fournisseur 500 ; transporteur externe 300. Dette fournisseur avant paiement =10 500, pas 10 800. Valeur des produits =10 800 si frais connus et capitalisés avant réception. Paiement fournisseur 10 500 et paiement transporteur 300 donnent sorties 10 800, sans compter la dépense transport deux fois dans résultat d’exploitation.

Réception partielle 4 articles : valeur 4 320. Reste 6 :6 480. Retour fournisseur 1 article remboursé au prix facturé 1 050 : coût sorti 1 080, différence 30 conservée comme coût logistique non récupéré. Aucun encaissement avant remboursement réel. Les valeurs du retour sont séparées, le coût sorti ne dicte pas arbitrairement le montant dû par le fournisseur.

## RM11 — Retours après règlement et abandon

Vente nette 5 000 ; paiements cumulés 2 000 ; dette vivante 2 000 ; abandon de créance 1 000. Retour accepté de 4 000 : diminution dette 2 000, reprise abandon 1 000, remboursement dû 1 000. La vente restante est 1 000, financée par paiement net après remboursement de 1 000. Ne pas rembourser une créance abandonnée comme si elle avait été payée.

Ordre d’absorption pour un retour : dette vivante de la vente, abandon encore affecté à cette vente, puis paiements nets non déjà remboursés. Total retours <= net vente initial. Lorsque plusieurs lignes existent, conserver allocations pour éviter remboursement excessif après retours successifs. Un encaissement intervenu pendant préparation du retour force recalcul sous verrou avant réception.

## RM12 — Table de référence des indicateurs

| Indicateur | Source et définition | Date de rattachement |
|---|---|---|
| Ventes brutes | Somme gross_line de ventes postées, hors brouillons/inbox | business_date vente |
| Remises | Somme discount_line postées | business_date vente |
| Chiffre d’affaires net | Ventes nettes − valeur commerciale des retours reçus − annulations exécutées, sans double déduction | Date vente ; retour/correction dans sa propre période, référence origine visible |
| Encaissements commerciaux | Paiements IN affectés ventes/créances moins remboursements clients OUT affichés séparément | business_date paiement ou date locale si source owner non cash |
| Apports/reversements | Journaux de transfert fonds, exclus des encaissements commerciaux | Date mouvement |
| Dépenses payées | Paiements de charges, distincts paiements achats et remises internes | Date paiement |
| Achats acquis | Montants de produits effectivement réceptionnés valorisés, distincts engagements commandés | Date réception |
| Dettes fournisseurs | Obligations postées + ouverture − règlements − crédits reconnus | Solde à asOf |
| Créances clients | Ventes + ouverture − paiements − réductions de dette − abandons + reprises pertinentes | Solde à asOf |
| Coût des ventes | Allocations sorties vente − coûts retournés rattachés | Date vente/retour |
| Marge brute estimée | CA net − coût des ventes | Même période, coûts inconnus signalés |
| Fonds disponibles | Comptes détenteurs, sans comptes techniques ni transit compté deux fois | Solde à asOf |
| Stock détenu théorique | Tous lieux hors pertes définitives, compartiments distincts | Instant du snapshot |
| Stock vendable | AVAILABLE non expiré, hors locks inventaire pour disponibilité opérationnelle | Instant du snapshot |
| Écarts ouverts | Résiduel des dossiers, pas somme infinie de tous écarts historiques déjà résolus | État à asOf |

Pas de « bénéfice net » tant que périmètre comptable complet absent. Totaux gérant respectent le masquage de caisse. Rapports owner peuvent exposer caisse théorique, déclarée et variance sans la présenter comme vérification physique.

## RM13 — Dates et fraîcheur

Une session ouverte lundi 23h et fermée mardi 01h a business_date lundi ; son reçu affiche heure réelle mardi si la vente a eu lieu après minuit. Les rapports ont un filtre « Journées d’activité » par défaut et ne mélangent pas minuit civil et session. Documents sans session ont date locale de occurred_at comme business_date. L’écran précise la convention dans l’aide.

Toute synthèse donne generatedAt et `shopFreshness[{shopId,lastSyncAt,pendingKnownEvents,hasUnreconciledFacts}]`. Le serveur ne connaît pas le nombre d’événements encore exclusivement sur un appareil coupé : afficher « Données potentiellement incomplètes », jamais un faux « 0 en attente ».

## Scénario complet de démonstration papier

Boutique A ouvre avec 50 000 et 20 P de coût 600/prix 1 000. Vendre 2 P cash : caisse 52 000, stock18, CA2 000, coût1 200. Dépense autorisée 1 000 cash : caisse51 000. Vente crédit 3 P avec acompte cash1 000 : caisse52 000, stock15, CA cumulé5 000, créance2 000, coût cumulé3 000.

Owner remet 10 000, gérant confirme : caisse62 000, aucune vente. Gérant achète 5 P à700 et reçoit : caisse58 500, stock20, nouvelle couche5/3 500. Clôture déclarée58 000 : attendu58 500, delta−500, caisse reprise58 000 et anomalie500. CA reste5 000 ; aucune dépense500 fabriquée. Marge brute2 000 ; charge d’exploitation1 000, mais ne pas appeler différence bénéfice net.

Le lendemain règlement client2 000 cash : caisse60 000, créance0, CA du lendemain0. Retour d’un P de la première vente : stock+1 coût600, remboursement1 000 cash si exécuté : caisse59 000. La marge du lendemain comprend l’effet du retour de la vente précédente, signalé dans détail. Si manque500 expliqué comme dépense oubliée, reclasser variance vers charge sans réduire caisse59 000 une seconde fois.
