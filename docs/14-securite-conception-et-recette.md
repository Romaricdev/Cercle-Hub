# Référentiel de sécurité — Cercle Complet Sarl

Date : 24 septembre 2026, addendum P02 le 25 septembre 2026. Document normatif pour Codex et Cursor. Les contrôles P02 (sessions Better Auth, MFA propriétaire, CSRF `/api/v1`, origines, Helmet/CSP API, rate limit connexion, permissions objet/rôle) sont **implémentés et testés localement** ; le reste du référentiel reste prévu jusqu’à sa phase. Aucune prétention de sécurité absolue, de scan public ou de certification. Ce référentiel complète les documents 02, 05, 07 et 11 et remplace leurs dispositions explicitement révisées ici.

## 1. Périmètre, responsabilités et menaces

Protéger les identités, sessions, fonds, ventes, stocks, justificatifs, sauvegardes et commandes locales. Frontières à contrôler : navigateur/PWA → reverse proxy → Next.js/API NestJS-Fastify → Prisma/PostgreSQL ; API/outbox → Redis/BullMQ/worker ; API/worker → S3 ; opérateur → VPS/sauvegardes. Tout contenu client, fichier, paramètre, en-tête ou job reçu est non fiable jusqu’à validation.

Menaces : attaquant anonyme, compte compromis, gérant tentant un accès interboutique, appareil perdu, requête répétée, dépendance compromise, erreur d’exploitation et panne. Les contrôles métier contre la fraude complètent la sécurité technique. Le logiciel ne prouve pas une vente physique non saisie ; un administrateur ayant plein accès au serveur reste une autorité privilégiée. L’audit doit résister aux utilisateurs applicatifs, sans être présenté comme inviolable face à root.

Principes : refus par défaut, moindre privilège, validation serveur, protections cumulées, traçabilité sans secrets, données minimales et échec explicite. Chaque règle ci-dessous doit avoir une preuve de configuration ou un test avant le lot concerné. Les décisions opérationnelles ouvertes sont listées à la fin.

## 2. Authentification, MFA et récupération

Utiliser une bibliothèque d’authentification maintenue (Better Auth proposé), jamais un algorithme de mot de passe ou un protocole de session maison. Inscriptions publiques désactivées. Invitation/activation à usage unique et durée limitée ; aucun mot de passe initial partagé. Si mot de passe temporaire nécessaire, transmission contrôlée, expiration et changement obligatoire au premier accès.

Mot de passe : minimum 15 caractères pour un accès reposant sur un seul facteur, longueur maximale acceptée d’au moins 64 caractères, pas de troncature silencieuse ni composition artificielle imposée. Autoriser collage et gestionnaires de mots de passe. Refuser les mots de passe courants/compromis via mécanisme ne divulguant pas le secret. Hachage salé adaptatif fourni par l’intégration, paramètres documentés et évalués sur le VPS. Cette politique renforce l’ancien minimum de 12 caractères.

**MFA obligatoire pour le propriétaire avant accès à des données réelles**, décision de conception renforcée par ce document. TOTP avec bibliothèque maintenue comme base ; passkeys envisageables si intégration vérifiée. Secrets TOTP chiffrés côté serveur avec clé séparée de la base ; codes de secours aléatoires, hashés, à usage unique. Exiger une authentification fraîche pour ajout/retrait du second facteur ; auditer et notifier le propriétaire. Une récupération ne doit pas contourner silencieusement le MFA. Pour les gérants, MFA optionnel à activer selon les appareils et le besoin.

Réinitialisation par jeton aléatoire cryptographique, hashé en base, valable 15 minutes et consommé atomiquement une seule fois. Réponse identique pour compte absent/existant ; ne pas laisser la latence ou les erreurs divulguer facilement l’existence d’un compte. URL de récupération construite depuis une origine configurée, jamais depuis Host non vérifié. Après changement/récupération, révoquer les anciennes sessions et capacités selon la procédure de rapprochement hors connexion.

Récupération propriétaire sans e-mail : procédure d’exploitation documentée, vérification d’identité hors application, accès opérateur autorisé et audit ; pas d’endpoint public de contournement. Tester perte du second facteur avant pilote.

## 3. Sessions, cookies et CSRF

Sessions persistées serveur, expiration absolue initiale 12 h ; rotation lors d’authentification et changement de privilèges. Cookies HttpOnly, Secure en production, SameSite=Lax par défaut, portée hôte/path minimale ; préfixe `__Host-` lorsque compatible. Aucun token de session dans URL ou localStorage. Vérifier révocation lors de désactivation, changement de mot de passe et perte d’appareil.

Authentification fraîche de moins de 30 minutes pour utilisateurs/appareils, sécurité, export global et modification de règles sensibles ; redemander MFA pour gestion des facteurs et récupération. Le verrouillage local à 5 minutes n’est pas une expiration de session serveur et n’efface pas les commandes en attente.

Pour toute mutation authentifiée par cookie, protéger contre CSRF via le mécanisme documenté de l’intégration, contrôles d’origine exacts et jeton lorsque requis. SameSite seul n’est pas la stratégie complète. Aucun effet métier via GET. Définir le traitement d’Origin absent : requêtes navigateur sensibles refusées sans preuve CSRF alternative validée, pas d’acceptation générale par défaut. Les clients techniques éventuels disposent d’une authentification distincte explicitement prévue.

CORS : même origine privilégiée via reverse proxy ; sinon liste exacte de schémas/hôtes/ports autorisés. Jamais `*` avec credentials, jamais réflexion automatique de l’origine. CORS ne remplace ni autorisation ni CSRF. Vérifier les URL de redirection par liste autorisée, sans open redirect.

## 4. Force brute, abus et confiance dans le proxy

Limites indépendantes par compte normalisé ET par IP ; ne pas utiliser seulement une paire compte/IP qu’un attaquant distribué contournerait. Appliquer aussi aux resets, invitations, codes MFA, PIN local et exports. Messages génériques, comparaison des secrets par primitives adaptées ; pas de CAPTCHA permanent imposé à tous les gérants.

Paramètres initiaux configurables, à valider en recette derrière un NAT partagé :

| Route/usage | Limite de départ | Réaction |
|---|---|---|
| Connexion échouée | 5 échecs/15 min/compte ; 50 tentatives/15 min/IP | Temporisation progressive plafonnée à 15 min, réponse générique, alerte sur répétition |
| Vérification MFA | 5 échecs/5 min/challenge ; 20/15 min/compte | Invalider le challenge au seuil ; nouvelle connexion requise |
| Récupération | 3 demandes/h/compte ; 20/h/IP | Réponse générique, envoi limité sans révéler le compte |
| API interactive | 300 requêtes/min/utilisateur ; rafale 60/10 s | 429 + Retry-After, affiner par route |
| Exports volumineux | 2 actifs/utilisateur, 5 globaux | File bornée, quota, statut visible |

Ne pas verrouiller définitivement un compte sur simple trafic hostile : cela offrirait un déni de service. Consigner la fenêtre, l’algorithme, les clés et les seuils effectifs ; tester renouvellement de sessions et synchronisation après coupure. Synchronisation limitée par taille et lots, sans rejet permanent des preuves locales.

Configurer `trustProxy` pour les seuls proxies réels. Le reverse proxy supprime/remplace les en-têtes forwarded entrants ; ne pas faire confiance à un X-Forwarded-For libre pour contourner les limites. Redis partagé peut porter les compteurs ; en panne, auth/reset/MFA échouent de façon contrôlée (503) si aucun limiteur sûr n’est disponible. Pour les ventes déjà authentifiées, limitation locale/proxy bornée en secours et alerte, sans dépendance à BullMQ pour le commit métier. Documenter ce mode dégradé plutôt que désactiver toutes les limites.

## 5. XSS et contenu navigateur

Afficher les données comme texte via les mécanismes d’échappement React. Interdire `dangerouslySetInnerHTML`, innerHTML, document.write et évaluation dynamique avec données non fiables. Aucun besoin de texte riche utilisateur en V1 ; si ajouté plus tard, assainissement maintenu avec liste de balises/attributs et tests, jamais regex maison. L’échappement HTML ne protège pas automatiquement un contexte URL, script ou CSS.

Valider les URL et protocoles autorisés : pas de javascript:, pas de lien data: arbitraire provenant d’un utilisateur. Aucun code, style ou nom de composant exécuté depuis une saisie. Inspecter aussi noms de produits, notes, noms de fichiers, messages d’erreur, exports et données restaurées d’IndexedDB.

CSP obligatoire sur l’application de production, conçue pour Next.js : scripts de confiance avec nonces uniques par réponse ou hashes appropriés ; pas de `unsafe-eval` en production, pas de `unsafe-inline` pour scripts comme solution de facilité. Compatibilité nonce/cache/rendu statique à valider, sans réutilisation d’un nonce dans un cache partagé. Prévoir les styles dynamiques nécessaires à Motion/shadcn explicitement et sans autoriser de script arbitraire.

Base de politique à adapter et tester : default-src self, object-src none, base-uri none, frame-ancestors none, form-action self ; connect-src/img-src/font-src/worker-src limités aux origines nécessaires. Inclure les domaines S3 seulement selon le circuit réel et limiter blob: aux usages justifiés. Démarrer en Report-Only en recette pour inventorier les violations, puis imposer la politique avant production. Les rapports CSP sont eux-mêmes limités et nettoyés pour éviter fuite/abus. CSP complète la prévention XSS, elle ne la remplace pas.

En-têtes : nosniff, Referrer-Policy restrictive, Permissions-Policy désactivant les fonctions inutiles (caméra uniquement si prise de justificatif utilisée), protection contre encadrement. HSTS après vérification HTTPS ; ne pas activer preload/includeSubDomains sans vérifier tous les domaines concernés.

## 6. SQL, validation et autres injections

Prisma avec paramètres typés ; SQL spécifique uniquement paramétré. Interdire concaténation de saisies, méthodes raw unsafe avec entrée utilisateur, requêtes assemblées à partir de filtres libres. Identifiants de colonnes, ordre et tri choisis dans une liste interne ; les paramètres SQL ne représentent pas des noms de colonnes. Aucun compte applicatif superuser ni propriétaire de schéma ; rôle de migration séparé et non présent dans le runtime.

Valider tous les DTO côté NestJS : type, longueur, bornes, format, enums, cardinalité ; refuser champs inconnus et changements de rôle/shop_id/approbation par mass assignment. Recalculer totaux et droits côté serveur. Respecter montants entiers et quantités selon règles métier, pas de conversions flottantes silencieuses.

Interdire passage de saisies à shell, eval, template exécutable ou chemin de fichier. Si processus externe requis (analyse/PDF), arguments structurés, binaire fixe, timeout et environnement minimal. Pas de fusion récursive libre permettant prototype pollution ; filtrer clés dangereuses et valider structures JSON. Limiter expressions régulières coûteuses et profondeur des objets.

## 7. Autorisations et sécurité des données

Appliquer [02-permissions.md](02-permissions.md) sur chaque objet : organisation, boutique, affectation, session, appareil et état du workflow. Ne pas considérer un UUID imprévisible comme une permission. Vérifier listes, détails, exports, téléchargement et notifications ; pas seulement les mutations. DTO construits explicitement, sans sérialiser directement un modèle Prisma contenant des secrets/champs privés.

Refus par défaut pour nouvelles routes. Les règles owner/gérant s’appliquent également aux jobs et au moment de délivrer leurs résultats. Le coût d’achat, les documents multiboutiques et la caisse attendue suivent les restrictions existantes. Test spécifique : absence du montant attendu avant comptage dans API, HTML initial, cache, exports et données offline.

Pas de cache public/CDN partagé pour pages ou API privées. Réponses sensibles avec politique de cache privée/no-store adaptée ; caches applicatifs éventuels segmentés par identité et droits, invalidés lors de révocation. Service worker : allowlist explicite d’assets ; pas de mise en cache générale des réponses API ou d’authentification.

## 8. Fichiers, S3, exports et SSRF

PDF/JPEG/PNG/WebP uniquement, 10 Mo/fichier et 5 pièces/document par défaut ; limites en streaming au proxy et au service, pas uniquement contrôle après chargement complet. Vérifier signature MIME et décodage, dimensions/pixels maximum des images, taille décompressée et temps de traitement. Refuser SVG, HTML, exécutables et archives V1. Nom original nettoyé pour affichage, jamais utilisé comme chemin ; clés serveur opaques.

Circuit : demande autorisée → zone privée de quarantaine → contrôle taille/type/intégrité → antivirus → état CLEAN → rattachement consultable. Moteur indisponible ou timeout : rester en attente, jamais considérer propre par défaut. Antivirus proposé : ClamAV isolé, signatures à jour ; ressources et intégration à vérifier. Envoi S3 et transaction SQL non atomiques : gérer états et orphelins. Les buckets et identifiants doivent être provisionnés sans accès anonyme ni clés root dans l’application.

URL présignée limitée à un objet, action et expiration (5 minutes pour lecture). Une URL délivrée est un secret temporaire et n’est pas nécessairement révocable avant expiration : pour accès exigeant révocation immédiate, utiliser une lecture contrôlée par l’API. Après upload direct, confirmer côté serveur taille/type/objet avant CLEAN. Ne pas logger les URLs signées. Préférer téléchargement en pièce jointe ou aperçu image sûr ; PDF non fiable servi depuis une origine distincte sans cookies applicatifs ou téléchargé, sans rendu actif dans l’origine de l’application.

SSRF : aucune récupération d’URL libre pour import/image/PDF en V1. Si besoin ultérieur, liste de destinations autorisées, contrôle DNS/IP/redirects et sortie réseau limitée ; bloquer loopback, réseaux privés, link-local et métadonnées cloud. Les workers PDF/antivirus n’accèdent pas librement au réseau interne. Templates PDF contrôlés et contenu échappé.

CSV : neutraliser les cellules textuelles interprétables comme formule, y compris préfixes de contrôle/espaces pertinents ; échapper guillemets et séparateurs selon format. Les nombres calculés restent des nombres, pas des formules. Tester les fichiers dans les tableurs ciblés. Exports privés et périssables, contrôles d’accès réévalués à la remise.

## 9. Hors connexion et appareils

Maintenir la capacité limitée à 24 h et le périmètre de [05-hors-connexion.md](05-hors-connexion.md). Une capacité doit être vérifiable côté serveur, liée à organisation/boutique/utilisateur/appareil/session, dotée d’expiration, identifiant et version ; impossible de s’attribuer une permission via IndexedDB. Les signatures éventuelles utilisent une bibliothèque éprouvée ; aucune clé privée serveur dans le navigateur.

Considérer IndexedDB comme modifiable par le détenteur du profil. Le serveur revalide commandes, séquences, droits et invariants ; l’heure locale n’est pas une preuve suffisante d’exécution avant expiration. Cas ambigus/révocation mis en rapprochement manuel selon protocole, sans suppression des événements. Pas de mise à jour forcée effaçant le cache ou commandes non acquittées.

PIN local : mécanisme de confort limité contre accès occasionnel, dérivation adaptée et temporisation ; ce contrôle n’empêche ni une XSS ni un propriétaire du navigateur de lire/modifier les données. Stocker seulement les données nécessaires, éviter navigation privée/profil partagé, verrouillage système conseillé. Changement d’utilisateur ne doit jamais exposer la file de l’ancien utilisateur ; conserver les preuves isolées jusqu’au rapprochement.

Tablette perdue : révocation en ligne, alerte propriétaire, rapprochement des commandes restantes, nouvelle approbation de l’appareil de remplacement. Révocation immédiate d’un appareil déconnecté impossible ; le document utilisateur doit le dire clairement.

## 10. Transactions, jobs et intégrité

Transactions atomiques, verrous ordonnés, contraintes PostgreSQL, clé d’idempotence liée à acteur/portée/commande et hash du payload. Un même identifiant avec autre contenu est refusé. Les approbations ne sont pas auto-déclarées par le client ; vérifier état/version/plafond au commit. Journal posté non modifiable par les chemins ordinaires ; corrections liées et audit. Séparer droits d’écriture audit et opérations d’administration autant que possible.

Outbox durable et consommateurs idempotents. Jobs avec payload minimal (identifiants plutôt que secrets/documents), type/version validés et contexte d’autorisation contrôlé ; aucun nom de job fourni librement au navigateur. Files, rétentions, concurrence et retries bornés, échecs visibles. Redis privé avec ACL adaptée, aucun accès à sa console par l’utilisateur ; ne pas mélanger cache à éviction et file critique sans isolation/politique adaptée. Une perte de queue se récupère par outbox/réconciliation sans double écriture métier.

## 11. Disponibilité et protection contre la saturation

Définir limites cohérentes proxy/API : JSON 1 Mo par défaut, pagination maximum 100 éléments, lots sync au plus 50 commandes et 1 Mo (fractionner sans perdre l’ordre), fichiers selon section 8. Ajuster seulement avec cas mesuré et test. Limiter recherche, plage d’export, complexité des filtres, taille des réponses et uploads simultanés.

Timeouts réseau et base, pool DB borné, transactions courtes, quotas worker et arrêt des traitements abandonnés. Exports longs asynchrones. Healthchecks minimaux, readiness distincte de liveness ; éviter boucles de redémarrage détruisant une file locale. Suivre CPU, mémoire, disque, connexions, retard de queue et latence.

Les limites applicatives ne protègent pas seules contre un DDoS volumétrique saturant le VPS ; vérifier la protection de l’hébergeur et, selon exposition, un proxy/WAF externe. Aucun achat implicite. Si proxy externe, origine et IP de confiance configurées, sans cache privé accidentel.

## 12. VPS, Docker, réseau et secrets

HTTPS public via reverse proxy. Ports DB/Redis/administration S3 non publiés sur Internet. Port S3 public seulement si upload direct requis, via TLS et authentification, sans interface d’administration. Pare-feu explicite et vérification depuis extérieur ; attention aux ports publiés par Docker, qui doivent aussi être contrôlés.

SSH par clés, accès opérateur nominatif, connexion root directe et mots de passe SSH désactivés après test d’un accès de secours. Restreindre SSH par réseau/VPN si possible. Correctifs OS et redémarrages planifiés ; horloge synchronisée. Journaux opérateur, procédure de révocation et responsables identifiés.

Conteneurs non privilégiés, utilisateur non-root lorsque supporté, capabilities minimales, no-new-privileges, filesystem read-only lorsque possible et volumes écriture ciblés. Jamais montage du socket Docker dans web/API/worker. Limites CPU/mémoire/processus, healthchecks et rotation des logs ; images minimales/versionnées analysées. Environnements dev/test/prod et secrets séparés.

Secrets hors git, images, bundle navigateur et logs ; seuls paramètres publics explicitement nécessaires dans les variables exposées Next.js. Accès fichier restreint ou gestionnaire de secrets. Clés DB runtime/migration/sauvegarde et S3 séparées par usage. Documenter rotation sans corruption des sessions/capacités : période de transition bornée et révocation en cas de fuite. Chiffrement des sauvegardes, clés stockées séparément et restauration possible par opérateur autorisé.

## 13. Dépendances et chaîne de livraison

Versions stables compatibles verrouillées, lockfile commité, installation reproductible en CI ; vérifier paquets homonymes et scripts d’installation. Pas de mise à jour automatique directement en production. Examiner modifications de dépendances, migrations et build ; protections de branche et accès CI à privilèges minimaux lors de la mise en place du dépôt distant.

Outils proposés à configurer : audit du gestionnaire pnpm pour dépendances, Gitleaks pour secrets, Trivy pour images/configuration, analyse statique TypeScript de sécurité via Semgrep ou équivalent maintenu. Choisir versions exactes au bootstrap et éviter empiler des outils sans exploitation de leurs résultats. Établir inventaire des composants et revue des alertes ; aucune alerte ignorée silencieusement.

Failles critiques/élevées exploitables dans le périmètre exposé bloquent la livraison jusqu’à correction ou mesure compensatoire validée et tracée avec responsable/échéance. Une alerte nécessite qualification ; un audit npm sans alerte ne prouve pas la sécurité de l’application.

## 14. Logs, détection et incidents

Logs structurés, corrélation requestId/jobId/documentId, erreurs publiques sans stack SQL/secrets. Nettoyer entrées log et retours ligne pour éviter log injection. Ne pas journaliser mots de passe, cookies, tokens, PIN, secrets MFA, URL signée ou document intégral. Audit métier distinct, accès restreint et export de sécurité hors VPS pour limiter effacement après compromission.

Alertes : rafales de connexions, MFA/récupération inhabituels, changement de droits/facteurs, accès interboutiques refusés répétés, scanner indisponible, jobs morts, backup absent, disque critique, divergence de projection. Seuils/destination/responsable à configurer ; pas d’alerte qui n’arrive à personne. Limiter bruit et volume, protéger aussi les endpoints de métriques.

Procédure incident : identifier périmètre et préserver traces ; contenir l’accès compromis ; révoquer sessions/clés ; corriger la cause ; restaurer en environnement vérifié si nécessaire ; rapprocher commandes offline ; informer responsables concernés ; retour d’expérience. Tester scénario compte propriétaire compromis et VPS perdu. Définir une rétention des logs proportionnée avant production, distincte des archives métier ; aucune politique juridique de conservation inventée.

## 15. Sauvegarde et reprise sur VPS

Remplace l’ancienne obligation PostgreSQL géré : PostgreSQL auto-hébergé exige sauvegardes de base + archivage WAL/PITR configurés pour viser RPO <=15 min. Objectif RTO <=4 h à mesurer lors d’une restauration, pas une garantie. Dump quotidien seul insuffisant pour cet objectif.

Copies chiffrées hors VPS dans un compte/emplacement distinct, rétention initiale minimum 30 jours, accès runtime sans capacité de détruire toute l’historique. Pour les objets, stratégie incrémentale/versionnée ou copie protégée indépendante selon fournisseur ; ne pas supposer que SeaweedFS possède toutes les fonctions S3. Définir et mesurer un RPO fichiers cohérent avec leurs références en base, gérer fichiers manquants explicitement après reprise.

Test de restauration complet avant pilote puis trimestriel : base, objets, clés/configurations nécessaires, accès et cohérence. En cas de restauration en arrière, réconcilier séquences offline/outbox avant réouverture pour éviter pertes et doubles effets. Maintenir protocoles sync N et N-1 pendant durée hors ligne maximale +7 jours ; migrations additives autant que possible.

## 16. Recette sécurité obligatoire

Les références SEC ci-dessous complètent T01–T84 et RSP01–RSP10. Elles sont à implémenter avec [la stack de tests](11-stack-et-strategie-tests.md), pas des résultats déjà obtenus.

| ID | Preuve attendue |
|---|---|
| SEC01 | XSS stockée/réfléchie/DOM : contenus de test dans notes, noms, URL, fichiers et données locales restent inertes dans UI et exports |
| SEC02 | CSP imposée compatible avec build production, hydratation, PWA et Motion ; script non autorisé bloqué |
| SEC03 | Filtres/recherches/raw SQL résistent aux entrées d’injection ; revue des accès raw et vérification rôle DB minimal |
| SEC04 | CSRF depuis origine tierce, Origin absent, CORS malveillant et redirection externe refusés selon contrat |
| SEC05 | Limites compte/IP, NAT partagé, faux forwarded et panne Redis testés ; aucune ouverture générale en mode dégradé |
| SEC06 | Cookies, expiration, rotation et révocation ; ancienne session inutilisable après reset/désactivation |
| SEC07 | MFA requis propriétaire, codes à usage unique, expiration/récupération et retrait de facteur contrôlés |
| SEC08 | Tests croisés de rôles/boutiques pour chaque catégorie d’endpoint, export, pièce et résultat de job |
| SEC09 | Mass assignment/champs inconnus, montants falsifiés, dépassement d’approbation et transitions interdites refusés |
| SEC10 | Caisse attendue absente des réponses/HTML/cache/export avant comptage ; aucune fuite interutilisateur via cache |
| SEC11 | Faux MIME, fichier surdimensionné, nom de chemin, contenu infecté de test et scanner indisponible restent bloqués/quarantainés |
| SEC12 | S3 privé, clés limitées, URL expirée, téléchargement interboutique et accès administration refusés |
| SEC13 | Génération PDF/import ne permet pas de contacter une URL interne arbitraire ; exports CSV sans exécution de formules injectées |
| SEC14 | Payloads/regex/collections trop volumineux arrêtés proprement ; pagination, timeout et quotas efficaces |
| SEC15 | Concurrence, rollback, replay et double job ne produisent pas de double effet ni stock négatif |
| SEC16 | Commandes offline falsifiées, hors capacité ou révoquées rapprochées sans perte ; changement d’utilisateur sans fuite locale |
| SEC17 | Analyse secrets/dépendances/images et revue statique exécutées, résultats qualifiés et corrections tracées |
| SEC18 | Vérification réseau externe : seuls ports voulus accessibles ; TLS, en-têtes et configuration proxy contrôlés |
| SEC19 | Logs et traces de test exempts de secrets ; alertes effectivement reçues sur scénarios simulés |
| SEC20 | Restauration base/objets hors VPS réalisée et chronométrée ; RPO/RTO mesurés, rapprochement offline vérifié |
| SEC21 | Procédure perte tablette/compromission propriétaire et récupération MFA exercée avec comptes de test |

Tests négatifs/API avec Vitest/Fastify inject et infrastructures réelles ; XSS/CSRF/cookies/cache avec Playwright et origines de test distinctes. Ajouter un scan dynamique OWASP ZAP en recette isolée (authentification des deux rôles), passif puis actif contrôlé. Aucun scan actif d’un service tiers ou de production sans autorisation et fenêtre définie. Un scan ne remplace pas la revue métier et les tests d’accès.

## 17. Intégration aux lots et mise en production

Lot 0 : modèle de menaces, auth/MFA, validation globale, permissions, CSRF/CORS, en-têtes, logs filtrés, limites, rôles DB et CI sécurité. Lots métier : transactions, droits objet, absence de fuite, tests négatifs. Lot fichiers : quarantaine/S3/antivirus. Lot offline : capacités, reprise/révocation/cache. Avant pilote : configuration VPS, scans, restauration et exercice incident.

Dans IMPLEMENTATION_STATUS, suivre chaque SEC : prévu/implémenté/testé/échec/non applicable motivé, preuve/commande/date/version et défaut restant. Ne pas désactiver une protection pour faire passer un test. Ne pas déclarer une conformité OWASP ASVS sans matrice et vérifications correspondantes ; utiliser ASVS comme référentiel de revue, avec niveau 2 comme objectif de travail à cadrer.

Avant données réelles, résoudre : choix final bibliothèque auth et intégration MFA, responsable d’exploitation, fournisseur/VPS et protection réseau, destination de sauvegarde et stockage des clés, mail/alertes, durées de rétention, version S3 et restauration, paramètres effectifs de rate limit et ressources scanner. Aucun de ces points ne doit devenir un défaut silencieux.

Critères bloquants : accès non autorisé, injection exploitable, fuite de secret, cohérence financière compromise, MFA propriétaire absent, fichiers non contrôlés exposés, backups non restaurables ou service interne exposé accidentellement. Les contrôles inapplicables sont motivés ; les risques résiduels sont documentés, pas masqués par le terme « sécurisé ».

## Références

- [OWASP XSS](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [OWASP injections SQL](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP authentification](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Node.js](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
- [OWASP Docker Node.js](https://cheatsheetseries.owasp.org/cheatsheets/NodeJS_Docker_Cheat_Sheet.html)

Les seuils, durées et choix d’exploitation de ce document sont des décisions de conception du projet à éprouver en recette ; ils ne sont pas des garanties attribuées à OWASP ou aux bibliothèques.
