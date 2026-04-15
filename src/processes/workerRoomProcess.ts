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
import type { BootstrapDeliveryMode } from '../model/roomEconomy';
import type { PersistedRoomPosition, SourceEconomyRecord } from '../model/roomEconomy';
import {
  advanceSourceState,
  applyPassiveRemoteRecovery,
  chooseBootstrapShuttleSource,
  chooseNextCommissioningSource,
  classifyBootstrapSpawn,
  deriveBootstrapCleanupEffects,
  deriveBootstrapPhase,
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
const BOOTSTRAP_SHUTTLE_CAP = 4;
const GENERALIST_BODY: BodyPartConstant[] = ['work', 'carry', 'move'];
const BOOTSTRAP_SHUTTLE_BODY: BodyPartConstant[] = ['work', 'carry', 'move', 'move'];
const BUILDER_BODY: BodyPartConstant[] = ['work', 'carry', 'move'];
const SCOUT_BODY: BodyPartConstant[] = ['move'];
const ROUTE_HAULER_BODY: BodyPartConstant[] = ['work', 'carry', 'carry', 'move'];
const STATIONARY_MINER_BODY: BodyPartConstant[] = ['work', 'work', 'work', 'work', 'work', 'move'];
const STATIONARY_MINER_COST = 550;
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
const PENDING_EXTENSION_SITE_ID =
  '__pending_extension_site__' as Id<ConstructionSite<BuildableStructureConstant>>;
const bootstrapSlotTopologyCache = new WeakMap<object, Map<string, string[]>>();

const getBootstrapSlotTopologyCacheKey = (room: Room, source: Source): string | null => {
  if (typeof source.pos.x !== 'number' || typeof source.pos.y !== 'number') {
    return null;
  }

  return `${room.name}:${source.id}:${source.pos.x},${source.pos.y}`;
};

const getExpectedBootstrapSlotKeys = (room: Room, source: Source): string[] => {
  const cacheKey = getBootstrapSlotTopologyCacheKey(room, source);
  const terrain = typeof room.getTerrain === 'function' ? room.getTerrain() : null;

  if (cacheKey && terrain) {
    const terrainCache = bootstrapSlotTopologyCache.get(terrain as object);
    const cached = terrainCache?.get(cacheKey);

    if (cached) {
      return cached;
    }
  }

  if (typeof source.pos.x !== 'number' || typeof source.pos.y !== 'number') {
    return [];
  }

  const slotKeys: string[] = [];

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const x = source.pos.x + dx;
      const y = source.pos.y + dy;

      if (!isInBounds(x, y) || (terrain !== null && terrain.get(x, y) === TERRAIN_MASK_WALL)) {
        continue;
      }

      slotKeys.push(`${x},${y}`);
    }
  }

  if (cacheKey && terrain) {
    const terrainCache = bootstrapSlotTopologyCache.get(terrain as object) ?? new Map<string, string[]>();
    terrainCache.set(cacheKey, slotKeys);
    bootstrapSlotTopologyCache.set(terrain as object, terrainCache);
  }

  return slotKeys;
};

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

const parsePersistedRoomPosition = (
  positionKey: string | null,
  roomName: string,
): PersistedRoomPosition | null => {
  if (positionKey === null) {
    return null;
  }

  const [xValue, yValue] = positionKey.split(',');
  const x = Number(xValue);
  const y = Number(yValue);

  if (!Number.isInteger(x) || !Number.isInteger(y) || !isInBounds(x, y)) {
    return null;
  }

  return { x, y, roomName };
};

const isOnPersistedRoomPosition = (
  creep: Creep,
  position: PersistedRoomPosition,
): boolean => {
  const currentRoomName = creep.room?.name ?? creep.pos?.roomName;

  return currentRoomName === position.roomName && creep.pos?.x === position.x && creep.pos?.y === position.y;
};

const moveToPersistedRoomPosition = (
  creep: Creep,
  position: PersistedRoomPosition | null,
): boolean => {
  if (!position) {
    return false;
  }

  if (isOnPersistedRoomPosition(creep, position)) {
    return false;
  }

  const currentRoomName = creep.room?.name ?? creep.pos?.roomName;

  if (currentRoomName !== position.roomName) {
    return false;
  }

  creep.moveTo(position.x, position.y);
  return true;
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
    const homeRoomName = creep.memory?.homeRoomName ?? creep.room?.name;
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
  const { container } = getNearbySourceInfrastructure(source);
  let nextRecord = { ...sourceRecord };

  if (!nextRecord.designatedMiningTile) {
    nextRecord.designatedMiningTile = chooseAdjacentTile(sourceRoom, source) ?? toPersistedRoomPosition(source.pos);
  }

  if (
    nextRecord.designatedMiningTile &&
    !container &&
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
    (container !== null || nextRecord.containerId !== null) &&
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

const positionsMatch = (
  position: { x?: number; y?: number; roomName?: string } | null | undefined,
  target: PersistedRoomPosition | null | undefined,
): boolean => {
  return (
    target !== null &&
    target !== undefined &&
    typeof position?.x === 'number' &&
    typeof position?.y === 'number' &&
    typeof position?.roomName === 'string' &&
    position.x === target.x &&
    position.y === target.y &&
    position.roomName === target.roomName
  );
};

const isPositionNearSource = (
  source: Source,
  position: { x?: number; y?: number; roomName?: string } | null | undefined,
): boolean => {
  if (
    !position ||
    typeof position.x !== 'number' ||
    typeof position.y !== 'number' ||
    typeof position.roomName !== 'string' ||
    position.roomName !== source.pos.roomName
  ) {
    return false;
  }

  if (typeof source.pos.getRangeTo === 'function') {
    return source.pos.getRangeTo(position as RoomPosition) <= 1;
  }

  if (typeof source.pos.x === 'number' && typeof source.pos.y === 'number') {
    return Math.max(Math.abs(source.pos.x - position.x), Math.abs(source.pos.y - position.y)) <= 1;
  }

  return false;
};

const getAssignedSourceDroppedEnergy = (
  room: Room,
  source: Source | null,
): Resource<ResourceConstant> | null => {
  if (!source) {
    return null;
  }

  return (room.find(FIND_DROPPED_RESOURCES) as Resource<ResourceConstant>[]).find((resource) => {
    return resource.resourceType === RESOURCE_ENERGY && isPositionNearSource(source, resource.pos);
  }) ?? null;
};

const getAssignedSourceConstructionSite = (
  room: Room,
  source: Source | null,
  sourceRecord: SourceEconomyRecord | null,
): ConstructionSite<BuildableStructureConstant> | null => {
  const constructionSites = getConstructionSites(room) as ConstructionSite<BuildableStructureConstant>[];
  const containerTarget = sourceRecord?.designatedMiningTile ?? sourceRecord?.containerPosition ?? null;
  const containerSite = constructionSites.find((site) => {
    return (
      site.structureType === STRUCTURE_CONTAINER &&
      (positionsMatch(site.pos, containerTarget) ||
        (source !== null && isPositionNearSource(source, site.pos)))
    );
  });

  if (containerSite) {
    return containerSite;
  }

  return constructionSites.find((site) => {
    return (
      site.structureType === STRUCTURE_ROAD &&
      (positionsMatch(site.pos, sourceRecord?.roadAnchor ?? null) ||
        (source !== null && isPositionNearSource(source, site.pos)))
    );
  }) ?? null;
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

const getBootstrapSlotMapFromRoom = (
  room: Room,
  source: Source,
  existingSlotMap: RoomDomainMemory['economy']['bootstrap']['sourceSlots'][string],
): RoomDomainMemory['economy']['bootstrap']['sourceSlots'][string] => {
  if (typeof source.pos.x !== 'number' || typeof source.pos.y !== 'number') {
    return existingSlotMap;
  }

  const slotMap: RoomDomainMemory['economy']['bootstrap']['sourceSlots'][string] = {};

  for (const slotKey of getExpectedBootstrapSlotKeys(room, source)) {
      slotMap[slotKey] = existingSlotMap[slotKey] ?? {
        occupantCreepName: null,
        claimState: 'open',
        reservedAtTick: 0,
      };
  }

  return slotMap;
};

const bootstrapSlotMapNeedsRefresh = (
  room: Room,
  source: Source,
  slotMap: RoomDomainMemory['economy']['bootstrap']['sourceSlots'][string],
): boolean => {
  const slotKeys = Object.keys(slotMap);

  if (slotKeys.length === 0 || typeof source.pos.x !== 'number' || typeof source.pos.y !== 'number') {
    return true;
  }

  const expectedSlotKeys = new Set(getExpectedBootstrapSlotKeys(room, source));

  if (slotKeys.length !== expectedSlotKeys.size) {
    return true;
  }

  return slotKeys.some((slotKey) => !expectedSlotKeys.has(slotKey));
};

const ensureBootstrapSourceSlots = (
  roomMemory: RoomDomainMemory,
  room: Room,
  localSources: readonly Source[],
): void => {
  for (const source of localSources) {
    const existingSlotMap = roomMemory.economy.bootstrap.sourceSlots[source.id] ?? {};

    if (bootstrapSlotMapNeedsRefresh(room, source, existingSlotMap)) {
      roomMemory.economy.bootstrap.sourceSlots[source.id] = getBootstrapSlotMapFromRoom(
        room,
        source,
        existingSlotMap,
      );
    } else {
      roomMemory.economy.bootstrap.sourceSlots[source.id] = existingSlotMap;
    }
  }
};

const syncBootstrapAssignmentsFromCreeps = (
  roomMemory: RoomDomainMemory,
  creeps: readonly Creep[],
): void => {
  for (const creep of creeps) {
    const assignmentClass = creep.memory.bootstrapAssignmentClass;

    if (!assignmentClass) {
      continue;
    }

    const existingAssignment = roomMemory.economy.bootstrap.assignments[creep.name];
    const sourceId = creep.memory.assignedSourceId ?? null;
    let slotKey = creep.memory.bootstrapSlotKey ?? null;

    if (
      assignmentClass === 'shuttle' &&
      existingAssignment?.assignmentClass === 'shuttle' &&
      existingAssignment.sourceId !== null &&
      existingAssignment.slotKey !== null &&
      existingAssignment.sourceId === sourceId &&
      existingAssignment.slotKey !== slotKey
    ) {
      const repairedSlot =
        roomMemory.economy.bootstrap.sourceSlots[existingAssignment.sourceId]?.[
          existingAssignment.slotKey
        ];
      const staleSlot = slotKey
        ? roomMemory.economy.bootstrap.sourceSlots[sourceId]?.[slotKey]
        : null;

      if (repairedSlot?.occupantCreepName === creep.name && !staleSlot) {
        slotKey = existingAssignment.slotKey;
        creep.memory.bootstrapSlotKey = slotKey;
      }
    }

    if (
      assignmentClass === 'shuttle' &&
      sourceId !== null &&
      slotKey !== null &&
      !roomMemory.economy.bootstrap.sourceSlots[sourceId]?.[slotKey]
    ) {
      const repairedSlotKey = reserveBootstrapSlot(roomMemory, sourceId, creep.name);

      if (repairedSlotKey) {
        slotKey = repairedSlotKey;
        creep.memory.bootstrapSlotKey = repairedSlotKey;
      }
    }

    if (
      existingAssignment?.assignmentClass === 'shuttle' &&
      existingAssignment.sourceId &&
      existingAssignment.slotKey &&
      (existingAssignment.sourceId !== sourceId || existingAssignment.slotKey !== slotKey)
    ) {
      const previousSlot =
        roomMemory.economy.bootstrap.sourceSlots[existingAssignment.sourceId]?.[
          existingAssignment.slotKey
        ];

      if (previousSlot?.occupantCreepName === creep.name) {
        previousSlot.occupantCreepName = null;
        previousSlot.claimState = 'open';
        previousSlot.reservedAtTick = 0;
      }
    }

    roomMemory.economy.bootstrap.assignments[creep.name] = {
      creepName: creep.name,
      assignmentClass,
      sourceId,
      slotKey,
      deliveryMode:
        existingAssignment?.deliveryMode ??
        creep.memory.bootstrapDeliveryMode ??
        (assignmentClass === 'overflow-build-hauler' ? 'build' : 'harvest'),
    };

    if (assignmentClass === 'shuttle' && sourceId && slotKey) {
      const slot = roomMemory.economy.bootstrap.sourceSlots[sourceId]?.[slotKey];

      if (slot) {
        slot.occupantCreepName = creep.name;
        slot.claimState = 'occupied';
      }
    }
  }
};

const cleanupDeadBootstrapAssignments = (
  roomMemory: RoomDomainMemory,
  liveCreepNames: Set<string>,
): void => {
  for (const creepName of Object.keys(roomMemory.economy.bootstrap.assignments)) {
    if (liveCreepNames.has(creepName)) {
      continue;
    }

    const cleanup = deriveBootstrapCleanupEffects({
      deadCreepName: creepName,
      assignments: roomMemory.economy.bootstrap.assignments,
      reroutes: roomMemory.economy.bootstrap.reroutes,
    });

    if (cleanup.clearedSourceId && cleanup.clearedSlotKey) {
      const slot =
        roomMemory.economy.bootstrap.sourceSlots[cleanup.clearedSourceId]?.[
          cleanup.clearedSlotKey
        ];

      if (slot) {
        slot.occupantCreepName = null;
        slot.claimState = 'open';
        slot.reservedAtTick = 0;
      }
    }

    if (cleanup.affectedHaulerName) {
      const request = roomMemory.economy.bootstrap.fetchRequests[cleanup.affectedHaulerName];

      if (request) {
        request.status = 'pending';
        request.assignedShuttleName = null;
      }
    }

    if (roomMemory.economy.bootstrap.fetchRequests[creepName]) {
      delete roomMemory.economy.bootstrap.fetchRequests[creepName];
    }

    for (const [shuttleName, reroute] of Object.entries(roomMemory.economy.bootstrap.reroutes)) {
      if (reroute.targetHaulerName === creepName) {
        const shuttleAssignment = roomMemory.economy.bootstrap.assignments[shuttleName];

        if (shuttleAssignment?.assignmentClass === 'shuttle') {
          shuttleAssignment.deliveryMode = 'deliver';
        }

        delete roomMemory.economy.bootstrap.reroutes[shuttleName];
      }
    }

    delete roomMemory.economy.bootstrap.reroutes[creepName];
    delete roomMemory.economy.bootstrap.assignments[creepName];
  }
};

const ensureSingleBootstrapExtensionSite = (
  room: Room,
  roomMemory: RoomDomainMemory,
): void => {
  if (roomMemory.economy.bootstrap.phase !== 'extension-build') {
    roomMemory.economy.bootstrap.activeExtensionSiteId = null;
    return;
  }

  const existingExtensionSites = getConstructionSites(room).filter((site) => {
    return site.structureType === STRUCTURE_EXTENSION;
  });

  if (existingExtensionSites.length > 0) {
    roomMemory.economy.bootstrap.activeExtensionSiteId = existingExtensionSites[0]?.id ?? null;
    return;
  }

  if (
    roomMemory.economy.bootstrap.activeExtensionSiteId === PENDING_EXTENSION_SITE_ID &&
    Game.time - roomMemory.economy.bootstrap.lastExtensionPlacementTick <= 1
  ) {
    return;
  }

  const spawn = getOwnedSpawns(room)[0];

  if (!spawn) {
    return;
  }

  placeLayoutSites(room, spawn.pos, INITIAL_EXTENSION_LAYOUT, STRUCTURE_EXTENSION, 1);
  roomMemory.economy.bootstrap.activeExtensionSiteId = PENDING_EXTENSION_SITE_ID;
  roomMemory.economy.bootstrap.lastExtensionPlacementTick = Game.time;
};

const countOpenBootstrapSlots = (
  sourceSlots: RoomDomainMemory['economy']['bootstrap']['sourceSlots'],
): number => {
  return Object.values(sourceSlots).reduce((sum, slotMap) => {
    return sum + Object.values(slotMap).filter((slot) => slot.claimState === 'open').length;
  }, 0);
};

const countBootstrapAssignmentsByClass = (
  assignments: RoomDomainMemory['economy']['bootstrap']['assignments'],
  assignmentClass: RoomDomainMemory['economy']['bootstrap']['assignments'][string]['assignmentClass'],
): number => {
  return Object.values(assignments).filter((assignment) => {
    return assignment.assignmentClass === assignmentClass;
  }).length;
};

const chooseStationaryTransitionBuilderSource = (input: {
  localSourceIds: readonly Id<Source>[];
  assignments: RoomDomainMemory['economy']['bootstrap']['assignments'];
}): Id<Source> | null => {
  const counts = new Map<Id<Source>, number>();

  for (const sourceId of input.localSourceIds) {
    counts.set(sourceId, 0);
  }

  for (const assignment of Object.values(input.assignments)) {
    if (assignment.assignmentClass !== 'bootstrap-builder' || assignment.sourceId === null) {
      continue;
    }

    if (!counts.has(assignment.sourceId)) {
      continue;
    }

    counts.set(assignment.sourceId, (counts.get(assignment.sourceId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return left[1] - right[1];
      }

      return left[0].localeCompare(right[0]);
    })[0]?.[0] ?? null;
};

const handoffLegacyBootstrapWorkersToStationaryBuilders = (input: {
  roomMemory: RoomDomainMemory;
  creeps: readonly Creep[];
  localSourceIds: readonly Id<Source>[];
  roomName: string;
}): void => {
  for (const creep of input.creeps) {
    const assignment = input.roomMemory.economy.bootstrap.assignments[creep.name];
    const assignmentClass = assignment?.assignmentClass ?? creep.memory.bootstrapAssignmentClass;

    if (assignmentClass !== 'shuttle' && assignmentClass !== 'overflow-build-hauler') {
      continue;
    }

    const builderSourceId = chooseStationaryTransitionBuilderSource({
      localSourceIds: input.localSourceIds,
      assignments: input.roomMemory.economy.bootstrap.assignments,
    });

    if (!builderSourceId) {
      continue;
    }

    const previousSourceId = assignment?.sourceId ?? creep.memory.assignedSourceId ?? null;
    const previousSlotKey = assignment?.slotKey ?? creep.memory.bootstrapSlotKey ?? null;

    if (assignmentClass === 'shuttle' && previousSourceId && previousSlotKey) {
      const previousSlot =
        input.roomMemory.economy.bootstrap.sourceSlots[previousSourceId]?.[previousSlotKey];

      if (previousSlot?.occupantCreepName === creep.name) {
        previousSlot.occupantCreepName = null;
        previousSlot.claimState = 'open';
        previousSlot.reservedAtTick = 0;
      }
    }

    creep.memory.role = 'bootstrapBuilder';
    creep.memory.assignedSourceId = builderSourceId;
    creep.memory.assignedRoomName = input.roomName;
    creep.memory.homeRoomName = input.roomName;
    creep.memory.bootstrapAssignmentClass = 'bootstrap-builder';
    creep.memory.bootstrapDeliveryMode = 'build';
    delete creep.memory.bootstrapSlotKey;

    input.roomMemory.economy.bootstrap.assignments[creep.name] = {
      creepName: creep.name,
      assignmentClass: 'bootstrap-builder',
      sourceId: builderSourceId,
      slotKey: null,
      deliveryMode: 'build',
    };
  }
};

const hasStaffedStationaryMinersForAllLocalSources = (input: {
  localSourceIds: readonly Id<Source>[];
  creeps: readonly Creep[];
}): boolean => {
  if (input.localSourceIds.length === 0) {
    return false;
  }

  const localSourceIds = new Set(input.localSourceIds);
  const staffedSourceIds = new Set<Id<Source>>();

  for (const creep of input.creeps) {
    if (creep.memory.role !== 'stationaryMiner' || !creep.memory.assignedSourceId) {
      continue;
    }

    if (!localSourceIds.has(creep.memory.assignedSourceId)) {
      continue;
    }

    staffedSourceIds.add(creep.memory.assignedSourceId);
  }

  return input.localSourceIds.every((sourceId) => staffedSourceIds.has(sourceId));
};

const hasSourceAssignedBootstrapBuilderHandoff = (input: {
  localSourceIds: readonly Id<Source>[];
  assignments: RoomDomainMemory['economy']['bootstrap']['assignments'];
}): boolean => {
  if (input.localSourceIds.length === 0) {
    return false;
  }

  const localSourceIds = new Set(input.localSourceIds);

  return Object.values(input.assignments).every((assignment) => {
    return (
      assignment.assignmentClass === 'bootstrap-builder' &&
      assignment.sourceId !== null &&
      localSourceIds.has(assignment.sourceId)
    );
  });
};

const hasCompletedStationaryTransitionSourceWork = (input: {
  localSourceIds: readonly Id<Source>[];
  sourceRecords: RoomDomainMemory['economy']['sourceRecords'];
}): boolean => {
  if (input.localSourceIds.length === 0) {
    return false;
  }

  return input.localSourceIds.every((sourceId) => {
    const sourceRecord = input.sourceRecords[sourceId];

    return sourceRecord?.state === 'road-bootstrap' || sourceRecord?.state === 'logistics-active';
  });
};

const hasStationaryTransitionRecoveryLabor = (input: {
  creeps: readonly Creep[];
  assignments: RoomDomainMemory['economy']['bootstrap']['assignments'];
}): boolean => {
  return input.creeps.some((creep) => {
    const assignmentClass =
      input.assignments[creep.name]?.assignmentClass ?? creep.memory.bootstrapAssignmentClass;

    if (assignmentClass === 'shuttle') {
      return true;
    }

    if (assignmentClass === 'bootstrap-builder' || assignmentClass === 'overflow-build-hauler') {
      return false;
    }

    return (
      creep.memory.role === 'generalist' ||
      creep.memory.role === 'worker' ||
      creep.memory.role === 'routeHauler'
    );
  });
};

const repurposeCompletedBootstrapCreeps = (input: {
  roomMemory: RoomDomainMemory;
  creeps: readonly Creep[];
}): void => {
  for (const creep of input.creeps) {
    const assignment = input.roomMemory.economy.bootstrap.assignments[creep.name];
    const assignmentClass = assignment?.assignmentClass ?? creep.memory.bootstrapAssignmentClass;

    if (!assignmentClass) {
      continue;
    }

    const sourceId = assignment?.sourceId ?? creep.memory.assignedSourceId ?? null;
    const slotKey = assignment?.slotKey ?? creep.memory.bootstrapSlotKey ?? null;

    if (assignmentClass === 'shuttle' && sourceId && slotKey) {
      const slot = input.roomMemory.economy.bootstrap.sourceSlots[sourceId]?.[slotKey];

      if (slot?.occupantCreepName === creep.name) {
        slot.occupantCreepName = null;
        slot.claimState = 'open';
        slot.reservedAtTick = 0;
      }
    }

    delete input.roomMemory.economy.bootstrap.assignments[creep.name];
    creep.memory.role = 'worker';
    delete creep.memory.bootstrapAssignmentClass;
    delete creep.memory.bootstrapDeliveryMode;
    delete creep.memory.bootstrapSlotKey;
  }
};

const reserveBootstrapSlot = (
  roomMemory: RoomDomainMemory,
  sourceId: Id<Source>,
  creepName: string,
): string | null => {
  const slotMap = roomMemory.economy.bootstrap.sourceSlots[sourceId] ?? {};
  const entry = Object.entries(slotMap).find(([, slot]) => slot.claimState === 'open');

  if (!entry) {
    return null;
  }

  const [slotKey, slot] = entry;
  slot.claimState = 'reserved';
  slot.occupantCreepName = creepName;
  slot.reservedAtTick = Game.time;
  return slotKey;
};

const repairPendingBootstrapShuttleSlots = (input: {
  roomMemory: RoomDomainMemory;
  spawningCreepNames: ReadonlySet<string>;
}): void => {
  for (const creepName of input.spawningCreepNames) {
    const assignment = input.roomMemory.economy.bootstrap.assignments[creepName];

    if (
      assignment?.assignmentClass !== 'shuttle' ||
      assignment.sourceId === null ||
      assignment.slotKey === null
    ) {
      continue;
    }

    const reservedSlot = input.roomMemory.economy.bootstrap.sourceSlots[assignment.sourceId]?.[
      assignment.slotKey
    ];

    if (reservedSlot) {
      continue;
    }

    const repairedSlotKey = reserveBootstrapSlot(input.roomMemory, assignment.sourceId, creepName);

    if (!repairedSlotKey) {
      continue;
    }

    assignment.slotKey = repairedSlotKey;

    const pendingCreepMemory = Memory.creeps?.[creepName];

    if (
      pendingCreepMemory?.bootstrapAssignmentClass === 'shuttle' &&
      pendingCreepMemory.assignedSourceId === assignment.sourceId
    ) {
      pendingCreepMemory.bootstrapSlotKey = repairedSlotKey;
    }
  }
};

const matchBootstrapFetchRequests = (
  roomMemory: RoomDomainMemory,
  creepsByName: Map<string, Creep>,
): void => {
  for (const request of Object.values(roomMemory.economy.bootstrap.fetchRequests)) {
    if (request.status !== 'pending') {
      continue;
    }

    const hauler = creepsByName.get(request.creepName);

    if (!hauler) {
      continue;
    }

    const shuttleName = Object.values(roomMemory.economy.bootstrap.assignments)
      .filter((assignment) => {
        if (assignment.assignmentClass !== 'shuttle') {
          return false;
        }

        if (
          assignment.deliveryMode !== 'deliver' &&
          assignment.deliveryMode !== 'build' &&
          assignment.deliveryMode !== 'harvest' &&
          assignment.deliveryMode !== 'charge'
        ) {
          return false;
        }

        const shuttle = creepsByName.get(assignment.creepName);

        return (shuttle?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0;
      })
      .map((assignment) => assignment.creepName)
      .sort((left, right) => {
        const leftCreep = creepsByName.get(left);
        const rightCreep = creepsByName.get(right);

        return (leftCreep?.pos.getRangeTo(hauler) ?? 99) - (rightCreep?.pos.getRangeTo(hauler) ?? 99);
      })[0];

    if (!shuttleName) {
      continue;
    }

    roomMemory.economy.bootstrap.reroutes[shuttleName] = {
      shuttleName,
      targetHaulerName: request.creepName,
      sourceId: roomMemory.economy.bootstrap.assignments[shuttleName]?.sourceId ?? null,
    };
    request.status = 'matched';
    request.assignedShuttleName = shuttleName;
    const shuttleAssignment = roomMemory.economy.bootstrap.assignments[shuttleName];

    if (shuttleAssignment) {
      shuttleAssignment.deliveryMode = 'rerouted';
    }
  }
};

const setBootstrapDeliveryMode = (
  creep: Creep,
  assignment: RoomDomainMemory['economy']['bootstrap']['assignments'][string],
  deliveryMode: BootstrapDeliveryMode,
): void => {
  assignment.deliveryMode = deliveryMode;
  creep.memory.bootstrapDeliveryMode = deliveryMode;
};

const clearBootstrapReroute = (
  roomMemory: RoomDomainMemory,
  shuttleName: string,
  targetHaulerName: string,
): void => {
  delete roomMemory.economy.bootstrap.reroutes[shuttleName];
  delete roomMemory.economy.bootstrap.fetchRequests[targetHaulerName];
};

const clearInactiveBootstrapFetchState = (roomMemory: RoomDomainMemory): void => {
  roomMemory.economy.bootstrap.fetchRequests = {};
  roomMemory.economy.bootstrap.reroutes = {};

  for (const assignment of Object.values(roomMemory.economy.bootstrap.assignments)) {
    if (assignment.assignmentClass === 'shuttle' && assignment.deliveryMode === 'rerouted') {
      assignment.deliveryMode = 'deliver';
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
      sourceRecord.designatedMiningTile ?? toPersistedRoomPosition(assignedMiner?.pos ?? null),
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

const runBootstrapShuttle = (
  creep: Creep,
  room: Room,
  roomMemory: RoomDomainMemory,
): void => {
  const assignment = roomMemory.economy.bootstrap.assignments[creep.name];

  if (!assignment) {
    return;
  }

  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    setBootstrapDeliveryMode(creep, assignment, 'harvest');

    if (moveToPersistedRoomPosition(creep, parsePersistedRoomPosition(assignment.slotKey, room.name))) {
      return;
    }

    runHarvestFromAssignment(creep);
    return;
  }

  const reroute = roomMemory.economy.bootstrap.reroutes[creep.name];

  if (reroute) {
    const request = roomMemory.economy.bootstrap.fetchRequests[reroute.targetHaulerName];

    if (request?.assignedShuttleName !== creep.name || request.status !== 'matched') {
      delete roomMemory.economy.bootstrap.reroutes[creep.name];
    } else {
      setBootstrapDeliveryMode(creep, assignment, 'rerouted');
      const hauler = Game.creeps[reroute.targetHaulerName];

      if (hauler) {
        const transferResult = creep.transfer(hauler, RESOURCE_ENERGY);

        if (transferResult === ERR_NOT_IN_RANGE) {
          creep.moveTo(hauler);
          return;
        }

        if (transferResult === OK) {
          setBootstrapDeliveryMode(creep, assignment, 'deliver');
          clearBootstrapReroute(roomMemory, creep.name, reroute.targetHaulerName);
          return;
        }

        clearBootstrapReroute(roomMemory, creep.name, reroute.targetHaulerName);
      } else {
        clearBootstrapReroute(roomMemory, creep.name, reroute.targetHaulerName);
      }
    }
  }

  if (roomMemory.economy.bootstrap.phase === 'exit-charge') {
    setBootstrapDeliveryMode(creep, assignment, 'charge');
    const target = findTransferTarget(creep);

    if (target) {
      runTransfer(creep, { target });
    }

    return;
  }

  const activeSite = getConstructionSites(room).find((site) => {
    return site.id === roomMemory.economy.bootstrap.activeExtensionSiteId;
  });

  if (roomMemory.economy.bootstrap.phase === 'extension-build' && activeSite) {
    setBootstrapDeliveryMode(creep, assignment, 'build');
    runBuild(creep, { target: activeSite });
    return;
  }

  setBootstrapDeliveryMode(creep, assignment, 'deliver');
  const target = findTransferTarget(creep);

  if (target) {
    runTransfer(creep, { target });
  } else if (room.controller) {
    runControllerUpgrade(creep, room.controller);
  }
};

const runBootstrapBuilder = (
  creep: Creep,
  room: Room,
  sourceRecords: RoomDomainMemory['economy']['sourceRecords'],
): void => {
  if (moveToAssignedRoom(creep)) {
    return;
  }

  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    const assignedSource = getAssignedSource(creep);
    const assignedSourceRecord = creep.memory.assignedSourceId
      ? sourceRecords[creep.memory.assignedSourceId]
      : null;
    const assignedMinerAlive = Boolean(
      creep.memory.assignedSourceId && assignedSourceRecord?.assignedMinerName,
    );

    if (creep.memory.assignedSourceId) {
      const container = assignedSourceRecord?.containerId
        ? Game.getObjectById(assignedSourceRecord.containerId)
        : null;
      const containerHasEnergy = (container?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0) > 0;

      if (container && containerHasEnergy) {
        runWithdraw(creep, { target: container });
        return;
      }
    }

    const dropped =
      getAssignedSourceDroppedEnergy(room, assignedSource) ??
      (assignedSource === null
        ? (room.find(FIND_DROPPED_RESOURCES) as Resource<ResourceConstant>[]).find((resource) => {
            return resource.resourceType === RESOURCE_ENERGY;
          }) ?? null
        : null);

    if (dropped) {
      const pickupResult = creep.pickup(dropped);

      if (pickupResult === ERR_NOT_IN_RANGE) {
        creep.moveTo(dropped);
        return;
      }

      if (pickupResult === OK) {
        return;
      }
    }

    if (assignedMinerAlive) {
      return;
    }

    runWithdraw(creep);
    return;
  }

  const assignedSource = getAssignedSource(creep);
  const assignedSourceRecord = creep.memory.assignedSourceId
    ? sourceRecords[creep.memory.assignedSourceId]
    : null;

  const site = assignedSourceRecord
    ? getAssignedSourceConstructionSite(room, assignedSource, assignedSourceRecord)
    : getConstructionSites(room)[0];

  if (site) {
    runBuild(creep, { target: site });
  }
};

const runStationaryMiner = (
  creep: Creep,
  sourceRecords: RoomDomainMemory['economy']['sourceRecords'],
): void => {
  if (moveToAssignedRoom(creep)) {
    return;
  }

  const source = getAssignedSource(creep);

  if (!source) {
    return;
  }

  const sourceRecord = creep.memory.assignedSourceId ? sourceRecords[creep.memory.assignedSourceId] : null;
  const miningPosition = sourceRecord?.designatedMiningTile ?? sourceRecord?.containerPosition ?? null;

  if (moveToPersistedRoomPosition(creep, miningPosition)) {
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

      const creeps = getManagedCreeps(room);
      const activeBootstrapCreepNames = new Set(creeps.map((creep) => creep.name));
      const spawningBootstrapCreepNames = new Set<string>();

      if (Object.keys(roomMemory.economy.bootstrap.assignments).some((creepName) => {
        return !activeBootstrapCreepNames.has(creepName);
      })) {
        for (const spawn of getOwnedSpawns(room)) {
          const spawningName = spawn.spawning?.name;

          if (spawningName) {
            activeBootstrapCreepNames.add(spawningName);
            spawningBootstrapCreepNames.add(spawningName);
          }
        }
      }

      ensureBootstrapSourceSlots(roomMemory, room, localSources);
      cleanupDeadBootstrapAssignments(roomMemory, activeBootstrapCreepNames);
      repairPendingBootstrapShuttleSlots({
        roomMemory,
        spawningCreepNames: spawningBootstrapCreepNames,
      });
      syncBootstrapAssignmentsFromCreeps(roomMemory, creeps);

        const economy = roomMemory.economy;
        const previousBootstrapPhase = economy.bootstrap.phase;
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

      const deriveLatchedBootstrapPhase = (
        stationaryTransitionComplete: boolean,
      ): RoomDomainMemory['economy']['bootstrap']['phase'] => {
        if (previousBootstrapPhase === 'complete' || stationaryTransitionComplete) {
          return 'complete';
        }

        if (previousBootstrapPhase === 'stationary-transition') {
          return 'stationary-transition';
        }

        return deriveBootstrapPhase({
          controllerLevel: snapshot.controllerLevel,
          extensionCount: shouldRunStructuralReview
            ? countExtensions(room)
            : snapshot.extensionBuildoutComplete
              ? 5
              : 0,
          energyAvailable: room.energyAvailable,
          energyCapacityAvailable: room.energyCapacityAvailable,
          localSourceIds: snapshot.localSourceIds,
          stationaryTransitionComplete: false,
        });
      };

      economy.bootstrap.phase = deriveLatchedBootstrapPhase(false);

      syncSourceAssignments(economy, creeps);

      if (shouldRunStructuralReview && economy.bootstrap.phase !== 'extension-build') {
        ensureRoomLevelConstructionSites(room);
      }

      ensureSingleBootstrapExtensionSite(room, roomMemory);
      const allowLocalSourceInfrastructurePlanning =
        !economy.localSourceHardeningComplete &&
        (economy.bootstrap.phase === 'stationary-transition' || previousBootstrapPhase === 'complete');

      for (const localSource of localSources) {
        const sourceRecord = economy.sourceRecords[localSource.id];

        if (!sourceRecord) {
          continue;
        }

        const plannedRecord = allowLocalSourceInfrastructurePlanning
          ? ensureSourceInfrastructureSites(room, localSource, sourceRecord)
          : sourceRecord;
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
      economy.bootstrap.phase = deriveLatchedBootstrapPhase(economy.localSourceHardeningComplete);
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

      const creepsByName = new Map(creeps.map((creep) => [creep.name, creep] as const));
      const bootstrapPhaseBeforeHandoff = roomMemory.economy.bootstrap.phase;
      const allLocalSourcesHaveStationaryMiners = hasStaffedStationaryMinersForAllLocalSources({
        localSourceIds: snapshot.localSourceIds,
        creeps,
      });

      if (
        bootstrapPhaseBeforeHandoff === 'stationary-transition' &&
        allLocalSourcesHaveStationaryMiners
      ) {
        handoffLegacyBootstrapWorkersToStationaryBuilders({
          roomMemory,
          creeps,
          localSourceIds: snapshot.localSourceIds,
          roomName: room.name,
        });
      }

      const stationaryTransitionComplete =
        economy.localSourceHardeningComplete ||
        (allLocalSourcesHaveStationaryMiners &&
          hasCompletedStationaryTransitionSourceWork({
            localSourceIds: snapshot.localSourceIds,
            sourceRecords: economy.sourceRecords,
          }) &&
          hasSourceAssignedBootstrapBuilderHandoff({
            localSourceIds: snapshot.localSourceIds,
            assignments: roomMemory.economy.bootstrap.assignments,
          }));

      roomMemory.economy.bootstrap.phase = deriveLatchedBootstrapPhase(
        stationaryTransitionComplete,
      );

      const bootstrapPhase = roomMemory.economy.bootstrap.phase;

      if (bootstrapPhase === 'complete' && previousBootstrapPhase === 'complete') {
        repurposeCompletedBootstrapCreeps({ roomMemory, creeps });
      }

      if (bootstrapPhase !== 'extension-build' && bootstrapPhase !== 'exit-charge') {
        clearInactiveBootstrapFetchState(roomMemory);
      }

      matchBootstrapFetchRequests(roomMemory, creepsByName);

      roomMemory.lastSeenTick = Game.time;
      room.memory.workerCount = creeps.length;

      let bootstrapSpawnHandled = false;
      const shouldRunBootstrapSpawnPlanner =
        bootstrapPhase === 'bootstrap-shuttle' ||
        bootstrapPhase === 'extension-build' ||
        bootstrapPhase === 'exit-charge' ||
        bootstrapPhase === 'stationary-transition';
      const minimumBootstrapSpawnPlannerEnergy = bootstrapPhase === 'stationary-transition' ? 200 : 250;
      const openSlotCount = countOpenBootstrapSlots(roomMemory.economy.bootstrap.sourceSlots);
      const liveAndPendingShuttleCount = countBootstrapAssignmentsByClass(
        roomMemory.economy.bootstrap.assignments,
        'shuttle',
      );

      if (room.energyAvailable >= minimumBootstrapSpawnPlannerEnergy && shouldRunBootstrapSpawnPlanner) {
        const idleSpawn = getIdleSpawn(room);

        if (idleSpawn) {
          if (
            bootstrapPhase === 'bootstrap-shuttle' &&
            liveAndPendingShuttleCount < BOOTSTRAP_SHUTTLE_CAP
          ) {
            const sourceId = chooseBootstrapShuttleSource({
              localSourceIds: snapshot.localSourceIds,
              assignments: roomMemory.economy.bootstrap.assignments,
              sourceSlots: roomMemory.economy.bootstrap.sourceSlots,
            });

            if (sourceId) {
              const creepName = `bootstrap-${Game.time}`;
              const slotKey = reserveBootstrapSlot(roomMemory, sourceId, creepName);

              if (slotKey) {
                const spawnResult = idleSpawn.spawnCreep(BOOTSTRAP_SHUTTLE_BODY, creepName, {
                  memory: {
                    role: 'worker',
                    assignedSourceId: sourceId,
                    bootstrapAssignmentClass: 'shuttle',
                    bootstrapSlotKey: slotKey,
                    bootstrapDeliveryMode: 'harvest',
                    homeRoomName: room.name,
                  },
                });

                if (spawnResult !== OK) {
                  const slot = roomMemory.economy.bootstrap.sourceSlots[sourceId]?.[slotKey];

                  if (slot) {
                    slot.claimState = 'open';
                    slot.occupantCreepName = null;
                    slot.reservedAtTick = 0;
                  }
                } else {
                  roomMemory.economy.bootstrap.assignments[creepName] = {
                    creepName,
                    assignmentClass: 'shuttle',
                    sourceId,
                    slotKey,
                    deliveryMode: 'harvest',
                  };
                  bootstrapSpawnHandled = true;
                }
              }
            }
          } else if (
            bootstrapPhase === 'extension-build' ||
            bootstrapPhase === 'exit-charge'
          ) {
            const assignmentClass = classifyBootstrapSpawn({
              phase: bootstrapPhase,
              openSlotCount,
            });
            const overflowDeliveryMode: BootstrapDeliveryMode =
              bootstrapPhase === 'exit-charge' ? 'charge' : 'build';

            if (assignmentClass === 'shuttle') {
              const sourceId = chooseBootstrapShuttleSource({
                localSourceIds: snapshot.localSourceIds,
                assignments: roomMemory.economy.bootstrap.assignments,
                sourceSlots: roomMemory.economy.bootstrap.sourceSlots,
              });

              if (sourceId) {
                const creepName = `bootstrap-${Game.time}`;
                const slotKey = reserveBootstrapSlot(roomMemory, sourceId, creepName);

                if (slotKey) {
                  const spawnResult = idleSpawn.spawnCreep(BOOTSTRAP_SHUTTLE_BODY, creepName, {
                    memory: {
                      role: 'worker',
                      assignedSourceId: sourceId,
                      bootstrapAssignmentClass: 'shuttle',
                      bootstrapSlotKey: slotKey,
                      bootstrapDeliveryMode: 'harvest',
                      homeRoomName: room.name,
                    },
                  });

                  if (spawnResult !== OK) {
                    const slot = roomMemory.economy.bootstrap.sourceSlots[sourceId]?.[slotKey];

                    if (slot) {
                      slot.claimState = 'open';
                      slot.occupantCreepName = null;
                      slot.reservedAtTick = 0;
                    }
                  } else {
                    roomMemory.economy.bootstrap.assignments[creepName] = {
                      creepName,
                      assignmentClass: 'shuttle',
                      sourceId,
                      slotKey,
                      deliveryMode: 'harvest',
                    };
                    bootstrapSpawnHandled = true;
                  }
                }
              }
            }

            if (assignmentClass === 'overflow-build-hauler') {
              const creepName = `bootstrap-${Game.time}`;
              const spawnResult = idleSpawn.spawnCreep(BOOTSTRAP_SHUTTLE_BODY, creepName, {
                memory: {
                  role: 'worker',
                  bootstrapAssignmentClass: 'overflow-build-hauler',
                  bootstrapDeliveryMode: overflowDeliveryMode,
                  homeRoomName: room.name,
                },
              });

              if (spawnResult === OK) {
                roomMemory.economy.bootstrap.assignments[creepName] = {
                  creepName,
                  assignmentClass: 'overflow-build-hauler',
                  sourceId: null,
                  slotKey: null,
                  deliveryMode: overflowDeliveryMode,
                };
                bootstrapSpawnHandled = true;
              }
            }

          } else if (bootstrapPhase === 'stationary-transition') {
            const sourceId = snapshot.localSourceIds.find((candidateSourceId) => {
              return !creeps.some((creep) => {
                return (
                  creep.memory.role === 'stationaryMiner' &&
                  creep.memory.assignedSourceId === candidateSourceId
                );
              });
            });

            if (sourceId) {
              const creepName = `stationaryMiner-${Game.time}`;
              const spawnResult = idleSpawn.spawnCreep(STATIONARY_MINER_BODY, creepName, {
                memory: {
                  role: 'stationaryMiner',
                  assignedSourceId: sourceId,
                  assignedRoomName: room.name,
                  homeRoomName: room.name,
                },
              });

              if (spawnResult === OK) {
                bootstrapSpawnHandled = true;
              } else if (
                room.energyAvailable < STATIONARY_MINER_COST &&
                !hasStationaryTransitionRecoveryLabor({
                  creeps,
                  assignments: roomMemory.economy.bootstrap.assignments,
                })
              ) {
                const recoverySourceId = chooseBootstrapShuttleSource({
                  localSourceIds: snapshot.localSourceIds,
                  assignments: roomMemory.economy.bootstrap.assignments,
                  sourceSlots: roomMemory.economy.bootstrap.sourceSlots,
                });

                if (recoverySourceId) {
                  const recoveryCreepName = `bootstrap-${Game.time}`;
                  const slotKey = reserveBootstrapSlot(roomMemory, recoverySourceId, recoveryCreepName);

                  if (slotKey) {
                    const recoverySpawnResult = idleSpawn.spawnCreep(BOOTSTRAP_SHUTTLE_BODY, recoveryCreepName, {
                      memory: {
                        role: 'worker',
                        assignedSourceId: recoverySourceId,
                        bootstrapAssignmentClass: 'shuttle',
                        bootstrapSlotKey: slotKey,
                        bootstrapDeliveryMode: 'harvest',
                        homeRoomName: room.name,
                      },
                    });

                    if (recoverySpawnResult !== OK) {
                      const slot = roomMemory.economy.bootstrap.sourceSlots[recoverySourceId]?.[slotKey];

                      if (slot) {
                        slot.claimState = 'open';
                        slot.occupantCreepName = null;
                        slot.reservedAtTick = 0;
                      }
                    } else {
                      roomMemory.economy.bootstrap.assignments[recoveryCreepName] = {
                        creepName: recoveryCreepName,
                        assignmentClass: 'shuttle',
                        sourceId: recoverySourceId,
                        slotKey,
                        deliveryMode: 'harvest',
                      };
                      bootstrapSpawnHandled = true;
                    }
                  }
                }
              }
            } else {
              const builderSourceId = chooseStationaryTransitionBuilderSource({
                localSourceIds: snapshot.localSourceIds,
                assignments: roomMemory.economy.bootstrap.assignments,
              });

              if (builderSourceId) {
                const creepName = `bootstrapBuilder-${Game.time}`;
                const spawnResult = idleSpawn.spawnCreep(BUILDER_BODY, creepName, {
                  memory: {
                    role: 'bootstrapBuilder',
                    assignedSourceId: builderSourceId,
                    assignedRoomName: room.name,
                    bootstrapAssignmentClass: 'bootstrap-builder',
                    bootstrapDeliveryMode: 'build',
                    homeRoomName: room.name,
                  },
                });

                if (spawnResult === OK) {
                  roomMemory.economy.bootstrap.assignments[creepName] = {
                    creepName,
                    assignmentClass: 'bootstrap-builder',
                    sourceId: builderSourceId,
                    slotKey: null,
                    deliveryMode: 'build',
                  };
                  bootstrapSpawnHandled = true;
                }
              }
            }
          }
        }
      }

      if (!bootstrapSpawnHandled && bootstrapPhase === 'complete') {
        spawnNeededCreep(room, economy, creeps, snapshot);
      }

      for (const creep of creeps) {
        const assignment = roomMemory.economy.bootstrap.assignments[creep.name];

        if (assignment?.assignmentClass === 'shuttle') {
          runBootstrapShuttle(creep, room, roomMemory);
          continue;
        }

        if (assignment?.assignmentClass === 'bootstrap-builder') {
          runBootstrapBuilder(
            creep,
            room,
            roomMemory.economy.sourceRecords,
          );
          continue;
        }

        if (assignment?.assignmentClass === 'overflow-build-hauler') {
          const supportsBootstrapFetch =
            roomMemory.economy.bootstrap.phase === 'extension-build' ||
            roomMemory.economy.bootstrap.phase === 'exit-charge';

          if (!supportsBootstrapFetch) {
            delete roomMemory.economy.bootstrap.fetchRequests[creep.name];
            if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
              const target = findTransferTarget(creep);

              if (target) {
                setBootstrapDeliveryMode(creep, assignment, 'deliver');
                runTransfer(creep, { target });
              }
            }
            continue;
          }

          if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
            setBootstrapDeliveryMode(
              creep,
              assignment,
              roomMemory.economy.bootstrap.phase === 'exit-charge' ? 'charge' : 'build',
            );
            roomMemory.economy.bootstrap.fetchRequests[creep.name] ??= {
              creepName: creep.name,
              status: 'pending',
              requestedAtTick: Game.time,
              assignedShuttleName: null,
            };
            continue;
          }

          const activeSite = getConstructionSites(room).find((site) => {
            return site.id === roomMemory.economy.bootstrap.activeExtensionSiteId;
          });

          if (roomMemory.economy.bootstrap.phase === 'extension-build' && activeSite) {
            setBootstrapDeliveryMode(creep, assignment, 'build');
            runBuild(creep, { target: activeSite });
            continue;
          }

          const target = findTransferTarget(creep);

          if (target) {
            setBootstrapDeliveryMode(
              creep,
              assignment,
              roomMemory.economy.bootstrap.phase === 'exit-charge' ? 'charge' : 'deliver',
            );
            runTransfer(creep, { target });
          }
          continue;
        }

        switch (creep.memory.role) {
          case 'bootstrapBuilder':
            runBootstrapBuilder(
              creep,
              room,
              roomMemory.economy.sourceRecords,
            );
            break;
          case 'stationaryMiner':
            runStationaryMiner(creep, roomMemory.economy.sourceRecords);
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