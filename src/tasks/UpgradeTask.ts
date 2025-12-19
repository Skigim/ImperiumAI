import { TaskResult, TaskStatus } from './Task';
import { getMyCreepsInRoom } from '../utils/cache';
import { moveToTarget } from '../utils/movement';

/**
 * Initialize upgrade positions in Memory (static data).
 */
function initializeUpgradePositions(room: Room): void {
  if (!Memory.rooms[room.name]) {
    Memory.rooms[room.name] = {};
  }
  
  // Already initialized
  if (Memory.rooms[room.name].upgradePositions) {
    return;
  }
  
  const controller = room.controller;
  if (!controller) return;
  
  const terrain = room.getTerrain();
  const positions: { x: number; y: number }[] = [];
  
  // Get all walkable positions at range 3
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      // Only exact range 3 (Chebyshev distance)
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 3) continue;
      
      const x = controller.pos.x + dx;
      const y = controller.pos.y + dy;
      
      // Bounds check
      if (x < 1 || x > 48 || y < 1 || y > 48) continue;
      
      // Terrain check
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
      
      positions.push({ x, y });
    }
  }
  
  Memory.rooms[room.name].upgradePositions = positions;
}

/**
 * UpgradeTask: Move to controller and upgrade until empty.
 * 
 * Behavior:
 * 1. Find available position at range 3 of controller
 * 2. Move to that position
 * 3. Upgrade controller until energy is empty
 * 4. Return COMPLETE when empty
 */
export const UpgradeTask = {
  type: 'upgrade' as const,

  run(creep: Creep): TaskResult {
    return runUpgradeTask(creep);
  },
};

/**
 * Run the upgrade task for a creep.
 * Can be called directly or through the UpgradeTask object.
 */
export function runUpgradeTask(creep: Creep): TaskResult {
  const controller = creep.room.controller;

  // No controller in room
  if (!controller) {
    return {
      status: TaskStatus.FAILED,
      message: 'No controller in room',
    };
  }

  // Not our controller
  if (!controller.my) {
    return {
      status: TaskStatus.FAILED,
      message: 'Controller not owned',
    };
  }

  // Task complete when empty
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    return {
      status: TaskStatus.COMPLETE,
      message: 'Energy depleted',
    };
  }

  // Already in range - upgrade
  if (creep.pos.inRangeTo(controller, 3)) {
    const result = creep.upgradeController(controller);
    
    if (result === OK) {
      return {
        status: TaskStatus.IN_PROGRESS,
        message: 'Upgrading',
      };
    } else {
      return {
        status: TaskStatus.FAILED,
        message: `Upgrade failed: ${result}`,
      };
    }
  }

  // Not in range - find position and move
  const targetPos = findUpgradePosition(creep, controller);
  
  if (!targetPos) {
    // No open spots - just get as close as possible
    moveToTarget(creep, controller.pos, 3);
    return {
      status: TaskStatus.IN_PROGRESS,
      message: 'Moving to controller (no open position)',
    };
  }

  moveToTarget(creep, targetPos, 0);

  return {
    status: TaskStatus.IN_PROGRESS,
    message: 'Moving to upgrade position',
  };
}

/**
 * Find an available position at range 3 of controller.
 * Uses cached positions from Memory. Avoids positions occupied by other creeps.
 */
function findUpgradePosition(creep: Creep, controller: StructureController): RoomPosition | null {
  const room = creep.room;
  
  // Initialize upgrade positions if needed
  initializeUpgradePositions(room);
  
  const positions = Memory.rooms[room.name].upgradePositions ?? [];

  // Get creeps near controller (cached)
  const roomCreeps = getMyCreepsInRoom(room);
  const occupiedPositions = new Set(
    roomCreeps
      .filter((c) => c.name !== creep.name && c.pos.inRangeTo(controller, 4))
      .map((c) => `${c.pos.x},${c.pos.y}`)
  );

  for (const pos of positions) {
    const posKey = `${pos.x},${pos.y}`;
    if (!occupiedPositions.has(posKey)) {
      return new RoomPosition(pos.x, pos.y, room.name);
    }
  }

  // All positions occupied
  return null;
}
