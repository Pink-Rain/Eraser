import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// L'enveloppe Drizzle est construite une fois par base (une centaine d'appels par page la
// reconstruisaient, schéma relu à chaque fois) ; une autre base (tests) en reçoit une neuve.
let cached: { binding: unknown; db: ReturnType<typeof drizzle<typeof schema>> } | null = null;

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "The desktop database binding `DB` is unavailable. Start Eraser through its embedded desktop server before using the database."
    );
  }

  if (cached && cached.binding === env.DB) return cached.db;
  const db = drizzle(env.DB, { schema });
  cached = { binding: env.DB, db };
  return db;
}
