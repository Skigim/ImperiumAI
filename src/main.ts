import './types';
import { releasePosition } from './utils/positions';
import { runSpawnManager } from './managers/spawnManager';
import { runTrafficManager } from './managers/trafficManager';
import { runWorker } from './roles/worker';

/**
 * Main game loop - called every tick by Screeps engine.
 */
export function loop(): void {
  // Memory cleanup - remove dead creeps and release their positions
  cleanupMemory();

  // Initialize global memory structures
  if (!Memory.rooms) {
    Memory.rooms = {};
  }

  // Run for each owned room
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    
    // Only process rooms we own
    if (!room.controller?.my) continue;

    // Cold boot phase: RCL 1-2
    if (room.controller.level <= 2) {
      runSpawnManager(room);
    }
  }

  // Run all creeps
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];

    // Traffic management (stuck detection)
    runTrafficManager(creep);

    // Role execution
    if (creep.memory.role === 'worker') {
      runWorker(creep);
    }
  }
}

/**
 * Clean up memory for dead creeps and release their assigned positions.
 */
function cleanupMemory(): void {
  for (const name in Memory.creeps) {
    if (!Game.creeps[name]) {
      // Release assigned position before deleting memory
      const creepMemory = Memory.creeps[name];
      if (creepMemory.assignedPos) {
        releasePosition(creepMemory.assignedPos.roomName, name);
      }

      delete Memory.creeps[name];
      console.log(`Cleared memory for dead creep: ${name}`);
    }
  }
}
