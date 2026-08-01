import { MarketingPage } from "../../../components/marketing-page";

export default function SecurityPage() {
  return (
    <MarketingPage
      eyebrow="Seguridad"
      title="Aislamiento y control de acceso"
      intro="Cada organización está aislada. Los permisos nacen de membresías y capacidades efectivas, nunca de metadata editable. Service Role nunca llega al navegador."
      sections={[
        {
          title: "Roles separados",
          body: "Los roles de plataforma están separados de los roles de organización.",
        },
        {
          title: "Sesión elevada auditada",
          body: "Soporte necesita una sesión elevada vigente y auditada para leer datos de un tenant.",
        },
        {
          title: "Auditoría append-only",
          body: "Toda mutación sensible produce evento y auditoría en la misma transacción.",
        },
      ]}
    />
  );
}
