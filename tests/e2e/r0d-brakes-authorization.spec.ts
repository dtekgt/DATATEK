import { test, expect, type Page } from "@playwright/test";
import {
  ORG_SLUG,
  OWNER_ACTOR_ID,
  buildReadyToQuoteCase,
  freezeQuoteForCase,
  postCommand,
  getEngineState,
} from "./helpers/dev-engine";

// R0-D Fase 5 — real E2E for the brakes -> quote -> authorization vertical,
// per DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección 17 ("E2E" +
// "Variantes": autorización parcial, rechazo, doble submit / token
// bloqueado). Setup (customer -> vehicle -> intake -> case -> agenda ->
// inspección -> quote -> freeze) runs against the real command engine via
// `/api/dev/commands` — the same temporary dev route
// `docs/runbooks/quote-authorization-journey.md` exercised with curl. Every
// scenario's actual assertions run against the REAL rendered UI: the Pro
// case workspace (`apps/web/src/app/(pro)/pro/o/[orgSlug]/cases/[caseId]/
// page.tsx`) and the real public `/a/[token]` page + `DecisionForm` — never
// fixture/demo screens.
//
// Login is a direct cookie set (`dtek_actor`), not the fixture login form —
// same cookie name/value `apps/web/src/components/fixture-login-form.tsx`'s
// Server Action sets; R0-C's fixture identity has no password to submit
// (see that file's own comment), so setting the cookie directly is
// equivalent to using the form for what these scenarios test, just without
// clicking through it every time.

// Business-logic scenarios, not a viewport/responsive check (that's
// `shells.spec.ts`'s job) — run once under `chromium` only. Each scenario's
// HTTP setup alone is ~60 sequential calls (36 inspection slots + 16
// measurements + case/agenda/quote plumbing), so it also gets a longer
// per-test timeout than the config's 30s default.
function chromiumOnly() {
  test.skip(test.info().project.name !== "chromium", "escenario de negocio, no de viewport");
  test.setTimeout(90_000);
}

async function loginAsOwner(page: Page) {
  await page.context().addCookies([
    {
      name: "dtek_actor",
      value: OWNER_ACTOR_ID,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function prepareAndSendFromProUI(page: Page, caseId: string): Promise<string> {
  await page.goto(`/pro/o/${ORG_SLUG}/cases/${caseId}`);
  await expect(page.getByText("Caso real — motor de comandos")).toBeVisible();
  await page.getByRole("button", { name: "Preparar y enviar solicitud (simulado)" }).click();
  await expect(page.getByText("Solicitud preparada y enviada (simulado)")).toBeVisible();
  const link = await page.locator("code").innerText();
  expect(link.startsWith("/a/")).toBe(true);
  return link.trim();
}

test.describe("R0-D — journey feliz (autorización total)", () => {
  test("crear caso -> inspección -> cotizar -> congelar -> preparar/enviar -> autorizar todo -> Pro y Pass coinciden", async ({
    page,
    request,
  }) => {
    chromiumOnly();
    const idPrefix = `happy-${test.info().testId}`;
    const built = await buildReadyToQuoteCase(request, idPrefix);
    const frozen = await freezeQuoteForCase(request, built.caseId, idPrefix);

    await loginAsOwner(page);

    // Pro: caso real, cotización congelada visible, preparar y enviar.
    const link = await prepareAndSendFromProUI(page, built.caseId);

    // Cliente: abre el enlace real (nunca la ruta demo /a/demo-token).
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Revisa la solicitud" })).toBeVisible();
    // `AuthorizationCard` solo renderiza un prefijo del hash
    // (`hash.slice(0, 10)…`, `packages/ui/src/domain/quote.tsx`) — nunca el
    // hash completo en pantalla.
    await expect(page.getByText(frozen.snapshotHash.slice(0, 10))).toBeVisible();

    await page.getByRole("button", { name: "Autorizar todo" }).click();
    await expect(page.getByText("Decisión registrada")).toBeVisible();

    // Pro refleja la misma decisión: el caso pasa a "Listo".
    await page.goto(`/pro/o/${ORG_SLUG}/cases/${built.caseId}`);
    await expect(page.getByText("Listo", { exact: true })).toBeVisible();

    // Pass lee el MISMO motor de comandos — misma verdad, sin necesitar
    // cuenta separada (R0 no tiene auth de Pass todavía, ver
    // apps/web/src/lib/pass-actor.ts).
    await page.goto(`/pass/cases/${built.caseId}`);
    await expect(page.getByText("Motor de comandos")).toBeVisible();
    await expect(page.getByText("Listo", { exact: true })).toBeVisible();
  });
});

test.describe("R0-D — autorización parcial", () => {
  test("cliente desmarca una línea -> acepta el resto -> caso queda Listo", async ({
    page,
    request,
  }) => {
    chromiumOnly();
    const idPrefix = `partial-${test.info().testId}`;
    const built = await buildReadyToQuoteCase(request, idPrefix);
    await freezeQuoteForCase(request, built.caseId, idPrefix);

    await loginAsOwner(page);
    const link = await prepareAndSendFromProUI(page, built.caseId);

    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Revisa la solicitud" })).toBeVisible();

    // Ambas líneas vienen pre-marcadas (`defaultChecked`) — desmarca la
    // primera para demostrar una decisión parcial real, no "aceptar todo"
    // con otro nombre de botón.
    const checkboxes = page.locator('input[name="acceptedQuoteItemIds"]');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.nth(0).uncheck();

    await page.getByRole("button", { name: "Autorizar seleccionadas" }).click();
    await expect(page.getByText("Decisión registrada")).toBeVisible();

    await page.goto(`/pro/o/${ORG_SLUG}/cases/${built.caseId}`);
    await expect(page.getByText("Listo", { exact: true })).toBeVisible();
  });
});

test.describe("R0-D — rechazo total", () => {
  test("cliente rechaza -> caso queda Cerrado", async ({ page, request }) => {
    chromiumOnly();
    const idPrefix = `reject-${test.info().testId}`;
    const built = await buildReadyToQuoteCase(request, idPrefix);
    await freezeQuoteForCase(request, built.caseId, idPrefix);

    await loginAsOwner(page);
    const link = await prepareAndSendFromProUI(page, built.caseId);

    await page.goto(link);
    await page
      .getByLabel("Motivo (solo si rechazas)")
      .fill("Prefiere cotizar en otro taller (E2E)");
    await page.getByRole("button", { name: "Rechazar" }).click();
    await expect(page.getByText("Decisión registrada")).toBeVisible();

    await page.goto(`/pro/o/${ORG_SLUG}/cases/${built.caseId}`);
    await expect(page.getByText("Cerrado", { exact: true })).toBeVisible();
  });
});

test.describe("R0-D — token bloqueado al 5º intento", () => {
  test("5 secretos incorrectos bloquean el token; el secreto correcto después también falla", async ({
    page,
    request,
  }) => {
    chromiumOnly();
    const idPrefix = `lockout-${test.info().testId}`;
    const built = await buildReadyToQuoteCase(request, idPrefix);
    await freezeQuoteForCase(request, built.caseId, idPrefix);

    await loginAsOwner(page);
    const link = await prepareAndSendFromProUI(page, built.caseId);

    const dot = link.lastIndexOf(".");
    const tokenId = link.slice("/a/".length, dot);

    // 5 navegaciones reales con secreto incorrecto — cada una ejecuta
    // `VerifyAuthorizationAccess` server-side durante el render de la
    // página, incrementando `attemptCount` en la fila real.
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await page.goto(`/a/${tokenId}.wrong-secret-attempt-${attempt}`);
      await expect(page.getByText("Este enlace no es válido")).toBeVisible();
    }

    // El secreto CORRECTO, presentado DESPUÉS del bloqueo, falla con el
    // MISMO mensaje neutral — el bloqueo es indistinguible de una
    // adivinanza incorrecta (sección 10.2).
    await page.goto(link);
    await expect(page.getByText("Este enlace no es válido")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Revisa la solicitud" })).toHaveCount(0);
  });
});

test.describe("R0-D — revocar y reenviar", () => {
  test("token viejo deja de servir; el token reenviado decide correctamente", async ({
    page,
    request,
  }) => {
    chromiumOnly();
    const idPrefix = `reissue-${test.info().testId}`;
    const built = await buildReadyToQuoteCase(request, idPrefix);
    const frozen = await freezeQuoteForCase(request, built.caseId, idPrefix);

    await loginAsOwner(page);
    const oldLink = await prepareAndSendFromProUI(page, built.caseId);

    // El enlace viejo funciona ANTES de revocar — confirma que lo que
    // rompe después es la revocación, no un enlace que nunca sirvió.
    await page.goto(oldLink);
    await expect(page.getByRole("heading", { name: "Revisa la solicitud" })).toBeVisible();

    // No existe todavía un botón "Reenviar" en la UI real de Pro — Fase 4a
    // entregó el comando `RevokeAndReprepareAuthorizationRequest` (con su
    // flag `authorization_reissue`) pero Fase 4b no lo conectó a ningún
    // control clicable (verificado: `apps/web/src` no referencia
    // `RevokeAndReprepareAuthorizationRequest` fuera del dev route). Se
    // invoca aquí vía el mismo motor de comandos real que la UI usaría —
    // documentado como deuda explícita para R0-E, no simulado como si
    // existiera un botón.
    const state = await getEngineState(request);
    const liveRequest = state.authorizationRequests.find(
      (r) => r.caseId === built.caseId && r.quoteVersionId === frozen.quoteVersionId,
    );
    expect(liveRequest).toBeTruthy();

    const reissued = await postCommand<{ plainToken: string }>(
      request,
      "RevokeAndReprepareAuthorizationRequest",
      { authorizationRequestId: liveRequest!.id, reason: "Token bloqueado — reenvío E2E" },
      { idempotencyKey: `${idPrefix}-reissue` },
    );
    const newLink = `/a/${reissued.data!.plainToken}`;

    // El token VIEJO ya no sirve — este es el punto central del escenario.
    await page.goto(oldLink);
    await expect(page.getByText("Este enlace no es válido")).toBeVisible();

    // El token NUEVO sí sirve y decide sobre la MISMA versión congelada.
    await page.goto(newLink);
    await expect(page.getByRole("heading", { name: "Revisa la solicitud" })).toBeVisible();
    await expect(page.getByText(frozen.snapshotHash.slice(0, 10))).toBeVisible();

    await page.getByRole("button", { name: "Autorizar todo" }).click();
    await expect(page.getByText("Decisión registrada")).toBeVisible();

    await page.goto(`/pro/o/${ORG_SLUG}/cases/${built.caseId}`);
    await expect(page.getByText("Listo", { exact: true })).toBeVisible();
  });
});
