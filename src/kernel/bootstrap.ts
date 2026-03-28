import { initializeMemory } from '@model/memory';
import { getKernelProcesses } from '@processes/index';

import { createKernelContext } from './context';
import { CpuGovernor } from './cpuGovernor';
import { Logger } from './logger';
import type { KernelProcess } from './process';
import { Scheduler } from './scheduler';

const rootLogger = new Logger('bootstrap');

const bootstrapProcess: KernelProcess = {
  id: 'kernel.bootstrap',
  label: 'KernelBootstrap',
  priority: 0,
  run(context) {
    rootLogger.info(
      `Kernel heartbeat at tick ${context.tick} using ${context.cpuUsed.toFixed(2)} CPU.`,
    );
    return 'completed';
  },
};

export const runKernel = (): void => {
  initializeMemory();

  const governor = new CpuGovernor();
  const context = createKernelContext(Memory.imperium, governor.getBudget());
  const scheduler = new Scheduler();
  const processes: KernelProcess[] = [bootstrapProcess, ...getKernelProcesses()];

  scheduler.run(processes, context, governor);
};
