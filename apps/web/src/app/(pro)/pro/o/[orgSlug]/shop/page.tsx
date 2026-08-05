import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  PageTitle,
  PricingBasisBadge,
  StatusPill,
} from "@datatek/ui";
import type { PriceModality } from "@datatek/application";
import { getProductCatalogForOrg } from "@datatek/application/commands";
import {
  getWebSession,
  FIXTURE_ORGANIZATIONS,
  FIXTURE_BRANCHES,
} from "../../../../../../lib/fixture-session";
import { getCommandsEngine } from "../../../../../../lib/commands-engine";
import { NewProductForm } from "./new-product-form";

interface ServiceCardData {
  id: string;
  name: string;
  modality: PriceModality;
  note: string | null;
}

interface ProductCardData {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  unit: string;
  modality: PriceModality;
  quantityOnHand: number;
  inStock: boolean;
}

function buildServiceModality(item: {
  priceMode: string;
  fixedAmountMinor: number | null;
  fromAmountMinor: number | null;
  rangeMinAmountMinor: number | null;
  rangeMaxAmountMinor: number | null;
  currency: string;
}): PriceModality {
  switch (item.priceMode) {
    case "fixed":
      return {
        mode: "fixed",
        amount: { amount: (item.fixedAmountMinor ?? 0) / 100, currency: item.currency },
      };
    case "from":
      return {
        mode: "from",
        amountFrom: { amount: (item.fromAmountMinor ?? 0) / 100, currency: item.currency },
      };
    case "range":
      return {
        mode: "range",
        amountFrom: { amount: (item.rangeMinAmountMinor ?? 0) / 100, currency: item.currency },
        amountTo: { amount: (item.rangeMaxAmountMinor ?? 0) / 100, currency: item.currency },
      };
    default:
      return { mode: item.priceMode as "inspection_required" | "diagnosis_required" };
  }
}

export default async function ProShopPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const session = await getWebSession(orgSlug, "catalog.read");
  const org = FIXTURE_ORGANIZATIONS.find((o) => o.slug === orgSlug);
  const branches = org ? (FIXTURE_BRANCHES[org.id] ?? []) : [];

  let services: ServiceCardData[] = [];
  let products: ProductCardData[] = [];

  if (session.accessState.kind === "allowed" && session.organizationId) {
    const state = getCommandsEngine().getState();

    // Catálogo de servicios: neutral, sin organization_id (sección 6 de
    // 0040) — todo taller ve la misma lista base. No hay overrides por
    // organización implementados todavía, así que esto es lo que hoy
    // cualquier taller "vende" en servicios.
    services = state.serviceCatalogItems.map((item) => ({
      id: item.id,
      name: item.name,
      modality: buildServiceModality(item),
      note: item.note,
    }));

    // Catálogo de productos: SÍ es por organización (0094) — esto es lo
    // que hace que dos talleres tengan perfiles distintos, no la misma
    // vitrina repetida.
    const catalog = getProductCatalogForOrg(state, {
      organizationId: session.organizationId,
      audience: "pro",
      actorId: session.actorId ?? "unknown",
      now: new Date(),
    });
    products = catalog.products.map((p) => ({
      id: p.productId,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      unit: p.unit,
      modality: p.modality,
      quantityOnHand: p.quantityOnHand,
      inStock: p.inStock,
    }));
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Encabezado de perfil — nombre del taller, sucursales, distintivo de
          fundador. Deliberadamente parecido a un perfil de negocio: es la
          vitrina interna de lo que este taller vende, no un formulario. */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">PRO · PERFIL DEL TALLER</Badge>
          <Badge tone="warning">SESIÓN DEMO TEMPORAL</Badge>
        </div>
        <Card className="flex flex-wrap items-center gap-4">
          <Avatar name={org?.label ?? "Taller"} size={56} />
          <div className="flex flex-col gap-1">
            <PageTitle className="mb-0">{org?.label ?? "Taller"}</PageTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted-400)]">
              {org?.meta === "taller fundador" ? (
                <Badge tone="success">Taller fundador</Badge>
              ) : null}
              {branches.map((b) => (
                <StatusPill key={b.id} label={b.label} tone="neutral" />
              ))}
            </div>
          </div>
        </Card>
        <p className="max-w-2xl text-sm text-[var(--color-muted-400)]">
          Esto es lo que este taller ofrece: servicios y productos, cada uno con su modalidad de
          precio declarada — nunca un monto sin decir de qué tipo es (ley 37).
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-[var(--color-paper-50)]">Servicios</h2>
        {services.length === 0 ? (
          <EmptyState
            title="Sin sesión activa"
            description="Entra con un actor del taller para ver el catálogo de servicios."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <Card key={service.id} className="flex flex-col gap-3">
                <p className="font-medium text-[var(--color-paper-50)]">{service.name}</p>
                <PricingBasisBadge modality={service.modality} className="items-start" />
                {service.note ? (
                  <p className="text-xs text-[var(--color-muted-400)]">{service.note}</p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-paper-50)]">Productos</h2>
          {session.permissions.includes("parts.manage") ? (
            <NewProductForm orgSlug={orgSlug} />
          ) : null}
        </div>
        {products.length === 0 ? (
          <EmptyState
            title="Todavía no hay productos catalogados"
            description="Los repuestos y piezas que este taller vende aparecerán aquí."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <Card key={product.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--color-paper-50)]">{product.name}</p>
                    <p className="text-xs text-[var(--color-muted-400)]">
                      {[product.brand, product.sku].filter(Boolean).join(" · ") || "Sin marca/SKU"}
                    </p>
                  </div>
                  <StatusPill
                    label={
                      product.inStock ? `${product.quantityOnHand} ${product.unit}` : "Agotado"
                    }
                    tone={product.inStock ? "success" : "danger"}
                  />
                </div>
                <PricingBasisBadge modality={product.modality} className="items-start" />
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
