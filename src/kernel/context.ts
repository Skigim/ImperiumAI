import type { ImperiumMemory } from '@model/memory';

import type { CpuBudget } from './cpuGovernor';
import { Logger } from './logger';

export interface KernelContext {
  tick: number;
  cpuUsed: number;
  cpuBudget: CpuBudget;
  memory: ImperiumMemory;
  logger: Logger;
}

export const createKernelContext = (
  memory: ImperiumMemory,
  cpuBudget: CpuBudget,
): KernelContext => {
  return {
    tick: Game.time,
    cpuUsed: Game.cpu.getUsed(),
    cpuBudget,
    memory,
    logger: new Logger('kernel'),
  };
};
