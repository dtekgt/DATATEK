// Shared invariant-violation error for every value object in this
// directory. Domain code throws this (never a bare Error) so application
// code can catch a single, stable type and translate it into a typed
// `CommandError` — the value object itself never knows about commands,
// HTTP, or Postgres (packages/domain stays pure, sección "Estándar
// transversal" of DATATEK_R0_D).
export class DomainInvariantError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "DomainInvariantError";
    this.field = field;
  }
}
