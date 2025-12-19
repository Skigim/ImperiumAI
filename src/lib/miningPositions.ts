/**
 * Mining Position Utilities
 * 
 * Stateless functions for managing mining positions around sources.
 * Used by multiple processes to coordinate creep placement.
 */

/**
 * Count available mining positions around all sources in a room.
 * Caches result in room memory for efficiency.
 */
export function countMiningPositions(room: Room): number {
  // Return cached value if available
  if (room.memory.miningPositionCount !== undefined) {
    return room.memory.miningPositionCount;
  }

  const sources = room.find(FIND_SOURCES);
  const terrain = room.getTerrain();
  let count = 0;

  for (const source of sources) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = source.pos.x + dx;
        const y = source.pos.y + dy;
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          count++;
        }
      }
    }
  }

  room.memory.miningPositionCount = count;
  return count;
}

/**
 * Find an unassigned mining position and reserve it for a creep.
 * Initializes room memory structures if needed.
 * 
 * @param room - The room to find a position in
 * @param creepName - Name of the creep claiming the position
 * @param preferredSource - Optional source to prioritize
 * @returns Position and source ID, or null if none available
 */
export function findAndAssignMiningPosition(
  room: Room,
  creepName: string,
  preferredSource: Source | null = null
): {
  pos: { x: number; y: number; roomName: string };
  sourceId: Id<Source>;
} | null {
  // Initialize room memory
  if (!Memory.rooms[room.name]) {
    Memory.rooms[room.name] = {};
  }
  if (!Memory.rooms[room.name].assignedPositions) {
    Memory.rooms[room.name].assignedPositions = {};
  }

  const assigned = Memory.rooms[room.name].assignedPositions!;
  const terrain = room.getTerrain();

  // Use preferred source or all sources
  const sources = preferredSource ? [preferredSource] : room.find(FIND_SOURCES);

  for (const source of sources) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = source.pos.x + dx;
        const y = source.pos.y + dy;

        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

        const posKey = `${x},${y}`;
        if (!assigned[posKey]) {
          // Claim this position
          assigned[posKey] = creepName;
          console.log(`[Mining] ${creepName} claimed position (${x}, ${y}) in ${room.name}`);
          return {
            pos: { x, y, roomName: room.name },
            sourceId: source.id,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Release a creep's mining position so others can claim it.
 * Called on creep death via main.ts cleanup.
 */
export function releaseMiningPosition(creep: Creep): void {
  if (creep.memory.assignedPos) {
    const posKey = `${creep.memory.assignedPos.x},${creep.memory.assignedPos.y}`;
    const assigned = Memory.rooms[creep.memory.assignedPos.roomName]?.assignedPositions;
    if (assigned && assigned[posKey] === creep.name) {
      delete assigned[posKey];
    }
    delete creep.memory.assignedPos;
  }
}
