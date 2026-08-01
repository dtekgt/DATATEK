import { MarketingPage } from "../../../../components/marketing-page";

export default function TermsPage() {
  return (
    <MarketingPage
      title="Términos"
      intro="Documento de referencia para R0-B. No autoriza cobro, facturación fiscal ni ejecución de trabajo; esta release es exclusivamente demostrativa."
      sections={[
        {
          title: "Alcance de R0",
          body: "Entregado no significa pagado. Cotizado no significa autorizado. Autorizado no significa ejecutado.",
        },
        {
          title: "Datos ficticios",
          body: "R0 utiliza datos ficticios y nunca escribe en DTEKPro o producción.",
        },
      ]}
    />
  );
}
