// Cliente Supabase Auth (GoTrue) del lado del servidor — Server Actions,
// Route Handlers y Server Components. Nunca se usa para leer/escribir
// tablas de negocio (eso sigue siendo `pg` directo, ver commands-engine.ts/
// packages/database): la clave publishable + RLS bastan para Auth porque
// GoTrue es su propio servicio, no PostgREST.
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { loadRepoRootEnvLocal } from "./repo-root-env";

function getSupabaseAuthConfig(): { url: string; publishableKey: string } {
  loadRepoRootEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "DATATEK_PERSISTENCE=postgres está activo pero NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no están definidas en .env.local.",
    );
  }
  return { url, publishableKey };
}

/** Un cliente por request — nunca se cachea en `globalThis` (a diferencia
 * del pool de `pg`): lee cookies de ESTE request, no puede compartirse
 * entre requests concurrentes de distintos actores. */
export async function getSupabaseServerClient() {
  const { url, publishableKey } = getSupabaseAuthConfig();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Un Server Component no puede escribir cookies (solo Server
          // Actions/Route Handlers pueden) — @supabase/ssr llama setAll de
          // todas formas para intentar refrescar el token; ignorarlo aquí
          // es el patrón documentado, no un descuido: el próximo Route
          // Handler/Server Action de este mismo flujo sí podrá escribirla.
        }
      },
    },
  });
}
