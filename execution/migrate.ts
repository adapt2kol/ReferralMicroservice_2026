import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

function getDatabaseUrl(): string {
  const directUrl = process.env.DATABASE_URL_DIRECT;
  const poolerUrl = process.env.DATABASE_URL;

  if (directUrl && directUrl.trim() !== "") {
    console.log("Using DATABASE_URL_DIRECT (direct connection)");
    return directUrl;
  }

  if (poolerUrl && poolerUrl.trim() !== "") {
    console.log("Using DATABASE_URL (transaction pooler)");
    return poolerUrl;
  }

  console.error("ERROR: Neither DATABASE_URL_DIRECT nor DATABASE_URL is set");
  process.exit(1);
}

async function runMigrations(): Promise<void> {
  const databaseUrl = getDatabaseUrl();

  console.log("Starting database migrations...");

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
