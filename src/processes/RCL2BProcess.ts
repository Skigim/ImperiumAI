import { Process, ProcessPriority, ProcessResult } from '../kernel';

/**
 * RCL2BProcess - Infrastructure & Upgrade Push
 * 
 * Runs after extensions are built. Transitions from workers to miners/haulers.
 * 
 * Phases:
 * 2. First Miner: Spawn miner for Source1, worker builds container
 * 3. First Hauler: Once container built, spawn hauler
 * 4. Second Source: Repeat for Source2
 * 5. Upgrade Push: All excess energy to controller
 * 
 * Self-contained: No external managers or utilities.
 */
export class RCL2BProcess implements Process {
  readonly id: string;
  readonly name: string;
  readonly priority = ProcessPriority.NORMAL;

  private readonly roomName: string;

  // Creep Bodies (RCL 2 - 550 capacity)
  private static readonly WORKER_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE, MOVE]; // 250
  private static readonly MINER_BODY: BodyPartConstant[] = [WORK, WORK, WORK, WORK, WORK, MOVE]; // 550
  private static readonly HAULER_BODY: BodyPartConstant[] = [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE]; // 300

  private static readonly MINER_COST = 550;
  private static readonly HAULER_COST = 300;
  private static readonly WORKER_COST = 250;

  constructor(roomName: string) {
    this.roomName = roomName;
    this.id = `rcl2b-${roomName}`;
    this.name = `RCL2B(${roomName})`;
  }

  /**
   * Run if RCL 2 and all 5 extensions are built.
   */
  shouldRun(): boolean {
    const room = Game.rooms[this.roomName];
    if (!room || !room.controller?.my) return false;
    if (room.controller.level !== 2) return false;
    
    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    });
    
    return extensions.length >= 5;
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

    // Initialize room memory for container tracking
    if (!room.memory.sourceContainers) {
      room.memory.sourceContainers = {};
    }

    // Get sources
    const sources = room.find(FIND_SOURCES);
    
    // Get all creeps by role
    const creeps = room.find(FIND_MY_CREEPS);
    const miners = creeps.filter(c => c.memory.role === 'miner');
    const haulers = creeps.filter(c => c.memory.role === 'hauler');
    const workers = creeps.filter(c => c.memory.role === 'worker');

    // Track containers per source
    const sourceData = sources.map(source => {
      const container = this.findContainerNearSource(source);
      const containerSite = this.findContainerSiteNearSource(source);
      const miner = miners.find(m => m.memory.sourceId === source.id);
      const hauler = haulers.find(h => h.memory.sourceId === source.id);
      
      return {
        source,
        container,
        containerSite,
        miner,
        hauler,
        hasContainer: !!container,
        hasMiner: !!miner,
        hasHauler: !!hauler,
      };
    });

    // Determine current phase based on infrastructure state
    const phase = this.determinePhase(sourceData);

    // Run spawning logic based on phase
    this.runSpawning(spawn, phase, sourceData, workers.length);

    // Run all creeps
    for (const miner of miners) {
      this.runMiner(miner);
    }

    for (const hauler of haulers) {
      this.runHauler(hauler, spawn, room);
    }

    for (const worker of workers) {
      this.runWorker(worker, spawn, room.controller, sourceData);
    }

    return {
      success: true,
      message: `Phase ${phase}: ${miners.length}M/${haulers.length}H/${workers.length}W`,
    };
  }

  /**
   * Determine current phase based on infrastructure state.
   */
  private determinePhase(sourceData: Array<{
    hasContainer: boolean;
    hasMiner: boolean;
    hasHauler: boolean;
  }>): number {
    const s1 = sourceData[0];
    const s2 = sourceData[1];

    // Phase 5: Both sources have miner + container + hauler
    if (s1?.hasContainer && s1?.hasHauler && s2?.hasContainer && s2?.hasHauler) {
      return 5;
    }

    // Phase 4: First source complete, working on second
    if (s1?.hasContainer && s1?.hasHauler) {
      return 4;
    }

    // Phase 3: First miner exists and container built, need hauler
    if (s1?.hasMiner && s1?.hasContainer) {
      return 3;
    }

    // Phase 2: Need first miner
    return 2;
  }

  /**
   * Spawning logic based on phase.
   */
  private runSpawning(
    spawn: StructureSpawn,
    phase: number,
    sourceData: Array<{
      source: Source;
      hasMiner: boolean;
      hasContainer: boolean;
      hasHauler: boolean;
    }>,
    workerCount: number
  ): void {
    if (spawn.spawning) return;

    const energyAvailable = spawn.room.energyAvailable;
    const s1 = sourceData[0];
    const s2 = sourceData[1];

    // Phase 2: Spawn first miner
    if (phase === 2 && !s1?.hasMiner && energyAvailable >= RCL2BProcess.MINER_COST) {
      this.spawnMiner(spawn, s1.source);
      return;
    }

    // Phase 3: Spawn first hauler
    if (phase === 3 && !s1?.hasHauler && energyAvailable >= RCL2BProcess.HAULER_COST) {
      this.spawnHauler(spawn, s1.source);
      return;
    }

    // Phase 4: Spawn second miner
    if (phase === 4 && s2 && !s2.hasMiner && energyAvailable >= RCL2BProcess.MINER_COST) {
      this.spawnMiner(spawn, s2.source);
      return;
    }

    // Phase 4: Spawn second hauler (after container)
    if (phase === 4 && s2 && s2.hasContainer && !s2.hasHauler && energyAvailable >= RCL2BProcess.HAULER_COST) {
      this.spawnHauler(spawn, s2.source);
      return;
    }

    // Keep at least 1 worker for building containers and emergencies
    if (workerCount < 1 && energyAvailable >= RCL2BProcess.WORKER_COST) {
      const name = `W${Game.time % 1000}`;
      spawn.spawnCreep(RCL2BProcess.WORKER_BODY, name, {
        memory: { role: 'worker', state: 'harvesting', stuckCount: 0 }
      });
    }
  }

  /**
   * Spawn a miner for a specific source.
   */
  private spawnMiner(spawn: StructureSpawn, source: Source): void {
    const name = `M${Game.time % 1000}`;
    const pos = this.findMiningPosition(source);
    
    const result = spawn.spawnCreep(RCL2BProcess.MINER_BODY, name, {
      memory: {
        role: 'miner',
        state: 'mining',
        sourceId: source.id,
        assignedPos: pos ? { x: pos.x, y: pos.y, roomName: source.room.name } : undefined,
        stuckCount: 0,
      }
    });

    if (result === OK) {
      console.log(`[RCL2B] Spawning miner: ${name} for source ${source.id}`);
    }
  }

  /**
   * Spawn a hauler for a specific source.
   */
  private spawnHauler(spawn: StructureSpawn, source: Source): void {
    const name = `H${Game.time % 1000}`;
    
    const result = spawn.spawnCreep(RCL2BProcess.HAULER_BODY, name, {
      memory: {
        role: 'hauler',
        state: 'hauling',
        sourceId: source.id,
        stuckCount: 0,
      }
    });

    if (result === OK) {
      console.log(`[RCL2B] Spawning hauler: ${name} for source ${source.id}`);
    }
  }

  /**
   * Find best mining position adjacent to source.
   */
  private findMiningPosition(source: Source): RoomPosition | null {
    const terrain = source.room.getTerrain();
    
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = source.pos.x + dx;
        const y = source.pos.y + dy;
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          return new RoomPosition(x, y, source.room.name);
        }
      }
    }
    return null;
  }

  /**
   * Find container near source.
   */
  private findContainerNearSource(source: Source): StructureContainer | null {
    const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: s => s.structureType === STRUCTURE_CONTAINER
    }) as StructureContainer[];
    return containers[0] || null;
  }

  /**
   * Find container construction site near source.
   */
  private findContainerSiteNearSource(source: Source): ConstructionSite | null {
    const sites = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
      filter: s => s.structureType === STRUCTURE_CONTAINER
    });
    return sites[0] || null;
  }

  /**
   * Run miner logic: go to position, drop mine.
   */
  private runMiner(creep: Creep): void {
    if (!creep.memory.sourceId) return;

    const source = Game.getObjectById(creep.memory.sourceId);
    if (!source) return;

    // Move to assigned position
    if (creep.memory.assignedPos) {
      const pos = new RoomPosition(
        creep.memory.assignedPos.x,
        creep.memory.assignedPos.y,
        creep.memory.assignedPos.roomName
      );

      if (!creep.pos.isEqualTo(pos)) {
        creep.moveTo(pos, { reusePath: 10 });
        return;
      }
    }

    // At position - harvest (drop mining)
    creep.harvest(source);
  }

  /**
   * Run hauler logic: pickup from container/ground → deliver to spawn/extensions.
   */
  private runHauler(creep: Creep, spawn: StructureSpawn, room: Room): void {
    // State transitions
    if (creep.store.getFreeCapacity() === 0) {
      creep.memory.state = 'delivering';
    }
    if (creep.store.getUsedCapacity() === 0) {
      creep.memory.state = 'hauling';
    }

    if (creep.memory.state === 'hauling') {
      this.doHaulerPickup(creep);
    } else {
      this.doHaulerDeliver(creep, spawn, room);
    }
  }

  /**
   * Hauler pickup from container or ground near source.
   */
  private doHaulerPickup(creep: Creep): void {
    if (!creep.memory.sourceId) return;

    const source = Game.getObjectById(creep.memory.sourceId);
    if (!source) return;

    // Try container first
    const container = this.findContainerNearSource(source);
    if (container && container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(container, { reusePath: 5 });
      }
      return;
    }

    // Fallback: pickup from ground
    const dropped = source.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
      filter: r => r.resourceType === RESOURCE_ENERGY
    })[0];
    
    if (dropped) {
      if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
        creep.moveTo(dropped, { reusePath: 5 });
      }
      return;
    }

    // Nothing to pickup - move near source to wait
    if (!creep.pos.inRangeTo(source, 2)) {
      creep.moveTo(source, { reusePath: 5, range: 2 });
    }
  }

  /**
   * Hauler deliver to spawn/extensions.
   */
  private doHaulerDeliver(creep: Creep, spawn: StructureSpawn, room: Room): void {
    // Priority 1: Fill spawn
    if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, { reusePath: 5 });
      }
      return;
    }

    // Priority 2: Fill extensions
    const extension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureExtension =>
        s.structureType === STRUCTURE_EXTENSION &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    
    if (extension) {
      if (creep.transfer(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(extension, { reusePath: 5 });
      }
      return;
    }

    // Priority 3: Upgrade controller
    if (room.controller) {
      if (creep.upgradeController(room.controller) === ERR_NOT_IN_RANGE) {
        creep.moveTo(room.controller, { reusePath: 5, range: 3 });
      }
    }
  }

  /**
   * Run worker logic: build containers, upgrade controller, emergency refill.
   */
  private runWorker(
    creep: Creep,
    spawn: StructureSpawn,
    controller: StructureController,
    sourceData: Array<{
      source: Source;
      miner?: Creep;
      container: StructureContainer | null;
      containerSite: ConstructionSite | null;
    }>
  ): void {
    // State transitions
    if (creep.memory.state === 'harvesting' && creep.store.getFreeCapacity() === 0) {
      creep.memory.state = 'delivering';
    }
    if (creep.memory.state === 'delivering' && creep.store.getUsedCapacity() === 0) {
      creep.memory.state = 'harvesting';
    }

    if (creep.memory.state === 'harvesting') {
      this.doWorkerHarvest(creep, sourceData);
    } else {
      this.doWorkerDeliver(creep, spawn, controller, sourceData);
    }
  }

  /**
   * Worker harvest: pickup from miner drops or mine directly.
   */
  private doWorkerHarvest(
    creep: Creep,
    sourceData: Array<{ source: Source; miner?: Creep }>
  ): void {
    // Try to pickup dropped energy from miners first
    for (const data of sourceData) {
      if (data.miner) {
        const dropped = data.miner.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
          filter: r => r.resourceType === RESOURCE_ENERGY
        })[0];
        
        if (dropped) {
          if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
            creep.moveTo(dropped, { reusePath: 5 });
          }
          return;
        }
      }
    }

    // Fallback: mine directly
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
      if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, { reusePath: 5 });
      }
    }
  }

  /**
   * Worker deliver: build containers → upgrade controller.
   */
  private doWorkerDeliver(
    creep: Creep,
    spawn: StructureSpawn,
    controller: StructureController,
    sourceData: Array<{
      source: Source;
      miner?: Creep;
      container: StructureContainer | null;
      containerSite: ConstructionSite | null;
    }>
  ): void {
    // Priority 1: Place and build container at miner position
    for (const data of sourceData) {
      if (data.miner && !data.container) {
        // Place container site if not exists
        if (!data.containerSite) {
          const result = data.miner.room.createConstructionSite(
            data.miner.pos.x,
            data.miner.pos.y,
            STRUCTURE_CONTAINER
          );
          if (result === OK) {
            console.log(`[RCL2B] Placed container site at miner position`);
          }
          return;
        }

        // Build the container
        if (creep.build(data.containerSite) === ERR_NOT_IN_RANGE) {
          creep.moveTo(data.containerSite, { reusePath: 5, range: 3 });
        }
        return;
      }
    }

    // Priority 2: Fill spawn/extensions if low
    if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawn, { reusePath: 5 });
      }
      return;
    }

    // Priority 3: Upgrade controller
    if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
      creep.moveTo(controller, { reusePath: 5, range: 3 });
    }
  }
}
