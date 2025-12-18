import { NEEDY_SPAWN_THRESHOLD } from '../types';

/**
 * Find an unassigned walkable position at range 1 of a valid source.
 * Valid source = source with less than 2 creeps assigned.
 */
export function findAssignedPosition(room: Room): { pos: RoomPosition; sourceId: Id<Source> } | null {
  const sources = room.find(FIND_SOURCES);
  
  // Initialize room memory if needed
  if (!Memory.rooms[room.name]) {
    Memory.rooms[room.name] = {};
  }
  if (!Memory.rooms[room.name].assignedPositions) {
    Memory.rooms[room.name].assignedPositions = {};
  }

  const assignedPositions = Memory.rooms[room.name].assignedPositions!;

  for (const source of sources) {
    // Get all walkable positions at range 1
    const positions = getWalkablePositionsAroundSource(room, source);
    
    for (const pos of positions) {
      const posKey = `${pos.x},${pos.y}`;
      
      // Check if position is unassigned
      if (!assignedPositions[posKey]) {
        return { pos, sourceId: source.id };
      }
    }
  }

  return null;
}

/**
 * Get walkable (non-wall, non-structure) positions at range 1 of source.
 */
function getWalkablePositionsAroundSource(room: Room, source: Source): RoomPosition[] {
  const positions: RoomPosition[] = [];
  const terrain = room.getTerrain();

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;

      const x = source.pos.x + dx;
      const y = source.pos.y + dy;

      // Bounds check
      if (x < 0 || x > 49 || y < 0 || y > 49) continue;

      // Terrain check - not a wall
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

      positions.push(new RoomPosition(x, y, room.name));
    }
  }

  return positions;
}

/**
 * Assign a position to a creep in room memory.
 */
export function assignPosition(roomName: string, pos: RoomPosition, creepName: string): void {
  if (!Memory.rooms[roomName]) {
    Memory.rooms[roomName] = {};
  }
  if (!Memory.rooms[roomName].assignedPositions) {
    Memory.rooms[roomName].assignedPositions = {};
  }

  const posKey = `${pos.x},${pos.y}`;
  Memory.rooms[roomName].assignedPositions![posKey] = creepName;
}

/**
 * Release a position when creep dies.
 */
export function releasePosition(roomName: string, creepName: string): void {
  const assignedPositions = Memory.rooms[roomName]?.assignedPositions;
  if (!assignedPositions) return;

  for (const posKey in assignedPositions) {
    if (assignedPositions[posKey] === creepName) {
      delete assignedPositions[posKey];
      break;
    }
  }
}

/**
 * Find a spawn that needs energy (below 50% capacity).
 */
export function findNeedySpawn(room: Room): StructureSpawn | null {
  const spawns = room.find(FIND_MY_SPAWNS);
  
  for (const spawn of spawns) {
    const capacityRatio = spawn.store.getUsedCapacity(RESOURCE_ENERGY) / spawn.store.getCapacity(RESOURCE_ENERGY);
    if (capacityRatio < NEEDY_SPAWN_THRESHOLD) {
      return spawn;
    }
  }

  return null;
}

/**
 * Find an extension that needs energy.
 */
export function findNeedyExtension(room: Room): StructureExtension | null {
  const extensions = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureExtension =>
      s.structureType === STRUCTURE_EXTENSION &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });

  return extensions.length > 0 ? extensions[0] : null;
}
