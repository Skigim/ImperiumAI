import { ProcessPriority, ProcessResult } from '../kernel';
import { findAndAssignMiningPosition, releaseMiningPosition } from '../lib';
import { RoomStageProcess } from './RoomStageProcess';

/**
 * RCL1Process - Speedrun to RCL 2
 * 
 * Goal: Rush to RCL 2 as fast as possible with minimal complexity.
 * - Spawn exactly 2 workers [WORK, CARRY, MOVE, MOVE]
 * - Workers harvest energy and keep spawn topped up
 * - Once spawn is full, workers upgrade controller
 * - Hands off to RCL2AProcess at RCL 2
 */
export class RCL1Process extends RoomStageProcess {
  readonly priority = ProcessPriority.CRITICAL;

  // Constants
  private static readonly WORKER_BODY: BodyPartConstant[] = [WORK, WORK, CARRY, MOVE];
  private static readonly WORKER_COST = 300;
  private static readonly MAX_WORKERS = 4;

  constructor(roomName: string) {
    super(roomName, 'rcl1', 'RCL1');
  }

  /**
   * Only run if room exists and is RCL 1.
   */
  shouldRun(): boolean {
    const room = this.room;
    if (!room?.controller?.my) return false;
    return room.controller.level === 1;
  }

  /**
   * Main process loop.
   */
  run(): ProcessResult {
    const room = this.room;
    
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
      // Release mining position so others can use it
      releaseMiningPosition(creep);
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
   * Harvest: go to assigned mining position and harvest.
   * Uses shared lib/miningPositions for position management.
   */
  private doHarvest(creep: Creep): void {
    const room = creep.room;

    // Assign mining position if not already assigned
    if (!creep.memory.assignedPos) {
      const preferredSource = creep.memory.sourceId 
        ? Game.getObjectById(creep.memory.sourceId) 
        : null;
      const assignment = findAndAssignMiningPosition(room, creep.name, preferredSource);
      if (!assignment) {
        // No positions available, wait
        return;
      }
      creep.memory.assignedPos = assignment.pos;
      creep.memory.sourceId = assignment.sourceId;
    }

    // Move to assigned position
    const pos = new RoomPosition(
      creep.memory.assignedPos.x,
      creep.memory.assignedPos.y,
      creep.memory.assignedPos.roomName
    );

    if (!creep.pos.isEqualTo(pos)) {
      creep.moveTo(pos, { reusePath: 5 });
      return;
    }

    // At position - harvest
    if (creep.memory.sourceId) {
      const source = Game.getObjectById(creep.memory.sourceId);
      if (source) {
        creep.harvest(source);
      }
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
