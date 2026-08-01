import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_CONTROL_APP_ENV: z.enum(["local"]),
  NEXT_PUBLIC_CONTROL_SITE_URL: z
    .string()
    .url()
    .refine((url) => new URL(url).hostname === "localhost", {
      message: "NEXT_PUBLIC_CONTROL_SITE_URL debe apuntar a localhost en R0-B.",
    }),
});

export type ControlEnv = z.infer<typeof envSchema>;

let cached: ControlEnv | null = null;

export function getControlEnv(): ControlEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_CONTROL_APP_ENV: process.env.NEXT_PUBLIC_CONTROL_APP_ENV ?? "local",
    NEXT_PUBLIC_CONTROL_SITE_URL:
      process.env.NEXT_PUBLIC_CONTROL_SITE_URL ?? "http://localhost:3001",
  });
  if (!parsed.success) {
    throw new Error(`[apps/control] Configuración inválida: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}
