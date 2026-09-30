"use client";

import { ArrowRight, ClipboardList, PackageCheck, Plus, Search, Trash2, Truck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api, RequestError } from "../../lib/api";
import { formatFcfa } from "../../lib/money";
import { paths } from "../../lib/session";
import { Alert } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { EmptyState } from "../ui/empty-state";
import { Field } from "../ui/field";
import { Label } from "../ui/label";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";
import { Textarea } from "../ui/textarea";
import { buyerLabel, requestStatus, shipmentStatus, urgencyLabel } from "./p06-labels";

type RequestRow = { id: string; status: string; urgency: string; comment: string; shopName: string; actorName: string; createdAt: string; version: number };
type Catalog = {
  suppliers: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; type: string }>;
  locations: Array<{ id: string; name: string; type: string }>;
  products: Array<{ id: string; name: string; variants: Array<{ id: string; name: string; units: Array<{ id: string; name: string; symbol: string; precision: number }> }> }>;
};
type RequestDetail = {
  id: string;
  status: string;
  urgency: string;
  comment: string;
  shopName: string;
  actorName: string;
  estimatedFeesMinor: string;
  suggestedSupplier: { name: string } | null;
  lines: Array<{ id: string; productName: string; variantName: string; unitName: string; quantityBase: string; estimatedUnitMinor: string | null; variantId: string; unitId: string }>;
  actions: Array<{ id: string; type: string; text: string; actorName: string; createdAt: string }>;
  approval: null | {
    id: string;
    outcome: string;
    buyer: string | null;
    budgetMinor: string;
    remainingBudgetMinor: string;
    reason: string | null;
    lines: Array<{ requestLineId: string; maxQtyBase: string; remainingQtyBase: string; maxAmountMinor: string }>;
  };
  capabilities: { canSubmit: boolean; canEdit: boolean; canRespond: boolean; canBuy: boolean; canWithdraw: boolean };
  versions: Array<{ id: string; version: number; status: string }>;
};
type ShipmentRow = {
  id: string;
  status: string;
  sourceName: string;
  destinationName: string;
  purchaseReference: string | null;
  createdAt: string;
  remaining: boolean;
  lines: Array<{ id: string; variantId?: string; productName: string; variantName: string; dispatchedQty: string; receivedQty: string; remainingQty: string }>;
  capabilities: { canDispatch: boolean; canReceive: boolean; canSubmit: boolean };
  receipts?: Array<{ id: string; createdAt: string; deliveryComplete: boolean; lines: Array<{ acceptedQty: string; damagedQty: string; surplusQty: string }> }>;
};

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function scaledQuantity(value: string) {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return BigInt(`${whole || "0"}${fraction.padEnd(6, "0").slice(0, 6)}`);
}

function lineAmount(unitPriceMinor: string, quantity: string) {
  return BigInt(unitPriceMinor || "0") * scaledQuantity(quantity || "0") / 1_000_000n;
}

function quantityNumber(value: string) {
  const parsed = Number(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ManagerRequestsPage() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const load = () => {
    setError(null);
    api<{ requests: RequestRow[] }>("/api/v1/requests").then((payload) => setRows(payload.requests)).catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, []);
  const filtered = (rows ?? []).filter((row) => {
    const match = `${row.comment} ${row.status}`.toLowerCase().includes(query.toLowerCase());
    if (!match) return false;
    if (filter === "pending") return ["SUBMITTED", "NEEDS_INFO"].includes(row.status);
    if (filter === "done") return ["APPROVED", "PARTIAL", "REJECTED", "CANCELLED", "CLOSED"].includes(row.status);
    return true;
  });
  if (!rows && !error) return <Skeleton className="h-[32rem]" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Demandes d’achat" action={<Link href={paths.managerRequestNew}><Button>Nouvelle demande</Button></Link>}>
        Préparez le besoin de la boutique. L’achat et le stock n’avancent qu’après décision du propriétaire.
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label className="relative block max-w-md"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Motif ou état" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
      <div className="flex flex-wrap gap-2">
        {([["all", "Toutes"], ["pending", "En attente"], ["done", "Terminées"]] as const).map(([value, label]) => (
          <Button key={value} variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)}>{label}</Button>
        ))}
      </div>
      {!rows || filtered.length === 0 ? (
        <EmptyState title="Aucune demande" icon={<ClipboardList className="size-5" />} action={<Link href={paths.managerRequestNew}><Button>Créer une demande</Button></Link>}>
          Décrivez les produits manquants, puis soumettez. Le propriétaire approuve les quantités et le budget avant tout achat.
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-3 xl:hidden">{filtered.map((row) => (
            <li key={row.id}><Link href={`${paths.managerRequests}/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.comment}</p><p className="mt-1 text-sm text-[var(--muted)]">{formatWhen(row.createdAt)}</p><div className="mt-2"><Badge tone={requestStatus[row.status]?.tone ?? "neutral"}>{requestStatus[row.status]?.label ?? row.status}</Badge></div></Link></li>
          ))}</ul>
          <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] xl:block">
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Motif</th><th className="px-5 py-3 font-medium">État</th><th className="px-5 py-3 font-medium">Urgence</th><th className="px-5 py-3 font-medium">Date</th></tr></thead>
              <tbody>{filtered.map((row) => (
                <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-3"><Link className="font-medium text-[var(--primary)]" href={`${paths.managerRequests}/${row.id}`}>{row.comment}</Link></td><td className="px-5 py-3"><Badge tone={requestStatus[row.status]?.tone ?? "neutral"}>{requestStatus[row.status]?.label ?? row.status}</Badge></td><td className="px-5 py-3">{urgencyLabel[row.urgency]}</td><td className="px-5 py-3">{formatWhen(row.createdAt)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function ManagerRequestFormPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [comment, setComment] = useState("");
  const [urgency, setUrgency] = useState("NORMAL");
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<Array<{ variantId: string; unitId: string; quantity: string; label: string }>>([]);
  useEffect(() => {
    api<Catalog>("/api/v1/replenishment/context").then(setCatalog).catch((caught: RequestError) => setError(caught.message));
  }, []);
  const product = catalog?.products.find((item) => item.id === productId);
  const variant = product?.variants.find((item) => item.id === variantId);
  function addLine() {
    if (!variant || !unitId) return;
    const unit = variant.units.find((item) => item.id === unitId);
    setLines((current) => [...current, { variantId, unitId, quantity, label: `${product?.name} · ${variant.name} · ${quantity} ${unit?.symbol ?? ""}` }]);
    setQuantity("1");
  }
  async function save(submit: boolean) {
    setPending(true); setError(null);
    try {
      const created = await api<{ id: string }>("/api/v1/requests", { method: "POST", body: JSON.stringify({ comment, urgency, suggestedSupplierId: supplierId || undefined, lines: lines.map(({ label: _label, ...line }) => line) }) });
      if (submit) await api(`/api/v1/requests/${created.id}/submit`, { method: "POST" });
      router.push(`${paths.managerRequests}/${created.id}`);
    } catch (caught) { setError((caught as RequestError).message); } finally { setPending(false); }
  }
  if (!catalog && !error) return <Skeleton className="h-[32rem]" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Nouvelle demande">Décrivez le besoin. Rien n’est acheté ni mis en stock à cette étape.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-display font-semibold">Contexte</h2>
            <div className="mt-4 grid gap-4">
              <div><Label htmlFor="comment">Motif</Label><Textarea id="comment" value={comment} onChange={(event) => setComment(event.target.value)} minLength={5} /></div>
              <div><Label htmlFor="urgency">Urgence</Label><select id="urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="LOW">Basse</option><option value="NORMAL">Normale</option><option value="HIGH">Haute</option></select></div>
              <div><Label htmlFor="supplier">Fournisseur envisagé (facultatif)</Label><select id="supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Aucun</option>{catalog?.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
            </div>
          </article>
          <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-display font-semibold">Lignes</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div><Label htmlFor="product">Produit</Label><select id="product" value={productId} onChange={(event) => { setProductId(event.target.value); setVariantId(""); setUnitId(""); }} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><Label htmlFor="variant">Variante</Label><select id="variant" value={variantId} onChange={(event) => { setVariantId(event.target.value); setUnitId(""); }} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{product?.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><Label htmlFor="unit">Unité</Label><select id="unit" value={unitId} onChange={(event) => setUnitId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{variant?.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <Field id="qty" label="Quantité" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
            <Button className="mt-4" variant="secondary" onClick={addLine} disabled={!unitId}><Plus className="size-4" />Ajouter la ligne</Button>
            <ul className="mt-4 divide-y divide-[var(--separator)]/60">{lines.map((line, index) => <li key={`${line.variantId}-${index}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{line.label}</span><Button aria-label={`Retirer ${line.label}`} variant="ghost" onClick={() => setLines(lines.filter((_, current) => current !== index))}><Trash2 className="size-4" />Retirer</Button></li>)}</ul>
            {lines.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Ajoutez au moins un produit avant d’enregistrer.</p> : null}
          </article>
        </div>
        <aside className="h-fit rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] xl:sticky xl:top-4">
          <h2 className="font-display font-semibold">Synthèse</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">{lines.length} ligne{lines.length > 1 ? "s" : ""} · aucune écriture de stock</p>
          <div className="mt-4 grid gap-2">
            <Button disabled={pending || lines.length === 0 || comment.trim().length < 5} onClick={() => void save(false)}>{pending ? "Enregistrement…" : "Enregistrer le brouillon"}</Button>
            <Button variant="secondary" disabled={pending || lines.length === 0 || comment.trim().length < 5} onClick={() => void save(true)}>Soumettre au propriétaire</Button>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function ManagerRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [pending, setPending] = useState(false);
  const load = () => {
    api<{ request: RequestDetail }>(`/api/v1/requests/${params.id}`).then((payload) => setData(payload.request)).catch((caught: RequestError) => setError(caught.message));
  };
  useEffect(() => { void load(); }, [params.id]);
  if (!data && !error) return <Skeleton className="h-[32rem]" />;
  if (!data) return <section className="space-y-4"><PageHeader title="Demande">Dossier introuvable.</PageHeader><Alert tone="error">{error}</Alert></section>;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Détail de la demande" action={data.capabilities.canBuy ? <Button onClick={() => router.push(`${paths.managerPurchaseNew}?requestId=${data.id}`)}>Acheter selon l’accord</Button> : undefined}>
        {data.shopName} · version {data.versions.at(-1)?.version ?? 1}
      </PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2"><Badge tone={requestStatus[data.status]?.tone ?? "neutral"}>{requestStatus[data.status]?.label ?? data.status}</Badge><Badge>{urgencyLabel[data.urgency]}</Badge></div>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Besoin</h2>
        <p className="mt-2 text-sm leading-6">{data.comment}</p>
        {data.suggestedSupplier ? <p className="mt-2 text-sm text-[var(--muted)]">Fournisseur envisagé : {data.suggestedSupplier.name}</p> : null}
      </article>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Lignes</h2>
        <ul className="mt-3 divide-y divide-[var(--separator)]/60">{data.lines.map((line) => <li key={line.id} className="flex justify-between gap-3 py-3 text-sm"><span>{line.productName} · {line.variantName}</span><strong className="tabular-nums">{line.quantityBase} {line.unitName}</strong></li>)}</ul>
      </article>
      {data.approval ? (
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display font-semibold">Accord</h2>
          <p className="mt-2 text-sm">Acheteur désigné : {buyerLabel[data.approval.buyer ?? ""] ?? "—"}</p>
          <p className="mt-1 text-sm">Budget restant : {formatFcfa(data.approval.remainingBudgetMinor)}</p>
          {data.approval.reason ? <p className="mt-2 text-sm text-[var(--muted)]">{data.approval.reason}</p> : null}
        </article>
      ) : null}
      {data.capabilities.canRespond ? (
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display font-semibold">Répondre aux précisions</h2>
          <Label htmlFor="response">Votre réponse</Label>
          <Textarea id="response" className="mt-3" value={response} onChange={(event) => setResponse(event.target.value)} />
          <Button className="mt-3" disabled={pending || response.trim().length < 5} onClick={() => { setPending(true); api(`/api/v1/requests/${data.id}/respond`, { method: "POST", body: JSON.stringify({ text: response }) }).then((result) => router.push(`${paths.managerRequests}/${(result as { id: string }).id}`)).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Envoyer la réponse</Button>
        </article>
      ) : null}
      {data.capabilities.canSubmit ? <Button onClick={() => { setPending(true); api(`/api/v1/requests/${data.id}/submit`, { method: "POST" }).then(() => load()).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Soumettre</Button> : null}
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Historique</h2>
        <ol className="mt-3 space-y-3 text-sm">{data.actions.map((action) => <li key={action.id}><p className="font-medium">{action.actorName}</p><p className="text-[var(--muted)]">{action.text}</p><p className="text-xs text-[var(--muted)]">{formatWhen(action.createdAt)}</p></li>)}</ol>
      </article>
    </section>
  );
}

export function ManagerPurchaseNewPage() {
  const router = useRouter();
  const search = useSearchParams();
  const requestId = search.get("requestId");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [accountId, setAccountId] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [newSupplier, setNewSupplier] = useState("");
  useEffect(() => {
    Promise.all([
      api<Catalog>("/api/v1/replenishment/context"),
      requestId ? api<{ request: RequestDetail }>(`/api/v1/requests/${requestId}`) : Promise.resolve(null),
    ]).then(([context, payload]) => {
      setCatalog(context);
      if (payload) setRequest(payload.request);
    }).catch((caught: RequestError) => setError(caught.message));
  }, [requestId]);
  const lines = request?.lines ?? [];
  const total = lines.reduce((sum, line) => sum + lineAmount(prices[line.id] || "0", line.quantityBase), 0n);
  const allPricesEntered = lines.length > 0 && lines.every((line) => BigInt(prices[line.id] || "0") > 0n);
  const selectedAccount = catalog?.accounts.find((account) => account.id === accountId);
  async function ensureSupplier() {
    if (supplierId) return supplierId;
    if (!newSupplier.trim()) throw new RequestError(422, "INVALID_INPUT", "Indiquez un fournisseur.");
    const created = await api<{ id: string }>("/api/v1/suppliers", { method: "POST", body: JSON.stringify({ name: newSupplier }) });
    return created.id;
  }
  async function submit() {
    setPending(true); setError(null);
    try {
      if (!request?.approval || !request.capabilities.canBuy) throw new RequestError(409, "APPROVAL_REQUIRED", "Aucun accord achetable n’est disponible.");
      const id = await ensureSupplier();
      const payload = {
        supplierId: id,
        approvalId: request.approval.id,
        requestId: request.id,
        receiveNow,
        deliveryComplete: receiveNow,
        lines: lines.map((line) => ({ variantId: line.variantId, unitId: line.unitId, quantity: line.quantityBase, unitPriceMinor: prices[line.id] || "0" })),
        payments: accountId && total > 0n ? [{ accountId, amountMinor: total.toString() }] : [],
      };
      const path = receiveNow ? "/api/v1/purchases/with-receipt" : "/api/v1/purchases";
      const created = await api<{ id: string }>(path, { method: "POST", body: JSON.stringify(payload) });
      router.push(`${paths.managerPurchases}/${created.id}`);
    } catch (caught) { setError((caught as RequestError).message); } finally { setPending(false); }
  }
  if (!catalog && !error) return <Skeleton className="h-[32rem]" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Achat autorisé">Saisissez les prix réellement payés. Le stock n’augmente qu’à la réception validée.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!request ? <Alert tone="error">Ouvrez cet écran depuis une demande approuvée.</Alert> : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-display font-semibold">1. Fournisseur</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Sélectionnez une entreprise connue ou créez sa fiche minimale.</p>
              <div className="mt-4 grid gap-3">
                <div><Label htmlFor="supplier">Fournisseur connu</Label><select id="supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Nouveau</option>{catalog?.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
                {!supplierId ? <Field id="new-supplier" label="Nom du fournisseur" value={newSupplier} onChange={(event) => setNewSupplier(event.target.value)} /> : null}
              </div>
            </article>
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-display font-semibold">2. Prix réellement négociés</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Les quantités proviennent de l’accord et ne peuvent pas être élargies ici.</p>
              <ul className="mt-4 space-y-3">{lines.map((line) => (
                <li key={line.id} className="grid gap-3 rounded-lg bg-[var(--surface-subtle)] p-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
                  <div><p className="font-medium">{line.productName} · {line.variantName}</p><p className="mt-1 text-sm text-[var(--muted)]">Quantité autorisée : {line.quantityBase} {line.unitName}</p><p className="mt-2 text-sm font-semibold tabular-nums">Sous-total : {formatFcfa(lineAmount(prices[line.id] || "0", line.quantityBase).toString())}</p></div>
                  <Field id={`price-${line.id}`} label="Prix unitaire (FCFA)" inputMode="numeric" value={prices[line.id] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [line.id]: event.target.value.replace(/\D/g, "") }))} />
                </li>
              ))}</ul>
            </article>
            <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-display font-semibold">3. Paiement et réception</h2>
              <div className="mt-4 grid gap-3">
                <div><Label htmlFor="account">Source de fonds</Label><select id="account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Payer plus tard</option>{catalog?.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
                <label className="flex items-start gap-3 rounded-lg bg-[var(--surface-subtle)] p-4 text-sm"><input className="mt-1" type="checkbox" checked={receiveNow} onChange={(event) => setReceiveNow(event.target.checked)} /><span><strong className="block">Marchandise déjà arrivée et contrôlée</strong><span className="mt-1 block text-[var(--muted)]">Le stock augmentera immédiatement. Décochez si une réception physique doit encore être confirmée.</span></span></label>
              </div>
            </article>
          </div>
          <aside className="h-fit rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] xl:sticky xl:top-4">
            <h2 className="font-display font-semibold">Synthèse</h2>
            <dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt>Marchandises</dt><dd className="font-semibold tabular-nums">{formatFcfa(total.toString())}</dd></div><div className="flex justify-between gap-3"><dt>Budget disponible</dt><dd className="tabular-nums">{formatFcfa(request.approval?.remainingBudgetMinor)}</dd></div><div className="flex justify-between gap-3"><dt>Paiement</dt><dd className="text-right">{selectedAccount?.name ?? "À payer plus tard"}</dd></div></dl>
            {!allPricesEntered ? <Alert className="mt-4" tone="warning">Renseignez un prix positif pour chaque ligne.</Alert> : null}
            <Button className="mt-4 w-full" disabled={pending || !allPricesEntered || (!supplierId && !newSupplier.trim())} onClick={() => void submit()}>{pending ? "Enregistrement…" : receiveNow ? "Acheter et recevoir" : "Enregistrer l’achat"}</Button>
          </aside>
        </div>
      )}
    </section>
  );
}

export function ManagerReceiptsPage() {
  const [rows, setRows] = useState<ShipmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ shipments: ShipmentRow[] }>("/api/v1/shipments?kind=in").then((payload) => setRows(payload.shipments)).catch((caught: RequestError) => setError(caught.message));
  }, []);
  const expected = (rows ?? []).filter((row) => row.capabilities.canReceive);
  if (!rows && !error) return <Skeleton className="h-[32rem]" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Réceptions attendues">Confirmez les quantités réellement arrivées. Le transit restant reste visible.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {expected.length === 0 ? <EmptyState title="Aucune réception en attente" icon={<PackageCheck className="size-5" />}>Les livraisons destinées à votre boutique apparaîtront ici.</EmptyState> : (
        <ul className="grid gap-3">{expected.map((row) => (
          <li key={row.id}><Link href={`${paths.managerReceipts}/${row.id}`} className="group block rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{row.sourceName} <ArrowRight className="mx-1 inline size-4" /> {row.destinationName}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.purchaseReference ?? "Transfert interne"} · {row.lines.length} produit{row.lines.length > 1 ? "s" : ""}</p></div><div className="flex items-center gap-3"><Badge tone={shipmentStatus[row.status]?.tone ?? "neutral"}>{shipmentStatus[row.status]?.label ?? row.status}</Badge><ArrowRight className="size-4 text-[var(--muted)] transition group-hover:translate-x-1" /></div></div></Link></li>
        ))}</ul>
      )}
    </section>
  );
}

export function ManagerReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ShipmentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [lines, setLines] = useState<Record<string, { accepted: string; damaged: string; surplus: string; lot?: string; expires?: string; remarks?: string }>>({});
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    api<{ shipment: ShipmentRow }>(`/api/v1/shipments/${params.id}`).then((payload) => {
      setData(payload.shipment);
      setLines(Object.fromEntries(payload.shipment.lines.map((line) => [line.id, { accepted: "", damaged: "0", surplus: "0" }])));
    }).catch((caught: RequestError) => setError(caught.message));
  }, [params.id]);
  const summary = useMemo(() => data?.lines.map((line) => ({ ...line, ...(lines[line.id] ?? { accepted: "0", damaged: "0", surplus: "0" }) })) ?? [], [data, lines]);
  const totals = useMemo(() => summary.reduce((result, line) => ({ expected: result.expected + quantityNumber(line.remainingQty), accepted: result.accepted + quantityNumber(line.accepted), damaged: result.damaged + quantityNumber(line.damaged), surplus: result.surplus + quantityNumber(line.surplus) }), { expected: 0, accepted: 0, damaged: 0, surplus: 0 }), [summary]);
  async function submit() {
    setPending(true); setError(null);
    try {
      await api("/api/v1/receipts", { method: "POST", body: JSON.stringify({ shipmentId: params.id, deliveryComplete: complete, lines: summary.map((line) => ({ shipmentLineId: line.id, acceptedQty: line.accepted || "0", damagedQty: line.damaged || "0", surplusQty: line.surplus || "0", lotCode: line.lot || undefined, expiresOn: line.expires || undefined, remarks: line.remarks || undefined })) }) });
      setConfirm(false);
      router.push(paths.managerReceipts);
    } catch (caught) { setError((caught as RequestError).message); } finally { setPending(false); }
  }
  if (!data && !error) return <Skeleton className="h-[32rem]" />;
  if (!data) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Confirmer la réception">{data.sourceName} <ArrowRight className="mx-1 inline size-4" /> {data.destinationName}</PageHeader>
      {error && !confirm ? <Alert tone="error">{error}</Alert> : null}
      <Alert>Indiquez les quantités réellement constatées. Il n’existe pas d’action qui marque tout comme reçu sans contrôle.</Alert>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Attendu", totals.expected], ["Accepté", totals.accepted], ["Endommagé", totals.damaged], ["Surplus", totals.surplus]].map(([label, value]) => <article key={label} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></article>)}</div>
      <ul className="grid gap-3">{data.lines.map((line) => (
        <li key={line.id} className="rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{line.productName} · {line.variantName}</p><p className="mt-1 text-sm text-[var(--muted)]">Comptez cette ligne séparément.</p></div><Badge>Attendu : {line.remainingQty}</Badge></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field id={`${line.id}-ok`} label="Accepté vendable" value={lines[line.id]?.accepted ?? ""} onChange={(event) => setLines((current) => ({ ...current, [line.id]: { ...current[line.id]!, accepted: event.target.value, damaged: current[line.id]?.damaged ?? "0", surplus: current[line.id]?.surplus ?? "0" } }))} />
            <Field id={`${line.id}-dmg`} label="Endommagé" value={lines[line.id]?.damaged ?? "0"} onChange={(event) => setLines((current) => ({ ...current, [line.id]: { ...current[line.id]!, accepted: current[line.id]?.accepted ?? "", damaged: event.target.value, surplus: current[line.id]?.surplus ?? "0" } }))} />
            <Field id={`${line.id}-extra`} label="Surplus constaté" value={lines[line.id]?.surplus ?? "0"} onChange={(event) => setLines((current) => ({ ...current, [line.id]: { ...current[line.id]!, accepted: current[line.id]?.accepted ?? "", damaged: current[line.id]?.damaged ?? "0", surplus: event.target.value } }))} />
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">Manquant estimé : le reliquat non accepté ni endommagé. Cochez « livraison terminée » pour ouvrir le dossier.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field id={`${line.id}-lot`} label="Lot (facultatif)" value={lines[line.id]?.lot ?? ""} onChange={(event) => setLines((current) => ({ ...current, [line.id]: { ...current[line.id]!, accepted: current[line.id]?.accepted ?? "", damaged: current[line.id]?.damaged ?? "0", surplus: current[line.id]?.surplus ?? "0", lot: event.target.value, expires: current[line.id]?.expires ?? "", remarks: current[line.id]?.remarks ?? "" } }))} />
            <Field id={`${line.id}-exp`} label="Péremption (AAAA-MM-JJ)" value={lines[line.id]?.expires ?? ""} onChange={(event) => setLines((current) => ({ ...current, [line.id]: { ...current[line.id]!, accepted: current[line.id]?.accepted ?? "", damaged: current[line.id]?.damaged ?? "0", surplus: current[line.id]?.surplus ?? "0", lot: current[line.id]?.lot ?? "", expires: event.target.value, remarks: current[line.id]?.remarks ?? "" } }))} />
            <div className="sm:col-span-2"><Label htmlFor={`${line.id}-note`}>Remarque</Label><Textarea id={`${line.id}-note`} value={lines[line.id]?.remarks ?? ""} onChange={(event) => setLines((current) => ({ ...current, [line.id]: { ...current[line.id]!, accepted: current[line.id]?.accepted ?? "", damaged: current[line.id]?.damaged ?? "0", surplus: current[line.id]?.surplus ?? "0", lot: current[line.id]?.lot ?? "", expires: current[line.id]?.expires ?? "", remarks: event.target.value } }))} /></div>
          </div>
        </li>
      ))}</ul>
      <label className="flex items-start gap-3 rounded-xl bg-[var(--surface)] p-4 text-sm shadow-[var(--shadow-card)]"><input className="mt-1" type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)} /><span><strong className="block">Le fournisseur confirme que cette livraison est terminée</strong><span className="mt-1 block text-[var(--muted)]">S’il reste un manquant, le système ouvrira le dossier correspondant. Laissez décoché lorsqu’un reliquat doit encore arriver.</span></span></label>
      <div className="flex justify-end"><Button disabled={!data.capabilities.canReceive} onClick={() => { setError(null); setConfirm(true); }}>Vérifier cette réception</Button></div>
      <ConfirmDialog open={confirm} error={confirm ? error : null} onOpenChange={(open) => { setConfirm(open); if (!open) setError(null); }} title="Confirmer les quantités reçues" confirmLabel="Enregistrer la réception" pending={pending} onConfirm={() => void submit()}>
        <ul className="space-y-2 text-sm">{summary.map((line) => <li key={line.id}>{line.productName} : accepté {line.accepted || "0"}, endommagé {line.damaged || "0"}, surplus {line.surplus || "0"}</li>)}</ul>
      </ConfirmDialog>
    </section>
  );
}

export function ManagerTransferDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ShipmentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const load = () => api<{ shipment: ShipmentRow }>(`/api/v1/shipments/${params.id}`).then((payload) => setData(payload.shipment)).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => { void load(); }, [params.id]);
  if (!data && !error) return <Skeleton className="h-[32rem]" />;
  if (!data) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6">
      <PageHeader title="Expédition boutique">{data.sourceName} <ArrowRight className="mx-1 inline size-4" /> {data.destinationName}</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-[var(--muted)]">État de l’expédition</p><div className="mt-2"><Badge tone={shipmentStatus[data.status]?.tone ?? "neutral"}>{shipmentStatus[data.status]?.label ?? data.status}</Badge></div></div><p className="text-sm text-[var(--muted)]">Créée le {formatWhen(data.createdAt)}</p></div></article>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Produits à expédier</h2><ul className="mt-3 divide-y divide-[var(--separator)]/60">{data.lines.map((line) => <li key={line.id} className="grid gap-2 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="font-medium">{line.productName}</p><p className="text-[var(--muted)]">{line.variantName}</p></div><div className="flex gap-4 tabular-nums"><span>{line.dispatchedQty} envoyé</span><strong>{line.remainingQty} restant</strong></div></li>)}</ul></article>
      {(data.capabilities.canSubmit || data.capabilities.canDispatch) ? <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Prochaine action</h2><p className="mt-1 text-sm text-[var(--muted)]">{data.capabilities.canDispatch ? "Confirmez uniquement après la sortie physique de la marchandise. Le stock sera débité à ce moment." : "Soumettez la préparation au propriétaire avant toute sortie physique."}</p><div className="mt-4">{data.capabilities.canSubmit ? <Button disabled={pending} onClick={() => { setPending(true); api(`/api/v1/shipments/${data.id}/submit`, { method: "POST" }).then(() => load()).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Soumettre au propriétaire</Button> : null}{data.capabilities.canDispatch ? <Button disabled={pending} onClick={() => { setPending(true); api(`/api/v1/shipments/${data.id}/dispatch`, { method: "POST" }).then(() => load()).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Confirmer la sortie physique</Button> : null}</div></article> : null}
    </section>
  );
}

export function ManagerPurchasesPage() {
  const [rows, setRows] = useState<Array<{ id: string; reference: string; supplierName: string; receivedStatus: string; paymentStatus: string; createdAt: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api<{ purchases: NonNullable<typeof rows> }>("/api/v1/purchases").then((payload) => setRows(payload.purchases)).catch((caught: RequestError) => setError(caught.message));
  }, []);
  if (!rows && !error) return <Skeleton className="h-80" />;
  const filtered = (rows ?? []).filter((row) => `${row.reference} ${row.supplierName}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Achats de la boutique">Suivez les achats autorisés et les livraisons destinées à votre boutique. Les coûts d’achat restent réservés au propriétaire.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {(rows ?? []).length > 0 ? <label className="relative block max-w-md"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher un achat</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Référence ou fournisseur" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label> : null}
      {filtered.length === 0 ? <EmptyState title={rows?.length ? "Aucun résultat" : "Aucun achat"} icon={<PackageCheck className="size-5" />}>{rows?.length ? "Modifiez votre recherche pour retrouver un achat." : "Les achats autorisés pour cette boutique apparaîtront ici."}</EmptyState> : (
        <><ul className="grid gap-3 lg:hidden">{filtered.map((row) => (
          <li key={row.id}><Link href={`${paths.managerPurchases}/${row.id}`} className="group block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{row.reference}</p><Badge>{receivedStatusLabel(row.receivedStatus)}</Badge></div><p className="mt-2 text-sm text-[var(--muted)]">{row.supplierName} · {formatWhen(row.createdAt)}</p></Link></li>
        ))}</ul><div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] lg:block"><table className="w-full text-sm"><thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Référence</th><th className="px-5 py-3 font-medium">Fournisseur</th><th className="px-5 py-3 font-medium">Réception</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3"><span className="sr-only">Ouvrir</span></th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-4 font-medium">{row.reference}</td><td className="px-5 py-4">{row.supplierName}</td><td className="px-5 py-4"><Badge>{receivedStatusLabel(row.receivedStatus)}</Badge></td><td className="px-5 py-4">{formatWhen(row.createdAt)}</td><td className="px-5 py-4 text-right"><Link className="inline-flex items-center gap-2 font-medium text-[var(--primary)]" href={`${paths.managerPurchases}/${row.id}`}>Consulter <ArrowRight className="size-4" /></Link></td></tr>)}</tbody></table></div></>
      )}
    </section>
  );
}

export function ManagerPurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ reference: string; supplier: { name: string }; receivedStatus: string; paymentStatus: string; shipments: Array<{ id: string; status: string; destinationName: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ purchase: NonNullable<typeof data> }>(`/api/v1/purchases/${params.id}`).then((payload) => setData(payload.purchase)).catch((caught: RequestError) => setError(caught.message));
  }, [params.id]);
  if (!data && !error) return <Skeleton className="h-80" />;
  if (!data) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6">
      <PageHeader title={`Achat ${data.reference}`}>{data.supplier.name}</PageHeader>
      <div className="grid gap-3 sm:grid-cols-2"><article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Réception</p><div className="mt-2"><Badge>{receivedStatusLabel(data.receivedStatus)}</Badge></div></article><article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Paiement fournisseur</p><div className="mt-2"><Badge>{paymentStatusLabel(data.paymentStatus)}</Badge></div><p className="mt-2 text-xs text-[var(--muted)]">Le détail financier reste réservé au propriétaire.</p></article></div>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Livraisons vers la boutique</h2>{data.shipments.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Aucune livraison n’est encore planifiée.</p> : <ul className="mt-3 divide-y divide-[var(--separator)]/60">{data.shipments.map((shipment) => <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"><div><p className="font-medium">{shipment.destinationName}</p><Link className="mt-1 inline-flex items-center gap-1 text-[var(--primary)]" href={`${paths.managerReceipts}/${shipment.id}`}>Voir la réception <ArrowRight className="size-4" /></Link></div><Badge tone={shipmentStatus[shipment.status]?.tone ?? "neutral"}>{shipmentStatus[shipment.status]?.label ?? shipment.status}</Badge></li>)}</ul>}</article>
    </section>
  );
}

function receivedStatusLabel(value: string) {
  return { NONE: "Non reçue", PARTIAL: "Réception partielle", COMPLETE: "Réception complète" }[value] ?? value;
}
function paymentStatusLabel(value: string) {
  return { DUE: "À payer", PARTIAL: "Paiement partiel", PAID: "Réglé" }[value] ?? value;
}

export function ManagerTransfersPage() {
  const [rows, setRows] = useState<ShipmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ shipments: ShipmentRow[] }>("/api/v1/shipments?kind=out").then((payload) => setRows(payload.shipments)).catch((caught: RequestError) => setError(caught.message));
  }, []);
  if (!rows && !error) return <Skeleton className="h-80" />;
  return (
    <section className="space-y-6">
      <PageHeader title="Expéditions">Suivez les envois depuis votre boutique.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {(rows ?? []).length === 0 ? <EmptyState title="Aucune expédition" icon={<Truck className="size-5" />}>Les transferts à envoyer apparaîtront ici.</EmptyState> : (
        <ul className="grid gap-3">{(rows ?? []).map((row) => <li key={row.id}><Link href={`${paths.managerTransfers}/${row.id}`} className="group block rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{row.sourceName} <ArrowRight className="mx-1 inline size-4" /> {row.destinationName}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.lines.length} produit{row.lines.length > 1 ? "s" : ""} · {formatWhen(row.createdAt)}</p></div><div className="flex items-center gap-3"><Badge tone={shipmentStatus[row.status]?.tone ?? "neutral"}>{shipmentStatus[row.status]?.label ?? row.status}</Badge><ArrowRight className="size-4 text-[var(--muted)] transition group-hover:translate-x-1" /></div></div></Link></li>)}</ul>
      )}
    </section>
  );
}
