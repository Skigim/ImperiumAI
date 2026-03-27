// This file extends the standard Screeps interfaces for Memory.
// By declaring global, these properties become available on the standard Memory objects.

import type { CreepState } from './types';

declare global {
  // Lightweight coordinate structure for memory storage
  interface Coordinate {
    x: number;
    y: number;
  }

  interface CreepMemory {
    role: string;
    working: boolean;
    room?: string; // Helpful if creeps travel between rooms
    state: CreepState; // Current creep state (idle, harvest, upgrade, transfer, build)
  }

  interface RoomMemory {
    // Counters
    workerCount?: number;
    maxWorkers?: number; // Intended to be equal to harvestPosCap.length

    // Cache IDs
    sourceIds?: Id<Source>[];

    // Position Caching
    harvestPosCap?: Coordinate[]; // All walkable, non-wall tiles at range 1 of sourceIds
    posReserved?: Coordinate[]; // Array of all reserved working positions (generic: sources, upgrading, etc)
    harvestPosAvail?: Coordinate[]; // harvestPosCap excluding posReserved
  }

  interface Memory {
    uuid: number;
    log: any;
  }
}

export { CreepState } from './types';
