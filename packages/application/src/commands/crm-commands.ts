// CRM commands — DATATEK_R0_D sección 4.
//
// `CreateProvisionalCustomer`, `AddCustomerContact`, `LinkCustomerAuthIdentity`.
// Each is a pure function: `(state, ctx, input) -> CommandOutcome<T>`. It
// never mutates its `state` argument — it returns a new state object (or
// the same one, unchanged, on an idempotent replay or an error).
import {
  requirePermission,
  validationError,
  notFoundError,
  conflictError,
  type CommandContext,
} from "./context.ts";
import {
  appendAuditEvent,
  appendIdempotencyRecord,
  cryptoRandomId,
  findIdempotentReplay,
  type CommandOutcome,
  type CrmVehicleState,
  type CustomerRow,
  type CustomerType,
  type CustomerContactRow,
  type ContactChannel,
  type CustomerAuthLinkRow,
} from "./state.ts";
import { validateContactValue } from "./normalize.ts";

const NON_EMPTY = (s: string) => s.trim().length > 0;

// --- CreateProvisionalCustomer ------------------------------------------

export interface CreateProvisionalCustomerInput {
  displayName: string;
  customerType?: CustomerType;
  /** e.g. "whatsapp_manual", "walk_in", "referral", "import". */
  source: string;
}

const COMMAND_CREATE_CUSTOMER = "CreateProvisionalCustomer";

export function createProvisionalCustomer(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: CreateProvisionalCustomerInput,
): CommandOutcome<CustomerRow> {
  const replay = findIdempotentReplay<CustomerRow>(state, ctx, COMMAND_CREATE_CUSTOMER);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, "crm.manage");
  if (permError) return { ok: false, error: permError };

  if (!NON_EMPTY(input.displayName)) {
    return {
      ok: false,
      error: validationError("El nombre del cliente es obligatorio.", "displayName"),
    };
  }
  if (!NON_EMPTY(input.source)) {
    return { ok: false, error: validationError("La fuente del cliente es obligatoria.", "source") };
  }

  const customer: CustomerRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    displayName: input.displayName.trim(),
    customerType: input.customerType ?? "person",
    // A customer created by this command never has an account yet — sección
    // 4: "sin cuenta obligatoria". It starts `provisional` until either a
    // verified `customer_auth_links` row exists or staff promotes it.
    status: "provisional",
    source: input.source.trim(),
    createdAt: ctx.now.toISOString(),
    effectiveAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_CREATE_CUSTOMER, "Cliente provisional creado", {
    customerId: customer.id,
  });

  const nextState: CrmVehicleState = {
    ...state,
    customers: [...state.customers, customer],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_CREATE_CUSTOMER, customer),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: customer, replayed: false };
}

// --- AddCustomerContact ---------------------------------------------------

export interface AddCustomerContactInput {
  customerId: string;
  channel: ContactChannel;
  rawValue: string;
  isPrimary?: boolean;
}

const COMMAND_ADD_CONTACT = "AddCustomerContact";

export function addCustomerContact(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: AddCustomerContactInput,
): CommandOutcome<CustomerContactRow> {
  const replay = findIdempotentReplay<CustomerContactRow>(state, ctx, COMMAND_ADD_CONTACT);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, "crm.manage");
  if (permError) return { ok: false, error: permError };

  // Cross-tenant lookups always collapse "not found" and "found in another
  // org" into the same neutral error — never confirm a customer ID exists
  // elsewhere (same pattern as `neutralResourceNotAvailable`, R0-C sección
  // 5.2 step 3, reused here for CRM data instead of organizations).
  const customer = state.customers.find(
    (c) => c.id === input.customerId && c.organizationId === ctx.organizationId,
  );
  if (!customer) return { ok: false, error: notFoundError() };

  const { error, normalized } = validateContactValue(input.channel, input.rawValue);
  if (error) return { ok: false, error };

  const contact: CustomerContactRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    customerId: customer.id,
    channel: input.channel,
    normalizedValue: normalized,
    rawValue: input.rawValue.trim(),
    // A contact is unverified by default — verifying it (OTP, staff
    // confirmation) is a separate flow not implemented in R0-D Fase 1.
    verified: false,
    verifiedAt: null,
    isPrimary: input.isPrimary ?? false,
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
  };

  const auditEvent = appendAuditEvent(ctx, COMMAND_ADD_CONTACT, "Contacto agregado a cliente", {
    customerId: customer.id,
    contactId: contact.id,
    channel: contact.channel,
  });

  const nextState: CrmVehicleState = {
    ...state,
    customerContacts: [...state.customerContacts, contact],
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_ADD_CONTACT, contact),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: contact, replayed: false };
}

// --- LinkCustomerAuthIdentity ---------------------------------------------

export interface LinkCustomerAuthIdentityInput {
  customerId: string;
  userId: string;
  /** How the linking was verified (e.g. "otp_phone", "otp_email",
   * "manual_staff"). The command trusts this field the same way a real
   * implementation would trust an already-completed verification step;
   * running the verification itself is out of scope for R0-D Fase 1. */
  verificationMethod: string;
  verified: boolean;
}

const COMMAND_LINK_AUTH_IDENTITY = "LinkCustomerAuthIdentity";

export function linkCustomerAuthIdentity(
  state: CrmVehicleState,
  ctx: CommandContext,
  input: LinkCustomerAuthIdentityInput,
): CommandOutcome<CustomerAuthLinkRow> {
  const replay = findIdempotentReplay<CustomerAuthLinkRow>(state, ctx, COMMAND_LINK_AUTH_IDENTITY);
  if (replay) return { ok: true, nextState: state, data: replay, replayed: true };

  const permError = requirePermission(ctx, "crm.manage");
  if (permError) return { ok: false, error: permError };

  const customer = state.customers.find(
    (c) => c.id === input.customerId && c.organizationId === ctx.organizationId,
  );
  if (!customer) return { ok: false, error: notFoundError() };

  if (!input.verified) {
    return {
      ok: false,
      error: validationError(
        "No se puede vincular una cuenta sin verificación previa.",
        "verified",
      ),
    };
  }
  if (!NON_EMPTY(input.userId)) {
    return { ok: false, error: validationError("userId es obligatorio.", "userId") };
  }

  // "no fusiona clientes de otros talleres" (sección 4): within THIS
  // organization, one user may not hold a second active verified link to a
  // different customer — that would silently fuse two local customer
  // identities behind one account. Linking the same user to a different
  // customer in a DIFFERENT organization is unaffected (a different org's
  // `customers` row is a wholly separate local relationship).
  const existingActiveLink = state.customerAuthLinks.find(
    (l) =>
      l.organizationId === ctx.organizationId &&
      l.userId === input.userId &&
      l.status === "verified" &&
      l.customerId !== customer.id,
  );
  if (existingActiveLink) {
    return {
      ok: false,
      error: conflictError("Esta cuenta ya está vinculada a otro cliente en esta organización."),
    };
  }

  const link: CustomerAuthLinkRow = {
    id: cryptoRandomId(),
    organizationId: ctx.organizationId,
    customerId: customer.id,
    userId: input.userId,
    status: "verified",
    verificationMethod: input.verificationMethod,
    verifiedAt: ctx.now.toISOString(),
    createdAt: ctx.now.toISOString(),
    createdBy: ctx.actorId,
    revokedAt: null,
  };

  const auditEvent = appendAuditEvent(
    ctx,
    COMMAND_LINK_AUTH_IDENTITY,
    "Cuenta vinculada a cliente (verificada)",
    { customerId: customer.id, userId: input.userId, linkId: link.id },
  );

  const nextState: CrmVehicleState = {
    ...state,
    customerAuthLinks: [...state.customerAuthLinks, link],
    customers: state.customers.map((c) =>
      c.id === customer.id ? { ...c, status: "active" as const } : c,
    ),
    idempotencyRecords: [
      ...state.idempotencyRecords,
      appendIdempotencyRecord(ctx, COMMAND_LINK_AUTH_IDENTITY, link),
    ],
    auditLog: [...state.auditLog, auditEvent],
  };

  return { ok: true, nextState, data: link, replayed: false };
}
