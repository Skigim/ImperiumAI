/**
 * Role Behavior: Filler
 * 
 * Dedicated to keeping spawn/extensions full.
 * Priority: Fill spawn → Fill extensions → Upgrade
 */

import { doHarvest, updateHarvestDeliverState } from '../lib';

export interface FillerContext {
  spawn: StructureSpawn;
  controller: StructureController;
}

/**
 * Run filler behavior for one tick.
 */
export function runFiller(creep: Creep, ctx: FillerContext): void {
  const state = updateHarvestDeliverState(creep);

  if (state === 'harvesting') {
    doHarvest(creep);
  } else {
    doDeliver(creep, ctx);
  }
}

/**
 * Deliver: fill spawn → fill extensions → upgrade
 */
function doDeliver(creep: Creep, ctx: FillerContext): void {
  const { spawn, controller } = ctx;

  // Priority 1: Fill spawn
  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(spawn, { reusePath: 5 });
    }
    return;
  }

  // Priority 2: Fill extensions
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

  // Priority 3: All full - upgrade controller
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller, { reusePath: 5, range: 3 });
  }
}
