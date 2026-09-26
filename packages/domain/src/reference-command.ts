import { canonicalJson, sha256Hex } from "@cercle/contracts";
import type { PrismaClient } from "@cercle/database";

import { DomainError, withDeadlockRetry } from "./errors.js";

export interface ReferenceCommandInput {
  organizationId: string;
  actorId: string;
  key: string;
  balanceId: string;
  amountMinor: bigint;
  requestId: string;
}

export interface ReferenceCommandResult {
  balanceMinor: string;
  replayed: boolean;
}

interface StoredResponse {
  balanceMinor: string;
  replayed: boolean;
}

interface IdempotencyRow {
  request_hash: string;
  state: string;
  response_json: StoredResponse | null;
}

export async function postReferenceCommand(
  prisma: PrismaClient,
  input: ReferenceCommandInput,
  options?: { afterJournal?: () => Promise<void> },
): Promise<ReferenceCommandResult> {
  if (input.amountMinor <= 0n) {
    throw new DomainError("INVALID_MONEY", "Le montant technique doit être positif.", 422);
  }
  const requestHash = await sha256Hex(
    canonicalJson({
      amountMinor: input.amountMinor.toString(),
      balanceId: input.balanceId,
    }),
  );
  return withDeadlockRetry(() => prisma.$transaction((tx) => writeReference(tx, input, requestHash, options)));
}

async function writeReference(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  input: ReferenceCommandInput,
  requestHash: string,
  options?: { afterJournal?: () => Promise<void> },
): Promise<ReferenceCommandResult> {
  await tx.$queryRaw`
    INSERT INTO idempotency_keys (id, organization_id, actor_id, key, request_hash, state, created_at)
    VALUES (${crypto.randomUUID()}::uuid, ${input.organizationId}::uuid, ${input.actorId}::uuid, ${input.key}::uuid, ${requestHash}, 'PROCESSING', NOW())
    ON CONFLICT (organization_id, actor_id, key) DO NOTHING
  `;
  const locked = await tx.$queryRaw<IdempotencyRow[]>`
    SELECT request_hash, state, response_json
    FROM idempotency_keys
    WHERE organization_id = ${input.organizationId}::uuid
      AND actor_id = ${input.actorId}::uuid
      AND key = ${input.key}::uuid
    FOR UPDATE
  `;
  const current = locked[0];
  if (!current) {
    throw new DomainError("IDEMPOTENCY_MISSING", "La clé d’idempotence est introuvable.", 500);
  }
  if (current.request_hash !== requestHash) {
    throw new DomainError("IDEMPOTENCY_CONFLICT", "La même clé porte un contenu différent.", 409);
  }
  if (current.state === "DONE" && current.response_json) {
    return { balanceMinor: current.response_json.balanceMinor, replayed: true };
  }

  await tx.$queryRaw`
    SELECT id FROM reference_balances WHERE id = ${input.balanceId}::uuid FOR UPDATE
  `;
  const updated = await tx.$queryRaw<Array<{ balance_minor: bigint }>>`
    UPDATE reference_balances
    SET balance_minor = balance_minor - ${input.amountMinor.toString()}::bigint,
        version = version + 1
    WHERE id = ${input.balanceId}::uuid
      AND balance_minor >= ${input.amountMinor.toString()}::bigint
    RETURNING balance_minor
  `;
  const next = updated[0];
  if (!next) {
    throw new DomainError("INSUFFICIENT_REFERENCE_BALANCE", "Le solde technique est insuffisant.", 409);
  }

  const journalId = crypto.randomUUID();
  await tx.$executeRaw`
    INSERT INTO reference_journal (id, organization_id, balance_id, amount_signed_minor, operation_id, created_at)
    VALUES (
      ${journalId}::uuid,
      ${input.organizationId}::uuid,
      ${input.balanceId}::uuid,
      ${(-input.amountMinor).toString()}::bigint,
      ${input.key}::uuid,
      NOW()
    )
  `;
  if (options?.afterJournal) {
    await options.afterJournal();
  }
  await tx.$executeRaw`
    INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, request_id, after_json, created_at)
    VALUES (
      ${crypto.randomUUID()}::uuid,
      ${input.actorId}::uuid,
      'REFERENCE_POSTED',
      'reference_balance',
      ${input.balanceId},
      ${input.requestId},
      ${JSON.stringify({ balanceMinor: next.balance_minor.toString() })}::jsonb,
      NOW()
    )
  `;
  const eventId = crypto.randomUUID();
  await tx.$executeRaw`
    INSERT INTO outbox_events (id, topic, aggregate_id, payload, created_at, attempts)
    VALUES (
      ${eventId}::uuid,
      'platform.reference',
      ${input.balanceId},
      ${JSON.stringify({ operationId: input.key })}::jsonb,
      NOW(),
      0
    )
  `;
  const response = { balanceMinor: next.balance_minor.toString(), replayed: false };
  await tx.$executeRaw`
    UPDATE idempotency_keys
    SET state = 'DONE',
        response_status = 200,
        response_json = ${JSON.stringify(response)}::jsonb
    WHERE organization_id = ${input.organizationId}::uuid
      AND actor_id = ${input.actorId}::uuid
      AND key = ${input.key}::uuid
  `;
  return response;
}

export async function receiveInbox(
  prisma: PrismaClient,
  input: { organizationId: string; operationId: string; payloadHash: string },
): Promise<{ state: string; duplicate: boolean }> {
  const existing = await prisma.inboxMessage.findUnique({
    where: {
      organizationId_operationId: {
        organizationId: input.organizationId,
        operationId: input.operationId,
      },
    },
  });
  if (existing) {
    if (existing.payloadHash !== input.payloadHash) {
      throw new DomainError("IDEMPOTENCY_CONFLICT", "Le même operationId porte un contenu différent.", 409);
    }
    return { state: existing.state, duplicate: true };
  }
  const created = await prisma.inboxMessage.create({
    data: {
      organizationId: input.organizationId,
      operationId: input.operationId,
      payloadHash: input.payloadHash,
      state: "RECEIVED",
    },
  });
  return { state: created.state, duplicate: false };
}

export async function claimOutboxBatch(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE outbox_events
    SET attempts = attempts + 1,
        next_attempt_at = NOW() + INTERVAL '30 seconds'
    WHERE id IN (
      SELECT id
      FROM outbox_events
      WHERE published_at IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ORDER BY created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 20
    )
    RETURNING id
  `;
  return rows.map((row) => row.id);
}

export async function markOutboxPublished(prisma: PrismaClient, eventId: string): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id: eventId },
    data: { publishedAt: new Date() },
  });
}

export async function applyPlatformEffect(prisma: PrismaClient, eventId: string): Promise<"applied" | "duplicate"> {
  try {
    await prisma.platformEffect.create({ data: { eventId } });
    return "applied";
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return "duplicate";
    }
    throw error;
  }
}
