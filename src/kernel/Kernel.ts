import { Process } from './Process';

export interface KernelStats {
  tick: number;
  processesRun: number;
  processesSkipped: number;
  processesTerminated: number;
  totalCpuUsed: number;
  cpuByProcess: Map<string, number>;
}

function createEmptyStats(tick = 0): KernelStats {
  return {
    tick,
    processesRun: 0,
    processesSkipped: 0,
    processesTerminated: 0,
    totalCpuUsed: 0,
    cpuByProcess: new Map(),
  };
}

/**
 * The Kernel is the central OS component that manages process scheduling
 * and resource allocation.
 */
export class Kernel {
  private readonly processes: Map<string, Process> = new Map();
  private stats: KernelStats = createEmptyStats();

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
    const tickCpuStart = Game.cpu.getUsed();
    const stats = createEmptyStats(Game.time);
    const scheduledProcesses = [...this.processes.values()].sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.id.localeCompare(right.id);
    });

    for (const process of scheduledProcesses) {
      if (!this.processes.has(process.id)) {
        continue;
      }

      try {
        if (process.shouldTerminate?.()) {
          this.processes.delete(process.id);
          stats.processesTerminated += 1;
          continue;
        }

        if (!process.shouldRun()) {
          stats.processesSkipped += 1;
          continue;
        }
      } catch (error) {
        console.log(`[Kernel] Process lifecycle failure for ${process.id}: ${String(error)}`);
        stats.processesSkipped += 1;
        continue;
      }

      if (Game.cpu.getUsed() >= Game.cpu.limit) {
        break;
      }

      const cpuBefore = Game.cpu.getUsed();

      try {
        process.run();
      } catch (error) {
        console.log(`[Kernel] Process ${process.id} failed: ${String(error)}`);
      }

      const cpuUsed = Math.max(0, Game.cpu.getUsed() - cpuBefore);
      stats.processesRun += 1;
      stats.cpuByProcess.set(process.id, cpuUsed);
    }

    stats.totalCpuUsed = Math.max(0, Game.cpu.getUsed() - tickCpuStart);
    this.stats = stats;
  }

  /**
   * Get stats from the most recent kernel run.
   */
  getStats(): KernelStats {
    return {
      ...this.stats,
      cpuByProcess: new Map(this.stats.cpuByProcess),
    };
  }
}

// Singleton kernel instance
let kernel: Kernel | null = null;

/**
 * Get or create the kernel instance.
 */
export function getKernel(): Kernel {
  kernel ??= new Kernel();
  return kernel;
}

/**
 * Check if the kernel has been initialized with processes.
 */
export function isKernelInitialized(): boolean {
  return kernel !== null && kernel.processCount > 0;
}
