"use client";

import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { api, RequestError } from "../../../lib/api";
import { Alert } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { PageHeader } from "../../../components/ui/page-header";
import type { MeResponse } from "../../../lib/session";

export default function OwnerAccountPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<MeResponse>("/api/v1/me")
      .then(setMe)
      .catch((caught: RequestError) => setError(caught.message));
  }, []);

  return (
    <section className="space-y-4">
      <PageHeader title="Sécurité du compte">Gérez la protection de votre accès propriétaire et vos moyens de récupération.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-4">
            <div className="grid size-10 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))] text-[var(--success)]"><ShieldCheck aria-hidden="true" className="size-5" /></div>
            <span className="rounded-full bg-[color-mix(in_srgb,var(--success)_10%,var(--surface))] px-3 py-1.5 text-xs font-semibold text-[var(--success)]">{me?.mfa.enabled ? "MFA actif" : "MFA à activer"}</span>
          </div>
          <h2 className="mt-5 font-display text-lg font-semibold">{me?.actor.displayName ?? "Compte propriétaire"}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{me?.actor.email}</p>
          <div className="mt-5 flex items-center gap-2 text-sm text-[var(--muted)]"><LockKeyhole aria-hidden="true" className="size-4" /> Accès propriétaire protégé</div>
        </section>
        <form
          className="space-y-4 rounded-lg bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          api<{ backupCodes: string[] }>("/api/auth/two-factor/generate-backup-codes", {
            method: "POST",
            body: JSON.stringify({ password }),
          })
            .then((result) => {
              setCodes(result.backupCodes ?? []);
              setPassword("");
            })
            .catch((caught: RequestError) => setError(caught.message))
            .finally(() => setPending(false));
        }}
        >
          <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--surface-subtle)] text-[var(--primary)]"><KeyRound aria-hidden="true" className="size-5" /></div><div><h2 className="font-display text-lg font-semibold">Codes de secours</h2><p className="mt-1 text-sm text-[var(--muted)]">La régénération invalide immédiatement les anciens codes.</p></div></div>
          <div className="space-y-2">
            <Label htmlFor="reauth-password">Mot de passe actuel</Label>
            <Input id="reauth-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <Button type="submit" disabled={pending}>
            Régénérer les codes de secours
          </Button>
        </form>
      </div>
      {codes.length ? (
        <Alert tone="success">
          <p>Conservez ces codes. Ils ne seront plus affichés.</p>
          <ul className="mt-2 list-disc pl-5">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </section>
  );
}
