export interface RoomEconomySnapshot {
  roomName: string;
  controllerLevel: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  initialExtensionEnvelopeReady: boolean;
  /**
   * Early-game compatibility flag for the RCL2 five-extension, 550-capacity envelope only.
   * Downstream consumers must not treat this as a generic "all extension buildout is complete" signal.
   */
  extensionBuildoutComplete: boolean;
  hostileCount: number;
  localSourceIds: readonly Id<Source>[];
  remoteSourceIds: readonly Id<Source>[];
}

export const detectStructuralEnvelopeChange = (
  previousCapacity: number,
  currentCapacity: number,
): boolean => {
  return previousCapacity !== currentCapacity;
};

export interface InitialExtensionEnvelopeReadinessInput {
  controllerLevel: number;
  energyCapacityAvailable: number;
  extensionCount: number;
}

export const isInitialExtensionEnvelopeReady = (
  input: InitialExtensionEnvelopeReadinessInput,
): boolean => {
  return (
    input.controllerLevel >= 2 &&
    input.energyCapacityAvailable >= 550 &&
    input.extensionCount >= 5
  );
};

export const summarizeRoomEconomySnapshot = (input: {
  roomName: string;
  controllerLevel: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  extensionCount: number;
  localSourceIds: readonly Id<Source>[];
  remoteSourceIds: readonly Id<Source>[];
  hostileCount: number;
}): RoomEconomySnapshot => {
  const initialExtensionEnvelopeReady = isInitialExtensionEnvelopeReady({
    controllerLevel: input.controllerLevel,
    energyCapacityAvailable: input.energyCapacityAvailable,
    extensionCount: input.extensionCount,
  });

  return {
    roomName: input.roomName,
    controllerLevel: input.controllerLevel,
    energyAvailable: input.energyAvailable,
    energyCapacityAvailable: input.energyCapacityAvailable,
    initialExtensionEnvelopeReady,
    extensionBuildoutComplete: initialExtensionEnvelopeReady,
    hostileCount: input.hostileCount,
    localSourceIds: [...input.localSourceIds],
    remoteSourceIds: [...input.remoteSourceIds],
  };
};