import { Process, ProcessPriority, ProcessResult } from '../kernel';
import { runSpawnManager } from '../managers/spawnManager';
import { runTrafficManager } from '../managers/trafficManager';
import { runWorker } from '../roles/worker';

/**
 * ColdBootProcess handles room management for RCL 1-2 rooms.
 * 
 * This process manages the initial bootstrap phase of a room:
 * - Spawns workers to harvest energy
 * - Workers deliver to spawn/extensions to maintain energy
 * - Workers upgrade controller to reach RCL 3
 * 
 * Once the room reaches RCL 3, this process should be replaced with
 * more specialized room management processes.
 */
export class ColdBootProcess implements Process {
  readonly id: string;
  readonly name: string;
  readonly priority = ProcessPriority.NORMAL;

  private readonly roomName: string;

  constructor(roomName: string) {
    this.roomName = roomName;
    this.id = `coldboot-${roomName}`;
    this.name = `ColdBoot(${roomName})`;
  }

  /**
   * Only run if the room exists and is RCL 1-2.
   */
  shouldRun(): boolean {
    const room = Game.rooms[this.roomName];
    if (!room || !room.controller?.my) {
      return false;
    }
    return room.controller.level <= 2;
  }

  /**
   * Run cold boot logic for this room.
   */
  run(): ProcessResult {
    const room = Game.rooms[this.roomName];
    
    if (!room) {
      return {
        success: false,
        message: `Room ${this.roomName} not visible`,
      };
    }

    if (!room.controller?.my) {
      return {
        success: false,
        message: `Room ${this.roomName} not owned`,
      };
    }

    // Spawn management - create workers up to 2 per source
    runSpawnManager(room);

    // Run all creeps in this room
    const roomCreeps = Object.values(Game.creeps).filter(
      (c) => c.room.name === this.roomName
    );

    for (const creep of roomCreeps) {
      // Traffic management (stuck detection)
      runTrafficManager(creep);

      // Role execution
      if (creep.memory.role === 'worker') {
        runWorker(creep);
      }
    }

    return {
      success: true,
      message: `Managed ${roomCreeps.length} creeps`,
    };
  }
}

/**
 * Create cold boot processes for all owned rooms at RCL 1-2.
 */
export function createColdBootProcesses(): ColdBootProcess[] {
  const processes: ColdBootProcess[] = [];

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    
    if (room.controller?.my && room.controller.level <= 2) {
      processes.push(new ColdBootProcess(roomName));
    }
  }

  return processes;
}
