"use client";

import { FileUp, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, RequestError } from "../../lib/api";
import { formatFcfa } from "../../lib/money";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { Field } from "../ui/field";
import { Modal } from "../ui/modal";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";

type SessionRow = { id: string; status: string; shopName: string; managerName: string; businessDate: string; openedAt: string; closedAt: string | null; varianceMinor?: string; declaredMinor?: string; expectedMinor?: string };
type SessionDetail = {
  id: string; status: string; shop: { id: string; name: string }; managerName: string; businessDate: string; openedAt: string; closedAt: string | null;
  closures: Array<{ id: string; source: string; declaredMinor: string; expectedMinor: string; varianceMinor: string; explanation: string | null }>;
  sales: Array<{ id: string; reference: string; netMinor: string; postedAt: string }>;
  expenses: Array<{ id: string; description: string; amountMinor: string; status: string }>;
  discrepancies: Array<{ id: string; state: string; residualAmountMinor: string }>;
};
type ExpenseRow = { id: string; shopName: string; managerName: string; category: string; description: string; amountMinor: string; status: string; source: string; createdAt: string };
type TransferRow = { id: string; purpose: string; state: string; reason: string; shopName: string | null; source: string; destination: string; amountSentMinor: string; amountReceivedMinor: string; remainingMinor: string; createdAt: string };
type Account = { id: string; name: string; type: string; shopId: string | null; shopName: string; balanceMinor?: string };
type Shop = { id: string; name: string };
type CaseRow = { id: string; type: string; state: string; shopName: string | null; source: string | null; originalAmountMinor: string; residualAmountMinor: string; expectedMinor: string | null; declaredMinor: string | null; createdAt: string };
type CaseDetail = CaseRow & { sessionId: string | null; ownerDecision: string | null; resolvedAt: string | null; actions: Array<{ id: string; type: string; text: string; actor: string; at: string }> };

const statusTone = (status: string) => status === "CLOSED" ? "neutral" : status === "COUNTING" ? "warning" : "success";
const expenseTone = (status: string): "neutral" | "success" | "warning" | "danger" | "info" => ({ DRAFT: "neutral", REQUESTED: "warning", AUTHORIZED: "info", POSTED: "success", IRREGULAR: "danger", REJECTED: "danger" } as const)[status] ?? "neutral";
const expenseLabel: Record<string, string> = { DRAFT: "Brouillon", REQUESTED: "À valider", AUTHORIZED: "Autorisée", POSTED: "Décaissée", IRREGULAR: "À régulariser", REJECTED: "Refusée" };
const purposeLabel: Record<string, string> = { REMITTANCE: "Remise", FLOAT: "Fonds de caisse", OWNER_CONTRIBUTION: "Apport", WITHDRAWAL: "Retrait" };
const caseState: Record<string, string> = { OPEN: "À examiner", NEEDS_INFO: "Information demandée", RESOLVED: "Résolu" };
const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
const varianceClass = (value?: string | null) => value && BigInt(value) !== 0n ? "text-[var(--destructive)]" : "text-[var(--success)]";

async function filePayload(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { sha256, base64: btoa(binary) };
}

export function OwnerSessionsPage() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ shops: Shop[] }>("/api/v1/shops").then((data) => setShops(data.shops)).catch((caught: RequestError) => setError(caught.message)); }, []);
  useEffect(() => { api<{ sessions: SessionRow[] }>(`/api/v1/owner/cash-sessions${shopId ? `?shopId=${shopId}` : ""}`).then((data) => setRows(data.sessions)).catch((caught: RequestError) => setError(caught.message)); }, [shopId]);
  const filtered = (rows ?? []).filter((row) => `${row.shopName} ${row.managerName} ${row.businessDate}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Sessions de caisse">Consultez les ouvertures, clôtures et écarts par boutique. Les montants attendus sont visibles ici, jamais au gérant avant sa déclaration.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative block flex-1"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher une session</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Boutique, gérant ou date" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
        <select aria-label="Filtrer par boutique" value={shopId} onChange={(event) => setShopId(event.target.value)} className="h-11 rounded-lg bg-[var(--surface)] px-3 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Toutes les boutiques</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select>
      </div>
      {!rows ? <Skeleton className="h-64" /> : filtered.length === 0 ? <EmptyState title="Aucune session">Les sessions apparaîtront dès l’ouverture d’une caisse.</EmptyState> : (
        <>
          <ul className="grid gap-3 xl:hidden">{filtered.map((row) => <li key={row.id}><Link href={`/owner/sessions/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.shopName}</p><p className="mt-1 text-sm text-[var(--muted)]">{formatDate(row.businessDate)} · {row.managerName}</p></div><Badge tone={statusTone(row.status)}>{row.status === "CLOSED" ? "Clôturée" : row.status === "COUNTING" ? "Comptage" : "Ouverte"}</Badge></div><p className={`mt-3 tabular-nums font-semibold ${varianceClass(row.varianceMinor)}`}>{row.expectedMinor ? `Écart ${formatFcfa(row.varianceMinor ?? "0")}` : "Comptage non déposé"}</p></Link></li>)}</ul>
          <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] xl:block">
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Boutique</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Gérant</th><th className="px-5 py-3 font-medium">État</th><th className="px-5 py-3 text-right font-medium">Déclaré</th><th className="px-5 py-3 text-right font-medium">Attendu</th><th className="px-5 py-3 text-right font-medium">Écart</th></tr></thead>
              <tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-3"><Link className="font-semibold text-[var(--primary)]" href={`/owner/sessions/${row.id}`}>{row.shopName}</Link></td><td className="px-5 py-3">{formatDate(row.businessDate)}</td><td className="px-5 py-3">{row.managerName}</td><td className="px-5 py-3"><Badge tone={statusTone(row.status)}>{row.status === "CLOSED" ? "Clôturée" : row.status === "COUNTING" ? "Comptage" : "Ouverte"}</Badge></td><td className="px-5 py-3 text-right tabular-nums">{row.declaredMinor ? formatFcfa(row.declaredMinor) : "—"}</td><td className="px-5 py-3 text-right tabular-nums">{row.expectedMinor ? formatFcfa(row.expectedMinor) : "—"}</td><td className={`px-5 py-3 text-right tabular-nums font-semibold ${varianceClass(row.varianceMinor)}`}>{row.varianceMinor ? formatFcfa(row.varianceMinor) : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function OwnerSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ session: SessionDetail }>(`/api/v1/owner/cash-sessions/${id}`).then((data) => setSession(data.session)).catch((caught: RequestError) => setError(caught.message)); }, [id]);
  if (!session && !error) return <Skeleton className="h-[32rem]" />;
  if (!session) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title={`Session du ${formatDate(session.businessDate)}`} action={<Link href="/owner/sessions"><Button variant="secondary">Retour aux sessions</Button></Link>}>{session.shop.name} · {session.managerName} · <span className="inline-block"><Badge tone={statusTone(session.status)}>{session.status === "CLOSED" ? "Clôturée" : session.status === "COUNTING" ? "Comptage" : "Ouverte"}</Badge></span></PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{session.closures.map((row) => <article key={row.id} className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex items-start justify-between gap-3"><p className="font-semibold">{row.source}</p><Badge tone={BigInt(row.varianceMinor) === 0n ? "success" : "danger"}>{BigInt(row.varianceMinor) === 0n ? "Conforme" : "Écart"}</Badge></div><dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span className="text-[var(--muted)]">Déclaré physiquement</span><strong className="tabular-nums">{formatFcfa(row.declaredMinor)}</strong></div><div className="flex justify-between"><span className="text-[var(--muted)]">Attendu comptable</span><strong className="tabular-nums">{formatFcfa(row.expectedMinor)}</strong></div><div className="flex justify-between border-t border-[var(--separator)]/60 pt-2"><span className="text-[var(--muted)]">Différence</span><strong className={`tabular-nums ${varianceClass(row.varianceMinor)}`}>{formatFcfa(row.varianceMinor)}</strong></div></dl>{row.explanation ? <p className="mt-3 text-sm text-[var(--muted)]">Observation : {row.explanation}</p> : null}</article>)}</div>
      {session.closures.length === 0 ? <EmptyState title="Comptage non encore déposé">Le détail déclaré / attendu apparaîtra après la clôture.</EmptyState> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Ventes</h2>{session.sales.length ? <ul className="mt-3 divide-y divide-[var(--separator)]/60">{session.sales.map((sale) => <li key={sale.id} className="flex justify-between py-2 text-sm"><span>{sale.reference}</span><strong className="tabular-nums">{formatFcfa(sale.netMinor)}</strong></li>)}</ul> : <p className="mt-4 text-sm text-[var(--muted)]">Aucune vente enregistrée pendant cette session.</p>}</article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Dépenses</h2>{session.expenses.length ? <ul className="mt-3 divide-y divide-[var(--separator)]/60">{session.expenses.map((item) => <li key={item.id} className="flex justify-between py-2 text-sm"><span className="truncate">{item.description}</span><strong className="tabular-nums">{formatFcfa(item.amountMinor)}</strong></li>)}</ul> : <p className="mt-4 text-sm text-[var(--muted)]">Aucune dépense rattachée à cette session.</p>}</article>
      </div>
      {session.discrepancies.length > 0 ? <section><h2 className="mb-3 font-display font-semibold">Dossiers d’écart</h2><ul className="space-y-2">{session.discrepancies.map((item) => <li key={item.id}><Link className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]" href={`/owner/discrepancies/${item.id}`}><div><p className="font-semibold">Écart à examiner</p><p className="mt-1 text-sm text-[var(--muted)]">Ouvrir le dossier et conserver la justification de la décision.</p></div><strong className={varianceClass(item.residualAmountMinor)}>{formatFcfa(item.residualAmountMinor)}</strong></Link></li>)}</ul></section> : null}
    </section>
  );
}

export function OwnerExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<ExpenseRow | null>(null);
  const [reason, setReason] = useState("Demande examinée.");
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [withoutReceipt, setWithoutReceipt] = useState(false);
  const [form, setForm] = useState({ shopId: "", accountId: "", category: "OTHER", description: "", amountMinor: "", receiptExceptionReason: "" });
  const load = () => {
    Promise.all([api<{ expenses: ExpenseRow[] }>("/api/v1/expenses"), api<{ shops: Shop[] }>("/api/v1/shops"), api<{ accounts: Account[] }>("/api/v1/fund-accounts")])
      .then(([listed, shopData, funds]) => { setRows(listed.expenses); setShops(shopData.shops); setAccounts(funds.accounts); })
      .catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, []);
  const filtered = (rows ?? []).filter((row) => (status === "ALL" || row.status === status) && `${row.description} ${row.shopName} ${row.managerName}`.toLowerCase().includes(query.toLowerCase()));
  const submitOwnerExpense = async () => {
    setPending(true);
    setError(null);
    try {
      const attachmentIds: string[] = [];
      if (receipt) {
        const payload = await filePayload(receipt);
        const created = await api<{ id: string }>("/api/v1/attachments", { method: "POST", body: JSON.stringify({ documentType: "expenses", mime: receipt.type, size: receipt.size, name: receipt.name, sha256: payload.sha256 }) });
        await api(`/api/v1/attachments/${created.id}/content`, { method: "PUT", body: JSON.stringify({ base64: payload.base64 }) });
        attachmentIds.push(created.id);
      }
      const created = await api<{ id: string }>("/api/v1/expenses", { method: "POST", body: JSON.stringify({ ...form, receiptExceptionReason: withoutReceipt ? form.receiptExceptionReason : undefined, attachmentIds }) });
      await api(`/api/v1/expenses/${created.id}/pay`, { method: "POST" });
      setForm((current) => ({ ...current, description: "", amountMinor: "", receiptExceptionReason: "" }));
      setReceipt(null);
      setWithoutReceipt(false);
      await load();
    } catch (caught) {
      setError(caught instanceof RequestError ? caught.message : "La dépense n’a pas pu être enregistrée.");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Dépenses">Validez ou refusez les demandes, puis suivez le décaissement réel. L’autorisation ne diminue pas les fonds.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]" onSubmit={(event) => { event.preventDefault(); void submitOwnerExpense(); }}>
        <h2 className="font-display font-semibold">Dépense d’organisation</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Cette opération enregistre puis décaisse réellement la dépense. Utilisez une source de la boutique concernée ou une source commune de l’entreprise.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">Boutique concernée<select required value={form.shopId} onChange={(event) => setForm((current) => ({ ...current, shopId: event.target.value, accountId: "" }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Source débitée<select required value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir</option>{accounts.filter((account) => account.shopId === null || account.shopId === form.shopId).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.shopName}{account.balanceMinor ? ` · ${formatFcfa(account.balanceMinor)}` : ""}</option>)}</select></label>
          <label className="block text-sm font-medium">Catégorie<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3"><option value="RENT">Loyer</option><option value="UTILITIES">Charges</option><option value="TRANSPORT">Transport</option><option value="SUPPLIES">Fournitures</option><option value="OTHER">Autre</option></select></label>
          <Field id="owner-expense-amount" label="Montant (FCFA)" inputMode="numeric" value={form.amountMinor} onChange={(event) => setForm((current) => ({ ...current, amountMinor: event.target.value.replace(/\D/g, "") }))} />
          <Field id="owner-expense-description" label="Motif" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          <div className="rounded-lg bg-[var(--surface-subtle)] p-4 md:col-span-2">
            <label className="flex cursor-pointer items-center gap-3 font-medium"><FileUp className="size-5 text-[var(--primary)]" /><span>{receipt?.name ?? "Ajouter un justificatif (PDF ou image)"}</span><input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => { setReceipt(event.target.files?.[0] ?? null); setWithoutReceipt(false); }} /></label>
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={withoutReceipt} onChange={(event) => { setWithoutReceipt(event.target.checked); if (event.target.checked) setReceipt(null); }} /> Aucun justificatif disponible</label>
            {withoutReceipt ? <div className="mt-3"><Field id="owner-expense-receipt-reason" label="Motif de l’absence de justificatif" value={form.receiptExceptionReason} onChange={(event) => setForm((current) => ({ ...current, receiptExceptionReason: event.target.value }))} /></div> : null}
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">La pièce jointe reste privée et soumise au contrôle de sécurité. Sans fichier, le motif d’absence est obligatoire et audité.</p>
        <Button type="submit" className="mt-4" disabled={pending || !form.shopId || !form.accountId || !form.amountMinor || form.description.trim().length < 5 || (!receipt && (!withoutReceipt || form.receiptExceptionReason.trim().length < 5))}>{pending ? "Enregistrement…" : "Enregistrer et décaisser"}</Button>
      </form>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block flex-1"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Boutique, gérant ou motif" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
        <select aria-label="Filtrer par état" value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg bg-[var(--surface)] px-3 text-sm shadow-[var(--shadow-card)]"><option value="ALL">Tous les états</option>{Object.entries(expenseLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
      {!rows ? <Skeleton className="h-48" /> : filtered.length === 0 ? <EmptyState title="Aucune dépense">Les demandes des boutiques apparaîtront ici.</EmptyState> : (
        <ul className="grid gap-3">{filtered.map((row) => (
          <li key={row.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{row.description}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.shopName} · {row.managerName} · {row.source}</p></div>
              <div className="text-right"><p className="tabular-nums font-semibold">{formatFcfa(row.amountMinor)}</p><Badge tone={expenseTone(row.status)}>{expenseLabel[row.status]}</Badge></div>
            </div>
            {row.status === "REQUESTED" ? <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => setSelected(row)}>Décider</Button></div> : null}
          </li>
        ))}</ul>
      )}
      <Modal open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }} title="Décision sur la dépense" {...(selected ? { description: `${selected.description} · ${formatFcfa(selected.amountMinor)}` } : {})}>
        <Field id="decide-reason" label="Motif de la décision" value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setSelected(null)}>Fermer</Button>
          <Button variant="danger" disabled={pending} onClick={() => { if (!selected) return; setPending(true); api(`/api/v1/expenses/${selected.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "REJECT", reason }) }).then(() => { setSelected(null); return load(); }).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Refuser</Button>
          <Button disabled={pending} onClick={() => { if (!selected) return; setPending(true); api(`/api/v1/expenses/${selected.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "APPROVE", reason }) }).then(() => { setSelected(null); return load(); }).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Autoriser</Button>
        </div>
      </Modal>
    </section>
  );
}

export function OwnerFundsPage() {
  const [rows, setRows] = useState<TransferRow[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ sourceAccountId: "", destinationAccountId: "", amountMinor: "", purpose: "OWNER_CONTRIBUTION", reason: "" });
  const load = () => {
    Promise.all([api<{ transfers: TransferRow[] }>("/api/v1/fund-transfers"), api<{ accounts: Account[] }>("/api/v1/fund-accounts")])
      .then(([listed, funds]) => { setRows(listed.transfers); setAccounts(funds.accounts); })
      .catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, []);
  const transit = (rows ?? []).filter((row) => ["SENT", "PARTIAL"].includes(row.state));
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Mouvements de fonds">Apports, retraits et remises transitent par un compte identifiable. Une réception fractionnée conserve le reliquat.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]" onSubmit={(event) => { event.preventDefault(); setPending(true); api<{ id: string }>("/api/v1/fund-transfers", { method: "POST", body: JSON.stringify(form) }).then((created) => api(`/api/v1/fund-transfers/${created.id}/send`, { method: "POST" })).then(() => { setForm((current) => ({ ...current, amountMinor: "", reason: "" })); return load(); }).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>
        <h2 className="font-display font-semibold">Nouveau mouvement</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Choisissez la nature de l’opération, le compte qui remet les fonds et celui qui doit les recevoir. L’argent restera en transit jusqu’à confirmation de la réception.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">Type de mouvement<select value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3">{Object.entries(purposeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Field id="owner-fund-amount" label="Montant envoyé (FCFA)" inputMode="numeric" value={form.amountMinor} onChange={(event) => setForm((current) => ({ ...current, amountMinor: event.target.value.replace(/\D/g, "") }))} />
          <label className="block text-sm font-medium">Compte de départ<select required value={form.sourceAccountId} onChange={(event) => setForm((current) => ({ ...current, sourceAccountId: event.target.value, destinationAccountId: current.destinationAccountId === event.target.value ? "" : current.destinationAccountId }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3"><option value="">Choisir</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.shopName} · {formatFcfa(account.balanceMinor)}</option>)}</select></label>
          <label className="block text-sm font-medium">Compte destinataire<select required value={form.destinationAccountId} onChange={(event) => setForm((current) => ({ ...current, destinationAccountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3"><option value="">Choisir</option>{accounts.filter((account) => account.id !== form.sourceAccountId).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.shopName}</option>)}</select></label>
          <div className="md:col-span-2"><Field id="owner-fund-reason" label="Justification du mouvement" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></div>
        </div>
        <Button type="submit" className="mt-4" disabled={pending || !form.sourceAccountId || !form.destinationAccountId || !form.amountMinor || form.reason.trim().length < 3}>{pending ? "Envoi…" : "Enregistrer et envoyer"}</Button>
      </form>
      {transit.length > 0 ? <Alert>{transit.length} mouvement{transit.length > 1 ? "s" : ""} encore en transit.</Alert> : null}
      {!rows ? <Skeleton className="h-48" /> : rows.length === 0 ? <EmptyState title="Aucun mouvement">Les mouvements apparaîtront ici après leur premier envoi.</EmptyState> : (
        <ul className="grid gap-3">{rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap justify-between gap-3">
              <div><p className="font-semibold">{purposeLabel[row.purpose]} · {row.source} → {row.destination}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.reason}</p></div>
              <div className="text-right"><p className="tabular-nums font-semibold">{formatFcfa(row.amountSentMinor)}</p><p className="text-sm text-[var(--muted)]">Reçu {formatFcfa(row.amountReceivedMinor)} · reste {formatFcfa(row.remainingMinor)}</p></div>
            </div>
            {["SENT", "PARTIAL"].includes(row.state) ? <Button className="mt-3" variant="secondary" onClick={() => api(`/api/v1/fund-transfers/${row.id}/receive`, { method: "POST", body: JSON.stringify({ amountMinor: row.remainingMinor }) }).then(() => load()).catch((caught: RequestError) => setError(caught.message))}>Recevoir le reliquat</Button> : null}
          </li>
        ))}</ul>
      )}
    </section>
  );
}

export function OwnerDiscrepanciesPage() {
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => { api<{ cases: CaseRow[] }>("/api/v1/owner/discrepancies").then((data) => setRows(data.cases)).catch((caught: RequestError) => setError(caught.message)); }, []);
  const filtered = (rows ?? []).filter((row) => `${row.shopName} ${row.state}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Écarts de caisse">Chaque dossier conserve déclaré, attendu et différence. Une décision crée une écriture liée, jamais une modification silencieuse.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label className="relative block max-w-md"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher un dossier</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Boutique ou état" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
      {!rows ? <Skeleton className="h-48" /> : filtered.length === 0 ? <EmptyState title="Aucun écart ouvert">Les dossiers apparaîtront après une clôture différente de l’attendu.</EmptyState> : (
        <ul className="grid gap-3">{filtered.map((row) => <li key={row.id}><Link href={`/owner/discrepancies/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{row.shopName ?? "Organisation"}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.source ?? "Source non renseignée"} · créé le {formatDate(row.createdAt)}</p></div><Badge tone={row.state === "RESOLVED" ? "success" : row.state === "NEEDS_INFO" ? "warning" : "danger"}>{caseState[row.state] ?? row.state}</Badge></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-[var(--muted)]">Déclaré</dt><dd className="font-semibold tabular-nums">{formatFcfa(row.declaredMinor)}</dd></div><div><dt className="text-[var(--muted)]">Attendu</dt><dd className="font-semibold tabular-nums">{formatFcfa(row.expectedMinor)}</dd></div><div><dt className="text-[var(--muted)]">Reste à traiter</dt><dd className={`font-semibold tabular-nums ${varianceClass(row.residualAmountMinor)}`}>{formatFcfa(row.residualAmountMinor)}</dd></div></dl></Link></li>)}</ul>
      )}
    </section>
  );
}

export function OwnerDiscrepancyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<"ACCEPT" | "RECLASSIFY" | "ADJUST" | "REQUEST_INFO" | null>(null);
  const load = () => api<{ discrepancy: CaseDetail }>(`/api/v1/owner/discrepancies/${id}`).then((data) => setRow(data.discrepancy)).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => { void load(); }, [id]);
  if (!row && !error) return <Skeleton className="h-[32rem]" />;
  if (!row) return <Alert tone="error">{error}</Alert>;
  const decide = () => {
    if (!confirm) return;
    setPending(true);
    api(`/api/v1/owner/discrepancies/${id}/resolve`, { method: "POST", body: JSON.stringify({ decision: confirm, reason, amountMinor: amount || undefined }) })
      .then(() => { setConfirm(null); return load(); })
      .catch((caught: RequestError) => setError(caught.message))
      .finally(() => setPending(false));
  };
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Dossier d’écart" action={<Link href="/owner/discrepancies"><Button variant="secondary">Retour aux écarts</Button></Link>}>{row.shopName ?? "Organisation"} · {row.source ?? "Source non renseignée"} · ouvert le {formatDate(row.createdAt)}</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3"><Badge tone={row.state === "RESOLVED" ? "success" : row.state === "NEEDS_INFO" ? "warning" : "danger"}>{caseState[row.state] ?? row.state}</Badge>{row.resolvedAt ? <span className="text-sm text-[var(--muted)]">Résolu le {formatDate(row.resolvedAt)}</span> : null}</div>
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Déclaré</p><p className="mt-1 font-display text-xl tabular-nums">{formatFcfa(row.declaredMinor)}</p></article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Attendu</p><p className="mt-1 font-display text-xl tabular-nums">{formatFcfa(row.expectedMinor)}</p></article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Reste à traiter</p><p className={`mt-1 font-display text-xl tabular-nums ${varianceClass(row.residualAmountMinor)}`}>{formatFcfa(row.residualAmountMinor)}</p></article>
      </div>
      {row.state !== "RESOLVED" ? <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Décisions</h2>
        <Field id="case-reason" label="Motif" value={reason} onChange={(event) => setReason(event.target.value)} />
        <Field id="case-amount" label="Montant à reclasser ou ajuster (FCFA)" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirm("ACCEPT")}>Accepter l’écart</Button>
          <Button variant="secondary" onClick={() => setConfirm("RECLASSIFY")}>Reclasser</Button>
          <Button variant="secondary" onClick={() => setConfirm("ADJUST")}>Ajuster (écriture liée)</Button>
          <Button variant="ghost" onClick={() => setConfirm("REQUEST_INFO")}>Demander une explication</Button>
        </div>
      </article> : <Alert tone="success">Ce dossier est résolu. Son historique reste consultable et le comptage d’origine est conservé.</Alert>}
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Historique</h2>
        {row.actions.length ? <ul className="mt-3 space-y-3">{row.actions.map((action) => <li key={action.id} className="rounded-lg bg-[var(--surface-subtle)] p-3 text-sm"><p className="font-medium">{action.actor} · {action.type}</p><p className="mt-1 text-[var(--muted)]">{action.text}</p><p className="mt-1 text-xs text-[var(--muted)]">{new Date(action.at).toLocaleString("fr-FR")}</p></li>)}</ul> : <p className="mt-3 text-sm text-[var(--muted)]">Aucune décision enregistrée pour le moment.</p>}
      </article>
      <ConfirmDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }} title="Confirmer la décision" confirmLabel="Enregistrer" pending={pending} onConfirm={decide}>
        Cette action conserve l’historique et crée, si besoin, une écriture liée. Le comptage d’origine n’est pas réécrit.
      </ConfirmDialog>
    </section>
  );
}

