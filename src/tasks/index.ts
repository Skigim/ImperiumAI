export type TaskName = 'harvest' | 'haul' | 'build' | 'upgrade';

export interface TaskContract {
  task: TaskName;
}

export type { BuildTaskOptions } from './build';
export { runBuild } from './build';
export type { HarvestTaskOptions } from './harvest';
export { runHarvest } from './harvest';
export type { RepairTarget, RepairTaskOptions } from './repair';
export { runRepair } from './repair';
export type { TransferTarget, TransferTaskOptions } from './transfer';
export { findTransferTarget, runTransfer } from './transfer';
export type { WithdrawTarget, WithdrawTaskOptions } from './withdraw';
export { runWithdraw } from './withdraw';
