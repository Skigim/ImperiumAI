export type ProcessId = string;
export type ProcessStatus = 'idle' | 'running' | 'completed' | 'suspended';

export interface KernelProcess {
  id: ProcessId;
  label: string;
  priority: number;
  run(context: ProcessRunContext): ProcessStatus;
}

export interface ProcessRunContext {
  tick: number;
  cpuUsed: number;
}
