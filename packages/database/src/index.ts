// @datatek/database — placeholder ports only. No ORM, no live connection, no
// business tables in R0-B. This package exists so `apps/*` never import
// `@supabase/supabase-js` directly; R0-C/R0-D implement these ports against
// real Postgres/Supabase without changing call sites.

/** Generic read port: given an id, return T or null. Implemented against
 * fixtures in R0-B via @datatek/application adapters, never here. */
export interface ReadPort<T> {
  findById(id: string): Promise<T | null>;
}

/** Marker for a port that has no real implementation yet. Calling it throws
 * loudly instead of returning fabricated data. */
export function notImplementedPort(name: string): never {
  throw new Error(
    `[@datatek/database] Port "${name}" has no implementation in R0-B. ` +
      "Supabase local and business tables ship in R0-C/R0-D.",
  );
}

export const DATABASE_PORTS_STATUS = "placeholder" as const;
