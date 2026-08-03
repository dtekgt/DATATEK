// Datatek worker — host del proceso. DATATEK_R0_E sección 8.
//
// Reemplaza el placeholder inactivo de R0-B por un worker de outbox real
// (`src/outbox/`). Lo que este archivo hace es SOLO lo propio del proceso:
// construir el repositorio, correr ciclos, imprimir health y salir limpio.
// Toda la política (claim/lease, backoff, sanitización, estados terminales)
// vive en `src/outbox/worker.ts` y está probada con `node --test`.
//
// ## Por qué por defecto NO corre en bucle
//
// `pnpm dev` en la raíz es `pnpm -r --parallel --if-present run dev`. Si
// este proceso quedara en un bucle infinito por defecto, `pnpm dev` nunca
// terminaría de arrancar el workspace — exactamente lo que el placeholder
// de R0-B evitaba y que no se debe regresar. Por eso el modo por defecto es
// un DRENADO ACOTADO: corre ciclos hasta que no quede nada reclamable (o
// hasta `--max-cycles`), imprime el health y sale con código 0.
// `--loop` activa el bucle continuo para quien lo quiera explícitamente.
//
// ## Qué NO hace, por diseño
//
// No envía ningún mensaje real y no genera ningún PDF (sección 8: "ningún
// envío real; ningún PDF final"). Esa restricción es estructural, no una
// promesa: los handlers solo reciben sumideros de registro locales — ver la
// cabecera de `src/outbox/handlers.ts`.
//
// ## Estado honesto de la persistencia
//
// El repositorio es `InMemoryOutboxRepository`: este entorno no tiene
// Postgres alcanzable (sin Docker ni Supabase CLI). Por lo tanto este
// proceso NO drena la tabla `outbox_messages` real — arranca con el outbox
// vacío en cada ejecución y su health reporta ese outbox en memoria, no el
// de la base. El contrato `OutboxRepository` (`src/outbox/types.ts`)
// documenta el SQL exacto que la implementación Postgres ejecutará; ese es
// el único archivo que una fase con Docker necesita agregar.

import { InMemoryOutboxRepository } from "./outbox/memory-repository.ts";
import { OutboxWorker, type WorkerLogEntry } from "./outbox/worker.ts";

const WORKER_ID = `worker-${process.pid}`;
const DEFAULT_MAX_CYCLES = 50;
const LOOP_INTERVAL_MS = 5_000;

function emit(entry: WorkerLogEntry): void {
  // Log estructurado de una línea (sección 13). `environment` se toma de
  // WORKER_APP_ENV — el mismo nombre que declara `.env.example`.
  const line = JSON.stringify({
    ...entry,
    environment: process.env.WORKER_APP_ENV ?? "local",
    at: new Date().toISOString(),
  });
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  // `no-console` permite solo warn/error; `info` sale por stdout vía
  // process.stdout para no violar la regla de lint del monorepo.
  else process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const loop = args.has("--loop");

  const repository = new InMemoryOutboxRepository();
  const worker = new OutboxWorker({ repository, workerId: WORKER_ID, logger: emit });

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  let cycles = 0;
  for (;;) {
    if (stopping) break;
    const result = await worker.runCycle();
    cycles += 1;

    if (!loop) {
      // Drenado acotado: sin trabajo reclamable, o tope alcanzado.
      if (result.claimed === 0 || cycles >= DEFAULT_MAX_CYCLES) break;
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_MS));
  }

  const health = await worker.health();
  emit({
    level: "info",
    app: "worker",
    event: "worker.health",
    workerId: WORKER_ID,
    attempts: health.cyclesRun,
    result: "succeeded",
  });
  process.stdout.write(`${JSON.stringify({ health, persistence: "in_memory_only" })}\n`);
}

main().catch((error: unknown) => {
  // Nunca imprime el stack: misma regla que `last_error` (sección 9,
  // "errores sin stack/PII").
  console.error(
    JSON.stringify({
      level: "error",
      app: "worker",
      event: "worker.fatal",
      workerId: WORKER_ID,
      error: error instanceof Error ? error.message : "error no clasificado",
    }),
  );
  process.exitCode = 1;
});
