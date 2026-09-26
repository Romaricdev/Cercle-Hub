import { createPrismaClient, loadRootEnv } from "@cercle/database";
import { applyPlatformEffect, assertSortColumn, postReferenceCommand, receiveInbox } from "@cercle/domain";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { Queue, Worker } from "bullmq";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAnonymousStorageClient,
  createStorageClient,
  putPrivateObject,
  readPrivateObject,
  signReadUrl,
  waitUntilPrivateObjectReadable,
} from "../../packages/storage/src/index.ts";

const execFileAsync = promisify(execFile);

async function waitForDockerHealthy(container: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "-f",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      container,
    ]);
    if (stdout.trim() === "healthy") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${container} n’est pas healthy après redémarrage.`);
}

loadRootEnv();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl?.includes("cercle_complet_test")) {
  throw new Error("TEST_DATABASE_URL doit viser cercle_complet_test.");
}
const prisma = createPrismaClient(databaseUrl);
const redisUrl = process.env.REDIS_URL ?? "";
const storageConfig = {
  endpoint: process.env.S3_ENDPOINT ?? "",
  region: process.env.S3_REGION ?? "us-east-1",
  bucket: process.env.S3_BUCKET ?? "cercle-private",
  accessKeyId: process.env.S3_ACCESS_KEY ?? "",
  secretAccessKey: process.env.S3_SECRET_KEY ?? "",
};

describe("socle PostgreSQL, Redis et S3", () => {
  const organizationId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const balanceId = crypto.randomUUID();

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: organizationId } });
    await prisma.user.create({
      data: {
        id: `auth-${actorId}`,
        name: "Propriétaire test",
        email: `${actorId}@example.test`,
        updatedAt: new Date(),
      },
    });
    await prisma.appUser.create({
      data: {
        id: actorId,
        authUserId: `auth-${actorId}`,
        organizationId,
        role: "OWNER",
        mfaRequired: true,
      },
    });
    await prisma.referenceBalance.create({
      data: {
        id: balanceId,
        organizationId,
        label: "probe'; DROP TABLE reference_balances; --",
        balanceMinor: 100n,
        version: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("T58 annule journal, audit et outbox quand la transaction échoue", async () => {
    const key = crypto.randomUUID();
    await expect(
      postReferenceCommand(
        prisma,
        { organizationId, actorId, key, balanceId, amountMinor: 40n, requestId: "rollback" },
        { afterJournal: async () => Promise.reject(new Error("panne avant commit")) },
      ),
    ).rejects.toThrow(/panne/);
    const balance = await prisma.referenceBalance.findUniqueOrThrow({ where: { id: balanceId } });
    expect(balance.balanceMinor).toBe(100n);
    expect(await prisma.referenceJournal.count({ where: { operationId: key } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { requestId: "rollback" } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { topic: "platform.reference", aggregateId: balanceId } })).toBe(0);
    expect(await prisma.idempotencyKey.count({ where: { key } })).toBe(0);
  });

  it("poste un mouvement technique idempotent et refuse un payload différent", async () => {
    const key = crypto.randomUUID();
    const input = { organizationId, actorId, key, balanceId, amountMinor: 30n, requestId: "post" };
    const first = await postReferenceCommand(prisma, input);
    const second = await postReferenceCommand(prisma, input);
    expect(first.replayed).toBe(false);
    expect(second).toEqual({ balanceMinor: "70", replayed: true });
    expect(await prisma.referenceJournal.count({ where: { operationId: key } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { topic: "platform.reference", aggregateId: balanceId } })).toBe(1);
    await expect(postReferenceCommand(prisma, { ...input, amountMinor: 10n, requestId: "conflict" })).rejects.toThrow(/différent/);
  });

  it("SEC15 garde un solde non négatif sous deux débits concurrents", async () => {
    const results = await Promise.allSettled([
      postReferenceCommand(prisma, {
        organizationId,
        actorId,
        key: crypto.randomUUID(),
        balanceId,
        amountMinor: 70n,
        requestId: "a",
      }),
      postReferenceCommand(prisma, {
        organizationId,
        actorId,
        key: crypto.randomUUID(),
        balanceId,
        amountMinor: 70n,
        requestId: "b",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const balance = await prisma.referenceBalance.findUniqueOrThrow({ where: { id: balanceId } });
    expect(balance.balanceMinor).toBe(0n);
  });

  it("SEC03 refuse un tri hors liste et conserve une valeur hostile", async () => {
    expect(() => assertSortColumn("created_at; drop table reference_balances")).toThrow(/tri/);
    const sort = assertSortColumn("id");
    const rows = await prisma.$queryRawUnsafe<Array<{ label: string }>>(
      `SELECT label FROM reference_balances WHERE organization_id = $1::uuid ORDER BY ${sort}`,
      organizationId,
    );
    expect(rows[0]?.label).toContain("DROP TABLE");
    expect(await prisma.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('reference_balances') IS NOT NULL AS present`).toEqual([
      { present: true },
    ]);
  });

  it("refuse UPDATE sur le journal au rôle applicatif", async () => {
    const journal = await prisma.referenceJournal.findFirstOrThrow();
    await expect(
      prisma.$executeRaw`UPDATE reference_journal SET amount_signed_minor = 0 WHERE id = ${journal.id}::uuid`,
    ).rejects.toThrow();
  });

  it("détecte un conflit d’inbox", async () => {
    const operationId = crypto.randomUUID();
    const first = await receiveInbox(prisma, { organizationId, operationId, payloadHash: "a".repeat(64) });
    const duplicate = await receiveInbox(prisma, { organizationId, operationId, payloadHash: "a".repeat(64) });
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    await expect(receiveInbox(prisma, { organizationId, operationId, payloadHash: "b".repeat(64) })).rejects.toThrow(/différent/);
  });

  it("BullMQ réessaie sans appliquer deux fois", async () => {
    const eventId = crypto.randomUUID();
    await prisma.outboxEvent.create({
      data: { id: eventId, topic: "platform.reference", aggregateId: balanceId, payload: { operationId: eventId } },
    });
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue("platform.outbox.test", { connection });
    let attempts = 0;
    const worker = new Worker(
      "platform.outbox.test",
      async (job) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("transient");
        }
        await applyPlatformEffect(prisma, String(job.data.eventId));
      },
      { connection, concurrency: 1 },
    );
    await queue.add("effect", { eventId }, { jobId: eventId, attempts: 3, backoff: { type: "fixed", delay: 50 } });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("job timeout")), 20_000);
      worker.on("completed", () => {
        clearTimeout(timer);
        resolve();
      });
      worker.on("failed", (job, error) => {
        if (job && job.attemptsMade >= 3) {
          clearTimeout(timer);
          reject(error);
        }
      });
    });
    expect(attempts).toBe(2);
    expect(await applyPlatformEffect(prisma, eventId)).toBe("duplicate");
    expect(await prisma.platformEffect.count({ where: { eventId } })).toBe(1);
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
  });

  it("SEC12 garde le bucket privé, relit après redémarrage et fait expirer une URL", async () => {
    const client = createStorageClient(storageConfig);
    await client.send(new CreateBucketCommand({ Bucket: storageConfig.bucket })).catch((error: unknown) => {
      const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
      if (!name.includes("BucketAlready") && !name.includes("Exists")) {
        throw error;
      }
    });
    const key = `foundation/${crypto.randomUUID()}.bin`;
    const payload = new TextEncoder().encode("prive");
    await putPrivateObject(client, storageConfig.bucket, key, payload);
    client.destroy();
    await execFileAsync("docker", ["restart", "cercle-seaweedfs"]);
    // HeadBucket/S3 HTTP répondent avant le heartbeat des volumes : attendre la topologie, puis GetObject.
    await waitForDockerHealthy("cercle-seaweedfs");
    const restoredClient = await waitUntilPrivateObjectReadable(storageConfig, key);
    const restored = await readPrivateObject(restoredClient, storageConfig.bucket, key);
    expect(Buffer.from(restored).toString()).toBe("prive");
    const anonymous = createAnonymousStorageClient(storageConfig);
    await expect(readPrivateObject(anonymous, storageConfig.bucket, key)).rejects.toThrow();
    const signed = await signReadUrl(restoredClient, storageConfig.bucket, key, 1);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const response = await fetch(signed);
    expect(response.status).toBeGreaterThanOrEqual(400);
    restoredClient.destroy();
    anonymous.destroy();
  }, 120_000);
});
