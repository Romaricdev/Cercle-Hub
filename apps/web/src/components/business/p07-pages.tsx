"use client";

import { AlertTriangle, FileUp, Plus, RotateCcw, Search, UsersRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api, RequestError } from "../../lib/api";
import { formatFcfa } from "../../lib/money";
import { paths } from "../../lib/session";
import { filePayload } from "./p06-labels";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Field } from "../ui/field";
import { Label } from "../ui/label";
import { KpiItem, KpiStrip } from "../ui/kpi-strip";
import { Modal } from "../ui/modal";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";
import { TablePagination, useTablePagination } from "../ui/table-pagination";
import { Textarea } from "../ui/textarea";

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => api<T>(path).then(setData).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => { void reload(); }, [path]);
  return { data, error, reload };
}

function statusTone(status: string): "success" | "warning" | "neutral" | "danger" {
  if (["SETTLED", "APPROVED", "PAID", "ACTIVE", "COMPLETED"].includes(status)) return "success";
  if (["REJECTED", "CLOSED", "WRITTEN_OFF"].includes(status)) return "danger";
  if (["REQUESTED", "COUNTING", "SUBMITTED", "OVERDUE", "PENDING"].includes(status)) return "warning";
  return "neutral";
}

type CustomerRow = { id: string; name: string; phone: string; status: string; openMinor: string; overdue: boolean; creditLimitMinor: string };
type ReceivableRow = { id: string; shop: string; customer: { id: string; name: string; phone: string } | null; originType: string; originalMinor: string; remainingMinor: string; dueDate: string | null; overdue: boolean };
type ReturnRow = { id: string; saleReference: string; status: string; requestedMinor: string; refundDueMinor: string; refundedMinor: string; createdAt: string };
type CountRow = { id: string; shop: string; location: string; status: string; revision: number; createdAt: string };
type LossRow = { id: string; shop: string; product: string; variant: string; lot: string | null; quantity: string; sourceCompartment: string; compartment: string; status: string; reason: string; createdAt: string };
type CreditPolicyPayload = { creditEnabled: boolean; scopeLabel: string };
type LossOption = { variantId: string; locationId: string; product: string; variant: string; location: string; compartment: "AVAILABLE" | "DAMAGED" | "QUARANTINE"; lotId: string | null; lotCode: string | null; quantity: string };


const returnLabels: Record<string, string> = {
  REQUESTED: "À décider",
  APPROVED: "Autorisée",
  REJECTED: "Refusée",
  PARTIALLY_RECEIVED: "Réception partielle",
  RECEIVED: "Reçue · remboursement à traiter",
  SETTLED: "Terminée",
};
const lossLabels: Record<string, string> = { REQUESTED: "À valider", DECLARED: "Déclarée", WRITTEN_OFF: "Soldée" };
const compartmentLabels: Record<string, string> = { AVAILABLE: "Vendable", DAMAGED: "Endommagé", QUARANTINE: "Quarantaine", MISSING_PENDING: "Manquant à contrôler" };
const receivableOriginLabels: Record<string, string> = { SALE: "Vente à crédit", OPENING: "Créance d’ouverture" };
const receivableOriginLabel = (origin: string) => receivableOriginLabels[origin] ?? "Créance";

function formatShortDate(value: string | null) {
  if (!value) return "Sans échéance";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function useCreditPolicy(role: "OWNER" | "MANAGER") {
  const path = role === "MANAGER" ? "/api/v1/manager/sales/context" : "/api/v1/policies";
  const loaded = useLoad<{ credit?: { creditEnabled: boolean }; policies?: Array<{ shopId: string | null; values: Record<string, unknown> }> }>(path);
  const managerValue = loaded.data?.credit?.creditEnabled;
  const globalPolicy = loaded.data?.policies?.find((item) => item.shopId === null);
  const ownerValue = globalPolicy?.values.creditEnabled === true;
  return {
    loading: !loaded.data && !loaded.error,
    error: loaded.error,
    policy: loaded.data ? { creditEnabled: role === "MANAGER" ? managerValue === true : ownerValue, scopeLabel: role === "MANAGER" ? "votre boutique" : "la politique générale" } satisfies CreditPolicyPayload : null,
  };
}

export function CustomersPage({ role }: { role: "OWNER" | "MANAGER" }) {
  const router = useRouter();
  const base = role === "OWNER" ? paths.ownerCustomers : paths.managerCustomers;
  const { data, error, reload } = useLoad<{ customers: CustomerRow[] }>("/api/v1/customers");
  const credit = useCreditPolicy(role);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const filtered = useMemo(() => (data?.customers ?? []).filter((row) => `${row.name} ${row.phone}`.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const pagination = useTablePagination(filtered);
  const overdue = filtered.filter((row) => row.overdue).length;
  const openTotal = filtered.reduce((sum, row) => sum + BigInt(row.openMinor), 0n);
  const creditEnabled = credit.policy?.creditEnabled === true;
  return <section className="space-y-6">
    <PageHeader title="Clients et créances" action={creditEnabled ? <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Nouveau client</Button> : undefined}>Suivez les clients, les échéances et les règlements sans transformer un encaissement en nouvelle vente.</PageHeader>
    {error || credit.error ? <Alert tone="error">{error ?? credit.error}</Alert> : null}
    {message ? <Alert>{message}</Alert> : null}
    {!credit.loading && credit.policy && !creditEnabled ? <Alert tone="warning"><strong>Crédit client désactivé pour {credit.policy.scopeLabel}.</strong><span className="mt-1 block">Les nouvelles ventes à crédit sont bloquées. Les clients et créances existants restent consultables et réglables.</span></Alert> : null}
    <KpiStrip count={3}><KpiItem icon={<UsersRound />} value={filtered.length} label="clients" /><KpiItem icon={<WalletCards />} value={formatFcfa(openTotal)} label="créances ouvertes" valueClassName="!text-lg" /><KpiItem icon={<RotateCcw />} value={overdue} label="en retard" /></KpiStrip>
    <div><h2 className="font-display text-lg font-semibold">Répertoire clients</h2><p className="mt-1 text-sm text-[var(--muted)]">Ouvrez une fiche pour consulter les échéances et, côté gérant, enregistrer un règlement.</p></div>
    <label className="relative block max-w-md"><span className="sr-only">Rechercher un client</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><input className="h-11 w-full rounded-md bg-[var(--surface)] pl-9 pr-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" value={query} onChange={(event) => { setQuery(event.target.value); pagination.setPage(1); }} placeholder="Nom ou téléphone" /></label>
    {!data ? <Skeleton className="h-48" /> : filtered.length === 0 ? <EmptyState icon={<UsersRound />} title={query ? "Aucun client trouvé" : "Aucun client"}>{creditEnabled ? "Créez un client pour préparer une future vente à crédit." : "Le crédit est désactivé et aucune créance existante n’est rattachée à cette boutique."}</EmptyState> : <>
      <ul className="grid gap-3 lg:hidden">{pagination.pageItems.map((row) => <li key={row.id}><Link href={`${base}/${row.id}`} className="block min-h-11 rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.name}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.phone}</p></div><Badge tone={row.overdue ? "warning" : row.openMinor === "0" ? "success" : "neutral"}>{row.overdue ? "En retard" : row.openMinor === "0" ? "Soldé" : "Ouvert"}</Badge></div><p className="mt-3 font-display text-lg font-semibold tabular-nums">{formatFcfa(row.openMinor)}</p></Link></li>)}</ul>
      <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] lg:block"><table className="w-full text-sm"><thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Client</th><th className="px-5 py-3 font-medium">Téléphone</th><th className="px-5 py-3 text-right font-medium">Créance</th><th className="px-5 py-3 font-medium">État</th></tr></thead><tbody>{pagination.pageItems.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/60"><td className="px-5 py-3"><Link className="font-semibold text-[var(--primary)]" href={`${base}/${row.id}`}>{row.name}</Link></td><td className="px-5 py-3">{row.phone}</td><td className="px-5 py-3 text-right tabular-nums">{formatFcfa(row.openMinor)}</td><td className="px-5 py-3"><Badge tone={row.overdue ? "warning" : row.openMinor === "0" ? "success" : "neutral"}>{row.overdue ? "En retard" : row.openMinor === "0" ? "Soldé" : "Ouvert"}</Badge></td></tr>)}</tbody></table></div>
      <TablePagination page={pagination.page} pageSize={pagination.pageSize} total={filtered.length} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="client" />
    </>}
    <Modal open={open} onOpenChange={setOpen} title="Nouveau client" description="La création d’une fiche n’accorde aucun crédit. La politique et le plafond seront contrôlés au moment de la vente." error={open && message?.includes("cré") === false ? message : null}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); api<{ id: string; duplicateWarning: string | null }>("/api/v1/customers", { method: "POST", body: JSON.stringify({ name, phone }) }).then((created) => { setOpen(false); setMessage(created.duplicateWarning ?? "Client créé."); router.push(`${base}/${created.id}`); return reload(); }).catch((caught: RequestError) => setMessage(caught.message)); }}><Field id="customer-name" label="Nom" required value={name} onChange={(event) => setName(event.target.value)} /><Field id="customer-phone" label="Téléphone" required value={phone} onChange={(event) => setPhone(event.target.value)} /><p className="text-sm text-[var(--muted)]">Les doublons possibles sont signalés et ne sont jamais fusionnés automatiquement.</p><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={!name.trim() || !phone.trim()}>Créer le client</Button></div></form>
    </Modal>
  </section>;
}

export function CustomerDetailPage({ role }: { role: "OWNER" | "MANAGER" }) {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useLoad<{ customer: { id: string; name: string; phone: string; status: string; creditLimitMinor: string; openMinor: string; notes: string | null; receivables: ReceivableRow[]; sales: Array<{ id: string; reference: string; netMinor: string; paidMinor: string; dueDate: string | null; postedAt: string }>; payments: Array<{ id: string; amountMinor: string; postedAt: string }> } }>(`/api/v1/customers/${id}`);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<{ previewHash: string; allocations: Array<{ originType: string; amountMinor: string; dueDate: string | null }> } | null>(null);
  const [writeOff, setWriteOff] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const { data: context } = useLoad<{ accounts: Array<{ id: string; name: string; type: string; shopId: string | null }> }>(`/api/v1/customers/${id}/payment-context`);
  useEffect(() => {
    if (!accountId && context?.accounts[0]) setAccountId(context.accounts[0].id);
  }, [accountId, context]);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Skeleton className="h-64" />;
  const customer = data.customer;
  const accounts = context?.accounts ?? [];
  return <section className="space-y-6">
    <PageHeader title={customer.name} action={customer.openMinor !== "0" ? <Button onClick={() => document.getElementById("collect-receivable")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Encaisser une créance</Button> : undefined}>{customer.phone} · créance ouverte {formatFcfa(customer.openMinor)}</PageHeader>
    {message ? <Alert tone={message.includes("enregistré") ? "success" : "error"}>{message}</Alert> : null}
    <KpiStrip count={3}><KpiItem icon={<WalletCards />} value={formatFcfa(customer.openMinor)} label="reste dû" valueClassName="!text-lg" /><KpiItem icon={<UsersRound />} value={formatFcfa(customer.creditLimitMinor)} label="plafond" valueClassName="!text-lg" /><KpiItem icon={<RotateCcw />} value={customer.receivables.filter((row) => row.overdue).length} label="échéances en retard" /></KpiStrip>
    {preview ? <section className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Aperçu d’allocation</h2><p className="mt-1 text-sm text-[var(--muted)]">Échéance la plus ancienne, puis date de vente la plus ancienne.</p><ul className="mt-3 space-y-2 text-sm">{preview.allocations.map((line, index) => <li key={index} className="flex justify-between"><span>{receivableOriginLabel(line.originType)}{line.dueDate ? ` · ${formatShortDate(line.dueDate)}` : ""}</span><strong className="tabular-nums">{formatFcfa(line.amountMinor)}</strong></li>)}</ul><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => { api("/api/v1/customer-payments", { method: "POST", body: JSON.stringify({ customerId: customer.id, accountId, amountMinor: amount, previewHash: preview.previewHash }) }).then(() => { setPreview(null); setAmount(""); setMessage("Règlement enregistré. Ce n’est pas une vente."); return reload(); }).catch((caught: RequestError) => setMessage(caught.message)); }}>Confirmer le règlement</Button><Button variant="ghost" onClick={() => setPreview(null)}>Annuler</Button></div></section> : null}
    <section className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Créances ouvertes</h2><ul className="mt-3 divide-y divide-[var(--separator)]/60">{customer.receivables.length ? customer.receivables.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{receivableOriginLabel(row.originType)}</p><p className="text-[var(--muted)]">{formatShortDate(row.dueDate)}{row.overdue ? " · en retard" : ""}</p></div><strong className="tabular-nums">{formatFcfa(row.remainingMinor)}</strong></li>) : <p className="py-3 text-sm text-[var(--muted)]">Aucune créance ouverte.</p>}</ul></section>
    {customer.openMinor !== "0" ? <section id="collect-receivable" className="scroll-mt-24 rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Encaisser une créance</h2><p className="mt-1 text-sm text-[var(--muted)]">Enregistrez uniquement un montant réellement reçu. Ce règlement réduit la créance sans créer une nouvelle vente.</p><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!amount || !accountId) return; api<{ previewHash: string; allocations: Array<{ originType: string; amountMinor: string; dueDate: string | null }> }>("/api/v1/customer-payments/preview", { method: "POST", body: JSON.stringify({ customerId: customer.id, amountMinor: amount }) }).then(setPreview).catch((caught: RequestError) => setMessage(caught.message)); }}><Field id="collect-amount" label="Montant" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /><label className="block text-sm font-medium">Source<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><div className="sm:col-span-2"><Button type="submit" disabled={!amount || !accountId}>Préparer le règlement</Button></div></form></section> : null}
    {role === "OWNER" && customer.receivables[0] ? <section className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Abandon de créance</h2><p className="mt-1 text-sm text-[var(--muted)]">Aucun mouvement de caisse. Document d’ajustement WRITE_OFF.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field id="writeoff-amount" label="Montant" inputMode="numeric" value={writeOff} onChange={(event) => setWriteOff(event.target.value)} /><Field id="writeoff-reason" label="Motif" value={reason} onChange={(event) => setReason(event.target.value)} /></div><Button className="mt-4" variant="danger" onClick={() => { api(`/api/v1/receivables/${customer.receivables[0]!.id}/write-off`, { method: "POST", body: JSON.stringify({ amountMinor: writeOff, reason }) }).then(() => { setMessage("Abandon enregistré."); return reload(); }).catch((caught: RequestError) => setMessage(caught.message)); }}>Enregistrer l’abandon</Button></section> : null}
    <section className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Historique</h2><ul className="mt-3 divide-y divide-[var(--separator)]/60 text-sm">{customer.sales.map((sale) => <li key={sale.id} className="flex justify-between py-3"><span>{sale.reference}</span><span className="tabular-nums">{formatFcfa(sale.netMinor)}</span></li>)}{customer.payments.map((payment) => <li key={payment.id} className="flex justify-between py-3 text-[var(--muted)]"><span>Règlement</span><span className="tabular-nums">{formatFcfa(payment.amountMinor)}</span></li>)}</ul></section>
  </section>;
}

export function ReceivablesPage() {
  const { data, error } = useLoad<{ receivables: ReceivableRow[] }>("/api/v1/receivables");
  const credit = useCreditPolicy("OWNER");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const filtered = useMemo(() => (data?.receivables ?? []).filter((row) => {
    const matchesQuery = `${row.customer?.name ?? ""} ${row.shop}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (filter === "ALL" || (filter === "OVERDUE" ? row.overdue : !row.overdue));
  }), [data, filter, query]);
  const pagination = useTablePagination(filtered);
  const overdue = (data?.receivables ?? []).filter((row) => row.overdue);
  const total = (data?.receivables ?? []).reduce((sum, row) => sum + BigInt(row.remainingMinor), 0n);
  return <section className="space-y-6">
    <PageHeader title="Créances">Supervisez les sommes encore dues et ouvrez la fiche du client pour consulter leur historique.</PageHeader>
    {error || credit.error ? <Alert tone="error">{error ?? credit.error}</Alert> : null}
    {!credit.loading && credit.policy && !credit.policy.creditEnabled ? <Alert tone="warning"><strong>Crédit client désactivé dans la politique générale.</strong><span className="mt-1 block">Aucune nouvelle vente à crédit ne peut utiliser cette politique. Les {data?.receivables.length ?? 0} créance{(data?.receivables.length ?? 0) > 1 ? "s" : ""} existante{(data?.receivables.length ?? 0) > 1 ? "s" : ""} restent à recouvrer.</span></Alert> : null}
    <KpiStrip count={2}><KpiItem icon={<WalletCards />} value={formatFcfa(total)} label="reste dû" valueClassName="!text-lg" /><KpiItem icon={<RotateCcw />} value={overdue.length} label="en retard" /></KpiStrip>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative block flex-1"><span className="sr-only">Rechercher une créance</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); pagination.setPage(1); }} placeholder="Client ou boutique" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-9 pr-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label><select value={filter} onChange={(event) => { setFilter(event.target.value); pagination.setPage(1); }} className="h-11 rounded-lg bg-[var(--surface)] px-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" aria-label="Filtrer les créances"><option value="ALL">Toutes les échéances</option><option value="OVERDUE">En retard</option><option value="UPCOMING">À venir</option></select></div>
    {!data ? <Skeleton className="h-40" /> : filtered.length === 0 ? <EmptyState icon={<WalletCards />} title="Aucune créance correspondante">Modifiez la recherche ou le filtre pour afficher d’autres créances.</EmptyState> : <>
      <ul className="grid gap-3 lg:hidden">{pagination.pageItems.map((row) => <li key={row.id}><Link href={row.customer ? `${paths.ownerCustomers}/${row.customer.id}` : paths.ownerReceivables} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.customer?.name ?? "Solde d’ouverture"}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.shop} · {formatShortDate(row.dueDate)}</p></div><Badge tone={row.overdue ? "warning" : "neutral"}>{row.overdue ? "En retard" : "À venir"}</Badge></div><p className="mt-3 text-right font-semibold tabular-nums">{formatFcfa(row.remainingMinor)}</p></Link></li>)}</ul>
      <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] lg:block"><table className="w-full text-sm"><thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3">Client</th><th className="px-5 py-3">Boutique</th><th className="px-5 py-3">Échéance</th><th className="px-5 py-3">État</th><th className="px-5 py-3 text-right">Reste</th></tr></thead><tbody>{pagination.pageItems.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/60"><td className="px-5 py-3">{row.customer ? <Link href={`${paths.ownerCustomers}/${row.customer.id}`} className="font-semibold text-[var(--primary)]">{row.customer.name}</Link> : "Solde d’ouverture"}</td><td className="px-5 py-3">{row.shop}</td><td className="px-5 py-3">{formatShortDate(row.dueDate)}</td><td className="px-5 py-3"><Badge tone={row.overdue ? "warning" : "neutral"}>{row.overdue ? "En retard" : "À venir"}</Badge></td><td className="px-5 py-3 text-right font-semibold tabular-nums">{formatFcfa(row.remainingMinor)}</td></tr>)}</tbody></table></div>
      <TablePagination page={pagination.page} pageSize={pagination.pageSize} total={filtered.length} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="créance" />
    </>}
  </section>;
}

export function ReturnsPage({ role }: { role: "OWNER" | "MANAGER" }) {
  const { data, error } = useLoad<{ returns: ReturnRow[] }>("/api/v1/customer-returns");
  const base = role === "OWNER" ? paths.ownerReturns : paths.managerReturns;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const filtered = useMemo(() => (data?.returns ?? []).filter((row) => row.saleReference.toLowerCase().includes(query.trim().toLowerCase()) && (status === "ALL" || row.status === status)), [data, query, status]);
  const pagination = useTablePagination(filtered);
  const pendingDecision = (data?.returns ?? []).filter((row) => row.status === "REQUESTED").length;
  const pendingReceipt = (data?.returns ?? []).filter((row) => ["APPROVED", "PARTIALLY_RECEIVED"].includes(row.status)).length;
  const pendingRefund = (data?.returns ?? []).filter((row) => BigInt(row.refundDueMinor) > BigInt(row.refundedMinor)).length;
  return <section className="space-y-6">
    <PageHeader title="Retours clients" action={role === "MANAGER" ? <Link href={paths.managerSales}><Button><RotateCcw className="size-4" /> Demander un retour</Button></Link> : undefined}>Chaque retour reste lié à sa vente d’origine, qui n’est jamais réécrite.</PageHeader>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <KpiStrip count={3}><KpiItem icon={<RotateCcw />} value={pendingDecision} label="à décider" /><KpiItem icon={<UsersRound />} value={pendingReceipt} label="à recevoir" /><KpiItem icon={<WalletCards />} value={pendingRefund} label="à rembourser" /></KpiStrip>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative block flex-1"><span className="sr-only">Rechercher un retour</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); pagination.setPage(1); }} placeholder="Référence de vente" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-9 pr-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label><select aria-label="Filtrer les retours" value={status} onChange={(event) => { setStatus(event.target.value); pagination.setPage(1); }} className="h-11 rounded-lg bg-[var(--surface)] px-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="ALL">Tous les états</option>{Object.entries(returnLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {!data ? <Skeleton className="h-40" /> : filtered.length === 0 ? <EmptyState icon={<RotateCcw />} title={data.returns.length ? "Aucun retour correspondant" : "Aucun retour"}>{role === "MANAGER" ? <span>Commencez depuis une vente pour garantir les quantités, prix et paiements d’origine.</span> : <span>Les demandes envoyées par les boutiques apparaîtront ici.</span>}</EmptyState> : <>
      <ul className="space-y-3">{pagination.pageItems.map((row) => <li key={row.id}><Link href={`${base}/${row.id}`} className="block min-h-11 rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:flex sm:items-center sm:justify-between"><div><p className="font-semibold">{row.saleReference}</p><p className="mt-1 text-sm text-[var(--muted)]">Demandé le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(row.createdAt))} · {formatFcfa(row.requestedMinor)}</p></div><div className="mt-3 sm:mt-0"><Badge tone={statusTone(row.status)}>{returnLabels[row.status] ?? row.status}</Badge></div></Link></li>)}</ul>
      <TablePagination page={pagination.page} pageSize={pagination.pageSize} total={filtered.length} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="retour" />
    </>}
  </section>;
}

export function ReturnDetailPage({ role }: { role: "OWNER" | "MANAGER" }) {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useLoad<{ return: { id: string; status: string; reason: string; requestedMinor: string; approvedMinor: string; receivedMinor: string; refundDueMinor: string; refundedMinor: string; lines: Array<{ id: string; product: string; variant: string; requestedQty: string; approvedQty: string; receivedQty: string; disposition: string }> } }>(`/api/v1/customer-returns/${id}`);
  const { data: context } = useLoad<{ accounts: Array<{ id: string; name: string; type: string; shopId: string | null }> }>(`/api/v1/customers/${id}/payment-context`);
  const [accountId, setAccountId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId && context?.accounts[0]) setAccountId(context.accounts[0].id);
  }, [accountId, context]);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Skeleton className="h-56" />;
  const row = data.return;
  return <section className="space-y-6"><PageHeader title="Retour client">{row.reason}</PageHeader>{message ? <Alert>{message}</Alert> : null}<Badge tone={statusTone(row.status)}>{row.status}</Badge>
    <ul className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">{row.lines.map((line) => <li key={line.id} className="flex justify-between py-2 text-sm"><span>{line.product} · {line.variant}</span><span>{line.requestedQty} → {line.receivedQty} ({line.disposition})</span></li>)}</ul>
    {role === "OWNER" && row.status === "REQUESTED" ? <div className="flex gap-2"><Button onClick={() => { api(`/api/v1/customer-returns/${id}/decide`, { method: "POST", body: JSON.stringify({ outcome: "APPROVED" }) }).then(() => reload()).catch((caught: RequestError) => setMessage(caught.message)); }}>Approuver</Button><Button variant="danger" onClick={() => { api(`/api/v1/customer-returns/${id}/decide`, { method: "POST", body: JSON.stringify({ outcome: "REJECTED" }) }).then(() => reload()).catch((caught: RequestError) => setMessage(caught.message)); }}>Refuser</Button></div> : null}
    {role === "MANAGER" && ["APPROVED", "PARTIALLY_RECEIVED"].includes(row.status) ? <Button onClick={() => { api(`/api/v1/customer-returns/${id}/receive`, { method: "POST", body: JSON.stringify({ lines: row.lines.map((line) => ({ returnLineId: line.id, quantity: line.requestedQty, disposition: line.disposition === "DAMAGED" ? "DAMAGED" : "AVAILABLE" })) }) }).then(() => { setMessage("Réception enregistrée. Le remboursement n’est pas encore payé."); return reload(); }).catch((caught: RequestError) => setMessage(caught.message)); }}>Confirmer la réception</Button> : null}
    {role === "MANAGER" && BigInt(row.refundDueMinor) - BigInt(row.refundedMinor) > 0n ? <section className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Rembourser {formatFcfa((BigInt(row.refundDueMinor) - BigInt(row.refundedMinor)).toString())}</h2><label className="mt-3 block text-sm font-medium">Source<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3">{(context?.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><Button className="mt-4" onClick={() => { api(`/api/v1/customer-returns/${id}/refund`, { method: "POST", body: JSON.stringify({ accountId, amountMinor: (BigInt(row.refundDueMinor) - BigInt(row.refundedMinor)).toString() }) }).then(() => { setMessage("Remboursement payé."); return reload(); }).catch((caught: RequestError) => setMessage(caught.message)); }}>Payer le remboursement</Button></section> : null}
  </section>;
}

export function InventoryPage({ role }: { role: "OWNER" | "MANAGER" }) {
  const { data, error } = useLoad<{ counts: CountRow[] }>("/api/v1/stock-counts");
  const { data: shops } = useLoad<{ shops: Array<{ id: string; name: string }>; locations?: Array<{ id: string; name: string; shopId: string | null }> }>("/api/v1/shops");
  const { data: locations } = useLoad<{ locations: Array<{ id: string; name: string; shopId: string | null }> }>("/api/v1/locations");
  const [shopId, setShopId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const base = role === "OWNER" ? paths.ownerInventory : paths.managerInventory;
  return <section className="space-y-6"><PageHeader title="Inventaires" action={role === "OWNER" ? <Button onClick={() => { api<{ id: string }>("/api/v1/stock-counts", { method: "POST", body: JSON.stringify({ shopId, locationId }) }).then((created) => router.push(`${base}/${created.id}`)).catch((caught: RequestError) => setMessage(caught.message)); }}>Ouvrir un inventaire</Button> : undefined}>Le premier comptage est conservé. Un recomptage crée une nouvelle déclaration liée.</PageHeader>{error ? <Alert tone="error">{error}</Alert> : null}{message ? <Alert tone="error">{message}</Alert> : null}
    {role === "OWNER" ? <div className="grid gap-4 rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] sm:grid-cols-2"><label className="text-sm font-medium">Boutique<select value={shopId} onChange={(event) => setShopId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3"><option value="">Choisir</option>{(shops?.shops ?? []).map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label><label className="text-sm font-medium">Lieu<select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3"><option value="">Choisir</option>{(locations?.locations ?? []).filter((location) => !shopId || location.shopId === shopId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div> : null}
    {!data ? <Skeleton className="h-40" /> : <ul className="space-y-3">{data.counts.map((row) => <li key={row.id}><Link href={`${base}/${row.id}`} className="flex min-h-11 items-center justify-between rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div><p className="font-semibold">{row.shop} · {row.location}</p><p className="text-sm text-[var(--muted)]">Révision {row.revision}</p></div><Badge tone={statusTone(row.status)}>{row.status}</Badge></Link></li>)}</ul>}
  </section>;
}

export function InventoryDetailPage({ role }: { role: "OWNER" | "MANAGER" }) {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useLoad<{ count: { id: string; status: string; shop: string; location: string; revision: number; lines: Array<{ id: string; variantId: string; product: string; variant: string; compartment: string; declaredQty: string | null; expectedQty?: string; explanation: string | null }>; previous: { id: string; revision: number } | null } }>(`/api/v1/stock-counts/${id}`);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    setQuantities(Object.fromEntries(data.count.lines.map((line) => [line.id, line.declaredQty ?? ""])));
  }, [data]);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Skeleton className="h-56" />;
  const count = data.count;
  return <section className="space-y-6"><PageHeader title={`Inventaire · ${count.shop}`}>{count.location} · révision {count.revision}{count.previous ? ` · premier comptage conservé (${count.previous.id.slice(0, 8)})` : ""}</PageHeader>{message ? <Alert>{message}</Alert> : null}<Badge tone={statusTone(count.status)}>{count.status}</Badge>
    <ul className="space-y-3">{count.lines.map((line) => <li key={line.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{line.product} · {line.variant}</p><p className="text-sm text-[var(--muted)]">{line.compartment}{role === "OWNER" && line.expectedQty !== undefined ? ` · attendu ${line.expectedQty}` : ""}</p></div>{["COUNTING", "RECOUNT_REQUESTED"].includes(count.status) ? <Field id={`qty-${line.id}`} label="Compté" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} /> : <strong>{line.declaredQty ?? "—"}</strong>}</div></li>)}</ul>
    {["COUNTING", "RECOUNT_REQUESTED"].includes(count.status) ? <div className="flex flex-wrap gap-2"><Button onClick={() => { api(`/api/v1/stock-counts/${id}/lines`, { method: "POST", body: JSON.stringify({ lines: count.lines.map((line) => ({ variantId: line.variantId, compartment: line.compartment, quantity: quantities[line.id] || "0" })) }) }).then(() => setMessage("Saisie enregistrée.")).catch((caught: RequestError) => setMessage(caught.message)); }}>Enregistrer</Button><Button variant="secondary" onClick={() => { api(`/api/v1/stock-counts/${id}/submit`, { method: "POST" }).then(() => { setMessage("Comptage soumis."); return reload(); }).catch((caught: RequestError) => setMessage(caught.message)); }}>Soumettre</Button></div> : null}
    {role === "OWNER" && count.status === "SUBMITTED" ? <div className="flex flex-wrap gap-2"><Button onClick={() => { api(`/api/v1/stock-counts/${id}/approve`, { method: "POST", body: JSON.stringify({ explanations: Object.fromEntries(count.lines.filter((line) => line.expectedQty && line.declaredQty && line.expectedQty !== line.declaredQty).map((line) => [line.id, line.explanation || "Écart d’inventaire validé"])) }) }).then(() => { setMessage("Inventaire validé."); return reload(); }).catch((caught: RequestError) => setMessage(caught.message)); }}>Valider les écarts</Button><Button variant="secondary" onClick={() => { api<{ id: string }>(`/api/v1/stock-counts/${id}/recount`, { method: "POST", body: JSON.stringify({ reason: "Recomptage demandé" }) }).then((created) => { window.location.href = `${paths.ownerInventory}/${created.id}`; }).catch((caught: RequestError) => setMessage(caught.message)); }}>Demander un recomptage</Button></div> : null}
  </section>;
}

export function LossesPage({ role }: { role: "OWNER" | "MANAGER" }) {
  const { data, error, reload } = useLoad<{ losses: LossRow[] }>("/api/v1/stock-losses");
  const { data: context, error: contextError } = useLoad<{ options: LossOption[] }>("/api/v1/stock-losses/context");
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [physicalState, setPhysicalState] = useState<"DAMAGED" | "MISSING">("DAMAGED");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [pending, setPending] = useState(false);
  const selected = context?.options.find((option) => `${option.variantId}:${option.locationId}:${option.compartment}:${option.lotId ?? "none"}` === selectedKey);
  const filtered = useMemo(() => (data?.losses ?? []).filter((row) => `${row.product} ${row.variant} ${row.shop} ${row.reason}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === "ALL" || row.status === status)), [data, query, status]);
  const pagination = useTablePagination(filtered);
  const requested = (data?.losses ?? []).filter((row) => row.status === "REQUESTED").length;
  const declarationCount = data?.losses.length ?? 0;
  const reset = () => { setSelectedKey(""); setQuantity(""); setReason(""); setPhysicalState("DAMAGED"); setReceipt(null); };
  const submit = async () => {
    if (!selected) return;
    setPending(true); setMessage(null);
    try {
      const attachmentIds: string[] = [];
      if (receipt) {
        const payload = await filePayload(receipt);
        const created = await api<{ id: string }>("/api/v1/attachments", { method: "POST", body: JSON.stringify({ documentType: "stock_losses", mime: receipt.type, size: receipt.size, name: receipt.name, sha256: payload.sha256 }) });
        await api(`/api/v1/attachments/${created.id}/content`, { method: "POST", body: JSON.stringify({ base64: payload.base64 }) });
        attachmentIds.push(created.id);
      }
      await api("/api/v1/stock-losses", { method: "POST", body: JSON.stringify({ variantId: selected.variantId, locationId: selected.locationId, lotId: selected.lotId ?? undefined, quantity, compartment: selected.compartment, reason, physicalState, attachmentIds }) });
      setOpen(false); reset(); setMessage(role === "MANAGER" ? "Déclaration transmise au propriétaire." : "Perte déclarée et isolée du stock vendable."); await reload();
    } catch (caught) { setMessage(caught instanceof RequestError ? caught.message : "La déclaration n’a pas pu être enregistrée."); }
    finally { setPending(false); }
  };
  return <section className="space-y-6">
    <PageHeader title="Pertes et casse" action={<Button onClick={() => { setMessage(null); setOpen(true); }}><Plus className="size-4" /> Déclarer une perte ou une casse</Button>}>Déclarez l’écart physique sans supprimer ni recompter silencieusement le stock.</PageHeader>
    {error || contextError ? <Alert tone="error">{error ?? contextError}</Alert> : null}{message && !open ? <Alert tone={message.includes("transmise") || message.includes("isolée") ? "success" : "error"}>{message}</Alert> : null}
    <KpiStrip count={2}><KpiItem icon={<AlertTriangle />} value={requested} label="à valider" /><KpiItem icon={<RotateCcw />} value={declarationCount} label="déclarations enregistrées" /></KpiStrip>
    <div><h2 className="font-display text-lg font-semibold">Historique des déclarations</h2><p className="mt-1 text-sm text-[var(--muted)]">Une déclaration du gérant reste contrôlable par le propriétaire et ne peut pas être effacée.</p></div>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative block flex-1"><span className="sr-only">Rechercher une perte</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); pagination.setPage(1); }} placeholder="Produit, boutique ou motif" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-9 pr-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label><select aria-label="Filtrer les pertes" value={status} onChange={(event) => { setStatus(event.target.value); pagination.setPage(1); }} className="h-11 rounded-lg bg-[var(--surface)] px-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="ALL">Tous les états</option>{Object.entries(lossLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {!data ? <Skeleton className="h-40" /> : filtered.length === 0 ? <EmptyState icon={<AlertTriangle />} title="Aucune déclaration">Les pertes, casses et manquants déclarés apparaîtront ici.</EmptyState> : <><ul className="space-y-3">{pagination.pageItems.map((row) => <li key={row.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{row.product} · {row.variant}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.shop}{row.lot ? ` · lot ${row.lot}` : ""} · {row.quantity} · {compartmentLabels[row.compartment] ?? row.compartment}</p><p className="mt-2 text-sm">{row.reason}</p></div><div className="flex items-center gap-2"><Badge tone={statusTone(row.status)}>{lossLabels[row.status] ?? row.status}</Badge>{role === "OWNER" && row.status !== "WRITTEN_OFF" ? <Button className="h-9" variant="secondary" onClick={() => { api(`/api/v1/stock-losses/${row.id}/write-off`, { method: "POST" }).then(() => reload()).catch((caught: RequestError) => setMessage(caught.message)); }}>Solder la perte</Button> : null}</div></div></li>)}</ul><TablePagination page={pagination.page} pageSize={pagination.pageSize} total={filtered.length} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="déclaration" /></>}
    <Modal open={open} onOpenChange={(value) => { setOpen(value); if (!value) { reset(); setMessage(null); } }} title="Déclarer une perte ou une casse" description={role === "MANAGER" ? "La quantité sera isolée immédiatement puis soumise au propriétaire pour décision." : "La quantité sera isolée immédiatement. Le solde comptable restera traçable jusqu’à sa validation."} size="lg" error={open ? message : null}>
      <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium sm:col-span-2">Article, lieu et compartiment<select required value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir une ligne de stock</option>{(context?.options ?? []).map((option) => { const key = `${option.variantId}:${option.locationId}:${option.compartment}:${option.lotId ?? "none"}`; return <option key={key} value={key}>{option.product} · {option.variant} · {option.location} · {compartmentLabels[option.compartment]}{option.lotCode ? ` · lot ${option.lotCode}` : ""} · disponible ${option.quantity}</option>; })}</select></label><label className="block text-sm font-medium">Nature<select value={physicalState} onChange={(event) => setPhysicalState(event.target.value as "DAMAGED" | "MISSING")} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="DAMAGED">Casse ou détérioration</option><option value="MISSING">Manquant constaté</option></select></label><Field id="loss-qty" label="Quantité constatée" inputMode="decimal" required value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))} /></div>
        <div><Label htmlFor="loss-reason">Motif détaillé</Label><Textarea id="loss-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-[var(--surface-subtle)] p-4 font-medium"><FileUp className="size-5 text-[var(--primary)]" /><span>{receipt?.name ?? "Ajouter un justificatif (facultatif)"}</span><input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} /></label>
        {selected ? <Alert><strong>Effet de la déclaration</strong><span className="mt-1 block">{quantity || "0"} unité{quantity === "1" ? "" : "s"} sera{quantity === "1" ? "" : "ont"} retirée{quantity === "1" ? "" : "s"} du compartiment « {compartmentLabels[selected.compartment]} » et placée{quantity === "1" ? "" : "s"} en « {physicalState === "MISSING" ? "Manquant à contrôler" : "Endommagé"} ». L’historique restera conservé.</span></Alert> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={pending || !selected || !quantity || reason.trim().length < 3}>{pending ? "Enregistrement…" : role === "MANAGER" ? "Transmettre la déclaration" : "Enregistrer la déclaration"}</Button></div>
      </form>
    </Modal>
  </section>;
}

export function SupplierReturnsPage() {
  type SupplierReturnRow = { id: string; purchaseId: string; purchaseReference: string; supplier: string; shop: string; reason: string; status: string; dispatchedMinor: string; debtReductionMinor: string; reimbursementDueMinor: string; reimbursementReceivedMinor?: string; createdAt: string };
  type FundAccount = { id: string; name: string; type: string; shopId: string | null; shopName: string; balanceMinor: string };
  const { data, error, reload } = useLoad<{ returns: SupplierReturnRow[] }>("/api/v1/supplier-returns");
  const { data: funds, error: fundsError } = useLoad<{ accounts: FundAccount[] }>("/api/v1/fund-accounts");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<SupplierReturnRow | null>(null);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const labels: Record<string, string> = { REQUESTED: "À décider", APPROVED: "Autorisé", REJECTED: "Refusé", DISPATCHED: "Expédié · avoir attendu", CREDIT_CONFIRMED: "Avoir confirmé · remboursement attendu", SETTLED: "Clôturé" };
  const rows = data?.returns ?? [];
  const filtered = useMemo(() => rows.filter((row) => `${row.supplier} ${row.purchaseReference} ${row.shop} ${row.reason}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === "ALL" || row.status === status)), [rows, query, status]);
  const pagination = useTablePagination(filtered);
  const dispatched = rows.filter((row) => row.status === "DISPATCHED").length;
  const receivedOf = (row: SupplierReturnRow) => BigInt(row.reimbursementReceivedMinor ?? "0");
  const remainingOf = (row: SupplierReturnRow) => {
    const remaining = BigInt(row.reimbursementDueMinor ?? "0") - receivedOf(row);
    return remaining > 0n ? remaining : 0n;
  };
  const reimbursementDue = rows.reduce((sum, row) => sum + remainingOf(row), 0n);
  const openReceipt = (row: SupplierReturnRow) => { setSelected(row); setAmount(remainingOf(row).toString()); setAccountId(funds?.accounts[0]?.id ?? ""); setReference(""); setMessage(null); };
  const receive = async () => {
    if (!selected) return;
    setPending(true); setMessage(null);
    try {
      await api(`/api/v1/supplier-returns/${selected.id}/receive-reimbursement`, { method: "POST", body: JSON.stringify({ accountId, amountMinor: amount, ...(reference.trim() ? { reference: reference.trim() } : {}) }) });
      setSelected(null); setMessage("Remboursement fournisseur encaissé et journalisé."); await reload();
    } catch (caught) { setMessage(caught instanceof RequestError ? caught.message : "Le remboursement n’a pas pu être enregistré."); }
    finally { setPending(false); }
  };
  return <section className="space-y-6">
    <PageHeader title="Retours fournisseurs">Suivez l’expédition, l’avoir reçu et les remboursements encore dus par les fournisseurs.</PageHeader>
    {error || fundsError ? <Alert tone="error">{error ?? fundsError}</Alert> : null}{message && !selected ? <Alert tone="success">{message}</Alert> : null}
    <Alert><strong>Comment lire les montants ?</strong><span className="mt-1 block">L’avoir réduit d’abord la dette de l’achat. Si son montant dépasse la dette restante, la différence devient une somme à recevoir du fournisseur. Aucun encaissement n’est créé automatiquement.</span></Alert>
    <KpiStrip count={3}><KpiItem icon={<RotateCcw />} value={rows.length} label="retours enregistrés" /><KpiItem icon={<AlertTriangle />} value={dispatched} label="avoirs à confirmer" /><KpiItem icon={<WalletCards />} value={formatFcfa(reimbursementDue)} label="à recevoir" valueClassName="!text-lg" /></KpiStrip>
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative block flex-1"><span className="sr-only">Rechercher un retour fournisseur</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); pagination.setPage(1); }} placeholder="Fournisseur, achat, boutique ou motif" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-9 pr-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label><select aria-label="Filtrer les retours fournisseurs" value={status} onChange={(event) => { setStatus(event.target.value); pagination.setPage(1); }} className="h-11 rounded-lg bg-[var(--surface)] px-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="ALL">Tous les états</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {!data ? <Skeleton className="h-48" /> : filtered.length === 0 ? <EmptyState icon={<RotateCcw />} title={query || status !== "ALL" ? "Aucun résultat" : "Aucun retour fournisseur"}>{query || status !== "ALL" ? "Modifiez la recherche ou le filtre." : "Les retours liés aux achats apparaîtront ici."}</EmptyState> : <>
      <ul className="space-y-3">{pagination.pageItems.map((row) => { const remaining = remainingOf(row); return <li key={row.id} className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><Link href={`${paths.ownerPurchases}/${row.purchaseId}`} className="font-semibold text-[var(--primary)] hover:underline">{row.supplier} · {row.purchaseReference}</Link><p className="mt-1 text-sm text-[var(--muted)]">{row.shop} · {new Date(row.createdAt).toLocaleDateString("fr-FR", { dateStyle: "medium" })}</p><p className="mt-2 text-sm">{row.reason}</p></div><Badge tone={statusTone(row.status)}>{labels[row.status] ?? "État inconnu"}</Badge></div><div className="mt-4 grid gap-3 rounded-lg bg-[var(--surface-subtle)] p-4 text-sm sm:grid-cols-4"><div><p className="text-[var(--muted)]">Marchandises expédiées</p><p className="mt-1 font-semibold tabular-nums">{formatFcfa(row.dispatchedMinor)}</p></div><div><p className="text-[var(--muted)]">Dette fournisseur réduite</p><p className="mt-1 font-semibold tabular-nums">{formatFcfa(row.debtReductionMinor)}</p></div><div><p className="text-[var(--muted)]">Déjà remboursé</p><p className="mt-1 font-semibold tabular-nums">{formatFcfa(receivedOf(row))}</p></div><div><p className="text-[var(--muted)]">Reste à recevoir</p><p className="mt-1 font-semibold tabular-nums">{formatFcfa(remaining)}</p></div></div>{remaining > 0n ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-[var(--muted)]">Enregistrez le remboursement uniquement lorsque les fonds sont réellement arrivés.</p><Button className="shrink-0" onClick={() => openReceipt(row)}><WalletCards className="size-4" /> Enregistrer le remboursement</Button></div> : null}</li>; })}</ul>
      <TablePagination page={pagination.page} pageSize={pagination.pageSize} total={filtered.length} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="retour" />
    </>}
    <Modal open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setMessage(null); } }} title="Enregistrer le remboursement fournisseur" description={selected ? `${selected.supplier} · reste attendu ${formatFcfa(remainingOf(selected))}` : "Enregistrez uniquement les fonds réellement reçus."} size="sm" error={selected ? message : null}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void receive(); }}>
        <Field id="supplier-refund-amount" label="Montant reçu (FCFA)" inputMode="numeric" required value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
        <label className="block text-sm font-medium">Compte destinataire<select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir une caisse ou un compte</option>{(funds?.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.shopName}</option>)}</select></label>
        <Field id="supplier-refund-reference" label="Référence (facultative)" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Ex. Virement 45821" />
        <Alert><strong>Effet de la validation</strong><span className="mt-1 block">Le compte choisi sera crédité et la créance fournisseur sera réduite du même montant. Cette opération ne crée ni vente ni dépense.</span></Alert>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setSelected(null)}>Annuler</Button><Button type="submit" disabled={pending || !amount || !accountId}>{pending ? "Enregistrement…" : "Confirmer l’encaissement"}</Button></div>
      </form>
    </Modal>
  </section>;
}

export function HandoversPage() {
  type HandoverRow = { id: string; shop: string; from: string; to: string; status: string; recovery: boolean; reason: string; createdAt: string };
  type ShopChoice = { id: string; name: string; manager: string | null; managerId: string | null };
  type UserChoice = { id: string; displayName: string; role: string; status: string; assignments: Array<{ shopId: string; shopName: string; endedAt: string | null }> };
  const { data, error, reload } = useLoad<{ handovers: HandoverRow[] }>("/api/v1/shop-handovers");
  const { data: shops, error: shopsError } = useLoad<{ shops: ShopChoice[] }>("/api/v1/shops");
  const { data: users, error: usersError } = useLoad<{ users: UserChoice[] }>("/api/v1/users");
  const [open, setOpen] = useState(false);
  const [shopId, setShopId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [reason, setReason] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const selectedShop = shops?.shops.find((shop) => shop.id === shopId);
  const candidates = (users?.users ?? []).filter((user) => user.role === "MANAGER" && ["ACTIVE", "INVITED"].includes(user.status) && user.id !== selectedShop?.managerId);
  const filtered = useMemo(() => (data?.handovers ?? []).filter((row) => `${row.shop} ${row.from} ${row.to} ${row.reason}`.toLowerCase().includes(query.trim().toLowerCase())), [data, query]);
  const pagination = useTablePagination(filtered);
  const active = (data?.handovers ?? []).filter((row) => ["PENDING", "RECOVERY"].includes(row.status)).length;
  const labels: Record<string, string> = { PENDING: "À confirmer par le nouveau gérant", RECOVERY: "Secours · confirmation requise", COMPLETED: "Terminée" };
  const reset = () => { setShopId(""); setToUserId(""); setReason(""); setRecovery(false); };
  const submit = async () => {
    setPending(true); setMessage(null);
    try {
      await api("/api/v1/shop-handovers", { method: "POST", body: JSON.stringify({ shopId, toUserId, reason, recovery }) });
      setOpen(false); reset(); setMessage("Passation enregistrée. Le nouveau gérant doit maintenant la confirmer depuis un appareil principal approuvé."); await reload();
    } catch (caught) { setMessage(caught instanceof RequestError ? caught.message : "La passation n’a pas pu être enregistrée."); }
    finally { setPending(false); }
  };
  return <section className="space-y-6">
    <PageHeader title="Passations de gérant" action={<Button onClick={() => { setMessage(null); setOpen(true); }}><Plus className="size-4" /> Nouvelle passation</Button>}>Transférez la responsabilité d’une boutique sans modifier ses stocks, soldes, créances ni historiques.</PageHeader>
    {error || shopsError || usersError ? <Alert tone="error">{error ?? shopsError ?? usersError}</Alert> : null}{message && !open ? <Alert tone={message.startsWith("Passation enregistrée") ? "success" : "error"}>{message}</Alert> : null}
    <KpiStrip count={2}><KpiItem icon={<RotateCcw />} value={(data?.handovers ?? []).length} label="passations enregistrées" /><KpiItem icon={<UsersRound />} value={active} label="à confirmer" /></KpiStrip>
    <div><h2 className="font-display text-lg font-semibold">Historique des passations</h2><p className="mt-1 text-sm text-[var(--muted)]">Chaque changement conserve le gérant sortant, le successeur, le motif et le mode utilisé.</p></div>
    <label className="relative block"><span className="sr-only">Rechercher une passation</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /><input value={query} onChange={(event) => { setQuery(event.target.value); pagination.setPage(1); }} placeholder="Boutique, gérant ou motif" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-9 pr-3 shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
    {!data ? <Skeleton className="h-44" /> : filtered.length === 0 ? <EmptyState icon={<UsersRound />} title={query ? "Aucune passation trouvée" : "Aucune passation"}>{query ? "Modifiez votre recherche." : "Les changements de gérant apparaîtront ici."}</EmptyState> : <><ul className="space-y-3">{pagination.pageItems.map((row) => <li key={row.id} className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold">{row.shop}</p><p className="mt-1 text-sm"><span className="text-[var(--muted)]">Gérant sortant :</span> {row.from} <span aria-hidden="true">→</span> <span className="text-[var(--muted)]">Nouveau gérant :</span> {row.to}</p><p className="mt-2 text-sm text-[var(--muted)]">{row.reason} · {new Date(row.createdAt).toLocaleDateString("fr-FR", { dateStyle: "medium" })}</p></div><Badge tone={statusTone(row.status)}>{labels[row.status] ?? "État inconnu"}</Badge></div>{row.recovery ? <p className="mt-3 rounded-lg bg-[var(--surface-subtle)] p-3 text-sm">Procédure de secours utilisée : la boutique a été suspendue en mode sécurité et les appareils du gérant sortant ont été révoqués.</p> : null}</li>)}</ul><TablePagination page={pagination.page} pageSize={pagination.pageSize} total={filtered.length} totalPages={pagination.totalPages} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} itemLabel="passation" /></>}
    <Modal open={open} onOpenChange={(value) => { setOpen(value); if (!value) { reset(); setMessage(null); } }} title="Nouvelle passation" description="Choisissez la boutique et un autre gérant. Le changement sera journalisé et devra être confirmé par le successeur." size="lg" error={open ? message : null}>
      <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="block text-sm font-medium">Boutique<select required value={shopId} onChange={(event) => { setShopId(event.target.value); setToUserId(""); }} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">Choisir une boutique</option>{(shops?.shops ?? []).filter((shop) => shop.managerId).map((shop) => <option key={shop.id} value={shop.id}>{shop.name} · gérant actuel : {shop.manager}</option>)}</select></label>
        <label className="block text-sm font-medium">Nouveau gérant<select required disabled={!shopId} value={toUserId} onChange={(event) => setToUserId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface-subtle)] px-3 outline-none focus:ring-2 focus:ring-[var(--focus)]"><option value="">{shopId ? "Choisir un autre gérant" : "Choisissez d’abord une boutique"}</option>{candidates.map((user) => { const current = user.assignments.find((assignment) => !assignment.endedAt); return <option key={user.id} value={user.id}>{user.displayName}{current ? ` · actuellement ${current.shopName}` : " · disponible"}</option>; })}</select></label>
        <div><Label htmlFor="handover-reason">Motif de la passation</Label><Textarea id="handover-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        <label className="flex min-h-11 items-start gap-3 rounded-lg bg-[var(--surface-subtle)] p-4 text-sm"><input className="mt-1" type="checkbox" checked={recovery} onChange={(event) => setRecovery(event.target.checked)} /><span><strong className="block">Procédure de secours</strong><span className="mt-1 block text-[var(--muted)]">À utiliser seulement si l’appareil principal du gérant sortant est perdu ou inaccessible.</span></span></label>
        {recovery ? <Alert tone="warning"><strong>Effet immédiat du mode secours</strong><span className="mt-1 block">La boutique sera suspendue en mode sécurité, les appareils actifs du gérant sortant seront révoqués et toute session de caisse ouverte sera clôturée.</span></Alert> : <Alert><strong>Passation planifiée</strong><span className="mt-1 block">La session de caisse doit être clôturée et l’appareil principal du gérant sortant doit être disponible.</span></Alert>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={pending || !shopId || !toUserId || reason.trim().length < 3}>{pending ? "Enregistrement…" : "Lancer la passation"}</Button></div>
      </form>
    </Modal>
  </section>;
}

export function NewCustomerReturnPage() {
  const router = useRouter();
  const [saleId, setSaleId] = useState("");
  const { data: sales } = useLoad<{ sales: Array<{ id: string; reference: string }> }>("/api/v1/sales");
  const { data: sale } = useLoad<{ sale: { id: string; lines: Array<{ id: string; product: string; variant: string; quantity: string }> } }>(saleId ? `/api/v1/sales/${saleId}` : "/api/v1/sales");
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  return <section className="space-y-6"><PageHeader title="Demander un retour">La vente d’origine restera inchangée.</PageHeader>{message ? <Alert tone="error">{message}</Alert> : null}
    <label className="block text-sm font-medium">Vente<select value={saleId} onChange={(event) => setSaleId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface)] px-3 shadow-[var(--shadow-card)]">{(sales?.sales ?? []).map((row) => <option key={row.id} value={row.id}>{row.reference}</option>)}</select></label>
    {sale && "lines" in sale.sale ? <ul className="space-y-3">{sale.sale.lines.map((line) => <li key={line.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{line.product} · {line.variant}</p><p className="text-sm text-[var(--muted)]">Vendue : {line.quantity}</p><Field id={`ret-${line.id}`} label="Quantité retournée" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} /></li>)}</ul> : null}
    <div><Label htmlFor="return-reason">Motif</Label><Textarea id="return-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
    <Button onClick={() => { const lines = Object.entries(quantities).filter(([, value]) => value && Number(value) > 0).map(([saleLineId, quantity]) => ({ saleLineId, quantity })); api<{ id: string }>("/api/v1/customer-returns", { method: "POST", body: JSON.stringify({ saleId, reason, lines }) }).then((created) => router.push(`${paths.managerReturns}/${created.id}`)).catch((caught: RequestError) => setMessage(caught.message)); }}>Envoyer la demande</Button>
  </section>;
}
