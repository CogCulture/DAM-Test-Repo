import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../database/schema";

let pgClient: ReturnType<typeof postgres> | undefined;
let pgDrizzle: ReturnType<typeof drizzle<typeof schema>> | undefined;
let activeDatabaseUrl: string | undefined;

export const usePostgresDrizzle = (databaseUrl: string) => {
  if (pgDrizzle && activeDatabaseUrl === databaseUrl) {
    return pgDrizzle;
  }
  if (pgClient) {
    try {
      pgClient.end().catch(() => {});
    } catch {}
  }

  pgClient = postgres(databaseUrl, {
    ssl: "require",
    prepare: false, // Essential for Supabase transaction poolers
    max: 10,
    idle_timeout: 20, // Closes idle sockets after 20s to avoid stale pooler connections
    connect_timeout: 10, // 10s connection timeout
    max_lifetime: 60 * 30, // Recycle connection after 30 minutes
  });

  activeDatabaseUrl = databaseUrl;
  pgDrizzle = drizzle(pgClient, { schema });
  return pgDrizzle;
};
