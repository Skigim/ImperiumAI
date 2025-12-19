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
    assignedPositions?: { [posKey: string]: string }; // posKey -> creepName
    /** Static data - mining positions per source (persists, terrain-based) */
    miningPositions?: { [sourceId: string]: { x: number; y: number }[] };
    /** Total count of mining positions in room */
    miningPositionCount?: number;
    /** Static data - upgrade positions around controller */
    upgradePositions?: { x: number; y: number }[];
  }

  interface CreepMemory {
    role: 'worker';
    state: 'harvesting' | 'delivering';
    assignedPos?: { x: number; y: number; roomName: string };
    deliveryTarget?: 'spawn' | 'extension' | 'controller';
    stuckCount: number;
    lastPos?: { x: number; y: number };
    sourceId?: Id<Source>;
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

export type WorkerState = 'harvesting' | 'delivering';
export type DeliveryTarget = 'spawn' | 'extension' | 'controller';

export interface Position {
  x: number;
  y: number;
  roomName: string;
}

export const WORKER_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE];
export const WORKER_COST = 250;
export const STUCK_THRESHOLD = 3;
export const NEEDY_SPAWN_THRESHOLD = 0.5; // 50% capacity
