import type {
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

const expectsLocalLogisticsService = (source: SourceEconomyRecord): boolean => {
  return (
    source.state === 'road-bootstrap' ||
    source.state === 'logistics-active' ||
    source.state === 'degraded-local'
  );
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
    next.state = source.classification === 'local' ? 'degraded-local' : 'suspended';
    next.health.reactivationCooldownUntil = input.tick + REMOTE_REACTIVATION_COOLDOWN;
    return next;
  }

  if (input.hostileDetected) {
    next.health.hostilePresenceStreak += 1;
  } else {
    next.health.hostilePresenceStreak = 0;
  }

  if (input.routeRiskDetected) {
    next.health.routeRiskScore += 1;
  } else {
    next.health.routeRiskScore = Math.max(0, next.health.routeRiskScore - 1);
  }

  const logisticsServiceExpected =
    source.classification === 'remote' || expectsLocalLogisticsService(source);

  next.health.logisticsStarvationStreak = logisticsServiceExpected
    ? input.logisticsServiced
      ? 0
      : next.health.logisticsStarvationStreak + 1
    : 0;

  if (
    source.classification === 'remote' &&
    (next.health.hostilePresenceStreak >= REMOTE_SUSPEND_STREAK ||
      next.health.routeRiskScore >= REMOTE_ROUTE_RISK_SUSPEND_SCORE ||
      next.health.logisticsStarvationStreak >= REMOTE_STARVATION_SUSPEND_STREAK)
  ) {
    next.state = 'suspended';
    next.health.reactivationCooldownUntil = input.tick + REMOTE_REACTIVATION_COOLDOWN;
    return next;
  }

  if (
    source.classification === 'local' &&
    next.health.logisticsStarvationStreak > LOCAL_STARVATION_GRACE
  ) {
    next.state = 'degraded-local';
    return next;
  }

  if (source.state === 'bootstrap-candidate' && input.containerComplete) {
    next.state = 'container-bootstrap';
  }

  if (
    next.state === 'container-bootstrap' &&
    input.containerComplete &&
    input.minerOnPrimeTile
  ) {
    next.state = 'stationary-online';
  }

  if (next.state === 'stationary-online' && input.roadComplete) {
    next.state = 'road-bootstrap';
  }

  if (
    next.state === 'road-bootstrap' &&
    input.roadComplete &&
    input.logisticsServiced
  ) {
    next.state = 'logistics-active';
  }

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

    return leftDistance - rightDistance;
  });

  return candidates[0]?.sourceId ?? null;
};