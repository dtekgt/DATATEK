// Contratos de rate limit — DATATEK_R0_E sección 10.
//
// Estos tests prueban el CONTRATO y el adapter LOCAL. No prueban — ni
// pueden probar — rate limiting productivo: eso exige un backend
// distribuido. Ver la declaración al inicio de `rate-limit.ts`.
import { describe, it } from "node:test";
import { expect } from "expect";
import {
  buildBucketKey,
  buildRateLimitEvent,
  hashSubject,
  InMemoryRateLimiter,
  RATE_LIMIT_POLICIES,
  type RateLimitPolicy,
  type RateLimitPolicyName,
} from "./rate-limit";

const T0 = new Date("2026-08-02T12:00:00.000Z");
function at(ms: number): Date {
  return new Date(T0.getTime() + ms);
}

const ALL_POLICY_NAMES = Object.keys(RATE_LIMIT_POLICIES) as RateLimitPolicyName[];

describe("políticas de rate limit — los 6 ámbitos obligatorios", () => {
  it("existen exactamente los seis ámbitos que pide la sección 10", () => {
    expect(ALL_POLICY_NAMES.sort()).toEqual([
      "authorizationTokenPage",
      "authorizationVerify",
      "booking",
      "login",
      "publicEndpoints",
      "uploadIntentCreate",
    ]);
  });

  it("cada política define los 8 campos obligatorios", () => {
    for (const name of ALL_POLICY_NAMES) {
      const p: RateLimitPolicy = RATE_LIMIT_POLICIES[name];
      // (1) sujeto/bucket
      expect(typeof p.subject).toBe("string");
      expect(p.bucketScope.length).toBeGreaterThan(0);
      // (2) ventana
      expect(p.windowSeconds).toBeGreaterThan(0);
      // (3) límite
      expect(p.limit).toBeGreaterThan(0);
      // (4) respuesta
      expect(p.response.status).toBe(429);
      expect(p.response.message.length).toBeGreaterThan(0);
      // (5) retry-after
      expect(p.emitsRetryAfter).toBe(true);
      // (6) privacidad del identificador
      expect(p.identifierPrivacy.hashed).toBe(true);
      expect(p.identifierPrivacy.storedForm.length).toBeGreaterThan(0);
      // (7) observabilidad
      expect(p.observabilityEvent.startsWith("rate_limit.")).toBe(true);
      // (8) comportamiento ante caída del proveedor
      expect(["fail_open", "fail_closed"]).toContain(p.providerFailure.mode);
      expect(p.providerFailure.rationale.length).toBeGreaterThan(0);
    }
  });

  it("todos los mensajes de rechazo son neutrales e idénticos", () => {
    const messages = new Set(ALL_POLICY_NAMES.map((n) => RATE_LIMIT_POLICIES[n].response.message));
    // Un mensaje distinto por ámbito revelaría qué recurso se está tocando.
    expect(messages.size).toBe(1);
    const [message] = [...messages];
    expect(message).not.toContain("token");
    expect(message).not.toContain("IP");
  });

  it("cada ámbito usa un bucketScope distinto — agotar uno no consume otro", () => {
    const scopes = ALL_POLICY_NAMES.map((n) => RATE_LIMIT_POLICIES[n].bucketScope);
    expect(new Set(scopes).size).toBe(scopes.length);
  });
});

describe("privacidad del identificador", () => {
  it("el bucket nunca contiene la IP cruda", () => {
    const ip = "203.0.113.45";
    const key = buildBucketKey(RATE_LIMIT_POLICIES.login, ip);
    expect(key).not.toContain(ip);
    expect(key).not.toContain("203.0");
  });

  it("el hash es estable dentro del proceso y distinto por identificador", () => {
    expect(hashSubject("203.0.113.45")).toBe(hashSubject("203.0.113.45"));
    expect(hashSubject("203.0.113.45")).not.toBe(hashSubject("203.0.113.46"));
  });

  it("el evento de observabilidad no filtra el identificador crudo", () => {
    const limiter = new InMemoryRateLimiter();
    const decision = limiter.consume(RATE_LIMIT_POLICIES.login, "203.0.113.45", T0);
    const event = buildRateLimitEvent("login", "203.0.113.45", decision);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("203.0.113.45");
    expect(event.event).toBe("rate_limit.login.exceeded");
    expect(event.bucket.startsWith("auth:login:")).toBe(true);
  });

  it("un token de autorización nunca entra crudo al bucket", () => {
    const tokenRowId = "tok-01HZX9ABCDEF";
    const key = buildBucketKey(RATE_LIMIT_POLICIES.authorizationVerify, tokenRowId);
    expect(key).not.toContain(tokenRowId);
  });
});

describe("adapter local — ventana fija", () => {
  it("permite hasta el límite y rechaza el siguiente", () => {
    const limiter = new InMemoryRateLimiter();
    const policy = RATE_LIMIT_POLICIES.login; // límite 10, ventana 300 s

    for (let i = 0; i < policy.limit; i += 1) {
      const decision = limiter.consume(policy, "ip-1", at(0));
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(policy.limit - i - 1);
    }

    const blocked = limiter.consume(policy, "ip-1", at(0));
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.degraded).toBe(false);
  });

  it("emite un retry-after positivo y acotado por la ventana", () => {
    const limiter = new InMemoryRateLimiter();
    const policy = RATE_LIMIT_POLICIES.authorizationTokenPage; // 30 / 60 s

    for (let i = 0; i < policy.limit; i += 1) {
      limiter.consume(policy, "ip-1", at(0));
    }
    const blocked = limiter.consume(policy, "ip-1", at(10_000));
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(50);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(policy.windowSeconds);
  });

  it("la ventana se reinicia al vencer", () => {
    const limiter = new InMemoryRateLimiter();
    const policy = RATE_LIMIT_POLICIES.booking; // 20 / 60 s

    for (let i = 0; i < policy.limit; i += 1) {
      limiter.consume(policy, "actor-1", at(0));
    }
    expect(limiter.consume(policy, "actor-1", at(59_000)).allowed).toBe(false);
    expect(limiter.consume(policy, "actor-1", at(60_001)).allowed).toBe(true);
  });

  it("sujetos distintos tienen cuotas independientes", () => {
    const limiter = new InMemoryRateLimiter();
    const policy = RATE_LIMIT_POLICIES.login;

    for (let i = 0; i < policy.limit; i += 1) {
      limiter.consume(policy, "ip-1", at(0));
    }
    expect(limiter.consume(policy, "ip-1", at(0)).allowed).toBe(false);
    expect(limiter.consume(policy, "ip-2", at(0)).allowed).toBe(true);
  });

  it("ámbitos distintos no comparten cuota para el mismo sujeto", () => {
    const limiter = new InMemoryRateLimiter();
    const login = RATE_LIMIT_POLICIES.login;

    for (let i = 0; i < login.limit; i += 1) {
      limiter.consume(login, "same-subject", at(0));
    }
    expect(limiter.consume(login, "same-subject", at(0)).allowed).toBe(false);
    // El mismo sujeto en otro ámbito sigue con cuota completa.
    expect(
      limiter.consume(RATE_LIMIT_POLICIES.publicEndpoints, "same-subject", at(0)).allowed,
    ).toBe(true);
  });
});

describe("comportamiento ante caída del proveedor", () => {
  it("fail_open deja pasar y marca la decisión como degradada", () => {
    const limiter = new InMemoryRateLimiter({ simulateProviderFailure: () => true });
    const decision = limiter.consume(RATE_LIMIT_POLICIES.login, "ip-1", T0);
    expect(RATE_LIMIT_POLICIES.login.providerFailure.mode).toBe("fail_open");
    expect(decision.allowed).toBe(true);
    expect(decision.degraded).toBe(true);
  });

  it("fail_closed rechaza y ofrece retry-after", () => {
    const limiter = new InMemoryRateLimiter({ simulateProviderFailure: () => true });
    const policy = RATE_LIMIT_POLICIES.uploadIntentCreate;
    expect(policy.providerFailure.mode).toBe("fail_closed");

    const decision = limiter.consume(policy, "actor-1", T0);
    expect(decision.allowed).toBe(false);
    expect(decision.degraded).toBe(true);
    expect(decision.retryAfterSeconds).toBe(policy.windowSeconds);
  });

  it("solo `upload_intent_create` es fail_closed; el resto es fail_open y justificado", () => {
    const failClosed = ALL_POLICY_NAMES.filter(
      (n) => RATE_LIMIT_POLICIES[n].providerFailure.mode === "fail_closed",
    );
    expect(failClosed).toEqual(["uploadIntentCreate"]);

    // Cada fail_open debe apoyarse en un control independiente, no en la
    // esperanza de que el limiter esté vivo.
    for (const name of ALL_POLICY_NAMES) {
      const p = RATE_LIMIT_POLICIES[name];
      if (p.providerFailure.mode === "fail_open") {
        expect(p.providerFailure.rationale.length).toBeGreaterThan(40);
      }
    }
  });

  it("un fallo del proveedor NUNCA lanza — siempre devuelve una decisión", () => {
    const limiter = new InMemoryRateLimiter({
      simulateProviderFailure: () => true,
    });
    for (const name of ALL_POLICY_NAMES) {
      const decision = limiter.consume(RATE_LIMIT_POLICIES[name], "subject", T0);
      expect(typeof decision.allowed).toBe("boolean");
      expect(decision.degraded).toBe(true);
    }
  });
});
