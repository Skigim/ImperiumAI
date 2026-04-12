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
  RESOURCE_ENERGY: 'energy',
  STRUCTURE_CONTAINER: 'container',
  STRUCTURE_ROAD: 'road',
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
        map: {
          getRoomLinearDistance: vi.fn().mockReturnValue(1),
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
});