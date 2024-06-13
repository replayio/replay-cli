// TODO [PRO-629] Move this into the "shared" package.
export class GraphQLError extends Error {
  errors: unknown[];

  constructor(message: string, errors: unknown[]) {
    super(message);
    this.errors = errors;
  }
}
