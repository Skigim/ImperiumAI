export class Logger {
  constructor(private readonly scope: string) {}

  public info(message: string): void {
    console.log(`[Imperium][${this.scope}] ${message}`);
  }

  public warn(message: string): void {
    console.log(`[Imperium][${this.scope}][warn] ${message}`);
  }
}
