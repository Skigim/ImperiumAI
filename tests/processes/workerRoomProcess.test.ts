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
      energyCapacityAvailable: 300,
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
      energyCapacityAvailable: 300,
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
      energyCapacityAvailable: 300,
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
            throw new Error('unexpected extension scan');
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
        cachedStructuralEnergyCapacity: 300,
        extensionBuildoutComplete: false,
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

  it('spawns a generalist when the room has no workforce and an idle spawn', () => {
    const source = {
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

    createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

    expect(spawn.spawnCreep).toHaveBeenCalledOnce();
    expect(spawn.spawnCreep).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringMatching(/^generalist-/),
      expect.objectContaining({
        memory: expect.objectContaining({
          role: 'generalist',
          homeRoomName: room.name,
        }),
      }),
    );
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

  it('clears slot claims and unmatched hauler reroutes when a rerouted shuttle dies', () => {
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

    Memory.imperium.rooms[roomName] = {
      roomName,
      lastSeenTick: Game.time - 1,
      economy: {
        ...createDefaultRoomEconomyRecord(roomName),
        bootstrap: {
          ...createDefaultRoomEconomyRecord(roomName).bootstrap,
          sourceSlots: {
            'source-a': {
              '10,10': {
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
              slotKey: '10,10',
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
            return [];
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
      Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots['source-a']?.['10,10']
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
              '10,10': { occupantCreepName: null, claimState: 'open', reservedAtTick: 0 },
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
          bootstrapSlotKey: '10,10',
          bootstrapDeliveryMode: 'harvest',
          homeRoomName: roomName,
        }),
      }),
    );
    expect(Memory.imperium.rooms[roomName]?.economy.bootstrap.sourceSlots['source-a']?.['10,10']).toMatchObject({
      occupantCreepName: expect.stringMatching(/^bootstrap-/),
      claimState: 'reserved',
      reservedAtTick: Game.time,
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