import { Process, ProcessPriority, ProcessResult } from '../kernel/Process';
import { runWorker, WorkerContext } from '../roles';

export class WorkerProcess implements Process {
  static getId(roomName: string): string {
    return `workers:${roomName}`;
  }

  readonly id: string;
  readonly name: string;
  readonly priority = ProcessPriority.NORMAL;

  constructor(private readonly roomName: string) {
    this.id = WorkerProcess.getId(roomName);
    this.name = `Worker Process ${roomName}`;
  }

  shouldRun(): boolean {
    return Boolean(Game.rooms[this.roomName]?.controller?.my);
  }

  shouldTerminate(): boolean {
    return !Game.rooms[this.roomName]?.controller?.my;
  }

  run(): ProcessResult {
    const room = Game.rooms[this.roomName];

    if (!room?.controller?.my) {
      return { success: false, message: `Room ${this.roomName} is not owned or visible` };
    }

    const spawn = room.find(FIND_MY_SPAWNS)[0];

    if (!spawn) {
      return { success: false, message: `Room ${this.roomName} has no spawn anchor` };
    }

    const workers = room.find(FIND_MY_CREEPS).filter((creep) => {
      return creep.memory.role === 'worker';
    });

    room.memory.workerCount = workers.length;
    room.memory.maxWorkers ??= room.memory.harvestPosCap?.length ?? workers.length;

    const ctx: WorkerContext = {
      spawn,
      controller: room.controller,
      extensionSites: room
        .find(FIND_MY_CONSTRUCTION_SITES)
        .filter((site) => site.structureType === STRUCTURE_EXTENSION),
      needsUpgrade: (room.controller.ticksToDowngrade ?? Infinity) < 2000,
      isFullyStaffed: workers.length >= (room.memory.maxWorkers ?? workers.length),
    };

    for (const worker of workers) {
      runWorker(worker, ctx);
    }

    return { success: true, message: `Ran ${workers.length} worker(s) in ${this.roomName}` };
  }
}