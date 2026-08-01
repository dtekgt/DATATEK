import { MarketingPage } from "../../../components/marketing-page";

export default function ForWorkshopsPage() {
  return (
    <MarketingPage
      eyebrow="Para talleres"
      title="Lleva tu taller a Datatek Pro"
      intro="DTEK Servicios opera hoy como taller fundador. Este shell demuestra el flujo de casos, cotizaciones y autorización sin conectar todavía a producción."
      sections={[
        {
          title: "Sin fricción operativa",
          body: "El caso administra la verdad; la agenda solo administra tiempo.",
        },
        {
          title: "Cotizaciones defendibles",
          body: "Cada versión congelada referencia hash y snapshot exactos.",
        },
      ]}
    />
  );
}
