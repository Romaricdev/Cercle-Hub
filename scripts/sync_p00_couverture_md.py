"""Régénère la colonne État de docs/p00/04-couverture.md depuis coverage.json."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
coverage = {row["reference"]: row for row in json.loads((root / "docs/p00/coverage.json").read_text(encoding="utf-8"))}
path = root / "docs/p00/04-couverture.md"
text = path.read_text(encoding="utf-8")
label = {"NON_TESTE": "NON TESTÉ", "PARTIEL": "PARTIEL", "TESTE": "TESTÉ"}

def repl(match: re.Match[str]) -> str:
    ref = match.group(1)
    rest = match.group(2)
    row = coverage.get(ref)
    if not row:
        return match.group(0)
    etat = label.get(row["status"], row["status"])
    return f"| {ref} |{rest}| {etat} |"

text = re.sub(r"^\| (E\d+|S\d+|T\d+|RSP\d+|SEC\d+) \|(.*?)\| [^|]+ \|$", repl, text, flags=re.M)
path.write_text(text, encoding="utf-8")
print("04-couverture.md synchronisé.")
