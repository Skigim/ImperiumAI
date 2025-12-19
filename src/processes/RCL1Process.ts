import { Process, ProcessPriority, ProcessResult } from '../kernel';

/**
 * RCL1Process - Speedrun to RCL 2
 * 
 * Goal: Rush to RCL 2 as fast as possible with minimal complexity.
 * - Spawn exactly 2 workers [WORK, CARRY, MOVE, MOVE]
 * - Workers harvest energy and keep spawn topped up
 * - Once spawn is full, workers upgrade controller
 * - Hands off to RCL2AProcess at RCL 2
 * 
 * Self-contained: No external managers or utilities.
 */
export class RCL1Process implements Process {
  readonly id: string;
  readonly name: string;
  readonly priority = ProcessPriority.CRITICAL;

  private readonly roomName: string;

  // Constants
  private static readonly WORKER_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE];
  private static readonly WORKER_COST = 250;
  private static readonly MAX_WORKERS = 3;

  constructor(roomName: string) {
    this.roomName = roomName;
    this.id = `rcl1-${roomName}`;
    this.name = `RCL1(${roomName})`;
  }

  /**
   * Only run if room exists and is RCL 1.
   */
  shouldRun(): boolean {
    const room = Game.rooms[this.roomName];
    if (!room || !room.controller?.my) {
      return false;
    }
    return room.controller.level === 1;
  }

  /**
   * Main process loop.
   */
  run(): ProcessResult {
    const room = Game.rooms[this.roomName];
    
    if (!room || !room.controller?.my) {
      return { success: false, message: `Room ${this.roomName} not accessible` };
    }

    // Get spawn
    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) {
      return { success: false, message: 'No spawn found' };
    }

    // Get our workers
    const workers = room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'worker');

    // Spawn workers up to MAX_WORKERS
    this.runSpawning(spawn, workers.length);

    // Run each worker
    for (const creep of workers) {
      this.runWorker(creep, spawn, room.controller);
    }

    return {
      success: true,
      message: `RCL 1 speedrun: ${workers.length}/${RCL1Process.MAX_WORKERS} workers`,
    };
  }

  /**
   * Spawn workers if under cap.
   */
  private runSpawning(spawn: StructureSpawn, currentCount: number): void {
    if (spawn.spawning) return;
    if (currentCount >= RCL1Process.MAX_WORKERS) return;
    if (spawn.room.energyAvailable < RCL1Process.WORKER_COST) return;

    const name = `W${Game.time % 1000}`;
    const result = spawn.spawnCreep(RCL1Process.WORKER_BODY, name, {
      memory: {
        role: 'worker',
        state: 'harvesting',
        stuckCount: 0,
      }
    });

    if (result === OK) {
      console.log(`[RCL1] Spawning worker: ${name}`);
    }
  }

  /**
   * Run individual worker logic.
   * Simple state machine: harvesting ↔ delivering
   */
  private runWorker(creep: Creep, spawn: StructureSpawn, controller: StructureController): void {
    // State transitions
    if (creep.memory.state === 'harvesting' && creep.store.getFreeCapacity() === 0) {
      creep.memory.state = 'delivering';
    }
    if (creep.memory.state === 'delivering' && creep.store.getUsedCapacity() === 0) {
      creep.memory.state = 'harvesting';
    }

    // Execute state
    if (creep.memory.state === 'harvesting') {
      this.doHarvest(creep);
    } else {
      this.doDeliver(creep, spawn, controller);
    }
  }

  /**
   * Harvest from nearest source.
   */
  private doHarvest(creep: Creep): void {
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (!source) return;

    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
      creep.moveTo(source, { reusePath: 5 });
    }
  }

  /**
   * Deliver energy: spawn first, then controller.
   */
  private doDeliver(creep: Creep, spawn: StructureSpawn, controller: StructureController): void {
    // Priority 1: Keep spawn topped up ONLY until we have 3 workers
    const workerCount = creep.room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'worker').length;
    if (workerCount < RCL1Process.MAX_WORKERS && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, { reusePath: 5 });
      }
      return;
    }

    // Priority 2: Upgrade controller (rush to RCL 2)
    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
      creep.moveTo(controller, { reusePath: 5, range: 3 });
    }
  }
}

/**
 * Create RCL1 processes for all owned RCL 1 rooms.
 */
export function createRCL1Processes(): RCL1Process[] {
  const processes: RCL1Process[] = [];

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    
    if (room.controller?.my && room.controller.level === 1) {
      processes.push(new RCL1Process(roomName));
    }
  }

  return processes;
}
