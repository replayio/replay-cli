export class ProcessError extends Error {
  stderr: string;

  constructor(message: string, stderr: string) {
    super(message);

    this.stderr = stderr;
  }
}
