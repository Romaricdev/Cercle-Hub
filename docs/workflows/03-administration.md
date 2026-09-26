# Administration et événements exceptionnels

## Initialisation

Propriétaire initial créé par CLI sécurisée. Assistant première connexion : nom entreprise, monnaie/fuseau (défauts visibles), nom première boutique, compte gérant, fonds initiaux et produits. Boutiques supplémentaires même parcours. Trois boutiques démo en seed de développement seulement.

Boutique SETUP : gérant peut saisir stock initial et cash initial, propriétaire valide. Unité, lots, quantité et coût initial nécessaires pour stocks ; coût inconnu permet état SETUP avec avertissement, mais activation exige estimation propriétaire explicite ou zéro justifié. La valeur estimée reste étiquetée dans rapports.

Activation atomique crée journal OPENING, couches initiales et statut ACTIVE. Aucun doublon si retry. Après activation, pas d’édition de ces champs : ajustement ou nouvel apport. Stock/cash zéro exige case de confirmation explicite.

## Produits et prix

Propriétaire crée produit, unité, variante standard puis options. Changement de libellé et prix autorisé ; suppression d’un produit utilisé interdite, archivage possible si stock et dossiers restants visibles. Unités/facteurs utilisés figés ; nouvelle version de conditionnement pour changement.

Définir prix par boutique en tableau, action « appliquer aux boutiques sélectionnées ». Prix actifs horodatés. Appareil hors ligne utilise snapshot autorisé jusqu’à expiration de capacité ; différence de prix à la synchronisation signalée comme tarif antérieur autorisé, pas recalcul rétroactif. Prix owner change immédiatement pour prochaines ventes en ligne après réception du snapshot.

## Remplacement du gérant

Exiger connexion de l’appareil principal, backlog nul, clôture de session, aucun inventaire COUNTING. Owner assigne nouveau compte, révoque ancien appareil/capacités/sessions, termine affectation et ouvre nouvelle dans même transaction. Nouveau gérant enregistre appareil et confirme prise de responsabilité, sans modifier soldes.

Si ancien appareil perdu ou personne absente : action secours avec motif, révocation, suspension boutique et dossier OFFLINE. Export/inbox conservés ; owner rapproche les faits connus, effectue comptage de reprise et valide session d’ouverture spéciale. Ne pas attendre indéfiniment l’appareil perdu ni prétendre récupérer des ventes qui n’ont jamais quitté cet appareil. Perte potentielle explicitée dans audit et rapport de reprise.

## Suspension et fermeture

SUSPENDED bloque nouvelles opérations hors rapprochement/correction. Les événements déconnectés existants sont conservés pour examen. Réactivation owner après contrôle du device et snapshot complet.

CLOSED exige session fermée, soldes cash 0 après remises, stock local tous compartiments 0, transit entrant/sortant traité, créances/dettes locales réglées ou transférées par décision explicite au propriétaire avec historique, aucune demande ou anomalie ouverte. En V1 pas de transfert de créance entre boutiques : owner continue son recouvrement sous boutique suspendue jusqu’à solde ; fermeture attend.

## Paramétrage

Owner modifie formulaire de seuils et options ; aperçu « s’applique aux nouvelles opérations » puis version de policy créée. Confirmation supplémentaire pour désactiver crédit ou dépôt lorsqu’il existe des soldes : désactivation interdit nouvelles opérations de ce type, mais permet solder existant. Pas de disparition des pages contenant dettes ou stocks encore ouverts.

## Anomalies et corrections

Chaque dossier a source, montant/quantité initial, résiduel, commentaires et décisions. OPEN→NEEDS_INFO→OPEN→RESOLVED. Propriétaire seul résout avec motif et opérations justificatives. Si correction financière/stock requise, commande atomique lie correction et résolution ; pas de bouton qui ferme un manque sans décision explicite `ACCEPT_LOSS`, `RECLASSIFY`, `RETURNED`, `ENTRY_ERROR`.

Journal posted jamais éditable, même owner. Réouverture de dossier résolu est un nouvel événement ; pas suppression de décision. Correction d’un achat reçu et partiellement vendu : pas de changement direct coût historique ; dossier et ajustement financier séparé, valeur future corrigée seulement via opération propriétaire documentée. Cette limite doit être visible, pas simulée comme un recalcul silencieux.
