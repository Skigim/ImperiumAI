// Extend Screeps Memory interfaces
declare global {
  // Console is provided by Screeps runtime
  const console: {
    log(...args: unknown[]): void;
  };

  interface Memory {
    rooms: { [roomName: string]: RoomMemory };
    kernel?: KernelMemory;
  }

  interface KernelMemory {
    /** IDs of processes that should be registered on global reset */
    registeredProcesses: string[];
    /** Last tick the kernel ran */
    lastTick: number;
  }

  interface RoomMemory {
    /** Anchor point for static blueprints (manually set for now) */
    anchor?: { x: number; y: number };
    assignedPositions?: { [posKey: string]: string }; // posKey -> creepName
    /** Static data - mining positions per source (persists, terrain-based) */
    miningPositions?: { [sourceId: string]: { x: number; y: number }[] };
    /** Total count of mining positions in room */
    miningPositionCount?: number;
    /** Static data - upgrade positions around controller */
    upgradePositions?: { x: number; y: number }[];
    /** RCL 2 development phase tracking */
    rcl2Phase?: 1 | 2 | 3 | 4 | 5;
    /** Container IDs for each source */
    sourceContainers?: { [sourceId: string]: Id<StructureContainer> };

    /** Room stage selected by the supervisor process */
    stage?: 'rcl1' | 'rcl2a' | 'rcl2b';
  }

  interface CreepMemory {
    role: 'worker' | 'miner' | 'hauler' | 'filler' | 'remoteWorker';
    state: 'harvesting' | 'delivering' | 'mining' | 'hauling' | 'building';
    assignedPos?: { x: number; y: number; roomName: string };
    deliveryTarget?: 'spawn' | 'extension' | 'controller';
    stuckCount: number;
    lastPos?: { x: number; y: number };
    sourceId?: Id<Source>;
    /** Home room for remote workers */
    homeRoom?: string;
    /** Target room for remote workers */
    targetRoom?: string;
    /** For haulers: which container to pickup from */
    containerId?: Id<StructureContainer>;
    /** For workers in building mode: what structure to build */
    buildTarget?: Id<ConstructionSite>;
    // Movement system cache
    _move?: {
      path: Array<{ x: number; y: number }>;
      dest: { x: number; y: number; roomName: string };
      tick: number;
      idx: number;
    };
    _lastPos?: { x: number; y: number };
    _stuck?: number;
  }
}

// Empty export to make this a module (required for declare global)
export {};
