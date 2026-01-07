/**
 * Role Behavior: Worker
 * 
 * Generic worker that harvests and delivers energy.
 */

export interface WorkerContext {
  spawn: StructureSpawn;
  controller: StructureController;
  extensionSites: ConstructionSite[];
  needsUpgrade: boolean;
  isFullyStaffed: boolean;
}

/**
 * Run worker behavior for one tick.
 */
export function runWorker(creep: Creep, ctx: WorkerContext): void {
  // TODO: Implement worker behavior
}
