import { Process, ProcessPriority, ProcessResult } from './Process';

/**
 * CPU budget configuration for the kernel.
 * Shard 3 has a hard 20 CPU limit.
 */
interface CPUBudget {
  /** Maximum CPU to use per tick */
  limit: number;
  /** CPU reserved for critical end-of-tick operations */
  reserved: number;
  /** Threshold to warn about high CPU usage */
  warningThreshold: number;
}

/**
 * Execution statistics for a single tick.
 */
interface TickStats {
  tick: number;
  processesRun: number;
  processesSkipped: number;
  totalCpuUsed: number;
  cpuByProcess: Map<string, number>;
}

/**
 * The Kernel is the central OS component that manages process scheduling
 * and resource allocation. It ensures all processes run within CPU budget.
 */
export class Kernel {
  private processes: Map<string, Process> = new Map();
  private processOrder: string[] = [];
  private needsSort = false;

  private readonly budget: CPUBudget = {
    limit: 20,           // Shard 3 hard cap
    reserved: 0.5,       // Reserve for serialization
    warningThreshold: 18,
  };

  private currentStats: TickStats = {
    tick: 0,
    processesRun: 0,
    processesSkipped: 0,
    totalCpuUsed: 0,
    cpuByProcess: new Map(),
  };

  /**
   * Register a process with the kernel.
   * @param process The process to register
   */
  register(process: Process): void {
    if (this.processes.has(process.id)) {
      console.log(`Kernel: Process ${process.id} already registered, replacing`);
    }

    this.processes.set(process.id, process);
    this.needsSort = true;
  }

  /**
   * Unregister a process from the kernel.
   * @param processId The ID of the process to remove
   */
  unregister(processId: string): boolean {
    const removed = this.processes.delete(processId);
    if (removed) {
      this.needsSort = true;
    }
    return removed;
  }

  /**
   * Get a registered process by ID.
   * @param processId The ID of the process to retrieve
   */
  getProcess(processId: string): Process | undefined {
    return this.processes.get(processId);
  }

  /**
   * Run all registered processes within CPU budget.
   * This is called once per tick from the main loop.
   */
  run(): void {
    const tickStart = Game.cpu.getUsed();
    
    // Reset stats for this tick
    this.currentStats = {
      tick: Game.time,
      processesRun: 0,
      processesSkipped: 0,
      totalCpuUsed: 0,
      cpuByProcess: new Map(),
    };

    // Sort processes by priority if needed
    if (this.needsSort) {
      this.sortProcesses();
    }

    // Calculate available CPU budget
    const availableCpu = this.budget.limit - this.budget.reserved;

    // Execute processes in priority order
    for (const processId of this.processOrder) {
      const process = this.processes.get(processId);
      if (!process) continue;

      // Check CPU budget before running
      const cpuUsed = Game.cpu.getUsed();
      if (cpuUsed >= availableCpu) {
        console.log(`Kernel: CPU budget exhausted (${cpuUsed.toFixed(2)}), skipping remaining processes`);
        this.currentStats.processesSkipped++;
        continue;
      }

      // Check if process wants to run this tick
      if (process.shouldRun && !process.shouldRun()) {
        continue;
      }

      // Execute the process
      const processStart = Game.cpu.getUsed();
      try {
        const result = this.executeProcess(process);
        const processCpu = Game.cpu.getUsed() - processStart;
        
        this.currentStats.processesRun++;
        this.currentStats.cpuByProcess.set(processId, processCpu);

        // Log if process used significant CPU
        if (processCpu > 2) {
          console.log(`Kernel: ${process.name} used ${processCpu.toFixed(2)} CPU`);
        }

        // Log failures
        if (!result.success && result.message) {
          console.log(`Kernel: ${process.name} failed: ${result.message}`);
        }
      } catch (error) {
        console.log(`Kernel: ${process.name} threw error: ${error}`);
        this.currentStats.processesRun++;
      }
    }

    // Update total CPU stats
    this.currentStats.totalCpuUsed = Game.cpu.getUsed() - tickStart;

    // Warn on high CPU usage
    if (Game.cpu.getUsed() > this.budget.warningThreshold) {
      console.log(`Kernel: High CPU usage: ${Game.cpu.getUsed().toFixed(2)}/${this.budget.limit}`);
    }
  }

  /**
   * Execute a single process with error handling.
   */
  private executeProcess(process: Process): ProcessResult {
    try {
      return process.run();
    } catch (error) {
      return {
        success: false,
        message: `Exception: ${error}`,
      };
    }
  }

  /**
   * Sort processes by priority (lower priority number = runs first).
   */
  private sortProcesses(): void {
    this.processOrder = Array.from(this.processes.keys()).sort((a, b) => {
      const processA = this.processes.get(a)!;
      const processB = this.processes.get(b)!;
      return processA.priority - processB.priority;
    });
    this.needsSort = false;
  }

  /**
   * Get execution statistics for the current tick.
   */
  getStats(): TickStats {
    return { ...this.currentStats };
  }

  /**
   * Get the number of registered processes.
   */
  get processCount(): number {
    return this.processes.size;
  }
}

/**
 * Global kernel instance.
 * Initialized once and persists across ticks.
 */
let kernelInstance: Kernel | null = null;

/**
 * Get or create the global kernel instance.
 * The kernel persists across ticks but processes may need to re-register
 * after global reset.
 */
export function getKernel(): Kernel {
  if (!kernelInstance) {
    kernelInstance = new Kernel();
    console.log('Kernel: Initialized');
  }
  return kernelInstance;
}

/**
 * Check if kernel needs initialization (after global reset).
 */
export function isKernelInitialized(): boolean {
  return kernelInstance !== null && kernelInstance.processCount > 0;
}
