import { MarketingPage } from "../../../components/marketing-page";
import { ArrowRight } from "lucide-react";
import { Badge, Card, LinkButton } from "@datatek/ui";

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
    >
      <Card accent="brand" className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Badge tone="brand">ACCESO PRIVADO DEL TALLER</Badge>
          <p className="mt-3 font-semibold">Pro sirve para hacer el trabajo.</p>
          <p className="mt-1 text-sm text-[var(--color-muted-400)]">
            El cliente no entra aquí. Su vista separada vive en Datatek Pass.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/pro/o/dtek-servicios/dashboard" variant="primary">
            Abrir demo de Pro <ArrowRight className="h-4 w-4" aria-hidden />
          </LinkButton>
          <LinkButton href="/pass" variant="ghost">
            Comparar con Pass
          </LinkButton>
        </div>
      </Card>
    </MarketingPage>
  );
}
