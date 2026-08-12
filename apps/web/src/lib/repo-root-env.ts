// Next.js solo carga `.env.local` desde la raíz de `apps/web`, no desde la
// raíz del monorepo — que es donde viven `SUPABASE_DB_URL`,
// `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (mismo
// archivo que ya leen `scripts/apply-migrations.mjs`/`run-pgtap.mjs`). Un
// solo cargador compartido para que `commands-engine.ts` y
// `supabase-server.ts` no dupliquen el mismo parser.
import { readFileSync } from "node:fs";
import path from "node:path";

export function loadRepoRootEnvLocal(): void {
  try {
    const repoRoot = path.resolve(process.cwd(), "..", "..");
    const raw = readFileSync(path.join(repoRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      const key = match?.[1];
      const value = match?.[2];
      if (!key || value === undefined) continue;
      if (!process.env[key]) process.env[key] = value.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local es opcional — sin él, cada llamador falla con un mensaje
    // claro propio cuando la variable que necesita sigue sin definirse.
  }
}
