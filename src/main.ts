import './types';
import { releasePosition } from './utils/positions';
import { getKernel, isKernelInitialized } from './kernel';
import { ColdBootProcess } from './processes';

/**
 * Main game loop - called every tick by Screeps engine.
 * The kernel manages all process scheduling and execution.
 */
export function loop(): void {
  // Memory cleanup - remove dead creeps and release their positions
  cleanupMemory();

  // Initialize global memory structures
  if (!Memory.rooms) {
    Memory.rooms = {};
  }

  // Initialize kernel memory
  if (!Memory.kernel) {
    Memory.kernel = {
      registeredProcesses: [],
      lastTick: Game.time,
    };
  }

  // Get or create kernel instance
  const kernel = getKernel();

  // Register processes after global reset or for new rooms
  if (!isKernelInitialized()) {
    initializeProcesses(kernel);
  }

  // Run all registered processes
  kernel.run();

  // Update kernel memory
  Memory.kernel.lastTick = Game.time;
}

/**
 * Initialize and register all processes with the kernel.
 * Called after global reset or when kernel needs reinitialization.
 */
function initializeProcesses(kernel: ReturnType<typeof getKernel>): void {
  console.log('Initializing kernel processes...');

  // Register cold boot process for each owned RCL 1-2 room
  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    
    if (room.controller?.my && room.controller.level <= 2) {
      const process = new ColdBootProcess(roomName);
      kernel.register(process);
      console.log(`Registered: ${process.name}`);
    }
  }

  console.log(`Kernel initialized with ${kernel.processCount} processes`);
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
