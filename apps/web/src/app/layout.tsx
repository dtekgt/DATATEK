import type { Metadata } from "next";
import "./globals.css";
import { getWebEnv } from "../lib/env";

// Fails fast on missing/insecure configuration (R0-B sección 11).
getWebEnv();

export const metadata: Metadata = {
  title: "Datatek — claridad y control para talleres automotrices",
  description:
    "Datatek conecta la operación del taller con una experiencia clara para el conductor: casos, evidencia, cotizaciones y autorizaciones verificables.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
