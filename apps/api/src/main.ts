import { loadRootEnv } from "@cercle/database";

import { createApp } from "./create-app.js";
import { readApiEnv } from "./env.js";

loadRootEnv();
const { app } = await createApp();
const env = readApiEnv();
await app.listen({ host: "127.0.0.1", port: env.port });
console.log(JSON.stringify({ service: "api", status: "listening", port: env.port }));
