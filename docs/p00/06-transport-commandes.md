# Contrat de transport retenu avant code

Complète les [contrats API](../api/contrats.md) et [S14](../conception/01-transitions.md) ; ne remplace pas leurs règles métier.

## Frontières et numérotation

Web affiche/saisit ; API authentifie, autorise et poste ; worker traite les effets secondaires. Une origine publique route /api/auth vers Better Auth dans Nest et /api/v1 vers Nest ; les autres pages vers Next. Les modules sont partagés par injection explicite, sans dépendance du domaine à une requête Next.

Une commande financière possède operationId UUID stable, Idempotency-Key correspondant, payload validé, version du document cible quand requise. Le serveur dérive actor/organization/shop autorisés. Les ventes gérant passent dès P04 par une file locale durable avec deviceId et seq : aucune seconde voie de vente directe à remplacer en P08.

Enveloppe séquencée versionnée : protocolVersion, operationId, deviceId, shopId, sessionId, seq, commandType, occurredAt, executionMode ONLINE ou OFFLINE_REPLAY, preuve onlineAuthorizationId ou capabilityId selon mode, payload, hash, signature. Le serveur recalcule hash canonique et vérifie portée/propriété de l’appareil. Champs monétaires en chaînes entières et quantités décimales ; pas de flottants signés. Canonicalisation JSON déterministe à spécifier avec vecteurs de test P01-04, bibliothèque éprouvée et primitives WebCrypto, pas de crypto maison.

La signature appareil protège certains défauts de transport, pas la véracité d’un comptage. La preuve ONLINE est issue d’une session authentifiée et du devis/payload autorisé, liée à une seule opération. Elle n’élargit pas la capacité OFFLINE cash-only ; aucun token de devis ne réserve implicitement le stock.

## Commandes en ligne et écritures sensibles

Le devis ne poste rien. Persister localement la vente et sa séquence avant l’envoi. Sur résultat inconnu, rechercher/rejouer le même operationId ; jamais générer une nouvelle vente pour faire disparaître un timeout. Refus en ligne avant exécution physique : REJECTED_VALIDATION finalise la séquence sans effet, correction locale atomique. Fait déjà exécuté offline : conserver REVIEW_REQUIRED, pas de rejet automatique qui efface sa réalité déclarée.

Réception, dépense, retour, encaissement différé ou transfert boutique en ligne : verrou local → vider file → suspension capacité acquittée serveur → commande autorisée/transactionnelle → nouveau snapshot/capacité → reprise. Si rupture pendant le handshake, garder le blocage visible et reprendre depuis état serveur ; aucune libération optimiste. L’owner peut préparer/enregistrer des achats à ses lieux, pas modifier directement le cash/vendable d’une boutique à capacité non réconciliée.

## Réponses, ordre et dépôt

Batch maximum 50 événements ET 1 Mo. Unicités device/seq et operationId ; payload différent sous même identité = conflit, jamais remplacement. Inbox durable avant acquittement de réception ; événements traités dans transactions indépendantes et ordre contigu.

États persistants : RECEIVED, POSTED, REVIEW_REQUIRED, REJECTED_VALIDATION, VOIDED. WAITING_PREVIOUS et DUPLICATE sont des réponses calculées ; duplicate retourne le résultat original. POSTED/REJECTED_VALIDATION/VOIDED finalisent une séquence, REVIEW_REQUIRED bloque les suivantes. ACK RECEIVED n’est pas un succès de vente. Les erreurs réseau et quotas ne consomment pas automatiquement une séquence.

Session révoquée/expirée : endpoint de dépôt strictement limité, preuve signée et quotas, aucune lecture ni posting automatique. Clé d’appareil non extractible n’équivaut pas à appareil inviolable. Expiration/horloge incertaine → examen ; trous perdus → décision owner explicitement tracée selon S14.

Snapshot et curseur incluent la borne des événements acquittés ; client les applique atomiquement et reconstruit la projection avec les seuls événements restants. Ne pas réappliquer une vente incluse au snapshot. Aucun expected/opening_minor/money_balance gérant dans le snapshot.

CLOSE_COUNT est le dernier événement de session, attend toutes les ventes antérieures traitées et passe OPEN→COUNTING→CLOSED atomiquement si nécessaire. Nouvelle session seulement en ligne sans backlog bloquant. Purge locale seulement POSTED après rétention/snapshot sûr ; jamais conflits non acquittés.

## Preuves requises

P01 prépare types et vecteurs de sérialisation ; P04 prouve voie ordonnée en ligne ; P08 prouve coupures avant/après commit et ACK, double onglet, ordre inversé, manque, révocation, file non effacée et migration SW/IndexedDB. Ne pas déclarer le mode offline livré lors de la seule création des types.
