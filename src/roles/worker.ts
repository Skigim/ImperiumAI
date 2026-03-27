import { moveTo } from '../lib/trafficManager';

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
 * Run worker behavior for one tick.
 */
export function runWorker(creep: Creep, ctx: WorkerContext): void {
  
  // 1. STATE UPDATES
  // Switch to delivery when full
  if (creep.memory.harvesting && creep.store.getFreeCapacity() === 0) {
    creep.memory.harvesting = false;
    delete creep.memory.transferTargetId; // Clear target to find a fresh one
    creep.say('🚚 Deliver');
  }
  
  // Switch to harvesting when empty
  if (!creep.memory.harvesting && creep.store[RESOURCE_ENERGY] === 0) {
    creep.memory.harvesting = true;
    creep.say('🔄 Harvest');
  }

  // 2. STATE EXECUTION
  if (creep.memory.harvesting) {
    // --- HARVESTING ---
    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source) {
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        // Use your library instead of native creep.moveTo
        moveTo(creep, source.pos);
      }
    }
  } else {
    // --- DELIVERING ---
    let target: StructureExtension | StructureSpawn | null = null;

    // A. Check cached target
    if (creep.memory.transferTargetId) {
      target = Game.getObjectById(creep.memory.transferTargetId);
      if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        target = null;
        delete creep.memory.transferTargetId;
      }
    }

    // B. If no cache, find a new target
    if (!target) {
      target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (s) => (s.structureType === STRUCTURE_EXTENSION || 
                        s.structureType === STRUCTURE_SPAWN) &&
                       s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      }) as StructureExtension | StructureSpawn | null;

      if (target) {
        creep.memory.transferTargetId = target.id;
      }
    }

    // C. Action
    if (target) {
      if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveTo(creep, target.pos);
      }
    } else {
      // FALLBACK: Use context-provided controller if no delivery targets found
      if (ctx.controller) {
        if (creep.upgradeController(ctx.controller) === ERR_NOT_IN_RANGE) {
          moveTo(creep, ctx.controller.pos);
        }
      }
    }
  }
}