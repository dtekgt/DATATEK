import { MarketingPage } from "../../../components/marketing-page";

export default function ForSuppliersPage() {
  return (
    <MarketingPage
      eyebrow="Para proveedores"
      title="Conecta con talleres a través de Datatek Market"
      intro="El flujo de proveedores de repuestos (oportunidades, ofertas, órdenes) queda planificado para una release posterior; aquí se explica el propósito por adelantado."
      sections={[
        {
          title: "Proveedor de repuestos",
          body: "Empresa o persona que suministra repuestos; 'proveedor' nunca nombra al taller.",
        },
        {
          title: "Descubrimiento separado",
          body: "Market puede originar solicitudes, pero no modifica el expediente operativo del taller.",
        },
      ]}
    />
  );
}
