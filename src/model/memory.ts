export const MEMORY_SCHEMA_VERSION = 1;

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

export const initializeMemory = (): void => {
  if (!Memory.imperium || Memory.imperium.schemaVersion !== MEMORY_SCHEMA_VERSION) {
    Memory.imperium = createDefaultImperiumMemory();
  }

  Memory.imperium.kernel.lastTick = Game.time;
  Memory.imperium.kernel.scheduler.lastRunCpu = Game.cpu.getUsed();
};

declare global {
  interface CreepMemory {
    role?: string;
    harvesting?: boolean;
    transferTargetId?: Id<StructureExtension | StructureSpawn>;
  }

  interface RoomMemory {
    workerCount?: number;
  }

  interface Memory extends RootMemory {}
}

export {};
