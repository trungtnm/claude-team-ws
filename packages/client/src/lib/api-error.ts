export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorMessage: string,
    public readonly issues?: Array<{ path: string[]; message: string }>,
  ) {
    super(errorMessage)
    this.name = 'ApiError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isValidationError(): boolean {
    return this.status === 400
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}
