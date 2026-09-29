"use client";

import { ArrowRight, Banknote, FileUp, LockKeyhole, Search, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, RequestError } from "../../lib/api";
import { formatFcfa, XAF_NOTES } from "../../lib/money";
import { paths } from "../../lib/session";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { Field } from "../ui/field";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";

type Source = { id: string; name: string; type: string; balanceMinor?: string };
type SessionPayload = {
  session: null | { id: string; status: string; businessDate: string; shopId: string; shopName: string; managerName: string; openedAt: string };
  operations?: { sales: Array<{ id: string; reference: string; netMinor: string; postedAt: string }>; expenses: Array<{ id: string; description: string; amountMinor: string; status: string; category: string }> };
  sources?: Source[];
  closures?: Array<{ accountId: string; declaredMinor: string; expectedMinor: string; varianceMinor: string; submittedAt: string; source?: string }>;
};
type SessionRow = { id: string; status: string; shopName: string; managerName: string; businessDate: string; openedAt: string; closedAt: string | null; varianceMinor?: string; declaredMinor?: string; expectedMinor?: string };
type ExpenseRow = { id: string; shopName: string; managerName: string; category: string; description: string; amountMinor: string; status: string; source: string; createdAt: string };
type TransferRow = { id: string; purpose: string; state: string; reason: string; shopName: string | null; source: string; destination: string; amountSentMinor: string; amountReceivedMinor: string; remainingMinor: string; createdAt: string; receipts: Array<{ id: string; amountMinor: string; receivedAt: string }> };
type Account = { id: string; name: string; type: string; shopName: string; balanceMinor?: string };

const expenseLabels: Record<string, string> = { RENT: "Loyer", UTILITIES: "Charges", TRANSPORT: "Transport", SUPPLIES: "Fournitures", OTHER: "Autre" };
const expenseStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  DRAFT: { label: "Brouillon", tone: "neutral" },
  REQUESTED: { label: "En attente", tone: "warning" },
  AUTHORIZED: { label: "Autorisée", tone: "info" },
  POSTED: { label: "Décaissée", tone: "success" },
  IRREGULAR: { label: "À régulariser", tone: "danger" },
  REJECTED: { label: "Refusée", tone: "danger" },
};
const transferState: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  DRAFT: { label: "Préparée", tone: "neutral" },
  SENT: { label: "En transit", tone: "info" },
  PARTIAL: { label: "Réception partielle", tone: "warning" },
  RECEIVED: { label: "Reçue", tone: "success" },
};
const sessionStatus: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "info" }> = {
  OPEN: { label: "Ouverte", tone: "success" },
  COUNTING: { label: "Comptage en cours", tone: "warning" },
  CLOSED: { label: "Clôturée", tone: "neutral" },
};

function leakCheck(value: unknown) {
  return JSON.stringify(value).includes("expectedMinor") || JSON.stringify(value).includes("balanceMinor");
}

function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

async function filePayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { sha256, base64: btoa(binary) };
}

export function ManagerCashPage() {
  const router = useRouter();
  const [data, setData] = useState<SessionPayload | null>(null);
  const [history, setHistory] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const load = () => {
    setError(null);
    Promise.all([api<SessionPayload>("/api/v1/cash-sessions/current"), api<{ sessions: SessionRow[] }>("/api/v1/cash-sessions")])
      .then(([current, listed]) => { setData(current); setHistory(listed.sessions); })
      .catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, []);
  const session = data?.session;
  const filtered = (history ?? []).filter((row) => `${row.businessDate} ${row.status}`.toLowerCase().includes(query.toLowerCase()));
  if (!data && !error) return <Skeleton className="h-[32rem]" />;
  if (!data && error) return <section className="space-y-6"><PageHeader title="Caisse du jour">Consultez la session et les opérations de la journée.</PageHeader><Alert tone="error">{error}</Alert><div className="rounded-xl bg-[var(--surface)] p-6 text-center shadow-[var(--shadow-card)]"><h2 className="font-display text-lg font-semibold">Impossible de charger la caisse</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">Vérifiez la connexion au serveur, puis réessayez. Aucune information de session n’a été déduite de cet échec.</p><Button className="mt-4" onClick={load}>Réessayer</Button></div></section>;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Caisse du jour" action={session?.status === "OPEN" ? <Button onClick={() => router.push(paths.managerCashCount)}>Commencer le comptage</Button> : undefined}>
        {session ? `${session.shopName} · activité du ${formatBusinessDate(session.businessDate)}` : "Ouvrez une session pour rattacher les opérations de la journée."}
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!session ? (
        <EmptyState title="Aucune session ouverte" icon={<Banknote className="size-5" />} action={<Button disabled={pending} onClick={() => { setPending(true); api("/api/v1/cash-sessions/open", { method: "POST" }).then(() => load()).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>{pending ? "Ouverture…" : "Ouvrir la session"}</Button>}>
          La session relie ventes, dépenses et mouvements à cette boutique. Aucun montant théorique n’est affiché avant le comptage de fin de journée.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <p className="text-sm text-[var(--muted)]">Boutique</p>
              <p className="mt-1 font-display text-lg font-semibold">{session.shopName}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Gérant {session.managerName}</p>
            </article>
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <p className="text-sm text-[var(--muted)]">Date d’activité</p>
              <p className="mt-1 font-display text-lg font-semibold">{formatBusinessDate(session.businessDate)}</p>
              <div className="mt-2"><Badge tone={sessionStatus[session.status]?.tone ?? "neutral"}>{sessionStatus[session.status]?.label ?? session.status}</Badge></div>
            </article>
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <p className="text-sm text-[var(--muted)]">Sources à compter</p>
              <p className="mt-1 font-display text-lg font-semibold">{data?.sources?.length ?? 0}</p>
              <p className="mt-2 text-sm text-[var(--muted)]">Les soldes attendus restent masqués jusqu’à votre déclaration.</p>
            </article>
          </div>
          {session.status === "COUNTING" ? <Alert>Le comptage est en cours. Les ventes et décaissements sont suspendus jusqu’à l’enregistrement ou l’annulation.</Alert> : null}
          {session.status === "COUNTING" ? (
            <div className="flex flex-wrap items-center gap-3"><Button onClick={() => router.push(paths.managerCashCount)}>Reprendre le comptage</Button><p className="text-sm text-[var(--muted)]">Les dépenses et mouvements reprendront après l’enregistrement ou l’annulation du comptage.</p></div>
          ) : (
            <div className="flex flex-wrap gap-2"><Link href={paths.managerExpenses}><Button variant="secondary">Demander une dépense</Button></Link><Link href={paths.managerFunds}><Button variant="secondary">Mouvement de fonds</Button></Link></div>
          )}
          <section className="grid gap-4 xl:grid-cols-2">
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-display font-semibold">Ventes enregistrées</h2>
              <ul className="mt-3 divide-y divide-[var(--separator)]/60">{(data?.operations?.sales ?? []).map((sale) => <li key={sale.id} className="flex justify-between gap-3 py-3 text-sm"><span>{sale.reference}</span><strong className="tabular-nums">{formatFcfa(sale.netMinor)}</strong></li>)}</ul>
              {(data?.operations?.sales ?? []).length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">Aucune vente confirmée sur cette session.</p> : null}
            </article>
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-display font-semibold">Dépenses de la session</h2>
              <ul className="mt-3 divide-y divide-[var(--separator)]/60">{(data?.operations?.expenses ?? []).map((item) => <li key={item.id} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate">{item.description}</span><span className="shrink-0 tabular-nums">{formatFcfa(item.amountMinor)}</span></li>)}</ul>
              {(data?.operations?.expenses ?? []).length === 0 ? <p className="py-6 text-sm text-[var(--muted)]">Aucune dépense saisie pour le moment.</p> : null}
            </article>
          </section>
        </>
      )}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-lg font-semibold">Sessions récentes</h2>
          <label className="relative block w-full sm:max-w-xs"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher une session</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Date ou état" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
        </div>
        {!history ? <Skeleton className="h-40" /> : filtered.length === 0 ? <EmptyState title="Aucune session correspondante">Les sessions clôturées de cette boutique apparaîtront ici.</EmptyState> : (
          <ul className="grid gap-3 xl:hidden">{filtered.map((row) => <li key={row.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{formatBusinessDate(row.businessDate)}</p><p className="mt-1 text-sm text-[var(--muted)]">{sessionStatus[row.status]?.label}</p>{row.status === "CLOSED" && row.declaredMinor ? <p className="mt-2 tabular-nums">{formatFcfa(row.declaredMinor)}</p> : null}</li>)}</ul>
        )}
        {history && filtered.length > 0 ? (
          <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] xl:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface)] text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">État</th><th className="px-5 py-3 font-medium">Ouverture</th><th className="px-5 py-3 text-right font-medium">Déclaré</th></tr></thead>
              <tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-3">{formatBusinessDate(row.businessDate)}</td><td className="px-5 py-3"><Badge tone={sessionStatus[row.status]?.tone ?? "neutral"}>{sessionStatus[row.status]?.label ?? row.status}</Badge></td><td className="px-5 py-3 text-[var(--muted)]">{new Date(row.openedAt).toLocaleString("fr-FR")}</td><td className="px-5 py-3 text-right tabular-nums">{row.status === "CLOSED" && row.declaredMinor ? formatFcfa(row.declaredMinor) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}

export function ManagerCountPage() {
  const router = useRouter();
  const [data, setData] = useState<SessionPayload | null>(null);
  const [counts, setCounts] = useState<Record<string, Record<string, string>>>({});
  const [declared, setDeclared] = useState<Record<string, string>>({});
  const [confirmedEmpty, setConfirmedEmpty] = useState<Record<string, boolean>>({});
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<SessionPayload["closures"] | null>(null);
  useEffect(() => {
    api<SessionPayload>("/api/v1/cash-sessions/current").then((payload) => {
      if (payload.session && leakCheck({ sources: payload.sources, closures: payload.closures }) && payload.session.status !== "CLOSED") {
        setError("Les montants attendus ne doivent pas être visibles avant le comptage.");
      }
      setData(payload);
      if (payload.session?.status === "OPEN") {
        api(`/api/v1/cash-sessions/${payload.session.id}/start-count`, { method: "POST" }).then(() => api<SessionPayload>("/api/v1/cash-sessions/current").then(setData)).catch((caught: RequestError) => setError(caught.message));
      }
    }).catch((caught: RequestError) => setError(caught.message));
  }, []);
  const session = data?.session;
  const sources = data?.sources ?? [];
  const declaredTotal = (source: Source) => {
    if (source.type !== "CASH") return declared[source.id] ?? "0";
    return XAF_NOTES.reduce((sum, note) => sum + BigInt(note.valueMinor) * BigInt(counts[source.id]?.[note.valueMinor] || "0"), 0n).toString();
  };
  const grandTotal = sources.reduce((sum, source) => sum + BigInt(declaredTotal(source)), 0n).toString();
  const isCounted = (source: Source) => BigInt(declaredTotal(source)) > 0n || confirmedEmpty[source.id] === true;
  const completedSources = sources.filter(isCounted).length;
  const allSourcesCounted = sources.length > 0 && completedSources === sources.length;
  const submit = () => {
    if (!session) return;
    setPending(true); setError(null);
    const lines = sources.map((source) => source.type === "CASH"
      ? { accountId: source.id, denominations: XAF_NOTES.map((note) => ({ valueMinor: note.valueMinor, quantity: Number(counts[source.id]?.[note.valueMinor] || "0") })), confirmedEmpty: confirmedEmpty[source.id] === true, explanation: explanation || undefined }
      : { accountId: source.id, declaredMinor: declared[source.id] || "0", confirmedEmpty: confirmedEmpty[source.id] === true, explanation: explanation || undefined });
    api<{ closures: NonNullable<SessionPayload["closures"]> }>(`/api/v1/cash-sessions/${session.id}/submit-count`, { method: "POST", body: JSON.stringify({ lines }) })
      .then((payload) => { setResult(payload.closures); setConfirm(false); })
      .catch((caught: RequestError) => setError(caught.message))
      .finally(() => setPending(false));
  };
  if (!data && !error) return <Skeleton className="h-[32rem]" />;
  if (result && session) {
    return (
      <section className="mx-auto max-w-3xl space-y-5 overflow-x-clip">
        <PageHeader title="Résultat de clôture">{session.shopName} · {session.businessDate}</PageHeader>
        <Alert tone="success">La première déclaration est enregistrée. L’écart est calculé par le serveur et ne peut plus être modifié silencieusement.</Alert>
        <ul className="space-y-3">{result.map((row) => <li key={row.accountId} className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.source ?? "Source"}</p><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-[var(--muted)]">Déclaré</dt><dd className="tabular-nums font-semibold">{formatFcfa(row.declaredMinor)}</dd></div><div><dt className="text-[var(--muted)]">Attendu</dt><dd className="tabular-nums font-semibold">{formatFcfa(row.expectedMinor)}</dd></div><div><dt className="text-[var(--muted)]">Écart</dt><dd className="tabular-nums font-semibold">{formatFcfa(row.varianceMinor)}</dd></div></dl></li>)}</ul>
        <div className="flex flex-wrap gap-2"><Link href={paths.managerCash}><Button>Retour à la caisse</Button></Link><Button variant="secondary" onClick={() => api("/api/v1/cash-sessions/open", { method: "POST" }).then(() => router.replace(paths.managerCash)).catch((caught: RequestError) => setError(caught.message))}>Ouvrir la session suivante</Button></div>
      </section>
    );
  }
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Comptage de fin de journée" action={session ? <Button variant="ghost" onClick={() => api(`/api/v1/cash-sessions/${session.id}/cancel-count`, { method: "POST", body: JSON.stringify({ reason: "Reprise des opérations" }) }).then(() => router.push(paths.managerCash)).catch((caught: RequestError) => setError(caught.message))}>Annuler le comptage</Button> : undefined}>
        {session ? `Déclarez le montant réellement présent pour ${session.shopName}, session du ${formatBusinessDate(session.businessDate)}. La première déclaration est définitive.` : "Aucune session à clôturer."}
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!session ? <EmptyState title="Session introuvable" action={<Link href={paths.managerCash}><Button>Retour à la caisse</Button></Link>}>Ouvrez d’abord une session de caisse.</EmptyState> : (
        <>
          <Alert>Comptez tout l’argent physiquement présent dans chaque source, y compris le fonds de caisse conservé des jours précédents. Le montant attendu reste masqué pour préserver le comptage aveugle.</Alert>
          <div className="space-y-5 pb-24">{sources.map((source) => (
            <article key={source.id} className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-display text-lg font-semibold">{source.name}</h2><p className="text-sm text-[var(--muted)]">{source.type === "CASH" ? `Espèces rattachées à ${session.shopName} · indiquez le nombre de coupures.` : `Source rattachée à ${session.shopName} · indiquez le solde réellement constaté.`}</p></div>
                <div className="text-right"><p className="tabular-nums font-display text-xl font-semibold">{formatFcfa(declaredTotal(source))}</p><Badge tone={isCounted(source) ? "success" : "warning"}>{isCounted(source) ? "Comptée" : "Non comptée"}</Badge></div>
              </div>
              {source.type === "CASH" ? (
                <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{XAF_NOTES.map((note) => {
                  const quantity = counts[source.id]?.[note.valueMinor] ?? "";
                  const subtotal = (BigInt(note.valueMinor) * BigInt(quantity || "0")).toString();
                  return <li key={note.valueMinor} className="grid grid-cols-[minmax(5.5rem,auto)_5rem_1fr] items-center gap-2 rounded-lg bg-[var(--surface-subtle)] px-3 py-2">
                    <label htmlFor={`${source.id}-${note.valueMinor}`} className="text-sm font-medium">{note.label} FCFA</label>
                    <input id={`${source.id}-${note.valueMinor}`} aria-label={`${note.label} FCFA`} inputMode="numeric" placeholder="0" value={quantity} onChange={(event) => { const value = event.target.value.replace(/\D/g, ""); setCounts((current) => ({ ...current, [source.id]: { ...current[source.id], [note.valueMinor]: value } })); if (value && value !== "0") setConfirmedEmpty((current) => ({ ...current, [source.id]: false })); }} className="h-10 min-w-0 rounded-md bg-[var(--surface)] px-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-[var(--focus)]" />
                    <span className="text-right text-xs tabular-nums text-[var(--muted)]">{formatFcfa(subtotal)}</span>
                  </li>;
                })}</ul>
              ) : <div className="mt-4 max-w-sm"><Field id={`declared-${source.id}`} label="Montant constaté" inputMode="numeric" value={declared[source.id] ?? ""} onChange={(event) => { const value = event.target.value.replace(/\D/g, ""); setDeclared((current) => ({ ...current, [source.id]: value })); if (value && value !== "0") setConfirmedEmpty((current) => ({ ...current, [source.id]: false })); }} /></div>}
              {BigInt(declaredTotal(source)) === 0n ? <label className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--surface-subtle)] p-3 text-sm"><input className="mt-0.5" type="checkbox" checked={confirmedEmpty[source.id] === true} onChange={(event) => setConfirmedEmpty((current) => ({ ...current, [source.id]: event.target.checked }))} /><span><strong>Confirmer que cette source est vide</strong><span className="mt-0.5 block text-[var(--muted)]">Cochez uniquement après avoir vérifié physiquement qu’aucun fonds n’est présent.</span></span></label> : null}
            </article>
          ))}
          <Field id="count-explanation" label="Observation (facultative ; obligatoire si un écart est détecté)" value={explanation} onChange={(event) => setExplanation(event.target.value)} />
          </div>
          <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] ring-1 ring-[var(--separator)]/40 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm text-[var(--muted)]">{completedSources}/{sources.length} sources comptées</p><p className="font-display text-xl font-semibold tabular-nums">{formatFcfa(grandTotal)}</p>{!allSourcesCounted ? <p className="text-xs text-[var(--destructive)]">Terminez chaque source ou confirmez explicitement qu’elle est vide.</p> : null}</div>
            <Button className="w-full sm:w-auto" disabled={!allSourcesCounted} onClick={() => setConfirm(true)}>Vérifier et enregistrer</Button>
          </div>
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Confirmer la première déclaration" confirmLabel="Enregistrer définitivement" pending={pending} onConfirm={submit}>
            <p>Vous déclarez les montants réellement présents. Cette saisie sera conservée telle quelle. Un écart éventuel sera calculé ensuite par le serveur.</p>
          </ConfirmDialog>
        </>
      )}
    </section>
  );
}

export function ManagerExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cash, setCash] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [withoutReceipt, setWithoutReceipt] = useState(false);
  const [form, setForm] = useState({ category: "SUPPLIES", description: "", amountMinor: "", accountId: "", beneficiary: "", receiptExceptionReason: "" });
  const load = () => {
    Promise.all([api<{ expenses: ExpenseRow[] }>("/api/v1/expenses"), api<{ accounts: Account[] }>("/api/v1/fund-accounts"), api<SessionPayload>("/api/v1/cash-sessions/current")])
      .then(([listed, funds, current]) => { setRows(listed.expenses); setAccounts(funds.accounts); setCash(current); if (!form.accountId && funds.accounts[0]) setForm((currentForm) => ({ ...currentForm, accountId: funds.accounts[0]!.id })); })
      .catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, []);
  const filtered = (rows ?? []).filter((row) => (status === "ALL" || row.status === status) && `${row.description} ${row.category}`.toLowerCase().includes(query.toLowerCase()));
  const submit = async () => {
    setPending(true); setError(null);
    try {
      const attachmentIds: string[] = [];
      if (receipt) {
        const payload = await filePayload(receipt);
        const created = await api<{ id: string }>("/api/v1/attachments", { method: "POST", body: JSON.stringify({ documentType: "expenses", mime: receipt.type, size: receipt.size, name: receipt.name, sha256: payload.sha256 }) });
        await api(`/api/v1/attachments/${created.id}/content`, { method: "POST", body: JSON.stringify({ base64: payload.base64 }) });
        attachmentIds.push(created.id);
      }
      const body = { ...form, beneficiary: form.beneficiary || undefined, receiptExceptionReason: withoutReceipt ? form.receiptExceptionReason : undefined, attachmentIds };
      const created = await api<{ id: string }>("/api/v1/expenses", { method: "POST", body: JSON.stringify(body) });
      await api(`/api/v1/expenses/${created.id}/submit`, { method: "POST" });
      setForm((current) => ({ ...current, description: "", amountMinor: "", beneficiary: "", receiptExceptionReason: "" }));
      setReceipt(null); setWithoutReceipt(false); load();
    } catch (caught) { setError(caught instanceof RequestError ? caught.message : "Le justificatif n’a pas pu être préparé."); }
    finally { setPending(false); }
  };
  const blocked = cash?.session?.status === "COUNTING";
  const hasOpenSession = cash?.session?.status === "OPEN";
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Dépenses">Créez une demande, suivez l’autorisation, puis décaissiez uniquement après accord. L’autorisation n’est pas un mouvement de fonds.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {blocked ? <Alert><span className="inline-flex items-center gap-2"><LockKeyhole className="size-4" />Le comptage est en cours. Les nouvelles demandes et les décaissements reprendront après son enregistrement ou son annulation.</span></Alert> : null}
      {!blocked && cash && !hasOpenSession ? <Alert>Ouvrez d’abord la caisse du jour pour créer une demande de dépense.</Alert> : null}
      {!blocked && hasOpenSession ? <form className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2 className="font-display font-semibold">Nouvelle demande</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">Catégorie<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]">{Object.entries(expenseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block text-sm font-medium">Source de fonds<select value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <Field id="expense-amount" label="Montant (FCFA)" inputMode="numeric" value={form.amountMinor} onChange={(event) => setForm((current) => ({ ...current, amountMinor: event.target.value.replace(/\D/g, "") }))} />
          <Field id="expense-beneficiary" label="Bénéficiaire (facultatif)" value={form.beneficiary} onChange={(event) => setForm((current) => ({ ...current, beneficiary: event.target.value }))} />
          <div className="md:col-span-2"><Field id="expense-description" label="Motif de la dépense" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
          <div className="md:col-span-2 rounded-lg bg-[var(--surface-subtle)] p-4">
            <label className="flex cursor-pointer items-center gap-3 font-medium"><FileUp className="size-5 text-[var(--primary)]" /><span>{receipt?.name ?? "Ajouter un justificatif (PDF ou image)"}</span><input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { setReceipt(event.target.files?.[0] ?? null); setWithoutReceipt(false); }} /></label>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={withoutReceipt} onChange={(event) => { setWithoutReceipt(event.target.checked); if (event.target.checked) setReceipt(null); }} />Je n’ai pas de justificatif</label>
            {withoutReceipt ? <div className="mt-3"><Field id="expense-receipt" label="Motif de l’absence de justificatif" value={form.receiptExceptionReason} onChange={(event) => setForm((current) => ({ ...current, receiptExceptionReason: event.target.value }))} /></div> : null}
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">Sera enregistré : {form.amountMinor ? formatFcfa(form.amountMinor) : "montant à préciser"} · {expenseLabels[form.category]}.</p>
        <Button type="submit" className="mt-4" disabled={pending || !form.amountMinor || !form.description || !form.accountId || (!receipt && (!withoutReceipt || form.receiptExceptionReason.trim().length < 5))}>{pending ? "Envoi…" : "Enregistrer la demande"}</Button>
      </form> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher une dépense</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg bg-[var(--surface)] px-3 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" aria-label="Filtrer par état"><option value="ALL">Tous les états</option>{Object.entries(expenseStatus).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select>
      </div>
      {!rows ? <Skeleton className="h-48" /> : filtered.length === 0 ? <EmptyState title="Aucune dépense" icon={<WalletCards className="size-5" />}>Les demandes de cette boutique apparaîtront ici.</EmptyState> : (
        <ul className="grid gap-3">{filtered.map((row) => (
          <li key={row.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="font-semibold">{row.description}</p><p className="mt-1 text-sm text-[var(--muted)]">{expenseLabels[row.category]} · {row.source}</p></div>
              <div className="text-right"><p className="tabular-nums font-semibold">{formatFcfa(row.amountMinor)}</p><div className="mt-1"><Badge tone={expenseStatus[row.status]?.tone ?? "neutral"}>{expenseStatus[row.status]?.label ?? row.status}</Badge></div></div>
            </div>
            {row.status === "AUTHORIZED" ? <Button className="mt-3" variant="secondary" disabled={blocked} onClick={() => api(`/api/v1/expenses/${row.id}/pay`, { method: "POST" }).then(() => load()).catch((caught: RequestError) => setError(caught.message))}>{blocked ? "Décaissement suspendu" : "Décaisser réellement"}</Button> : null}
          </li>
        ))}</ul>
      )}
    </section>
  );
}

export function ManagerFundsPage() {
  const [rows, setRows] = useState<TransferRow[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cash, setCash] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [form, setForm] = useState({ sourceAccountId: "", destinationAccountId: "", amountMinor: "", reason: "" });
  const load = () => {
    Promise.all([api<{ transfers: TransferRow[] }>("/api/v1/fund-transfers"), api<{ accounts: Account[] }>("/api/v1/fund-accounts"), api<SessionPayload>("/api/v1/cash-sessions/current")])
      .then(([listed, funds, current]) => { setRows(listed.transfers); setAccounts(funds.accounts); setCash(current); })
      .catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, []);
  const blocked = cash?.session?.status === "COUNTING";
  const hasOpenSession = cash?.session?.status === "OPEN";
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Mouvements de fonds">Une remise sort de la caisse vers le transit. La réception crédite la destination sans créer ni détruire d’argent.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {blocked ? <Alert><span className="inline-flex items-center gap-2"><LockKeyhole className="size-4" />Le comptage est en cours. Aucun fonds ne peut sortir ni être réceptionné avant sa fin.</span></Alert> : null}
      {!blocked && cash && !hasOpenSession ? <Alert>Ouvrez d’abord la caisse du jour pour effectuer un mouvement de fonds.</Alert> : null}
      {!blocked && hasOpenSession ? <form className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]" onSubmit={(event) => { event.preventDefault(); setPending(true); api<{ id: string }>("/api/v1/fund-transfers", { method: "POST", body: JSON.stringify({ ...form, purpose: "REMITTANCE" }) }).then((created) => api(`/api/v1/fund-transfers/${created.id}/send`, { method: "POST" })).then(() => { setForm({ sourceAccountId: "", destinationAccountId: "", amountMinor: "", reason: "" }); return load(); }).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>
        <h2 className="font-display font-semibold">Remise de fonds</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">Source<select required value={form.sourceAccountId} onChange={(event) => setForm((current) => ({ ...current, sourceAccountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Destination<select required value={form.destinationAccountId} onChange={(event) => setForm((current) => ({ ...current, destinationAccountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir</option>{accounts.filter((account) => account.id !== form.sourceAccountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <Field id="fund-amount" label="Montant (FCFA)" inputMode="numeric" value={form.amountMinor} onChange={(event) => setForm((current) => ({ ...current, amountMinor: event.target.value.replace(/\D/g, "") }))} />
          <Field id="fund-reason" label="Motif" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
        </div>
        <Button type="submit" className="mt-4" disabled={pending || !form.amountMinor || !form.reason}>{pending ? "Envoi…" : "Remettre les fonds"}</Button>
      </form> : null}
      {!rows ? <Skeleton className="h-48" /> : rows.length === 0 ? <EmptyState title="Aucun mouvement" icon={<Banknote className="size-5" />}>Les remises et réceptions de cette boutique apparaîtront ici.</EmptyState> : (
        <ul className="grid gap-3">{rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{row.source} → {row.destination}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.reason}</p></div>
              <div className="text-right"><p className="tabular-nums font-semibold">{formatFcfa(row.amountSentMinor)}</p><Badge tone={transferState[row.state]?.tone ?? "neutral"}>{transferState[row.state]?.label ?? row.state}</Badge></div>
            </div>
            {["SENT", "PARTIAL"].includes(row.state) ? <p className="mt-2 text-sm text-[var(--muted)]">Reste en transit : {formatFcfa(row.remainingMinor)}</p> : null}
            {["SENT", "PARTIAL"].includes(row.state) ? <Button className="mt-3" variant="secondary" disabled={blocked} onClick={() => { setReceiveId(row.id); setReceiveAmount(row.remainingMinor); }}>{blocked ? "Réception suspendue" : "Confirmer une réception"}</Button> : null}
          </li>
        ))}</ul>
      )}
      <ConfirmDialog open={Boolean(receiveId)} onOpenChange={(open) => { if (!open) setReceiveId(null); }} title="Réception des fonds" confirmLabel="Enregistrer la réception" pending={pending} onConfirm={() => { if (!receiveId) return; setPending(true); api(`/api/v1/fund-transfers/${receiveId}/receive`, { method: "POST", body: JSON.stringify({ amountMinor: receiveAmount }) }).then(() => { setReceiveId(null); return load(); }).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>
        <Field id="receive-amount" label="Montant reçu (FCFA)" inputMode="numeric" value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value.replace(/\D/g, ""))} />
        <p className="mt-2 text-sm">Une réception partielle conserve le reliquat en transit.</p>
      </ConfirmDialog>
    </section>
  );
}

export function ManagerCashShortcuts() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Link href={paths.managerCash} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><Banknote className="size-5 text-[var(--primary)]" /><p className="mt-3 font-semibold">Caisse</p><p className="mt-1 text-sm text-[var(--muted)]">Session, opérations et clôture.</p></Link>
      <Link href={paths.managerExpenses} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><WalletCards className="size-5 text-[var(--primary)]" /><p className="mt-3 font-semibold">Dépenses</p><p className="mt-1 text-sm text-[var(--muted)]">Demander puis décaisser.</p></Link>
      <Link href={paths.managerFunds} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><ArrowRight className="size-5 text-[var(--primary)]" /><p className="mt-3 font-semibold">Fonds</p><p className="mt-1 text-sm text-[var(--muted)]">Remises et réceptions.</p></Link>
    </div>
  );
}

