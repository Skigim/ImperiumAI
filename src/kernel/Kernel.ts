import { Process, ProcessPriority, ProcessResult } from './Process';

/**
 * The Kernel is the central OS component that manages process scheduling
 * and resource allocation.
 */
export class Kernel {
  private processes: Map<string, Process> = new Map();

  /**
   * Register a process with the kernel.
   */
  register(process: Process): void {
    this.processes.set(process.id, process);
  }

  /**
   * Unregister a process from the kernel.
   */
  unregister(processId: string): boolean {
    return this.processes.delete(processId);
  }

  /**
   * Get a registered process by ID.
   */
  getProcess(processId: string): Process | undefined {
    return this.processes.get(processId);
  }

  /**
   * Get the number of registered processes.
   */
  get processCount(): number {
    return this.processes.size;
  }

  /**
   * Run all registered processes.
   * Called once per tick from the main loop.
   */
  run(): void {
    // TODO: Implement process scheduling
  }
}

// Singleton kernel instance
let kernel: Kernel | null = null;

/**
 * Get or create the kernel instance.
 */
export function getKernel(): Kernel {
  if (!kernel) {
    kernel = new Kernel();
  }
  return kernel;
}

/**
 * Check if the kernel has been initialized with processes.
 */
export function isKernelInitialized(): boolean {
  return kernel !== null && kernel.processCount > 0;
}
