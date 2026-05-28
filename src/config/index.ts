import { z } from "zod";

const ConfigSchema = z.object({
  sapoApiKey: z.string().min(1),
  sapoApiSecret: z.string().min(1),
  sapoStoreUrl: z.string().url(),
  serverName: z.string().default("sapo-omni-mcp"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    sapoApiKey: process.env.SAPO_API_KEY,
    sapoApiSecret: process.env.SAPO_API_SECRET,
    sapoStoreUrl: process.env.SAPO_STORE_URL,
    serverName: process.env.MCP_SERVER_NAME,
    logLevel: process.env.LOG_LEVEL,
  });
}
