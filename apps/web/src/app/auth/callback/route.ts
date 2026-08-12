import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase-server";

// Intercambia el `code` que Supabase Auth agrega al enlace mágico por una
// sesión real (cookies httpOnly que `@supabase/ssr` ya sabe escribir vía
// `getSupabaseServerClient`). `next` viaja en la misma URL que
// `requestMagicLinkAction` (supabase-login-actions.ts) construyó, pero esta
// ruta es pública y GET — cualquiera puede pedirla directo con un `next`
// propio, así que se valida como allowlist de forma (nunca se confía en
// que "viene de nuestro correo").
function isSafeNextPath(next: string | null): next is string {
  return typeof next === "string" && /^\/pro\/o\/[a-z0-9-]+\/dashboard$/.test(next);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const redirectTarget = isSafeNextPath(next) ? next : "/";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTarget}`);
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
