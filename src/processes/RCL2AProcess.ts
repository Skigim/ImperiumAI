import { Process, ProcessPriority, ProcessResult } from '../kernel';

/**
 * RCL2AProcess - Extension Rush
 * 
 * Goal: Build 5 extensions as fast as possible to unlock 550 energy capacity.
 * - Spawn workers up to available mining positions
 * - Workers: harvest → fill spawn → build extensions
 * - Upgrade controller only if at risk of downgrade (< 1000 ticks)
 * - Hands off to RCL2BProcess once all 5 extensions are built
 * 
 * Self-contained: No external managers or utilities.
 */
export class RCL2AProcess implements Process {
  readonly id: string;
  readonly name: string;
  readonly priority = ProcessPriority.CRITICAL;

  private readonly roomName: string;

  // Constants
  private static readonly WORKER_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE];
  private static readonly WORKER_COST = 250;
  private static readonly MAX_EXTENSIONS = 5;
  private static readonly DOWNGRADE_THRESHOLD = 1000; // ticks until downgrade warning

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
    
    // Count built extensions
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

    // Place ONE extension construction site only when none exist (focus on completing one at a time)
    if (extensionSites.length === 0 && builtExtensions.length < RCL2AProcess.MAX_EXTENSIONS) {
      this.placeExtensions(room, spawn, builtExtensions.length);
    }

    // Get workers
    const workers = room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'worker');

    // Spawn workers up to mining positions
    const maxWorkers = this.countMiningPositions(room);
    this.runSpawning(spawn, workers.length, maxWorkers);

    // Check if controller at risk of downgrade
    const needsUpgrade = room.controller.ticksToDowngrade < RCL2AProcess.DOWNGRADE_THRESHOLD;

    // Run each worker
    for (const creep of workers) {
      this.runWorker(creep, spawn, room.controller, extensionSites, needsUpgrade);
    }

    return {
      success: true,
      message: `Extension rush: ${builtExtensions.length}/${RCL2AProcess.MAX_EXTENSIONS} built, ${workers.length} workers`,
    };
  }

  /**
   * Place ONE extension construction site near spawn.
   * Only places next one when no sites exist (previous completed).
   */
  private placeExtensions(room: Room, spawn: StructureSpawn, existingCount: number): void {
    // Simple placement: spiral out from spawn
    const positions = [
      { x: spawn.pos.x + 2, y: spawn.pos.y },
      { x: spawn.pos.x - 2, y: spawn.pos.y },
      { x: spawn.pos.x, y: spawn.pos.y + 2 },
      { x: spawn.pos.x, y: spawn.pos.y - 2 },
      { x: spawn.pos.x + 2, y: spawn.pos.y + 2 },
    ];

    // Only place one at a time
    const pos = positions[existingCount];
    if (!pos) return;
    
    // Check if position is valid (not a wall)
    const terrain = room.getTerrain();
    if (terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
      const result = room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
      if (result === OK) {
        console.log(`[RCL2A] Placed extension site ${existingCount + 1}/${RCL2AProcess.MAX_EXTENSIONS} at (${pos.x}, ${pos.y})`);
      }
    }
  }

  /**
   * Count available mining positions around sources.
   */
  private countMiningPositions(room: Room): number {
    // Cache in memory
    if (room.memory.miningPositionCount !== undefined) {
      return room.memory.miningPositionCount;
    }

    const sources = room.find(FIND_SOURCES);
    const terrain = room.getTerrain();
    let count = 0;

    for (const source of sources) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const x = source.pos.x + dx;
          const y = source.pos.y + dy;
          if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
            count++;
          }
        }
      }
    }

    room.memory.miningPositionCount = count;
    return count;
  }

  /**
   * Spawn workers if under cap.
   */
  private runSpawning(spawn: StructureSpawn, currentCount: number, maxWorkers: number): void {
    if (spawn.spawning) return;
    if (currentCount >= maxWorkers) return;
    if (spawn.room.energyAvailable < RCL2AProcess.WORKER_COST) return;

    const name = `W${Game.time % 1000}`;
    const result = spawn.spawnCreep(RCL2AProcess.WORKER_BODY, name, {
      memory: {
        role: 'worker',
        state: 'harvesting',
        stuckCount: 0,
      }
    });

    if (result === OK) {
      console.log(`[RCL2A] Spawning worker: ${name}`);
    }
  }

  /**
   * Run worker logic: harvest → fill spawn/extensions → build extensions → upgrade (if needed)
   */
  private runWorker(
    creep: Creep,
    spawn: StructureSpawn,
    controller: StructureController,
    extensionSites: ConstructionSite[],
    needsUpgrade: boolean
  ): void {
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
      this.doDeliver(creep, spawn, controller, extensionSites, needsUpgrade);
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
   * Deliver energy with priority: spawn/extensions → build extensions → upgrade (if needed)
   */
  private doDeliver(
    creep: Creep,
    spawn: StructureSpawn,
    controller: StructureController,
    extensionSites: ConstructionSite[],
    needsUpgrade: boolean
  ): void {
    // Priority 1: Fill spawn
    if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, { reusePath: 5 });
      }
      return;
    }

    // Priority 2: Fill extensions
    const needyExtension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureExtension => 
        s.structureType === STRUCTURE_EXTENSION && 
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    if (needyExtension) {
      if (creep.transfer(needyExtension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(needyExtension, { reusePath: 5 });
      }
      return;
    }

    // Priority 3: Build extension construction sites
    const site = creep.pos.findClosestByPath(extensionSites);
    if (site) {
      if (creep.build(site) === ERR_NOT_IN_RANGE) {
        creep.moveTo(site, { reusePath: 5, range: 3 });
      }
      return;
    }

    // Priority 4: Upgrade controller (only if at risk of downgrade)
    if (needsUpgrade) {
      if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
        creep.moveTo(controller, { reusePath: 5, range: 3 });
      }
      return;
    }

    // Nothing to do - idle near spawn
    if (!creep.pos.inRangeTo(spawn, 3)) {
      creep.moveTo(spawn, { reusePath: 5, range: 3 });
    }
  }
}
