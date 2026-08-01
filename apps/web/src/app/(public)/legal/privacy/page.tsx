import { MarketingPage } from "../../../../components/marketing-page";

export default function PrivacyPage() {
  return (
    <MarketingPage
      title="Aviso de privacidad"
      intro="Documento de referencia para R0-B. No sustituye el aviso legal final. Datatek no importa clientes reales ni se conecta a producción en esta release."
      sections={[
        {
          title: "Clasificación de datos",
          body: "Identidad global mínima, privado de organización, compartido de caso, pasaporte del vehículo, público proyectado, plataforma restringida y analítico derivado.",
        },
        {
          title: "Costos y notas internas",
          body: "Costos, margen, proveedores y notas internas nunca llegan a Pass ni al PDF del cliente.",
        },
      ]}
    />
  );
}
