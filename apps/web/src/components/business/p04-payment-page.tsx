"use client";

import { ArrowLeft, CheckCircle2, Plus, WalletCards, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api, RequestError } from "../../lib/api";
import { paths } from "../../lib/session";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { PageHeader } from "../ui/page-header";
import { Skeleton } from "../ui/skeleton";
import type { CartLine } from "./p04-pages";

type Account = { id: string; name: string; type: string };
type Context = { shop: { name: string; code: string }; device: { name: string }; session: null | { businessDate: string }; accounts: Account[] };
type Quote = { authorizationId: string; netMinor: string; grossMinor: string; discountMinor: string };
type PaymentDraft = { accountId: string; amountMinor: string; cashReceivedMinor: string; changeGivenMinor: string; externalReference: string; changeConfirmed: boolean };

const CART_KEY = "cercle:p04:cart";
const money = (value: string | bigint) => `${BigInt(value).toLocaleString("fr-FR")} FCFA`;
const readCart = (): CartLine[] => { try { return JSON.parse(sessionStorage.getItem(CART_KEY) ?? "[]") as CartLine[]; } catch { return []; } };
const quantityScaled = (value: string) => { const [whole="0", fraction=""] = value.split("."); return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6)); };
const lineAmount = (line: CartLine) => (BigInt(line.unitPriceMinor) * quantityScaled(line.quantity) + 500_000n) / 1_000_000n - BigInt(line.discountMinor || "0");
const blankPayment = (): PaymentDraft => ({ accountId: "", amountMinor: "", cashReceivedMinor: "", changeGivenMinor: "", externalReference: "", changeConfirmed: false });
const numeric = (value: string) => /^\d+$/.test(value) ? BigInt(value) : 0n;

export function RefinedSalePaymentPage() {
  const router = useRouter();
  const [context, setContext] = useState<Context | null>(null);
  const [cart] = useState<CartLine[]>(() => typeof window === "undefined" ? [] : readCart());
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payments, setPayments] = useState<PaymentDraft[]>([blankPayment()]);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    api<Context>("/api/v1/manager/sales/context").then((value) => {
      setContext(value);
      if (value.accounts[0]) setPayments([{ ...blankPayment(), accountId: value.accounts[0].id }]);
    }).catch((error: RequestError) => setFailure(error.message));
  }, []);
  useEffect(() => {
    if (!cart.length) return;
    api<Quote>("/api/v1/sales/quote", { method: "POST", body: JSON.stringify({ lines: cart.map(({ saleUnitId, quantity, discountMinor }) => ({ saleUnitId, quantity, discountMinor })) }) }).then(setQuote).catch((error: RequestError) => setFailure(error.message));
  }, [cart]);
  useEffect(() => {
    if (!quote) return;
    setPayments((current) => current.length === 1 && current[0] && !current[0].amountMinor ? [{ ...current[0], amountMinor: quote.netMinor }] : current);
  }, [quote, context]);

  const total = BigInt(quote?.netMinor ?? "0");
  const allocated = payments.reduce((sum, payment) => sum + numeric(payment.amountMinor), 0n);
  const remaining = total - allocated;
  const account = (payment: PaymentDraft) => context?.accounts.find((item) => item.id === payment.accountId);
  const changeDue = (payment: PaymentDraft) => account(payment)?.type === "CASH" ? numeric(payment.cashReceivedMinor) - numeric(payment.amountMinor) : 0n;
  const update = (index: number, next: Partial<PaymentDraft>) => setPayments((current) => current.map((payment, position) => position === index ? { ...payment, ...next } : payment));
  const validation = useMemo(() => {
    if (!quote || !context) return "Calcul du total en cours…";
    if (payments.some((payment) => !payment.accountId)) return "Choisissez une caisse ou un compte pour chaque paiement.";
    if (new Set(payments.map((payment) => payment.accountId)).size !== payments.length) return "Chaque caisse ou compte ne peut être utilisé qu’une fois dans cette vente.";
    if (payments.some((payment) => numeric(payment.amountMinor) <= 0n)) return "Indiquez le montant affecté à chaque moyen de paiement.";
    if (allocated !== total) return remaining > 0n ? `Il reste ${money(remaining)} à répartir.` : `La répartition dépasse le total de ${money(-remaining)}.`;
    for (const payment of payments) {
      if (account(payment)?.type !== "CASH") continue;
      if (!payment.cashReceivedMinor) return "Saisissez le montant remis par le client.";
      if (changeDue(payment) < 0n) return `Il manque ${money(-changeDue(payment))} en espèces.`;
      if (!payment.changeConfirmed) return "Confirmez la monnaie rendue au client.";
      if (numeric(payment.changeGivenMinor) !== changeDue(payment)) return "La monnaie déclarée ne correspond pas au montant calculé.";
    }
    return null;
  }, [quote, context, payments, allocated, total, remaining]);

  function addPayment() {
    setPayments((current) => current.length === 1
      ? [{ ...current[0]!, amountMinor: "", changeConfirmed: false }, blankPayment()]
      : [...current, { ...blankPayment(), amountMinor: remaining > 0n ? remaining.toString() : "" }]);
  }
  function removePayment(index: number) {
    setPayments((current) => {
      const next = current.filter((_, position) => position !== index);
      return next.length === 1 ? [{ ...next[0]!, amountMinor: quote?.netMinor ?? "", changeConfirmed: false }] : next;
    });
  }
  function submit() {
    if (!quote || validation) return;
    setPending(true); setFailure(null);
    const payload = payments.map((payment) => ({ accountId: payment.accountId, amountMinor: payment.amountMinor, ...(account(payment)?.type === "CASH" ? { cashReceivedMinor: payment.cashReceivedMinor, changeGivenMinor: payment.changeGivenMinor } : {}), ...(payment.externalReference.trim() ? { externalReference: payment.externalReference.trim() } : {}) }));
    api<{ id: string }>("/api/v1/sales", { method: "POST", body: JSON.stringify({ authorizationId: quote.authorizationId, lines: cart.map(({ saleUnitId, quantity, discountMinor }) => ({ saleUnitId, quantity, discountMinor })), payments: payload }) }).then((sale) => { sessionStorage.removeItem(CART_KEY); router.replace(`/manager/sales/${sale.id}`); }).catch((error: RequestError) => setFailure(error.message)).finally(() => setPending(false));
  }

  if (!cart.length) return <section><PageHeader title="Paiement">Le panier est vide.</PageHeader><Link href={paths.managerSale}><Button>Retourner aux produits</Button></Link></section>;
  if (!context) return <Skeleton className="h-[32rem]" />;
  return <section className="mx-auto max-w-6xl space-y-5">
    <PageHeader title="Encaisser la vente">Vérifiez le panier, indiquez comment le client paie, puis confirmez l’encaissement.</PageHeader>
    {failure ? <Alert tone="error">{failure}</Alert> : null}
    <div className="rounded-lg bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))] px-4 py-3 text-sm"><strong>{context.shop.name}</strong><span className="mx-2 text-[var(--muted)]">·</span><span className="text-[var(--muted)]">{context.device.name} · session du {new Date(`${context.session?.businessDate}T00:00:00Z`).toLocaleDateString("fr-FR")}</span></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <section className="h-fit rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display font-semibold">Résumé du panier</h2>
        <ul className="mt-3 divide-y divide-[var(--separator)]/60">{cart.map((line) => <li key={line.saleUnitId} className="grid gap-1 py-4 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-semibold">{line.product}</p><p className="text-[var(--muted)]">{line.variant} · {line.unit} · quantité {line.quantity}</p></div><div className="sm:text-right"><strong>{money(lineAmount(line))}</strong><p className="text-xs text-[var(--muted)]">{money(line.unitPriceMinor)} / {line.symbol}</p></div></li>)}</ul>
        <dl className="mt-4 space-y-2 rounded-lg bg-[var(--surface-subtle)] p-4 text-sm"><div className="flex justify-between"><dt>Sous-total</dt><dd>{money(quote?.grossMinor ?? "0")}</dd></div><div className="flex justify-between"><dt>Remises</dt><dd>− {money(quote?.discountMinor ?? "0")}</dd></div><div className="flex justify-between border-t border-[var(--separator)]/60 pt-3 text-base"><dt className="font-semibold">Total à encaisser</dt><dd className="font-display text-xl font-semibold">{money(total)}</dd></div></dl>
        <Link href={paths.managerSale} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]"><ArrowLeft className="size-4" /> Modifier le panier</Link>
      </section>
      <section className="rounded-xl bg-[var(--surface)] p-5 shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-[var(--surface-subtle)] text-[var(--primary)]"><WalletCards className="size-5" /></div><div><p className="text-sm text-[var(--muted)]">Total à encaisser</p><p className="font-display text-2xl font-semibold">{money(total)}</p></div></div>
        <div className="mt-5 space-y-4"><AnimatePresence initial={false}>{payments.map((payment, index) => { const selected = account(payment); const due = changeDue(payment); return <motion.div key={index} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3 rounded-lg bg-[var(--surface-subtle)] p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{payments.length === 1 ? "Paiement" : `Paiement ${index + 1}`}</h3>{payments.length > 1 ? <button type="button" aria-label={`Retirer le paiement ${index + 1}`} onClick={() => removePayment(index)}><X className="size-4" /></button> : null}</div><label className="block text-sm font-medium">Caisse ou compte de destination<select value={payment.accountId} onChange={(event) => update(index, { accountId: event.target.value, cashReceivedMinor: "", changeGivenMinor: "", changeConfirmed: false })} className="mt-1.5 h-11 w-full rounded-md bg-[var(--surface)] px-3 outline-none focus:ring-1 focus:ring-[var(--focus)]"><option value="">Choisir</option>{context.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type === "CASH" ? "Espèces" : item.type === "MOBILE_MONEY" ? "Mobile Money" : item.type === "BANK" ? "Banque" : "Autre"}</option>)}</select></label>{payments.length === 1 ? <div className="flex items-center justify-between rounded-md bg-[var(--surface)] px-3 py-2.5 text-sm"><span className="text-[var(--muted)]">Montant du panier</span><strong>{money(total)}</strong></div> : <Field id={`payment-${index}`} label="Montant payé avec ce moyen" inputMode="numeric" value={payment.amountMinor} onChange={(event) => update(index, { amountMinor: event.target.value, changeConfirmed: false })} />}{selected?.type === "CASH" ? <><Field id={`cash-received-${index}`} label="Montant remis par le client" inputMode="numeric" value={payment.cashReceivedMinor} onChange={(event) => { const received = numeric(event.target.value); const nextDue = received - numeric(payment.amountMinor); update(index, { cashReceivedMinor: event.target.value, changeGivenMinor: nextDue >= 0n ? nextDue.toString() : "", changeConfirmed: false }); }} /><dl className="space-y-2 rounded-md bg-[var(--surface)] p-3 text-sm"><div className="flex justify-between"><dt>Monnaie calculée</dt><dd className="font-semibold">{money(due > 0n ? due : 0n)}</dd></div><div className="flex justify-between"><dt>Montant net encaissé</dt><dd className="font-semibold">{money(payment.amountMinor || "0")}</dd></div></dl><Field id={`change-given-${index}`} label="Monnaie effectivement rendue" inputMode="numeric" value={payment.changeGivenMinor} onChange={(event) => update(index, { changeGivenMinor: event.target.value, changeConfirmed: false })} /><label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={payment.changeConfirmed} onChange={(event) => update(index, { changeConfirmed: event.target.checked })} /><span>Je confirme avoir rendu <strong>{money(payment.changeGivenMinor || "0")}</strong> au client.</span></label></> : <Field id={`reference-${index}`} label="Référence externe (facultatif)" value={payment.externalReference} onChange={(event) => update(index, { externalReference: event.target.value })} />}</motion.div>; })}</AnimatePresence>
          <div className="rounded-md bg-[var(--surface-subtle)] p-3 text-sm"><div className="flex justify-between"><span>Total réparti</span><strong>{money(allocated)}</strong></div><div className="mt-1 flex justify-between"><span>Reste à répartir</span><strong className={remaining === 0n ? "text-[var(--success)]" : "text-[var(--warning)]"}>{money(remaining > 0n ? remaining : 0n)}</strong></div></div>
          <Button className="w-full" variant="secondary" disabled={payments.length >= 10 || (payments.length > 1 && remaining <= 0n)} onClick={addPayment}><Plus className="size-4" /> {payments.length === 1 ? "Partager entre plusieurs moyens" : "Ajouter un autre moyen"}</Button>
          {validation ? <p className="text-sm text-[var(--warning)]" role="status">{validation}</p> : <p className="flex items-center gap-2 text-sm text-[var(--success)]"><CheckCircle2 className="size-4" /> Encaissement prêt à être confirmé.</p>}
          <Button className="w-full" disabled={Boolean(validation) || pending} onClick={submit}>{pending ? "Encaissement en cours…" : `Encaisser ${money(total)}`}<CheckCircle2 className="size-4" /></Button>
        </div>
      </section>
    </div>
  </section>;
}
