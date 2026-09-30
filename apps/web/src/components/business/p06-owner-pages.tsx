"use client";

import { ClipboardList, Package, Plus, Search, Truck, Warehouse } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
import { buyerLabel, paymentStatus, purchaseStatus, receivedStatus, requestStatus, shipmentStatus, urgencyLabel } from "./p06-labels";

type RequestRow = { id: string; status: string; urgency: string; comment: string; shopName: string; actorName: string; createdAt: string };
type RequestDetail = {
  id: string;
  status: string;
  urgency: string;
  comment: string;
  shopName: string;
  actorName: string;
  lines: Array<{ id: string; productName: string; variantName: string; unitName: string; quantityBase: string; estimatedUnitMinor: string | null }>;
  actions: Array<{ id: string; text: string; actorName: string; createdAt: string }>;
  approval: null | { budgetMinor: string; remainingBudgetMinor: string; buyer: string | null; reason: string | null };
  capabilities: { canDecide: boolean; canCancelRemainder: boolean };
  versions: Array<{ id: string; version: number; status: string }>;
};
type Catalog = {
  suppliers: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; balanceMinor?: string }>;
  locations: Array<{ id: string; name: string; shopName: string }>;
  products: Array<{ id: string; name: string; variants: Array<{ id: string; name: string; units: Array<{ id: string; name: string }> }> }>;
};
type PurchaseRow = { id: string; reference: string; supplierName: string; shopName: string | null; status: string; receivedStatus: string; paymentStatus: string; goodsMinor?: string; paidMinor?: string; createdAt: string };
type SupplierRow = { id: string; name: string; phone: string | null; status: string; tradeName: string | null };
type ShipmentRow = {
  id: string;
  status: string;
  sourceName: string;
  destinationName: string;
  purchaseReference?: string | null;
  createdAt: string;
  capabilities: { canDispatch: boolean; canApprove?: boolean; canReceive?: boolean };
  lines: Array<{ id?: string; variantId?: string; productName: string; remainingQty: string; dispatchedQty: string; receivedQty?: string }>;
  receipts?: Array<{
    id: string;
    createdAt: string;
    deliveryComplete: boolean;
    actorName: string;
    surplusCaseId: string | null;
    missingCaseId: string | null;
    lines: Array<{ acceptedQty: string; damagedQty: string; surplusQty: string; remarks: string | null }>;
  }>;
};

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OwnerRequestsPage() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api<{ requests: RequestRow[] }>("/api/v1/requests").then((payload) => setRows(payload.requests)).catch((caught: RequestError) => setError(caught.message));
  }, []);
  const filtered = (rows ?? []).filter((row) => `${row.comment} ${row.shopName}`.toLowerCase().includes(query.toLowerCase()));
  if (!rows && !error) return <Skeleton className="h-[32rem]" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Demandes des boutiques">Approuvez un budget et des quantités, refusez, ou demandez une précision. L’achat reste un événement distinct.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label className="relative block max-w-md"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Boutique, motif" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
      {filtered.length === 0 ? <EmptyState title="Aucune demande" icon={<ClipboardList className="size-5" />}>Les demandes soumises par les gérants apparaîtront ici.</EmptyState> : (
        <>
          <ul className="grid gap-3 xl:hidden">{filtered.map((row) => (
            <li key={row.id}><Link href={`${paths.ownerRequests}/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.shopName}</p><p className="mt-1 text-sm">{row.comment}</p><Badge tone={requestStatus[row.status]?.tone ?? "neutral"}>{requestStatus[row.status]?.label ?? row.status}</Badge></Link></li>
          ))}</ul>
          <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] xl:block">
            <table className="w-full text-sm"><thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Boutique</th><th className="px-5 py-3 font-medium">Motif</th><th className="px-5 py-3 font-medium">État</th><th className="px-5 py-3 font-medium">Date</th></tr></thead>
            <tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-3">{row.shopName}</td><td className="px-5 py-3"><Link className="text-[var(--primary)]" href={`${paths.ownerRequests}/${row.id}`}>{row.comment}</Link></td><td className="px-5 py-3"><Badge tone={requestStatus[row.status]?.tone ?? "neutral"}>{requestStatus[row.status]?.label ?? row.status}</Badge></td><td className="px-5 py-3">{formatWhen(row.createdAt)}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
    </section>
  );
}

export function OwnerRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<RequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"APPROVED" | "PARTIAL" | "REJECTED" | "NEEDS_INFO">("APPROVED");
  const [reason, setReason] = useState("");
  const [budget, setBudget] = useState("");
  const [buyer, setBuyer] = useState("MANAGER");
  const load = () => api<{ request: RequestDetail }>(`/api/v1/requests/${params.id}`).then((payload) => setData(payload.request)).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => { void load(); }, [params.id]);
  async function decide() {
    setPending(true); setModalError(null);
    try {
      await api(`/api/v1/requests/${params.id}/decision`, { method: "POST", body: JSON.stringify({ outcome, reason: reason || undefined, budgetMinor: budget || undefined, buyer: outcome === "APPROVED" || outcome === "PARTIAL" ? buyer : undefined, lines: data?.lines.map((line) => ({ requestLineId: line.id, maxQtyBase: line.quantityBase, maxAmountMinor: budget || "0" })) }) });
      setOpen(false);
      await load();
    } catch (caught) { setModalError((caught as RequestError).message); } finally { setPending(false); }
  }
  if (!data && !error) return <Skeleton className="h-[32rem]" />;
  if (!data) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title={`Demande · ${data.shopName}`} action={data.capabilities.canDecide ? <Button onClick={() => { setModalError(null); setOpen(true); }}>Décider</Button> : undefined}>{data.actorName} · {urgencyLabel[data.urgency]}</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Badge tone={requestStatus[data.status]?.tone ?? "neutral"}>{requestStatus[data.status]?.label ?? data.status}</Badge>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Besoin</h2><p className="mt-2 text-sm leading-6">{data.comment}</p></article>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Lignes</h2>
        <ul className="mt-3 divide-y divide-[var(--separator)]/60">{data.lines.map((line) => <li key={line.id} className="flex justify-between py-3 text-sm"><span>{line.productName} · {line.variantName}</span><span>{line.quantityBase} {line.unitName}</span></li>)}</ul>
      </article>
      {data.approval ? <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Dernier accord</h2><p className="mt-2 text-sm">Budget restant {formatFcfa(data.approval.remainingBudgetMinor)} · {buyerLabel[data.approval.buyer ?? ""]}</p></article> : null}
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Historique</h2><ol className="mt-3 space-y-3 text-sm">{data.actions.map((action) => <li key={action.id}><p className="font-medium">{action.actorName}</p><p className="text-[var(--muted)]">{action.text}</p></li>)}</ol></article>
      <ConfirmDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setModalError(null); }} title="Décision sur la demande" confirmLabel="Enregistrer la décision" pending={pending} error={modalError} onConfirm={() => void decide()}>
        <div className="grid gap-3">
          <div><Label htmlFor="outcome">Décision</Label><select id="outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="APPROVED">Approuver</option><option value="PARTIAL">Approuver partiellement</option><option value="NEEDS_INFO">Demander une précision</option><option value="REJECTED">Refuser</option></select></div>
          {(outcome === "APPROVED" || outcome === "PARTIAL") ? (
            <>
              <Field id="budget" label="Budget autorisé (FCFA)" inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} />
              <div><Label htmlFor="buyer">Acheteur</Label><select id="buyer" value={buyer} onChange={(event) => setBuyer(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="MANAGER">Gérant</option><option value="OWNER">Propriétaire</option><option value="EXISTING_STOCK">Stock existant</option></select></div>
            </>
          ) : null}
          <div><Label htmlFor="reason">Motif</Label><Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        </div>
      </ConfirmDialog>
    </section>
  );
}

export function OwnerPurchasesPage() {
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ purchases: PurchaseRow[] }>("/api/v1/purchases").then((payload) => setRows(payload.purchases)).catch((caught: RequestError) => setError(caught.message));
  }, []);
  if (!rows && !error) return <Skeleton className="h-[32rem]" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Achats" action={<Link href={paths.ownerPurchaseNew}><Button>Nouvel achat</Button></Link>}>Suivez paiements, expéditions et réceptions jusqu’à la clôture de contrôle.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {(rows ?? []).length === 0 ? <EmptyState title="Aucun achat" icon={<Package className="size-5" />} action={<Link href={paths.ownerPurchaseNew}><Button>Enregistrer un achat</Button></Link>}>Créez un achat, répartissez les quantités, puis suivez chaque réception.</EmptyState> : (
        <>
          <ul className="grid gap-3 xl:hidden">{(rows ?? []).map((row) => <li key={row.id}><Link href={`${paths.ownerPurchases}/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.reference}</p><p className="text-sm text-[var(--muted)]">{row.supplierName}</p><p className="mt-2 tabular-nums">{row.goodsMinor ? formatFcfa(row.goodsMinor) : "—"}</p></Link></li>)}</ul>
          <div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] xl:block">
            <table className="w-full text-sm"><thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Référence</th><th className="px-5 py-3 font-medium">Fournisseur</th><th className="px-5 py-3 font-medium">État</th><th className="px-5 py-3 font-medium">Réception</th><th className="px-5 py-3 font-medium">Paiement</th><th className="px-5 py-3 text-right font-medium">Marchandises</th></tr></thead>
            <tbody>{(rows ?? []).map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-3"><Link className="text-[var(--primary)]" href={`${paths.ownerPurchases}/${row.id}`}>{row.reference}</Link></td><td className="px-5 py-3">{row.supplierName}</td><td className="px-5 py-3"><Badge tone={purchaseStatus[row.status]?.tone ?? "neutral"}>{purchaseStatus[row.status]?.label ?? row.status}</Badge></td><td className="px-5 py-3"><Badge tone={receivedStatus[row.receivedStatus]?.tone ?? "neutral"}>{receivedStatus[row.receivedStatus]?.label ?? row.receivedStatus}</Badge></td><td className="px-5 py-3"><Badge tone={paymentStatus[row.paymentStatus]?.tone ?? "neutral"}>{paymentStatus[row.paymentStatus]?.label ?? row.paymentStatus}</Badge></td><td className="px-5 py-3 text-right tabular-nums">{row.goodsMinor ? formatFcfa(row.goodsMinor) : "—"}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
    </section>
  );
}

export function OwnerPurchaseNewPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [lines, setLines] = useState<Array<{ variantId: string; unitId: string; quantity: string; unitPriceMinor: string; label: string; dests: Array<{ locationId: string; quantity: string }> }>>([]);
  const [fee, setFee] = useState("0");
  const [transport, setTransport] = useState("0");
  const [accountId, setAccountId] = useState("");
  const [payNow, setPayNow] = useState("");
  useEffect(() => { api<Catalog>("/api/v1/replenishment/context").then(setCatalog).catch((caught: RequestError) => setError(caught.message)); }, []);
  const product = catalog?.products.find((item) => item.id === productId);
  const variant = product?.variants.find((item) => item.id === variantId);
  function addLine() {
    if (!variant || !unitId || !unitPrice) return;
    const unit = variant.units.find((item) => item.id === unitId);
    setLines((current) => [...current, { variantId, unitId, quantity, unitPriceMinor: unitPrice, label: `${product?.name} · ${variant.name} · ${quantity} ${unit?.name ?? ""}`, dests: catalog?.locations[0] ? [{ locationId: catalog.locations[0].id, quantity }] : [] }]);
  }
  const goods = lines.reduce((sum, line) => sum + BigInt(line.unitPriceMinor || "0") * BigInt(line.quantity.split(".")[0] || "0"), 0n);
  async function submit() {
    setPending(true); setError(null);
    try {
      const destinations = lines.flatMap((line, index) => line.dests.map((dest) => ({ purchaseLineIndex: index, locationId: dest.locationId, quantity: dest.quantity })));
      const created = await api<{ id: string }>("/api/v1/purchases", { method: "POST", body: JSON.stringify({
        supplierId,
        lines: lines.map(({ dests: _d, label: _l, ...line }) => line),
        destinations,
        fees: [
          ...(BigInt(fee || "0") > 0n ? [{ kind: "SUPPLIER", amountMinor: fee, description: "Frais facturés par le fournisseur" }] : []),
          ...(BigInt(transport || "0") > 0n ? [{ kind: "EXTERNAL", amountMinor: transport, accountId, description: "Transport" }] : []),
        ],
        payments: payNow && accountId ? [{ accountId, amountMinor: payNow }] : [],
      }) });
      router.push(`${paths.ownerPurchases}/${created.id}`);
    } catch (caught) { setError((caught as RequestError).message); } finally { setPending(false); }
  }
  if (!catalog && !error) return <Skeleton className="h-[32rem]" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Nouvel achat">Répartissez les quantités entre boutiques ou dépôt. Les produits partent en transit jusqu’à réception.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-display font-semibold">Fournisseur</h2>
            <div className="mt-4"><Label htmlFor="supplier">Fournisseur</Label><select id="supplier" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
            <p className="mt-2 text-sm"><Link className="text-[var(--primary)]" href={paths.ownerSuppliers}>Gérer les fournisseurs</Link></p>
          </article>
          <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-display font-semibold">Lignes</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div><Label htmlFor="product">Produit</Label><select id="product" value={productId} onChange={(event) => { setProductId(event.target.value); setVariantId(""); setUnitId(""); }} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><Label htmlFor="variant">Variante</Label><select id="variant" value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{product?.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><Label htmlFor="unit">Unité</Label><select id="unit" value={unitId} onChange={(event) => setUnitId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{variant?.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <Field id="qty" label="Quantité" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              <Field id="price" label="Prix d’achat unitaire" inputMode="numeric" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value.replace(/\D/g, ""))} />
            </div>
            <Button className="mt-4" variant="secondary" onClick={addLine}><Plus className="size-4" />Ajouter</Button>
            <ul className="mt-4 space-y-3">{lines.map((line, index) => (
              <li key={`${line.variantId}-${index}`} className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <p className="text-sm font-medium">{line.label} · {line.quantity} × {formatFcfa(line.unitPriceMinor)}</p>
                {line.dests.map((dest, destIndex) => (
                  <div key={destIndex} className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select aria-label="Destination" value={dest.locationId} onChange={(event) => setLines((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, dests: item.dests.map((row, rowIndex) => rowIndex === destIndex ? { ...row, locationId: event.target.value } : row) } : item))} className="h-10 rounded-md bg-[var(--surface)] px-3 text-sm">{catalog?.locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.shopName}</option>)}</select>
                    <input value={dest.quantity} onChange={(event) => setLines((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, dests: item.dests.map((row, rowIndex) => rowIndex === destIndex ? { ...row, quantity: event.target.value } : row) } : item))} className="h-10 rounded-md bg-[var(--surface)] px-3 text-sm" aria-label="Quantité destinée" />
                  </div>
                ))}
                <Button variant="ghost" className="mt-2" onClick={() => setLines((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, dests: [...item.dests, { locationId: catalog?.locations[0]?.id ?? "", quantity: "1" }] } : item))}>Ajouter une destination</Button>
              </li>
            ))}</ul>
          </article>
          <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-display font-semibold">Frais et fonds</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field id="fee" label="Frais fournisseur" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value.replace(/\D/g, ""))} />
              <Field id="transport" label="Transport externe" inputMode="numeric" value={transport} onChange={(event) => setTransport(event.target.value.replace(/\D/g, ""))} />
              <div className="md:col-span-2"><Label htmlFor="account">Source</Label><select id="account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.balanceMinor ? ` · ${formatFcfa(account.balanceMinor)}` : ""}</option>)}</select></div>
              <Field id="pay" label="Paiement fournisseur maintenant" inputMode="numeric" value={payNow} onChange={(event) => setPayNow(event.target.value.replace(/\D/g, ""))} />
            </div>
          </article>
        </div>
        <aside className="h-fit rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] xl:sticky xl:top-4">
          <h2 className="font-display font-semibold">Synthèse</h2>
          <p className="mt-2 text-sm">Marchandises {formatFcfa(goods.toString())}</p>
          <p className="mt-1 text-sm">Stock valorisé {formatFcfa((goods + BigInt(fee || "0") + BigInt(transport || "0")).toString())}</p>
          <Button className="mt-4 w-full" disabled={pending || !supplierId || lines.length === 0} onClick={() => void submit()}>{pending ? "Enregistrement…" : "Enregistrer l’achat"}</Button>
        </aside>
      </div>
    </section>
  );
}

export function OwnerPurchaseDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{
    reference: string;
    supplier: { name: string };
    goodsMinor?: string;
    paidMinor?: string;
    dueMinor?: string;
    stockValueMinor?: string;
    receivedStatus: string;
    paymentStatus: string;
    lines: Array<{ id: string; productName: string; variantName: string; quantityBase: string; unitPriceMinor?: string; destinations: Array<{ locationName: string; qtyBase: string }> }>;
    fees: Array<{ kind: string; amountMinor: string; description: string }>;
    payments: Array<{ id: string; amountMinor: string; accountName: string }>;
    shipments: Array<{ id: string; status: string; destinationName: string; lines: Array<{ remainingQty: string }> }>;
    capabilities: { canPay: boolean };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Catalog["accounts"]>([]);
  const [pending, setPending] = useState(false);
  const load = () => api<{ purchase: NonNullable<typeof data> }>(`/api/v1/purchases/${params.id}`).then((payload) => setData(payload.purchase)).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => { void load(); api<Catalog>("/api/v1/replenishment/context").then((payload) => setAccounts(payload.accounts)).catch(() => undefined); }, [params.id]);
  if (!data && !error) return <Skeleton className="h-80" />;
  if (!data) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title={data.reference} action={data.capabilities.canPay ? <Button onClick={() => { setPayError(null); setPayOpen(true); }}>Enregistrer un paiement</Button> : undefined}>{data.supplier.name}</PageHeader>
      <div className="flex flex-wrap gap-2"><Badge tone={receivedStatus[data.receivedStatus]?.tone ?? "neutral"}>{receivedStatus[data.receivedStatus]?.label ?? data.receivedStatus}</Badge><Badge tone={paymentStatus[data.paymentStatus]?.tone ?? "neutral"}>{paymentStatus[data.paymentStatus]?.label ?? data.paymentStatus}</Badge></div>
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Marchandises</p><p className="mt-1 font-display text-lg">{formatFcfa(data.goodsMinor)}</p></article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Valeur stock</p><p className="mt-1 font-display text-lg">{formatFcfa(data.stockValueMinor)}</p></article>
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><p className="text-sm text-[var(--muted)]">Reste dû</p><p className="mt-1 font-display text-lg">{formatFcfa(data.dueMinor)}</p></article>
      </div>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Lignes</h2><ul className="mt-3 divide-y divide-[var(--separator)]/60">{data.lines.map((line) => <li key={line.id} className="py-3 text-sm"><p>{line.productName} · {line.variantName} · {line.quantityBase}</p><p className="text-[var(--muted)]">{line.destinations.map((destination) => `${destination.locationName} ${destination.qtyBase}`).join(" · ")}</p></li>)}</ul></article>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Expéditions</h2><ul className="mt-3">{data.shipments.map((shipment) => <li key={shipment.id} className="flex justify-between py-2 text-sm"><Link className="text-[var(--primary)]" href={`${paths.ownerTransfers}/${shipment.id}`}>{shipment.destinationName}</Link><Badge tone={shipmentStatus[shipment.status]?.tone ?? "neutral"}>{shipmentStatus[shipment.status]?.label ?? shipment.status}</Badge></li>)}</ul></article>
      <ConfirmDialog open={payOpen} onOpenChange={(next) => { setPayOpen(next); if (!next) setPayError(null); }} title="Paiement fournisseur" confirmLabel="Enregistrer le paiement" pending={pending} error={payError} onConfirm={() => { setPending(true); api(`/api/v1/purchases/${params.id}/pay`, { method: "POST", body: JSON.stringify({ accountId, amountMinor: amount }) }).then(() => { setPayOpen(false); void load(); }).catch((caught: RequestError) => setPayError(caught.message)).finally(() => setPending(false)); }}>
        <div className="grid gap-3"><Field id="pay-amount" label="Montant" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} /><div><Label htmlFor="pay-account">Source</Label><select id="pay-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div></div>
      </ConfirmDialog>
    </section>
  );
}

export function OwnerSuppliersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SupplierRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const load = () => api<{ suppliers: SupplierRow[] }>("/api/v1/suppliers").then((payload) => setRows(payload.suppliers)).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => { void load(); }, []);
  const filtered = (rows ?? []).filter((row) => row.name.toLowerCase().includes(query.toLowerCase()));
  if (!rows && !error) return <Skeleton className="h-80" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Fournisseurs" action={<Button onClick={() => { setModalError(null); setOpen(true); }}>Nouveau fournisseur</Button>}>Désactivez plutôt que supprimer un fournisseur déjà utilisé.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label className="relative block max-w-md"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
      {filtered.length === 0 ? <EmptyState title="Aucun fournisseur" icon={<Warehouse className="size-5" />}>Créez la fiche avant le premier achat, ou pendant l’enregistrement.</EmptyState> : (
        <ul className="grid gap-3 md:grid-cols-2">{filtered.map((row) => <li key={row.id}><Link href={`${paths.ownerSuppliers}/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.name}</p><p className="text-sm text-[var(--muted)]">{row.phone ?? "Sans téléphone"}</p><Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status === "ACTIVE" ? "Actif" : "Inactif"}</Badge></Link></li>)}</ul>
      )}
      <ConfirmDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setModalError(null); }} title="Nouveau fournisseur" confirmLabel="Créer" pending={pending} error={modalError} onConfirm={() => { setPending(true); api<{ id: string }>("/api/v1/suppliers", { method: "POST", body: JSON.stringify({ name, phone: phone || undefined }) }).then((created) => { setOpen(false); router.push(`${paths.ownerSuppliers}/${created.id}`); }).catch((caught: RequestError) => setModalError(caught.message)).finally(() => setPending(false)); }}>
        <div className="grid gap-3"><Field id="sup-name" label="Raison sociale" value={name} onChange={(event) => setName(event.target.value)} /><Field id="sup-phone" label="Téléphone" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
      </ConfirmDialog>
    </section>
  );
}

export function OwnerSupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ supplier: SupplierRow & { email?: string | null; address?: string | null; notes?: string | null; taxId?: string | null; contactName?: string | null; paymentTerms?: string | null; leadTimeDays?: number | null; tradeName?: string | null }; purchases: Array<{ id: string; reference: string; createdAt: string; goodsMinor?: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", tradeName: "", phone: "", email: "", address: "", taxId: "", contactName: "", paymentTerms: "", leadTimeDays: "", notes: "" });
  const load = () => api<NonNullable<typeof data>>(`/api/v1/suppliers/${params.id}`).then((payload) => {
    setData(payload);
    setForm({
      name: payload.supplier.name,
      tradeName: payload.supplier.tradeName ?? "",
      phone: payload.supplier.phone ?? "",
      email: payload.supplier.email ?? "",
      address: payload.supplier.address ?? "",
      taxId: payload.supplier.taxId ?? "",
      contactName: payload.supplier.contactName ?? "",
      paymentTerms: payload.supplier.paymentTerms ?? "",
      leadTimeDays: payload.supplier.leadTimeDays?.toString() ?? "",
      notes: payload.supplier.notes ?? "",
    });
  }).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => { void load(); }, [params.id]);
  if (!data && !error) return <Skeleton className="h-80" />;
  if (!data) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6">
      <PageHeader title={data.supplier.name} action={<Button variant="secondary" onClick={() => { setModalError(null); setOpen(true); }}>Modifier</Button>}>{data.supplier.phone ?? "Sans téléphone"}</PageHeader>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm">Nom commercial {data.supplier.tradeName ?? "—"}</p>
        <p className="mt-1 text-sm">Contact {data.supplier.contactName ?? "—"}</p>
        <p className="mt-1 text-sm">E-mail {data.supplier.email ?? "—"}</p>
        <p className="mt-1 text-sm">Identifiant fiscal {data.supplier.taxId ?? "—"}</p>
        <p className="mt-1 text-sm">Conditions {data.supplier.paymentTerms ?? "—"}</p>
        <p className="mt-1 text-sm">{data.supplier.address ?? "Adresse non renseignée"}</p>
      </article>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Achats</h2>{data.purchases.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">Aucun achat associé.</p> : <ul className="mt-3">{data.purchases.map((purchase) => <li key={purchase.id} className="flex justify-between py-2 text-sm"><Link className="text-[var(--primary)]" href={`${paths.ownerPurchases}/${purchase.id}`}>{purchase.reference}</Link><span>{purchase.goodsMinor ? formatFcfa(purchase.goodsMinor) : ""}</span></li>)}</ul>}</article>
      <ConfirmDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setModalError(null); }} title="Modifier le fournisseur" confirmLabel="Enregistrer" pending={pending} error={modalError} onConfirm={() => {
        setPending(true);
        api(`/api/v1/suppliers/${params.id}`, { method: "PATCH", body: JSON.stringify({
          name: form.name,
          tradeName: form.tradeName || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          taxId: form.taxId || undefined,
          contactName: form.contactName || undefined,
          paymentTerms: form.paymentTerms || undefined,
          leadTimeDays: form.leadTimeDays ? Number(form.leadTimeDays) : undefined,
          notes: form.notes || undefined,
        }) }).then(() => { setOpen(false); void load(); }).catch((caught: RequestError) => setModalError(caught.message)).finally(() => setPending(false));
      }}>
        <div className="grid gap-3">
          <Field id="edit-name" label="Raison sociale" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <Field id="edit-trade" label="Nom commercial" value={form.tradeName} onChange={(event) => setForm((current) => ({ ...current, tradeName: event.target.value }))} />
          <Field id="edit-phone" label="Téléphone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          <Field id="edit-email" label="E-mail" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          <Field id="edit-tax" label="Identifiant fiscal" value={form.taxId} onChange={(event) => setForm((current) => ({ ...current, taxId: event.target.value }))} />
          <Field id="edit-contact" label="Contact principal" value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} />
          <Field id="edit-terms" label="Conditions de paiement" value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} />
          <Field id="edit-lead" label="Délai habituel (jours)" inputMode="numeric" value={form.leadTimeDays} onChange={(event) => setForm((current) => ({ ...current, leadTimeDays: event.target.value.replace(/\D/g, "") }))} />
          <div><Label htmlFor="edit-notes">Notes internes</Label><Textarea id="edit-notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
        </div>
      </ConfirmDialog>
    </section>
  );
}

export function OwnerTransfersPage() {
  const [rows, setRows] = useState<ShipmentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ shipments: ShipmentRow[] }>("/api/v1/shipments").then((payload) => setRows(payload.shipments)).catch((caught: RequestError) => setError(caught.message));
  }, []);
  if (!rows && !error) return <Skeleton className="h-80" />;
  return (
    <section className="space-y-6 overflow-x-clip">
      <PageHeader title="Expéditions et transferts" action={<Link href={paths.ownerTransferNew}><Button>Nouveau transfert</Button></Link>}>Le transit n’est pas vendable. Les coûts suivent les quantités sans duplication.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {(rows ?? []).length === 0 ? <EmptyState title="Aucune expédition" icon={<Truck className="size-5" />}>Les livraisons d’achat et les transferts internes seront listés ici.</EmptyState> : (
        <ul className="grid gap-3">{(rows ?? []).map((row) => <li key={row.id}><Link href={`${paths.ownerTransfers}/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><p className="font-semibold">{row.sourceName} → {row.destinationName}</p><Badge tone={shipmentStatus[row.status]?.tone ?? "neutral"}>{shipmentStatus[row.status]?.label ?? row.status}</Badge></Link></li>)}</ul>
      )}
    </section>
  );
}

export function OwnerTransferNewPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [pending, setPending] = useState(false);
  useEffect(() => { api<Catalog>("/api/v1/replenishment/context").then(setCatalog).catch((caught: RequestError) => setError(caught.message)); }, []);
  async function submit() {
    setPending(true); setError(null);
    try {
      const created = await api<{ id: string }>("/api/v1/shipments", { method: "POST", body: JSON.stringify({ sourceLocationId: source, destinationLocationId: destination, lines: [{ variantId, quantity }] }) });
      router.push(`${paths.ownerTransfers}/${created.id}`);
    } catch (caught) { setError((caught as RequestError).message); } finally { setPending(false); }
  }
  if (!catalog && !error) return <Skeleton className="h-80" />;
  return (
    <section className="space-y-6">
      <PageHeader title="Nouveau transfert">Le stock d’origine n’est débité qu’à l’expédition réelle.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] space-y-3">
        <div><Label htmlFor="src">Origine</Label><select id="src" value={source} onChange={(event) => setSource(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
        <div><Label htmlFor="dst">Destination</Label><select id="dst" value={destination} onChange={(event) => setDestination(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
        <div><Label htmlFor="var">Variante</Label><select id="var" value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.products.flatMap((product) => product.variants.map((variant) => <option key={variant.id} value={variant.id}>{product.name} · {variant.name}</option>))}</select></div>
        <Field id="tq" label="Quantité" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        <Button disabled={pending || !source || !destination || !variantId} onClick={() => void submit()}>Créer le transfert</Button>
      </article>
    </section>
  );
}

export function OwnerTransferDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<ShipmentRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [surplusOpen, setSurplusOpen] = useState(false);
  const [surplusError, setSurplusError] = useState<string | null>(null);
  const [unitCost, setUnitCost] = useState("");
  const [accounts, setAccounts] = useState<Catalog["accounts"]>([]);
  const [accountId, setAccountId] = useState("");
  const surplusReceipt = data?.receipts?.find((receipt) => receipt.lines.some((line) => Number(line.surplusQty) > 0) && receipt.surplusCaseId);
  const surplusQty = surplusReceipt?.lines.find((line) => Number(line.surplusQty) > 0)?.surplusQty ?? "0";
  const surplusVariantId = data?.lines[0]?.variantId;
  const load = () => api<{ shipment: ShipmentRow }>(`/api/v1/shipments/${params.id}`).then((payload) => setData(payload.shipment)).catch((caught: RequestError) => setError(caught.message));
  useEffect(() => {
    void load();
    api<Catalog>("/api/v1/replenishment/context").then((payload) => setAccounts(payload.accounts)).catch(() => undefined);
  }, [params.id]);
  if (!data && !error) return <Skeleton className="h-80" />;
  if (!data) return <Alert tone="error">{error}</Alert>;
  return (
    <section className="space-y-6">
      <PageHeader title="Suivi d’expédition">{data.sourceName} → {data.destinationName}{data.purchaseReference ? ` · ${data.purchaseReference}` : ""}</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Badge tone={shipmentStatus[data.status]?.tone ?? "neutral"}>{shipmentStatus[data.status]?.label ?? data.status}</Badge>
      <ul className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">{data.lines.map((line, index) => <li key={line.id ?? index} className="flex justify-between py-2 text-sm"><span>{line.productName}</span><span>Envoyé {line.dispatchedQty} · reçu {line.receivedQty ?? "0"} · reliquat {line.remainingQty}</span></li>)}</ul>
      {(data.receipts ?? []).length > 0 ? (
        <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display font-semibold">Réceptions</h2>
          <ul className="mt-3 space-y-3 text-sm">{data.receipts?.map((receipt) => (
            <li key={receipt.id}>
              <p>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(receipt.createdAt))} · {receipt.actorName}</p>
              {receipt.lines.map((line, index) => <p key={`${receipt.id}-${index}`} className="text-[var(--muted)]">Accepté {line.acceptedQty} · endommagé {line.damagedQty} · surplus {line.surplusQty}</p>)}
              {receipt.missingCaseId ? <p className="mt-1 text-[var(--destructive)]">Manquant déclaré, reliquat encore en transit.</p> : null}
              {receipt.surplusCaseId ? <p className="mt-1">Surplus isolé en quarantaine métier, non vendable tant qu’il n’est pas régularisé.</p> : null}
            </li>
          ))}</ul>
        </article>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {data.capabilities.canApprove ? <Button disabled={pending} onClick={() => { setPending(true); api(`/api/v1/shipments/${params.id}/approve`, { method: "POST" }).then(() => load()).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Autoriser l’expédition</Button> : null}
        {data.capabilities.canDispatch ? <Button disabled={pending} onClick={() => { setPending(true); api(`/api/v1/shipments/${params.id}/dispatch`, { method: "POST" }).then(() => load()).catch((caught: RequestError) => setError(caught.message)).finally(() => setPending(false)); }}>Expédier</Button> : null}
        {surplusReceipt && surplusVariantId ? <Button variant="secondary" onClick={() => { setSurplusError(null); setSurplusOpen(true); }}>Régulariser le surplus</Button> : null}
      </div>
      <ConfirmDialog open={surplusOpen} onOpenChange={(next) => { setSurplusOpen(next); if (!next) setSurplusError(null); }} title="Régulariser le surplus" confirmLabel="Valoriser et rendre vendable" pending={pending} error={surplusError} onConfirm={() => {
        if (!surplusReceipt || !surplusVariantId) return;
        setPending(true);
        api("/api/v1/surplus/regularize", { method: "POST", body: JSON.stringify({ receiptId: surplusReceipt.id, variantId: surplusVariantId, unitCostMinor: unitCost, quantity: surplusQty, accountId: accountId || undefined }) }).then(() => { setSurplusOpen(false); void load(); }).catch((caught: RequestError) => setSurplusError(caught.message)).finally(() => setPending(false));
      }}>
        <p className="text-sm">Quantité en quarantaine : {surplusQty}. Le stock vendable n’augmente qu’après cette valorisation, sans dupliquer la quantité.</p>
        <div className="mt-3 grid gap-3">
          <Field id="surplus-cost" label="Coût unitaire (FCFA)" inputMode="numeric" value={unitCost} onChange={(event) => setUnitCost(event.target.value.replace(/\D/g, ""))} />
          <div><Label htmlFor="surplus-account">Source (facultatif, sinon dette fournisseur)</Label><select id="surplus-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Dette fournisseur</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
        </div>
      </ConfirmDialog>
    </section>
  );
}
