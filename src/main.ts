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

    // RCL 1: Speedrun to RCL 2
    if (room.controller.level === 1) {
      const process = new RCL1Process(roomName);
      kernel.register(process);
      console.log(`Registered: ${process.name}`);
    }
    
    // RCL 2: Register both A and B, they self-select via shouldRun()
    if (room.controller.level === 2) {
      const processA = new RCL2AProcess(roomName);
      const processB = new RCL2BProcess(roomName);
      kernel.register(processA);
      kernel.register(processB);
      console.log(`Registered: ${processA.name}, ${processB.name}`);
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
