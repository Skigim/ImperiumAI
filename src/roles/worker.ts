import { moveTo } from "../lib/trafficManager";

/**
 * Role Behavior: Worker
 * * Generic worker that harvests and delivers energy.
 * Offloads movement logic to the trafficManager utility.
 */

export interface WorkerContext {
  spawn: StructureSpawn;
  controller: StructureController;
  extensionSites: ConstructionSite[];
  needsUpgrade: boolean;
  isFullyStaffed: boolean;
}

declare global {
  interface CreepMemory {
    role: string;
    harvesting: boolean;
    transferTargetId?: Id<StructureExtension | StructureSpawn>;
    // Mechanical property for traffic management
    _lastPos?: {
      x: number;
      y: number;
      roomName: string;
    };
  }
}

/**
 * Update worker state based on energy levels.
 */
function updateWorkerState(creep: Creep): void {
  // Switch to delivery when full
  if (creep.memory.harvesting && creep.store.getFreeCapacity() === 0) {
    creep.memory.harvesting = false;
    delete creep.memory.transferTargetId;
    creep.say("🚚 Deliver");
  }

  // Switch to harvesting when empty
  if (!creep.memory.harvesting && creep.store[RESOURCE_ENERGY] === 0) {
    creep.memory.harvesting = true;
    creep.say("🔄 Harvest");
  }
}

/**
 * Execute harvesting behavior.
 */
function executeHarvesting(creep: Creep): void {
  const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
  if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
    moveTo(creep, source.pos);
  }
}

/**
 * Find or retrieve a valid delivery target.
 */
function findDeliveryTarget(
  creep: Creep,
): StructureExtension | StructureSpawn | null {
  // Check cached target
  if (creep.memory.transferTargetId) {
    const target = Game.getObjectById(creep.memory.transferTargetId);
    if (target && target.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      return target;
    }
    delete creep.memory.transferTargetId;
  }

  // Find new target
  const target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
    filter: (
      s,
    ): s is StructureExtension | StructureSpawn =>
      (s.structureType === STRUCTURE_EXTENSION ||
        s.structureType === STRUCTURE_SPAWN) &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });

  if (target) {
    creep.memory.transferTargetId = target.id;
  }
  return target;
}

/**
 * Execute delivering behavior.
 */
function executeDelivering(creep: Creep, ctx: WorkerContext): void {
  const target = findDeliveryTarget(creep);

  if (target) {
    if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      moveTo(creep, target.pos);
    }
  } else if (ctx.controller) {
    if (creep.upgradeController(ctx.controller) === ERR_NOT_IN_RANGE) {
      moveTo(creep, ctx.controller.pos);
    }
  }
}

/**
 * Run worker behavior for one tick.
 */
export function runWorker(creep: Creep, ctx: WorkerContext): void {
  updateWorkerState(creep);

  if (creep.memory.harvesting) {
    executeHarvesting(creep);
  } else {
    executeDelivering(creep, ctx);
  }
}
