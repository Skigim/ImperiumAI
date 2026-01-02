import { Process, ProcessPriority, ProcessResult } from '../kernel';

/**
 * Base class for room-scoped, stage-based processes.
 *
 * Provides:
 * - Stable id/name formatting
 * - `room` getter
 * - Default termination when the room is not owned or not visible
 */
export abstract class RoomStageProcess implements Process {
  public readonly id: string;
  public readonly name: string;
  public abstract readonly priority: ProcessPriority;

  protected constructor(
    protected readonly roomName: string,
    idPrefix: string,
    displayName: string
  ) {
    this.id = `${idPrefix}-${roomName}`;
    this.name = `${displayName}(${roomName})`;
  }

  public get room(): Room | undefined {
    return Game.rooms[this.roomName];
  }

  public shouldTerminate(): boolean {
    const room = this.room;
    if (!room) return true;
    if (!room.controller?.my) return true;
    return false;
  }

  public abstract shouldRun(): boolean;

  public abstract run(): ProcessResult;
}
