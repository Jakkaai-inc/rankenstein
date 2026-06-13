// Transport-agnostic service errors. Carry an HTTP-ish status so the API layer
// can map them to responses, while server actions can treat them as plain throws.

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class UnauthenticatedError extends ServiceError {
  constructor(message = "unauthenticated") {
    super(message, 401);
    this.name = "UnauthenticatedError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = "not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}
