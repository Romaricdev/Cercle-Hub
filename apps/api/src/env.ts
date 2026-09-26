import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_ORIGIN: z.url().default("http://127.0.0.1:8080"),
  WEB_ORIGIN: z.url().default("http://127.0.0.1:4310"),
  API_PORT: z.coerce.number().int().positive().default(4311),
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),
  COOKIE_SECURE: z.enum(["0", "1"]).default("0"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("cercle-private"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
});

export interface ApiEnv {
  nodeEnv: string;
  publicOrigin: string;
  webOrigin: string;
  port: number;
  trustProxy: boolean;
  secureCookies: boolean;
  databaseUrl: string;
  authSecret: string;
  redisUrl: string;
  trustedOrigins: string[];
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export function readApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = schema.parse(source);
  const localOrigins = ["http://127.0.0.1:8080", "http://127.0.0.1:4310", "http://127.0.0.1:4311"];
  const trustedOrigins = [...new Set([parsed.PUBLIC_ORIGIN, parsed.WEB_ORIGIN, ...(parsed.NODE_ENV === "production" ? [] : localOrigins)])];
  return {
    nodeEnv: parsed.NODE_ENV,
    publicOrigin: parsed.PUBLIC_ORIGIN,
    webOrigin: parsed.WEB_ORIGIN,
    port: parsed.API_PORT,
    trustProxy: parsed.TRUST_PROXY === "1",
    secureCookies: parsed.COOKIE_SECURE === "1",
    databaseUrl: parsed.DATABASE_URL,
    authSecret: parsed.BETTER_AUTH_SECRET,
    redisUrl: parsed.REDIS_URL,
    trustedOrigins,
    s3: {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      bucket: parsed.S3_BUCKET,
      accessKeyId: parsed.S3_ACCESS_KEY,
      secretAccessKey: parsed.S3_SECRET_KEY,
    },
  };
}
