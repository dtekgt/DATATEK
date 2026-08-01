// Datatek worker — inactive placeholder for R0-B.
//
// This process intentionally does nothing yet. R0-B does not define any
// background job, queue consumer, or scheduled task. `pnpm dev` in this
// package prints a status line and exits so `turbo run dev --parallel` does
// not hang the workspace waiting on a real worker loop.
//
// R1+ wires real queue/dispatcher logic here, behind adapters — never a
// direct Supabase Queues/pgmq dependency without justification (see R0-B
// sección 3, "Diferidos").

console.log("[worker] R0-B placeholder — no jobs registered. Inactive by design.");
