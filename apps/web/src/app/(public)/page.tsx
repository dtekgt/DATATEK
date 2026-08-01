import { MarketingPage } from "../../components/marketing-page";
import { LinkButton, Badge } from "@datatek/ui";

export default function HomePage() {
  return (
    <MarketingPage
      eyebrow="Foundation Release R0-B"
      title="Datatek: el ecosistema que conecta talleres, conductores y proveedores"
      intro="Datatek une a Datatek Pro (para talleres), Datatek Pass (para conductores) y Datatek Market (para descubrir y conectar) sobre un núcleo compartido de datos verificables. DTEK Servicios es el taller fundador."
      sections={[
        {
          title: "Datatek Pro",
          body: "El taller opera casos verificables, cotizaciones congeladas y autorizaciones exactas.",
        },
        {
          title: "Datatek Pass",
          body: "El conductor revisa el estado actual de su vehículo, decide y conserva su historial.",
        },
        {
          title: "Datatek Market",
          body: "Descubrimiento separado de la operación: buscar, comparar y originar solicitudes.",
        },
        {
          title: "Datatek Control",
          body: "Gobierno interno de la red, en una aplicación separada y con sesión propia.",
        },
      ]}
    >
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton href="/pro">Conocer Pro</LinkButton>
        <LinkButton href="/pass" variant="secondary">
          Conocer Pass
        </LinkButton>
        <LinkButton href="/market" variant="secondary">
          Conocer Market
        </LinkButton>
        <Badge tone="neutral">Este shell usa datos de demostración rotulados</Badge>
      </div>
    </MarketingPage>
  );
}
