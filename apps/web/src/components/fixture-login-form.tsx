import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Button, Card } from "@datatek/ui";
import {
  SESSION_COOKIE_NAME,
  FIXTURE_ACTOR_OPTIONS,
  FIXTURE_ORGANIZATIONS,
} from "../lib/fixture-session";
import { buildSessionCookieOptions } from "../lib/session-cookie";

// R0-C fixture login for Pro, rendered inline wherever AccessBoundary
// resolves "unauthenticated" — never a dedicated page route, so the R0-A/B
// canonical route inventory (58 entries, checked by
// packages/domain/src/routes/route-registry.test.ts) does not grow for a
// mechanism R0-D removes once Supabase Auth is reachable.
//
// Supabase Auth local is written and seed-ready
// (docs/runbooks/local-auth-seeds.md) but unreachable in this sandbox (no
// Docker). This form sets ONLY an httpOnly identity cookie naming a seeded
// fixture actor — it never accepts a password and never claims to
// authenticate anything.
async function loginAction(formData: FormData) {
  "use server";
  // DATATEK_R0_E sección 9: "Server Actions revalidan como endpoints
  // públicos". Un Server Action es un POST invocable directamente — que
  // el <select> de abajo solo ofrezca valores válidos no impide que
  // alguien mande otros. Antes de esta fase ambos campos se escribían tal
  // cual, lo que permitía (a) sembrar la cookie de sesión con un string
  // arbitrario y (b) inyectar un `orgSlug` no validado dentro del destino
  // de `redirect()`. Aquí se validan contra la LISTA CERRADA de valores
  // sembrados — una allowlist, no un saneamiento.
  const requestedActorId = String(formData.get("actorId") ?? "");
  const requestedOrgSlug = String(formData.get("orgSlug") ?? "");

  const actor = FIXTURE_ACTOR_OPTIONS.find((a) => a.id === requestedActorId);
  const organization =
    FIXTURE_ORGANIZATIONS.find((o) => o.slug === requestedOrgSlug) ?? FIXTURE_ORGANIZATIONS[0];

  if (!actor) {
    // Error neutral: no confirma si el actor existe pero no es elegible, o
    // si simplemente no existe.
    redirect("/");
  }

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    actor.id,
    buildSessionCookieOptions(process.env.NODE_ENV === "production"),
  );
  // `organization.slug` viene del catálogo, nunca del formulario, así que
  // el destino del redirect no puede ser controlado por quien envía.
  redirect(`/pro/o/${organization.slug}/dashboard`);
}

export function FixtureLoginForm() {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Entrar a Datatek Pro (fixture)</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-400)]">
          R0-C: sin Supabase Auth local disponible en este entorno, elige un actor sembrado. Ningún
          dato de esta pantalla es una contraseña real.
        </p>
      </div>
      <Card>
        <form action={loginAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Actor</span>
            <select name="actorId" className="rounded border border-white/10 bg-transparent p-2">
              {FIXTURE_ACTOR_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Organización de entrada</span>
            <select name="orgSlug" className="rounded border border-white/10 bg-transparent p-2">
              {FIXTURE_ORGANIZATIONS.map((o) => (
                <option key={o.id} value={o.slug}>
                  {o.label}
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
