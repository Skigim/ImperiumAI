import { NEEDY_SPAWN_THRESHOLD } from '../types';
import { getSources, getSpawns, getExtensions, getCostMatrix } from './cache';

/**
 * Initialize static room data (mining positions) in Memory.
 * Called once when room is first processed.
 */
function initializeRoomStaticData(room: Room): void {
  if (!Memory.rooms[room.name]) {
    Memory.rooms[room.name] = {};
  }
  
  const roomMem = Memory.rooms[room.name];
  
  // Already initialized
  if (roomMem.miningPositions && roomMem.miningPositionCount !== undefined) {
    return;
  }
  
  const sources = getSources(room);
  const terrain = room.getTerrain();
  
  roomMem.miningPositions = {};
  let totalCount = 0;
  
  for (const source of sources) {
    const positions: { x: number; y: number }[] = [];
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        
        const x = source.pos.x + dx;
        const y = source.pos.y + dy;
        
        if (x < 0 || x > 49 || y < 0 || y > 49) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        
        positions.push({ x, y });
      }
    }
    
    roomMem.miningPositions[source.id] = positions;
    totalCount += positions.length;
  }
  
  roomMem.miningPositionCount = totalCount;
}

/**
 * Count total walkable mining positions across all sources in a room.
 * Uses cached static data from Memory.
 */
export function countMiningPositions(room: Room): number {
  initializeRoomStaticData(room);
  return Memory.rooms[room.name].miningPositionCount ?? 0;
}

/**
 * Find an unassigned walkable position at range 1 of a valid source.
 * Uses static data from Memory for positions.
 */
export function findAssignedPosition(room: Room): { pos: RoomPosition; sourceId: Id<Source> } | null {
  initializeRoomStaticData(room);
  
  // Initialize room memory if needed
  if (!Memory.rooms[room.name].assignedPositions) {
    Memory.rooms[room.name].assignedPositions = {};
  }

  const assignedPositions = Memory.rooms[room.name].assignedPositions!;
  const miningPositions = Memory.rooms[room.name].miningPositions!;

  for (const sourceId in miningPositions) {
    const positions = miningPositions[sourceId];
    
    for (const pos of positions) {
      const posKey = `${pos.x},${pos.y}`;
      
      // Check if position is unassigned
      if (!assignedPositions[posKey]) {
        return { 
          pos: new RoomPosition(pos.x, pos.y, room.name), 
          sourceId: sourceId as Id<Source> 
        };
      }
    }
  }

  return null;
}

/**
 * Get walkable (non-wall) positions at range 1 of source.
 * @deprecated Use static data from Memory instead via initializeRoomStaticData
 */
export function sourcePos(room: Room, source: Source): RoomPosition[] {
  initializeRoomStaticData(room);
  
  const miningPositions = Memory.rooms[room.name].miningPositions;
  const positions = miningPositions?.[source.id] ?? [];
  
  return positions.map((p) => new RoomPosition(p.x, p.y, room.name));
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
 * Uses cached spawn list.
 */
export function findNeedySpawn(room: Room): StructureSpawn | null {
  const spawns = getSpawns(room);
  
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
 * Uses cached extension list.
 */
export function findNeedyExtension(room: Room): StructureExtension | null {
  const extensions = getExtensions(room);
  
  for (const ext of extensions) {
    if (ext.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      return ext;
    }
  }
  
  return null;
}

/**
 * Get a CostMatrix that marks assigned mining positions as impassable.
 * Excludes the creep's own assigned position so they can path to it.
 * Uses cached cost matrix.
 */
export function getAssignedPositionsCostMatrix(roomName: string, excludeCreepName?: string): CostMatrix {
  return getCostMatrix(roomName, excludeCreepName);
}
