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
  advanceSourceState,
  applyPassiveRemoteRecovery,
  chooseNextCommissioningSource,
  deriveRoomPhase,
  REMOTE_RISK_REVIEW_INTERVAL,
} from '../policies/roomEconomyPolicy';
import { runBuild } from '../tasks/build';
import { runHarvest } from '../tasks/harvest';
import { runRepair } from '../tasks/repair';
import { findTransferTarget, runTransfer } from '../tasks/transfer';
import { runWithdraw } from '../tasks/withdraw';

const STRUCTURAL_REVIEW_INTERVAL = 10;
const REMOTE_DISTANCE_BASE = 25;
const REMOTE_LINEAR_ROOM_MULTIPLIER = 50;
const REPAIR_THRESHOLD = 25;
const GENERALIST_BODY: BodyPartConstant[] = ['work', 'carry', 'move'];
const BUILDER_BODY: BodyPartConstant[] = ['work', 'carry', 'move'];
const SCOUT_BODY: BodyPartConstant[] = ['move'];
const ROUTE_HAULER_BODY: BodyPartConstant[] = ['work', 'carry', 'carry', 'move'];
const STATIONARY_MINER_BODY: BodyPartConstant[] = ['work', 'work', 'work', 'work', 'work', 'move'];
const INITIAL_EXTENSION_LAYOUT: Array<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [-2, 0],
  [2, 0],
];
const TOWER_LAYOUT: Array<readonly [number, number]> = [[0, 2]];

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

const getConstructionSites = (room: Room): ConstructionSite[] => {
  return room.find(FIND_CONSTRUCTION_SITES) as ConstructionSite[];
};

const getManagedCreeps = (room: Room): Creep[] => {
  const globalCreeps = Object.values(Game.creeps ?? {}).filter((creep) => {
    const homeRoomName = creep.memory.homeRoomName ?? creep.room?.name;
    return homeRoomName === room.name;
  });

  if (globalCreeps.length > 0) {
    return globalCreeps;
  }

  return room.find(FIND_MY_CREEPS) as Creep[];
};

const countExtensions = (room: Room): number => {
  return (room.find(FIND_MY_STRUCTURES) as Structure[]).filter((structure) => {
    return structure.structureType === STRUCTURE_EXTENSION;
  }).length;
};

const getOwnedSpawns = (room: Room): StructureSpawn[] => {
  return (room.find(FIND_MY_STRUCTURES) as Structure[]).filter((structure) => {
    return structure.structureType === STRUCTURE_SPAWN;
  }) as StructureSpawn[];
};

const getIdleSpawn = (room: Room): StructureSpawn | null => {
  return getOwnedSpawns(room).find((spawn) => spawn.spawning === null) ?? null;
};

const getExtensionTargetCount = (controllerLevel: number): number => {
  if (controllerLevel >= 3) {
    return 10;
  }

  if (controllerLevel >= 2) {
    return 5;
  }

  return 0;
};

const getTowerTargetCount = (controllerLevel: number): number => {
  return controllerLevel >= 3 ? 1 : 0;
};

const isInBounds = (x: number, y: number): boolean => {
  return x > 0 && x < 49 && y > 0 && y < 49;
};

const getExistingSitesByType = (
  room: Room,
  structureType: BuildableStructureConstant,
): number => {
  return getConstructionSites(room).filter((site) => site.structureType === structureType).length;
};

const placeLayoutSites = (
  room: Room,
  anchor: RoomPosition | { x: number; y: number; roomName: string },
  layout: readonly (readonly [number, number])[],
  structureType: BuildableStructureConstant,
  missingCount: number,
): void => {
  let remaining = missingCount;

  for (const [dx, dy] of layout) {
    if (remaining <= 0) {
      return;
    }

    const x = anchor.x + dx;
    const y = anchor.y + dy;

    if (!isInBounds(x, y)) {
      continue;
    }

    if (room.createConstructionSite(x, y, structureType) === OK) {
      remaining -= 1;
    }
  }
};

const ensureRoomLevelConstructionSites = (room: Room): void => {
  const spawn = getOwnedSpawns(room)[0];

  if (!spawn) {
    return;
  }

  const extensionTarget = getExtensionTargetCount(room.controller?.level ?? 0);
  const existingExtensions = countExtensions(room);
  const extensionSites = getExistingSitesByType(room, STRUCTURE_EXTENSION);
  const missingExtensions = Math.max(0, extensionTarget - existingExtensions - extensionSites);

  if (missingExtensions > 0) {
    placeLayoutSites(room, spawn.pos, INITIAL_EXTENSION_LAYOUT, STRUCTURE_EXTENSION, missingExtensions);
  }

  const towerTarget = getTowerTargetCount(room.controller?.level ?? 0);
  const existingTowers = (room.find(FIND_MY_STRUCTURES) as Structure[]).filter((structure) => {
    return structure.structureType === STRUCTURE_TOWER;
  }).length;
  const towerSites = getExistingSitesByType(room, STRUCTURE_TOWER);
  const missingTowers = Math.max(0, towerTarget - existingTowers - towerSites);

  if (missingTowers > 0) {
    placeLayoutSites(room, spawn.pos, TOWER_LAYOUT, STRUCTURE_TOWER, missingTowers);
  }
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

const areLocalSourcesHardened = (
  economy: RoomDomainMemory['economy'],
  localSourceIds: readonly Id<Source>[],
): boolean => {
  if (localSourceIds.length === 0) {
    return false;
  }

  return localSourceIds.every((sourceId) => economy.sourceRecords[sourceId]?.state === 'logistics-active');
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

  const distances = localSources.reduce<Record<string, number>>((result, source) => {
    result[source.id] = anchor.pos.getRangeTo(source.pos);
    return result;
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

const getAdjacentRoomNames = (roomName: string): string[] => {
  const exits = Game.map?.describeExits?.(roomName) ?? {};
  return [...new Set(Object.values(exits).filter((name): name is string => typeof name === 'string'))];
};

const seedVisibleRemoteSourceRecords = (
  room: Room,
  economy: RoomDomainMemory['economy'],
): void => {
  for (const remoteRoomName of getAdjacentRoomNames(room.name)) {
    const visibleRoom = Game.rooms[remoteRoomName];

    if (!visibleRoom || visibleRoom.controller?.my) {
      continue;
    }

    for (const source of visibleRoom.find(FIND_SOURCES) as Source[]) {
      if (economy.sourceRecords[source.id]) {
        continue;
      }

      const sourceRecord = createDefaultSourceEconomyRecord({
        sourceId: source.id,
        roomName: remoteRoomName,
        classification: 'remote',
      });
      sourceRecord.designatedMiningTile = toPersistedRoomPosition(source.pos);
      economy.sourceRecords[source.id] = sourceRecord;
    }
  }
};

const getUnseenAdjacentRoomName = (
  room: Room,
  economy: RoomDomainMemory['economy'],
): string | null => {
  const knownRemoteRooms = new Set(
    Object.values(economy.sourceRecords)
      .filter((source) => source.classification === 'remote')
      .map((source) => source.roomName),
  );

  for (const remoteRoomName of getAdjacentRoomNames(room.name)) {
    if (Game.rooms[remoteRoomName]) {
      continue;
    }

    if (!knownRemoteRooms.has(remoteRoomName)) {
      return remoteRoomName;
    }
  }

  return null;
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

const chooseAdjacentTile = (
  room: Room,
  source: Source,
  usedPosition?: PersistedRoomPosition | null,
): PersistedRoomPosition | null => {
  const controllerOrSpawn = room.controller?.pos ?? getOwnedSpawns(room)[0]?.pos ?? null;
  const terrain = typeof room.getTerrain === 'function' ? room.getTerrain() : null;
  let bestPosition: PersistedRoomPosition | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const x = source.pos.x + dx;
      const y = source.pos.y + dy;

      if (!isInBounds(x, y)) {
        continue;
      }

      if (terrain && terrain.get(x, y) === TERRAIN_MASK_WALL) {
        continue;
      }

      if (usedPosition && usedPosition.roomName === source.pos.roomName && usedPosition.x === x && usedPosition.y === y) {
        continue;
      }

      const score = controllerOrSpawn
        ? Math.max(Math.abs(controllerOrSpawn.x - x), Math.abs(controllerOrSpawn.y - y))
        : Math.max(Math.abs(dx), Math.abs(dy));

      if (score < bestScore) {
        bestScore = score;
        bestPosition = { x, y, roomName: source.pos.roomName };
      }
    }
  }

  return bestPosition;
};

const ensureSourceInfrastructureSites = (
  room: Room,
  source: Source,
  sourceRecord: SourceEconomyRecord,
): SourceEconomyRecord => {
  const sourceRoom = Game.rooms[source.pos.roomName] ?? room;
  const constructionSites = getConstructionSites(sourceRoom);
  let nextRecord = { ...sourceRecord };

  if (!nextRecord.designatedMiningTile) {
    nextRecord.designatedMiningTile = chooseAdjacentTile(sourceRoom, source) ?? toPersistedRoomPosition(source.pos);
  }

  if (
    nextRecord.designatedMiningTile &&
    !nextRecord.containerId &&
    !constructionSites.some((site) => {
      return (
        site.structureType === STRUCTURE_CONTAINER &&
        site.pos.x === nextRecord.designatedMiningTile?.x &&
        site.pos.y === nextRecord.designatedMiningTile?.y &&
        site.pos.roomName === nextRecord.designatedMiningTile?.roomName
      );
    })
  ) {
    sourceRoom.createConstructionSite(
      nextRecord.designatedMiningTile.x,
      nextRecord.designatedMiningTile.y,
      STRUCTURE_CONTAINER,
    );
  }

  const roadAnchor =
    nextRecord.roadAnchor ?? chooseAdjacentTile(sourceRoom, source, nextRecord.designatedMiningTile);

  if (
    roadAnchor &&
    !constructionSites.some((site) => {
      return (
        site.structureType === STRUCTURE_ROAD &&
        site.pos.x === roadAnchor.x &&
        site.pos.y === roadAnchor.y &&
        site.pos.roomName === roadAnchor.roomName
      );
    })
  ) {
    sourceRoom.createConstructionSite(roadAnchor.x, roadAnchor.y, STRUCTURE_ROAD);
    nextRecord = {
      ...nextRecord,
      roadAnchor,
    };
  }

  return nextRecord;
};

const syncSourceAssignments = (
  economy: RoomDomainMemory['economy'],
  creeps: readonly Creep[],
): void => {
  for (const sourceRecord of Object.values(economy.sourceRecords)) {
    economy.sourceRecords[sourceRecord.sourceId] = {
      ...sourceRecord,
      assignedMinerName: null,
      assignedBuilderNames: [],
      assignedHaulerNames: [],
    };
  }

  for (const creep of creeps) {
    if (!creep.memory.assignedSourceId) {
      continue;
    }

    const sourceRecord = economy.sourceRecords[creep.memory.assignedSourceId];

    if (!sourceRecord) {
      continue;
    }

    if (creep.memory.role === 'stationaryMiner') {
      sourceRecord.assignedMinerName = creep.name;
    }

    if (creep.memory.role === 'bootstrapBuilder') {
      sourceRecord.assignedBuilderNames = [...sourceRecord.assignedBuilderNames, creep.name];
    }

    if (creep.memory.role === 'routeHauler') {
      sourceRecord.assignedHaulerNames = [...sourceRecord.assignedHaulerNames, creep.name];
    }
  }
};

const reevaluateSourceRecord = (
  sourceRecord: SourceEconomyRecord,
  source: Source,
  creeps: readonly Creep[],
  structuralEnergyCapacity: number,
): SourceEconomyRecord => {
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
      (creep.memory.assignedRoomName === source.pos.roomName ||
        (typeof creep.pos?.getRangeTo === 'function' && creep.pos.getRangeTo(source.pos) <= 1))
    );
  });
  const sourceRoom = Game.rooms[source.pos.roomName];
  const hostileDetected = Boolean(sourceRoom?.find(FIND_HOSTILE_CREEPS)?.length);

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
    hostileDetected,
    logisticsServiced: assignedHauler !== undefined,
    minerOnPrimeTile: assignedMiner !== undefined,
  });
};

const getAssignedSource = (creep: Creep): Source | null => {
  if (!creep.memory.assignedSourceId) {
    return null;
  }

  return Game.getObjectById(creep.memory.assignedSourceId);
};

const moveToAssignedRoom = (creep: Creep): boolean => {
  if (!creep.memory.assignedRoomName) {
    return false;
  }

  const currentRoomName = creep.room?.name ?? creep.pos?.roomName;

  if (currentRoomName === creep.memory.assignedRoomName) {
    return false;
  }

  creep.moveTo(new RoomPosition(25, 25, creep.memory.assignedRoomName));
  return true;
};

const moveToHomeRoom = (creep: Creep): boolean => {
  if (!creep.memory.homeRoomName) {
    return false;
  }

  const currentRoomName = creep.room?.name ?? creep.pos?.roomName;

  if (currentRoomName === creep.memory.homeRoomName) {
    return false;
  }

  creep.moveTo(new RoomPosition(25, 25, creep.memory.homeRoomName));
  return true;
};

const runHarvestFromAssignment = (creep: Creep): void => {
  if (moveToAssignedRoom(creep)) {
    return;
  }

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
  if (moveToAssignedRoom(creep)) {
    return;
  }

  if (creep.store[RESOURCE_ENERGY] === 0) {
    runHarvestFromAssignment(creep);
    return;
  }

  runBuild(creep);
};

const runStationaryMiner = (creep: Creep): void => {
  if (moveToAssignedRoom(creep)) {
    return;
  }

  const source = getAssignedSource(creep);

  if (!source) {
    return;
  }

  runHarvest(creep, { source });
};

const runRouteHauler = (
  creep: Creep,
  sourceRecords: RoomDomainMemory['economy']['sourceRecords'],
): void => {
  if (creep.store[RESOURCE_ENERGY] === 0) {
    delete creep.memory.transferTargetId;

    if (moveToAssignedRoom(creep)) {
      return;
    }

    const sourceRecord = creep.memory.assignedSourceId
      ? sourceRecords[creep.memory.assignedSourceId]
      : null;
    const container = sourceRecord?.containerId ? Game.getObjectById(sourceRecord.containerId) : null;

    if (container) {
      runWithdraw(creep, { target: container });
      return;
    }

    runWithdraw(creep);
    return;
  }

  if (moveToHomeRoom(creep)) {
    return;
  }

  if (!runDelivery(creep) && creep.store[RESOURCE_ENERGY] > REPAIR_THRESHOLD) {
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

const runScout = (creep: Creep): void => {
  if (!creep.memory.assignedRoomName) {
    return;
  }

  const currentRoomName = creep.room?.name ?? creep.pos?.roomName;

  if (currentRoomName !== creep.memory.assignedRoomName) {
    creep.moveTo(new RoomPosition(25, 25, creep.memory.assignedRoomName));
  }
};

const getSourceRecordNeedsContainer = (sourceRecord: SourceEconomyRecord): boolean => {
  return sourceRecord.containerId === null && sourceRecord.containerPosition === null;
};

const getLocalCommissioningSourceId = (
  economy: RoomDomainMemory['economy'],
  localSourceIds: readonly Id<Source>[],
): Id<Source> | null => {
  for (const sourceId of localSourceIds) {
    const sourceRecord = economy.sourceRecords[sourceId];

    if (sourceRecord && sourceRecord.state !== 'logistics-active') {
      return sourceId;
    }
  }

  return null;
};

const createSpawnRequest = (
  room: Room,
  role: NonNullable<CreepMemory['role']>,
  body: BodyPartConstant[],
  memory: Partial<CreepMemory> = {},
): ScreepsReturnCode => {
  let spawn: StructureSpawn | null;

  try {
    spawn = getIdleSpawn(room);
  } catch {
    return -4;
  }

  if (!spawn) {
    return -4;
  }

  const name = `${role}-${Game.time}`;

  return spawn.spawnCreep(body, name, {
    memory: {
      role,
      homeRoomName: room.name,
      ...memory,
    },
  });
};

const spawnNeededCreep = (
  room: Room,
  economy: RoomDomainMemory['economy'],
  creeps: readonly Creep[],
  snapshot: ReturnType<typeof summarizeRoomEconomySnapshot>,
): void => {
  const generalists = creeps.filter((creep) => {
    return creep.memory.role === 'generalist' || creep.memory.role === 'worker' || creep.memory.role === undefined;
  });
  const builders = creeps.filter((creep) => creep.memory.role === 'bootstrapBuilder');
  const miners = creeps.filter((creep) => creep.memory.role === 'stationaryMiner');
  const haulers = creeps.filter((creep) => creep.memory.role === 'routeHauler');
  const scouts = creeps.filter((creep) => creep.memory.role === 'scout');
  const constructionSites = getConstructionSites(room);
  const localCommissioningSourceId = getLocalCommissioningSourceId(economy, snapshot.localSourceIds);
  const localCommissioningSource =
    localCommissioningSourceId !== null ? economy.sourceRecords[localCommissioningSourceId] : null;
  const remoteCommissioningSource =
    economy.currentCommissioningSourceId !== null
      ? economy.sourceRecords[economy.currentCommissioningSourceId]
      : null;
  const unseenAdjacentRoom = getUnseenAdjacentRoomName(room, economy);

  if (generalists.length === 0 && room.energyCapacityAvailable <= 300) {
    createSpawnRequest(room, 'generalist', GENERALIST_BODY);
    return;
  }

  if (!economy.extensionBuildoutComplete) {
    if (generalists.length === 0) {
      createSpawnRequest(room, 'generalist', GENERALIST_BODY);
      return;
    }

    if (constructionSites.length > 0 && builders.length === 0) {
      createSpawnRequest(room, 'bootstrapBuilder', BUILDER_BODY, { assignedRoomName: room.name });
      return;
    }

    if (generalists.length < 2) {
      createSpawnRequest(room, 'generalist', GENERALIST_BODY);
    }
    return;
  }

  if (localCommissioningSource) {
    const hasBuilder = builders.some((creep) => creep.memory.assignedSourceId === localCommissioningSource.sourceId);
    const hasMiner = miners.some((creep) => creep.memory.assignedSourceId === localCommissioningSource.sourceId);
    const hasHauler = haulers.some((creep) => creep.memory.assignedSourceId === localCommissioningSource.sourceId);

    if (getSourceRecordNeedsContainer(localCommissioningSource) && !hasBuilder) {
      createSpawnRequest(room, 'bootstrapBuilder', BUILDER_BODY, {
        assignedSourceId: localCommissioningSource.sourceId,
        assignedRoomName: room.name,
      });
      return;
    }

    if (localCommissioningSource.containerId && !hasMiner) {
      createSpawnRequest(room, 'stationaryMiner', STATIONARY_MINER_BODY, {
        assignedSourceId: localCommissioningSource.sourceId,
        assignedRoomName: room.name,
      });
      return;
    }

    if (
      (localCommissioningSource.state === 'stationary-online' ||
        localCommissioningSource.state === 'road-bootstrap' ||
        localCommissioningSource.state === 'logistics-active') &&
      !hasHauler
    ) {
      createSpawnRequest(room, 'routeHauler', ROUTE_HAULER_BODY, {
        assignedSourceId: localCommissioningSource.sourceId,
        assignedRoomName: room.name,
      });
      return;
    }
  }

  if (generalists.length === 0) {
    createSpawnRequest(room, 'generalist', GENERALIST_BODY);
    return;
  }

  if (unseenAdjacentRoom && scouts.length === 0) {
    createSpawnRequest(room, 'scout', SCOUT_BODY, {
      assignedRoomName: unseenAdjacentRoom,
    });
    return;
  }

  if (remoteCommissioningSource) {
    const hasBuilder = builders.some((creep) => creep.memory.assignedSourceId === remoteCommissioningSource.sourceId);
    const hasMiner = miners.some((creep) => creep.memory.assignedSourceId === remoteCommissioningSource.sourceId);
    const hasHauler = haulers.some((creep) => creep.memory.assignedSourceId === remoteCommissioningSource.sourceId);

    if (getSourceRecordNeedsContainer(remoteCommissioningSource) && !hasBuilder) {
      createSpawnRequest(room, 'bootstrapBuilder', BUILDER_BODY, {
        assignedSourceId: remoteCommissioningSource.sourceId,
        assignedRoomName: remoteCommissioningSource.roomName,
      });
      return;
    }

    if (remoteCommissioningSource.containerId && !hasMiner) {
      createSpawnRequest(room, 'stationaryMiner', STATIONARY_MINER_BODY, {
        assignedSourceId: remoteCommissioningSource.sourceId,
        assignedRoomName: remoteCommissioningSource.roomName,
      });
      return;
    }

    if (
      (remoteCommissioningSource.state === 'stationary-online' ||
        remoteCommissioningSource.state === 'road-bootstrap' ||
        remoteCommissioningSource.state === 'logistics-active') &&
      !hasHauler
    ) {
      createSpawnRequest(room, 'routeHauler', ROUTE_HAULER_BODY, {
        assignedSourceId: remoteCommissioningSource.sourceId,
        assignedRoomName: remoteCommissioningSource.roomName,
      });
      return;
    }
  }

  if (generalists.length < 2) {
    createSpawnRequest(room, 'generalist', GENERALIST_BODY);
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
      const localSources = room.find(FIND_SOURCES) as Source[];

      ensureLocalSourceRecords(room, localSources);

      const economy = roomMemory.economy;
      seedVisibleRemoteSourceRecords(room, economy);

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

      const creeps = getManagedCreeps(room);
      syncSourceAssignments(economy, creeps);

      if (shouldRunStructuralReview) {
        ensureRoomLevelConstructionSites(room);
      }

      for (const localSource of localSources) {
        const sourceRecord = economy.sourceRecords[localSource.id];

        if (!sourceRecord) {
          continue;
        }

        const plannedRecord = ensureSourceInfrastructureSites(room, localSource, sourceRecord);
        economy.sourceRecords[localSource.id] = reevaluateSourceRecord(
          plannedRecord,
          localSource,
          creeps,
          snapshot.energyCapacityAvailable,
        );
      }

      for (const sourceRecord of Object.values(economy.sourceRecords)) {
        if (sourceRecord.classification !== 'remote') {
          continue;
        }

        const visibleSource = Game.getObjectById(sourceRecord.sourceId);

        if (!visibleSource) {
          continue;
        }

        const plannedRecord = ensureSourceInfrastructureSites(room, visibleSource, sourceRecord);
        economy.sourceRecords[sourceRecord.sourceId] = reevaluateSourceRecord(
          plannedRecord,
          visibleSource,
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

      spawnNeededCreep(room, economy, creeps, snapshot);

      for (const creep of creeps) {
        switch (creep.memory.role) {
          case 'bootstrapBuilder':
            runBootstrapBuilder(creep);
            break;
          case 'stationaryMiner':
            runStationaryMiner(creep);
            break;
          case 'routeHauler':
            runRouteHauler(creep, economy.sourceRecords);
            break;
          case 'scout':
            runScout(creep);
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