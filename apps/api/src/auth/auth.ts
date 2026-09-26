import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import type { PrismaClient } from "@cercle/database";

export function createAuth(
  prisma: PrismaClient,
  options: { allowSignUp: boolean; secret: string; baseURL: string; secureCookies: boolean; trustedOrigins?: string[] },
) {
  return betterAuth({
    appName: "Cercle Complet Sarl",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: options.trustedOrigins ?? [options.baseURL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      minPasswordLength: 15,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 12,
      freshAge: 60 * 30,
    },
    advanced: {
      useSecureCookies: options.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: options.secureCookies,
        path: "/",
      },
    },
    plugins: [
      twoFactor({
        issuer: "Cercle Complet Sarl",
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
