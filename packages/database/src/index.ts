import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export function assertTestDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, "");
  const host = url.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Les tests refusent une base qui n’est pas locale.");
  }
  if (!name.endsWith("_test")) {
    throw new Error("Les tests refusent une base dont le nom ne se termine pas par _test.");
  }
  return name;
}

export { loadRootEnv } from "./load-env.js";
export { PrismaClient };
export type { Prisma } from "./generated/prisma/client.js";
