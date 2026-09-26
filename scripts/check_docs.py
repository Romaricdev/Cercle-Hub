"""Vérifications structurelles de la documentation, sans dépendance externe."""
from pathlib import Path
import re
import json

root = Path(__file__).resolve().parents[1]
files = [root / 'AGENTS.md', root / 'DOCUMENTATION_PROJET.md', *sorted((root / 'docs').rglob('*.md'))]
errors = []
for path in files:
    text = path.read_text(encoding='utf-8')
    if '\ufffd' in text:
        errors.append(f'{path.name}: caractère de remplacement Unicode')
    if text.count('```') % 2:
        errors.append(f'{path.name}: bloc de code non fermé')
    for target in re.findall(r'\[[^\]]*\]\(([^)\s]+)\)', text):
        if target.startswith(('http:', 'https:', '#', 'mailto:')):
            continue
        dest = (path.parent / target.split('#')[0]).resolve()
        if not dest.exists():
            errors.append(f'{path.relative_to(root)}: lien absent {target}')

recipe = (root / 'docs/08-recette.md').read_text(encoding='utf-8')
ids = re.findall(r'^\| (T\d{2}) \|', recipe, flags=re.M)
if ids != [f'T{i:02d}' for i in range(1, 85)]:
    errors.append('La recette doit contenir T01 à T84 exactement une fois et dans l’ordre.')
screens = (root / 'docs/06-ecrans.md').read_text(encoding='utf-8')
if len(re.findall(r'^\| E\d{2} ', screens, flags=re.M)) != 40:
    errors.append('40 écrans attendus.')

catalog=json.loads((root/'docs/conception/catalogue-ecrans.json').read_text(encoding='utf-8'))
if [r['id'] for r in catalog] != [f'E{i:02d}' for i in range(1,41)]:
    errors.append('Catalogue : écrans E01 à E40 uniques et ordonnés requis.')
transition_text=(root/'docs/conception/01-transitions.md').read_text(encoding='utf-8')
transition_ids=set(re.findall(r'^## (S\d{2}) ',transition_text,re.M))
api_text=(root/'docs/api/contrats.md').read_text(encoding='utf-8')
model_text='\n'.join((root/p).read_text(encoding='utf-8') for p in ['docs/03-modele-donnees.md','docs/conception/02-donnees-et-relations.md'])
for r in catalog:
    for required in ['entry','fields','primary_action','exit','api','tables','transitions','tests']:
        if not r.get(required): errors.append(f"{r['id']}: champ documentaire vide {required}")
    for test in r['tests']:
        if test not in ids: errors.append(f"{r['id']}: scénario absent {test}")
    for transition in r['transitions']:
        if transition not in transition_ids: errors.append(f"{r['id']}: transition absente {transition}")
    for table in r['tables']:
        if not re.search(r'\b'+re.escape(table)+r'\b',model_text):
            errors.append(f"{r['id']}: table non mentionnée dans dictionnaire {table}")
    for api in r['api']:
        if api=='/api/auth/*': continue
        path=api.split(' ',1)[1]
        if path=='/api/auth/*': continue
        if path not in api_text: errors.append(f"{r['id']}: chemin API non documenté {path}")

mapped_tests={test for r in catalog for test in r['tests']}
technical_tests={'T57','T58','T59'}
unmapped=set(ids)-mapped_tests-technical_tests
if unmapped: errors.append('Scenarios sans couverture ecran ou technique : '+', '.join(sorted(unmapped)))

if errors:
    raise SystemExit('\n'.join(errors))
print(f'OK : {len(files)} fichiers Markdown, liens locaux et blocs de code valides, 84 scénarios et 40 écrans.')
print('OK : references ecrans -> transitions, chemins API, noms de tables et scenarios presentes.')
print('Cette vérification structurelle ne remplace pas la revue métier ni les futurs tests applicatifs.')
