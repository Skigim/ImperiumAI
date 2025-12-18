import { findAssignedPosition, assignPosition, findNeedySpawn, findNeedyExtension } from '../utils/positions';

/**
 * Run worker role logic.
 * States: harvesting → delivering → harvesting
 */
export function runWorker(creep: Creep): void {
  // State transition: empty → harvesting
  if (creep.memory.state === 'delivering' && creep.store.getUsedCapacity() === 0) {
    creep.memory.state = 'harvesting';
    delete creep.memory.deliveryTarget;
  }

  // State transition: full → delivering (with target lock)
  if (creep.memory.state === 'harvesting' && creep.store.getFreeCapacity() === 0) {
    creep.memory.state = 'delivering';
    creep.memory.deliveryTarget = selectDeliveryTarget(creep);
  }

  // Execute current state
  if (creep.memory.state === 'harvesting') {
    runHarvesting(creep);
  } else {
    runDelivering(creep);
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
    creep.moveTo(assignedPos, { reusePath: 50 });
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

  // Move to target and transfer
  if (creep.pos.isNearTo(target)) {
    const result = creep.transfer(target, RESOURCE_ENERGY);
    
    // Target full - pick next priority (stay in delivering state)
    if (result === ERR_FULL) {
      creep.memory.deliveryTarget = selectNextDeliveryTarget(creep.memory.deliveryTarget!);
    }
  } else {
    creep.moveTo(target, { reusePath: 50 });
  }
}

/**
 * Select initial delivery target based on priority.
 * Priority: needy spawn → extension → controller
 */
function selectDeliveryTarget(creep: Creep): 'spawn' | 'extension' | 'controller' {
  if (findNeedySpawn(creep.room)) {
    return 'spawn';
  }
  if (findNeedyExtension(creep.room)) {
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
