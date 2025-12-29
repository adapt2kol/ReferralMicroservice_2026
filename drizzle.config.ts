import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

function getDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL_DIRECT;
  const poolerUrl = process.env.DATABASE_URL;

  if (directUrl && directUrl.trim() !== "") {
    return directUrl;
  }

  if (poolerUrl && poolerUrl.trim() !== "") {
    return poolerUrl;
  }

  throw new Error("Neither DATABASE_URL_DIRECT nor DATABASE_URL is set");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  verbose: true,
  strict: true,
});
