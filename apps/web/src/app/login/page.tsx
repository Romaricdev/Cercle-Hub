"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useState } from "react";

import { api, loadCsrf } from "../../lib/api";
import { homePath, type MeResponse } from "../../lib/session";
import { BrandLogo } from "../../components/brand/logo";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { TotpQr } from "../../components/auth/totp-qr";
import { ThemeSwitcher } from "../../components/shell/theme-switcher";

function ConnexionForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [step, setStep] = useState<"login" | "mfa" | "enroll" | "recovery" | "reset" | "invite">(
    params.get("invitation") ? "invite" : params.get("step") === "mfa" ? "enroll" : params.get("reset") ? "reset" : "login",
  );
  const [message, setMessage] = useState(params.get("reason") === "session" ? "La session a expiré." : "");
  const [pending, setPending] = useState(false);
  const [invitePassword, setInvitePassword] = useState("");

  async function afterSession() {
    const me = await api<MeResponse>("/api/v1/me");
    if (me.next === "ENROLL_MFA") {
      setStep("enroll");
      return;
    }
    const returnTo = params.get("returnTo");
    const allowedReturn = returnTo && (returnTo.startsWith("/owner") || returnTo.startsWith("/manager") || returnTo.startsWith("/setup"));
    router.replace(allowedReturn ? returnTo : homePath(me));
  }

  async function onLogin(event: React.FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setMessage("");
    try {
      await loadCsrf();
      const result = await api<{ twoFactorRedirect?: boolean }>("/api/auth/sign-in/email", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (result.twoFactorRedirect) {
        setStep("mfa");
        return;
      }
      await afterSession();
    } catch {
      setMessage("Identifiants incorrects.");
    } finally {
      setPending(false);
    }
  }

  async function onChallenge(event: React.FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    try {
      const path = code.includes("-") || code.length > 8 ? "/api/auth/two-factor/verify-backup-code" : "/api/auth/two-factor/verify-totp";
      await api(path, { method: "POST", body: JSON.stringify({ code }) });
      await afterSession();
    } catch {
      setMessage("Le code est incorrect.");
    } finally {
      setPending(false);
    }
  }

  async function onEnroll(event: React.FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    try {
      if (!totpUri) {
        const enabled = await api<{ totpURI: string; backupCodes: string[] }>("/api/auth/two-factor/enable", {
          method: "POST",
          body: JSON.stringify({ password }),
        });
        setTotpUri(enabled.totpURI);
        setBackupCodes(enabled.backupCodes ?? []);
        return;
      }
      await api("/api/auth/two-factor/verify-totp", { method: "POST", body: JSON.stringify({ code }) });
      await afterSession();
    } catch {
      setMessage("L’activation du second facteur a échoué.");
    } finally {
      setPending(false);
    }
  }

  async function onRecover(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await loadCsrf();
      await api("/api/auth/forget-password", { method: "POST", body: JSON.stringify({ email, redirectTo: `${window.location.origin}/login` }) }).catch(() => undefined);
      setMessage("Si un compte existe, un message de récupération a été préparé.");
    } finally {
      setPending(false);
    }
  }

  async function onInvite(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await loadCsrf();
      await api("/api/v1/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: params.get("invitation"), password: invitePassword }),
      });
      setMessage("Le compte est activé. Connectez-vous.");
      setStep("login");
    } catch {
      setMessage("Cette invitation n’est plus valable.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-28 size-[28rem] rounded-full bg-[var(--auth-glow)] blur-3xl" />
        <div className="absolute -bottom-40 -right-28 size-[30rem] rounded-full bg-[var(--auth-accent-glow)] blur-3xl" />
        <div className="absolute inset-0 opacity-[0.025] [background-image:radial-gradient(var(--foreground)_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <BrandLogo official />
          <ThemeSwitcher />
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.08fr_0.92fr] lg:py-16">
          <motion.section
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="hidden max-w-xl lg:block"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[var(--surface)]/70 px-4 py-2 text-sm font-medium text-[var(--brand)] shadow-[var(--shadow-card)] backdrop-blur-xl">
              <Sparkles aria-hidden="true" className="size-4 text-[var(--primary)]" />
              Votre activité, enfin lisible
            </div>
            <h2 className="font-display text-5xl font-semibold leading-[1.08] tracking-[-0.035em] xl:text-6xl">
              Pilotez chaque boutique avec <span className="text-[var(--primary)]">confiance.</span>
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[var(--muted)]">
              Un espace sécurisé pour suivre vos équipes, vos appareils et, bientôt, toute l’activité de Cercle Complet.
            </p>
            <div className="mt-9 grid max-w-lg gap-3 sm:grid-cols-2">
              {[
                [ShieldCheck, "Accès sécurisés", "Chaque rôle garde son périmètre."],
                [CheckCircle2, "Données fiables", "Une trace claire de chaque action."],
              ].map(([Icon, title, description]) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(title)} className="rounded-3xl bg-[var(--surface)]/60 p-5 shadow-[var(--shadow-card)] backdrop-blur-xl">
                    <FeatureIcon aria-hidden="true" className="mb-4 size-6 text-[var(--primary)]" />
                    <p className="font-display font-semibold">{String(title)}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{String(description)}</p>
                  </div>
                );
              })}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 22, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[31rem] rounded-[2rem] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-6 shadow-[var(--shadow-float)] backdrop-blur-xl sm:p-9"
          >
            <div className="mb-8">
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface))] text-[var(--primary)] lg:hidden">
                <LockKeyhole aria-hidden="true" className="size-6" />
              </div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Espace sécurisé</p>
              <h1 className="font-display text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">Bon retour parmi nous</h1>
              <p className="mt-3 text-[var(--muted)]">Connectez-vous pour accéder à votre espace de gestion.</p>
            </div>
        {message ? (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
            <Alert tone="error">{message}</Alert>
          </motion.div>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
        {step === "login" ? (
          <motion.form key="login" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }} className="space-y-5" onSubmit={(event) => void onLogin(event)}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--muted)]" />
                <Input className="pl-12" id="email" name="email" type="email" autoComplete="username" placeholder="vous@exemple.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--muted)]" />
                <Input className="pl-12" id="password" name="password" type="password" autoComplete="current-password" placeholder="Votre mot de passe" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={pending} className="mt-2 w-full rounded-2xl">
              {pending ? "Connexion…" : <>Se connecter <ArrowRight aria-hidden="true" className="size-5" /></>}
            </Button>
            <Button variant="ghost" className="w-full text-sm text-[var(--muted)]" onClick={() => setStep("recovery")}>
              Mot de passe oublié
            </Button>
          </motion.form>
        ) : null}

        {step === "mfa" ? (
          <motion.form key="mfa" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4" onSubmit={(event) => void onChallenge(event)}>
            <div>
              <Label htmlFor="totp">Code d’authentification ou de secours</Label>
              <Input id="totp" inputMode="text" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              Valider le code
            </Button>
          </motion.form>
        ) : null}

        {step === "enroll" ? (
          <motion.form key="enroll" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4" onSubmit={(event) => void onEnroll(event)}>
            <p>Le propriétaire doit activer le second facteur avant d’accéder aux données.</p>
            {totpUri ? (
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted)]">Scannez le QR, puis saisissez le code à 6 chiffres. Conservez les codes de secours hors de cet écran.</p>
                <TotpQr uri={totpUri} />
                <details>
                  <summary className="cursor-pointer text-sm text-[var(--muted)]">Saisir la clé manuellement</summary>
                  <p data-testid="totp-uri" className="mt-2 break-all text-sm">{totpUri}</p>
                </details>
                {backupCodes.length ? (
                  <ul data-testid="backup-codes" className="list-disc space-y-1 pl-5 text-sm">
                    {backupCodes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                <Label htmlFor="enroll-code">Code TOTP</Label>
                <Input id="enroll-code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
            ) : (
              <div>
                <Label htmlFor="enroll-password">Confirmez le mot de passe</Label>
                <Input id="enroll-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {totpUri ? "Confirmer" : "Afficher le secret"}
            </Button>
          </motion.form>
        ) : null}

        {step === "recovery" ? (
          <motion.form key="recovery" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4" onSubmit={(event) => void onRecover(event)}>
            <div>
              <Label htmlFor="recovery-email">E-mail</Label>
              <Input id="recovery-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              Envoyer le lien
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep("login")}>
              Retour
            </Button>
          </motion.form>
        ) : null}

        {step === "invite" ? (
          <motion.form key="invite" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4" onSubmit={(event) => void onInvite(event)}>
            <div>
              <Label htmlFor="invite-password">Nouveau mot de passe</Label>
              <Input id="invite-password" type="password" autoComplete="new-password" minLength={15} required value={invitePassword} onChange={(event) => setInvitePassword(event.target.value)} />
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              Activer le compte
            </Button>
          </motion.form>
        ) : null}
        </AnimatePresence>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
              <ShieldCheck aria-hidden="true" className="size-4 text-[var(--success)]" />
              Connexion protégée · Cercle Complet Sarl
            </div>
          </motion.section>
        </div>
      </div>
    </main>
  );
}

export default function ConnexionPage() {
  return (
    <Suspense fallback={<p className="p-6">Chargement…</p>}>
      <ConnexionForm />
    </Suspense>
  );
}
