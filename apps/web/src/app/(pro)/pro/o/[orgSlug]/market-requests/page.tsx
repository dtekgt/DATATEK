import { Badge, DataTable, EmptyState, MoneyText, PageTitle, StatusPill } from "@datatek/ui";
import type { MarketOfferRow, MarketQuoteRequestRow } from "@datatek/application/commands";
import { getWebSession } from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";
import { OfferForm } from "./offer-form";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Esperando oferta",
  offered: "Oferta enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  submitted: "warning",
  offered: "info",
  accepted: "success",
  rejected: "danger",
};

interface MarketRequestRow {
  request: MarketQuoteRequestRow;
  offer: MarketOfferRow | null;
}

export default async function ProMarketRequestsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getWebSession(orgSlug, "quote.read");
  const canManage = session.permissions.includes("quote.manage");

  let rows: MarketRequestRow[] = [];

  if (session.accessState.kind === "allowed" && session.organizationId) {
    const state = getCommandsEngine().getState();
    const orgId = session.organizationId;
    rows = state.marketQuoteRequests
      .filter((r) => r.organizationId === orgId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((request) => ({
        request,
        offer: state.marketOffers.find((o) => o.requestId === request.id) ?? null,
      }));
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Badge tone="brand">PRO · MARKET</Badge>
        <PageTitle className="mt-3">Solicitudes de Market</PageTitle>
        <p className="mt-2 text-sm text-[var(--color-muted-400)]">
          Cotizaciones que un cliente pidió sin cuenta desde /market — responde con una oferta;
          el cliente la acepta o rechaza con su folio y teléfono.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin solicitudes todavía"
          description="Cuando un cliente pida cotización a este taller desde Market, aparecerá aquí."
        />
      ) : (
        <DataTable
          caption="Solicitudes"
          rowKey={(row) => row.request.id}
          rows={rows}
          columns={[
            {
              key: "folio",
              header: "Folio",
              render: (row) => <span className="font-mono text-xs">{row.request.folioCode}</span>,
            },
            { key: "customer", header: "Cliente", render: (row) => row.request.customerName },
            { key: "vehicle", header: "Vehículo", render: (row) => row.request.vehicleLabel },
            { key: "description", header: "Necesita", render: (row) => row.request.description },
            {
              key: "status",
              header: "Estado",
              render: (row) => (
                <StatusPill
                  label={STATUS_LABEL[row.request.status] ?? row.request.status}
                  tone={STATUS_TONE[row.request.status] ?? "neutral"}
                />
              ),
            },
            {
              key: "offer",
              header: "Oferta",
              render: (row) =>
                row.offer ? (
                  <MoneyText amount={row.offer.amountMinor / 100} currency={row.offer.currency} />
                ) : (
                  "—"
                ),
            },
            ...(canManage
              ? [
                  {
                    key: "actions",
                    header: "",
                    render: (row: MarketRequestRow) =>
                      row.request.status === "submitted" ? (
                        <OfferForm orgSlug={orgSlug} requestId={row.request.id} />
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
