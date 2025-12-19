/**
 * Role Behavior: Remote Worker
 * 
 * Harvests from adjacent rooms and delivers to home room.
 * Priority: Build → Upgrade (if needed) → Fill (backup)
 */

import { doHarvest, updateHarvestDeliverState } from '../lib';

export interface RemoteWorkerContext {
  homeSpawn: StructureSpawn;
  controller: StructureController;
  extensionSites: ConstructionSite[];
  needsUpgrade: boolean;
}

/**
 * Run remote worker behavior for one tick.
 */
export function runRemoteWorker(creep: Creep, ctx: RemoteWorkerContext): void {
  const homeRoom = creep.memory.homeRoom!;
  const targetRoom = creep.memory.targetRoom!;

  const state = updateHarvestDeliverState(creep);

  if (state === 'harvesting') {
    doHarvest(creep, targetRoom);
  } else {
    doDeliver(creep, homeRoom, ctx);
  }
}

/**
 * Deliver: travel home, then build → upgrade → fill
 */
function doDeliver(creep: Creep, homeRoom: string, ctx: RemoteWorkerContext): void {
  const { homeSpawn, controller, extensionSites, needsUpgrade } = ctx;

  // Go home first
  if (creep.room.name !== homeRoom) {
    creep.moveTo(homeSpawn.pos, { reusePath: 20 });
    return;
  }

  // Priority 1: Build extension construction sites
  const site = creep.pos.findClosestByPath(extensionSites);
  if (site) {
    if (creep.build(site) === ERR_NOT_IN_RANGE) {
      creep.moveTo(site, { reusePath: 5, range: 3 });
    }
    return;
  }

  // Priority 2: Upgrade controller (only if at risk of downgrade)
  if (needsUpgrade) {
    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
      creep.moveTo(controller, { reusePath: 5, range: 3 });
    }
    return;
  }

  // Priority 3: Fill spawn as backup
  if (homeSpawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.transfer(homeSpawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(homeSpawn, { reusePath: 5 });
    }
    return;
  }

  // Priority 4: Fill extensions as backup
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
  if (!creep.pos.inRangeTo(homeSpawn, 3)) {
    creep.moveTo(homeSpawn, { reusePath: 5, range: 3 });
  }
}
