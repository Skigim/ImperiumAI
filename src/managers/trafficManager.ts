import { getSpawns, getExtensions } from '../utils/cache';

/**
 * Check if creep is actively working (and expected to be stationary).
 */
function isCreepWorking(creep: Creep): boolean {
  // Harvesting at assigned position
  if (creep.memory.state === 'harvesting' && creep.memory.assignedPos) {
    const assignedPos = creep.memory.assignedPos;
    if (creep.pos.x === assignedPos.x && creep.pos.y === assignedPos.y) {
      return true;
    }
  }

  // Delivering to a target
  if (creep.memory.state === 'delivering') {
    switch (creep.memory.deliveryTarget) {
      case 'spawn': {
        const spawns = getSpawns(creep.room);
        if (spawns.length > 0 && creep.pos.isNearTo(spawns[0])) {
          return true;
        }
        break;
      }
      case 'extension': {
        const extensions = getExtensions(creep.room);
        for (const ext of extensions) {
          if (creep.pos.isNearTo(ext) && ext.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return true;
          }
        }
        break;
      }
      case 'controller': {
        const controller = creep.room.controller;
        if (controller && creep.pos.inRangeTo(controller, 3)) {
          return true;
        }
        break;
      }
    }
  }

  return false;
}

/**
 * Lightweight traffic manager - just tracks working state.
 * Stuck detection is now handled by the movement system (moveToTarget).
 */
export function runTrafficManager(creep: Creep): void {
  // Reset stuck count when creep is working (stationary by design)
  if (isCreepWorking(creep)) {
    creep.memory.stuckCount = 0;
  }
  // Movement system handles stuck detection via _stuck in creep memory
}
