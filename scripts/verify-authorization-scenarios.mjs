#!/usr/bin/env node
// Escenarios de autorización verificados contra el servidor CORRIENDO.
//
// Alcance honesto de lo que esto prueba y lo que no:
//
//   SÍ prueba — el comportamiento de la capa de aplicación end-to-end sobre
//   HTTP real: verificación de token, alteración de secreto, alteración de
//   hash, doble submit, revocación, y no-enumeración entre organizaciones.
//
//   NO prueba — RLS de Postgres. En esta máquina el motor de comandos es
//   in-memory (no hay Docker ni Supabase CLI), así que el aislamiento que se
//   observa aquí es el de la capa de aplicación. El aislamiento a nivel de
//   base de datos sigue siendo `implemented_pending_environment_evidence`
//   hasta que corran los pgTAP de `supabase/tests/`.
//
// Existe porque `pnpm test:e2e` no puede correr en esta máquina (la política
// de Application Control de Windows bloquea el Chromium de Playwright), y un
// escenario que no se puede ejecutar no se puede declarar verificado.
//
//   pnpm verify:authz            (usa http://localhost:3000)
//   DATATEK_BASE_URL=http://localhost:4177 pnpm verify:authz

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.DATATEK_BASE_URL ?? "http://localhost:3000";
const ENDPOINT = `${BASE_URL}/api/dev/commands`;

let seq = 0;
async function cmd(command, input, opts = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      command,
      orgSlug: opts.orgSlug ?? "dtek-servicios",
      actorId: opts.actorId ?? "u-owner-dtek",
      idempotencyKey: opts.idempotencyKey ?? `scen-${Date.now()}-${++seq}`,
      input,
    }),
  });
  return { status: res.status, body: await res.json() };
}

function seed() {
  const out = execFileSync(process.execPath, [join(ROOT, "scripts", "seed-demo-journey.mjs")], {
    env: { ...process.env, DATATEK_BASE_URL: BASE_URL },
    encoding: "utf8",
  });
  return JSON.parse(out);
}

const results = [];
function check(nombre, esperado, real, ok) {
  results.push({ nombre, esperado, real, ok });
  console.log(`${ok ? "  ok  " : " FALLA"} · ${nombre}`);
  if (!ok) console.log(`         esperaba: ${esperado}\n         obtuvo:   ${real}`);
}

const errCode = (r) =>
  r.body.ok ? `ok (HTTP ${r.status})` : `${r.body.error?.code} (HTTP ${r.status})`;
const rechazado = (r) => !r.body.ok;

async function main() {
  console.log(`servidor: ${BASE_URL}\n`);

  // =========================================================================
  const a = seed();
  console.log(`caso A sembrado: ${a.folioCode}\n`);

  let r = await cmd("VerifyAuthorizationAccess", { token: a.plainToken });
  check(
    "token válido verifica y devuelve el caso",
    "ok",
    errCode(r),
    r.body.ok && r.body.data?.caseId === a.caseId,
  );

  // El secreto es la mitad después del punto. Cambiarlo sin cambiar el id es
  // exactamente el ataque que el hash almacenado debe frenar.
  const [tokenId, secreto] = a.plainToken.split(".");
  const secretoAlterado = secreto.slice(0, -4) + (secreto.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
  r = await cmd("VerifyAuthorizationAccess", { token: `${tokenId}.${secretoAlterado}` });
  check("secreto alterado con id válido es rechazado", "rechazo", errCode(r), rechazado(r));

  r = await cmd("VerifyAuthorizationAccess", {
    token: "00000000-0000-4000-8000-000000000000.noExisteEsteSecretoEnAbsolutoNiDeCasualidad",
  });
  check("token inexistente es rechazado", "rechazo", errCode(r), rechazado(r));

  // El mensaje no debe distinguir "no existe" de "no es tuyo": esa diferencia
  // es un oráculo de enumeración.
  const msgInexistente = String(r.body.error?.message ?? "");
  r = await cmd("VerifyAuthorizationAccess", { token: `${tokenId}.${secretoAlterado}` });
  check(
    "no enumera: id inexistente y secreto malo dan el mismo error",
    "mismo código",
    `${r.body.error?.code} vs anterior`,
    !!msgInexistente &&
      r.body.error?.code ===
        (
          await cmd("VerifyAuthorizationAccess", {
            token: "11111111-1111-4111-8111-111111111111.x",
          })
        ).body.error?.code,
  );

  r = await cmd("RecordAuthorization", {
    method: "secure_link",
    token: a.plainToken,
    quoteVersionId: a.quoteVersionId,
    quoteVersionHash: "0".repeat(64),
    decision: "accept_all",
  });
  check("hash alterado en la decisión es rechazado", "rechazo", errCode(r), rechazado(r));

  r = await cmd("RecordAuthorization", {
    method: "secure_link",
    token: a.plainToken,
    quoteVersionId: a.quoteVersionId,
    quoteVersionHash: a.snapshotHash,
    decision: "reject",
    rejectionReason: "Muy caro por ahora",
  });
  check("rechazo total se registra", "ok", errCode(r), r.body.ok);

  r = await cmd("RecordAuthorization", {
    method: "secure_link",
    token: a.plainToken,
    quoteVersionId: a.quoteVersionId,
    quoteVersionHash: a.snapshotHash,
    decision: "accept_all",
  });
  check("doble submit sobre el mismo request es rechazado", "rechazo", errCode(r), rechazado(r));

  r = await cmd("VerifyAuthorizationAccess", { token: a.plainToken });
  check("replay del token tras decidir es rechazado", "rechazo", errCode(r), rechazado(r));

  // =========================================================================
  const b = seed();
  console.log(`\ncaso B sembrado: ${b.folioCode}\n`);

  const unItem = b.quoteItemIds.filter(Boolean)[0];
  r = await cmd("RecordAuthorization", {
    method: "secure_link",
    token: b.plainToken,
    quoteVersionId: b.quoteVersionId,
    quoteVersionHash: b.snapshotHash,
    decision: "partial",
    acceptedQuoteItemIds: unItem ? [unItem] : [],
  });
  // `items` trae una fila POR LÍNEA de la cotización, cada una marcada
  // `accepted` o `rejected`: la decisión sobre lo rechazado también es un
  // hecho que hay que guardar. Lo que se verifica es el desglose, no el
  // largo del arreglo.
  const aceptadas = (r.body.data?.items ?? []).filter((i) => i.decision === "accepted");
  const rechazadas = (r.body.data?.items ?? []).filter((i) => i.decision === "rejected");
  check(
    "autorización parcial acepta 1 línea, rechaza 1 y queda partially_accepted",
    "1 aceptada / 1 rechazada / partially_accepted",
    r.body.ok
      ? `${aceptadas.length} aceptada(s) / ${rechazadas.length} rechazada(s) / ${r.body.data?.authorization?.status}`
      : errCode(r),
    r.body.ok &&
      aceptadas.length === 1 &&
      rechazadas.length === 1 &&
      aceptadas[0].quoteItemId === unItem &&
      r.body.data?.authorization?.status === "partially_accepted",
  );

  // =========================================================================
  const c = seed();
  console.log(`\ncaso C sembrado: ${c.folioCode}\n`);

  const reissue = await cmd("RevokeAndReprepareAuthorizationRequest", {
    authorizationRequestId: c.authorizationRequestId,
    reason: "Verificación de escenarios R0-E",
  });
  check(
    "reemisión revoca la solicitud v1",
    "ok + v1 revoked",
    errCode(reissue),
    reissue.body.ok && reissue.body.data?.revokedRequest?.status === "revoked",
  );

  r = await cmd("VerifyAuthorizationAccess", { token: c.plainToken });
  check("token v1 deja de servir tras la reemisión", "rechazo", errCode(r), rechazado(r));

  const nuevoToken = reissue.body.data?.plainToken;
  r = await cmd("VerifyAuthorizationAccess", { token: nuevoToken });
  check("token v2 sirve", "ok", errCode(r), r.body.ok);

  // =========================================================================
  console.log("");
  // El token ES la autoridad: quien lo tiene es el cliente destinatario, y el
  // contexto de organización que declare el llamador no debe cambiar a qué
  // caso resuelve. Si lo cambiara, un taller podría redirigir el enlace de
  // otro hacia un caso propio.
  const desdeDtek = await cmd("VerifyAuthorizationAccess", { token: nuevoToken });
  const desdeDemo = await cmd(
    "VerifyAuthorizationAccess",
    { token: nuevoToken },
    { orgSlug: "taller-demo", actorId: "u-owner-demo" },
  );
  check(
    "el token resuelve al mismo caso sin importar la organización que declare el llamador",
    `mismo caseId (${c.caseId.slice(0, 8)}…)`,
    `dtek=${desdeDtek.body.data?.caseId?.slice(0, 8)}… demo=${desdeDemo.body.data?.caseId?.slice(0, 8)}…`,
    desdeDtek.body.ok &&
      desdeDemo.body.ok &&
      desdeDtek.body.data.caseId === c.caseId &&
      desdeDemo.body.data.caseId === c.caseId,
  );

  const otraOrg = await cmd(
    "TransitionCase",
    { caseId: c.caseId, toStatus: "triage" },
    { orgSlug: "taller-demo", actorId: "u-owner-demo" },
  );
  check(
    "Taller Demo no puede tocar un caso de DTEK",
    "rechazo",
    errCode(otraOrg),
    rechazado(otraOrg),
  );

  const soporte = await cmd(
    "TransitionCase",
    { caseId: c.caseId, toStatus: "triage" },
    { actorId: "u-platform-support" },
  );
  check(
    "soporte sin elevación no puede escribir en un caso",
    "rechazo",
    errCode(soporte),
    rechazado(soporte),
  );

  // =========================================================================
  const fallas = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fallas.length}/${results.length} escenarios pasan`);
  if (fallas.length) {
    console.error("\nESCENARIOS DE AUTORIZACIÓN: FALLA");
    process.exit(1);
  }
  console.log("ESCENARIOS DE AUTORIZACIÓN: OK");
}

main().catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});
