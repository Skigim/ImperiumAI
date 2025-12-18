import { STUCK_THRESHOLD } from '../types';

/**
 * Check if creep is stuck and handle path invalidation.
 * Stuck = same position for 3+ ticks while not harvesting and fatigue is 0.
 */
export function runTrafficManager(creep: Creep): void {
  const currentPos = { x: creep.pos.x, y: creep.pos.y };

  // Skip if harvesting (expected to stay in place)
  if (creep.memory.state === 'harvesting' && creep.memory.assignedPos) {
    const assignedPos = creep.memory.assignedPos;
    if (creep.pos.x === assignedPos.x && creep.pos.y === assignedPos.y) {
      // At assigned position, not stuck
      creep.memory.stuckCount = 0;
      creep.memory.lastPos = currentPos;
      return;
    }
  }

  // Skip if fatigued (can't move anyway)
  if (creep.fatigue > 0) {
    creep.memory.lastPos = currentPos;
    return;
  }

  // Check if position changed
  if (creep.memory.lastPos) {
    const lastPos = creep.memory.lastPos;
    
    if (currentPos.x === lastPos.x && currentPos.y === lastPos.y) {
      // Same position - increment stuck counter
      creep.memory.stuckCount = (creep.memory.stuckCount || 0) + 1;

      // Stuck threshold reached - invalidate path
      if (creep.memory.stuckCount >= STUCK_THRESHOLD) {
        // Force re-path by moving with reusePath: 0
        forceRepath(creep);
        creep.memory.stuckCount = 0;
      }
    } else {
      // Position changed - reset counter
      creep.memory.stuckCount = 0;
    }
  }

  // Update last position
  creep.memory.lastPos = currentPos;
}

/**
 * Force a new path calculation by moving with no path reuse.
 */
function forceRepath(creep: Creep): void {
  // Get current movement target based on state
  let target: RoomPosition | null = null;

  if (creep.memory.state === 'harvesting' && creep.memory.assignedPos) {
    target = new RoomPosition(
      creep.memory.assignedPos.x,
      creep.memory.assignedPos.y,
      creep.memory.assignedPos.roomName
    );
  } else if (creep.memory.state === 'delivering') {
    target = getDeliveryTargetPos(creep);
  }

  if (target) {
    // Move with fresh path calculation
    creep.moveTo(target, { reusePath: 0 });
    console.log(`${creep.name} was stuck, recalculating path`);
  }
}

/**
 * Get the position of current delivery target.
 */
function getDeliveryTargetPos(creep: Creep): RoomPosition | null {
  const room = creep.room;

  switch (creep.memory.deliveryTarget) {
    case 'spawn': {
      const spawns = room.find(FIND_MY_SPAWNS);
      return spawns.length > 0 ? spawns[0].pos : null;
    }
    case 'extension': {
      const extensions = room.find(FIND_MY_STRUCTURES, {
        filter: (s): s is StructureExtension =>
          s.structureType === STRUCTURE_EXTENSION &&
          s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      });
      return extensions.length > 0 ? extensions[0].pos : null;
    }
    case 'controller':
      return room.controller?.pos ?? null;
    default:
      return null;
  }
}
