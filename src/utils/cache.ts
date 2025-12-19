/**
 * Room cache for per-tick data.
 * Cleared at the start of each tick.
 */
interface RoomTickCache {
  tick: number;
  spawns?: StructureSpawn[];
  extensions?: StructureExtension[];
  sources?: Source[];
  myCreeps?: Creep[];
  workerCount?: number;
  costMatrix?: CostMatrix;
}

/**
 * Global tick cache - keyed by room name.
 */
const tickCache: Map<string, RoomTickCache> = new Map();

/**
 * Get or create cache for a room, clearing if stale.
 */
function getRoomCache(roomName: string): RoomTickCache {
  let cache = tickCache.get(roomName);
  
  if (!cache || cache.tick !== Game.time) {
    cache = { tick: Game.time };
    tickCache.set(roomName, cache);
  }
  
  return cache;
}

/**
 * Get spawns for a room (cached per-tick).
 */
export function getSpawns(room: Room): StructureSpawn[] {
  const cache = getRoomCache(room.name);
  
  if (!cache.spawns) {
    cache.spawns = room.find(FIND_MY_SPAWNS);
  }
  
  return cache.spawns;
}

/**
 * Get extensions for a room (cached per-tick).
 */
export function getExtensions(room: Room): StructureExtension[] {
  const cache = getRoomCache(room.name);
  
  if (!cache.extensions) {
    cache.extensions = room.find(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureExtension => s.structureType === STRUCTURE_EXTENSION,
    });
  }
  
  return cache.extensions;
}

/**
 * Get sources for a room (cached per-tick).
 */
export function getSources(room: Room): Source[] {
  const cache = getRoomCache(room.name);
  
  if (!cache.sources) {
    cache.sources = room.find(FIND_SOURCES);
  }
  
  return cache.sources;
}

/**
 * Get my creeps in a room (cached per-tick).
 */
export function getMyCreepsInRoom(room: Room): Creep[] {
  const cache = getRoomCache(room.name);
  
  if (!cache.myCreeps) {
    cache.myCreeps = room.find(FIND_MY_CREEPS);
  }
  
  return cache.myCreeps;
}

/**
 * Get worker count in a room (cached per-tick).
 */
export function getWorkerCount(room: Room): number {
  const cache = getRoomCache(room.name);
  
  if (cache.workerCount === undefined) {
    cache.workerCount = getMyCreepsInRoom(room).filter(
      (c) => c.memory.role === 'worker'
    ).length;
  }
  
  return cache.workerCount;
}

/**
 * Get base cost matrix for pathfinding (cached per-tick).
 * Marks structures as walkable/unwalkable. Does NOT mark creeps.
 */
export function getBaseCostMatrix(room: Room): CostMatrix {
  const cache = getRoomCache(room.name);
  
  if (!cache.costMatrix) {
    const costs = new PathFinder.CostMatrix();
    
    // Mark structures - only do this once per tick
    const structures = room.find(FIND_STRUCTURES);
    for (const struct of structures) {
      if (struct.structureType === STRUCTURE_ROAD) {
        // Roads are cheaper
        costs.set(struct.pos.x, struct.pos.y, 1);
      } else if (
        struct.structureType !== STRUCTURE_CONTAINER &&
        (struct.structureType !== STRUCTURE_RAMPART || !(struct as StructureRampart).my)
      ) {
        // Block non-walkable structures
        costs.set(struct.pos.x, struct.pos.y, 255);
      }
    }
    
    // Mark construction sites (non-walkable types only)
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    for (const site of sites) {
      if (site.structureType !== STRUCTURE_ROAD && site.structureType !== STRUCTURE_CONTAINER) {
        costs.set(site.pos.x, site.pos.y, 255);
      }
    }
    
    cache.costMatrix = costs;
  }
  
  return cache.costMatrix;
}

/**
 * Get cost matrix for a room (cached per-tick).
 * @deprecated Use getBaseCostMatrix instead
 */
export function getCostMatrix(roomName: string, excludeCreepName?: string): CostMatrix {
  const cache = getRoomCache(roomName);
  
  // Base matrix cached, but we need to handle exclusions
  // For simplicity, cache the base matrix and modify for exclusions
  if (!cache.costMatrix) {
    cache.costMatrix = buildBaseCostMatrix(roomName);
  }
  
  // If no exclusion needed, return cached matrix
  if (!excludeCreepName) {
    return cache.costMatrix;
  }
  
  // Clone and modify for this creep's exclusion
  const matrix = cache.costMatrix.clone();
  const creepMemory = Memory.creeps[excludeCreepName];
  
  if (creepMemory?.assignedPos) {
    const pos = creepMemory.assignedPos;
    matrix.set(pos.x, pos.y, 0); // Clear our own position
  }
  
  return matrix;
}

/**
 * Build base cost matrix with all assigned positions blocked.
 */
function buildBaseCostMatrix(roomName: string): CostMatrix {
  const costs = new PathFinder.CostMatrix();
  const assignedPositions = Memory.rooms[roomName]?.assignedPositions;
  
  if (!assignedPositions) {
    return costs;
  }
  
  for (const posKey in assignedPositions) {
    const [x, y] = posKey.split(',').map(Number);
    costs.set(x, y, 255);
  }
  
  return costs;
}
