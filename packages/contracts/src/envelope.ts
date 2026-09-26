import { z } from "zod";

import { canonicalJson, sha256Hex } from "./canonical.js";
import { ContractError } from "./money.js";

export const PROTOCOL_VERSION = 1 as const;

export const commandEnvelopeSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    operationId: z.uuid(),
    deviceId: z.uuid(),
    shopId: z.uuid(),
    sessionId: z.uuid().nullable(),
    seq: z.string().regex(/^(?:0|[1-9]\d*)$/),
    commandType: z.string().min(1).max(80),
    occurredAt: z.iso.datetime({ offset: true }),
    executionMode: z.enum(["ONLINE", "OFFLINE_REPLAY"]),
    onlineAuthorizationId: z.uuid().nullable(),
    capabilityId: z.uuid().nullable(),
    payload: z.record(z.string(), z.unknown()),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    signature: z.string().min(1).max(4096),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.executionMode === "ONLINE" && (value.onlineAuthorizationId === null || value.capabilityId !== null)) {
      context.addIssue({ code: "custom", message: "ONLINE exige une autorisation et aucune capacité." });
    }
    if (value.executionMode === "OFFLINE_REPLAY" && (value.capabilityId === null || value.onlineAuthorizationId !== null)) {
      context.addIssue({ code: "custom", message: "OFFLINE_REPLAY exige une capacité et aucune autorisation en ligne." });
    }
  });

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;

export function envelopeBody(envelope: Omit<CommandEnvelope, "hash" | "signature">): Omit<CommandEnvelope, "hash" | "signature"> {
  return envelope;
}

export async function hashEnvelope(envelope: Omit<CommandEnvelope, "hash" | "signature">): Promise<string> {
  return sha256Hex(canonicalJson(envelope));
}

export async function parseCommandEnvelope(input: unknown): Promise<CommandEnvelope> {
  const parsed = commandEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ContractError("INVALID_ENVELOPE", "L’enveloppe de commande est invalide.");
  }
  const { hash, signature, ...body } = parsed.data;
  const expected = await hashEnvelope(body);
  if (expected !== hash) {
    throw new ContractError("HASH_MISMATCH", "Le hash de l’enveloppe ne correspond pas au contenu.");
  }
  return { ...body, hash, signature };
}

export const apiErrorSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    error: z
      .object({
        code: z.string().min(1).max(80),
        message: z.string().min(1).max(300),
      })
      .strict(),
  })
  .strict();

export function apiError(code: string, message: string): z.infer<typeof apiErrorSchema> {
  return { protocolVersion: PROTOCOL_VERSION, error: { code, message } };
}

export const foundationOpenApi = {
  openapi: "3.1.0",
  info: {
    title: "Cercle Complet — socle",
    version: "0.1.0",
  },
  paths: {
    "/api/v1/health/live": { get: { operationId: "healthLive" } },
    "/api/v1/health/ready": { get: { operationId: "healthReady" } },
    "/api/v1/session": { get: { operationId: "currentSession" } },
  },
} as const;
