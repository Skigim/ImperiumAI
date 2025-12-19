import { Process, ProcessPriority, ProcessResult } from '../kernel';
import { runSpawnManager } from '../managers/spawnManager';
import { runTrafficManager } from '../managers/trafficManager';
import { runWorker } from '../roles/worker';
import { getMyCreepsInRoom } from '../utils/cache';

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

    // CPU profiling
    const cpuStart = Game.cpu.getUsed();
    let lastCpu = cpuStart;

    // Spawn management - create workers up to max mining positions
    runSpawnManager(room);
    const spawnCpu = Game.cpu.getUsed() - lastCpu;
    lastCpu = Game.cpu.getUsed();

    // Run all creeps in this room (cached)
    const roomCreeps = getMyCreepsInRoom(room);
    const cacheCpu = Game.cpu.getUsed() - lastCpu;
    lastCpu = Game.cpu.getUsed();

    let trafficCpu = 0;
    let workerCpu = 0;

    for (const creep of roomCreeps) {
      const creepStart = Game.cpu.getUsed();
      
      // Traffic management (stuck detection)
      runTrafficManager(creep);
      trafficCpu += Game.cpu.getUsed() - creepStart;
      
      const workerStart = Game.cpu.getUsed();
      // Role execution
      if (creep.memory.role === 'worker') {
        runWorker(creep);
      }
      workerCpu += Game.cpu.getUsed() - workerStart;
    }

    const totalCpu = Game.cpu.getUsed() - cpuStart;
    
    // Log breakdown if significant CPU used
    if (totalCpu > 1.5) {
      console.log(`[CPU] ${this.name}: spawn=${spawnCpu.toFixed(2)}, cache=${cacheCpu.toFixed(2)}, traffic=${trafficCpu.toFixed(2)}, worker=${workerCpu.toFixed(2)}, total=${totalCpu.toFixed(2)}`);
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
