import type {
  BootstrapAssignmentClass,
  BootstrapState,
  RoomEconomyPhase,
  RoomEconomyRecord,
  SourceEconomyRecord,
} from '../model/roomEconomy';

const REMOTE_SUSPEND_STREAK = 3;
const REMOTE_REACTIVATION_COOLDOWN = 25;
const REMOTE_REACTIVATION_RECOVERY_WINDOW = 5;
export const REMOTE_RISK_REVIEW_INTERVAL = REMOTE_REACTIVATION_RECOVERY_WINDOW;
const REMOTE_ROUTE_RISK_SUSPEND_SCORE = 3;
const REMOTE_STARVATION_SUSPEND_STREAK = 3;
const LOCAL_STARVATION_GRACE = 3;

export type BootstrapPhaseMode = BootstrapState['phase'];

export const deriveBootstrapPhase = (input: {
  controllerLevel: number;
  extensionCount: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  localSourceIds: readonly Id<Source>[];
  stationaryTransitionComplete: boolean;
}): BootstrapPhaseMode => {
  if (input.stationaryTransitionComplete) {
    return 'complete';
  }

  if (input.controllerLevel < 2) {
    return 'bootstrap-shuttle';
  }

  if (
    input.extensionCount >= 5 &&
    input.energyCapacityAvailable >= 550 &&
    input.energyAvailable >= input.energyCapacityAvailable
  ) {
    return 'stationary-transition';
  }

  if (input.extensionCount >= 5 && input.energyCapacityAvailable >= 550) {
    return 'exit-charge';
  }

  return 'extension-build';
};

export const chooseBootstrapShuttleSource = (input: {
  localSourceIds: readonly Id<Source>[];
  assignments: BootstrapState['assignments'];
  sourceSlots: BootstrapState['sourceSlots'];
}): Id<Source> | null => {
  const counts = new Map<Id<Source>, number>();
  const representedReservedClaims = new Set<string>();

  for (const sourceId of input.localSourceIds) {
    counts.set(sourceId, 0);
  }

  for (const assignment of Object.values(input.assignments)) {
    if (assignment.assignmentClass !== 'shuttle' || assignment.sourceId === null) {
      continue;
    }

    if (!counts.has(assignment.sourceId)) {
      continue;
    }

    counts.set(assignment.sourceId, (counts.get(assignment.sourceId) ?? 0) + 1);

    if (assignment.slotKey !== null) {
      representedReservedClaims.add(`${assignment.sourceId}:${assignment.slotKey}:${assignment.creepName}`);
    }
  }

  for (const [sourceId, slotMap] of Object.entries(input.sourceSlots)) {
    const typedSourceId = sourceId as Id<Source>;

    if (!counts.has(typedSourceId)) {
      continue;
    }

    for (const [slotKey, slot] of Object.entries(slotMap)) {
      if (slot.claimState !== 'reserved') {
        continue;
      }

      if (
        representedReservedClaims.has(
          `${typedSourceId}:${slotKey}:${slot.occupantCreepName ?? ''}`,
        )
      ) {
        continue;
      }

      counts.set(typedSourceId, (counts.get(typedSourceId) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([sourceId]) => {
      return Object.values(input.sourceSlots[sourceId] ?? {}).some((slot) => {
        return slot.claimState === 'open';
      });
    })
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return left[1] - right[1];
      }

      return left[0].localeCompare(right[0]);
    })[0]?.[0] ?? null;
};

export const deriveBootstrapCleanupEffects = (input: {
  deadCreepName: string;
  assignments: BootstrapState['assignments'];
  reroutes: BootstrapState['reroutes'];
}): {
  clearedSourceId: Id<Source> | null;
  clearedSlotKey: string | null;
  affectedHaulerName: string | null;
  replacementDemand: boolean;
} => {
  const assignment = input.assignments[input.deadCreepName];
  const reroute = input.reroutes[input.deadCreepName];

  return {
    clearedSourceId: assignment?.sourceId ?? null,
    clearedSlotKey: assignment?.slotKey ?? null,
    affectedHaulerName: reroute?.targetHaulerName ?? null,
    replacementDemand:
      assignment?.assignmentClass === 'shuttle' && assignment.sourceId !== null,
  };
};

export const classifyBootstrapSpawn = (input: {
  phase: BootstrapPhaseMode;
  openSlotCount: number;
}): BootstrapAssignmentClass | null => {
  if (input.phase === 'stationary-transition') {
    return 'stationary-miner';
  }

  if (
    input.phase === 'bootstrap-shuttle' ||
    input.phase === 'extension-build' ||
    input.phase === 'exit-charge'
  ) {
    return input.openSlotCount > 0 ? 'shuttle' : 'overflow-build-hauler';
  }

  return null;
};

const expectsLocalLogisticsService = (source: SourceEconomyRecord): boolean => {
  return (
    source.state === 'road-bootstrap' ||
    source.state === 'logistics-active' ||
    source.state === 'degraded-local'
  );
};

const deriveStructuralFallbackState = (
  classification: SourceEconomyRecord['classification'],
): SourceEconomyRecord['state'] => {
  if (classification === 'local') {
    return 'degraded-local';
  }

  return 'suspended';
};

const deriveHostilePresenceStreak = (
  hostilePresenceStreak: number,
  hostileDetected: boolean,
): number => {
  if (hostileDetected) {
    return hostilePresenceStreak + 1;
  }

  return 0;
};

const deriveRouteRiskScore = (
  routeRiskScore: number,
  routeRiskDetected: boolean,
): number => {
  if (routeRiskDetected) {
    return routeRiskScore + 1;
  }

  return Math.max(0, routeRiskScore - 1);
};

const expectsLogisticsService = (source: SourceEconomyRecord): boolean => {
  return source.classification === 'remote' || expectsLocalLogisticsService(source);
};

const deriveLogisticsStarvationStreak = (
  source: SourceEconomyRecord,
  logisticsStarvationStreak: number,
  logisticsServiced: boolean,
): number => {
  if (!expectsLogisticsService(source)) {
    return 0;
  }

  if (logisticsServiced) {
    return 0;
  }

  return logisticsStarvationStreak + 1;
};

const deriveAdvancedSourceHealth = (
  source: SourceEconomyRecord,
  input: SourceStateInput,
): SourceEconomyRecord['health'] => {
  return {
    ...source.health,
    hostilePresenceStreak: deriveHostilePresenceStreak(
      source.health.hostilePresenceStreak,
      input.hostileDetected,
    ),
    routeRiskScore: deriveRouteRiskScore(
      source.health.routeRiskScore,
      input.routeRiskDetected,
    ),
    logisticsStarvationStreak: deriveLogisticsStarvationStreak(
      source,
      source.health.logisticsStarvationStreak,
      input.logisticsServiced,
    ),
  };
};

const shouldSuspendRemoteSource = (source: SourceEconomyRecord): boolean => {
  return (
    source.classification === 'remote' &&
    (source.health.hostilePresenceStreak >= REMOTE_SUSPEND_STREAK ||
      source.health.routeRiskScore >= REMOTE_ROUTE_RISK_SUSPEND_SCORE ||
      source.health.logisticsStarvationStreak >= REMOTE_STARVATION_SUSPEND_STREAK)
  );
};

const shouldDegradeLocalSource = (source: SourceEconomyRecord): boolean => {
  return (
    source.classification === 'local' &&
    source.health.logisticsStarvationStreak > LOCAL_STARVATION_GRACE
  );
};

const advanceOperationalSourceState = (
  state: SourceEconomyRecord['state'],
  input: SourceStateInput,
): SourceEconomyRecord['state'] => {
  let nextState = state;

  if (nextState === 'bootstrap-candidate' && input.containerComplete) {
    nextState = 'container-bootstrap';
  }

  if (
    nextState === 'container-bootstrap' &&
    input.containerComplete &&
    input.minerOnPrimeTile
  ) {
    nextState = 'stationary-online';
  }

  if (nextState === 'stationary-online' && input.roadComplete) {
    nextState = 'road-bootstrap';
  }

  if (
    nextState === 'road-bootstrap' &&
    input.roadComplete &&
    input.logisticsServiced
  ) {
    nextState = 'logistics-active';
  }

  return nextState;
};

const hasRemoteRecoveryStability = (source: SourceEconomyRecord): boolean => {
  return (
    source.health.hostilePresenceStreak === 0 &&
    source.health.routeRiskScore === 0 &&
    source.health.logisticsStarvationStreak === 0
  );
};

export const applyPassiveRemoteRecovery = (
  source: SourceEconomyRecord,
  tick: number,
): SourceEconomyRecord => {
  if (source.classification !== 'remote' || source.state !== 'suspended') {
    return source;
  }

  if (
    tick <
    source.health.reactivationCooldownUntil + REMOTE_REACTIVATION_RECOVERY_WINDOW
  ) {
    return source;
  }

  if (hasRemoteRecoveryStability(source)) {
    return source;
  }

  return {
    ...source,
    health: {
      ...source.health,
      hostilePresenceStreak: 0,
      routeRiskScore: 0,
      logisticsStarvationStreak: 0,
    },
  };
};

export interface SourceStateInput {
  tick: number;
  structuralEnergyCapacity: number;
  containerComplete: boolean;
  roadComplete: boolean;
  routeRiskDetected: boolean;
  hostileDetected: boolean;
  logisticsServiced: boolean;
  minerOnPrimeTile: boolean;
}

export const deriveRoomPhase = (input: {
  room: RoomEconomyRecord;
  extensionBuildoutComplete: boolean;
  controllerLevel: number;
  localSourceHardeningComplete: boolean;
}): RoomEconomyPhase => {
  if (!input.extensionBuildoutComplete) {
    return 'bootstrap';
  }

  if (!input.localSourceHardeningComplete) {
    return 'local-source-hardening';
  }

  if (input.controllerLevel >= 3) {
    return 'rcl3-stabilization';
  }

  return 'serialized-remote-expansion';
};

export const advanceSourceState = (
  source: SourceEconomyRecord,
  input: SourceStateInput,
): SourceEconomyRecord => {
  const next: SourceEconomyRecord = {
    ...source,
    health: { ...source.health },
  };

  if (input.structuralEnergyCapacity < source.requiredSpawnEnergyCapacity) {
    next.state = deriveStructuralFallbackState(source.classification);
    next.health.reactivationCooldownUntil = input.tick + REMOTE_REACTIVATION_COOLDOWN;
    return next;
  }

  next.health = deriveAdvancedSourceHealth(source, input);

  if (shouldSuspendRemoteSource(next)) {
    next.state = 'suspended';
    next.health.reactivationCooldownUntil = input.tick + REMOTE_REACTIVATION_COOLDOWN;
    return next;
  }

  if (shouldDegradeLocalSource(next)) {
    next.state = 'degraded-local';
    return next;
  }

  next.state = advanceOperationalSourceState(next.state, input);

  next.health.lastStructurallyValidTick = input.tick;
  if (input.logisticsServiced) {
    next.health.lastServicedTick = input.tick;
  }

  return next;
};

export const chooseNextCommissioningSource = (
  room: RoomEconomyRecord,
  pathDistanceBySourceId: Record<string, number>,
  tick: number,
): Id<Source> | null => {
  if (room.currentCommissioningSourceId) {
    return room.currentCommissioningSourceId;
  }

  if (!room.localSourceHardeningComplete) {
    return null;
  }

  const candidates = Object.values(room.sourceRecords).filter((source) => {
    const pathDistance = pathDistanceBySourceId[source.sourceId];

    return (
      source.classification === 'remote' &&
      typeof pathDistance === 'number' &&
      (source.state === 'bootstrap-candidate' ||
        (source.state === 'suspended' &&
          hasRemoteRecoveryStability(source) &&
          tick >
            source.health.reactivationCooldownUntil +
              REMOTE_REACTIVATION_RECOVERY_WINDOW))
    );
  });

  candidates.sort((left, right) => {
    const leftDistance = pathDistanceBySourceId[left.sourceId];
    const rightDistance = pathDistanceBySourceId[right.sourceId];

    if (leftDistance === undefined || rightDistance === undefined) {
      return 0;
    }

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.sourceId.localeCompare(right.sourceId);
  });

  return candidates[0]?.sourceId ?? null;
};