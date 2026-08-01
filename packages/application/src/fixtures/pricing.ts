import type { PriceModality } from "../viewmodels/shared";

// All five service_price_modes demonstrated, always as DEMO DATA, never as a
// "universal" price (R0-B sección 7, Market).
export const FIXTURE_PRICE_MODALITIES: Record<string, PriceModality> = {
  fixed: { mode: "fixed", amount: { amount: 350, currency: "GTQ" } },
  from: { mode: "from", amountFrom: { amount: 220, currency: "GTQ" } },
  range: {
    mode: "range",
    amountFrom: { amount: 800, currency: "GTQ" },
    amountTo: { amount: 1450, currency: "GTQ" },
  },
  inspection_required: {
    mode: "inspection_required",
    note: "El precio final depende de una inspección presencial.",
  },
  diagnosis_required: {
    mode: "diagnosis_required",
    note: "Se requiere diagnóstico técnico antes de cotizar.",
  },
};
