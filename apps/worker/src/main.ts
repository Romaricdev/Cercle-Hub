import { createServer } from "node:http";

import { applyPlatformEffect, claimOutboxBatch, markOutboxPublished } from "@cercle/domain";
import { createPrismaClient, loadRootEnv, type PrismaClient } from "@cercle/database";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

const envSchema = z.object({
  WORKER_PORT: z.coerce.number().int().positive().default(4312),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
});

loadRootEnv();
const env = envSchema.parse(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);
const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const workerConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue("platform.outbox", { connection: queueConnection });
const worker = new Worker(
  "platform.outbox",
  async (job) => {
    const eventId = z.object({ eventId: z.uuid() }).parse(job.data).eventId;
    await applyPlatformEffect(prisma, eventId);
    await prisma.outboxEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
  },
  { connection: workerConnection, concurrency: 2 },
);

const timer = setInterval(() => {
  void relay(prisma, queue);
}, 1000);
timer.unref();

const server = createServer(async (_request, response) => {
  try {
    const pong = await queueConnection.ping();
    const status = pong === "PONG" ? 200 : 503;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: status === 200 ? "ok" : "degraded", service: "worker" }));
  } catch {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "degraded", service: "worker" }));
  }
});
server.listen(env.WORKER_PORT, "127.0.0.1", () => {
  console.log(JSON.stringify({ service: "worker", status: "listening", port: env.WORKER_PORT }));
});

async function relay(client: PrismaClient, jobs: Queue): Promise<void> {
  const ids = await claimOutboxBatch(client);
  for (const eventId of ids) {
    await jobs.add(
      "platform.effect",
      { eventId },
      {
        jobId: eventId,
        attempts: 5,
        backoff: { type: "exponential", delay: 200 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    await markOutboxPublished(client, eventId);
  }
}

async function shutdown(): Promise<void> {
  clearInterval(timer);
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
  queueConnection.disconnect();
  workerConnection.disconnect();
  server.close();
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
