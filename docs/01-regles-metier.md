# Règles métier et calculs normatifs

Complément 2.1 : [RM10 à RM13](conception/05-reporting-et-exemples.md) définissent frais d’achat, retours après abandon de créance et indicateurs. Appliquer ces formules dans les rapports comme dans les services métier.

Les identifiants RM sont utilisés dans les tests et revues. « Atomique » signifie que tous les effets sont validés ensemble ou aucun.

## RM01 — Valeurs numériques

Montants API = chaînes d’entiers en unités mineures (`"12500"`), jamais flottants JSON. Calculs TypeScript avec bigint ou bibliothèque décimale ; pas `Number` pour multiplier un prix par une quantité. PostgreSQL `bigint` pour montants, `numeric(20,6)` pour quantités de base. Entrée de quantité : maximum trois décimales pour poids/volume, entier pour pièces. Conversion : facteur positif jusqu’à six décimales ; produit converti doit être représentable sans arrondi de quantité, sinon refus `INVALID_PRECISION`.

Bornes métier : quantité de ligne > 0 et <= 1 000 000 unités de base ; montant de document <= 1 000 000 000 000 unités mineures. Vérifier débordements SQL, multiplication et import. Arrondi des montants HALF_UP à l’unité mineure ; jamais arrondir le stock silencieusement.

## RM02 — Vente

`gross_line = round(quantity_in_sale_unit × unit_price_minor)`.
Remise en points de base, de 0 à 10 000 ; `discount_line = round(gross_line × discount_bps / 10000)` ; `net_line = gross_line - discount_line`.
Total = somme des nets. Pas de remise globale additionnelle en V1. Prix en unité de vente stocké en snapshot, pas recalculé depuis le catalogue à l’affichage.

`paid = sum(payment.amount)` ; `due = total - paid`, avec 0 <= paid <= total. Pour espèces, somme reçue et monnaie rendue servent à l’UI ; le journal contient le net appliqué. Paiement mixte en ligne permis. Zéro total interdit hors retour/correction propriétaire explicite ; don commercial hors parcours vente standard.

Confirmation atomique : vérifier droits, session, tarifs/autorisation, solde crédit, stock et péremption ; créer vente et lignes, allocations de coût, paiements, journal et audit. Si erreur, tout est annulé. Une référence humaine est créée côté serveur, UUID technique dès le client ; trou de séquence permis.

## RM03 — Stock et valeur

Chaque écriture a une quantité signée et un compartiment `AVAILABLE`, `QUARANTINE`, `DAMAGED`, `TRANSIT` ou `MISSING_PENDING`. Soldes par lieu/variante/lot/compartiment. Quantités dans chaque compartiment >= 0. Les pertes définitives sortent du réseau via événement `WRITE_OFF`, pas une localisation fictive encore comptée disponible.

Chaque entrée acquise crée couche quantité/valeur. FIFO selon réception puis ID ; FEFO détermine d’abord les lots, FIFO ensuite dans le lot. Une sortie partielle alloue `round(value_remaining × qty_out / qty_remaining)` ; dernière sortie emporte exactement le reliquat de valeur. Stocker allocations et coût de vente figés.

Frais directs d’achat capitalisés une seule fois au prorata des montants bruts de lignes, arrondis avec reliquat attribué par méthode des plus grands restes, départage par ID de ligne. Achat gratuit sans base monétaire : répartir par quantité de base uniquement si unités homogènes, sinon saisir frais par ligne. Frais de transport après achat enregistrés comme charge logistique, sans recalcul rétroactif des coûts en V1.

Transferts transportent les couches et leur valeur, sans plus-value. Retour client retrouve les allocations initiales ; si quantité partielle, utiliser le même mécanisme de valeur résiduelle pour que la somme des retours n’excède pas le coût original. Inventaire positif : coût FIFO récent du même produit ou coût saisi par propriétaire si absent ; mention origine estimation. Inventaire négatif consomme des couches existantes.

## RM04 — Lots et disponibilité

Expiration : lot invendable à partir du lendemain de `expires_on` dans le fuseau entreprise. Date `expires_on` est une date civile, pas un timestamp. Jours d’alerte par défaut 30. Lots obligatoires si produit avec péremption ; réception sans date refusée. Changement d’unité de base ou activation lots après premiers mouvements interdit ; créer un nouveau produit et migrer par opérations explicites.

La création d’une demande, d’une commande, d’une dette ou d’un paiement ne crée pas de stock. Réception de marchandises crée le stock. Achat propriétaire détenu immédiatement : action combinée créer achat + réception au lieu propriétaire.

Surplus observé sans origine rapprochée : quantité physique en QUARANTINE, valeur inconnue (`valuation_origin=UNVALUED`, montant technique 0 exclu des valorisations fiables). Le rapport affiche quantité non valorisée, jamais « valeur nulle certaine ». Régularisation propriétaire sort la couche provisoire et crée entrée valorisée liée à l’origine prouvée ; les événements provisoires restent dans l’historique. Impossible de vendre ce surplus avant régularisation.

## RM05 — Registre des fonds

Utiliser un journal opérationnel équilibré, pas une comptabilité réglementaire. Chaque événement a des lignes signées dont la somme = 0 dans la devise. Comptes : caisse boutique, comptes de règlement déclarés par mode, fonds propriétaire, fonds en transit par remise, contrôle ventes, contrôle dépenses, contrôle achats, contrôle remboursements et différences de comptage. Les comptes de contrôle équilibrent le registre ; ils ne constituent pas un plan comptable certifié.

Exemples pour 1 000 : vente cash `CASH +1000 / SALES_CLEARING -1000` ; dépense cash `CASH -1000 / EXPENSE_CLEARING +1000` ; achat payé propriétaire `OWNER_FUNDS -1000 / PURCHASE_CLEARING +1000` ; remise `SOURCE -1000 / TRANSIT +1000`, puis réception `TRANSIT -1000 / DESTINATION +1000`.

L’avance affectée à un achat est un suivi analytique du cash réellement détenu, pas une seconde caisse additionnée aux fonds. Une remise d’avance augmente la caisse une seule fois ; l’achat diminue cette caisse. `advance_remaining = funds_confirmed - eligible_purchase_payments - returned_funds - authorized_reallocation`. L’application ne permet pas de compter deux fois le même paiement dans deux avances.

Les comptes physiques cash ne deviennent pas négatifs en ligne. Les comptes déclarés Mobile Money/bancaires reflètent les mouvements enregistrés, pas une vérification bancaire. Fonds propriétaire : sources configurées à l’initialisation, solde initial requis si suivi de disponibilité activé ; V1 solde suivi, même garde-fou que cash. Les comptes techniques de contrôle peuvent être négatifs.

## RM06 — Clôture

Sous verrou session, comparer l’attendu avant comptage à `declared = sum(denomination × count)`. `delta = declared - expected`. Persister expected, declared, delta et coupures dans clôture immutable. Si delta != 0, ajouter journal `CASH +delta / COUNT_VARIANCE -delta`, référencé par clôture, et dossier d’écart OPEN. Ainsi le solde de caisse repris devient le déclaré sans masquer l’écart et sans inventer de charge.

Lorsqu’un fait oublié est ensuite retrouvé, créer un document de régularisation et les seules écritures encore nécessaires, selon le dossier de différence ; ne pas doubler le manque déjà reconnu. Exemple : manque 2 000 compté hier, dépense oubliée 2 000 identifiée aujourd’hui. Écriture de reclassification `EXPENSE_CLEARING +2000 / COUNT_VARIANCE -2000` selon la convention du journal de clôture, sans nouvelle sortie CASH. Le service vérifie le résiduel du dossier ; jamais de reclassification supérieure à son montant restant. La convention exacte des signes doit être testée : manque delta=-2000 donne COUNT_VARIANCE +2000, donc sa résolution doit le débiter de 2000.

Recomptage : première déclaration conservée, proposition signée par gérant et décision propriétaire. Aucun recomptage n’est automatique. Si l’écart de recomptage prouve un montant physique différent, ajustement de cash explicite dans session active et référence au contrôle d’origine. Journal initial jamais modifié.

## RM07 — Crédit et remboursements

Créance vente = net de vente - paiements affectés - réductions de créance par retour - abandons. Jamais négative. Pour retour partiel : allocation des remises au prorata des quantités avec reliquat au dernier retour ; montant retourné <= net restant de la ligne. Réduire d’abord la créance de cette vente ; rembourser ensuite la part déjà payée. Décision approuvée ne signifie pas remboursement exécuté.

Montant à rembourser reste une obligation ouverte jusqu’au paiement. Mode choisi enregistré ; espèces seulement si caisse ouverte et disponible. Retour et paiement ne sont pas forcés dans une seule transaction s’ils ont lieu à des dates différentes. Achat dû = montant achat - règlements - avoir fournisseur appliqué. Retours fournisseur : diminution de dette d’abord, remboursement fournisseur à recevoir ensuite ; ne pas inventer un encaissement.

## RM08 — Historique et dates

`occurred_at` date réelle déclarée ; `recorded_at` horodatage serveur ; `business_date` date locale de session si cash. Rapports opérationnels par business_date ; reçus affichent occurred_at ; audit affiche les deux. Gérant ne peut antidater en ligne au-delà de 15 minutes ; fait ancien via dossier de régularisation. Hors ligne utilise capacité et séquence, pas confiance aveugle en horloge client.

Un mouvement posté ne change jamais de boutique, montant, produit ou auteur. Corrections = événement compensatoire et nouveau document si nécessaire. Le catalogue courant et les paramètres ne servent pas à recalculer des documents historiques.

## RM09 — Invariants à tester

- Somme des lignes d’un événement financier = 0.
- Solde matérialisé = somme du journal correspondant.
- Somme des stocks localisés = stock réseau, transit compté une fois.
- Somme valeurs sorties + valeur restante = valeur initiale de couche.
- Règlements/retours ne dépassent pas le solde du document.
- Une clé d’idempotence ne produit qu’un seul résultat pour un payload donné.
- Un document ne peut référencer un objet d’une autre entreprise ni une boutique interdite.
- Réception totale <= expédition, surplus dans un dossier distinct.
- Clôture cache l’attendu dans réponses gérant avant soumission.
- Les états financiers, de réception et de contrôle ne s’écrasent pas entre eux.
