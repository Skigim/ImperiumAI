/**
 * Process interface - all kernel-managed processes must implement this.
 * Processes are self-contained units that execute within a CPU budget.
 */
export interface Process {
  /** Unique identifier for this process */
  readonly id: string;

  /** Human-readable name for logging */
  readonly name: string;

  /** Priority level (lower = higher priority, runs first) */
  readonly priority: ProcessPriority;

  /**
   * Execute one tick of process logic.
   * @returns ProcessResult indicating completion status
   */
  run(): ProcessResult;

  /**
   * Optional: Check if process should be active this tick.
   * Allows processes to skip execution when not needed.
   * @returns true if process should run, false to skip
   */
  shouldRun?(): boolean;
}

/**
 * Process priority levels.
 * Lower number = higher priority = runs earlier in tick.
 */
export enum ProcessPriority {
  /** Critical system processes (memory cleanup, etc.) */
  CRITICAL = 0,
  /** High priority (defense, emergency spawning) */
  HIGH = 1,
  /** Normal priority (standard room operations) */
  NORMAL = 2,
  /** Low priority (optimization, statistics) */
  LOW = 3,
  /** Background tasks (can be skipped if CPU tight) */
  BACKGROUND = 4,
}

/**
 * Result of process execution.
 */
export interface ProcessResult {
  /** Whether the process completed successfully */
  success: boolean;
  /** Optional message for logging */
  message?: string;
  /** CPU used by this process (set by kernel after execution) */
  cpuUsed?: number;
}

/**
 * Process constructor type for dynamic process creation.
 */
export type ProcessConstructor = new (...args: unknown[]) => Process;
