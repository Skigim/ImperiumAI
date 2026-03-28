import type { KernelContext } from './context';
import type { CpuGovernor } from './cpuGovernor';
import type { KernelProcess } from './process';

export class Scheduler {
  public run(processes: KernelProcess[], context: KernelContext, governor: CpuGovernor): void {
    const budget = context.cpuBudget;
    const ordered = [...processes].sort((left, right) => left.priority - right.priority);

    for (const process of ordered) {
      const cpuUsed = Game.cpu.getUsed();
      if (!governor.shouldContinue(cpuUsed, budget)) {
        context.logger.warn(
          `CPU soft limit reached at ${cpuUsed.toFixed(2)}. Remaining processes deferred.`,
        );
        return;
      }

      process.run({
        tick: context.tick,
        cpuUsed,
      });
    }
  }
}
