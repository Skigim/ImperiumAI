/**
 * Task execution status.
 */
export enum TaskStatus {
  /** Task is in progress, call again next tick */
  IN_PROGRESS = 'in_progress',
  /** Task completed successfully */
  COMPLETE = 'complete',
  /** Task failed and cannot continue */
  FAILED = 'failed',
}

/**
 * Result returned by task execution.
 */
export interface TaskResult {
  status: TaskStatus;
  message?: string;
}

/**
 * Base task interface - all tasks implement this.
 * Tasks are stateless functions that read/write creep memory.
 */
export interface Task {
  /** Unique task type identifier */
  readonly type: string;
  
  /**
   * Execute one tick of task logic.
   * @param creep The creep performing the task
   * @returns TaskResult indicating current status
   */
  run(creep: Creep): TaskResult;
}
