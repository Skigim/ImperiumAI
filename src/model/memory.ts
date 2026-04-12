import {
  createDefaultRoomEconomyRecord,
  createDefaultSourceHealthRecord,
  createDefaultSourceEconomyRecord,
  createRouteThroughputModel,
  type PersistedRoomPosition,
  type RoomEconomyRecord,
  type RouteThroughputModel,
  type SourceClassification,
  type SourceEconomyRecord,
  type SourceEconomyState,
  type SourceHealthRecord,
} from './roomEconomy';

export const MEMORY_SCHEMA_VERSION = 2;

export interface KernelMemory {
  lastTick: number | null;
  scheduler: {
    lastRunCpu: number;
  };
}

export interface ProcessMemoryRecord {
  id: string;
  type: string;
  state: 'idle' | 'running' | 'suspended';
}

export interface RoomDomainMemory {
  roomName: string;
  lastSeenTick: number;
  economy: RoomEconomyRecord;
}

export interface IntelMemoryRecord {
  lastUpdatedTick: number;
  threatLevel: number;
}

export interface ImperiumMemory {
  schemaVersion: number;
  shard: string;
  kernel: KernelMemory;
  processes: Record<string, ProcessMemoryRecord>;
  rooms: Record<string, RoomDomainMemory>;
  intel: Record<string, IntelMemoryRecord>;
}

export interface RootMemory {
  imperium: ImperiumMemory;
}

export const createDefaultImperiumMemory = (): ImperiumMemory => {
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    shard: Game.shard.name,
    kernel: {
      lastTick: null,
      scheduler: {
        lastRunCpu: 0,
      },
    },
    processes: {},
    rooms: {},
    intel: {},
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const ROOM_ECONOMY_PHASES = new Set<RoomEconomyRecord['phase']>([
  'bootstrap',
  'local-source-hardening',
  'serialized-remote-expansion',
  'rcl3-stabilization',
  'degraded-recovery',
]);

const SOURCE_CLASSIFICATIONS = new Set<SourceClassification>(['local', 'remote']);

const SOURCE_STATES = new Set<SourceEconomyState>([
  'bootstrap-candidate',
  'container-bootstrap',
  'stationary-online',
  'road-bootstrap',
  'logistics-active',
  'degraded-local',
  'suspended',
]);

const PROCESS_STATES = new Set<ProcessMemoryRecord['state']>([
  'idle',
  'running',
  'suspended',
]);

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
};

const normalizePersistedRoomPosition = (
  value: unknown,
): PersistedRoomPosition | null => {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.roomName === 'string'
    ? {
        x: value.x,
        y: value.y,
        roomName: value.roomName,
      }
    : null;
};

const normalizeSourceHealthRecord = (value: unknown): SourceHealthRecord => {
  const defaults = createDefaultSourceHealthRecord();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    lastStructurallyValidTick:
      typeof value.lastStructurallyValidTick === 'number'
        ? value.lastStructurallyValidTick
        : defaults.lastStructurallyValidTick,
    lastServicedTick:
      typeof value.lastServicedTick === 'number'
        ? value.lastServicedTick
        : defaults.lastServicedTick,
    routeRiskScore:
      typeof value.routeRiskScore === 'number'
        ? value.routeRiskScore
        : defaults.routeRiskScore,
    hostilePresenceStreak:
      typeof value.hostilePresenceStreak === 'number'
        ? value.hostilePresenceStreak
        : defaults.hostilePresenceStreak,
    logisticsStarvationStreak:
      typeof value.logisticsStarvationStreak === 'number'
        ? value.logisticsStarvationStreak
        : defaults.logisticsStarvationStreak,
    pendingReplacement:
      typeof value.pendingReplacement === 'boolean'
        ? value.pendingReplacement
        : defaults.pendingReplacement,
    reactivationCooldownUntil:
      typeof value.reactivationCooldownUntil === 'number'
        ? value.reactivationCooldownUntil
        : defaults.reactivationCooldownUntil,
  };
};

const normalizeRouteThroughputModel = (
  value: unknown,
  defaults: RouteThroughputModel,
): RouteThroughputModel => {
  if (!isRecord(value)) {
    return defaults;
  }

  return createRouteThroughputModel({
    expectedPickupPerCycle:
      typeof value.expectedPickupPerCycle === 'number'
        ? value.expectedPickupPerCycle
        : defaults.expectedPickupPerCycle,
    expectedMaintenanceBleedPerCycle:
      typeof value.expectedMaintenanceBleedPerCycle === 'number'
        ? value.expectedMaintenanceBleedPerCycle
        : defaults.expectedMaintenanceBleedPerCycle,
  });
};

const normalizeSourceEconomyRecord = (
  roomName: string,
  sourceKey: string,
  value: unknown,
): SourceEconomyRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const classification: SourceClassification = SOURCE_CLASSIFICATIONS.has(
    value.classification as SourceClassification,
  )
    ? (value.classification as SourceClassification)
    : 'local';
  const sourceId =
    typeof value.sourceId === 'string'
      ? (value.sourceId as Id<Source>)
      : (sourceKey as Id<Source>);
  const defaults = createDefaultSourceEconomyRecord({
    sourceId,
    roomName,
    classification,
  });

  return {
    ...defaults,
    roomName: typeof value.roomName === 'string' ? value.roomName : roomName,
    state: SOURCE_STATES.has(value.state as SourceEconomyState)
      ? (value.state as SourceEconomyState)
      : defaults.state,
    designatedMiningTile: normalizePersistedRoomPosition(
      value.designatedMiningTile,
    ),
    containerId:
      typeof value.containerId === 'string'
        ? (value.containerId as Id<StructureContainer>)
        : defaults.containerId,
    containerPosition: normalizePersistedRoomPosition(value.containerPosition),
    roadAnchor: normalizePersistedRoomPosition(value.roadAnchor),
    logisticsStopId:
      typeof value.logisticsStopId === 'string'
        ? value.logisticsStopId
        : defaults.logisticsStopId,
    assignedMinerName:
      typeof value.assignedMinerName === 'string'
        ? value.assignedMinerName
        : defaults.assignedMinerName,
    assignedBuilderNames: normalizeStringArray(value.assignedBuilderNames),
    assignedHaulerNames: normalizeStringArray(value.assignedHaulerNames),
    requiredSpawnEnergyCapacity:
      typeof value.requiredSpawnEnergyCapacity === 'number'
        ? value.requiredSpawnEnergyCapacity
        : defaults.requiredSpawnEnergyCapacity,
    health: normalizeSourceHealthRecord(value.health),
    throughput: normalizeRouteThroughputModel(
      value.throughput,
      defaults.throughput,
    ),
  };
};

const normalizeSourceRecords = (
  roomName: string,
  value: unknown,
): RoomEconomyRecord['sourceRecords'] => {
  if (!isRecord(value)) {
    return {};
  }

  const sourceRecords: RoomEconomyRecord['sourceRecords'] = {};

  for (const [sourceKey, sourceValue] of Object.entries(value)) {
    const normalized = normalizeSourceEconomyRecord(roomName, sourceKey, sourceValue);

    if (normalized) {
      sourceRecords[sourceKey] = normalized;
    }
  }

  return sourceRecords;
};

const normalizeProcessRecord = (
  processKey: string,
  value: unknown,
): ProcessMemoryRecord | null => {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  return {
    id: typeof value.id === 'string' ? value.id : processKey,
    type: value.type,
    state: PROCESS_STATES.has(value.state as ProcessMemoryRecord['state'])
      ? (value.state as ProcessMemoryRecord['state'])
      : 'idle',
  };
};

const normalizeProcesses = (
  value: unknown,
): Record<string, ProcessMemoryRecord> => {
  if (!isRecord(value)) {
    return {};
  }

  const processes: Record<string, ProcessMemoryRecord> = {};

  for (const [processKey, processValue] of Object.entries(value)) {
    const normalized = normalizeProcessRecord(processKey, processValue);

    if (normalized) {
      processes[processKey] = normalized;
    }
  }

  return processes;
};

const normalizeIntelRecord = (value: unknown): IntelMemoryRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    lastUpdatedTick:
      typeof value.lastUpdatedTick === 'number' ? value.lastUpdatedTick : 0,
    threatLevel: typeof value.threatLevel === 'number' ? value.threatLevel : 0,
  };
};

const normalizeIntel = (value: unknown): Record<string, IntelMemoryRecord> => {
  if (!isRecord(value)) {
    return {};
  }

  const intel: Record<string, IntelMemoryRecord> = {};

  for (const [roomName, roomValue] of Object.entries(value)) {
    const normalized = normalizeIntelRecord(roomValue);

    if (normalized) {
      intel[roomName] = normalized;
    }
  }

  return intel;
};

const normalizeKernelMemory = (value: unknown): KernelMemory => {
  const defaultKernel = createDefaultImperiumMemory().kernel;

  if (!isRecord(value)) {
    return defaultKernel;
  }

  const scheduler = isRecord(value.scheduler) ? value.scheduler : null;

  return {
    lastTick: typeof value.lastTick === 'number' || value.lastTick === null ? value.lastTick : defaultKernel.lastTick,
    scheduler: {
      lastRunCpu:
        scheduler && typeof scheduler.lastRunCpu === 'number'
          ? scheduler.lastRunCpu
          : defaultKernel.scheduler.lastRunCpu,
    },
  };
};

const normalizeRoomEconomyRecord = (
  roomName: string,
  value: unknown,
): RoomEconomyRecord => {
  const defaults = createDefaultRoomEconomyRecord(roomName);

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    roomName:
      typeof value.roomName === 'string'
        ? value.roomName
        : roomName,
    phase: ROOM_ECONOMY_PHASES.has(value.phase as RoomEconomyRecord['phase'])
      ? (value.phase as RoomEconomyRecord['phase'])
      : defaults.phase,
    cachedStructuralEnergyCapacity:
      typeof value.cachedStructuralEnergyCapacity === 'number'
        ? value.cachedStructuralEnergyCapacity
        : defaults.cachedStructuralEnergyCapacity,
    extensionBuildoutComplete:
      typeof value.extensionBuildoutComplete === 'boolean'
        ? value.extensionBuildoutComplete
        : defaults.extensionBuildoutComplete,
    localSourceHardeningComplete:
      typeof value.localSourceHardeningComplete === 'boolean'
        ? value.localSourceHardeningComplete
        : defaults.localSourceHardeningComplete,
    currentCommissioningSourceId:
      typeof value.currentCommissioningSourceId === 'string'
        ? (value.currentCommissioningSourceId as Id<Source>)
        : defaults.currentCommissioningSourceId,
    lastStructuralReviewTick:
      typeof value.lastStructuralReviewTick === 'number'
        ? value.lastStructuralReviewTick
        : defaults.lastStructuralReviewTick,
    lastRemoteRiskReviewTick:
      typeof value.lastRemoteRiskReviewTick === 'number'
        ? value.lastRemoteRiskReviewTick
        : defaults.lastRemoteRiskReviewTick,
    sourceRecords: normalizeSourceRecords(roomName, value.sourceRecords),
  };
};

const normalizeRooms = (value: unknown): Record<string, RoomDomainMemory> => {
  if (!isRecord(value)) {
    return {};
  }

  const rooms: Record<string, RoomDomainMemory> = {};

  for (const [roomKey, roomValue] of Object.entries(value)) {
    if (!isRecord(roomValue)) {
      continue;
    }

    const roomName =
      typeof roomValue.roomName === 'string'
        ? roomValue.roomName
        : roomKey;

    rooms[roomKey] = {
      roomName,
      lastSeenTick:
        typeof roomValue.lastSeenTick === 'number' ? roomValue.lastSeenTick : 0,
      economy: normalizeRoomEconomyRecord(roomName, roomValue.economy),
    };
  }

  return rooms;
};

const normalizeImperiumMemory = (value: unknown): ImperiumMemory => {
  const defaults = createDefaultImperiumMemory();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    shard: Game.shard.name,
    kernel: normalizeKernelMemory(value.kernel),
    processes: normalizeProcesses(value.processes),
    rooms: normalizeRooms(value.rooms),
    intel: normalizeIntel(value.intel),
  };
};

export const initializeMemory = (): void => {
  Memory.imperium = normalizeImperiumMemory(Memory.imperium);

  Memory.imperium.kernel.lastTick = Game.time;
  Memory.imperium.kernel.scheduler.lastRunCpu = Game.cpu.getUsed();
};

declare global {
  interface CreepMemory {
    role?: 'worker' | 'generalist' | 'bootstrapBuilder' | 'stationaryMiner' | 'routeHauler';
    harvesting?: boolean;
    transferTargetId?: Id<StructureExtension | StructureSpawn>;
    assignedSourceId?: Id<Source>;
    assignedRoomName?: string;
  }

  interface RoomMemory {
    workerCount?: number;
  }

  interface Memory extends RootMemory {}
}

export {};
