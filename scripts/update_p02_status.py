"""Met à jour backlog.json et coverage.json pour P02. Exécuter depuis la racine."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
backlog_path = root / "docs/p00/backlog.json"
coverage_path = root / "docs/p00/coverage.json"

backlog = json.loads(backlog_path.read_text(encoding="utf-8"))
backlog["scope"] = "P00 documentaire réalisée ; P01 et P02 réalisés localement ; P03–P12 non commencées"
evidence = {
    "P02-01": ["apps/web/src/app/globals.css", "apps/web/src/components/shell", "tests/e2e/p02-responsive.spec.ts", "tests/e2e/p02-visual.spec.ts"],
    "P02-02": ["apps/api/src/http/security.ts", "apps/api/src/create-app.ts", "tests/integration/access.test.ts", "tests/integration/auth.test.ts"],
    "P02-E01": ["apps/web/src/app/login/page.tsx", "tests/e2e/connexion.spec.ts", "tests/integration/auth.test.ts"],
    "P02-E37": ["apps/api/src/access/access.controller.ts", "apps/web/src/app/owner/users/page.tsx", "tests/integration/access.test.ts"],
    "P02-E38": ["packages/domain/src/devices.ts", "apps/web/src/app/owner/devices/page.tsx", "apps/web/src/app/manager/device/page.tsx", "tests/integration/access.test.ts"],
    "P02-GATE": ["docs/IMPLEMENTATION_STATUS.md", "docs/p02/README.md"],
}
for task in backlog["tasks"]:
    if task["id"] in evidence:
        task["status"] = "TERMINE"
        task["evidence"] = evidence[task["id"]]
backlog_path.write_text(json.dumps(backlog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
updates = {
    "E01": ("TESTE", ["tests/e2e/connexion.spec.ts", "tests/integration/auth.test.ts"]),
    "E37": ("PARTIEL", ["tests/integration/access.test.ts", "tests/e2e/connexion.spec.ts — état vide sans boutique"]),
    "E38": ("PARTIEL", ["tests/integration/access.test.ts", "tests/e2e/p02-responsive.spec.ts — écran gérant"]),
    "S01": ("PARTIEL", ["tests/integration/access.test.ts — sessions, invitations, appareils"]),
    "S14": ("PARTIEL", ["tests/integration/access.test.ts — register/approve/revoke sans capacité"]),
    "S15": ("PARTIEL", ["tests/integration/access.test.ts — un seul gérant actif, concurrence"]),
    "T02": ("PARTIEL", ["tests/e2e/connexion.spec.ts", "tests/integration/access.test.ts"]),
    "T48": ("PARTIEL", ["tests/integration/access.test.ts — appareil révoqué"]),
    "T51": ("PARTIEL", ["tests/integration/access.test.ts — approbation sans capability"]),
    "T61": ("PARTIEL", ["tests/integration/access.test.ts — audit USER_* DEVICE_*"]),
    "T62": ("PARTIEL", ["tests/integration/access.test.ts — révocation d’appareil"]),
    "T77": ("PARTIEL", ["tests/integration/access.test.ts — remplacement concurrent"]),
    "RSP01": ("PARTIEL", ["tests/e2e/p02-responsive.spec.ts"]),
    "RSP02": ("PARTIEL", ["tests/e2e/p02-responsive.spec.ts", "tests/e2e/p02-visual.spec.ts"]),
    "RSP03": ("PARTIEL", ["tests/e2e/p02-responsive.spec.ts — 320 à 1920"]),
    "RSP04": ("PARTIEL", ["tests/e2e/connexion.spec.ts — clavier"]),
    "RSP05": ("PARTIEL", ["tests/e2e/p02-responsive.spec.ts — menu téléphone"]),
    "RSP06": ("PARTIEL", ["tests/e2e/connexion.spec.ts — reduced-motion"]),
    "RSP07": ("PARTIEL", ["tests/e2e/p02-visual.spec.ts — clair/sombre"]),
    "SEC01": ("TESTE", ["apps/api/src/create-app.ts — Helmet CSP", "apps/web/next.config.ts"]),
    "SEC02": ("TESTE", ["tests/integration/access.test.ts — origine et CSRF"]),
    "SEC04": ("TESTE", ["apps/api/src/http/security.ts", "tests/integration/access.test.ts — 401 seulement pour le compteur login"]),
    "SEC05": ("TESTE", ["tests/integration/access.test.ts — champs inattendus, corps trop grand, injection e-mail"]),
    "SEC06": ("TESTE", ["tests/integration/auth.test.ts", "tests/e2e/auth-browser.spec.ts", "tests/integration/access.test.ts — révocation session"]),
    "SEC07": ("PARTIEL", ["tests/integration/auth.test.ts", "tests/integration/access.test.ts — TOTP et code de secours"]),
    "SEC08": ("PARTIEL", ["tests/integration/access.test.ts — gérant 403 sur /users et approve"]),
    "SEC09": ("PARTIEL", ["tests/e2e/connexion.spec.ts — erreurs génériques, session expirée"]),
    "SEC17": ("PARTIEL", ["apps/api/src/env.ts — Zod des variables ; P10/P12 restants"]),
}
for row in coverage:
    if row["reference"] in updates:
        status, ev = updates[row["reference"]]
        row["status"] = status
        row["evidence"] = ev
coverage_path.write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("backlog.json et coverage.json mis à jour pour P02.")
