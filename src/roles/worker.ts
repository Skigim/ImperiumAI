import { findAssignedPosition, assignPosition, findNeedySpawn, findNeedyExtension, countMiningPositions } from '../utils/positions';
import { getSpawns, getWorkerCount } from '../utils/cache';
import { runUpgradeTask, TaskStatus } from '../tasks';
import { moveToTarget, clearMovementCache } from '../utils/movement';

// Temporary profiling
let workerProfilingEnabled = true;

/**
 * Run worker role logic.
 * States: harvesting → delivering → harvesting
 */
export function runWorker(creep: Creep): void {
  const startCpu = Game.cpu.getUsed();

  // State transition: empty → harvesting
  if (creep.memory.state === 'delivering' && creep.store.getUsedCapacity() === 0) {
    creep.memory.state = 'harvesting';
    delete creep.memory.deliveryTarget;
    clearMovementCache(creep); // Clear path when changing states
  }

  // State transition: full → delivering (with target lock)
  if (creep.memory.state === 'harvesting' && creep.store.getFreeCapacity() === 0) {
    creep.memory.state = 'delivering';
    creep.memory.deliveryTarget = selectDeliveryTarget(creep);
    clearMovementCache(creep); // Clear path when changing states
  }

  // Execute current state
  if (creep.memory.state === 'harvesting') {
    runHarvesting(creep);
  } else {
    runDelivering(creep);
  }

  // Profile individual creeps
  if (workerProfilingEnabled) {
    const totalCpu = Game.cpu.getUsed() - startCpu;
    if (totalCpu > 0.3) {
      console.log(`[Worker] ${creep.name} state=${creep.memory.state} cpu=${totalCpu.toFixed(2)}`);
    }
  }
}

/**
 * Harvesting state: move to assigned position and harvest.
 */
function runHarvesting(creep: Creep): void {
  // Assign position if none
  if (!creep.memory.assignedPos) {
    const result = findAssignedPosition(creep.room);
    if (!result) {
      // No available positions - wait
      return;
    }
    
    creep.memory.assignedPos = {
      x: result.pos.x,
      y: result.pos.y,
      roomName: result.pos.roomName
    };
    creep.memory.sourceId = result.sourceId;
    assignPosition(creep.room.name, result.pos, creep.name);
  }

  const assignedPos = new RoomPosition(
    creep.memory.assignedPos.x,
    creep.memory.assignedPos.y,
    creep.memory.assignedPos.roomName
  );

  // Move to assigned position
  if (!creep.pos.isEqualTo(assignedPos)) {
    moveToTarget(creep, assignedPos, 0);
    return;
  }

  // At position - harvest
  if (creep.memory.sourceId) {
    const source = Game.getObjectById(creep.memory.sourceId);
    if (source) {
      creep.harvest(source);
    }
  }
}

/**
 * Delivering state: move to target and transfer energy.
 */
function runDelivering(creep: Creep): void {
  const target = getDeliveryTarget(creep);
  
  if (!target) {
    // Re-select target if current one is invalid
    creep.memory.deliveryTarget = selectDeliveryTarget(creep);
    return;
  }

  // Controller uses upgradeController at range 3 via task
  if (creep.memory.deliveryTarget === 'controller') {
    runUpgradeTask(creep);
    // Task handles everything - movement, positioning, upgrading
    // When complete (empty), the state transition at top of runWorker will switch to harvesting
    return;
  }

  // Spawn/extension use transfer at range 1
  if (creep.pos.isNearTo(target)) {
    const result = creep.transfer(target, RESOURCE_ENERGY);
    
    // Target full - pick next priority (stay in delivering state)
    if (result === ERR_FULL) {
      creep.memory.deliveryTarget = selectNextDeliveryTarget(creep.memory.deliveryTarget!);
      clearMovementCache(creep); // Clear path when target changes
    }
  } else {
    moveToTarget(creep, target.pos, 1);
  }
}

/**
 * Select initial delivery target based on priority.
 * - If room not fully staffed: prioritize spawn (keep spawning workers)
 * - If fully staffed: use needy spawn threshold, then extensions, then controller
 */
function selectDeliveryTarget(creep: Creep): 'spawn' | 'extension' | 'controller' {
  const room = creep.room;
  const spawns = getSpawns(room);
  const spawn = spawns[0];
  
  if (spawn) {
    // Count current workers vs available mining positions (cached)
    const workerCount = getWorkerCount(room);
    const maxWorkers = countMiningPositions(room);
    const fullyStaffed = workerCount >= maxWorkers;

    if (!fullyStaffed) {
      // Not fully staffed - always fill spawn to keep spawning
      if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        return 'spawn';
      }
    } else {
      // Fully staffed - only fill spawn if needy (below threshold)
      if (findNeedySpawn(room)) {
        return 'spawn';
      }
    }
  }

  if (findNeedyExtension(room)) {
    return 'extension';
  }
  return 'controller';
}

/**
 * Get next delivery target in priority chain.
 */
function selectNextDeliveryTarget(current: 'spawn' | 'extension' | 'controller'): 'spawn' | 'extension' | 'controller' {
  switch (current) {
    case 'spawn':
      return 'extension';
    case 'extension':
      return 'controller';
    case 'controller':
      return 'controller'; // Stay on controller
  }
}

/**
 * Get the actual game object for the delivery target.
 */
function getDeliveryTarget(creep: Creep): StructureSpawn | StructureExtension | StructureController | null {
  switch (creep.memory.deliveryTarget) {
    case 'spawn':
      return findNeedySpawn(creep.room);
    case 'extension':
      return findNeedyExtension(creep.room);
    case 'controller':
      return creep.room.controller ?? null;
    default:
      return null;
  }
}
