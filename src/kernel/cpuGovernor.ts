const BASELINE_CPU_BUDGET = 20;
const BURST_BUCKET_THRESHOLD = 7_500;

export interface CpuBudget {
  hardLimit: number;
  softLimit: number;
}

export class CpuGovernor {
  public getBudget(): CpuBudget {
    const roomForBurst = Game.cpu.bucket >= BURST_BUCKET_THRESHOLD;
    const hardLimit = Math.max(BASELINE_CPU_BUDGET, Game.cpu.limit);
    const softLimit = roomForBurst ? hardLimit : Math.min(hardLimit, BASELINE_CPU_BUDGET);

    return {
      hardLimit,
      softLimit,
    };
  }

  public shouldContinue(cpuUsed: number, budget: CpuBudget): boolean {
    return cpuUsed < budget.softLimit;
  }
}
