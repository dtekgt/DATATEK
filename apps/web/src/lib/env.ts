import { z } from "zod";

// Fails fast on missing/insecure configuration (R0-B sección 11). Only the
// variables apps/web actually reads are declared here; unrelated variables
// from .env.example are not validated by this app.
const envSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(["local"]),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .refine((url) => new URL(url).hostname === "localhost", {
      message: "NEXT_PUBLIC_SITE_URL debe apuntar a localhost en R0-B; no hay despliegue.",
    }),
});

export type WebEnv = z.infer<typeof envSchema>;

let cached: WebEnv | null = null;

export function getWebEnv(): WebEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  });
  if (!parsed.success) {
    throw new Error(
      `[apps/web] Configuración inválida (NEXT_PUBLIC_APP_ENV debe ser "local"; NEXT_PUBLIC_SITE_URL debe ser localhost): ${parsed.error.message}`,
    );
  }
  cached = parsed.data;
  return cached;
}
