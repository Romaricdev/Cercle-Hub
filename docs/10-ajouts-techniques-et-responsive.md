# Complément de conception : stack, hébergement et tous formats

Date : 24 septembre 2026. Statut : documentation uniquement ; aucune autorisation de démarrer l’implémentation. Ce complément prime sur les anciennes propositions techniques incompatibles, notamment SQL sans ORM, backend exclusivement Next.js, absence de Redis et stockage obligatoirement géré. Les règles métier, permissions et workflows restent applicables.

## Origine et niveau de décision

Demandes du porteur : Prisma ORM, Next.js, NestJS, Redis et BullMQ comme base envisagée ; ajout de Fastify ; hébergement de l’ensemble sur VPS ; Docker pour l’environnement interne ; versions les plus récentes ; tablettes pour les gérants ; responsive impératif sur téléphone, tablette et ordinateur, pour tous les rôles.

Architecture de référence proposée pour concrétiser ces demandes : PostgreSQL central, NestJS/Fastify comme API unique, Docker Compose également en production, SeaweedFS pour remplacer MinIO communautaire. SeaweedFS a été recommandé, sans validation nominative explicite du porteur : ne pas présenter ce fournisseur comme définitivement signé. Better Auth reste proposé pour l’authentification ; Dexie reste la solution de conception pour le hors connexion. Aucun de ces outils ne remplace les règles métier ou le protocole de synchronisation.

## Responsabilités techniques

| Composant | Responsabilité et frontière |
|---|---|
| Next.js / React / TypeScript | Interfaces responsive, PWA, formulaires ; aucune écriture métier directe en base |
| NestJS + Fastify | API, permissions, validations, workflows, calculs, audit et synchronisation ; Fastify est l’adaptateur HTTP dans le même processus |
| Prisma + PostgreSQL | Accès typé, migrations, transactions ; PostgreSQL conserve les données métier de référence |
| Redis + BullMQ | Files de tâches, reprises, exports, notifications ; aucun solde officiel conservé seulement dans Redis |
| Worker | Processus distinct réutilisant les services nécessaires, traitements idempotents |
| Stockage S3 | Fichiers privés : factures, justificatifs, photos et exports ; métadonnées et droits dans PostgreSQL |
| Dexie / IndexedDB | Données locales et commandes en attente sur l’appareil ; synchronisation métier développée explicitement |
| Better Auth, proposé | Identité et sessions ; les autorisations boutique/opération restent contrôlées par NestJS |

Un backend NestJS modulaire suffit : identité, catalogue, ventes, caisse, achats, stock, finance, contrôle, synchronisation et rapports. Les services sont communs aux commandes en ligne et au rejeu hors connexion. Les fonctionnalités HTTP doivent être compatibles Fastify, y compris cookies, fichiers et intégration d’authentification. Vérifier cette compatibilité avant de verrouiller les dépendances.

### Cohérence et traitements différés

Une vente doit enregistrer atomiquement document, sortie de stock, encaissement, audit et résultat d’idempotence. Utiliser la même transaction Prisma pour tous les accès concernés, y compris le SQL paramétré de verrouillage si nécessaire. Les contraintes et verrous PostgreSQL restent requis ; l’ORM ne résout pas automatiquement la concurrence. Vérifier les possibilités exactes de la version stable choisie avant de traduire les spécifications transactionnelles.

Enregistrer l’outbox dans cette même transaction, puis transmettre ses événements à BullMQ après commit. Le relais doit tolérer un arrêt après publication mais avant acquittement. Les consommateurs doivent dédupliquer durablement leurs effets ; un identifiant de job seul ne suffit pas. Une indisponibilité Redis retarde les tâches secondaires sans perdre leur intention en base. Reprises bornées et échecs observables ; pas d’appel réseau externe dans la transaction de vente.

### Versions et reproductibilité

- Choisir les dernières versions stables mutuellement compatibles au démarrage ; exclure alpha, bêta, RC et canary comme choix explicite de dépendance.
- Pour Node.js, choisir la dernière branche LTS compatible et son dernier correctif maintenu.
- Vérifier ensemble Next.js/React, NestJS/Fastify/plugins, Prisma/Node/PostgreSQL, Redis/BullMQ, authentification et SDK S3.
- Consigner dans un registre : composant, version exacte, date de vérification, source officielle, compatibilités et éventuelle dérogation justifiée.
- Verrouiller dépendances et images Docker par version précise, idéalement digest ; ne pas déployer des tags flottants `latest`.
- Tester les mises à jour avant production, y compris migrations SQL et IndexedDB, puis prévoir sauvegarde et procédure de retour adaptée. Une migration de données ne se défait pas nécessairement par simple retour d’image.
- Aucun numéro évoqué oralement ou dans la conversation ne vaut sélection définitive ; revérifier au bootstrap. Aucune version exacte n’est installée par ce complément.

## VPS, Docker et stockage

Proposition Docker Compose : reverse proxy HTTPS, web Next.js, API NestJS/Fastify, worker, PostgreSQL, Redis et SeaweedFS. Réseau interne pour les bases et services d’administration ; seules les entrées nécessaires sont publiques. Configuration, secrets et volumes séparés entre développement, test et production. Des conteneurs sur le même VPS ne constituent pas une haute disponibilité.

SeaweedFS est la recommandation S3 actuelle pour un serveur unique. Avant confirmation, vérifier avec la version retenue : authentification, buckets privés, PUT/GET/HEAD/DELETE autorisés, URL présignées, limites de taille, persistance après redémarrage et restauration. Ne pas supposer une compatibilité avec toutes les fonctions Amazon S3. Garder le fournisseur derrière un service de stockage et un SDK S3, avec endpoint/région/identifiants configurables.

Les fichiers reçoivent une clé unique ; remplacer un justificatif crée une nouvelle pièce liée, sans écrasement silencieux. Vérifier les droits serveur avant accès ou émission d’une URL temporaire. Contrôler taille, type et existence avant rattachement définitif ; gérer les envois incomplets et fichiers orphelins. Une transaction PostgreSQL ne rend pas atomique un téléversement S3 : prévoir un état d’attente puis confirmation.

Volumes persistants, sauvegardes automatiques hors VPS couvrant base et fichiers, et restauration testée. Une copie sur le disque du VPS ne protège pas contre la perte du serveur. Dimensionnement, fournisseur VPS, domaine, destination de sauvegarde, fréquence et objectifs de restauration restent à préciser avant exploitation.

## Responsive obligatoire : propriétaire et gérants

Cette exigence s’applique aux 40 écrans E01 à E40, à tous leurs états et à tous les lots, même si les fiches historiques ne répètent pas chaque règle. Toutes les fonctions permises au rôle restent accessibles sur tous les formats ; la disposition peut changer. La compatibilité de format ne lève pas la règle d’un appareil principal d’écriture par boutique.

| Sujet | Règle de conception |
|---|---|
| Largeur | Mise en page fluide dès 320 pixels CSS, sans plafond fonctionnel sur grands écrans ; contenu centré si nécessaire |
| Orientation | Portrait et paysage ; rotation/redimensionnement sans perte de saisie, panier ou contexte |
| Navigation | Menu latéral si place suffisante, menu compact sur petit écran ; libellés compréhensibles et état actif visible |
| Caisse | Catalogue/panier côte à côte si possible ; bascule ou étapes sur téléphone, total et accès au panier faciles à retrouver |
| Tableaux | Colonnes essentielles et détails accessibles, ou cartes ; défilement local signalé si indispensable, jamais de débordement global |
| Formulaires | Une colonne sur petit écran, regroupements sur grand ; clavier numérique approprié sans supprimer les décimales nécessaires |
| Actions | Cibles tactiles d’au moins 44 × 44 pixels CSS, espacées ; clavier/souris utilisables, focus visible, aucune action réservée au survol |
| Dialogues | Adaptés au viewport, plein écran si nécessaire ; validation/annulation toujours accessibles, même clavier virtuel ouvert |
| Graphiques | Valeurs accessibles au toucher et au clavier, avec alternative textuelle/tabulaire ; ne pas dépendre de couleur ou survol seuls |
| Lisibilité | Zoom autorisé, textes lisibles, libellés et erreurs explicites ; états vide/chargement/erreur adaptés à chaque format |
| Médias | Prise de photo de justificatif si l’appareil le permet, sélection de fichier toujours disponible ; aucun ajout implicite de scan code-barres caméra |

Les points de rupture suivent le contenu, pas uniquement des noms d’appareils. Ne pas masquer une action essentielle sur téléphone. L’impression A4/80 mm prévue reste une présentation distincte à tester ; la prise en charge d’une imprimante physique dépend du matériel choisi.

## PWA et tablettes

Installation sur écran d’accueil lorsque le navigateur la permet, usage normal via URL également. Appareils Android/iPad et versions minimales restent à préciser ; concevoir pour Chrome, Safari, Firefox et Edge maintenus, puis publier une matrice de support exacte et vérifiée. Ne pas promettre une compatibilité avec tous les navigateurs historiques.

Conserver le périmètre hors connexion de [05-hors-connexion.md](05-hors-connexion.md) : cette discussion ne l’élargit pas. Afficher connecté/hors connexion/synchronisation, nombre d’opérations en attente et distinction entre stockage local et confirmation serveur. Afficher la dernière synchronisation par boutique au propriétaire.

Reprendre la synchronisation à la réouverture et au retour réseau lorsque l’application est active ; ne pas dépendre d’une exécution en arrière-plan. Tester mise en veille, réveil, fermeture, reprise et expiration de session. Ne jamais supprimer les événements non acquittés lors d’une déconnexion ou mise à jour. Les évolutions de service worker/IndexedDB doivent préserver les commandes et ne pas forcer un rechargement pendant une vente. Le stockage navigateur peut être effacé ou indisponible : signaler une impossibilité de persister et ne pas annoncer une vente comme sauvegardée si l’écriture locale a échoué.

## Recette complémentaire à chaque lot

Ces critères complètent les 84 scénarios métier sans les renuméroter. Ils sont des tests à réaliser, pas des résultats acquis.

| Référence | Vérification attendue |
|---|---|
| RSP01 | Chaque écran applicable à 320, 375, 768, 1024, 1440 et 1920 pixels CSS, plus une largeur intermédiaire : pas de débordement global ni contenu essentiel inaccessible |
| RSP02 | Portrait/paysage et redimensionnement en cours de saisie : panier, valeurs et état du workflow conservés |
| RSP03 | Même opération autorisée réalisable au tactile, souris et clavier ; aucune dépendance au survol |
| RSP04 | Clavier virtuel ouvert : champ, erreur et action de validation accessibles ; vérification sur tablette/téléphone réels |
| RSP05 | Zoom à 200 %, textes longs, erreurs, chargement, listes vides et grands volumes : contenu utilisable |
| RSP06 | Caisse sur petit écran : recherche, ajout, quantité, panier, total, paiement et reçu accessibles sans perte de vente |
| RSP07 | Dialogues, tableaux et graphiques utilisables sur petit écran ; toutes les informations restent consultables |
| RSP08 | PWA et onglet navigateur, veille/réveil, coupure/reconnexion : reprise sans double vente et états de synchronisation exacts |
| RSP09 | Mise à jour application avec commandes locales en attente : aucune perte, pas de rechargement forcé en saisie |
| RSP10 | Parcours critiques des deux rôles sur navigateurs retenus, plus appareils Android/iPad réels selon parc cible ; consigner appareils et versions réellement testés |

Au lot 0 : structure responsive, navigation, primitives et première matrice de support. À chaque lot : critères RSP applicables et preuve des vérifications. Au lot hors connexion : RSP08/RSP09 complets. Avant pilote : parcours critiques sur matériel réel. L’émulation Playwright seule ne prouve pas le comportement réel du clavier, de la veille ou du stockage mobile.

## Sources officielles consultées

- [NestJS avec Fastify](https://docs.nestjs.com/techniques/performance)
- [NestJS et BullMQ](https://docs.nestjs.com/techniques/queues)
- [Idempotence BullMQ](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Versions Prisma](https://www.prisma.io/docs/orm/release-status)
- [Versions Node.js](https://nodejs.org/en/about/previous-releases)
- [PWA Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [SeaweedFS](https://github.com/seaweedfs/seaweedfs)
- [MinIO communautaire](https://github.com/minio/minio) : dépôt archivé, choix initial à remplacer.

Les choix de structure, de responsive et de recette ci-dessus sont des décisions de conception du projet, pas des garanties fournies par ces bibliothèques.

## Complément tests

La [stack et stratégie de tests](11-stack-et-strategie-tests.md) précise les outils, l’isolation, les commandes et la validation de la recette responsive.

## Arbitrages P00

Le [registre P00](p00/01-decisions-techniques.md) retient Better Auth et SeaweedFS comme choix de conception, avec preuves d’intégration à produire en P01. Il remplace les mentions antérieures « proposé/à confirmer » sur ces deux choix. La limite de synchronisation est de 50 événements et 1 Mo.
