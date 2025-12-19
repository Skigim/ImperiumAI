/**
 * Test Utilities for Screeps
 * 
 * Common mock factories and helper functions for testing
 * Screeps code. Uses screeps-jest for mocking.
 */

import { mockGlobal, mockInstanceOf, mockStructure } from 'screeps-jest';

/**
 * Create a mock room with common properties.
 * @param name - Room name (e.g., 'W1N1')
 * @param options - Override default properties
 */
export function mockRoom(
  name: string,
  options: {
    rcl?: number;
    energyAvailable?: number;
    energyCapacity?: number;
    sources?: Source[];
    spawns?: StructureSpawn[];
    controller?: Partial<StructureController>;
    terrain?: RoomTerrain;
  } = {}
): Room {
  const {
    rcl = 1,
    energyAvailable = 300,
    energyCapacity = 300,
    sources = [],
    spawns = [],
    controller = {},
    terrain,
  } = options;

  // Create default terrain mock if not provided
  const terrainMock = terrain ?? mockInstanceOf<RoomTerrain>({
    get: jest.fn((x: number, y: number) => 0), // 0 = plain
  });

  // Create controller mock
  const controllerMock = mockInstanceOf<StructureController>({
    id: `${name}-controller` as Id<StructureController>,
    level: rcl,
    my: true,
    progress: 0,
    progressTotal: 200,
    room: undefined as any, // Set later
    safeMode: undefined,
    safeModeAvailable: 0,
    safeModeCooldown: undefined,
    ...controller,
  });

  const room = mockInstanceOf<Room>({
    name,
    controller: controllerMock,
    energyAvailable,
    energyCapacityAvailable: energyCapacity,
    memory: {
      miningPositionCount: undefined,
      assignedPositions: undefined,
    } as RoomMemory,
    visual: mockInstanceOf<RoomVisual>({}, true),
    find: jest.fn((type: FindConstant) => {
      switch (type) {
        case FIND_SOURCES:
          return sources;
        case FIND_MY_SPAWNS:
          return spawns;
        case FIND_MY_CREEPS:
          return [];
        case FIND_CONSTRUCTION_SITES:
          return [];
        case FIND_STRUCTURES:
          return [...spawns];
        default:
          return [];
      }
    }),
    getTerrain: jest.fn(() => terrainMock),
    lookForAt: jest.fn(() => []),
    createConstructionSite: jest.fn(() => OK),
    getEventLog: jest.fn(() => []),
  });

  // Set circular reference
  (controllerMock as any).room = room;

  return room;
}

/**
 * Create a mock creep with common properties.
 */
export function mockCreep(
  name: string,
  options: {
    body?: BodyPartConstant[];
    room?: Room;
    pos?: { x: number; y: number; roomName: string };
    memory?: Partial<CreepMemory>;
    store?: Partial<StoreDefinition>;
    spawning?: boolean;
    fatigue?: number;
    hits?: number;
    hitsMax?: number;
  } = {}
): Creep {
  const {
    body = [WORK, CARRY, MOVE],
    room,
    pos = { x: 25, y: 25, roomName: 'W1N1' },
    memory = {},
    store,
    spawning = false,
    fatigue = 0,
    hits = 100,
    hitsMax = 100,
  } = options;

  const bodyParts = body.map(type => 
    mockInstanceOf<BodyPartDefinition>({
      type,
      hits: 100,
    })
  );

  const storeMock = mockInstanceOf<StoreDefinition>({
    getCapacity: jest.fn((resource?: ResourceConstant) => {
      if (!resource) return body.filter(p => p === CARRY).length * 50;
      return body.filter(p => p === CARRY).length * 50;
    }),
    getUsedCapacity: jest.fn((resource?: ResourceConstant) => {
      if (store && resource === RESOURCE_ENERGY) {
        return (store as any)[RESOURCE_ENERGY] ?? 0;
      }
      return 0;
    }),
    getFreeCapacity: jest.fn((resource?: ResourceConstant) => {
      const capacity = body.filter(p => p === CARRY).length * 50;
      const used = store && resource === RESOURCE_ENERGY ? (store as any)[RESOURCE_ENERGY] ?? 0 : 0;
      return capacity - used;
    }),
    ...store,
  });

  const posMock = mockInstanceOf<RoomPosition>({
    x: pos.x,
    y: pos.y,
    roomName: pos.roomName,
    isNearTo: jest.fn(() => false),
    isEqualTo: jest.fn(() => false),
    findClosestByPath: jest.fn(),
    findClosestByRange: jest.fn(),
    findInRange: jest.fn(() => []),
    getRangeTo: jest.fn(() => 10),
    toJSON: () => pos,
  });

  // Create memory with default fields set to undefined to avoid mock errors
  const creepMemory = {
    role: undefined,
    assignedPos: undefined,
    assignedSource: undefined,
    ...memory,
  } as CreepMemory;

  const creep = mockInstanceOf<Creep>({
    id: `${name}-id` as Id<Creep>,
    name,
    body: bodyParts,
    room: room ?? mockRoom('W1N1'),
    pos: posMock,
    memory: creepMemory,
    store: storeMock,
    spawning,
    fatigue,
    hits,
    hitsMax,
    my: true,
    ticksToLive: 1500,
    saying: undefined,
    
    // Movement actions
    move: jest.fn(() => OK),
    moveByPath: jest.fn(() => OK),
    moveTo: jest.fn(() => OK),
    
    // Work actions
    harvest: jest.fn(() => OK),
    build: jest.fn(() => OK),
    repair: jest.fn(() => OK),
    upgradeController: jest.fn(() => OK),
    
    // Resource actions
    transfer: jest.fn(() => OK),
    withdraw: jest.fn(() => OK),
    pickup: jest.fn(() => OK),
    drop: jest.fn(() => OK),
    
    // Combat actions
    attack: jest.fn(() => OK),
    rangedAttack: jest.fn(() => OK),
    heal: jest.fn(() => OK),
    
    // Other actions
    say: jest.fn(() => OK),
    suicide: jest.fn(() => OK),
    cancelOrder: jest.fn(() => OK),
  });

  return creep;
}

/**
 * Create a mock spawn structure.
 */
export function mockSpawn(
  name: string,
  options: {
    room?: Room;
    pos?: { x: number; y: number; roomName: string };
    energy?: number;
    energyCapacity?: number;
    spawning?: Partial<Spawning> | null;
  } = {}
): StructureSpawn {
  const {
    room,
    pos = { x: 25, y: 25, roomName: 'W1N1' },
    energy = 300,
    energyCapacity = 300,
    spawning = null,
  } = options;

  const spawn = mockStructure(STRUCTURE_SPAWN, {
    name,
    room: room ?? mockRoom('W1N1'),
    pos: mockInstanceOf<RoomPosition>({
      x: pos.x,
      y: pos.y,
      roomName: pos.roomName,
      isNearTo: jest.fn(() => false),
      getRangeTo: jest.fn(() => 10),
      toJSON: () => pos,
    }),
    store: {
      getCapacity: () => energyCapacity,
      getUsedCapacity: () => energy,
      getFreeCapacity: () => energyCapacity - energy,
      energy,
    } as any,
    spawning: spawning ? mockInstanceOf<Spawning>(spawning) : null,
    hits: 5000,
    hitsMax: 5000,
    my: true,
    
    spawnCreep: jest.fn(() => OK),
    renewCreep: jest.fn(() => OK),
    recycleCreep: jest.fn(() => OK),
  });

  return spawn;
}

/**
 * Create a mock source.
 */
export function mockSource(
  id: string,
  options: {
    pos?: { x: number; y: number; roomName: string };
    energy?: number;
    energyCapacity?: number;
    ticksToRegeneration?: number;
  } = {}
): Source {
  const {
    pos = { x: 10, y: 10, roomName: 'W1N1' },
    energy = 3000,
    energyCapacity = 3000,
    ticksToRegeneration = 300,
  } = options;

  return mockInstanceOf<Source>({
    id: id as Id<Source>,
    pos: mockInstanceOf<RoomPosition>({
      x: pos.x,
      y: pos.y,
      roomName: pos.roomName,
      isNearTo: jest.fn(() => false),
      getRangeTo: jest.fn(() => 10),
      toJSON: () => pos,
    }),
    energy,
    energyCapacity,
    ticksToRegeneration,
    room: undefined,
  });
}

/**
 * Register mock objects with the global Game object.
 */
export function registerWithGame(objects: {
  rooms?: Record<string, Room>;
  creeps?: Record<string, Creep>;
  spawns?: Record<string, StructureSpawn>;
  structures?: Record<string, Structure>;
}): void {
  const { rooms = {}, creeps = {}, spawns = {}, structures = {} } = objects;

  // Merge objects into Game
  mockGlobal<Game>('Game', {
    ...Game,
    rooms,
    creeps,
    spawns,
    structures,
    getObjectById: jest.fn((id: string) => {
      // Search all object collections
      for (const collection of [creeps, spawns, structures]) {
        for (const obj of Object.values(collection)) {
          if ((obj as any).id === id) return obj;
        }
      }
      return null;
    }),
  }, true);

  // Also set up Memory.creeps for registered creeps
  for (const [name, creep] of Object.entries(creeps)) {
    Memory.creeps[name] = creep.memory;
  }
}

/**
 * Create a terrain mock that returns specific values for positions.
 * @param wallPositions - Array of [x, y] positions that are walls
 * @param swampPositions - Array of [x, y] positions that are swamps
 */
export function mockTerrain(
  wallPositions: [number, number][] = [],
  swampPositions: [number, number][] = []
): RoomTerrain {
  const wallSet = new Set(wallPositions.map(([x, y]) => `${x},${y}`));
  const swampSet = new Set(swampPositions.map(([x, y]) => `${x},${y}`));

  return mockInstanceOf<RoomTerrain>({
    get: jest.fn((x: number, y: number) => {
      const key = `${x},${y}`;
      if (wallSet.has(key)) return TERRAIN_MASK_WALL;
      if (swampSet.has(key)) return TERRAIN_MASK_SWAMP;
      return 0; // Plain
    }),
  });
}
