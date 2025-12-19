/**
 * Role Behavior: Worker
 * 
 * Generic worker that harvests and delivers energy.
 * Before fully staffed: Fill spawn → Build → Upgrade
 * After fully staffed: Build → Upgrade (filler handles filling)
 */

import { doHarvest, updateHarvestDeliverState } from '../lib';

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
  const state = updateHarvestDeliverState(creep);

  if (state === 'harvesting') {
    doHarvest(creep);
  } else {
    doDeliver(creep, ctx);
  }
}

/**
 * Deliver: priorities depend on staffing level.
 * Before fully staffed: Fill spawn → Build → Upgrade
 * After fully staffed: Build → Upgrade (filler handles filling)
 */
function doDeliver(creep: Creep, ctx: WorkerContext): void {
  const { spawn, controller, extensionSites, needsUpgrade, isFullyStaffed } = ctx;

  // Before fully staffed: prioritize filling spawn for faster spawning
  if (!isFullyStaffed) {
    if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, { reusePath: 5 });
      }
      return;
    }
  }

  // Priority: Build extension construction sites
  const site = creep.pos.findClosestByPath(extensionSites);
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) {
      creep.moveTo(site, { reusePath: 5, range: 3 });
    }
    return;
  }

  // Priority: Upgrade controller (only if at risk of downgrade)
  if (needsUpgrade) {
    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
      creep.moveTo(controller, { reusePath: 5, range: 3 });
    }
    return;
  }

  // Backup: Fill spawn/extensions if nothing else to do
  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(spawn, { reusePath: 5 });
    }
    return;
  }

  const needyExtension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureExtension =>
      s.structureType === STRUCTURE_EXTENSION &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });
  if (needyExtension) {
    if (creep.transfer(needyExtension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(needyExtension, { reusePath: 5 });
    }
    return;
  }

  // Truly idle - stay near spawn
  if (!creep.pos.inRangeTo(spawn, 3)) {
    creep.moveTo(spawn, { reusePath: 5, range: 3 });
  }
}
