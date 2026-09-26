"""Validate backlog dependencies and exact documentary coverage, not application behavior."""
from pathlib import Path
import json,re

root=Path(__file__).resolve().parents[1]
base=root/'docs/p00'
tasks=json.loads((base/'backlog.json').read_text(encoding='utf-8'))['tasks']
coverage=json.loads((base/'coverage.json').read_text(encoding='utf-8'))
catalog=json.loads((root/'docs/conception/catalogue-ecrans.json').read_text(encoding='utf-8'))
ids=[t['id'] for t in tasks]
assert len(ids)==len(set(ids)), 'Duplicate task ID'
lookup={t['id']:t for t in tasks}
fields={'E':'screens','S':'transitions','T':'tests','RSP':'responsive','SEC':'security'}
expected={'E':{f'E{i:02d}' for i in range(1,41)},'S':{f'S{i:02d}' for i in range(1,16)},'T':{f'T{i:02d}' for i in range(1,85)},'RSP':{f'RSP{i:02d}' for i in range(1,11)},'SEC':{f'SEC{i:02d}' for i in range(1,22)}}
for t in tasks:
    assert re.fullmatch(r'P\d{2}-(?:\d{2}|E\d{2}|GATE)',t['id']),t['id']
    assert t['phase']==t['id'][:3]
    assert t['acceptance'] and t['deliverables'] and t['references'],t['id']
    assert t['status'] in {'A_FAIRE','EN_COURS','A_CORRIGER','TERMINE','BLOQUE'}
    for d in t['dependencies']: assert d in lookup and d!=t['id'],(t['id'],d)
    for ref in t['references']: assert (root/ref).exists(),ref
    for kind,field in fields.items(): assert set(t[field]) <= expected[kind],(t['id'],field)
visiting=set();done=set()
def visit(id):
    assert id not in visiting, f'Dependency cycle: {id}'
    if id in done:return
    visiting.add(id)
    for d in lookup[id]['dependencies']:visit(d)
    visiting.remove(id);done.add(id)
for id in ids:visit(id)
for p in range(1,13):
    phase=f'P{p:02d}';gate=lookup[phase+'-GATE']
    assert set(gate['dependencies'])=={t['id'] for t in tasks if t['phase']==phase and t['id']!=gate['id']},phase
for r in catalog:
    candidates=[t for t in tasks if t['id'].endswith('-'+r['id'])]
    assert len(candidates)==1,r['id']
    t=candidates[0]
    assert set(r['tests'])<=set(t['tests']) and set(r['transitions'])<=set(t['transitions']),r['id']
    assert set(r['api'])<=set(t['deliverables']),r['id']
assert len({r['reference'] for r in coverage})==len(coverage)
assert {r['reference'] for r in coverage}==set().union(*expected.values())
for r in coverage:
    kind=re.match(r'[A-Z]+',r['reference'])[0]
    owners={t['id'] for t in tasks if r['reference'] in t[fields[kind]]}
    assert owners and owners==set(r['tasks']),r['reference']
    assert r['consolidationPhase']==max(lookup[id]['phase'] for id in owners)
versions=json.loads((base/'versions.json').read_text(encoding='utf-8'))
for r in versions:
    assert re.fullmatch(r'\d+\.\d+\.\d+',r['selectedCandidate']),r['package']
    assert r['source'].startswith('https://') and r['checkedAt']
print(f'OK: {len(tasks)} tasks, acyclic dependencies, {len(coverage)} covered references.')
print('40 screens, 15 transitions, 84 T, 10 RSP, 21 SEC; candidate versions structurally valid.')
print('No application tests, dependency installation or runtime compatibility proven by this check.')
