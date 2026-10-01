import { createPrismaClient, loadRootEnv } from "@cercle/database";
import {
  assignManager,
  createExpense,
  createFundTransfer,
  createPaymentSource,
  createPrice,
  createProduct,
  createRequest,
  createShipment,
  createShop,
  createSupplier,
  createUnit,
  createVariant,
  decideExpense,
  decideRequest,
  decideShipment,
  dispatchShipment,
  openCashSession,
  payExpense,
  postOwnerFund,
  postPurchase,
  postReceipt,
  postSale,
  quoteSale,
  receiveFundTransfer,
  respondToDiscrepancy,
  saveOpeningDraft,
  sendFundTransfer,
  startCount,
  submitCount,
  submitExpense,
  submitRequest,
  submitShipment,
  transitionShop,
  validateOpening,
} from "../packages/domain/src/index.ts";

const OWNER_EMAIL = "owner.local@example.test";
const FIRST_MANAGER_EMAIL = "manager.local@example.test";
const DEMO_MANAGER_EMAIL = "manager.akwa.local@example.test";
const DEMO_SHOP_CODE = "CC03";
const DEMO_PRODUCT_SKU = "SEED-SAVON";
const DEMO_EXPENSE = "Transport local du réassort — seed complet";
const DEMO_FUND_REASON = "Fonds de roulement Akwa — seed complet";
const DEMO_REQUEST = "Réassort savon pour le parcours complet de démonstration";
const DEMO_PENDING_REQUEST = "Demande en attente pour démontrer la file propriétaire";
const DEMO_TRANSFER_NOTE = "Transfert inter-boutiques — seed complet";

function assertLocalDevelopmentDatabase(databaseUrl: string): void {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Le seed complet refuse un hôte qui n’est pas 127.0.0.1 ou localhost.");
  }
  if (name.endsWith("_test")) {
    throw new Error("Le seed complet refuse la base de test. Utiliser DATABASE_URL (cercle_complet).");
  }
}

function commandContext(organizationId: string, actorId: string, actorRole: "OWNER" | "MANAGER", label: string) {
  const key = crypto.randomUUID();
  return { organizationId, actorId, actorRole, key, requestId: `seed-demo-${label}-${key}` };
}

function cashDenominations(amount: bigint) {
  const values = [10_000n, 5_000n, 2_000n, 1_000n, 500n, 100n, 50n, 25n, 10n, 5n, 2n, 1n];
  let remaining = amount;
  return values.map((value) => {
    const quantity = Number(remaining / value);
    remaining %= value;
    return { valueMinor: value.toString(), quantity };
  });
}

async function main(): Promise<void> {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL est requis.");
  assertLocalDevelopmentDatabase(databaseUrl);

  const prisma = createPrismaClient(databaseUrl);
  try {
    const [ownerAuth, firstManagerAuth, demoManagerAuth] = await Promise.all([
      prisma.user.findUnique({ where: { email: OWNER_EMAIL } }),
      prisma.user.findUnique({ where: { email: FIRST_MANAGER_EMAIL } }),
      prisma.user.findUnique({ where: { email: DEMO_MANAGER_EMAIL } }),
    ]);
    if (!ownerAuth || !firstManagerAuth || !demoManagerAuth) {
      throw new Error("Comptes locaux absents. Exécutez d’abord : corepack pnpm db:seed-local");
    }
    const [owner, firstManager, demoManager] = await Promise.all([
      prisma.appUser.findFirstOrThrow({ where: { authUserId: ownerAuth.id, role: "OWNER" } }),
      prisma.appUser.findFirstOrThrow({ where: { authUserId: firstManagerAuth.id, role: "MANAGER" } }),
      prisma.appUser.findFirstOrThrow({ where: { authUserId: demoManagerAuth.id, role: "MANAGER" } }),
    ]);
    const organizationId = owner.organizationId;
    const ownerCtx = (label: string) => commandContext(organizationId, owner.id, "OWNER", label);
    const managerCtx = (label: string) => commandContext(organizationId, demoManager.id, "MANAGER", label);
    const firstManagerCtx = (label: string) => commandContext(organizationId, firstManager.id, "MANAGER", label);

    let shop = await prisma.shop.findFirst({ where: { organizationId, code: DEMO_SHOP_CODE } });
    if (!shop) {
      const created = await createShop(prisma, ownerCtx("shop"), {
        code: DEMO_SHOP_CODE,
        name: "Boutique Akwa",
      });
      shop = await prisma.shop.findUniqueOrThrow({ where: { id: created.id } });
      console.log("Boutique de démonstration créée : CC03 — Boutique Akwa.");
    }

    if (!(await prisma.managerAssignment.findFirst({ where: { shopId: shop.id, userId: demoManager.id, endedAt: null } }))) {
      await assignManager(prisma, { organizationId, actorId: owner.id, shopId: shop.id, userId: demoManager.id, reason: "Affectation seed complet", requestId: crypto.randomUUID() });
    }
    if (!(await prisma.device.findFirst({ where: { shopId: shop.id, userId: demoManager.id, status: "ACTIVE" } }))) {
      await prisma.device.create({ data: { organizationId, shopId: shop.id, userId: demoManager.id, name: "Tablette Akwa", publicKey: `seed-cc03-${crypto.randomUUID()}-public-key-material`, status: "ACTIVE" } });
    }

    let product = await prisma.product.findFirst({ where: { organizationId, sku: DEMO_PRODUCT_SKU }, include: { variants: { include: { units: true } } } });
    if (!product) {
      const created = await createProduct(prisma, ownerCtx("product"), { name: "Savon ménager", sku: DEMO_PRODUCT_SKU, family: "Entretien", shopIds: [shop.id] });
      const variant = await createVariant(prisma, ownerCtx("variant"), created.id, { name: "Pain 400 g", sku: "SEED-SAVON-400" });
      const unit = await createUnit(prisma, ownerCtx("unit"), variant.id, { name: "Pièce", symbol: "pc", factor: "1", precision: 0, isReference: true });
      await createPrice(prisma, ownerCtx("price"), { saleUnitId: unit.id, shopId: shop.id, amountMinor: "1250" });
      product = await prisma.product.findUniqueOrThrow({ where: { id: created.id }, include: { variants: { include: { units: true } } } });
    }
    const variant = product.variants[0];
    const unit = variant?.units[0];
    if (!variant || !unit) throw new Error("Le produit de démonstration est incomplet.");

    let cashSource = await prisma.paymentSource.findFirst({ where: { organizationId, shopId: shop.id, name: "Caisse Akwa" } });
    if (!cashSource) cashSource = await prisma.paymentSource.findUniqueOrThrow({ where: { id: (await createPaymentSource(prisma, ownerCtx("cash"), { name: "Caisse Akwa", type: "CASH", shopId: shop.id })).id } });
    let mobileSource = await prisma.paymentSource.findFirst({ where: { organizationId, shopId: shop.id, name: "Mobile Money Akwa" } });
    if (!mobileSource) mobileSource = await prisma.paymentSource.findUniqueOrThrow({ where: { id: (await createPaymentSource(prisma, ownerCtx("mobile"), { name: "Mobile Money Akwa", type: "MOBILE_MONEY", shopId: shop.id })).id } });
    const cash = await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: cashSource.id } });
    const mobile = await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: mobileSource.id } });
    const location = await prisma.location.findFirstOrThrow({ where: { shopId: shop.id, type: "SHOP" } });

    if (shop.status === "SETUP" && !(await prisma.openingDraft.findFirst({ where: { shopId: shop.id, status: "VALIDATED" } }))) {
      await saveOpeningDraft(prisma, ownerCtx("opening"), shop.id, {
        step: 12,
        stockLines: [{ variantId: variant.id, locationId: location.id, quantity: "40", unitCostMinor: "700" }],
        funds: [{ accountId: cash.id, amountMinor: "350000" }, { accountId: mobile.id, amountMinor: "50000" }],
        obligations: [{ label: "Solde fournisseur initial Akwa", amountMinor: "30000" }],
      });
      await validateOpening(prisma, ownerCtx("opening-validate"), shop.id);
    }
    shop = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
    if (shop.status === "SETUP") await transitionShop(prisma, ownerCtx("activate"), shop.id, "ACTIVE", "Activation du parcours complet local");

    let session = await prisma.cashSession.findFirst({ where: { shopId: shop.id, status: { in: ["OPEN", "COUNTING"] } }, orderBy: { openedAt: "desc" } });
    if (!session) session = await prisma.cashSession.findUniqueOrThrow({ where: { id: (await openCashSession(prisma, managerCtx("open-session"))).id } });

    if ((await prisma.sale.count({ where: { shopId: shop.id } })) === 0) {
      for (const [index, quantity] of ["3", "2"].entries()) {
        const lines = [{ saleUnitId: unit.id, quantity }];
        const quote = await quoteSale(prisma, organizationId, demoManager.id, lines);
        const total = (BigInt(quantity) * 1_250n).toString();
        await postSale(prisma, managerCtx(`sale-${index + 1}`), {
          authorizationId: quote.authorizationId,
          lines,
          payments: index === 0
            ? [{ accountId: cash.id, amountMinor: total, cashReceivedMinor: "5000", changeGivenMinor: (5_000n - BigInt(total)).toString() }]
            : [{ accountId: mobile.id, amountMinor: total, externalReference: "SEED-MM-AKWA-001" }],
        });
      }
      console.log("Ventes espèces et Mobile Money enregistrées.");
    }

    let expense = await prisma.expense.findFirst({ where: { organizationId, description: DEMO_EXPENSE } });
    if (!expense) {
      const created = await createExpense(prisma, managerCtx("expense-create"), { category: "TRANSPORT", description: DEMO_EXPENSE, amountMinor: "12000", accountId: cash.id, beneficiary: "Moto livraison Akwa", receiptExceptionReason: "Prestataire informel sans reçu papier" });
      await submitExpense(prisma, managerCtx("expense-submit"), created.id);
      expense = await prisma.expense.findUniqueOrThrow({ where: { id: created.id } });
    }
    if (expense.status === "REQUESTED") await decideExpense(prisma, ownerCtx("expense-approve"), expense.id, "APPROVE", "Dépense cohérente avec le réassort local.");
    expense = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
    if (expense.status === "AUTHORIZED") await payExpense(prisma, managerCtx("expense-pay"), expense.id);

    let bankSource = await prisma.paymentSource.findFirst({ where: { organizationId, shopId: null, name: "Compte banque seed" } });
    if (!bankSource) bankSource = await prisma.paymentSource.findUniqueOrThrow({ where: { id: (await createPaymentSource(prisma, ownerCtx("bank"), { name: "Compte banque seed", type: "BANK" })).id } });
    const bank = await prisma.moneyAccount.findFirstOrThrow({ where: { paymentSourceId: bankSource.id } });
    if (bank.balanceMinor < 500_000n && !(await prisma.moneyEvent.findFirst({ where: { organizationId, type: "OWNER_CONTRIBUTION", reason: "Apport seed complet au compte banque" } }))) {
      await postOwnerFund(prisma, ownerCtx("bank-fund"), { accountId: bank.id, amountMinor: "500000", reason: "Apport seed complet au compte banque" });
    }
    const funds = await prisma.fundTransfer.findFirst({ where: { organizationId, reason: DEMO_FUND_REASON } });
    if (!funds) {
      const created = await createFundTransfer(prisma, ownerCtx("fund-create"), { sourceAccountId: bank.id, destinationAccountId: cash.id, amountMinor: "40000", purpose: "FLOAT", reason: DEMO_FUND_REASON, shopId: shop.id });
      await sendFundTransfer(prisma, ownerCtx("fund-send"), created.id);
      await receiveFundTransfer(prisma, managerCtx("fund-receive"), created.id, "25000", "Réception partielle, reliquat attendu demain.");
    }

    let supplier = await prisma.supplier.findFirst({ where: { organizationId, normalizedName: "savonnerie du littoral" } });
    if (!supplier) {
      const created = await createSupplier(prisma, ownerCtx("supplier"), { name: "Savonnerie du Littoral", tradeName: "SDL", phone: "699100200", email: "commandes@sdl.example.test", address: "Zone industrielle de Bassa, Douala", taxId: "M012345678901A", contactName: "Aline Mbarga", paymentTerms: "50 % à la commande, solde à 15 jours", leadTimeDays: 2, notes: "Fournisseur de démonstration locale." });
      supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } });
    }

    let request = await prisma.purchaseRequest.findFirst({ where: { organizationId, comment: DEMO_REQUEST }, include: { lines: true, approvals: true } });
    if (!request) {
      const created = await createRequest(prisma, managerCtx("request-create"), { comment: DEMO_REQUEST, urgency: "HIGH", suggestedSupplierId: supplier.id, estimatedFeesMinor: "3000", lines: [{ variantId: variant.id, unitId: unit.id, quantity: "20", estimatedUnitMinor: "720" }] });
      await submitRequest(prisma, managerCtx("request-submit"), created.id);
      request = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true, approvals: true } });
    }
    if (request.status === "SUBMITTED") {
      await decideRequest(prisma, ownerCtx("request-approve"), request.id, { outcome: "APPROVED", buyer: "MANAGER", budgetMinor: "16000", sourceAccountId: cash.id, reason: "Réassort prioritaire validé.", lines: [{ requestLineId: request.lines[0]!.id, maxQtyBase: "20", maxAmountMinor: "16000" }] });
      request = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: request.id }, include: { lines: true, approvals: true } });
    }
    let purchase = await prisma.purchase.findFirst({ where: { requestId: request.id } });
    if (!purchase) {
      const approval = await prisma.purchaseApproval.findFirstOrThrow({ where: { requestId: request.id } });
      const created = await postPurchase(prisma, managerCtx("purchase"), { supplierId: supplier.id, approvalId: approval.id, lines: [{ variantId: variant.id, unitId: unit.id, quantity: "20", unitPriceMinor: "720" }], payments: [{ accountId: cash.id, amountMinor: "7000" }] });
      purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: created.id } });
    }
    const inbound = await prisma.shipment.findFirst({ where: { purchaseId: purchase.id }, include: { lines: true } });
    if (inbound && inbound.status === "DISPATCHED") {
      await postReceipt(prisma, managerCtx("purchase-receipt"), { shipmentId: inbound.id, deliveryComplete: true, lines: inbound.lines.map((line) => ({ shipmentLineId: line.id, acceptedQty: line.dispatchedQty.toString(), remarks: "Livraison conforme du seed complet" })) });
    }

    if (!(await prisma.purchaseRequest.findFirst({ where: { organizationId, comment: DEMO_PENDING_REQUEST } }))) {
      const pending = await createRequest(prisma, managerCtx("pending-request"), { comment: DEMO_PENDING_REQUEST, urgency: "NORMAL", suggestedSupplierId: supplier.id, lines: [{ variantId: variant.id, unitId: unit.id, quantity: "8", estimatedUnitMinor: "750" }] });
      await submitRequest(prisma, managerCtx("pending-submit"), pending.id);
    }

    const centre = await prisma.shop.findFirst({ where: { organizationId, code: "CC01" } });
    const centreLocation = centre ? await prisma.location.findFirst({ where: { shopId: centre.id, type: "SHOP" } }) : null;
    let outbound = await prisma.shipment.findFirst({ where: { organizationId, note: DEMO_TRANSFER_NOTE }, include: { lines: true } });
    if (centreLocation && !outbound) {
      const created = await createShipment(prisma, managerCtx("transfer-create"), { sourceLocationId: location.id, destinationLocationId: centreLocation.id, note: DEMO_TRANSFER_NOTE, lines: [{ variantId: variant.id, quantity: "4" }] });
      await submitShipment(prisma, managerCtx("transfer-submit"), created.id);
      await decideShipment(prisma, ownerCtx("transfer-approve"), created.id, "APPROVED", "Rééquilibrage du stock entre boutiques.");
      await dispatchShipment(prisma, managerCtx("transfer-dispatch"), created.id);
      outbound = await prisma.shipment.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } });
    }
    if (outbound?.status === "DISPATCHED" && centreLocation) {
      await postReceipt(prisma, firstManagerCtx("transfer-receipt"), { shipmentId: outbound.id, deliveryComplete: false, lines: [{ shipmentLineId: outbound.lines[0]!.id, acceptedQty: "3", remarks: "Réception partielle, une pièce reste en transit." }] });
    }

    if (!(await prisma.cashSession.findFirst({ where: { shopId: shop.id, status: "CLOSED" } }))) {
      session = await prisma.cashSession.findFirstOrThrow({ where: { shopId: shop.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
      await startCount(prisma, managerCtx("count-start"));
      const accounts = await prisma.moneyAccount.findMany({ where: { shopId: shop.id, paymentSource: { status: "ACTIVE" } }, include: { paymentSource: true } });
      const lines = accounts.map((account) => {
        const declared = account.id === cash.id ? account.balanceMinor - 2_000n : account.balanceMinor;
        return account.paymentSource.type === "CASH"
          ? { accountId: account.id, denominations: cashDenominations(declared) }
          : { accountId: account.id, declaredMinor: declared.toString(), confirmedEmpty: declared === 0n };
      });
      await submitCount(prisma, managerCtx("count-submit"), session.id, lines);
      const discrepancy = await prisma.discrepancyCase.findFirst({ where: { sessionId: session.id, state: "NEEDS_INFO" } });
      if (discrepancy) await respondToDiscrepancy(prisma, managerCtx("discrepancy-response"), discrepancy.id, { text: "Écart constaté après vérification : petite dépense de manutention non enregistrée pendant le service." });
      await openCashSession(prisma, managerCtx("next-session"));
    }

    console.log("");
    console.log("Seed local complet terminé (P03 à P06). ");
    console.log("  Boutique        CC03 — Boutique Akwa");
    console.log(`  Nouveau gérant  ${DEMO_MANAGER_EMAIL}`);
    console.log("  Mot de passe    local-dev-password-15");
    console.log("  Parcours        ventes, caisse, dépense, fonds, écart, demande, achat, réception et transfert");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
