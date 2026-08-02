// Template mínimo versionado de frenos — DATATEK_R0_A sección 7.2 (tabla
// literal) + DATATEK_R0_D sección 9. Pure data: the physical seed row a
// migration inserts and the fixture/command layers reuse this same catalog
// instead of re-typing item keys by hand in three different places.
export type BrakeItemScope = "axle_side" | "vehicle";
export type BrakeAxle = "front" | "rear";
export type BrakeSide = "left" | "right" | "center";

export interface BrakeTemplateItemDef {
  key: string;
  sectionKey: string;
  label: string;
  scope: BrakeItemScope;
  /** true = the item needs BOTH a condition (RecordInspectionResult) AND a
   * numeric value (RecordMeasurement) — sección 7.2: "una condición no
   * reemplaza la medición cuando esta es requerida". */
  requiresMeasurement: boolean;
  measurementUnit: string | null;
  displayOrder: number;
}

export interface BrakeTemplateSectionDef {
  key: string;
  label: string;
  displayOrder: number;
}

export const BRAKES_TEMPLATE_KEY = "brakes";
export const BRAKES_TEMPLATE_VERSION = 1;

export const BRAKES_TEMPLATE_SECTIONS: readonly BrakeTemplateSectionDef[] = [
  { key: "pads", label: "Pastillas", displayOrder: 1 },
  { key: "disc", label: "Disco", displayOrder: 2 },
  { key: "caliper", label: "Cáliper", displayOrder: 3 },
  { key: "guide_pins", label: "Pines guía", displayOrder: 4 },
  { key: "hoses", label: "Mangueras/líneas", displayOrder: 5 },
  { key: "fluid", label: "Líquido", displayOrder: 6 },
  { key: "parking_brake", label: "Freno de estacionamiento", displayOrder: 7 },
  { key: "pedal", label: "Pedal", displayOrder: 8 },
  { key: "road_test", label: "Prueba de ruta", displayOrder: 9 },
];

// Sección 7.2, fila por fila. "por eje/lado" -> scope: 'axle_side'.
// "vehículo" -> scope: 'vehicle'.
export const BRAKES_TEMPLATE_ITEMS: readonly BrakeTemplateItemDef[] = [
  {
    key: "pad_thickness_inner",
    sectionKey: "pads",
    label: "Espesor de pastilla — interior",
    scope: "axle_side",
    requiresMeasurement: true,
    measurementUnit: "mm",
    displayOrder: 1,
  },
  {
    key: "pad_thickness_outer",
    sectionKey: "pads",
    label: "Espesor de pastilla — exterior",
    scope: "axle_side",
    requiresMeasurement: true,
    measurementUnit: "mm",
    displayOrder: 2,
  },
  {
    key: "disc_thickness_measured",
    sectionKey: "disc",
    label: "Espesor de disco — medido",
    scope: "axle_side",
    requiresMeasurement: true,
    measurementUnit: "mm",
    displayOrder: 3,
  },
  {
    key: "disc_thickness_minimum",
    sectionKey: "disc",
    label: "Espesor de disco — mínimo especificado",
    scope: "axle_side",
    requiresMeasurement: true,
    measurementUnit: "mm",
    displayOrder: 4,
  },
  {
    key: "disc_surface_condition",
    sectionKey: "disc",
    label: "Superficie del disco",
    scope: "axle_side",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 5,
  },
  {
    key: "caliper_condition",
    sectionKey: "caliper",
    label: "Condición del cáliper",
    scope: "axle_side",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 6,
  },
  {
    key: "guide_pins_condition",
    sectionKey: "guide_pins",
    label: "Condición de pines guía",
    scope: "axle_side",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 7,
  },
  {
    key: "hoses_condition",
    sectionKey: "hoses",
    label: "Condición de mangueras/líneas",
    scope: "axle_side",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 8,
  },
  {
    key: "fluid_condition",
    sectionKey: "fluid",
    label: "Nivel/condición del líquido de frenos",
    scope: "vehicle",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 9,
  },
  {
    key: "parking_brake_condition",
    sectionKey: "parking_brake",
    label: "Funcionamiento del freno de estacionamiento",
    scope: "vehicle",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 10,
  },
  {
    key: "pedal_result",
    sectionKey: "pedal",
    label: "Resultado de pedal",
    scope: "vehicle",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 11,
  },
  {
    key: "road_test_result",
    sectionKey: "road_test",
    label: "Resultado de prueba de ruta",
    scope: "vehicle",
    requiresMeasurement: false,
    measurementUnit: null,
    displayOrder: 12,
  },
];

export const BRAKE_AXLES: readonly BrakeAxle[] = ["front", "rear"];
export const BRAKE_SIDES: readonly BrakeSide[] = ["left", "right"];

/** Every (item, axle, side) combination the template requires before an
 * inspection can complete — sección 7.4 "faltan campos requeridos sin
 * razón" is evaluated against exactly this set. `vehicle`-scoped items
 * appear once, with axle/side both `null`. */
export interface BrakeRequiredSlot {
  itemKey: string;
  axle: BrakeAxle | null;
  side: BrakeSide | null;
}

export function brakesTemplateRequiredSlots(): BrakeRequiredSlot[] {
  const slots: BrakeRequiredSlot[] = [];
  for (const item of BRAKES_TEMPLATE_ITEMS) {
    if (item.scope === "vehicle") {
      slots.push({ itemKey: item.key, axle: null, side: null });
      continue;
    }
    for (const axle of BRAKE_AXLES) {
      for (const side of BRAKE_SIDES) {
        slots.push({ itemKey: item.key, axle, side });
      }
    }
  }
  return slots;
}

export function findBrakeItemDef(itemKey: string): BrakeTemplateItemDef | undefined {
  return BRAKES_TEMPLATE_ITEMS.find((i) => i.key === itemKey);
}
