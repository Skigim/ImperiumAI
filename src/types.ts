// Extend Screeps Memory interfaces
declare global {
  // Console is provided by Screeps runtime
  const console: {
    log(...args: unknown[]): void;
  };

  interface Memory {
    rooms: { [roomName: string]: RoomMemory };
  }

  interface RoomMemory {
    assignedPositions?: { [posKey: string]: string }; // posKey -> creepName
  }

  interface CreepMemory {
    role: 'worker';
    state: 'harvesting' | 'delivering';
    assignedPos?: { x: number; y: number; roomName: string };
    deliveryTarget?: 'spawn' | 'extension' | 'controller';
    stuckCount: number;
    lastPos?: { x: number; y: number };
    sourceId?: Id<Source>;
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
export const WORKERS_PER_SOURCE = 2;
export const STUCK_THRESHOLD = 3;
export const NEEDY_SPAWN_THRESHOLD = 0.5; // 50% capacity
