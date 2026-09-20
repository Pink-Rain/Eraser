import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "The desktop database binding `DB` is unavailable. Start Eraser through its embedded desktop server before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
