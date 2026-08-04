import { MarketingPage } from "../../../components/marketing-page";

export default function ProMarketingPage() {
  return (
    <MarketingPage
      eyebrow="Para talleres"
      title="Tu taller, ordenado alrededor de cada vehículo"
      intro="Datatek Pro reúne el caso, la agenda, la inspección, la evidencia y la autorización en un solo espacio. El equipo siempre sabe qué sigue y el cliente entiende qué está decidiendo."
      sections={[
        {
          title: "Caso verificable",
          body: "Fotos, hallazgos, cotizaciones y decisiones permanecen dentro del mismo expediente.",
        },
        {
          title: "Cotización congelada",
          body: "Cuando se envía al cliente, esa versión deja de cambiar. Cotizar no significa autorizar.",
        },
        {
          title: "Siguiente acción",
          body: "Cada caso destaca una sola tarea principal, su responsable y cuándo debe resolverse.",
        },
        {
          title: "Información separada",
          body: "Cada taller trabaja dentro de su propio espacio. La interfaz nunca sustituye los controles de acceso del servidor.",
        },
      ]}
    />
  );
}
