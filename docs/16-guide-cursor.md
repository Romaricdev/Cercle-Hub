# Utiliser Cursor pour Cercle Complet Sarl

## Organisation

Ouvrir `C:\stock` comme racine de projet. Les règles `.cursor/rules/*.mdc` et compétences `.cursor/skills/*/SKILL.md` suivent les formats documentés par Cursor. Leur reconnaissance effective dépend de la version de Cursor installée : vérifier leur présence dans les réglages de personnalisation, sans considérer un contrôle de fichiers comme un test de l’éditeur.

La règle `00-project` est toujours appliquée. Les règles backend, base, UI, tests et documentation sont associées à leurs chemins. Les règles offline et sécurité sont sélectionnées par pertinence ; les invariants critiques sont aussi rappelés dans AGENTS.md. Pas de configuration globale utilisateur modifiée, ni de plugin/MCP externe requis.

## Skills disponibles

| Skill | Quand l’utiliser |
|---|---|
| cc-pilotage-phase | Décomposer ou reprendre une phase, vérifier dépendances et mettre à jour le suivi |
| cc-workflow-metier | Ventes, caisse, réapprovisionnement, crédit, retours et stock |
| cc-donnees-migrations | Modèle Prisma, migrations et concurrence PostgreSQL |
| cc-interface-responsive | Écrans, thèmes, design system et ergonomie tactile |
| cc-hors-connexion | Dexie, PWA, reprise et synchronisation |
| cc-recette-tests | Unitaires, intégration, E2E et preuves de recette |
| cc-securite | Protections applicatives et vérification SEC |
| cc-exploitation-vps | Déploiement autorisé, Docker, sauvegarde et restauration |

Cursor peut sélectionner une skill via sa description ; elle peut également être invoquée par son nom dans le menu `/` si la version utilisée le propose. En cas de doute, demander explicitement à l’agent de lire le fichier SKILL.md correspondant. Codex peut aussi lire ces fichiers sur demande à partir d’AGENTS.md ; leur découverte automatique par tous les agents n’est pas supposée.

## Instructions utiles

Préparation sans code : « Lis AGENTS.md, utilise cc-pilotage-phase et détaille les tâches de P00 sans démarrer l’application. »

Démarrage autorisé ultérieurement : « Lis AGENTS.md et docs/15-phases-developpement.md. Réalise P00 puis P01, exécute les contrôles prévus et mets à jour docs/IMPLEMENTATION_STATUS.md. Ne commence pas P02 dans cette demande. »

Reprise : « Lis l’état réel, reprends la tâche inachevée de la phase autorisée et applique les skills utiles. N’efface pas les travaux existants et indique les tests réellement exécutés. »

Revue : « Utilise cc-securite et cc-recette-tests pour vérifier le périmètre implémenté. Distingue vulnérabilités démontrées, contrôles absents et tests non exécutés. »

Ces exemples ne sont pas des instructions actives. Les skills structurent le travail sans autoriser implicitement déploiement, achat, effacement de données ou scan externe.

## Entretien et contrôles

Les règles restent courtes et renvoient aux documents normatifs ; modifier les exigences dans docs puis aligner les rappels affectés. Tenir IMPLEMENTATION_STATUS après chaque étape réelle. Les descriptions des skills doivent rester spécifiques pour éviter de toutes les charger à chaque tâche.

`python scripts/check_cursor_setup.py` contrôle les métadonnées minimales, liens locaux et noms ; il ne simule ni le choix des skills ni le chargement de Cursor. Exécuter aussi les deux contrôles documentaires du README.

Le dossier copié à `C:\stock` devient la référence de travail pour les changements futurs. L’ancien dossier de préparation est conservé comme copie historique : éviter les modifications parallèles divergentes et ne pas recopier plus tard ses fichiers par-dessus le projet développé.

Sources de format : [règles Cursor](https://cursor.com/docs/rules) et [skills Cursor](https://cursor.com/docs/skills). Aucun comportement de sécurité n’est garanti par la seule présence des fichiers de consignes.
