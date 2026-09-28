"use client";

import { Search } from "lucide-react";
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
type Account = { id: string; name: string; type: string; shopName: string; balanceMinor?: string };
type Shop = { id: string; name: string };
type CaseRow = { id: string; type: string; state: string; shopName: string | null; originalAmountMinor: string; residualAmountMinor: string; expectedMinor: string | null; declaredMinor: string | null; createdAt: string };
type CaseDetail = CaseRow & { sessionId: string | null; ownerDecision: string | null; resolvedAt: string | null; actions: Array<{ id: string; type: string; text: string; actor: string; at: string }> };

const statusTone = (status: string) => status === "CLOSED" ? "neutral" : status === "COUNTING" ? "warning" : "success";
const expenseTone = (status: string): "neutral" | "success" | "warning" | "danger" | "info" => ({ DRAFT: "neutral", REQUESTED: "warning", AUTHORIZED: "info", POSTED: "success", IRREGULAR: "danger", REJECTED: "danger" } as const)[status] ?? "neutral";
const expenseLabel: Record<string, string> = { DRAFT: "Brouillon", REQUESTED: "À valider", AUTHORIZED: "Autorisée", POSTED: "Décaissée", IRREGULAR: "À régulariser", REJECTED: "Refusée" };
const purposeLabel: Record<string, string> = { REMITTANCE: "Remise", FLOAT: "Fonds de caisse", OWNER_CONTRIBUTION: "Apport", WITHDRAWAL: "Retrait" };

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
          <ul className="grid gap-3 xl:hidden">{filtered.map((row) => <li key={row.id}><Link href={`/owner/sessions/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.shopName}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.businessDate} · {row.managerName}</p><p className="mt-2 tabular-nums">{row.expectedMinor ? `Écart ${formatFcfa(row.varianceMinor ?? "0")}` : "En cours"}</p></Link></li>)}</ul>
          <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] xl:block">
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Boutique</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Gérant</th><th className="px-5 py-3 font-medium">État</th><th className="px-5 py-3 text-right font-medium">Déclaré</th><th className="px-5 py-3 text-right font-medium">Attendu</th><th className="px-5 py-3 text-right font-medium">Écart</th></tr></thead>
              <tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-3"><Link className="font-semibold text-[var(--primary)]" href={`/owner/sessions/${row.id}`}>{row.shopName}</Link></td><td className="px-5 py-3">{row.businessDate}</td><td className="px-5 py-3">{row.managerName}</td><td className="px-5 py-3"><Badge tone={statusTone(row.status)}>{row.status === "CLOSED" ? "Clôturée" : row.status === "COUNTING" ? "Comptage" : "Ouverte"}</Badge></td><td className="px-5 py-3 text-right tabular-nums">{row.declaredMinor ? formatFcfa(row.declaredMinor) : "—"}</td><td className="px-5 py-3 text-right tabular-nums">{row.expectedMinor ? formatFcfa(row.expectedMinor) : "—"}</td><td className="px-5 py-3 text-right tabular-nums">{row.varianceMinor ? formatFcfa(row.varianceMinor) : "—"}</td></tr>)}</tbody>
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
      <PageHeader title={`Session ${session.businessDate}`}>{session.shop.name} · {session.managerName}</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">{session.closures.map((row) => <article key={row.id} className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.source}</p><dl className="mt-3 space-y-1 text-sm"><div className="flex justify-between"><span className="text-[var(--muted)]">Déclaré</span><strong className="tabular-nums">{formatFcfa(row.declaredMinor)}</strong></div><div className="flex justify-between"><span className="text-[var(--muted)]">Attendu</span><strong className="tabular-nums">{formatFcfa(row.expectedMinor)}</strong></div><div className="flex justify-between"><span className="text-[var(--muted)]">Écart</span><strong className="tabular-nums">{formatFcfa(row.varianceMinor)}</strong></div></dl>{row.explanation ? <p className="mt-3 text-sm text-[var(--muted)]">{row.explanation}</p> : null}</article>)}</div>
      {session.closures.length === 0 ? <EmptyState title="Comptage non encore déposé">Le détail déclaré / attendu apparaîtra après la clôture.</EmptyState> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Ventes</h2><ul className="mt-3 divide-y divide-[var(--separator)]/60">{session.sales.map((sale) => <li key={sale.id} className="flex justify-between py-2 text-sm"><span>{sale.reference}</span><strong className="tabular-nums">{formatFcfa(sale.netMinor)}</strong></li>)}</ul></article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Dépenses</h2><ul className="mt-3 divide-y divide-[var(--separator)]/60">{session.expenses.map((item) => <li key={item.id} className="flex justify-between py-2 text-sm"><span className="truncate">{item.description}</span><strong className="tabular-nums">{formatFcfa(item.amountMinor)}</strong></li>)}</ul></article>
      </div>
      {session.discrepancies.length > 0 ? <ul className="space-y-2">{session.discrepancies.map((item) => <li key={item.id}><Link className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]" href={`/owner/discrepancies/${item.id}`}>Dossier d’écart · reste {formatFcfa(item.residualAmountMinor)}</Link></li>)}</ul> : null}
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
  const [form, setForm] = useState({ shopId: "", accountId: "", category: "OTHER", description: "", amountMinor: "", receiptExceptionReason: "Dépense d’organisation." });
  const load = () => {
    Promise.all([api<{ expenses: ExpenseRow[] }>("/api/v1/expenses"), api<{ shops: Shop[] }>("/api/v1/shops"), api<{ accounts: Account[] }>("/api/v1/fund-accounts")])
      .then(([listed, shopData, funds]) => { setRows(listed.expenses); setShops(shopData.shops); setAccounts(funds.accounts); })
      .catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, []);
  const filtered = (rows ?? []).filter((row) => (status === "ALL" || row.status === status) && `${row.description} ${row.shopName} ${row.managerName}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Dépenses">Validez ou refusez les demandes, puis suivez le décaissement réel. L’autorisation ne diminue pas les fonds.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <form className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]" onSubmit={(event) => { event.preventDefault(); setPending(true); api<{ id: string }>("/api/v1/expenses", { method: "POST", body: JSON.stringify(form) }).then((created) => api(`/api/v1/expenses/${created.id}/pay`, { method: "POST" })).then(() => { setForm((current) => ({ ...current, description: "", amountMinor: "" })); return load(); }).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>
        <h2 className="font-display font-semibold">Dépense d’organisation</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Décaissement immédiat sur la source choisie, sans modifier la caisse d’une boutique si vous utilisez un compte d’organisation.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">Boutique<select required value={form.shopId} onChange={(event) => setForm((current) => ({ ...current, shopId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Source<select required value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.shopName}{account.balanceMinor ? ` · ${formatFcfa(account.balanceMinor)}` : ""}</option>)}</select></label>
          <Field id="owner-expense-amount" label="Montant" inputMode="numeric" value={form.amountMinor} onChange={(event) => setForm((current) => ({ ...current, amountMinor: event.target.value.replace(/\D/g, "") }))} />
          <Field id="owner-expense-description" label="Motif" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </div>
        <Button type="submit" className="mt-4" disabled={pending || !form.shopId || !form.accountId || !form.amountMinor}>{pending ? "Enregistrement…" : "Décaisser"}</Button>
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
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium">Motif<select value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3">{Object.entries(purposeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Field id="owner-fund-amount" label="Montant" inputMode="numeric" value={form.amountMinor} onChange={(event) => setForm((current) => ({ ...current, amountMinor: event.target.value.replace(/\D/g, "") }))} />
          <label className="block text-sm font-medium">Source<select required value={form.sourceAccountId} onChange={(event) => setForm((current) => ({ ...current, sourceAccountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3"><option value="">Choisir</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {formatFcfa(account.balanceMinor)}</option>)}</select></label>
          <label className="block text-sm font-medium">Destination<select required value={form.destinationAccountId} onChange={(event) => setForm((current) => ({ ...current, destinationAccountId: event.target.value }))} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3"><option value="">Choisir</option>{accounts.filter((account) => account.id !== form.sourceAccountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <div className="md:col-span-2"><Field id="owner-fund-reason" label="Justification" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></div>
        </div>
        <Button type="submit" className="mt-4" disabled={pending}>{pending ? "Envoi…" : "Mettre en transit"}</Button>
      </form>
      {transit.length > 0 ? <Alert>{transit.length} mouvement{transit.length > 1 ? "s" : ""} encore en transit.</Alert> : null}
      {!rows ? <Skeleton className="h-48" /> : rows.length === 0 ? <EmptyState title="Aucun mouvement">Les apports et remises apparaîtront ici.</EmptyState> : (
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
        <ul className="grid gap-3">{filtered.map((row) => <li key={row.id}><Link href={`/owner/discrepancies/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.shopName ?? "Organisation"}</p><p className="mt-1 text-sm text-[var(--muted)]">Déclaré {formatFcfa(row.declaredMinor)} · attendu {formatFcfa(row.expectedMinor)} · reste {formatFcfa(row.residualAmountMinor)}</p></Link></li>)}</ul>
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
      <PageHeader title="Dossier d’écart">{row.shopName ?? "Organisation"}</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Déclaré</p><p className="mt-1 font-display text-xl tabular-nums">{formatFcfa(row.declaredMinor)}</p></article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Attendu</p><p className="mt-1 font-display text-xl tabular-nums">{formatFcfa(row.expectedMinor)}</p></article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Reste à traiter</p><p className="mt-1 font-display text-xl tabular-nums">{formatFcfa(row.residualAmountMinor)}</p></article>
      </div>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Décisions</h2>
        <Field id="case-reason" label="Motif" value={reason} onChange={(event) => setReason(event.target.value)} />
        <Field id="case-amount" label="Montant pour reclasser ou ajuster" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setConfirm("ACCEPT")}>Accepter l’écart</Button>
          <Button variant="secondary" onClick={() => setConfirm("RECLASSIFY")}>Reclasser</Button>
          <Button variant="secondary" onClick={() => setConfirm("ADJUST")}>Ajuster (écriture liée)</Button>
          <Button variant="ghost" onClick={() => setConfirm("REQUEST_INFO")}>Demander une explication</Button>
        </div>
      </article>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Historique</h2>
        <ul className="mt-3 space-y-3">{row.actions.map((action) => <li key={action.id} className="text-sm"><p className="font-medium">{action.actor} · {action.type}</p><p className="text-[var(--muted)]">{action.text}</p></li>)}</ul>
      </article>
      <ConfirmDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }} title="Confirmer la décision" confirmLabel="Enregistrer" pending={pending} onConfirm={decide}>
        Cette action conserve l’historique et crée, si besoin, une écriture liée. Le comptage d’origine n’est pas réécrit.
      </ConfirmDialog>
    </section>
  );
}

