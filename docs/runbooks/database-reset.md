# Runbook — base de datos local (diferido en esta sesión)

## Estado actual

Esta sesión de R0-B cubre B1–B5 únicamente. **B6 (Supabase local) no se
implementó ni se ejecutó.** Este runbook documenta por adelantado el
procedimiento para cuando una sesión futura retome B6 en una máquina con
Docker Desktop.

Lo que sí existe hoy:

- `supabase/migrations/0000_foundation.sql` — extensiones (`pgcrypto`,
  `btree_gist`), un schema privado (`datatek_platform`) y un helper de
  `updated_at`. **Ninguna tabla de negocio.**
- `supabase/config.toml` — configuración local, sin credenciales, con auth y
  storage deshabilitados (R0-B no los usa).
- `pnpm test:db` — verificación **estática** (sin Docker) de que la
  migración 0000 no crea tablas de negocio, no contiene secretos y no
  referencia hosts productivos. Esta sí se ejecutó en esta sesión.

## Procedimiento futuro (requiere Docker Desktop)

```powershell
# 1. Instalar el Supabase CLI si hace falta (o usar npx a través del script)
pnpm db:start   # hoy: imprime un aviso honesto y termina; reemplazar
                # scripts/db-stub.mjs por una llamada real a `supabase start`
                # cuando esta fase se retome.

# 2. Aplicar migraciones desde cero
pnpm db:reset

# 3. Generar tipos TypeScript desde el esquema real
pnpm db:types

# 4. Correr pruebas de contrato (pgTAP + el chequeo estático existente)
pnpm test:db
```

## Qué cambia cuando B6 se implemente

1. `scripts/db-stub.mjs` se reemplaza por llamadas reales al Supabase CLI
   (`supabase start`, `supabase db reset`, `supabase gen types typescript`).
2. `packages/database/src/index.ts` deja de exponer solo
   `notImplementedPort` y empieza a implementar los `ReadPort<T>` reales
   contra el cliente de Supabase generado — sin ORM, según la ley del
   proyecto.
3. Cada tabla de negocio que se agregue debe llegar con RLS, grants, índices
   y pruebas en la misma ola (ley 27) — nunca "primero la tabla, después la
   seguridad".
4. `SUPABASE_URL` / `SUPABASE_ANON_KEY` se añaden a `.env.example` con
   valores locales (`http://127.0.0.1:54321`, clave anon de desarrollo) —
   nunca un host de producción. `SUPABASE_SERVICE_ROLE_KEY` nunca se declara
   en una variable `NEXT_PUBLIC_*` ni se importa desde código de cliente.

## Verificación de que "parte de cero"

Cuando B6 se implemente, la puerta de aceptación exige que `pnpm db:reset`
sea reproducible desde una base vacía. La forma de comprobarlo será documentar
en este runbook el resultado de correr `pnpm db:reset` dos veces seguidas y
confirmar que el segundo resultado es idéntico al primero.
