import {
  detectStructuralEnvelopeChange,
  summarizeRoomEconomySnapshot,
} from '../domain/roomEconomy';
import type { KernelProcess, ProcessStatus } from '../kernel/process';
import type { RoomDomainMemory } from '../model/memory';
import {
  createDefaultRoomEconomyRecord,
  createDefaultSourceEconomyRecord,
} from '../model/roomEconomy';
import type { PersistedRoomPosition, SourceEconomyRecord } from '../model/roomEconomy';
import {
  applyPassiveRemoteRecovery,
  chooseNextCommissioningSource,
  deriveRoomPhase,
  REMOTE_RISK_REVIEW_INTERVAL,
  advanceSourceState,
} from '../policies/roomEconomyPolicy';
import { runBuild } from '../tasks/build';
import { runHarvest } from '../tasks/harvest';
import { runRepair } from '../tasks/repair';
import { findTransferTarget, runTransfer } from '../tasks/transfer';
import { runWithdraw } from '../tasks/withdraw';

const STRUCTURAL_REVIEW_INTERVAL = 10;
const REMOTE_DISTANCE_BASE = 25;
const REMOTE_LINEAR_ROOM_MULTIPLIER = 50;

const toPersistedRoomPosition = (
  position: RoomPosition | { x?: number; y?: number; roomName?: string } | null,
): PersistedRoomPosition | null => {
  if (
    position &&
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    typeof position.roomName === 'string'
  ) {
    return {
      x: position.x,
      y: position.y,
      roomName: position.roomName,
    };
  }

  return null;
};

const getNearbySourceInfrastructure = (
  source: Source,
): {
  container: StructureContainer | null;
  road: StructureRoad | null;
} => {
  if (typeof source.pos.findInRange !== 'function') {
    return { container: null, road: null };
  }

  const nearbyStructures = source.pos.findInRange(FIND_STRUCTURES, 1) as Array<
    StructureContainer | StructureRoad | Structure
  >;

  let container: StructureContainer | null = null;
  let road: StructureRoad | null = null;

  for (const structure of nearbyStructures) {
    if (!container && structure.structureType === STRUCTURE_CONTAINER) {
      container = structure as StructureContainer;
      continue;
    }

    if (!road && structure.structureType === STRUCTURE_ROAD) {
      road = structure as StructureRoad;
    }
  }

  return { container, road };
};

const reevaluateLocalSourceRecord = (
  sourceRecord: SourceEconomyRecord,
  source: Source,
  creeps: readonly Creep[],
  structuralEnergyCapacity: number,
): SourceEconomyRecord => {
  if (sourceRecord.classification !== 'local') {
    return sourceRecord;
  }

  const { container, road } = getNearbySourceInfrastructure(source);
  const assignedMiner = creeps.find((creep) => {
    return (
      creep.memory.role === 'stationaryMiner' &&
      creep.memory.assignedSourceId === source.id &&
      typeof creep.pos?.getRangeTo === 'function' &&
      creep.pos.getRangeTo(source.pos) <= 1
    );
  });
  const assignedHauler = creeps.find((creep) => {
    return (
      creep.memory.role === 'routeHauler' &&
      creep.memory.assignedSourceId === source.id &&
      typeof creep.pos?.getRangeTo === 'function' &&
      creep.pos.getRangeTo(source.pos) <= 1
    );
  });

  const observedRecord: SourceEconomyRecord = {
    ...sourceRecord,
    containerId: container?.id ?? sourceRecord.containerId,
    containerPosition:
      toPersistedRoomPosition(container?.pos ?? null) ?? sourceRecord.containerPosition,
    roadAnchor: toPersistedRoomPosition(road?.pos ?? null) ?? sourceRecord.roadAnchor,
    designatedMiningTile:
      toPersistedRoomPosition(assignedMiner?.pos ?? null) ?? sourceRecord.designatedMiningTile,
  };

  return advanceSourceState(observedRecord, {
    tick: Game.time,
    structuralEnergyCapacity,
    containerComplete: container !== null,
    roadComplete: road !== null,
    routeRiskDetected: false,
    hostileDetected: false,
    logisticsServiced: assignedHauler !== undefined,
    minerOnPrimeTile: assignedMiner !== undefined,
  });
};

const ensureRoomEconomyMemory = (room: Room): RoomDomainMemory => {
  const existing = Memory.imperium.rooms[room.name];

  if (existing) {
    return existing;
  }

  const created: RoomDomainMemory = {
    roomName: room.name,
    lastSeenTick: Game.time,
    economy: createDefaultRoomEconomyRecord(room.name),
  };

  Memory.imperium.rooms[room.name] = created;
  return created;
};

const ensureLocalSourceRecords = (
  room: Room,
  localSources: readonly Source[],
): void => {
  const roomMemory = Memory.imperium.rooms[room.name];

  if (!roomMemory) {
    return;
  }

  for (const source of localSources) {
    if (roomMemory.economy.sourceRecords[source.id]) {
      continue;
    }

    roomMemory.economy.sourceRecords[source.id] = createDefaultSourceEconomyRecord({
      sourceId: source.id,
      roomName: room.name,
      classification: 'local',
    });
  }
};

const countExtensions = (room: Room): number => {
  return room.find(FIND_MY_STRUCTURES, {
    filter: (structure): structure is StructureExtension => {
      return structure.structureType === STRUCTURE_EXTENSION;
    },
  }).length;
};

const areLocalSourcesHardened = (
  economy: RoomDomainMemory['economy'],
  localSourceIds: readonly Id<Source>[],
): boolean => {
  if (localSourceIds.length === 0) {
    return false;
  }

  return localSourceIds.every((sourceId) => {
    const record = economy.sourceRecords[sourceId];

    return record?.state === 'logistics-active';
  });
};

const getStoredSourcePosition = (
  source: SourceEconomyRecord,
): PersistedRoomPosition | null => {
  return source.designatedMiningTile ?? source.containerPosition ?? source.roadAnchor;
};

const getRoomDistanceHeuristic = (originRoomName: string, targetRoomName: string): number => {
  const roomDistance = Game.map?.getRoomLinearDistance?.(originRoomName, targetRoomName);

  return REMOTE_DISTANCE_BASE +
    (typeof roomDistance === 'number' ? roomDistance : 1) * REMOTE_LINEAR_ROOM_MULTIPLIER;
};

const estimateRecordedSourceDistance = (
  anchor: StructureController,
  source: SourceEconomyRecord,
): number | null => {
  const storedPosition = getStoredSourcePosition(source);

  if (storedPosition && storedPosition.roomName === anchor.pos.roomName) {
    return Math.max(
      Math.abs(anchor.pos.x - storedPosition.x),
      Math.abs(anchor.pos.y - storedPosition.y),
    );
  }

  if (storedPosition) {
    return getRoomDistanceHeuristic(anchor.pos.roomName, storedPosition.roomName);
  }

  if (source.roomName !== anchor.pos.roomName) {
    return getRoomDistanceHeuristic(anchor.pos.roomName, source.roomName);
  }

  return null;
};

const buildPathDistanceBySourceId = (
  room: Room,
  localSources: readonly Source[],
  sourceRecords: RoomDomainMemory['economy']['sourceRecords'],
): Record<string, number> => {
  const anchor = room.controller;

  if (!anchor) {
    return {};
  }

  const distances = localSources.reduce<Record<string, number>>((distances, source) => {
    distances[source.id] = anchor.pos.getRangeTo(source.pos);
    return distances;
  }, {});

  for (const sourceRecord of Object.values(sourceRecords)) {
    if (typeof distances[sourceRecord.sourceId] === 'number') {
      continue;
    }

    const visibleSource = Game.getObjectById(sourceRecord.sourceId);

    if (visibleSource) {
      distances[sourceRecord.sourceId] = anchor.pos.getRangeTo(visibleSource.pos);
      continue;
    }

    const estimatedDistance = estimateRecordedSourceDistance(anchor, sourceRecord);

    if (typeof estimatedDistance === 'number') {
      distances[sourceRecord.sourceId] = estimatedDistance;
    }
  }

  return distances;
};

const reviewRemoteSourceRecovery = (economy: RoomDomainMemory['economy']): void => {
  if (Game.time - economy.lastRemoteRiskReviewTick < REMOTE_RISK_REVIEW_INTERVAL) {
    return;
  }

  economy.lastRemoteRiskReviewTick = Game.time;

  for (const sourceRecord of Object.values(economy.sourceRecords)) {
    if (sourceRecord.classification !== 'remote') {
      continue;
    }

    economy.sourceRecords[sourceRecord.sourceId] = applyPassiveRemoteRecovery(
      sourceRecord,
      Game.time,
    );
  }
};

const getAssignedSource = (creep: Creep): Source | null => {
  if (!creep.memory.assignedSourceId) {
    return null;
  }

  return Game.getObjectById(creep.memory.assignedSourceId);
};

const runHarvestFromAssignment = (creep: Creep): void => {
  const source = getAssignedSource(creep);

  if (source) {
    runHarvest(creep, { source });
    return;
  }

  runHarvest(creep);
};

const runDelivery = (creep: Creep): boolean => {
  const target = findTransferTarget(creep, creep.memory.transferTargetId);

  if (!target) {
    delete creep.memory.transferTargetId;
    return false;
  }

  creep.memory.transferTargetId = target.id;
  runTransfer(creep, { target });
  return true;
};

const runControllerUpgrade = (
  creep: Creep,
  controller: StructureController,
): void => {
  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller);
  }
};

const runBootstrapBuilder = (creep: Creep): void => {
  if (creep.store[RESOURCE_ENERGY] === 0) {
    runHarvestFromAssignment(creep);
    return;
  }

  runBuild(creep);
};

const runStationaryMiner = (creep: Creep): void => {
  const source = getAssignedSource(creep);

  if (!source) {
    return;
  }

  runHarvest(creep, { source });
};

const runRouteHauler = (creep: Creep): void => {
  if (creep.store[RESOURCE_ENERGY] === 0) {
    delete creep.memory.transferTargetId;
    runWithdraw(creep);
    return;
  }

  if (!runDelivery(creep) && creep.store[RESOURCE_ENERGY] > 25) {
    runRepair(creep);
  }
};

const runGeneralist = (creep: Creep, controller: StructureController): void => {
  if (creep.store[RESOURCE_ENERGY] === 0) {
    runHarvestFromAssignment(creep);
    return;
  }

  if (!runDelivery(creep)) {
    runControllerUpgrade(creep, controller);
  }
};

export const createWorkerRoomProcess = (roomName: string): KernelProcess => {
  return {
    id: `process.room.economy.${roomName}`,
    label: `RoomEconomyProcess(${roomName})`,
    priority: 10,
    run(): ProcessStatus {
      const room = Game.rooms[roomName];

      if (!room?.controller?.my) {
        return 'suspended';
      }

      const roomMemory = ensureRoomEconomyMemory(room);
      const localSources = room.find(FIND_SOURCES);

      ensureLocalSourceRecords(room, localSources);

      const economy = roomMemory.economy;
      const structuralChanged = detectStructuralEnvelopeChange(
        economy.cachedStructuralEnergyCapacity,
        room.energyCapacityAvailable,
      );
      const shouldRunStructuralReview =
        structuralChanged ||
        Game.time - economy.lastStructuralReviewTick >= STRUCTURAL_REVIEW_INTERVAL;

      const snapshot = summarizeRoomEconomySnapshot({
        roomName: room.name,
        controllerLevel: room.controller.level,
        energyAvailable: room.energyAvailable,
        energyCapacityAvailable: room.energyCapacityAvailable,
        extensionCount: shouldRunStructuralReview
          ? countExtensions(room)
          : economy.extensionBuildoutComplete
            ? 5
            : 0,
        localSourceIds: localSources.map((source) => source.id),
        remoteSourceIds: Object.values(economy.sourceRecords)
          .filter((source) => source.classification === 'remote')
          .map((source) => source.sourceId),
        hostileCount: room.find(FIND_HOSTILE_CREEPS).length,
      });

      if (shouldRunStructuralReview) {
        economy.cachedStructuralEnergyCapacity = snapshot.energyCapacityAvailable;
        economy.extensionBuildoutComplete = snapshot.extensionBuildoutComplete;
        economy.lastStructuralReviewTick = Game.time;
      }

      const creeps = room.find(FIND_MY_CREEPS);

      for (const localSource of localSources) {
        const sourceRecord = economy.sourceRecords[localSource.id];

        if (!sourceRecord) {
          continue;
        }

        economy.sourceRecords[localSource.id] = reevaluateLocalSourceRecord(
          sourceRecord,
          localSource,
          creeps,
          snapshot.energyCapacityAvailable,
        );
      }

      reviewRemoteSourceRecovery(economy);

      economy.localSourceHardeningComplete = areLocalSourcesHardened(
        economy,
        snapshot.localSourceIds,
      );
      economy.phase = deriveRoomPhase({
        room: economy,
        extensionBuildoutComplete: economy.extensionBuildoutComplete,
        controllerLevel: snapshot.controllerLevel,
        localSourceHardeningComplete: economy.localSourceHardeningComplete,
      });
      economy.currentCommissioningSourceId = chooseNextCommissioningSource(
        economy,
        buildPathDistanceBySourceId(room, localSources, economy.sourceRecords),
        Game.time,
      );

      roomMemory.lastSeenTick = Game.time;

      room.memory.workerCount = creeps.length;

      for (const creep of creeps) {
        switch (creep.memory.role) {
          case 'bootstrapBuilder':
            runBootstrapBuilder(creep);
            break;
          case 'stationaryMiner':
            runStationaryMiner(creep);
            break;
          case 'routeHauler':
            runRouteHauler(creep);
            break;
          default:
            runGeneralist(creep, room.controller);
            break;
        }
      }

      return 'completed';
    },
  };
};