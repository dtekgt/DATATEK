import { MarketingPage } from "../../../components/marketing-page";

export default function HelpPage() {
  return (
    <MarketingPage
      title="Ayuda"
      intro="Este shell (R0-B) no envía mensajes reales ni abre tickets de soporte todavía. La sección completa de ayuda llega con R0-C/R1."
      sections={[
        {
          title: "¿Qué es DEMO DATA?",
          body: "Cualquier información marcada así es ficticia y nunca se persiste ni se envía.",
        },
        {
          title: "¿Cómo reporto un problema?",
          body: "Por ahora, contacta al equipo de producto directamente; no hay canal automatizado en R0-B.",
        },
      ]}
    />
  );
}
