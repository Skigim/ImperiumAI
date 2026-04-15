import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  summarizeRoomEconomySnapshot,
  runBuild,
  runHarvest,
  runRepair,
  findTransferTarget,
  runTransfer,
  runWithdraw,
} = vi.hoisted(() => {
  return {
    summarizeRoomEconomySnapshot: vi.fn(),
    runBuild: vi.fn(),
    runHarvest: vi.fn(),
    runRepair: vi.fn(),
    findTransferTarget: vi.fn(),
    runTransfer: vi.fn(),
    runWithdraw: vi.fn(),
  };
});

vi.mock('../../src/domain/roomEconomy', () => ({
  detectStructuralEnvelopeChange: (previousCapacity: number, currentCapacity: number) => {
    return previousCapacity !== currentCapacity;
  },
  summarizeRoomEconomySnapshot,
}));

vi.mock('../../src/tasks/build', () => ({ runBuild }));
vi.mock('../../src/tasks/harvest', () => ({ runHarvest }));
vi.mock('../../src/tasks/repair', () => ({ runRepair }));
vi.mock('../../src/tasks/transfer', () => ({ findTransferTarget, runTransfer }));
vi.mock('../../src/tasks/withdraw', () => ({ runWithdraw }));

import { createWorkerRoomProcess } from '../../src/processes/workerRoomProcess';
import {
  createDefaultRoomEconomyRecord,
  createDefaultSourceEconomyRecord,
} from '../../src/model/roomEconomy';

Object.assign(globalThis, {
  FIND_HOSTILE_CREEPS: 102,
  FIND_MY_CREEPS: 103,
  FIND_MY_STRUCTURES: 104,
  FIND_SOURCES: 105,
  FIND_STRUCTURES: 106,
  FIND_CONSTRUCTION_SITES: 107,
  FIND_DROPPED_RESOURCES: 108,
  RESOURCE_ENERGY: 'energy',
  STRUCTURE_CONTAINER: 'container',
  STRUCTURE_EXTENSION: 'extension',
  STRUCTURE_ROAD: 'road',
  STRUCTURE_SPAWN: 'spawn',
  STRUCTURE_TOWER: 'tower',
  OK: 0,
  ERR_NOT_IN_RANGE: -9,
  ERR_NOT_ENOUGH_RESOURCES: -6,
  ERR_FULL: -8,
  TERRAIN_MASK_WALL: 1,
});

const createEnergyStore = (energy: number, freeCapacity = 0): StoreDefinition => {
  return {
    [RESOURCE_ENERGY]: energy,
    getCapacity: vi.fn(),
    getFreeCapacity: vi.fn().mockImplementation((resource?: ResourceConstant) => {
      return resource === undefined || resource === RESOURCE_ENERGY ? freeCapacity : null;
    }),
    getUsedCapacity: vi.fn().mockImplementation((resource?: ResourceConstant) => {
      return resource === undefined || resource === RESOURCE_ENERGY ? energy : null;
    }),
  } as unknown as StoreDefinition;
};

const createCreep = (role: CreepMemory['role'], energy: number): Creep => {
  return {
    memory: { role },
    moveTo: vi.fn(),
    store: createEnergyStore(energy),
    upgradeController: vi.fn().mockReturnValue(0),
  } as unknown as Creep;
};

describe('worker room process', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    runBuild.mockImplementation(() => undefined);
    runHarvest.mockImplementation(() => undefined);
    runRepair.mockImplementation(() => undefined);
    runTransfer.mockImplementation(() => undefined);
    runWithdraw.mockImplementation(() => undefined);

    Object.assign(globalThis, {
      Game: {
        getObjectById: vi.fn().mockReturnValue(null),
        creeps: {},
        map: {
          getRoomLinearDistance: vi.fn().mockReturnValue(1),
          describeExits: vi.fn().mockReturnValue({}),
        },
        rooms: {},
        time: 250,
      },
      Memory: {
        imperium: {
          rooms: {},
        },
      },
    });

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: 'W1N1',
      controllerLevel: 2,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: ['source-1'],
      remoteSourceIds: [],
    });
    findTransferTarget.mockReturnValue(null);
  });

  it('initializes room economy memory, updates phase and commissioning state, and skips extension scans when capacity is unchanged', () => {
    const creep = createCreep('generalist', 0);
    const source = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;

    const process = createWorkerRoomProcess(room.name);
    const status = process.run({ tick: Game.time, cpuUsed: 0 });

    expect(status).toBe('completed');
    expect(Memory.imperium.rooms[room.name]).toBeDefined();
    expect(Memory.imperium.rooms[room.name]?.economy.sourceRecords[source.id]).toMatchObject({
      sourceId: source.id,
      classification: 'local',
      roomName: room.name,
    });
    expect(Memory.imperium.rooms[room.name]?.economy.phase).toBe('local-source-hardening');
    expect(Memory.imperium.rooms[room.name]?.economy.currentCommissioningSourceId).toBeNull();
  });

  it('selects an existing remote source record for commissioning after local hardening completes', () => {
    const creep = createCreep('generalist', 0);
    const localSource = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [localSource];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            throw new Error('unexpected extension scan');
          default:
            return [];
        }
      }),
    } as unknown as Room;

    const localRecord = createDefaultSourceEconomyRecord({
      sourceId: localSource.id,
      roomName: room.name,
      classification: 'local',
    });
    localRecord.state = 'logistics-active';

    const remoteRecord = createDefaultSourceEconomyRecord({
      sourceId: 'remote-source-1' as Id<Source>,
      roomName: 'W1N2',
      classification: 'remote',
    });

    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        cachedStructuralEnergyCapacity: room.energyCapacityAvailable,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [localSource.id]: localRecord,
          [remoteRecord.sourceId]: remoteRecord,
        },
      },
    };
    Game.rooms[room.name] = room;

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [localSource.id],
      remoteSourceIds: [remoteRecord.sourceId],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[room.name]?.economy.localSourceHardeningComplete).toBe(true);
    expect(Memory.imperium.rooms[room.name]?.economy.phase).toBe('serialized-remote-expansion');
    expect(Memory.imperium.rooms[room.name]?.economy.currentCommissioningSourceId).toBe(
      remoteRecord.sourceId,
    );
  });

  it('eventually reactivates a suspended remote after cooldown plus the passive recovery window', () => {
    const creep = createCreep('generalist', 0);
    const localSource = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [localSource];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            throw new Error('unexpected extension scan');
          default:
            return [];
        }
      }),
    } as unknown as Room;

    const localRecord = createDefaultSourceEconomyRecord({
      sourceId: localSource.id,
      roomName: room.name,
      classification: 'local',
    });
    localRecord.state = 'logistics-active';

    const remoteRecord = createDefaultSourceEconomyRecord({
      sourceId: 'remote-source-1' as Id<Source>,
      roomName: 'W1N2',
      classification: 'remote',
    });
    remoteRecord.state = 'suspended';
    remoteRecord.health.reactivationCooldownUntil = 275;
    remoteRecord.health.hostilePresenceStreak = 3;
    remoteRecord.health.routeRiskScore = 2;
    remoteRecord.health.logisticsStarvationStreak = 1;

    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        cachedStructuralEnergyCapacity: room.energyCapacityAvailable,
        extensionBuildoutComplete: true,
        localSourceHardeningComplete: true,
        lastStructuralReviewTick: 276,
        sourceRecords: {
          [localSource.id]: localRecord,
          [remoteRecord.sourceId]: remoteRecord,
        },
      },
    };
    Game.rooms[room.name] = room;

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [localSource.id],
      remoteSourceIds: [remoteRecord.sourceId],
    });

    const process = createWorkerRoomProcess(room.name);

    process.run({ tick: Game.time, cpuUsed: 0 });
    expect(Memory.imperium.rooms[room.name]?.economy.currentCommissioningSourceId).toBeNull();

    Game.time = 281;
    process.run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[room.name]?.economy.currentCommissioningSourceId).toBe(
      remoteRecord.sourceId,
    );
  });

  it('advances a fresh local source record from live room facts during the first reevaluation pass', () => {
    const stationaryMiner = createCreep('stationaryMiner', 0);
    stationaryMiner.memory.assignedSourceId = 'source-1' as Id<Source>;
    stationaryMiner.pos = {
      getRangeTo: vi.fn().mockReturnValue(1),
    } as unknown as RoomPosition;

    const routeHauler = createCreep('routeHauler', 50);
    routeHauler.memory.assignedSourceId = 'source-1' as Id<Source>;
    routeHauler.pos = {
      getRangeTo: vi.fn().mockReturnValue(1),
    } as unknown as RoomPosition;

    const container = {
      id: 'container-1',
      structureType: STRUCTURE_CONTAINER,
      pos: { x: 11, y: 20, roomName: 'W1N1' },
    } as unknown as StructureContainer;
    const road = {
      id: 'road-1',
      structureType: STRUCTURE_ROAD,
      pos: { x: 12, y: 20, roomName: 'W1N1' },
    } as unknown as StructureRoad;
    const source = {
      id: 'source-1',
      pos: {
        roomName: 'W1N1',
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockImplementation((findConstant: number) => {
          if (findConstant !== FIND_STRUCTURES) {
            return [];
          }

          return [container, road];
        }),
      },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [stationaryMiner, routeHauler];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[room.name]?.economy.sourceRecords[source.id]).toMatchObject({
      state: 'logistics-active',
      containerId: container.id,
      containerPosition: { x: 11, y: 20, roomName: 'W1N1' },
      roadAnchor: { x: 12, y: 20, roomName: 'W1N1' },
      designatedMiningTile: null,
    });
    expect(Memory.imperium.rooms[room.name]?.economy.localSourceHardeningComplete).toBe(true);
  });

  it('skips extension scans when the structural capacity is unchanged and the review cadence is not due', () => {
    const creep = createCreep('generalist', 0);
    const source = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
      },
    };
    Game.rooms[room.name] = room;

    const status = createWorkerRoomProcess(room.name).run({
      tick: Game.time,
      cpuUsed: 0,
    });

    expect(status).toBe('completed');
  });

  it('has route haulers deliver before repairing when they are carrying energy', () => {
    const creep = createCreep('routeHauler', 100);
    const source = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const transferTarget = { id: 'spawn-1' } as StructureSpawn;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;
    findTransferTarget.mockReturnValue(transferTarget);
    runTransfer.mockReturnValue(transferTarget);

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(findTransferTarget).toHaveBeenCalledWith(creep, undefined);
    expect(runTransfer).toHaveBeenCalledWith(creep, { target: transferTarget });
    expect(runRepair).not.toHaveBeenCalled();
    expect(runWithdraw).not.toHaveBeenCalled();
  });

  it('repairs only after route haulers fail to find a delivery target and still have payload above the repair threshold', () => {
    const creep = createCreep('routeHauler', 75);
    const source = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(findTransferTarget).toHaveBeenCalledWith(creep, undefined);
    expect(runTransfer).not.toHaveBeenCalled();
    expect(runRepair).toHaveBeenCalledWith(creep);
  });

  it('does not repair when route haulers have 25 energy or less after delivery fails', () => {
    const creep = createCreep('routeHauler', 25);
    const source = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(findTransferTarget).toHaveBeenCalledWith(creep, undefined);
    expect(runTransfer).not.toHaveBeenCalled();
    expect(runRepair).not.toHaveBeenCalled();
  });

  it('fails safe when a stationary miner has no assigned source', () => {
    const creep = createCreep('stationaryMiner', 0);
    const source = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: {},
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(runHarvest).not.toHaveBeenCalled();
    expect(creep.moveTo).not.toHaveBeenCalled();
  });

  it('spawns a bootstrap shuttle when the room has no workforce and an idle spawn at RCL1', () => {
    const source = {
      id: 'source-1',
      pos: { roomName: 'W1N1', x: 10, y: 10, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 10, y: 10, roomName: 'W1N1' },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 0),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 1,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [
              {
                id: 'road-site-1',
                structureType: STRUCTURE_ROAD,
                pos: { x: 12, y: 10, roomName: 'W1N1' },
              },
            ];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 1,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledOnce();
    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      ['work', 'carry', 'move', 'move'],
      expect.stringMatching(/^bootstrap-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'worker',
          assignedSourceId: source.id,
          bootstrapAssignmentClass: 'shuttle',
          bootstrapDeliveryMode: 'harvest',
          homeRoomName: room.name,
        }),
      }),
    );
  });

  it('does not exceed the four-shuttle live-plus-pending cap during RCL1 bootstrap planning', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const idleSpawn = {
      id: 'spawn-idle',
      name: 'SpawnIdle',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 0),
    } as unknown as StructureSpawn;
    const busySpawn = {
      id: 'spawn-busy',
      name: 'SpawnBusy',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 24, y: 25, roomName },
      spawning: { name: 'bootstrap-pending' },
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 0),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 1,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const createShuttle = (name: string, slotKey: string): Creep => {
      return {
        name,
        memory: {
          role: 'worker',
          assignedSourceId: source.id,
          bootstrapAssignmentClass: 'shuttle',
          bootstrapSlotKey: slotKey,
          bootstrapDeliveryMode: 'harvest',
          homeRoomName: roomName,
        },
        moveTo: vi.fn(),
        store: createEnergyStore(0, 50),
        pos: { roomName, getRangeTo: vi.fn().mockReturnValue(1) },
        upgradeController: vi.fn().mockReturnValue(OK),
      } as unknown as Creep;
    };
    const liveShuttles = [
      createShuttle('bootstrap-1', '9,9'),
      createShuttle('bootstrap-2', '9,10'),
      createShuttle('bootstrap-3', '9,11'),
    ];
    const room = {
      name: roomName,
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      memory: {},
      getTerrain: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(0) }),
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return liveShuttles;
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [idleSpawn, busySpawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps = Object.fromEntries(liveShuttles.map((creep) => [creep.name, creep]));
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      return id === source.id ? source : null;
    });
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 300,
        extensionBuildoutComplete: false,
        lastStructuralReviewTick: Game.time,
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          sourceSlots: {
            [source.id]: {
              '9,9': { occupantCreepName: 'bootstrap-1', claimState: 'occupied', reservedAtTick: Game.time - 1 },
              '9,10': { occupantCreepName: 'bootstrap-2', claimState: 'occupied', reservedAtTick: Game.time - 1 },
              '9,11': { occupantCreepName: 'bootstrap-3', claimState: 'occupied', reservedAtTick: Game.time - 1 },
              '10,9': { occupantCreepName: 'bootstrap-pending', claimState: 'reserved', reservedAtTick: Game.time - 1 },
              '10,11': { occupantCreepName: null, claimState: 'open', reservedAtTick: 0 },
            },
          },
          assignments: {
            'bootstrap-1': {
              creepName: 'bootstrap-1',
              assignmentClass: 'shuttle',
              sourceId: source.id,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
            'bootstrap-2': {
              creepName: 'bootstrap-2',
              assignmentClass: 'shuttle',
              sourceId: source.id,
              slotKey: '9,10',
              deliveryMode: 'harvest',
            },
            'bootstrap-3': {
              creepName: 'bootstrap-3',
              assignmentClass: 'shuttle',
              sourceId: source.id,
              slotKey: '9,11',
              deliveryMode: 'harvest',
            },
            'bootstrap-pending': {
              creepName: 'bootstrap-pending',
              assignmentClass: 'shuttle',
              sourceId: source.id,
              slotKey: '10,9',
              deliveryMode: 'harvest',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 1,
      energyAvailable: 300,
      energyCapacityAvailable: 300,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(idleSpawn.spawnCreep).not.toHaveBeenCalled();
  });

  it('updates bootstrap phase and creates only one extension site during RCL2 buildout', () => {
    const container = {
      id: 'container-1',
      structureType: STRUCTURE_CONTAINER,
      pos: { x: 11, y: 10, roomName: 'W1N1' },
    } as unknown as StructureContainer;
    const road = {
      id: 'road-1',
      structureType: STRUCTURE_ROAD,
      pos: { x: 12, y: 10, roomName: 'W1N1' },
    } as unknown as StructureRoad;
    const source = {
      id: 'source-a',
      pos: {
        roomName: 'W1N1',
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([container, road]),
      },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName: 'W1N1' },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(250, 50),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const createConstructionSite = vi.fn().mockReturnValue(OK);
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite,
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    const sourceRecord = createDefaultSourceEconomyRecord({
      sourceId: source.id,
      roomName: room.name,
      classification: 'local',
    });
    sourceRecord.containerId = container.id;
    sourceRecord.containerPosition = { x: 11, y: 10, roomName: 'W1N1' };
    sourceRecord.roadAnchor = { x: 12, y: 10, roomName: 'W1N1' };

    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        sourceRecords: {
          [source.id]: sourceRecord,
        },
      },
    };

    Game.rooms[room.name] = room;

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: ['source-a'],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[room.name]?.economy.bootstrap.phase).toBe('extension-build');
    const extensionPlacements = createConstructionSite.mock.calls.filter((call) => {
      return call[2] === STRUCTURE_EXTENSION;
    });

    expect(extensionPlacements).toHaveLength(1);
  });

  it('does not place a second bootstrap extension site on the tick after placement if visibility lags', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(200, 100),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const createConstructionSite = vi.fn().mockReturnValue(OK);
    const room = {
      name: roomName,
      controller,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite,
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: false,
        lastStructuralReviewTick: Game.time,
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    const process = createWorkerRoomProcess(roomName);

    process.run({ tick: Game.time, cpuUsed: 0 });
    Game.time += 1;
    process.run({ tick: Game.time, cpuUsed: 0 });

    const extensionPlacements = createConstructionSite.mock.calls.filter((call) => {
      return call[2] === STRUCTURE_EXTENSION;
    });

    expect(extensionPlacements).toHaveLength(1);
  });

  it('clears slot claims and unmatched hauler reroutes when a rerouted shuttle dies', () => {
    const roomName = 'W1N1';
    const hauler = {
      name: 'hauler-1',
      memory: { role: 'worker', homeRoomName: roomName },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;

    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          sourceSlots: {
            'source-a': {
              '9,9': {
                occupantCreepName: 'shuttle-1',
                claimState: 'occupied',
                reservedAtTick: Game.time - 5,
              },
            },
          },
          assignments: {
            'shuttle-1': {
              creepName: 'shuttle-1',
              assignmentClass: 'shuttle',
              sourceId: 'source-a' as Id<Source>,
              slotKey: '9,9',
              deliveryMode: 'rerouted',
            },
            'hauler-1': {
              creepName: 'hauler-1',
              assignmentClass: 'overflow-build-hauler',
              sourceId: null,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
          fetchRequests: {
            'hauler-1': {
              creepName: 'hauler-1',
              status: 'matched',
              requestedAtTick: Game.time - 2,
              assignedShuttleName: 'shuttle-1',
            },
          },
          reroutes: {
            'shuttle-1': {
              shuttleName: 'shuttle-1',
              targetHaulerName: 'hauler-1',
              sourceId: 'source-a' as Id<Source>,
            },
          },
        },
      },
    };

    const room = {
      name: roomName,
      controller,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [hauler];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[roomName] = room;

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: ['source-a'],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(
      Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots['source-a']?.['9,9']
        ?.claimState,
    ).toBe('open');
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.reroutes['shuttle-1']).toBeUndefined();
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.fetchRequests['hauler-1']).toMatchObject({
      status: 'pending',
      assignedShuttleName: null,
    });
  });

  it('requests a replacement shuttle when cleanup reopens a claimed source slot', () => {
    const roomName = 'W1N1';
    const spawn = {
      id: 'spawn-1',
      name: 'Spawn1',
      structureType: STRUCTURE_SPAWN,
      spawning: null,
      store: createEnergyStore(250, 50),
      pos: { x: 25, y: 25, roomName },
      spawnCreep: vi.fn().mockReturnValue(OK),
    } as unknown as StructureSpawn;
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_SOURCES:
            return [source];
          case FIND_MY_CREEPS:
            return [];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'extension-build',
          sourceSlots: {
            'source-a': {
              '9,9': { occupantCreepName: null, claimState: 'open', reservedAtTick: 0 },
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: ['source-a'],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      ['work', 'carry', 'move', 'move'],
      expect.stringMatching(/^bootstrap-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'worker',
          assignedSourceId: 'source-a',
          bootstrapAssignmentClass: 'shuttle',
          bootstrapSlotKey: '9,9',
          bootstrapDeliveryMode: 'harvest',
          homeRoomName: roomName,
        }),
      }),
    );
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots['source-a']?.['9,9']).toMatchObject({
      occupantCreepName: expect.stringMatching(/^bootstrap-/),
      claimState: 'reserved',
      reservedAtTick: Game.time,
    });
  });

  it('releases a reserved shuttle slot when the pending spawn is canceled before hatch', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: false,
        lastStructuralReviewTick: Game.time,
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'extension-build',
          sourceSlots: {
            'source-a': {
              '9,9': {
                occupantCreepName: 'bootstrap-canceled',
                claimState: 'reserved',
                reservedAtTick: Game.time - 1,
              },
            },
          },
          assignments: {
            'bootstrap-canceled': {
              creepName: 'bootstrap-canceled',
              assignmentClass: 'shuttle',
              sourceId: 'source-a' as Id<Source>,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: ['source-a'],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments['bootstrap-canceled']).toBeUndefined();
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots['source-a']?.['9,9']).toMatchObject({
      occupantCreepName: null,
      claimState: 'open',
      reservedAtTick: 0,
    });
  });

  it('re-reserves another open slot for a still-spawning shuttle when its original slot disappears', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: { name: 'bootstrap-pending' },
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(200, 100),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      getTerrain: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation((x: number, y: number) => {
          return x === 10 && y === 9 ? 0 : TERRAIN_MASK_WALL;
        }),
      }),
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[roomName] = room;
    Memory.creeps = {
      'bootstrap-pending': {
        role: 'worker',
        assignedSourceId: source.id,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '9,9',
        bootstrapDeliveryMode: 'harvest',
        homeRoomName: roomName,
      },
    };
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: false,
        lastStructuralReviewTick: Game.time,
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'extension-build',
          sourceSlots: {
            [source.id]: {
              '9,9': {
                occupantCreepName: 'bootstrap-pending',
                claimState: 'reserved',
                reservedAtTick: Game.time - 1,
              },
            },
          },
          assignments: {
            'bootstrap-pending': {
              creepName: 'bootstrap-pending',
              assignmentClass: 'shuttle',
              sourceId: source.id,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments['bootstrap-pending']).toMatchObject({
      sourceId: source.id,
      slotKey: '10,9',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots[source.id]?.['10,9']).toMatchObject({
      occupantCreepName: 'bootstrap-pending',
      claimState: 'reserved',
    });
    expect(Memory.creeps['bootstrap-pending']?.bootstrapSlotKey).toBe('10,9');
  });

  it('repairs a live shuttle slot key when topology refresh removes its stored slot', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const shuttle = {
      name: 'shuttle-1',
      memory: {
        role: 'worker',
        assignedSourceId: source.id,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '9,9',
        bootstrapDeliveryMode: 'harvest',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 10, y: 9, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      transfer: vi.fn(),
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      getTerrain: vi.fn().mockReturnValue({
        get: vi.fn().mockImplementation((x: number, y: number) => {
          return x === 10 && y === 9 ? 0 : TERRAIN_MASK_WALL;
        }),
      }),
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [shuttle];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps[shuttle.name] = shuttle;
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      return id === source.id ? source : null;
    });
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: false,
        lastStructuralReviewTick: Game.time,
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'extension-build',
          sourceSlots: {
            [source.id]: {
              '9,9': {
                occupantCreepName: shuttle.name,
                claimState: 'occupied',
                reservedAtTick: Game.time - 1,
              },
            },
          },
          assignments: {
            [shuttle.name]: {
              creepName: shuttle.name,
              assignmentClass: 'shuttle',
              sourceId: source.id,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[shuttle.name]).toMatchObject({
      sourceId: source.id,
      slotKey: '10,9',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots[source.id]?.['10,9']).toMatchObject({
      occupantCreepName: shuttle.name,
      claimState: 'occupied',
    });
    expect(shuttle.memory.bootstrapSlotKey).toBe('10,9');
  });

  it('spawns an overflow build hauler during extension-build when all bootstrap slots are already claimed', () => {
    const roomName = 'W1N1';
    const shuttle = {
      name: 'shuttle-1',
      memory: {
        role: 'worker',
        assignedSourceId: 'source-a' as Id<Source>,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '9,9',
        bootstrapDeliveryMode: 'harvest',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 9, y: 9, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const terrain = {
      get: vi.fn().mockImplementation((x: number, y: number) => {
        return x === 9 && y === 9 ? 0 : TERRAIN_MASK_WALL;
      }),
    };
    const spawn = {
      id: 'spawn-1',
      name: 'Spawn1',
      structureType: STRUCTURE_SPAWN,
      spawning: null,
      store: createEnergyStore(250, 50),
      pos: { x: 25, y: 25, roomName },
      spawnCreep: vi.fn().mockReturnValue(OK),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      memory: {},
      getTerrain: vi.fn().mockReturnValue(terrain),
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [shuttle];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps[shuttle.name] = shuttle;
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: false,
        lastStructuralReviewTick: Game.time,
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'extension-build',
          sourceSlots: {
            'source-a': {
              '9,9': {
                occupantCreepName: shuttle.name,
                claimState: 'occupied',
                reservedAtTick: Game.time - 1,
              },
            },
          },
          assignments: {
            [shuttle.name]: {
              creepName: shuttle.name,
              assignmentClass: 'shuttle',
              sourceId: 'source-a' as Id<Source>,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: ['source-a'],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      ['work', 'carry', 'move', 'move'],
      expect.stringMatching(/^bootstrap-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'worker',
          bootstrapAssignmentClass: 'overflow-build-hauler',
          bootstrapDeliveryMode: 'build',
          homeRoomName: roomName,
        }),
      }),
    );
    const spawnedName = (spawn.spawnCreep as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[spawnedName]).toMatchObject({
      creepName: spawnedName,
      assignmentClass: 'overflow-build-hauler',
      sourceId: null,
      slotKey: null,
      deliveryMode: 'build',
    });
  });

  it('matches the nearest delivery-state shuttle to an empty overflow hauler fetch request', () => {
    const roomName = 'W1N1';
    const shuttle = {
      name: 'shuttle-1',
      memory: { role: 'worker' },
      moveTo: vi.fn(),
      store: createEnergyStore(50, 0),
      pos: { getRangeTo: vi.fn().mockReturnValue(3), roomName },
      transfer: vi.fn().mockReturnValue(ERR_NOT_IN_RANGE),
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const hauler = {
      name: 'hauler-1',
      memory: { role: 'worker' },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    Game.creeps[shuttle.name] = shuttle;
    Game.creeps[hauler.name] = hauler;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [shuttle, hauler];
          case FIND_SOURCES:
            return [];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'extension-build',
          assignments: {
            'shuttle-1': {
              creepName: 'shuttle-1',
              assignmentClass: 'shuttle',
              sourceId: 'source-a' as Id<Source>,
              slotKey: '10,10',
              deliveryMode: 'deliver',
            },
            'hauler-1': {
              creepName: 'hauler-1',
              assignmentClass: 'overflow-build-hauler',
              sourceId: null,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
          fetchRequests: {
            'hauler-1': {
              creepName: 'hauler-1',
              status: 'pending',
              requestedAtTick: Game.time,
              assignedShuttleName: null,
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.reroutes['shuttle-1']).toMatchObject({
      targetHaulerName: 'hauler-1',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.fetchRequests['hauler-1']).toMatchObject({
      status: 'matched',
      assignedShuttleName: 'shuttle-1',
    });
  });

  it('lets an empty overflow build hauler request charge-phase energy and relay it into room sinks', () => {
    const roomName = 'W1N1';
    const setCreepEnergy = (creep: Creep, energy: number): void => {
      creep.store = createEnergyStore(energy, Math.max(0, 50 - energy));
    };

    const shuttle = {
      name: 'shuttle-1',
      memory: {
        role: 'worker',
        assignedSourceId: 'source-a' as Id<Source>,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '9,9',
        bootstrapDeliveryMode: 'deliver',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(50, 0),
      pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName },
      transfer: vi.fn(),
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const hauler = {
      name: 'hauler-1',
      memory: {
        role: 'worker',
        bootstrapAssignmentClass: 'overflow-build-hauler',
        bootstrapDeliveryMode: 'build',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      spawning: null,
      store: createEnergyStore(300, 250),
      pos: { x: 25, y: 25, roomName },
      spawnCreep: vi.fn().mockReturnValue(OK),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [shuttle, hauler];
          case FIND_SOURCES:
            return [];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    shuttle.transfer = vi.fn().mockImplementation((target: Creep) => {
      if (target !== hauler) {
        return ERR_NOT_IN_RANGE;
      }

      setCreepEnergy(shuttle, 0);
      setCreepEnergy(hauler, 50);
      return OK;
    });

    Game.creeps[shuttle.name] = shuttle;
    Game.creeps[hauler.name] = hauler;
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'exit-charge',
          assignments: {
            [shuttle.name]: {
              creepName: shuttle.name,
              assignmentClass: 'shuttle',
              sourceId: 'source-a' as Id<Source>,
              slotKey: '9,9',
              deliveryMode: 'deliver',
            },
            [hauler.name]: {
              creepName: hauler.name,
              assignmentClass: 'overflow-build-hauler',
              sourceId: null,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [],
      remoteSourceIds: [],
    });
    findTransferTarget.mockImplementation((creep: Creep) => {
      return creep.name === hauler.name ? spawn : null;
    });
    runTransfer.mockImplementation((creep: Creep, { target }: { target: StructureSpawn }) => {
      if (creep !== hauler || target !== spawn) {
        return;
      }

      room.energyAvailable = Math.min(room.energyCapacityAvailable, room.energyAvailable + 50);
      setCreepEnergy(hauler, 0);
    });

    const process = createWorkerRoomProcess(roomName);

    process.run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.fetchRequests[hauler.name]).toMatchObject({
      creepName: hauler.name,
      status: 'pending',
      assignedShuttleName: null,
    });

    Game.time += 1;
    process.run({ tick: Game.time, cpuUsed: 0 });

    expect(shuttle.transfer).toHaveBeenCalledWith(hauler, RESOURCE_ENERGY);
    expect(runTransfer).toHaveBeenCalledWith(hauler, { target: spawn });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.fetchRequests[hauler.name]).toBeUndefined();
  });

  it('lets shuttles build directly in extension-build when no overflow fetch request is active', () => {
    const creep = {
      name: 'shuttle-1',
      memory: {
        role: 'worker',
        assignedSourceId: 'source-a' as Id<Source>,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '10,10',
        bootstrapDeliveryMode: 'deliver',
      },
      store: createEnergyStore(50, 0),
      pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName: 'W1N1' },
      moveTo: vi.fn(),
      transfer: vi.fn(),
      build: vi.fn().mockReturnValue(OK),
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;

    const site = {
      id: 'site-1',
      structureType: STRUCTURE_EXTENSION,
      pos: { roomName: 'W1N1', x: 24, y: 24 },
    } as unknown as ConstructionSite<BuildableStructureConstant>;

    const room = {
      name: 'W1N1',
      controller: { level: 2, my: true } as StructureController,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_CONSTRUCTION_SITES:
            return [site];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_SOURCES:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;
    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        bootstrap: {
          ...createDefaultRoomEconomyRecord(room.name).bootstrap,
          phase: 'extension-build',
          activeExtensionSiteId: site.id,
          assignments: {
            [creep.name]: {
              creepName: creep.name,
              assignmentClass: 'shuttle',
              sourceId: 'source-a' as Id<Source>,
              slotKey: '10,10',
              deliveryMode: 'deliver',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(runBuild).toHaveBeenCalledWith(creep, { target: site });
  });

  it('preempts spawn delivery immediately once a shuttle is rerouted to a hauler', () => {
    const shuttle = {
      name: 'shuttle-1',
      memory: { role: 'worker' },
      store: createEnergyStore(50, 0),
      pos: { getRangeTo: vi.fn().mockReturnValue(2), roomName: 'W1N1' },
      moveTo: vi.fn(),
      transfer: vi.fn().mockReturnValue(ERR_NOT_IN_RANGE),
      upgradeController: vi.fn(),
    } as unknown as Creep;
    const hauler = {
      name: 'hauler-1',
      pos: { roomName: 'W1N1', x: 20, y: 20 },
    } as unknown as Creep;

    Game.creeps[hauler.name] = hauler;

    const room = {
      name: 'W1N1',
      controller: { level: 2, my: true } as StructureController,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [shuttle];
          case FIND_CONSTRUCTION_SITES:
            return [];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_SOURCES:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;
    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        bootstrap: {
          ...createDefaultRoomEconomyRecord(room.name).bootstrap,
          phase: 'extension-build',
          assignments: {
            [shuttle.name]: {
              creepName: shuttle.name,
              assignmentClass: 'shuttle',
              sourceId: 'source-a' as Id<Source>,
              slotKey: '10,10',
              deliveryMode: 'rerouted',
            },
          },
          reroutes: {
            [shuttle.name]: {
              shuttleName: shuttle.name,
              targetHaulerName: hauler.name,
              sourceId: 'source-a' as Id<Source>,
            },
          },
          fetchRequests: {
            [hauler.name]: {
              creepName: hauler.name,
              status: 'matched',
              requestedAtTick: Game.time,
              assignedShuttleName: shuttle.name,
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: false,
      extensionBuildoutComplete: false,
      hostileCount: 0,
      localSourceIds: [],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(shuttle.transfer).toHaveBeenCalledWith(hauler, RESOURCE_ENERGY);
    expect(shuttle.upgradeController).not.toHaveBeenCalled();
  });

  it('makes bootstrap builders pick up dropped energy before a source container exists', () => {
    const droppedEnergy = {
      id: 'drop-1',
      amount: 50,
      resourceType: RESOURCE_ENERGY,
      pos: { roomName: 'W1N1', x: 10, y: 10 },
    } as unknown as Resource<ResourceConstant>;
    const builder = {
      name: 'builder-1',
      memory: {
        role: 'bootstrapBuilder',
        assignedSourceId: 'source-a' as Id<Source>,
        bootstrapAssignmentClass: 'bootstrap-builder',
      },
      store: createEnergyStore(0, 50),
      pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName: 'W1N1' },
      moveTo: vi.fn(),
      pickup: vi.fn().mockReturnValue(OK),
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;

    const room = {
      name: 'W1N1',
      controller: { level: 2, my: true } as StructureController,
      energyAvailable: 100,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [builder];
          case FIND_DROPPED_RESOURCES:
            return [droppedEnergy];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_SOURCES:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.rooms[room.name] = room;
    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        bootstrap: {
          ...createDefaultRoomEconomyRecord(room.name).bootstrap,
          phase: 'stationary-transition',
          assignments: {
            [builder.name]: {
              creepName: builder.name,
              assignmentClass: 'bootstrap-builder',
              sourceId: 'source-a' as Id<Source>,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: 100,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(builder.pickup).toHaveBeenCalledWith(droppedEnergy);
  });

  it('prefers assigned-source dropped energy over an empty source container while its miner is alive', () => {
    const roomName = 'W1N1';
    const droppedEnergy = {
      id: 'drop-1',
      amount: 50,
      resourceType: RESOURCE_ENERGY,
      pos: { roomName, x: 9, y: 10 },
    } as unknown as Resource<ResourceConstant>;
    const container = {
      id: 'container-1',
      structureType: STRUCTURE_CONTAINER,
      pos: { roomName, x: 11, y: 10 },
      store: createEnergyStore(0, 50),
    } as unknown as StructureContainer;
    const source = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockImplementation((target: { x?: number; y?: number }) => {
          return target.x === 9 && target.y === 10 ? 1 : 1;
        }),
        findInRange: vi.fn().mockImplementation((findConstant: number) => {
          return findConstant === FIND_STRUCTURES ? [container] : [];
        }),
      },
    } as unknown as Source;
    const miner = {
      name: 'miner-1',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: source.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { roomName, x: 11, y: 10, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const builder = {
      name: 'builder-1',
      memory: {
        role: 'bootstrapBuilder',
        assignedSourceId: source.id,
        assignedRoomName: roomName,
        bootstrapAssignmentClass: 'bootstrap-builder',
        bootstrapDeliveryMode: 'build',
        homeRoomName: roomName,
      },
      store: createEnergyStore(0, 50),
      pos: { roomName, x: 12, y: 10, getRangeTo: vi.fn().mockReturnValue(1) },
      moveTo: vi.fn(),
      pickup: vi.fn().mockReturnValue(OK),
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const room = {
      name: roomName,
      controller: {
        level: 2,
        my: true,
        pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
      } as unknown as StructureController,
      energyAvailable: 100,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [miner, builder];
          case FIND_DROPPED_RESOURCES:
            return [droppedEnergy];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_MY_STRUCTURES:
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      if (id === source.id) {
        return source;
      }

      return id === container.id ? container : null;
    });
    Game.creeps[miner.name] = miner;
    Game.creeps[builder.name] = builder;
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [source.id]: createDefaultSourceEconomyRecord({
            sourceId: source.id,
            roomName,
            classification: 'local',
          }),
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'stationary-transition',
          assignments: {
            [builder.name]: {
              creepName: builder.name,
              assignmentClass: 'bootstrap-builder',
              sourceId: source.id,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 100,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(builder.pickup).toHaveBeenCalledWith(droppedEnergy);
    expect(runWithdraw).not.toHaveBeenCalled();
  });

  it('retries assigned-source dropped energy after contention while its miner stays alive', () => {
    const roomName = 'W1N1';
    const firstDroppedEnergy = {
      id: 'drop-1',
      amount: 20,
      resourceType: RESOURCE_ENERGY,
      pos: { roomName, x: 9, y: 10 },
    } as unknown as Resource<ResourceConstant>;
    const secondDroppedEnergy = {
      id: 'drop-2',
      amount: 30,
      resourceType: RESOURCE_ENERGY,
      pos: { roomName, x: 8, y: 10 },
    } as unknown as Resource<ResourceConstant>;
    const sourceA = {
      id: 'source-a',
      pos: {
        roomName,
        x: 10,
        y: 10,
        getRangeTo: vi.fn().mockImplementation((target: { x?: number; y?: number }) => {
          return target.x === 9 || target.x === 8 ? 1 : 3;
        }),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const sourceB = {
      id: 'source-b',
      pos: {
        roomName,
        x: 20,
        y: 20,
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const miner = {
      name: 'miner-1',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: sourceA.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { roomName, x: 11, y: 10, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const builder = {
      name: 'builder-1',
      memory: {
        role: 'bootstrapBuilder',
        assignedSourceId: sourceA.id,
        assignedRoomName: roomName,
        bootstrapAssignmentClass: 'bootstrap-builder',
        bootstrapDeliveryMode: 'build',
        homeRoomName: roomName,
      },
      store: createEnergyStore(0, 50),
      pos: { roomName, x: 12, y: 10, getRangeTo: vi.fn().mockReturnValue(1) },
      moveTo: vi.fn(),
      pickup: vi.fn()
        .mockReturnValueOnce(ERR_NOT_ENOUGH_RESOURCES)
        .mockReturnValueOnce(ERR_NOT_IN_RANGE),
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const room = {
      name: roomName,
      controller: {
        level: 2,
        my: true,
        pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
      } as unknown as StructureController,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [miner, builder];
          case FIND_DROPPED_RESOURCES:
            return Game.time === 250 ? [firstDroppedEnergy] : [secondDroppedEnergy];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_SOURCES:
            return [sourceA, sourceB];
          case FIND_MY_STRUCTURES:
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      if (id === sourceA.id) {
        return sourceA;
      }

      return id === sourceB.id ? sourceB : null;
    });
    Game.creeps[miner.name] = miner;
    Game.creeps[builder.name] = builder;
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [sourceA.id]: createDefaultSourceEconomyRecord({
            sourceId: sourceA.id,
            roomName,
            classification: 'local',
          }),
          [sourceB.id]: createDefaultSourceEconomyRecord({
            sourceId: sourceB.id,
            roomName,
            classification: 'local',
          }),
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'stationary-transition',
          assignments: {
            [builder.name]: {
              creepName: builder.name,
              assignmentClass: 'bootstrap-builder',
              sourceId: sourceA.id,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [sourceA.id, sourceB.id],
      remoteSourceIds: [],
    });

    const process = createWorkerRoomProcess(roomName);

    process.run({ tick: Game.time, cpuUsed: 0 });
    Game.time += 1;
    process.run({ tick: Game.time, cpuUsed: 0 });

    expect(builder.pickup).toHaveBeenNthCalledWith(1, firstDroppedEnergy);
    expect(builder.pickup).toHaveBeenNthCalledWith(2, secondDroppedEnergy);
    expect(builder.moveTo).toHaveBeenCalledWith(secondDroppedEnergy);
    expect(runWithdraw).not.toHaveBeenCalled();
    expect(runHarvest).not.toHaveBeenCalled();
  });

  it('queues the source container before the road and avoids generic builder fallback while its miner is alive', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockImplementation((target: { x?: number; y?: number }) => {
          return target.x === 11 && target.y === 10 ? 1 : 3;
        }),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const miner = {
      name: 'miner-1',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: source.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 11, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const builder = {
      name: 'builder-1',
      memory: {
        role: 'bootstrapBuilder',
        assignedSourceId: source.id,
        assignedRoomName: roomName,
        bootstrapAssignmentClass: 'bootstrap-builder',
        bootstrapDeliveryMode: 'build',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      pickup: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(0, 50),
      pos: { x: 12, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { x: 25, y: 25, roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const constructionSites: ConstructionSite<BuildableStructureConstant>[] = [];
    const room = {
      name: roomName,
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockImplementation((x: number, y: number, structureType: BuildableStructureConstant) => {
        constructionSites.push({
          id: `${structureType}-${constructionSites.length + 1}` as Id<ConstructionSite<BuildableStructureConstant>>,
          structureType,
          pos: { x, y, roomName },
        } as ConstructionSite<BuildableStructureConstant>);

        return OK;
      }),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [miner, builder];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [];
          case FIND_CONSTRUCTION_SITES:
            return constructionSites;
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps[miner.name] = miner;
    Game.creeps[builder.name] = builder;
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      return id === source.id ? source : null;
    });
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [source.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: source.id,
              roomName,
              classification: 'local',
            }),
            designatedMiningTile: { x: 11, y: 10, roomName },
          },
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'stationary-transition',
          assignments: {
            [builder.name]: {
              creepName: builder.name,
              assignmentClass: 'bootstrap-builder',
              sourceId: source.id,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(room.createConstructionSite).toHaveBeenCalledWith(11, 10, STRUCTURE_CONTAINER);
    expect(room.createConstructionSite).not.toHaveBeenCalledWith(expect.any(Number), expect.any(Number), STRUCTURE_ROAD);
    expect(runWithdraw).not.toHaveBeenCalled();
  });

  it('does not hand off legacy bootstrap workers before every local source has a staffed stationary miner', () => {
    const roomName = 'W1N1';
    const sourceA = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const sourceB = {
      id: 'source-b',
      pos: {
        x: 20,
        y: 20,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const minerA = {
      name: 'miner-a',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: sourceA.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 11, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const legacyShuttle = {
      name: 'bootstrap-legacy',
      memory: {
        role: 'worker',
        assignedSourceId: sourceA.id,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '9,9',
        bootstrapDeliveryMode: 'harvest',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 9, y: 9, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 250),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [minerA, legacyShuttle];
          case FIND_SOURCES:
            return [sourceA, sourceB];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps[minerA.name] = minerA;
    Game.creeps[legacyShuttle.name] = legacyShuttle;
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      if (id === sourceA.id) {
        return sourceA;
      }

      if (id === sourceB.id) {
        return sourceB;
      }

      return null;
    });
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [sourceA.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: sourceA.id,
              roomName,
              classification: 'local',
            }),
            designatedMiningTile: { x: 11, y: 10, roomName },
          },
          [sourceB.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: sourceB.id,
              roomName,
              classification: 'local',
            }),
            designatedMiningTile: { x: 21, y: 20, roomName },
          },
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          sourceSlots: {
            [sourceA.id]: {
              '9,9': {
                occupantCreepName: legacyShuttle.name,
                claimState: 'occupied',
                reservedAtTick: Game.time - 1,
              },
            },
            [sourceB.id]: {
              '19,19': {
                occupantCreepName: null,
                claimState: 'open',
                reservedAtTick: 0,
              },
            },
          },
          assignments: {
            [legacyShuttle.name]: {
              creepName: legacyShuttle.name,
              assignmentClass: 'shuttle',
              sourceId: sourceA.id,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [sourceA.id, sourceB.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringMatching(/^stationaryMiner-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'stationaryMiner',
          assignedSourceId: sourceB.id,
        }),
      }),
    );
    expect(legacyShuttle.memory.role).toBe('worker');
    expect(legacyShuttle.memory.bootstrapAssignmentClass).toBe('shuttle');
    expect(legacyShuttle.memory.bootstrapSlotKey).toBe('9,9');
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[legacyShuttle.name]).toMatchObject({
      assignmentClass: 'shuttle',
      sourceId: sourceA.id,
      slotKey: '9,9',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots[sourceA.id]?.['9,9']).toMatchObject({
      occupantCreepName: legacyShuttle.name,
      claimState: 'occupied',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.phase).toBe('stationary-transition');
  });

  it('hands off remaining legacy bootstrap workers into balanced source builders but stays in stationary-transition until source work is complete', () => {
    const roomName = 'W1N1';
    const sourceA = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const sourceB = {
      id: 'source-b',
      pos: {
        x: 20,
        y: 20,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const minerA = {
      name: 'miner-a',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: sourceA.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 11, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const minerB = {
      name: 'miner-b',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: sourceB.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 21, y: 20, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const legacyShuttle = {
      name: 'bootstrap-shuttle',
      memory: {
        role: 'worker',
        assignedSourceId: sourceA.id,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '9,9',
        bootstrapDeliveryMode: 'harvest',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 9, y: 9, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const legacyHauler = {
      name: 'bootstrap-hauler',
      memory: {
        role: 'worker',
        bootstrapAssignmentClass: 'overflow-build-hauler',
        bootstrapDeliveryMode: 'build',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 24, y: 24, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [minerA, minerB, legacyShuttle, legacyHauler];
          case FIND_SOURCES:
            return [sourceA, sourceB];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps[minerA.name] = minerA;
    Game.creeps[minerB.name] = minerB;
    Game.creeps[legacyShuttle.name] = legacyShuttle;
    Game.creeps[legacyHauler.name] = legacyHauler;
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      if (id === sourceA.id) {
        return sourceA;
      }

      if (id === sourceB.id) {
        return sourceB;
      }

      return null;
    });
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [sourceA.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: sourceA.id,
              roomName,
              classification: 'local',
            }),
            designatedMiningTile: { x: 11, y: 10, roomName },
          },
          [sourceB.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: sourceB.id,
              roomName,
              classification: 'local',
            }),
            designatedMiningTile: { x: 21, y: 20, roomName },
          },
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          sourceSlots: {
            [sourceA.id]: {
              '9,9': {
                occupantCreepName: legacyShuttle.name,
                claimState: 'occupied',
                reservedAtTick: Game.time - 1,
              },
            },
          },
          assignments: {
            [legacyShuttle.name]: {
              creepName: legacyShuttle.name,
              assignmentClass: 'shuttle',
              sourceId: sourceA.id,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
            [legacyHauler.name]: {
              creepName: legacyHauler.name,
              assignmentClass: 'overflow-build-hauler',
              sourceId: null,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [sourceA.id, sourceB.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    const reassignedSources = [
      Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[legacyShuttle.name]?.sourceId,
      Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[legacyHauler.name]?.sourceId,
    ].sort();

    expect(reassignedSources).toEqual([sourceA.id, sourceB.id].sort());
    expect(legacyShuttle.memory.role).toBe('bootstrapBuilder');
    expect(legacyHauler.memory.role).toBe('bootstrapBuilder');
    expect(legacyShuttle.memory.bootstrapSlotKey).toBeUndefined();
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots[sourceA.id]?.['9,9']).toMatchObject({
      occupantCreepName: null,
      claimState: 'open',
      reservedAtTick: 0,
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.phase).toBe('stationary-transition');
  });

  it('leaves stationary-transition and requests a route hauler once the miner-plus-builder handoff is satisfied and source work is complete', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const miner = {
      name: 'miner-a',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: source.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 11, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const legacyShuttle = {
      name: 'bootstrap-shuttle',
      memory: {
        role: 'worker',
        assignedSourceId: source.id,
        bootstrapAssignmentClass: 'shuttle',
        bootstrapSlotKey: '9,9',
        bootstrapDeliveryMode: 'harvest',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 9, y: 9, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 250),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [miner, legacyShuttle];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps[miner.name] = miner;
    Game.creeps[legacyShuttle.name] = legacyShuttle;
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      return id === source.id ? source : null;
    });
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [source.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: source.id,
              roomName,
              classification: 'local',
            }),
            state: 'road-bootstrap',
            designatedMiningTile: { x: 11, y: 10, roomName },
            containerPosition: { x: 11, y: 10, roomName },
          },
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          sourceSlots: {
            [source.id]: {
              '9,9': {
                occupantCreepName: legacyShuttle.name,
                claimState: 'occupied',
                reservedAtTick: Game.time - 1,
              },
            },
          },
          assignments: {
            [legacyShuttle.name]: {
              creepName: legacyShuttle.name,
              assignmentClass: 'shuttle',
              sourceId: source.id,
              slotKey: '9,9',
              deliveryMode: 'harvest',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      ['work', 'carry', 'carry', 'move'],
      expect.stringMatching(/^routeHauler-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'routeHauler',
          assignedSourceId: source.id,
          assignedRoomName: roomName,
          homeRoomName: roomName,
        }),
      }),
    );
    expect(legacyShuttle.memory.role).toBe('bootstrapBuilder');
    expect(legacyShuttle.memory.bootstrapAssignmentClass).toBe('bootstrap-builder');
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[legacyShuttle.name]).toMatchObject({
      assignmentClass: 'bootstrap-builder',
      sourceId: source.id,
      slotKey: null,
      deliveryMode: 'build',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots[source.id]?.['9,9']).toMatchObject({
      occupantCreepName: null,
      claimState: 'open',
      reservedAtTick: 0,
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.phase).toBe('complete');
  });

  it('spawns a recovery shuttle during stationary-transition when a miner is missing below miner cost and no energy-moving labor remains', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: null,
      spawnCreep: vi.fn().mockImplementation((body: BodyPartConstant[]) => {
        return body.join(',') === 'work,work,work,work,work,move' ? ERR_NOT_ENOUGH_RESOURCES : OK;
      }),
      store: createEnergyStore(300, 250),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      return id === source.id ? source : null;
    });
    Game.rooms[roomName] = room;
    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [source.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: source.id,
              roomName,
              classification: 'local',
            }),
            state: 'container-bootstrap',
            designatedMiningTile: { x: 11, y: 10, roomName },
          },
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'stationary-transition',
          sourceSlots: {
            [source.id]: {
              '9,9': {
                occupantCreepName: null,
                claimState: 'open',
                reservedAtTick: 0,
              },
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenNthCalledWith(
      1,
      ['work', 'work', 'work', 'work', 'work', 'move'],
      expect.stringMatching(/^stationaryMiner-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'stationaryMiner',
          assignedSourceId: source.id,
          assignedRoomName: roomName,
          homeRoomName: roomName,
        }),
      }),
    );
    expect(spawn.spawnCreep).toHaveBeenNthCalledWith(
      2,
      ['work', 'carry', 'move', 'move'],
      expect.stringMatching(/^bootstrap-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'worker',
          assignedSourceId: source.id,
          bootstrapAssignmentClass: 'shuttle',
          bootstrapDeliveryMode: 'harvest',
          homeRoomName: roomName,
        }),
      }),
    );
    const recoveryShuttleName = (spawn.spawnCreep as ReturnType<typeof vi.fn>).mock.calls[1]?.[1] as string;
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[recoveryShuttleName]).toMatchObject({
      creepName: recoveryShuttleName,
      assignmentClass: 'shuttle',
      sourceId: source.id,
      deliveryMode: 'harvest',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.phase).toBe('stationary-transition');
  });

  it('spawns the next stationary-transition bootstrap builder at 200 energy once all miners are staffed', () => {
    const roomName = 'W1N1';
    const sourceA = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const sourceB = {
      id: 'source-b',
      pos: {
        x: 20,
        y: 20,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const minerA = {
      name: 'miner-a',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: sourceA.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 11, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const minerB = {
      name: 'miner-b',
      memory: {
        role: 'stationaryMiner',
        assignedSourceId: sourceB.id,
        assignedRoomName: roomName,
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      store: createEnergyStore(0, 50),
      pos: { x: 21, y: 20, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const existingBuilder = {
      name: 'bootstrapBuilder-existing',
      memory: {
        role: 'bootstrapBuilder',
        assignedSourceId: sourceA.id,
        assignedRoomName: roomName,
        bootstrapAssignmentClass: 'bootstrap-builder',
        bootstrapDeliveryMode: 'build',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      pickup: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(0, 50),
      pos: { x: 12, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(OK),
    } as unknown as Creep;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(200, 0),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 200,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [minerA, minerB, existingBuilder];
          case FIND_SOURCES:
            return [sourceA, sourceB];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps = {
      [minerA.name]: minerA,
      [minerB.name]: minerB,
      [existingBuilder.name]: existingBuilder,
    };
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      if (id === sourceA.id) {
        return sourceA;
      }

      if (id === sourceB.id) {
        return sourceB;
      }

      return null;
    });
    Game.rooms[roomName] = room;

    const sourceRecordA = createDefaultSourceEconomyRecord({
      sourceId: sourceA.id,
      roomName,
      classification: 'local',
    });
    sourceRecordA.state = 'stationary-online';

    const sourceRecordB = createDefaultSourceEconomyRecord({
      sourceId: sourceB.id,
      roomName,
      classification: 'local',
    });
    sourceRecordB.state = 'stationary-online';

    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [sourceA.id]: sourceRecordA,
          [sourceB.id]: sourceRecordB,
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'stationary-transition',
          assignments: {
            [existingBuilder.name]: {
              creepName: existingBuilder.name,
              assignmentClass: 'bootstrap-builder',
              sourceId: sourceA.id,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [sourceA.id, sourceB.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledOnce();
    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      ['work', 'carry', 'move'],
      expect.stringMatching(/^bootstrapBuilder-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'bootstrapBuilder',
          assignedSourceId: sourceB.id,
          assignedRoomName: roomName,
          bootstrapAssignmentClass: 'bootstrap-builder',
          bootstrapDeliveryMode: 'build',
          homeRoomName: roomName,
        }),
      }),
    );
    const builderName = (spawn.spawnCreep as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[builderName]).toMatchObject({
      creepName: builderName,
      assignmentClass: 'bootstrap-builder',
      sourceId: sourceB.id,
      slotKey: null,
      deliveryMode: 'build',
    });
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.phase).toBe('stationary-transition');
  });

  it('spawns a stationary miner for a local source after the initial extension envelope is ready', () => {
    const source = {
      id: 'source-1',
      pos: {
        roomName: 'W1N1',
        getRangeTo: vi.fn().mockReturnValue(3),
        findInRange: vi.fn().mockReturnValue([
          {
            id: 'container-1',
            structureType: STRUCTURE_CONTAINER,
            pos: { x: 11, y: 10, roomName: 'W1N1' },
          },
        ]),
      },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 10, y: 10, roomName: 'W1N1' },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 0),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [source.id]: createDefaultSourceEconomyRecord({
            sourceId: source.id,
            roomName: room.name,
            classification: 'local',
          }),
        },
      },
    };
    Game.rooms[room.name] = room;

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledOnce();
    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringMatching(/^stationaryMiner-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'stationaryMiner',
          assignedSourceId: source.id,
          assignedRoomName: room.name,
          homeRoomName: room.name,
        }),
      }),
    );
  });

  it('respawns bootstrap labor during exit-charge after a wipe instead of stalling', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 25, y: 25, roomName },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 250),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      if (id === source.id) {
        return source;
      }

      return null;
    });
    Game.rooms[roomName] = room;

    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [source.id]: {
            ...createDefaultSourceEconomyRecord({
              sourceId: source.id,
              roomName,
              classification: 'local',
            }),
            designatedMiningTile: { x: 11, y: 10, roomName },
          },
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'exit-charge',
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledOnce();
    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      ['work', 'carry', 'move', 'move'],
      expect.stringMatching(/^bootstrap-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'worker',
          assignedSourceId: source.id,
          bootstrapAssignmentClass: 'shuttle',
          bootstrapDeliveryMode: 'harvest',
          homeRoomName: roomName,
        }),
      }),
    );
  });

  it('repurposes completed bootstrap builders back into normal worker behavior', () => {
    const roomName = 'W1N1';
    const source = {
      id: 'source-a',
      pos: {
        x: 10,
        y: 10,
        roomName,
        getRangeTo: vi.fn().mockReturnValue(1),
        findInRange: vi.fn().mockReturnValue([]),
      },
    } as unknown as Source;
    const builder = {
      name: 'builder-1',
      memory: {
        role: 'bootstrapBuilder',
        assignedSourceId: source.id,
        bootstrapAssignmentClass: 'bootstrap-builder',
        bootstrapDeliveryMode: 'build',
        homeRoomName: roomName,
      },
      moveTo: vi.fn(),
      pickup: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(0, 50),
      pos: { x: 11, y: 10, roomName, getRangeTo: vi.fn().mockReturnValue(1) },
      upgradeController: vi.fn().mockReturnValue(0),
    } as unknown as Creep;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: roomName,
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [builder];
          case FIND_SOURCES:
            return [source];
          case FIND_HOSTILE_CREEPS:
          case FIND_MY_STRUCTURES:
          case FIND_CONSTRUCTION_SITES:
          case FIND_DROPPED_RESOURCES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    Game.creeps[builder.name] = builder;
    Game.getObjectById = vi.fn().mockImplementation((id: string) => {
      return id === source.id ? source : null;
    });
    Game.rooms[roomName] = room;

    const sourceRecord = createDefaultSourceEconomyRecord({
      sourceId: source.id,
      roomName,
      classification: 'local',
    });
    sourceRecord.state = 'logistics-active';

    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        localSourceHardeningComplete: false,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [source.id]: sourceRecord,
        },
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          phase: 'complete',
          assignments: {
            [builder.name]: {
              creepName: builder.name,
              assignmentClass: 'bootstrap-builder',
              sourceId: source.id,
              slotKey: null,
              deliveryMode: 'build',
            },
          },
        },
      },
    };

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName,
      controllerLevel: 2,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [source.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.assignments[builder.name]).toBeUndefined();
    expect(builder.memory.role).toBe('worker');
    expect(builder.memory.bootstrapAssignmentClass).toBeUndefined();
    expect(runWithdraw).not.toHaveBeenCalled();
    expect(runHarvest).toHaveBeenCalledWith(builder, { source });
  });

  it('seeds visible adjacent remote sources after local hardening completes', () => {
    const creep = createCreep('generalist', 0);
    const localSource = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const remoteSource = {
      id: 'remote-source-1',
      pos: { roomName: 'W1N2', x: 20, y: 20, getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 10, y: 10, roomName: 'W1N1' },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 0),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [localSource];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;
    const remoteRoom = {
      name: 'W1N2',
      controller: { my: false },
      find: vi.fn().mockImplementation((findConstant: number) => {
        return findConstant === FIND_SOURCES ? [remoteSource] : [];
      }),
    } as unknown as Room;

    const localRecord = createDefaultSourceEconomyRecord({
      sourceId: localSource.id,
      roomName: room.name,
      classification: 'local',
    });
    localRecord.state = 'logistics-active';

    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        localSourceHardeningComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [localSource.id]: localRecord,
        },
      },
    };

    Game.rooms[room.name] = room;
    Game.rooms[remoteRoom.name] = remoteRoom;
    Game.map.describeExits = vi.fn().mockReturnValue({ 1: remoteRoom.name });

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [localSource.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(Memory.imperium.rooms[room.name]?.economy.sourceRecords[remoteSource.id]).toMatchObject({
      sourceId: remoteSource.id,
      classification: 'remote',
      roomName: remoteRoom.name,
      designatedMiningTile: { x: 20, y: 20, roomName: remoteRoom.name },
    });
  });

  it('spawns a scout for an unseen adjacent room after local hardening completes', () => {
    const creep = createCreep('generalist', 0);
    const localSource = {
      id: 'source-1',
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as Source;
    const spawn = {
      id: 'spawn-1',
      structureType: STRUCTURE_SPAWN,
      pos: { x: 10, y: 10, roomName: 'W1N1' },
      spawning: null,
      spawnCreep: vi.fn().mockReturnValue(OK),
      store: createEnergyStore(300, 0),
    } as unknown as StructureSpawn;
    const controller = {
      id: 'controller-1',
      level: 2,
      my: true,
      pos: { roomName: 'W1N1', getRangeTo: vi.fn().mockReturnValue(3) },
    } as unknown as StructureController;
    const room = {
      name: 'W1N1',
      controller,
      energyAvailable: 550,
      energyCapacityAvailable: 550,
      memory: {},
      createConstructionSite: vi.fn().mockReturnValue(OK),
      find: vi.fn().mockImplementation((findConstant: number) => {
        switch (findConstant) {
          case FIND_MY_CREEPS:
            return [creep];
          case FIND_SOURCES:
            return [localSource];
          case FIND_HOSTILE_CREEPS:
            return [];
          case FIND_MY_STRUCTURES:
            return [spawn];
          case FIND_CONSTRUCTION_SITES:
            return [];
          default:
            return [];
        }
      }),
    } as unknown as Room;

    const localRecord = createDefaultSourceEconomyRecord({
      sourceId: localSource.id,
      roomName: room.name,
      classification: 'local',
    });
    localRecord.state = 'logistics-active';

    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: {
        ...createDefaultRoomEconomyRecord(room.name),
        cachedStructuralEnergyCapacity: 550,
        extensionBuildoutComplete: true,
        localSourceHardeningComplete: true,
        lastStructuralReviewTick: Game.time,
        sourceRecords: {
          [localSource.id]: localRecord,
        },
      },
    };

    Game.rooms[room.name] = room;
    Game.map.describeExits = vi.fn().mockReturnValue({ 1: 'W1N2' });

    summarizeRoomEconomySnapshot.mockReturnValue({
      roomName: room.name,
      controllerLevel: 2,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      initialExtensionEnvelopeReady: true,
      extensionBuildoutComplete: true,
      hostileCount: 0,
      localSourceIds: [localSource.id],
      remoteSourceIds: [],
    });

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringMatching(/^scout-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'scout',
          assignedRoomName: 'W1N2',
          homeRoomName: room.name,
        }),
      }),
    );
  });
});
