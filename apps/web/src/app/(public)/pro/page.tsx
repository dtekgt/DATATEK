import { MarketingPage } from "../../../components/marketing-page";

export default function ProMarketingPage() {
  return (
    <MarketingPage
      eyebrow="Para talleres"
      title="Datatek Pro"
      intro="La superficie B2B que opera el taller: casos verificables, cotizaciones congeladas, autorización exacta y una sola siguiente acción por caso, siempre con responsable y vencimiento visibles."
      sections={[
        {
          title: "Caso verificable",
          body: "Expediente operativo central; la cita administra tiempo, el caso administra la verdad.",
        },
        {
          title: "Cotización congelada",
          body: "Versión inmutable con snapshot y hash; cotizado no significa autorizado.",
        },
        {
          title: "Siguiente acción",
          body: "Una acción primaria única, con responsable o razón explícita y vencimiento.",
        },
        {
          title: "Multiempresa segura",
          body: "Toda entidad privada de taller lleva organization_id; RLS nace con cada tabla.",
        },
      ]}
    />
  );
}
