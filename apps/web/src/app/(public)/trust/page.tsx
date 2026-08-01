import { MarketingPage } from "../../../components/marketing-page";

export default function TrustPage() {
  return (
    <MarketingPage
      eyebrow="Confianza"
      title="Cómo Datatek trata tus datos"
      intro="Datatek no inventa hallazgos ni salud del vehículo sin evidencia. Todo estado visible declara qué se sabe, de cuándo es y de dónde proviene."
      sections={[
        {
          title: "Procedencia explícita",
          body: "Observado, medido, reportado, estimado y derivado son procedencias distintas y siempre visibles.",
        },
        {
          title: "El pasado no se borra",
          body: "Se corrige mediante nueva versión o evento compensatorio, nunca por edición silenciosa.",
        },
        {
          title: "Sin promesas no demostradas",
          body: "Este sitio no publica cifras de disponibilidad o confianza que no pueda sostener con evidencia.",
        },
      ]}
    />
  );
}
