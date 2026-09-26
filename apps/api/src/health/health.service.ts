import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@cercle/database";
import { createStorageClient, storageServesPrivateObjects } from "@cercle/storage";
import { Redis } from "ioredis";

import type { ApiEnv } from "../env.js";
import { API_ENV, PRISMA } from "../tokens.js";

@Injectable()
export class HealthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async ready(): Promise<{ status: "ok" | "degraded"; checks: Record<string, "ok" | "down"> }> {
    const checks = {
      database: await this.database(),
      redis: await this.redis(),
      storage: await this.storage(),
    };
    const status = Object.values(checks).every((value) => value === "ok") ? "ok" : "degraded";
    return { status, checks };
  }

  private async database(): Promise<"ok" | "down"> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "down";
    }
  }

  private async redis(): Promise<"ok" | "down"> {
    const client = new Redis(this.env.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000, lazyConnect: true });
    try {
      await client.connect();
      const pong = await client.ping();
      return pong === "PONG" ? "ok" : "down";
    } catch {
      return "down";
    } finally {
      client.disconnect();
    }
  }

  private async storage(): Promise<"ok" | "down"> {
    const client = createStorageClient(this.env.s3);
    try {
      return (await storageServesPrivateObjects(client, this.env.s3.bucket)) ? "ok" : "down";
    } catch {
      return "down";
    } finally {
      client.destroy();
    }
  }
}
