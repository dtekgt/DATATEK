#!/usr/bin/env node
// R0-B scope is B1–B5 (toolchain, domain spec, sistema visual, route
// registry, AppShells). Supabase local (B6) is explicitly deferred to a
// future session. These scripts exist because R0-B sección 10 lists them as
// "scripts obligatorios" for the full R0-B contract — they resolve
// immediately with an honest, non-destructive message instead of failing the
// workspace or attempting a Docker/Supabase CLI call that isn't in scope.
const command = process.argv[2] ?? "start";

const messages = {
  start:
    "db:start — Supabase local queda diferido a una sesión futura (B6). No se inició ningún contenedor.",
  stop: "db:stop — no hay proceso de Supabase local que detener en R0-B.",
  reset:
    "db:reset — la migración 0000 vive en supabase/migrations/ pero no se aplica en R0-B sin Docker Desktop.",
  types: "db:types — no hay tipos generados desde una base real en R0-B.",
};

console.log(`[db-stub] ${messages[command] ?? messages.start}`);
console.log(
  "[db-stub] Ver docs/runbooks/database-reset.md para el procedimiento en una máquina con Docker Desktop.",
);
process.exit(0);
