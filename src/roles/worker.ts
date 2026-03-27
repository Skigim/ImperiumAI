/**
 * Role Behavior: Worker
 * * Generic worker that harvests and delivers energy.
 * Uses cached paths and targets for CPU efficiency.
 */

export interface WorkerContext {
  spawn: StructureSpawn;
  controller: StructureController;
  extensionSites: ConstructionSite[];
  needsUpgrade: boolean;
  isFullyStaffed: boolean;
}

// Extend the CreepMemory to support our logic
declare global {
  interface CreepMemory {
    role: string;
    harvesting: boolean;
    transferTargetId?: Id<StructureExtension | StructureSpawn>;
    // The underscore marks this as a "mechanical" helper variable
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
  // 1. STATE MANAGEMENT
  // Switch to delivery when backpack is full
  if (creep.memory.harvesting && creep.store.getFreeCapacity() === 0) {
    creep.memory.harvesting = false;
    delete creep.memory.transferTargetId; // Reset target to find the best delivery point
    creep.say("🚚 Deliver");
  }

  // Switch to harvesting when empty
  if (!creep.memory.harvesting && creep.store[RESOURCE_ENERGY] === 0) {
    creep.memory.harvesting = true;
    creep.say("🔄 Harvest");
  }

  // 2. EXECUTE STATE
  if (creep.memory.harvesting) {
    // --- HARVESTING ---
    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source) {
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, {
          reusePath: 20,
          visualizePathStyle: { stroke: "#ffaa00" },
        });
      }
    }
  } else {
    // --- DELIVERING ---
    let target: StructureExtension | StructureSpawn | null = null;

    // A. Check for a valid cached target
    if (creep.memory.transferTargetId) {
      target = Game.getObjectById(creep.memory.transferTargetId);

      // Clear cache if the structure is full or gone
      if (!target || target.store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
        target = null;
        delete creep.memory.transferTargetId;
      }
    }

    // B. If no cached target, find the closest priority structure (Extension/Spawn)
    if (!target) {
      const newTarget = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (s) => {
          return (
            (s.structureType === STRUCTURE_EXTENSION ||
              s.structureType === STRUCTURE_SPAWN) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
          );
        },
      }) as StructureExtension | StructureSpawn | null;

      if (newTarget) {
        target = newTarget;
        creep.memory.transferTargetId = newTarget.id;
      }
    }

    // C. Perform the action
    if (target) {
      if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(target, {
          reusePath: 20,
          visualizePathStyle: { stroke: "#ffffff" },
        });
      }
    } else {
      // FALLBACK: Use the provided context to find the controller if the base is full
      if (ctx.controller) {
        if (creep.upgradeController(ctx.controller) === ERR_NOT_IN_RANGE) {
          creep.moveTo(ctx.controller, {
            reusePath: 20,
            visualizePathStyle: { stroke: "#0000ff" },
          });
        }
      }
    }
  }
}
