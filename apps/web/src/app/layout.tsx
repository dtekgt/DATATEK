import type { Metadata } from "next";
import "./globals.css";
import { getWebEnv } from "../lib/env";

// Fails fast on missing/insecure configuration (R0-B sección 11).
getWebEnv();

export const metadata: Metadata = {
  title: "Datatek — ecosistema de gestión de talleres automotrices",
  description:
    "Sitio, Pro, Pass y Market de Datatek. R0-B: shell ejecutable con datos de demostración.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
