"""Validate local Cursor instruction files; does not execute Cursor or the app."""
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
errors = []
rules = sorted((root / '.cursor/rules').glob('*.mdc'))
skills = sorted((root / '.cursor/skills').glob('*/SKILL.md'))
if not rules or not skills:
    errors.append('Rules or skills missing')
always = 0
for path in rules + skills:
    content = path.read_text(encoding='utf-8')
    parts = content.split('---', 2)
    if len(parts) != 3 or parts[0].strip():
        errors.append(f'{path}: missing frontmatter')
        continue
    fields = {}
    for line in parts[1].strip().splitlines():
        if ':' not in line:
            errors.append(f'{path}: invalid metadata line')
            continue
        key, value = line.split(':', 1)
        value = value.strip()
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except ValueError:
                errors.append(f'{path}: invalid quoted metadata')
        fields[key] = value
    if not fields.get('description'):
        errors.append(f'{path}: missing description')
    if path.suffix == '.mdc':
        if fields.get('alwaysApply') not in ('true', 'false'):
            errors.append(f'{path}: invalid alwaysApply')
        always += fields.get('alwaysApply') == 'true'
    elif fields.get('name') != path.parent.name or not re.fullmatch(r'[a-z0-9-]{1,63}', fields.get('name', '')):
        errors.append(f'{path}: invalid skill name')
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', parts[2]):
        if target.startswith(('https://', 'http://', '#')):
            continue
        dest = (path.parent / target.split('#')[0]).resolve()
        if not dest.is_relative_to(root) or not dest.exists():
            errors.append(f'{path}: missing/outside link {target}')
if always != 1:
    errors.append('Expected one always-applied project rule')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'OK: {len(rules)} Cursor rules, {len(skills)} skills; metadata and local links valid.')
print('Cursor runtime discovery and application behavior have not been tested.')
