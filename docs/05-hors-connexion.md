# Protocole hors connexion et reprise

Précisions normatives 2.1 : [transitions S14](conception/01-transitions.md) et [relations appareil/séquence](conception/02-donnees-et-relations.md). Elles définissent la finalisation d’un refus, le traitement des trous irrécupérables, la preuve en ligne distincte et la clôture sans start-count serveur préalable.

## Objectif et limite

Continuer les ventes cash pendant une panne courte sur le même appareil, sans créer de seconde vérité invisible. L’appareil n’est pas une preuve inviolable : propriétaire du navigateur peut modifier ses données. Signature et séquence détectent certains problèmes de transport, pas la fraude d’un utilisateur maîtrisant son appareil. Le logiciel ne garantit pas la récupération d’événements jamais synchronisés après destruction ou effacement du navigateur.

## Prérequis en ligne

Enregistrement appareil avec clé WebCrypto non extractible, accès gérant authentifié, session ouverte, snapshot cohérent catalog/prices/stock lots/policy/capability. Capacité signée serveur inclut `capabilityId,deviceId,shopId,userId,sessionId,startsAt,expiresAt,policyRevision,priceRevision,stockRevision,allowedCommands`.

Capacité hors ligne : allowedCommands = CASH_SALE, CLOSE_COUNT. Les brouillons de demandes ne sont pas des événements financiers et ne consomment aucune séquence. Les ventes en ligne non cash utilisent une autorisation de commande en ligne distincte, issue de la session authentifiée, sans élargir cette capacité. Expiration 24h maximum. Renouvellement à chaque synchronisation réussie sans backlog ni conflit. Pas de prolongation basée uniquement sur horloge locale. L’UI s’appuie sur dernière heure serveur + temps monotone et détecte changement incohérent ; après redémarrage et horloge douteuse, demande reconnexion avant nouvelle écriture.

## Autorité de mutation de boutique

Toutes ventes gérant, même en ligne, passent par la file locale séquencée. Les commandes en ligne sensibles (réception, dépense, retour, transfert, encaissement différé) acquièrent le verrou d’écriture local, vident la file, suspendent la capacité, exécutent commande serveur puis récupèrent snapshot et nouvelle capacité avant de libérer le verrou. Une seule voie d’écriture évite stock local obsolète.

Owner peut créer demandes, achats et envois entrants pendant coupure. Il ne modifie pas directement stock disponible ni cash boutique tant que capacité est active et non réconciliée. Pour ajustement, inventaire ou changement de gérant : handshake de synchronisation/suspension ; secours révocation + REVIEW_REQUIRED pour événements arrivant ensuite. Expiration seule ne prouve pas que l’appareil n’a plus d’événements en attente.

## Tables IndexedDB

`metadata` (schemaVersion, ownerUserId, shopId, deviceId, serverTime, syncCursor, nextSeq), `snapshotProducts`, `snapshotPrices`, `snapshotStock`, `snapshotPolicy`, `activeSession`, `operations` (operationId,seq,payload,hash,signature,status,serverResult), `draftRequests`.

`activeSession` côté gérant n’inclut ni opening_minor, ni money_balance, ni expected. Le total des ventes locales ne constitue pas à lui seul le montant théorique complet. Pour `REQUEST_DRAFT`, utiliser stockage brouillon distinct sans consommer la séquence financière ; soumission en ligne ultérieure seulement.

Mutation locale dans UNE transaction Dexie : vérifier quantité locale et droit, ajouter opération, décrémenter projection locale, incrémenter séquence. Aucun fetch dans cette transaction. Stock disponible local = snapshot à dernier accusé + effets des opérations non acquittées ; ne pas réappliquer les opérations déjà incluses dans nouveau snapshot.

Service worker cache uniquement shell versionné et ressources statiques nécessaires. Pas de cache générique des réponses privées ni des API owner. IndexedDB contient données minimales sans marges globales. Mise à jour applicative différée tant que file non vide ; migration locale testée et sauvegarde avant changement destructif.

## Synchronisation

Déclencheurs : réseau rétabli, application au premier plan, bouton manuel, toutes les 15 s si événements en attente. Backoff 1/2/5/15/30 s, jitter ; état visible, pas de spinner permanent sans diagnostic.

1. Envoyer batch <=50 événements, <=1 Mo, séquence croissante.
2. Serveur authentifie session ou capacité de dépôt limitée + signature ; cette capacité accepte un dépôt d’événements uniquement, sans lecture de données ni droit de poster librement après révocation.
3. Insérer inbox durable avec uniques device/seq et operationId. Hash différent pour même identité = CONFLICT_TAMPER, jamais remplacement.
4. Traiter chaque événement dans transaction indépendante, selon séquence contiguë. Une lacune bloque les suivants, retourne `missingSequence`.
5. Valider capacité lors de l’événement, session, snapshot tarifaire, droits et stock. Les données d’horloge seules ne suffisent pas si capacité expirée/révoquée à réception : REVIEW_REQUIRED.
6. Retourner pour chaque élément `POSTED`, `REVIEW_REQUIRED`, `WAITING_PREVIOUS` ou `DUPLICATE` avec référence. Un duplicate porte le résultat original.
7. Client marque résultat durable avant purge. Inbox reçue mais non postée reste dans l’historique local et dans écran propriétaire, pas affichée comme vente officielle.
8. Obtenir delta/snapshot et curseur représentant tous les événements acquittés ; reconstruire projection avec reste local une fois.

ACK de transport (`RECEIVED`) n’équivaut pas à vente postée. Purge automatique des payloads locaux POSTED après 7 jours et snapshot sûr ; jamais purge automatique des conflits.

## Conflits

| Cas | Traitement |
|---|---|
| Timeout après commit | Retry même opération, retourner résultat existant |
| Ancien tarif autorisé | Poster snapshot, étiqueter ancien tarif |
| Stock serveur insuffisant | Conserver fait en REVIEW_REQUIRED ; ne pas créer stock négatif |
| Capacité révoquée/expirée ou date incohérente | Conserver, décision owner avant posting |
| Séquence manquante | Demander événement manquant ; ne pas sauter automatiquement |
| Payload illisible | Rejet de validation détaillé, archive locale non effacée |
| Appareil perdu | Procédure reprise documentée, aucune promesse de récupération |

Pour une vente réelle avec stock insuffisant : owner retrouve réception oubliée ou corrige une erreur de stock par opération tracée avant replay. S’il constate que vente n’a pas eu lieu, marque annulée avec motif, sans effacer le fait transmis. Si réalité invérifiable, laisse dossier et session bloqués ; peut effectuer reprise contrôlée avec comptage et décision explicite, pas auto-régularisation inventée par code.

## Clôture déconnectée

CLOSE_COUNT est dernier événement de la session, contient coupures et `lastSaleSequence`. L’écriture locale fige session et interdit nouvelle vente. Le serveur attend tous les événements précédents POSTED/traités ; seulement ensuite calcule attendu et poste clôture. Aucun attendu envoyé avant résultat. Nouvelle session nécessite connexion et backlog résolu. Un draft de demande peut rester local mais ne bloque pas la caisse, car sans effet métier.

## Tests obligatoires

Coupure avant/après commit, fermeture navigateur avant ACK, deux onglets, batch dupliqué, ordre inversé, trou de séquence, révocation, ancien tarif, expiration, disque local plein, service worker mis à jour, perte de snapshot, fermeture avec événement antérieur en conflit. Simuler via Playwright et base réelle, pas seulement mocks fetch.

## PWA sur appareils mobiles

Appliquer les exigences de veille/reprise, synchronisation visible et mise à jour sans perte du complément. Le périmètre métier hors connexion reste inchangé, ainsi que la règle de l’appareil principal. Voir [le complément 2.2](10-ajouts-techniques-et-responsive.md).
