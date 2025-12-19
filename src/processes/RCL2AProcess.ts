import { Process, ProcessPriority, ProcessResult } from '../kernel';
import { buildRemoteWorkerBody, buildFillerBody, buildLocalWorkerBody, getBodyCost, countMiningPositions } from '../lib';
import { runWorker, runFiller, runRemoteWorker } from '../roles';

/**
 * RCL2AProcess - Extension Rush with Remote Mining
 * 
 * Goal: Build 5 extensions as fast as possible to unlock 550 energy capacity.
 * 
 * Creep Roles:
 * - Filler (1): Dedicated to keeping spawn/extensions full
 * - Workers: Local harvesters that build extensions
 * - Remote Workers: Harvest from adjacent rooms once local is saturated
 * 
 * Upgrade controller only if at risk of downgrade (< 1000 ticks)
 * Hands off to RCL2BProcess once all 5 extensions are built
 */
export class RCL2AProcess implements Process {
  readonly id: string;
  readonly name: string;
  readonly priority = ProcessPriority.CRITICAL;

  private readonly roomName: string;

  // Constants
  private static readonly MAX_EXTENSIONS = 5;
  private static readonly DOWNGRADE_THRESHOLD = 1000;

  constructor(roomName: string) {
    this.roomName = roomName;
    this.id = `rcl2a-${roomName}`;
    this.name = `RCL2A(${roomName})`;
  }

  /**
   * Run if RCL 2 and extensions not yet complete.
   */
  shouldRun(): boolean {
    const room = Game.rooms[this.roomName];
    if (!room || !room.controller?.my) return false;
    if (room.controller.level !== 2) return false;
    
    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    });
    
    return extensions.length < RCL2AProcess.MAX_EXTENSIONS;
  }

  /**
   * Main process loop.
   */
  run(): ProcessResult {
    const room = Game.rooms[this.roomName];
    
    if (!room || !room.controller?.my) {
      return { success: false, message: `Room ${this.roomName} not accessible` };
    }

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn) {
      return { success: false, message: 'No spawn found' };
    }

    // Count extensions (built and under construction)
    const builtExtensions = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    });
    const extensionSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    });

    // Place ONE extension construction site when none exist
    if (extensionSites.length === 0 && builtExtensions.length < RCL2AProcess.MAX_EXTENSIONS) {
      this.placeExtension(room, spawn, builtExtensions.length);
    }

    // Get creeps by role
    const workers = room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'worker');
    const fillers = room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'filler');
    const remoteWorkers = Object.values(Game.creeps).filter(
      c => c.memory.role === 'remoteWorker' && c.memory.homeRoom === this.roomName
    );

    // Spawn logic - reserve 1 mining position per filler
    const maxLocalWorkers = countMiningPositions(room) - fillers.length;
    const isFullyStaffed = workers.length >= maxLocalWorkers && fillers.length >= 1;
    this.runSpawning(spawn, workers.length, fillers.length, maxLocalWorkers, room.energyCapacityAvailable);

    // Prepare context for role behaviors
    const needsUpgrade = room.controller.ticksToDowngrade < RCL2AProcess.DOWNGRADE_THRESHOLD;
    const workerCtx = { spawn, controller: room.controller, extensionSites, needsUpgrade, isFullyStaffed };
    const fillerCtx = { spawn, controller: room.controller };
    const remoteCtx = { homeSpawn: spawn, controller: room.controller, extensionSites, needsUpgrade };

    // Run creeps using role behaviors
    for (const filler of fillers) {
      runFiller(filler, fillerCtx);
    }
    for (const worker of workers) {
      runWorker(worker, workerCtx);
    }
    for (const remote of remoteWorkers) {
      runRemoteWorker(remote, remoteCtx);
    }

    return {
      success: true,
      message: `Extension rush: ${builtExtensions.length}/${RCL2AProcess.MAX_EXTENSIONS}, W:${workers.length} F:${fillers.length} R:${remoteWorkers.length}`,
    };
  }

  /**
   * Place ONE extension construction site near spawn.
   */
  private placeExtension(room: Room, spawn: StructureSpawn, existingCount: number): void {
    const positions = [
      { x: spawn.pos.x + 2, y: spawn.pos.y },
      { x: spawn.pos.x - 2, y: spawn.pos.y },
      { x: spawn.pos.x, y: spawn.pos.y + 2 },
      { x: spawn.pos.x, y: spawn.pos.y - 2 },
      { x: spawn.pos.x + 2, y: spawn.pos.y + 2 },
    ];

    const pos = positions[existingCount];
    if (!pos) return;

    const terrain = room.getTerrain();
    if (terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
      const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
      if (result === OK) {
        console.log(`[RCL2A] Placed extension site ${existingCount + 1}/${RCL2AProcess.MAX_EXTENSIONS}`);
      }
    }
  }

  /**
   * Spawn creeps with priority: Filler > Workers > Remote Workers
   */
  private runSpawning(
    spawn: StructureSpawn,
    workerCount: number,
    fillerCount: number,
    maxLocalWorkers: number,
    energyCapacity: number
  ): void {
    if (spawn.spawning) return;

    const energyAvailable = spawn.room.energyAvailable;

    // Priority 1: Filler
    if (fillerCount === 0) {
      const body = buildFillerBody(energyCapacity);
      const cost = getBodyCost(body);
      if (energyAvailable >= cost) {
        const name = `F${Game.time % 1000}`;
        if (spawn.spawnCreep(body, name, {
          memory: { role: 'filler', state: 'harvesting', stuckCount: 0 }
        }) === OK) {
          console.log(`[RCL2A] Spawning filler: ${name}`);
        }
      }
      return;
    }

    // Priority 2: Local workers
    if (workerCount < maxLocalWorkers) {
      const body = buildLocalWorkerBody(energyCapacity);
      const cost = getBodyCost(body);
      if (energyAvailable >= cost) {
        const name = `W${Game.time % 1000}`;
        if (spawn.spawnCreep(body, name, {
          memory: { role: 'worker', state: 'harvesting', stuckCount: 0 }
        }) === OK) {
          console.log(`[RCL2A] Spawning worker: ${name}`);
        }
      }
      return;
    }

    // Priority 3: Remote workers - wait for full capacity for best body
    const targetRoom = this.findAdjacentRoomNeedingWorkers(spawn.room);
    if (targetRoom) {
      const body = buildRemoteWorkerBody(energyCapacity);
      const cost = getBodyCost(body);
      // Wait for full capacity so filler can fill extensions first
      if (energyAvailable >= energyCapacity) {
        const name = `R${Game.time % 1000}`;
        if (spawn.spawnCreep(body, name, {
          memory: {
            role: 'remoteWorker',
            state: 'harvesting',
            stuckCount: 0,
            homeRoom: this.roomName,
            targetRoom: targetRoom,
          }
        }) === OK) {
          console.log(`[RCL2A] Spawning remote worker: ${name} -> ${targetRoom}`);
        }
      }
    }
  }

  /**
   * Find an adjacent room that needs more workers.
   */
  private findAdjacentRoomNeedingWorkers(room: Room): string | null {
    const exits = Game.map.describeExits(room.name);
    if (!exits) return null;

    // Count current remote workers per room
    const workersByRoom: Record<string, number> = {};
    for (const creep of Object.values(Game.creeps)) {
      if (creep.memory.role === 'remoteWorker' && creep.memory.homeRoom === this.roomName) {
        const target = creep.memory.targetRoom!;
        workersByRoom[target] = (workersByRoom[target] || 0) + 1;
      }
    }

    // Find room needing workers
    for (const dir of ['1', '3', '5', '7'] as const) {
      const adjacentRoomName = exits[dir];
      if (!adjacentRoomName) continue;

      const currentWorkers = workersByRoom[adjacentRoomName] || 0;
      const adjacentRoom = Game.rooms[adjacentRoomName];

      if (adjacentRoom) {
        const maxWorkers = countMiningPositions(adjacentRoom);
        if (currentWorkers < maxWorkers) {
          return adjacentRoomName;
        }
      } else {
        // No visibility - send 1 scout
        if (currentWorkers === 0) {
          return adjacentRoomName;
        }
      }
    }
    return null;
  }
}
