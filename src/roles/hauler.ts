/**
 * Role Behavior: Hauler
 * 
 * Picks up energy from containers/ground near sources and delivers to structures.
 * Priority: Fill spawn → Fill extensions → Upgrade controller
 */

export interface HaulerContext {
  spawn: StructureSpawn;
  controller: StructureController;
}

/**
 * Run hauler behavior for one tick.
 */
export function runHauler(creep: Creep, ctx: HaulerContext): void {
  // State transitions
  if (creep.store.getFreeCapacity() === 0) {
    creep.memory.state = 'delivering';
  }
  if (creep.store.getUsedCapacity() === 0) {
    creep.memory.state = 'hauling';
  }

  if (creep.memory.state === 'hauling') {
    doPickup(creep);
  } else {
    doDeliver(creep, ctx);
  }
}

/**
 * Pickup from container or ground near assigned source.
 */
function doPickup(creep: Creep): void {
  if (!creep.memory.sourceId) return;

  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) return;

  // Try container first
  const container = findContainerNearSource(source);
  if (container && container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(container, { reusePath: 5 });
    }
    return;
  }

  // Fallback: pickup from ground
  const dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
    filter: r => r.resourceType === RESOURCE_ENERGY
  })[0];

  if (dropped) {
    if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
      creep.moveTo(dropped, { reusePath: 5 });
    }
    return;
  }

  // Nothing to pickup - move near source to wait
  if (!creep.pos.inRangeTo(source, 2)) {
    creep.moveTo(source, { reusePath: 5, range: 2 });
  }
}

/**
 * Deliver to spawn/extensions → upgrade.
 */
function doDeliver(creep: Creep, ctx: HaulerContext): void {
  const { spawn, controller } = ctx;

  // Priority 1: Fill spawn
  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(spawn, { reusePath: 5 });
    }
    return;
  }

  // Priority 2: Fill extensions
  const extension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureExtension =>
      s.structureType === STRUCTURE_EXTENSION &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });

  if (extension) {
    if (creep.transfer(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.moveTo(extension, { reusePath: 5 });
    }
    return;
  }

  // Priority 3: Upgrade controller
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller, { reusePath: 5, range: 3 });
  }
}

/**
 * Find container near a source.
 */
function findContainerNearSource(source: Source): StructureContainer | null {
  const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
    filter: s => s.structureType === STRUCTURE_CONTAINER
  }) as StructureContainer[];
  return containers[0] || null;
}
