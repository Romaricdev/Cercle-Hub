# Préparation d’exploitation et sortie de P00

## Données connues et données à collecter

Connus : Cercle Complet Sarl, trois boutiques initiales, un gérant/boutique, tablettes en boutique, ajout de boutiques, stack et design validés. XAF/Africa-Douala restent des défauts de conception, pas des données fiscales confirmées. Les données réelles ne sont jamais remplacées par le jeu de recette.

| Information | Responsable de réponse | Échéance bloquante | Traitement avant réponse |
|---|---|---|---|
| Noms/adresses boutiques et gérants, propriétaire | Porteur/client | P11 activation réelle | Fixtures synthétiques en dev |
| Catalogue, prix, unités, lots, soldes et justificatifs initiaux | Client + validation owner | P11 bascule | Assistant P03, aucune vente fictive |
| Devise/fuseau et paramètres commerciaux | Owner | Avant première écriture réelle | Défauts configurables documentés |
| Android/iPad, OS, navigateur, taille et périphériques | Porteur | P02 cible de recette, impératif P10 matériel | Tester Chromium/Firefox/WebKit ; ne pas prétendre tester Safari matériel |
| Domaine, VPS, architecture CPU, budget et opérateur | Porteur | P10 préparation déploiement | Compose local uniquement |
| Destination backups, clés, mail transactionnel et alertes | Opérateur/porteur | P10 recette de restauration | Pas de faux mail envoyé ou de backup supposé |
| Rétention légale/données personnelles et procédure support | Porteur/client | P11 avant automatisation de purge | Conservation métier, aucune purge légale inventée |
| Imprimante 80 mm et lecteur clavier USB/Bluetooth | Porteur | Avant promesse matérielle P11 | Impression navigateur PDF ; pas de scan caméra V1 |

## Matrice navigateur proposée

Clair/sombre/système, 320/375/768/1024/1440/1920 pixels CSS et tailles intermédiaires. Chromium, Firefox et WebKit en CI ; Chrome/Edge bureau et Android, Safari iPad/iPhone récents maintenus pour cible d’usage. Publier les versions exactes effectivement testées à P02/P10. Tester stockage persistant, WebCrypto, IndexedDB, service worker, verrou multi-onglet et veille sur les appareils choisis. Si une API de sécurité/coordination manque, bloquer proprement le mode offline plutôt qu’offrir deux écrivains.

## Risques et gates bornés

| Gate | Tâche | Résultat attendu | En cas d’échec |
|---|---|---|---|
| Compatibilité TypeScript/Nest/Next/Vitest | P01-02 | Build, injection Nest et test React réels | Choisir version stable compatible et consigner l’écart |
| Auth/MFA + Fastify + Prisma | P01-03 | Login, cookies multiples, TOTP, révocation en PostgreSQL | Diagnostic avant P02, pas d’auth maison |
| Transactions Prisma et concurrence | P01-04 | Rollback et SQL verrouillé même transaction | Bloquer moteur métier, corriger accès DB |
| BullMQ/Redis et S3/volumes | P01-05 | Job retry sans double effet, fichier privé persistant | Corriger configuration ou ADR fournisseur motivée |
| Durabilité et support tablette | P08-01 | Reprise/veille/quotas sans perte de commandes acquittables | Ajuster matrice support, ne pas masquer la limite |

Ces gates n’ont pas été exécutés pendant P00. Ils permettent un démarrage contrôlé de P01, pas une affirmation de compatibilité runtime déjà prouvée.

## Critères de sortie documentaires

- Décisions de conception avec sources, limites et vérifications P01 attribuées.
- Versions candidates relevées et préversion Prisma exclue ; aucune installation prétendue.
- Backlog avec IDs stables, dépendances acycliques, résultats attendus et références.
- Couverture des 40 écrans, 15 transitions, 84 tests métier, 10 RSP et 21 SEC, tous au statut applicatif NON TESTÉ.
- Contradictions repérées corrigées (limite sync, maquette obligatoire, étapes MFA).
- Informations client/exploitation manquantes identifiées avec échéance, sans bloquer inutilement la conception.

Vérification automatisée : `python scripts/check_p00.py`, plus check_docs, check_design_examples et check_cursor_setup. Les résultats sont consignés dans IMPLEMENTATION_STATUS après exécution. Aucun serveur, image Docker, migration ou test d’application lancé.
