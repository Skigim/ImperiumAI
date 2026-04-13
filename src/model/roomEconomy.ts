export type RoomEconomyPhase =
  | 'bootstrap'
  | 'local-source-hardening'
  | 'serialized-remote-expansion'
  | 'rcl3-stabilization'
  | 'degraded-recovery';

export type SourceClassification = 'local' | 'remote';

export type SourceEconomyState =
  | 'bootstrap-candidate'
  | 'container-bootstrap'
  | 'stationary-online'
  | 'road-bootstrap'
  | 'logistics-active'
  | 'degraded-local'
  | 'suspended';

export interface SourceHealthRecord {
  lastStructurallyValidTick: number;
  lastServicedTick: number;
  routeRiskScore: number;
  hostilePresenceStreak: number;
  logisticsStarvationStreak: number;
  pendingReplacement: boolean;
  reactivationCooldownUntil: number;
}

export interface RouteThroughputModel {
  expectedPickupPerCycle: number;
  expectedMaintenanceBleedPerCycle: number;
  expectedNetDeliveryPerCycle: number;
}

export const createRouteThroughputModel = (input?: {
  expectedPickupPerCycle?: number;
  expectedMaintenanceBleedPerCycle?: number;
}): RouteThroughputModel => {
  const expectedPickupPerCycle = input?.expectedPickupPerCycle ?? 0;
  const expectedMaintenanceBleedPerCycle = input?.expectedMaintenanceBleedPerCycle ?? 0;

  return {
    expectedPickupPerCycle,
    expectedMaintenanceBleedPerCycle,
    expectedNetDeliveryPerCycle:
      expectedPickupPerCycle - expectedMaintenanceBleedPerCycle,
  };
};

export interface PersistedRoomPosition {
  x: number;
  y: number;
  roomName: string;
}

export interface SourceEconomyRecord {
  sourceId: Id<Source>;
  roomName: string;
  classification: SourceClassification;
  state: SourceEconomyState;
  designatedMiningTile: PersistedRoomPosition | null;
  containerId: Id<StructureContainer> | null;
  containerPosition: PersistedRoomPosition | null;
  roadAnchor: PersistedRoomPosition | null;
  logisticsStopId: string | null;
  assignedMinerName: string | null;
  assignedBuilderNames: string[];
  assignedHaulerNames: string[];
  requiredSpawnEnergyCapacity: number;
  health: SourceHealthRecord;
  throughput: RouteThroughputModel;
}

export type BootstrapPhase =
  | 'bootstrap-shuttle'
  | 'extension-build'
  | 'exit-charge'
  | 'stationary-transition'
  | 'complete';

export type BootstrapAssignmentClass =
  | 'shuttle'
  | 'overflow-build-hauler'
  | 'stationary-miner'
  | 'bootstrap-builder';

export type BootstrapDeliveryMode =
  | 'harvest'
  | 'deliver'
  | 'rerouted'
  | 'build'
  | 'charge';

export interface SourceSlotClaim {
  occupantCreepName: string | null;
  claimState: 'open' | 'reserved' | 'occupied';
  reservedAtTick: number;
}

export interface BootstrapAssignmentRecord {
  creepName: string;
  assignmentClass: BootstrapAssignmentClass;
  sourceId: Id<Source> | null;
  slotKey: string | null;
  deliveryMode: BootstrapDeliveryMode;
}

export interface BootstrapFetchRequest {
  creepName: string;
  status: 'pending' | 'matched';
  requestedAtTick: number;
  assignedShuttleName: string | null;
}

export interface BootstrapRerouteRecord {
  shuttleName: string;
  targetHaulerName: string;
  sourceId: Id<Source> | null;
}

export interface BootstrapState {
  phase: BootstrapPhase;
  activeExtensionSiteId: Id<ConstructionSite<BuildableStructureConstant>> | null;
  lastExtensionPlacementTick: number;
  sourceSlots: Record<string, Record<string, SourceSlotClaim>>;
  assignments: Record<string, BootstrapAssignmentRecord>;
  fetchRequests: Record<string, BootstrapFetchRequest>;
  reroutes: Record<string, BootstrapRerouteRecord>;
}

export interface RoomEconomyRecord {
  roomName: string;
  phase: RoomEconomyPhase;
  cachedStructuralEnergyCapacity: number;
  extensionBuildoutComplete: boolean;
  localSourceHardeningComplete: boolean;
  currentCommissioningSourceId: Id<Source> | null;
  lastStructuralReviewTick: number;
  lastRemoteRiskReviewTick: number;
  sourceRecords: Record<string, SourceEconomyRecord>;
  bootstrap: BootstrapState;
}

export const createDefaultSourceHealthRecord = (): SourceHealthRecord => ({
  lastStructurallyValidTick: 0,
  lastServicedTick: 0,
  routeRiskScore: 0,
  hostilePresenceStreak: 0,
  logisticsStarvationStreak: 0,
  pendingReplacement: false,
  reactivationCooldownUntil: 0,
});

export const createDefaultSourceEconomyRecord = (input: {
  sourceId: Id<Source>;
  roomName: string;
  classification: SourceClassification;
}): SourceEconomyRecord => ({
  sourceId: input.sourceId,
  roomName: input.roomName,
  classification: input.classification,
  state: 'bootstrap-candidate',
  designatedMiningTile: null,
  containerId: null,
  containerPosition: null,
  roadAnchor: null,
  logisticsStopId: null,
  assignedMinerName: null,
  assignedBuilderNames: [],
  assignedHaulerNames: [],
  requiredSpawnEnergyCapacity: 300,
  health: createDefaultSourceHealthRecord(),
  throughput: createRouteThroughputModel(),
});

export const createDefaultBootstrapState = (): BootstrapState => ({
  phase: 'bootstrap-shuttle',
  activeExtensionSiteId: null,
  lastExtensionPlacementTick: 0,
  sourceSlots: {},
  assignments: {},
  fetchRequests: {},
  reroutes: {},
});

export const createDefaultRoomEconomyRecord = (roomName: string): RoomEconomyRecord => ({
  roomName,
  phase: 'bootstrap',
  cachedStructuralEnergyCapacity: 300,
  extensionBuildoutComplete: false,
  localSourceHardeningComplete: false,
  currentCommissioningSourceId: null,
  lastStructuralReviewTick: 0,
  lastRemoteRiskReviewTick: 0,
  sourceRecords: {},
  bootstrap: createDefaultBootstrapState(),
});