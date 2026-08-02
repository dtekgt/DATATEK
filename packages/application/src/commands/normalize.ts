// Normalization helpers shared by the CRM and vehicle commands.
// DATATEK_R0_D sección 5, step 1 of `RegisterVehicle`: "normaliza
// identificadores" — before any private search happens, so two spellings
// of the same VIN/plate always collide on the same row instead of quietly
// creating duplicates.
import { validationError, type CommandError } from "./context.ts";

export function normalizeVin(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function normalizePlate(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function validateVin(raw: string): CommandError | null {
  const normalized = normalizeVin(raw);
  // Real VINs are 17 chars; some legacy/regional plates and pre-1981
  // vehicles are shorter. R0 accepts a lenient alnum range rather than
  // hard-coding 17, but still rejects obvious junk input.
  if (!/^[A-HJ-NPR-Z0-9]{5,17}$/.test(normalized)) {
    return validationError(
      "VIN inválido: debe ser alfanumérico (sin I/O/Q), 5–17 caracteres.",
      "vin",
    );
  }
  return null;
}

export function validatePlate(raw: string): CommandError | null {
  const normalized = normalizePlate(raw);
  if (!/^[A-Z0-9]{4,10}$/.test(normalized)) {
    return validationError("Placa inválida: debe ser alfanumérica, 4–10 caracteres.", "plate");
  }
  return null;
}

/** Loose E.164-leaning normalization: strips everything but digits and a
 * leading '+'. Good enough for local-fixture matching; real validation
 * (country rules, length per region) is not in scope for R0-D Fase 1. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateContactValue(
  channel: "phone" | "whatsapp" | "email",
  raw: string,
): {
  error: CommandError | null;
  normalized: string;
} {
  if (channel === "email") {
    const normalized = normalizeEmail(raw);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { error: validationError("Correo inválido.", "rawValue"), normalized };
    }
    return { error: null, normalized };
  }
  const normalized = normalizePhone(raw);
  if (!/^\+?[0-9]{7,15}$/.test(normalized)) {
    return { error: validationError("Teléfono inválido.", "rawValue"), normalized };
  }
  return { error: null, normalized };
}
