import "server-only";
import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  const database = (env as { DB?: D1Database }).DB;

  if (!database) {
    throw new Error("Cloudflare D1 binding DB is unavailable.");
  }

  return database;
}
