import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button, Card } from "@datatek/ui";
import {
  CONTROL_SESSION_COOKIE_NAME,
  FIXTURE_PLATFORM_ACTOR_OPTIONS,
} from "../lib/fixture-session";

// R0-C fixture login for Control — a separate cookie from apps/web
// (sección 5.4: "usa aplicación y cookie separadas"). Same fixture-only
// caveat as apps/web/src/components/fixture-login-form.tsx: no password, no
// real Supabase Auth session in this sandbox.
async function loginAction(formData: FormData) {
  "use server";
  const actorId = String(formData.get("actorId") ?? "");
  const store = await cookies();
  store.set(CONTROL_SESSION_COOKIE_NAME, actorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/");
}

export function FixtureLoginForm() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Entrar a Datatek Control (fixture)</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-400)]">
          R0-C: sin Supabase Auth local disponible en este entorno, elige un actor de plataforma
          sembrado. Esta sesión nunca comparte cookie con el sitio público ni con Pro.
        </p>
      </div>
      <Card>
        <form action={loginAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Actor de plataforma</span>
            <select name="actorId" className="rounded border border-white/10 bg-transparent p-2">
              {FIXTURE_PLATFORM_ACTOR_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Entrar</Button>
        </form>
      </Card>
    </div>
  );
}
