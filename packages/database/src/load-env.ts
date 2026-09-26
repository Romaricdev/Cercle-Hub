import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadRootEnv(): void {
  const root = resolve(import.meta.dirname, "../../..");
  const envFile = resolve(root, ".env");
  config({ path: existsSync(envFile) ? envFile : resolve(root, ".env.example") });
}
