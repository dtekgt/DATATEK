import { MarketingPage } from "../../../components/marketing-page";

export default function ForWorkshopsPage() {
  return (
    <MarketingPage
      eyebrow="Para talleres"
      title="Menos información perdida. Más trabajos fáciles de defender."
      intro="DTEK Servicios es el taller fundador de Datatek. La demostración actual enseña cómo un caso pasa del mensaje inicial a una cotización autorizada, sin fingir que ya está conectado a producción."
      sections={[
        {
          title: "El equipo sabe qué sigue",
          body: "Una sola acción principal por caso evita que los trabajos queden enterrados entre chats y notas.",
        },
        {
          title: "Cotizaciones claras",
          body: "El cliente decide sobre una versión exacta y el taller conserva evidencia de esa decisión.",
        },
      ]}
    />
  );
}
