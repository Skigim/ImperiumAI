import './types';
import { getKernel, isKernelInitialized } from './kernel';
import { RCL1Process, RCL2AProcess, RCL2BProcess } from './processes';

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

  for (const roomName in Game.rooms) {
    const room = Game.rooms[roomName];
    
    if (!room.controller?.my) continue;

    // Register ALL RCL processes for owned rooms
    // Each process's shouldRun() determines if it actually executes
    const rcl1 = new RCL1Process(roomName);
    const rcl2a = new RCL2AProcess(roomName);
    const rcl2b = new RCL2BProcess(roomName);
    
    kernel.register(rcl1);
    kernel.register(rcl2a);
    kernel.register(rcl2b);
    
    console.log(`Registered processes for ${roomName} (RCL ${room.controller.level})`);
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
        const assignedPositions = Memory.rooms[creepMemory.assignedPos.roomName]?.assignedPositions;
        if (assignedPositions) {
          for (const posKey in assignedPositions) {
            if (assignedPositions[posKey] === name) {
              delete assignedPositions[posKey];
              break;
            }
          }
        }
      }

      delete Memory.creeps[name];
      console.log(`Cleared memory for dead creep: ${name}`);
    }
  }
}
