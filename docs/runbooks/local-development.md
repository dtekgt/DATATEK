# Runbook — desarrollo local (Windows + VS Code)

## 1. Verificar herramientas

```powershell
node -v          # esperar 24.18.x
corepack -v
```

Si `node -v` no muestra 24.x, instala Node 24.18.0 (por ejemplo con
`nvm-windows`) antes de continuar.

## 2. Activar pnpm vía Corepack

```powershell
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm -v
```

## 3. Instalar dependencias

```powershell
cd "app"
pnpm install
```

La primera vez genera `pnpm-lock.yaml`. En máquinas siguientes, usa
`pnpm install --frozen-lockfile` para instalar exactamente lo que el
lockfile fija (falla si el lockfile y los `package.json` divergen — señal de
que alguien cambió una dependencia sin regenerar el lockfile).

## 4. Variables de entorno

```powershell
Copy-Item .env.example .env.local
```

Cada app (`apps/web`, `apps/control`) valida sus propias variables con Zod
en `src/lib/env.ts` al arrancar (`getWebEnv()` / `getControlEnv()`). Si falta
una variable o el valor es inseguro (por ejemplo, un host que no es
`localhost`), la app falla al iniciar con un mensaje explícito en vez de
arrancar en un estado indefinido.

## 5. Levantar todo en paralelo

```powershell
pnpm dev
```

Turborepo levanta `apps/web` (`:3000`), `apps/control` (`:3001`) y
`apps/worker` (imprime un mensaje y termina; no hay servidor persistente en
R0-B). `Ctrl+C` detiene los tres.

## 6. Verificación completa (lo que esta sesión ejecutó)

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm spec:check
pnpm test
pnpm build
```

Cada comando debe terminar en código de salida 0. Si `pnpm spec:check`
falla, corre `pnpm spec:generate` y revisa el diff — nunca edites a mano los
archivos en `packages/domain/generated/`.

## 7. Trabajar en un paquete específico

```powershell
pnpm --filter @datatek/ui test
pnpm --filter @datatek/domain test
pnpm --filter @datatek/web dev
```

## 8. Smoke HTTP manual

Con `pnpm dev` corriendo, en otra terminal:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/pro/o/dtek-servicios/dashboard
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/pass
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/market
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/a/demo-token
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3001/
```

Todas deben responder `200`.

## 9. Lo que esta sesión NO ejecutó (y por qué)

- **`pnpm test:e2e` / `pnpm e2e:install`** — Playwright está declarado como
  dependencia y los escenarios están escritos en `tests/e2e/`, pero esta
  sesión no tiene navegadores instalables ni los ejecutó. Corre
  `pnpm e2e:install` seguido de `pnpm test:e2e` en una máquina con acceso a
  descargar los binarios de Chromium.
- **`pnpm db:start` / `db:reset` / `db:types`** — Supabase local (B6) queda
  fuera de alcance de esta sesión. Los scripts existen (ver
  `scripts/db-stub.mjs`) e informan honestamente que están diferidos, sin
  fingir éxito. Ver `docs/runbooks/database-reset.md`.
