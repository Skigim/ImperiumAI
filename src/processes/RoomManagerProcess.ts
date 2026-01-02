import { Kernel, Process, ProcessPriority, ProcessResult } from '../kernel';
import { RCL1Process } from './RCL1Process';
import { RCL2AProcess } from './RCL2AProcess';
import { RCL2BProcess } from './RCL2BProcess';

type RoomStage = 'rcl1' | 'rcl2a' | 'rcl2b';

/**
 * Supervisor process per owned room.
 *
 * Watches room maturity (RCL + infrastructure) and ensures exactly one stage
 * process is registered and active at a time.
 */
export class RoomManagerProcess implements Process {
  public readonly id: string;
  public readonly name: string;
  public readonly priority = ProcessPriority.CRITICAL;

  private readonly roomName: string;
  private readonly kernel: Kernel;

  constructor(kernel: Kernel, roomName: string) {
    this.kernel = kernel;
    this.roomName = roomName;
    this.id = `roommgr-${roomName}`;
    this.name = `RoomManager(${roomName})`;
  }

  private get room(): Room | undefined {
    return Game.rooms[this.roomName];
  }

  public shouldTerminate(): boolean {
    const room = this.room;
    if (!room) return true;
    if (!room.controller?.my) return true;
    return false;
  }

  public shouldRun(): boolean {
    const room = this.room;
    return !!room?.controller?.my;
  }

  /**
   * Ensure the correct stage process is registered for this room.
   * Safe to call multiple times.
   */
  public syncStage(): void {
    const room = this.room;
    if (!room?.controller?.my) return;

    const desired = this.getDesiredStage(room);

    // Keep a tiny bit of room-level state so we don't churn registers.
    const roomMem = (Memory.rooms[this.roomName] ??= {} as RoomMemory);
    const current = roomMem.stage;

    if (current !== desired) {
      this.unregisterAllStages();
      this.registerStage(desired);
      roomMem.stage = desired;
    } else {
      // Stage unchanged; ensure it's registered (covers global resets/edge cases)
      this.registerStage(desired);
    }
  }

  public run(): ProcessResult {
    this.syncStage();

    const room = this.room;
    const stage = Memory.rooms[this.roomName]?.stage;

    return {
      success: true,
      message: room?.controller?.my
        ? `Stage=${stage ?? 'unknown'} RCL=${room.controller.level}`
        : 'Room not owned',
    };
  }

  private getDesiredStage(room: Room): RoomStage {
    const rcl = room.controller?.level ?? 0;

    if (rcl <= 1) return 'rcl1';

    // For now, treat ">=2" as the RCL2 pipeline until RCL3+ processes exist.
    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION,
    });

    return extensions.length < 5 ? 'rcl2a' : 'rcl2b';
  }

  private unregisterAllStages(): void {
    this.kernel.unregister(`rcl1-${this.roomName}`);
    this.kernel.unregister(`rcl2a-${this.roomName}`);
    this.kernel.unregister(`rcl2b-${this.roomName}`);
  }

  private registerStage(stage: RoomStage): void {
    const id = `${stage}-${this.roomName}`;
    if (this.kernel.getProcess(id)) return;

    switch (stage) {
      case 'rcl1':
        this.kernel.register(new RCL1Process(this.roomName));
        break;
      case 'rcl2a':
        this.kernel.register(new RCL2AProcess(this.roomName));
        break;
      case 'rcl2b':
        this.kernel.register(new RCL2BProcess(this.roomName));
        break;
    }
  }
}
