// Staff-facing application command: open a usable case from the information
// an advisor captures in Pro. It composes the canonical CRM, vehicle and
// intake commands in one atomic state transition. If any step fails, none of
// the earlier rows are committed to the in-memory engine.
import {
  type CommandContext,
  type CommandError,
  notFoundError,
  validationError,
} from "./context.ts";
import {
  type CommandOutcome,
  type CrmVehicleState,
  type CustomerRow,
  type CustomerContactRow,
  type IntakeChannel,
  type IntakeEntryRow,
  type IntakeThreadRow,
  type CaseRow,
  type ServiceRequestRow,
  type ReportedSymptomRow,
  type ContactChannel,
} from "./state.ts";
import { createProvisionalCustomer, addCustomerContact } from "./crm-commands.ts";
import { registerVehicle, type RegisterVehicleInput } from "./vehicle-commands.ts";
import {
  createManualIntake,
  createCaseFromIntake,
  interpretReportedSymptom,
} from "./intake-commands.ts";

export type CaseCustomerSelection =
  | { kind: "existing"; customerId: string }
  | {
      kind: "new";
      displayName: string;
      contact?: { channel: ContactChannel; value: string } | null;
    };

export type CaseVehicleSelection =
  | { kind: "existing"; vehicleId: string }
  | ({ kind: "new" } & Omit<RegisterVehicleInput, "customerId">);

export interface OpenCaseFromRequestInput {
  customer: CaseCustomerSelection;
  vehicle: CaseVehicleSelection;
  channel: IntakeChannel;
  reportedText: string;
  branchId?: string | null;
}

export interface OpenCaseFromRequestOutput {
  customer: CustomerRow;
  contact: CustomerContactRow | null;
  vehicleId: string;
  thread: IntakeThreadRow;
  entry: IntakeEntryRow;
  case: CaseRow;
  serviceRequest: ServiceRequestRow;
  symptom: ReportedSymptomRow;
  createdCustomer: boolean;
  createdVehicleAccess: boolean;
}

function stepContext(ctx: CommandContext, step: string): CommandContext {
  return { ...ctx, idempotencyKey: `${ctx.idempotencyKey}:${step}` };
}

function failed<T>(error: CommandError) {
  return { ok: false as const, error } as CommandOutcome<T>;
}

export function openCaseFromRequest(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: OpenCaseFromRequestInput,
): CommandOutcome<OpenCaseFromRequestOutput> {
  if (!input.reportedText.trim()) {
    return {
      ok: false,
      error: validationError("Describe brevemente qué reporta el cliente.", "reportedText"),
    };
  }

  let current = state;
  let customer: CustomerRow;
  let contact: CustomerContactRow | null = null;
  let createdCustomer = false;

  if (input.customer.kind === "existing") {
    const customerId = input.customer.customerId;
    const found = current.customers.find(
      (row) => row.id === customerId && row.organizationId === ctx.organizationId,
    );
    if (!found) return { ok: false, error: notFoundError() };
    customer = found;
  } else {
    const created = createProvisionalCustomer(current, stepContext(ctx, "customer"), {
      displayName: input.customer.displayName,
      source: input.channel,
    });
    if (!created.ok) return failed<OpenCaseFromRequestOutput>(created.error);
    current = created.nextState;
    customer = created.data;
    createdCustomer = true;

    if (input.customer.contact?.value.trim()) {
      const added = addCustomerContact(current, stepContext(ctx, "contact"), {
        customerId: customer.id,
        channel: input.customer.contact.channel,
        rawValue: input.customer.contact.value,
        isPrimary: true,
      });
      if (!added.ok) return failed<OpenCaseFromRequestOutput>(added.error);
      current = added.nextState;
      contact = added.data;
    }
  }

  let vehicleId: string;
  let createdVehicleAccess = false;
  if (input.vehicle.kind === "existing") {
    const selectedVehicleId = input.vehicle.vehicleId;
    const hasCustomerAccess = current.vehicleAccessGrants.some(
      (grant) =>
        grant.organizationId === ctx.organizationId &&
        grant.vehicleId === selectedVehicleId &&
        grant.grantedToCustomerId === customer.id &&
        grant.revokedAt === null,
    );
    const vehicleExists = current.vehicles.some((row) => row.id === selectedVehicleId);
    if (!hasCustomerAccess || !vehicleExists) {
      return { ok: false, error: notFoundError() };
    }
    vehicleId = selectedVehicleId;
  } else {
    const { kind: _kind, ...vehicleInput } = input.vehicle;
    const registered = registerVehicle(current, stepContext(ctx, "vehicle"), {
      ...vehicleInput,
      customerId: customer.id,
    });
    if (!registered.ok) return failed<OpenCaseFromRequestOutput>(registered.error);
    current = registered.nextState;
    vehicleId = registered.data.vehicleId;
    createdVehicleAccess = true;
  }

  const intake = createManualIntake(current, stepContext(ctx, "intake"), {
    customerId: customer.id,
    channel: input.channel,
    originalText: input.reportedText,
    reportedAt: ctx.now.toISOString(),
  });
  if (!intake.ok) return failed<OpenCaseFromRequestOutput>(intake.error);
  current = intake.nextState;

  const opened = createCaseFromIntake(current, stepContext(ctx, "case"), {
    intakeThreadId: intake.data.thread.id,
    customerId: customer.id,
    vehicleId,
    branchId: input.branchId ?? ctx.branchId,
    summary: input.reportedText,
  });
  if (!opened.ok) return failed<OpenCaseFromRequestOutput>(opened.error);
  current = opened.nextState;

  const interpreted = interpretReportedSymptom(current, stepContext(ctx, "symptom"), {
    caseId: opened.data.case.id,
    serviceRequestId: opened.data.serviceRequest.id,
    sourceIntakeEntryId: intake.data.entry.id,
    symptomCode: "customer_reported",
    description: input.reportedText,
    reportedAt: ctx.now.toISOString(),
  });
  if (!interpreted.ok) return failed<OpenCaseFromRequestOutput>(interpreted.error);

  return {
    ok: true,
    nextState: interpreted.nextState,
    data: {
      customer,
      contact,
      vehicleId,
      thread: intake.data.thread,
      entry: intake.data.entry,
      case: opened.data.case,
      serviceRequest: opened.data.serviceRequest,
      symptom: interpreted.data,
      createdCustomer,
      createdVehicleAccess,
    },
    replayed: interpreted.replayed,
  };
}
