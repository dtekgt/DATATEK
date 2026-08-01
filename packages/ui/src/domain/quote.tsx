import type { QuoteVersionStatus, AuthorizationStatus } from "@datatek/domain";
import { Badge, Card, Divider } from "../primitives/surfaces";
import { DateTimeText, MoneyText } from "../primitives/text";
import { PricingBasisBadge } from "./pass";
import type { PriceModality } from "@datatek/application";

export interface QuoteLine {
  id: string;
  label: string;
  modality: PriceModality;
  requiresAuthorization: boolean;
}

export interface QuoteVersionCardProps {
  versionLabel: string;
  status: QuoteVersionStatus;
  hash: string;
  frozenAt: string | null;
  lines: QuoteLine[];
  total: { amount: number; currency: string };
}

const quoteStatusTone: Record<QuoteVersionStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  frozen: "success",
  superseded: "warning",
  voided: "danger",
};

/** A cotización congelada references version, snapshot and hash (ley 8). The
 * hash renders under a technical disclosure, never as the primary label. */
export function QuoteVersionCard({
  versionLabel,
  status,
  hash,
  frozenAt,
  lines,
  total,
}: QuoteVersionCardProps) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold">{versionLabel}</p>
        <Badge tone={quoteStatusTone[status]}>{status}</Badge>
      </div>
      {frozenAt ? (
        <p className="mt-1 text-xs text-[var(--color-muted-400)]">
          Congelada el <DateTimeText value={frozenAt} mode="datetime" />
        </p>
      ) : null}
      <Divider className="my-3" />
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {line.label}
              {line.requiresAuthorization ? (
                <span className="ml-1 text-xs text-[var(--color-warning-400)]">
                  requiere autorización
                </span>
              ) : null}
            </span>
            <PricingBasisBadge modality={line.modality} />
          </li>
        ))}
      </ul>
      <Divider className="my-3" />
      <div className="flex items-center justify-between text-base font-semibold">
        <span>Total</span>
        <MoneyText amount={total.amount} currency={total.currency} />
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted-400)]">
        Hash de integridad: <code>{hash.slice(0, 10)}…</code>
      </p>
    </Card>
  );
}

export interface QuoteDiffProps {
  fromVersionLabel: string;
  toVersionLabel: string;
  added: string[];
  removed: string[];
  changed: string[];
}

export function QuoteDiff({
  fromVersionLabel,
  toVersionLabel,
  added,
  removed,
  changed,
}: QuoteDiffProps) {
  return (
    <div className="rounded-[var(--radius-control)] border border-white/10 p-4 text-sm">
      <p className="font-medium">
        {fromVersionLabel} → {toVersionLabel}
      </p>
      {added.length > 0 ? (
        <p className="mt-2 text-[var(--color-success-400)]">+ {added.join(", ")}</p>
      ) : null}
      {removed.length > 0 ? (
        <p className="mt-1 text-[var(--color-danger-400)]">− {removed.join(", ")}</p>
      ) : null}
      {changed.length > 0 ? (
        <p className="mt-1 text-[var(--color-warning-400)]">Δ {changed.join(", ")}</p>
      ) : null}
      {added.length + removed.length + changed.length === 0 ? (
        <p className="mt-1 text-[var(--color-muted-400)]">Sin diferencias.</p>
      ) : null}
    </div>
  );
}

export interface AuthorizationCardProps {
  requestStatus: string;
  lines: string[];
  versionLabel: string;
  hash: string;
  expiresAt: string | null;
}

/** Referencia exacta a versión, snapshot, hash y líneas (ley 8). No permite
 * decidir en R0-B; ese flujo llega en R0-D. */
export function AuthorizationCard({
  requestStatus,
  lines,
  versionLabel,
  hash,
  expiresAt,
}: AuthorizationCardProps) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted-400)]">
        Solicitud de autorización · {requestStatus}
      </p>
      <p className="mt-1 text-sm">
        Versión referenciada: <strong>{versionLabel}</strong>
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {expiresAt ? (
        <p className="mt-2 text-xs text-[var(--color-muted-400)]">
          Vence <DateTimeText value={expiresAt} mode="datetime" />
        </p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--color-muted-400)]">
        Hash: <code>{hash.slice(0, 10)}…</code>
      </p>
    </Card>
  );
}

export interface AuthorizationReceiptProps {
  status: AuthorizationStatus;
  decidedAt: string | null;
  decidedLines: string[];
}

export function AuthorizationReceipt({
  status,
  decidedAt,
  decidedLines,
}: AuthorizationReceiptProps) {
  return (
    <div className="rounded-[var(--radius-control)] border border-white/10 p-4 text-sm">
      <p className="font-medium">Constancia de decisión</p>
      <Badge
        tone={status === "accepted" ? "success" : status === "rejected" ? "danger" : "warning"}
        className="mt-1"
      >
        {status}
      </Badge>
      {decidedAt ? (
        <p className="mt-2 text-xs text-[var(--color-muted-400)]">
          Decidido <DateTimeText value={decidedAt} mode="datetime" />
        </p>
      ) : null}
      <ul className="mt-2 list-disc pl-5">
        {decidedLines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

export interface AuditEvent {
  id: string;
  label: string;
  actor: string;
  at: string;
}

/** Append-only rendering only (ley 23). No edit affordance exists here. */
export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-400)]">Sin eventos de auditoría todavía.</p>
    );
  }
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {events.map((e) => (
        <li
          key={e.id}
          className="flex items-center justify-between gap-2 rounded-[var(--radius-input)] border border-white/8 px-3 py-2"
        >
          <span>{e.label}</span>
          <span className="text-xs text-[var(--color-muted-400)]">
            {e.actor} · <DateTimeText value={e.at} mode="datetime" />
          </span>
        </li>
      ))}
    </ol>
  );
}
