import { Kernel } from '../kernel';
import { Process, ProcessPriority, ProcessResult } from '../kernel/Process';
import { WorkerProcess } from './WorkerProcess';

export class BootstrapProcess implements Process {
  static readonly ID = 'bootstrap:rooms';

  readonly id = BootstrapProcess.ID;
  readonly name = 'Bootstrap Process';
  readonly priority = ProcessPriority.CRITICAL;

  constructor(private readonly kernel: Kernel) {}

  shouldRun(): boolean {
    return true;
  }

  run(): ProcessResult {
    for (const room of Object.values(Game.rooms)) {
      if (!room.controller?.my) {
        continue;
      }

      const processId = WorkerProcess.getId(room.name);

      if (!this.kernel.getProcess(processId)) {
        this.kernel.register(new WorkerProcess(room.name));
      }
    }

    return { success: true };
  }
}