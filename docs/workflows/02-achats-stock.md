# Workflows achats, fonds et stock

## A01 — Demander et décider

Demande RESTOCK : 1..100 lignes (variante, unité, quantité, prix estimé), frais estimés, motif, fournisseur facultatif et urgence. Total serveur. DRAFT→SUBMITTED ; gérant ne modifie plus, peut retirer avant décision si aucune exécution.

Propriétaire décide ligne par ligne : quantité et budget approuvés, circuit MANAGER/OWNER/EXISTING_STOCK, source de financement, expiration (7 jours par défaut). SUBMITTED→APPROVED/PARTIAL/REJECTED/NEEDS_INFO. Refus et partiel demandent motif. NEEDS_INFO autorise nouvelle révision ; ancienne conservée. Révision après approbation exige nouvelle décision pour supplément uniquement ; les consommations existantes ne sont pas remises à zéro.

Actions ne touchent pas stock ou fonds. Autorisation réservée lors du POST de l’achat ; consommation totale sous verrou <= plafonds. Une demande peut être satisfaite par plusieurs achats partiels ; bouton « Terminer sans le reste » propriétaire annule seulement reliquat avec motif.

## A02 — Acheter par gérant

Préconditions accord en cours, gérant désigné, source autorisée, boutique et session disponibles si cash. Champs achat : demande/version, fournisseur obligatoire, lignes réelles, frais, échéance si crédit, paiements, documents. Toute substitution ou dépassement donne APPROVAL_REQUIRED ; bouton prépare révision sans perdre la saisie.

POST achat fige commercial et consomme autorisation ; journal uniquement pour paiements fournis. Bouton simple « Acheter et recevoir » appelle une commande atomique composite si la livraison est immédiate ; sinon « Produits à recevoir ». Les deux chemins utilisent les mêmes services.

Pour acquisition déjà réalisée hors accord, formulaire « Déclarer un achat non autorisé » conserve le fait et crée un dossier de régularisation ; stock et paiement officiels sont postés ensemble par propriétaire après vérification. Les produits physiques restent QUARANTINE en attendant ; pas vendables. Ce chemin ne se présente jamais comme une approbation rétroactive normale.

Contrôle final examine justificatifs, prix, réceptions et financement. Clôture si quantité restante reçue ou abandonnée avec motif, fonds affectés expliqués, dossier d’écart résolu. Dette fournisseur peut rester ouverte : contrôle achat CLOSED n’efface pas le paiement DUE/PARTIAL.

## A03 — Acheter par propriétaire

Pas d’auto-demande obligatoire. Même données d’achat, source propriétaire ou crédit, destination par défaut « Stock du propriétaire ». Réception immédiate facultative. Un achat peut avoir plusieurs réceptions et expéditions.

La livraison directe fournisseur→boutique est représentée par achat + attente de réception boutique, sans inventer un passage physique par dépôt. Le gérant confirme la réception en référence à l’achat ; le propriétaire ne confirme pas à sa place hors procédure de secours auditée.

## A04 — Recevoir

Réception lie soit achat soit expédition. UI liste restant attendu et champs reçu vendable/endommagé, lot et péremption si nécessaires, commentaire/photo. Vérifier total reçu, doubles soumissions et quantités déjà confirmées sous verrou ligne d’origine.

Quantité <= restant : POST réception partielle ou totale, création des entrées/couches nécessaires. Pour transfert, déplacer couches déjà acquises, sans nouvelle valorisation achat. Pour achat, valeur de chaque réception au prorata de la ligne complète, dernière réception prend reliquat.

Quantité > restant : proposer accepter attendu et isoler surplus en QUARANTINE, dossier owner. Surplus doit être régularisé par achat complémentaire ou correction d’envoi avec source réelle ; pas création de valeur gratuite par simple clic « accepter ». Produits endommagés dans DAMAGED, non vendables.

Manquant à l’arrivée : restant toujours ouvert ; gérant coche « Livraison annoncée terminée » pour ouvrir litige. Propriétaire décide complément, correction d’envoi ou perte. Ni réception ni expiration de délai ne clôturent automatiquement les manquants.

## A05 — Transférer

DRAFT→APPROVED→DISPATCHED→PARTIAL/RECEIVED→CLOSED ou DISPUTED. Boutique source/destination différentes. Demande gérant ou création owner. Quantités autorisées, pas de réservation. Expéditeur réel boutique = gérant, owner = propriétaire.

Expédition en ligne depuis source boutique requiert appareil principal sans backlog et suspension brève ventes locales. Verrou stock, consommation FIFO/FEFO, passage en TRANSIT spécifique à shipment. Destination confirme. Refus réception garde marchandises en transit avec litige ; ne les remet pas automatiquement au départ.

Retour d’envoi : créer mouvement retour après confirmation de détention physique. Aucune modification des quantités d’expédition historiques. Clôture possible seulement si transit résiduel 0 ou perte documentée.

## A06 — Fonds et avances

Propriétaire envoie fonds boutique ou gérant reverse. Émetteur précise source/destination, montant, motif et éventuelle demande financée. DRAFT→SENT au moment de remise réelle. Journal source vers transit. Réception par destinataire confirme montant réel et crédite destination depuis transit.

Réception partielle garde reliquat en transit ; si écart définitif, dossier propriétaire et écriture de traitement. Réception supérieure à l’envoi interdite sur cet envoi ; déclarer remise supplémentaire ou erreur par correction. Boutique cash nécessite session ouverte à réception et à émission, pas à demande de fonds.

Avance achat est une affectation des fonds de caisse. Paiement achat consomme affectation et cash une seule fois. Réaffectation restante exige propriétaire ; aucun mouvement physique si l’argent reste dans même caisse. Restitution réelle crée transfert inverse. Caisse peut conserver recettes librement, pas de reversement obligatoire.

## A07 — Payer fournisseur

En ligne, sélectionner fournisseur puis achats et soldes. Montant >0, <= total sélectionné, source avec disponibilité, session si cash boutique. Verrou achats, répartir selon choix approuvé et créer paiement/allocation/journal. Gérant paie uniquement achats autorisés de sa boutique ; propriétaire peut payer depuis ses sources.

Achat à crédit est déjà réceptionnable ; le paiement n’affecte jamais quantité. Aucun paiement de dette ne doit passer par la dépense ordinaire.

## A08 — Retour fournisseur

Propriétaire approuve retour lié aux lignes d’achat et aux quantités encore détenues. Gérant/source expédie réellement les produits : sortie de stock et couches, enregistrement montant du retour au prix d’achat historique alloué. Quantité ne peut dépasser achats reçus moins retours précédents et quantité physique disponible.

Dette de cet achat réduite d’abord, excédent devient remboursement fournisseur à recevoir. Confirmation fournisseur jointe ou exception propriétaire motivée. Encaissement ultérieur crée paiement IN et allocation au remboursement attendu, pas une vente. Marchandises retournées mais avoir contesté : dossier ouvert, pas annulation automatique de dette contestée sans décision propriétaire.

## A09 — Perte/casse

Déclaration variante/lot/quantité/motif. AVAILABLE→DAMAGED pour casse présente ou AVAILABLE→MISSING_PENDING pour absence, hors disponible mais conservé séparément au total détenu théorique litigieux. Propriétaire valide WRITE_OFF (sortie réseau et valeur) ou demande nouveau comptage. Si erreur prouvée, mouvement inverse vers AVAILABLE. Ne pas confondre refus d’explication et réapparition physique.

## A10 — Inventaire

DRAFT avec scope complet ou variantes → COUNTING après validation que toutes opérations locales sont synchronisées et capacité suspendue. Créer locks de produits, snapshot quantités et couches à cutoff. Comptage gérant ou owner, quantité >=0, lots séparés, sauvegarde brouillon sans ajustement.

SUBMITTED fige comptage. Propriétaire accepte ou renvoie pour second comptage (nouvelle version conservant première). APPROVED crée différences signées et valorisation RM03 en une transaction, libère locks et actualise snapshot appareil avant vente. CANCELLED libère locks sans effet, motif obligatoire après début. Timeout avertit mais ne déverrouille pas silencieusement.

Inventaire positif sans coût connu : coût propriétaire requis. Explication obligatoire par ligne avec différence. Un inventaire ne résout pas automatiquement un écart de caisse.
