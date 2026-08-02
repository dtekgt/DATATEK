import { createHash, timingSafeEqual } from "node:crypto";
import {
  AuthorizationCard,
  AuthorizationReceipt,
  Card,
  ErrorState,
  InlineAlert,
  Button,
} from "@datatek/ui";
import { FIXTURE_ORGANIZATIONS } from "@datatek/application";
import { isVisibleToAudience } from "@datatek/application/commands";
import type { AuthorizationStatus } from "@datatek/domain";
import { resolveLimitedAuthState } from "../../../lib/limited-auth";
import { getCommandsEngine } from "../../../lib/commands-engine";
import { buildGuestCommandContext } from "../../../lib/guest-authorization";
import { DecisionForm } from "./decision-form";

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(
      amountMinor / 100,
    );
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

/** Read-only secret check — same hash comparison `resolveToken`
 * (authorization-commands.ts) uses, duplicated narrowly here for exactly
 * one case that function cannot serve: viewing the receipt of a decision
 * that ALREADY happened. `resolveToken` treats `usedAt != null` as "dead"
 * (correct — a consumed token must never be able to decide AGAIN), but that
 * same check makes `VerifyAuthorizationAccess` reject a customer trying to
 * re-open their own link just to see what they already decided. This
 * function never mutates state and never increments an attempt counter —
 * it exists purely to gate "may this secret see the receipt", not "may this
 * secret decide" (that question always goes through the real
 * `VerifyAuthorizationAccess`/`RecordAuthorization` commands, attempt
 * counting and all — see the branch below that only reaches this function
 * for a request already in `status: "decided"`). */
function secretMatchesTokenHash(secret: string, tokenHash: string): boolean {
  const provided = createHash("sha256").update(secret, "utf8").digest("hex");
  const bufA = Buffer.from(provided, "hex");
  const bufB = Buffer.from(tokenHash, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

type RealView =
  | { kind: "invalid" }
  | {
      kind: "receipt";
      status: AuthorizationStatus;
      decidedAt: string | null;
      decidedLines: string[];
    }
  | {
      kind: "review";
      token: string;
      orgLabel: string;
      caseCode: string;
      versionLabel: string;
      hash: string;
      expiresAt: string;
      lines: string[];
      canDecide: boolean;
      quoteVersionId: string;
      quoteVersionHash: string;
      items: { id: string; label: string }[];
    };

/** Real resolution for any token NOT in the R0-B demo map — calls the real
 * `VerifyAuthorizationAccess` command (this IS the verification: R0-D never
 * implements a separate OTP step — `verificationMethod:
 * "manual_local_adapter"` on the token means the secure link itself is the
 * proof of access, sección 10.1). Any failure — expired, revoked, locked,
 * wrong secret, unknown id — collapses to the SAME "invalid" outcome on
 * purpose: `VerifyAuthorizationAccess` already returns one neutral
 * `TOKEN_INVALID` error for every one of those reasons
 * (`tokenInvalidError()`, docs/domain/authorization-security.md, sección
 * 10.2 "no se distingue públicamente"). A real token therefore never
 * reaches the separate "expired" screen — that screen stays reachable only
 * through the legacy `demo-token-expired` fixture id, which was always a
 * static placeholder, never backed by an actual expiry check. */
async function resolveRealAuthorizationView(token: string): Promise<RealView> {
  const engine = getCommandsEngine();
  const stateBeforeVerify = engine.getState();

  // Peek at the token's PUBLIC `id` component and the request it belongs to
  // — safe without checking the secret yet (documented as a non-secret
  // routing id, docs/domain/authorization-security.md). This only decides
  // WHICH path below runs; it never reveals anything to the caller by
  // itself.
  const dot = token.indexOf(".");
  const tokenId = dot > 0 ? token.slice(0, dot) : null;
  const secret = dot > 0 ? token.slice(dot + 1) : null;
  const tokenRow = tokenId
    ? stateBeforeVerify.authorizationAccessTokens.find((t) => t.id === tokenId)
    : undefined;
  const peekedRequest = tokenRow
    ? stateBeforeVerify.authorizationRequests.find((r) => r.id === tokenRow.authorizationRequestId)
    : undefined;

  if (peekedRequest?.status === "decided") {
    // Already decided — `VerifyAuthorizationAccess` would reject this token
    // (`usedAt` is set once consumed) even though the SAME secret is being
    // presented, so this path never calls it. See `secretMatchesTokenHash`'s
    // comment for why this is safe: no attempt counter needs to move for a
    // decision that already happened and cannot be changed by viewing it.
    if (!secret || !tokenRow || !secretMatchesTokenHash(secret, tokenRow.tokenHash)) {
      return { kind: "invalid" };
    }
    const authorization = stateBeforeVerify.authorizations.find(
      (a) => a.authorizationRequestId === peekedRequest.id,
    );
    const authItems = authorization
      ? stateBeforeVerify.authorizationItems.filter(
          (i) => i.authorizationId === authorization.id && i.decision === "accepted",
        )
      : [];
    return {
      kind: "receipt",
      status: authorization?.status ?? "rejected",
      decidedAt: authorization?.decidedAt ?? null,
      decidedLines: authItems.map(
        (i) =>
          `${i.descriptionSnapshot} — ${formatMoney(i.unitPriceMinorSnapshot * i.quantitySnapshot, i.currencySnapshot)}`,
      ),
    };
  }

  // Still live (or the token/request could not even be peeked) — always the
  // REAL command from here, full lockout/attempt-counting/expiry/scope
  // enforcement included, exactly as `docs/domain/authorization-security.md`
  // documents. A wrong secret here still increments that row's real
  // `attemptCount`.
  const ctx = buildGuestCommandContext(token);
  const verified = engine.verifyAuthorizationAccess(ctx, { token });
  if (!verified.ok) {
    return { kind: "invalid" };
  }

  const { authorizationRequestId, quoteVersionId, expiresAt, scope } = verified.data;
  const state = engine.getState();
  const request = state.authorizationRequests.find((r) => r.id === authorizationRequestId);
  const version = state.quoteVersions.find((v) => v.id === quoteVersionId);
  const kase = request ? state.cases.find((c) => c.id === request.caseId) : undefined;
  if (!request || !version || !kase) {
    return { kind: "invalid" };
  }

  const items = state.quoteItems
    .filter((i) => i.quoteVersionId === version.id && isVisibleToAudience(i.visibility, "guest"))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const org = FIXTURE_ORGANIZATIONS.find((o) => o.id === request.organizationId);

  return {
    kind: "review",
    token,
    orgLabel: org?.label ?? "El taller",
    caseCode: kase.folioCode,
    versionLabel: `Cotización v${version.versionNumber}`,
    hash: version.snapshotHash ?? "",
    expiresAt,
    lines: items.map((i) => `${i.description} — ${formatMoney(i.totalMinor, i.currency)}`),
    canDecide: scope === "read_and_decide",
    quoteVersionId: version.id,
    quoteVersionHash: version.snapshotHash ?? "",
    items: items.map((i) => ({
      id: i.id,
      label: `${i.description} — ${formatMoney(i.totalMinor, i.currency)}`,
    })),
  };
}

export default async function LimitedAuthorizationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const demoState = resolveLimitedAuthState(token);

  // Every token in the R0-B demo map keeps rendering exactly the fixture
  // screens it always did — untouched, so the full 8-state vocabulary
  // (context/verification/review/decision/confirmation/receipt/invalid/
  // expired) stays demonstrable even without a real token in hand.
  if (demoState !== "invalid") {
    if (demoState === "expired") {
      return (
        <ErrorState
          title="Este enlace expiró"
          description="No se registró ninguna decisión. Pide al taller que te envíe un enlace nuevo."
        />
      );
    }

    if (demoState === "context") {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">Tienes una solicitud de autorización</h1>
          <p className="text-sm text-[var(--color-muted-400)]">
            DTEK Servicios preparó una cotización para tu vehículo. No necesitas instalar una app.
            Este enlace permite revisar únicamente esta solicitud.
          </p>
          <Button disabled>Continuar (demo)</Button>
          <p className="text-xs text-[var(--color-muted-400)]">
            Este es un estado de ejemplo — un enlace real salta directo a la revisión, ya que el
            enlace seguro mismo es la verificación (sección 10.1).
          </p>
        </div>
      );
    }

    if (demoState === "verification") {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">Verifiquemos que eres tú</h1>
          <p className="text-sm text-[var(--color-muted-400)]">
            Este es un estado de ejemplo. R0-D no implementa un paso de código separado — el enlace
            seguro mismo es la verificación.
          </p>
          <InlineAlert
            tone="info"
            title="Sin cuenta requerida"
            description="Nunca se te pedirá crear una cuenta para revisar esta solicitud."
          />
        </div>
      );
    }

    if (demoState === "review") {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">Revisa la solicitud</h1>
          <AuthorizationCard
            requestStatus="viewed"
            versionLabel="Cotización v2"
            hash="a3f9c7e21b8d4f0012ab"
            lines={["Cambio de pastillas delanteras", "Revisión de disco delantero"]}
            expiresAt="2026-08-05T17:00:00-06:00"
          />
        </div>
      );
    }

    if (demoState === "decision") {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">Tu decisión</h1>
          <Card>
            <p className="text-sm text-[var(--color-muted-400)]">
              Este es un estado de ejemplo. Un enlace real muestra el formulario de decisión
              funcional directamente en la revisión.
            </p>
            <div className="mt-3 flex gap-2">
              <Button disabled>Autorizar (deshabilitado)</Button>
              <Button variant="secondary" disabled>
                Rechazar (deshabilitado)
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    if (demoState === "confirmation") {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">Confirmación</h1>
          <p className="text-sm text-[var(--color-muted-400)]">
            Este es un estado de ejemplo. Ninguna decisión real fue enviada — un enlace real muestra
            esta pantalla justo después de un envío exitoso.
          </p>
        </div>
      );
    }

    // receipt
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Constancia</h1>
        <p className="text-sm text-[var(--color-muted-400)]">
          Vista de ejemplo de la constancia de decisión. Un enlace real ya decidido muestra la
          constancia con datos reales.
        </p>
      </div>
    );
  }

  // Real token — DATATEK_R0_D Fase 4b.
  const view = await resolveRealAuthorizationView(token);

  if (view.kind === "invalid") {
    return (
      <ErrorState
        title="Este enlace no es válido"
        description="No se registró ninguna decisión. Pide al taller que te envíe un enlace nuevo."
      />
    );
  }

  if (view.kind === "receipt") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">Constancia</h1>
        <p className="text-sm text-[var(--color-muted-400)]">
          Ya se registró una decisión para esta solicitud.
        </p>
        <AuthorizationReceipt
          status={view.status}
          decidedAt={view.decidedAt}
          decidedLines={view.decidedLines}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Revisa la solicitud</h1>
      <p className="text-sm text-[var(--color-muted-400)]">
        {view.orgLabel} preparó una cotización para tu vehículo (caso {view.caseCode}). No necesitas
        instalar una app ni crear una cuenta.
      </p>
      <AuthorizationCard
        requestStatus="viewed"
        versionLabel={view.versionLabel}
        hash={view.hash}
        lines={view.lines}
        expiresAt={view.expiresAt}
      />
      {view.canDecide ? (
        <DecisionForm
          token={view.token}
          quoteVersionId={view.quoteVersionId}
          quoteVersionHash={view.quoteVersionHash}
          items={view.items}
        />
      ) : (
        <InlineAlert
          tone="info"
          title="Este enlace es solo de lectura"
          description="No permite registrar una decisión. Pide al taller un enlace con permiso para decidir."
        />
      )}
    </div>
  );
}
