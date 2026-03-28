export type TaskName = 'harvest' | 'haul' | 'build' | 'upgrade';

export interface TaskContract {
  task: TaskName;
}

export type { HarvestTaskOptions } from './harvest';
export { runHarvest } from './harvest';
export type { TransferTarget, TransferTaskOptions } from './transfer';
export { findTransferTarget, runTransfer } from './transfer';
