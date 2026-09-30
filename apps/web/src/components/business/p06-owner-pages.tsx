"use client";

import { ArrowRight, ClipboardList, Mail, MapPin, Package, Phone, Plus, Search, Trash2, Truck, Warehouse } from "lucide-react";
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
type SupplierRow = { id: string; name: string; phone: string | null; email?: string | null; contactName?: string | null; paymentTerms?: string | null; status: string; tradeName: string | null };
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

function scaledQuantity(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,6}))?$/);
  if (!match) return 0n;
  return BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function lineAmount(unitPriceMinor: string, quantity: string) {
  const scaled = scaledQuantity(quantity);
  return (BigInt(unitPriceMinor || "0") * scaled + 500_000n) / 1_000_000n;
}

function displayScaledQuantity(value: bigint) {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
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
  const goods = lines.reduce((sum, line) => sum + lineAmount(line.unitPriceMinor, line.quantity), 0n);
  const feeTotal = BigInt(fee || "0") + BigInt(transport || "0");
  const acquisitionTotal = goods + feeTotal;
  const paidNow = BigInt(payNow || "0");
  const dueAfterPayment = acquisitionTotal > paidNow ? acquisitionTotal - paidNow : 0n;
  const selectedAccount = catalog?.accounts.find((account) => account.id === accountId);
  const balanceAfterPayment = selectedAccount?.balanceMinor ? BigInt(selectedAccount.balanceMinor) - paidNow : null;
  const allocationsValid = lines.length > 0 && lines.every((line) => line.dests.length > 0 && line.dests.reduce((sum, destinationRow) => sum + scaledQuantity(destinationRow.quantity), 0n) === scaledQuantity(line.quantity) && scaledQuantity(line.quantity) > 0n);
  const paymentValid = paidNow <= acquisitionTotal && (!payNow || Boolean(accountId)) && (balanceAfterPayment === null || balanceAfterPayment >= 0n);
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
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display font-semibold">Fournisseur</h2><p className="mt-1 text-sm text-[var(--muted)]">Sélectionnez l’entreprise qui facture cet achat.</p></div><Link className="text-sm font-semibold text-[var(--primary)]" href={paths.ownerSuppliers}>Gérer les fournisseurs</Link></div>
            <div className="mt-4"><Label htmlFor="supplier">Entreprise fournisseur</Label><select id="supplier" aria-label="Fournisseur" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir un fournisseur</option>{catalog?.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
          </article>
          <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-display font-semibold">Produits et répartition</h2><p className="mt-1 text-sm text-[var(--muted)]">Chaque quantité achetée doit être intégralement affectée à un ou plusieurs lieux.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div><Label htmlFor="product">Produit</Label><select id="product" value={productId} onChange={(event) => { setProductId(event.target.value); setVariantId(""); setUnitId(""); }} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{catalog?.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><Label htmlFor="variant">Variante</Label><select id="variant" value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{product?.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <div><Label htmlFor="unit">Unité</Label><select id="unit" value={unitId} onChange={(event) => setUnitId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir</option>{variant?.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              <Field id="qty" label="Quantité" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              <Field id="price" label="Prix d’achat unitaire" inputMode="numeric" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value.replace(/\D/g, ""))} />
            </div>
            <Button className="mt-4" variant="secondary" disabled={!variant || !unitId || !unitPrice || !quantity} onClick={addLine}><Plus className="size-4" />Ajouter la ligne</Button>
            <ul className="mt-4 space-y-3">{lines.map((line, index) => (
              <li key={`${line.variantId}-${index}`} className="rounded-lg bg-[var(--surface-subtle)] p-3">
                <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{line.label}</p><p className="mt-1 text-xs text-[var(--muted)]">{line.quantity} × {formatFcfa(line.unitPriceMinor)} · Sous-total {formatFcfa(lineAmount(line.unitPriceMinor, line.quantity).toString())}</p></div><Button variant="ghost" className="h-8 px-2 text-[var(--destructive)]" aria-label={`Supprimer ${line.label}`} onClick={() => setLines((current) => current.filter((_, currentIndex) => currentIndex !== index))}><Trash2 className="size-4" /></Button></div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7rem_2.5rem] gap-2 px-1 text-xs font-medium text-[var(--muted)]"><span>Lieu destinataire</span><span>Quantité</span><span className="sr-only">Action</span></div>
                {line.dests.map((dest, destIndex) => (
                  <div key={destIndex} className="mt-2 grid grid-cols-[minmax(0,1fr)_7rem_2.5rem] gap-2">
                    <select aria-label="Destination" value={dest.locationId} onChange={(event) => setLines((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, dests: item.dests.map((row, rowIndex) => rowIndex === destIndex ? { ...row, locationId: event.target.value } : row) } : item))} className="h-10 rounded-md bg-[var(--surface)] px-3 text-sm">{catalog?.locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.shopName}</option>)}</select>
                    <input value={dest.quantity} onChange={(event) => setLines((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, dests: item.dests.map((row, rowIndex) => rowIndex === destIndex ? { ...row, quantity: event.target.value } : row) } : item))} className="h-10 rounded-md bg-[var(--surface)] px-3 text-sm" aria-label="Quantité destinée" />
                    <Button variant="ghost" className="h-10 px-2" aria-label="Retirer cette destination" disabled={line.dests.length === 1} onClick={() => setLines((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, dests: item.dests.filter((_, rowIndex) => rowIndex !== destIndex) } : item))}><Trash2 className="size-4" /></Button>
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" onClick={() => setLines((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, dests: [...item.dests, { locationId: catalog?.locations.find((location) => !item.dests.some((row) => row.locationId === location.id))?.id ?? "", quantity: "0" }] } : item))}><Plus className="size-4" />Ajouter une destination</Button><span className={`text-xs font-medium ${line.dests.reduce((sum, row) => sum + scaledQuantity(row.quantity), 0n) === scaledQuantity(line.quantity) ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}>Réparti : {displayScaledQuantity(line.dests.reduce((sum, row) => sum + scaledQuantity(row.quantity), 0n))} sur {line.quantity}</span></div>
              </li>
            ))}</ul>
          </article>
          <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-display font-semibold">Frais et paiement initial</h2><p className="mt-1 text-sm text-[var(--muted)]">Le paiement peut être partiel. Le solde restant sera conservé comme montant dû au fournisseur.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field id="fee" label="Frais fournisseur" inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value.replace(/\D/g, ""))} />
              <Field id="transport" label="Transport externe" inputMode="numeric" value={transport} onChange={(event) => setTransport(event.target.value.replace(/\D/g, ""))} />
              <div className="md:col-span-2"><Label htmlFor="account">Source de paiement</Label><select id="account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Aucun paiement maintenant</option>{catalog?.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.balanceMinor ? ` · solde ${formatFcfa(account.balanceMinor)}` : ""}</option>)}</select></div>
              <Field id="pay" label="Montant payé maintenant (FCFA)" inputMode="numeric" value={payNow} onChange={(event) => setPayNow(event.target.value.replace(/\D/g, ""))} />
              <div className="rounded-lg bg-[var(--surface-subtle)] p-3 text-sm"><p className="text-[var(--muted)]">Solde prévisionnel de la source</p><p className={`mt-1 font-semibold tabular-nums ${balanceAfterPayment !== null && balanceAfterPayment < 0n ? "text-[var(--destructive)]" : ""}`}>{balanceAfterPayment === null ? "Sélectionnez une source" : formatFcfa(balanceAfterPayment.toString())}</p></div>
            </div>
          </article>
        </div>
        <aside className="h-fit rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] xl:sticky xl:top-4">
          <h2 className="font-display font-semibold">Synthèse de l’achat</h2>
          <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Marchandises</dt><dd className="tabular-nums font-medium">{formatFcfa(goods.toString())}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Frais d’acquisition</dt><dd className="tabular-nums font-medium">{formatFcfa(feeTotal.toString())}</dd></div><div className="flex justify-between gap-4 border-t border-[var(--separator)]/60 pt-2"><dt>Coût d’acquisition prévu</dt><dd className="tabular-nums font-semibold">{formatFcfa(acquisitionTotal.toString())}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Payé maintenant</dt><dd className="tabular-nums font-medium">{formatFcfa(paidNow.toString())}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Reste fournisseur</dt><dd className="tabular-nums font-semibold">{formatFcfa(dueAfterPayment.toString())}</dd></div></dl>
          {!allocationsValid && lines.length > 0 ? <Alert tone="warning" className="mt-4">Répartissez exactement toute la quantité de chaque ligne avant l’enregistrement.</Alert> : null}
          {!paymentValid ? <Alert tone="error" className="mt-4">Le paiement dépasse le total ou le solde disponible de la source.</Alert> : null}
          <Button className="mt-4 w-full" disabled={pending || !supplierId || !allocationsValid || !paymentValid} onClick={() => void submit()}>{pending ? "Enregistrement…" : "Enregistrer l’achat"}</Button>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Le stock ne sera valorisé qu’après validation de la réception physique.</p>
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
      <label className="relative block max-w-xl"><Search className="absolute left-3 top-3 size-4 text-[var(--muted)]" /><span className="sr-only">Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, contact ou téléphone" className="h-11 w-full rounded-lg bg-[var(--surface)] pl-10 pr-4 text-sm shadow-[var(--shadow-card)] outline-none focus:ring-2 focus:ring-[var(--focus)]" /></label>
      {filtered.length === 0 ? <EmptyState title="Aucun fournisseur" icon={<Warehouse className="size-5" />}>Créez la fiche avant le premier achat, ou pendant l’enregistrement.</EmptyState> : (
        <><ul className="grid gap-3 lg:hidden">{filtered.map((row) => <li key={row.id}><Link href={`${paths.ownerSuppliers}/${row.id}`} className="block rounded-xl bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.name}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.tradeName || row.contactName || "Coordonnées à compléter"}</p></div><Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status === "ACTIVE" ? "Actif" : "Inactif"}</Badge></div><p className="mt-3 text-sm">{row.phone ?? row.email ?? "Aucun contact renseigné"}</p></Link></li>)}</ul><div className="hidden overflow-x-auto rounded-xl bg-[var(--surface)] shadow-[var(--shadow-card)] lg:block"><table className="w-full text-sm"><thead className="text-left text-[var(--muted)]"><tr><th className="px-5 py-3 font-medium">Fournisseur</th><th className="px-5 py-3 font-medium">Contact principal</th><th className="px-5 py-3 font-medium">Coordonnées</th><th className="px-5 py-3 font-medium">Conditions</th><th className="px-5 py-3 font-medium">État</th><th className="px-5 py-3"><span className="sr-only">Ouvrir</span></th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-t border-[var(--separator)]/50"><td className="px-5 py-4"><Link className="font-semibold text-[var(--primary)]" href={`${paths.ownerSuppliers}/${row.id}`}>{row.name}</Link>{row.tradeName ? <p className="mt-1 text-xs text-[var(--muted)]">{row.tradeName}</p> : null}</td><td className="px-5 py-4">{row.contactName ?? "—"}</td><td className="px-5 py-4"><p>{row.phone ?? "—"}</p>{row.email ? <p className="text-xs text-[var(--muted)]">{row.email}</p> : null}</td><td className="px-5 py-4">{row.paymentTerms ?? "—"}</td><td className="px-5 py-4"><Badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>{row.status === "ACTIVE" ? "Actif" : "Inactif"}</Badge></td><td className="px-5 py-4 text-right"><Link aria-label={`Voir ${row.name}`} href={`${paths.ownerSuppliers}/${row.id}`}><ArrowRight className="inline size-4" /></Link></td></tr>)}</tbody></table></div></>
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
      <PageHeader title={data.supplier.name} action={<Button variant="secondary" onClick={() => { setModalError(null); setOpen(true); }}>Modifier la fiche</Button>}><span className="inline-flex items-center gap-2"><Badge tone={data.supplier.status === "ACTIVE" ? "success" : "neutral"}>{data.supplier.status === "ACTIVE" ? "Actif" : "Inactif"}</Badge>{data.supplier.tradeName ? ` · ${data.supplier.tradeName}` : ""}</span></PageHeader>
      <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Coordonnées</h2><dl className="mt-4 space-y-4 text-sm"><div className="flex gap-3"><Phone className="mt-0.5 size-4 text-[var(--muted)]" /><div><dt className="text-[var(--muted)]">Téléphone</dt><dd className="mt-0.5 font-medium">{data.supplier.phone ?? "Non renseigné"}</dd></div></div><div className="flex gap-3"><Mail className="mt-0.5 size-4 text-[var(--muted)]" /><div><dt className="text-[var(--muted)]">E-mail</dt><dd className="mt-0.5 font-medium">{data.supplier.email ?? "Non renseigné"}</dd></div></div><div className="flex gap-3"><MapPin className="mt-0.5 size-4 text-[var(--muted)]" /><div><dt className="text-[var(--muted)]">Adresse</dt><dd className="mt-0.5 font-medium">{data.supplier.address ?? "Non renseignée"}</dd></div></div></dl></article><article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Informations commerciales</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-[var(--muted)]">Contact principal</dt><dd className="mt-1 font-medium">{data.supplier.contactName ?? "Non renseigné"}</dd></div><div><dt className="text-[var(--muted)]">Identifiant fiscal</dt><dd className="mt-1 font-medium">{data.supplier.taxId ?? "Non renseigné"}</dd></div><div><dt className="text-[var(--muted)]">Conditions de paiement</dt><dd className="mt-1 font-medium">{data.supplier.paymentTerms ?? "Non renseignées"}</dd></div><div><dt className="text-[var(--muted)]">Délai habituel</dt><dd className="mt-1 font-medium">{data.supplier.leadTimeDays ? `${data.supplier.leadTimeDays} jours` : "Non renseigné"}</dd></div></dl>{data.supplier.notes ? <div className="mt-4 rounded-lg bg-[var(--surface-subtle)] p-3 text-sm"><p className="text-[var(--muted)]">Notes internes</p><p className="mt-1 whitespace-pre-wrap">{data.supplier.notes}</p></div> : null}</article></div>
      <article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display font-semibold">Historique des achats</h2><p className="mt-1 text-sm text-[var(--muted)]">{data.purchases.length} achat{data.purchases.length > 1 ? "s" : ""} associé{data.purchases.length > 1 ? "s" : ""}</p></div><Link href={paths.ownerPurchaseNew}><Button variant="secondary">Nouvel achat</Button></Link></div>{data.purchases.length === 0 ? <div className="mt-4"><EmptyState title="Aucun achat associé">Le premier achat effectué auprès de ce fournisseur apparaîtra ici.</EmptyState></div> : <ul className="mt-4 divide-y divide-[var(--separator)]/60">{data.purchases.map((purchase) => <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><Link className="font-semibold text-[var(--primary)]" href={`${paths.ownerPurchases}/${purchase.id}`}>{purchase.reference}</Link><p className="mt-1 text-xs text-[var(--muted)]">{formatWhen(purchase.createdAt)}</p></div><span className="tabular-nums font-semibold">{purchase.goodsMinor ? formatFcfa(purchase.goodsMinor) : "—"}</span></li>)}</ul>}</article>
      <ConfirmDialog size="lg" open={open} onOpenChange={(next) => { setOpen(next); if (!next) setModalError(null); }} title="Modifier le fournisseur" confirmLabel="Enregistrer" pending={pending} error={modalError} onConfirm={() => {
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
        <div className="space-y-5"><section><h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Identité</h3><div className="grid gap-3 sm:grid-cols-2"><Field id="edit-name" label="Raison sociale" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /><Field id="edit-trade" label="Nom commercial (facultatif)" value={form.tradeName} onChange={(event) => setForm((current) => ({ ...current, tradeName: event.target.value }))} /><Field id="edit-tax" label="Identifiant fiscal (facultatif)" value={form.taxId} onChange={(event) => setForm((current) => ({ ...current, taxId: event.target.value }))} /></div></section><section className="border-t border-[var(--separator)]/60 pt-5"><h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Coordonnées</h3><div className="grid gap-3 sm:grid-cols-2"><Field id="edit-contact" label="Contact principal (facultatif)" value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} /><Field id="edit-phone" label="Téléphone (facultatif)" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /><Field id="edit-email" label="E-mail (facultatif)" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /><Field id="edit-address" label="Adresse (facultative)" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></div></section><section className="border-t border-[var(--separator)]/60 pt-5"><h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Conditions commerciales</h3><div className="grid gap-3 sm:grid-cols-2"><Field id="edit-terms" label="Conditions de paiement (facultatif)" value={form.paymentTerms} onChange={(event) => setForm((current) => ({ ...current, paymentTerms: event.target.value }))} /><Field id="edit-lead" label="Délai habituel en jours (facultatif)" inputMode="numeric" value={form.leadTimeDays} onChange={(event) => setForm((current) => ({ ...current, leadTimeDays: event.target.value.replace(/\D/g, "") }))} /><div className="sm:col-span-2"><Label htmlFor="edit-notes">Notes internes (facultatif)</Label><Textarea id="edit-notes" rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div></div></section></div>
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
  const sourceLocation = catalog?.locations.find((location) => location.id === source);
  const destinationLocation = catalog?.locations.find((location) => location.id === destination);
  const selectedVariant = catalog?.products.flatMap((product) => product.variants.map((variant) => ({ ...variant, productName: product.name }))).find((variant) => variant.id === variantId);
  const transferValid = Boolean(source && destination && source !== destination && variantId && scaledQuantity(quantity) > 0n);
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
      <PageHeader title="Préparer un transfert">Créez le document de transfert, puis expédiez-le après contrôle. Le stock d’origine n’est débité qu’à l’expédition réelle.</PageHeader>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"><div className="space-y-6"><article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Itinéraire</h2><p className="mt-1 text-sm text-[var(--muted)]">L’origine et la destination doivent être deux lieux distincts.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><div><Label htmlFor="src">Lieu d’origine</Label><select id="src" value={source} onChange={(event) => { setSource(event.target.value); if (destination === event.target.value) setDestination(""); }} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir le lieu d’origine</option>{catalog?.locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.shopName}</option>)}</select></div><div><Label htmlFor="dst">Lieu destinataire</Label><select id="dst" value={destination} onChange={(event) => setDestination(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir la destination</option>{catalog?.locations.filter((location) => location.id !== source).map((location) => <option key={location.id} value={location.id}>{location.name} · {location.shopName}</option>)}</select></div></div></article><article className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><h2 className="font-display font-semibold">Produit transféré</h2><p className="mt-1 text-sm text-[var(--muted)]">La disponibilité réelle sera contrôlée par le serveur au moment de l’expédition.</p><div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]"><div><Label htmlFor="var">Produit et variante</Label><select id="var" value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-10 w-full rounded-md bg-[var(--surface-subtle)] px-3 text-sm"><option value="">Choisir un produit</option>{catalog?.products.flatMap((product) => product.variants.map((variant) => <option key={variant.id} value={variant.id}>{product.name} · {variant.name}</option>))}</select></div><Field id="tq" label="Quantité à préparer" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ""))} /></div></article></div><aside className="h-fit rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] xl:sticky xl:top-4"><h2 className="font-display font-semibold">Synthèse du transfert</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-[var(--muted)]">Origine</dt><dd className="mt-1 font-medium">{sourceLocation ? `${sourceLocation.name} · ${sourceLocation.shopName}` : "À sélectionner"}</dd></div><div><dt className="text-[var(--muted)]">Destination</dt><dd className="mt-1 font-medium">{destinationLocation ? `${destinationLocation.name} · ${destinationLocation.shopName}` : "À sélectionner"}</dd></div><div className="border-t border-[var(--separator)]/60 pt-3"><dt className="text-[var(--muted)]">Produit</dt><dd className="mt-1 font-medium">{selectedVariant ? `${selectedVariant.productName} · ${selectedVariant.name}` : "À sélectionner"}</dd></div><div><dt className="text-[var(--muted)]">Quantité</dt><dd className="mt-1 font-semibold tabular-nums">{quantity || "0"}</dd></div></dl><Button className="mt-5 w-full" disabled={pending || !transferValid} onClick={() => void submit()}>{pending ? "Création…" : "Préparer le transfert"}</Button><p className="mt-3 text-xs leading-5 text-[var(--muted)]">Cette action prépare le document. Elle ne débite pas encore le stock ; l’expédition reste une confirmation séparée.</p></aside></div>
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
