# Permissions

Contrôle serveur obligatoire sur chaque lecture et commande. Jamais se fier au `shop_id`, rôle ou montant approuvé transmis par le navigateur. Le contexte authentifié détermine entreprise, rôle et affectation courante.

| Fonction | Propriétaire | Gérant |
|---|---|---|
| Créer boutique/produit/prix/règle | Oui | Non |
| Voir toutes boutiques et marges | Oui | Non |
| Voir produits/prix/stock local | Oui | Oui |
| Voir coûts d’achat | Oui | Ses dossiers d’achat seulement, pas marges globales |
| Vendre | Non dans l’espace supervision | Boutique affectée, session/appareil autorisés |
| Encaisser une créance | Supervision non cash ; cash via gérant | Créances boutique en ligne |
| Demander réapprovisionnement/fonds | Initie directement | Oui |
| Décider d’une demande | Oui | Non |
| Acheter | Oui | Autorisation affectée et valide |
| Recevoir stock boutique | Voir et traiter écarts | Confirme lui-même |
| Recevoir au dépôt/propriétaire | Oui | Non |
| Dépenser | Ses sources | Plafonds ou autorisation |
| Déclarer une sortie irrégulière | Oui | Oui, pas auto-approbation |
| Expédier stock boutique | Autorise | Exécute boutique départ |
| Ajuster stock/perte définitive | Oui | Déclare seulement |
| Compter inventaire | Oui | Boutique affectée |
| Valider inventaire | Oui | Non |
| Clôturer caisse | Secours tracé après passation uniquement | Compte sa session |
| Voir attendu avant comptage | Oui | Non |
| Modifier clôture soumise | Non, correction liée | Non, demande liée |
| Gérer utilisateurs/appareils | Oui | Consulter son appareil |
| Résoudre conflit hors ligne | Oui | Consulter/justifier |
| Export | Global | Ventes et stock local sans coûts ni attendu courant |

## Données de caisse aveugle

DTO gérant avant clôture exclut `expected`, solde caisse, différence implicite et compte financier brut. Ne pas envoyer un champ masqué seulement en CSS. Ses ventes/reçus individuels restent consultables ; pas de promesse de secret mathématique contre une reconstitution.

Après sa soumission, DTO clôture expose snapshot attendu, déclaré et écart de CETTE clôture. Cela ne donne pas le solde courant d’une session suivante. Propriétaire reçoit détail complet. Export gérant applique la même règle.

## Appareil principal et accès concurrent

Le gérant connecté sur appareil secondaire lit mais n’écrit pas. Un seul onglet écrivain (Web Locks + contrôle device/sequence serveur). Le propriétaire ne poste pas de mouvements directs sur caisse/stock boutique pendant sa capacité hors ligne active ; il prépare des demandes ou révoque puis attend rapprochement. Réception, dépense ou transfert en ligne par appareil principal suspendent temporairement le canal local de ventes pendant leur validation.

## Révocation

Compte désactivé : sessions web révoquées immédiatement côté serveur. Impossible de révoquer instantanément un appareil déconnecté ; capacité limitée 24h et alerte propriétaire. Les événements de cet appareil sont reçus pour conservation via endpoint limité, mais jamais postés automatiquement après révocation ; traitement manuel. Autorisations mises à jour à chaque commande en ligne, hormis droits acquis explicitement limités d’un lot hors ligne à rapprocher.

## Précisions de conception 2.1

- Avant activation boutique, le gérant affecté peut saisir uniquement ses comptages de départ et brouillons ; owner valide soldes, prix et activation. Pas de vente ni modification des coûts après activation.
- Une boutique SUSPENDED/SETTLEMENT autorise règlements existants, retours et remises en ligne via session purpose SETTLEMENT. SUSPENDED/SECURITY bloque ces actions sauf procédure owner de reprise. CLOSED : lecture seulement.
- Owner approuve annulation/retour ; le gérant exécute le remboursement sur sa caisse. L’endpoint de compensation exige l’accord ET l’autorité d’écriture du compte ; il n’autorise pas owner à écrire silencieusement sur caisse pendant une capacité offline.
- Invitation compte et approbation appareil sont distinctes. Enregistrement d’appareil ne délivre aucune capacité sans affectation active et session ouverte.
- Le gérant peut recevoir successivement plusieurs fractions d’une remise, mais jamais éditer une réception précédente.
- Les achats owner partagés sont filtrés par destinations autorisées pour le gérant. Pas de fuite des autres boutiques via pièces jointes globales : documents contenant données de tout le réseau restent owner-only, reçu local et bordereau local accessibles.
