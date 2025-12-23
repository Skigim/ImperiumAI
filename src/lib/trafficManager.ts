/**
 * Traffic Manager
 *
 * Collects per-creep movement intents during the tick and resolves them at end-of-tick.
 * Strategy implemented:
 * - Empty tile: move allowed
 * - Swap ("zipper"): A<->B swap allowed if both intend to move into each other
 * - Train: A may follow B into B's tile if B has a valid move out
 * - Shove: if B is idle (no intent), attempt to force B into an adjacent free spot
 *
 * Key constraint: no deep recursion for shove chains (single-step shove only).
 */

type CreepName = string;

type Direction = DirectionConstant;

interface MoveIntent {
  creepName: CreepName;
  roomName: string;
  from: { x: number; y: number };
  direction: Direction;
}

interface PlannedMove {
  creepName: CreepName;
  roomName: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction: Direction;
  valid: boolean;
  forced: boolean;
  canMove: boolean;
  isExit: boolean;
}

function directionToDelta(direction: Direction): { dx: number; dy: number } {
  // Screeps directions: 1..8 starting at TOP and moving clockwise
  // 1 TOP, 2 TOP_RIGHT, 3 RIGHT, 4 BOTTOM_RIGHT, 5 BOTTOM, 6 BOTTOM_LEFT, 7 LEFT, 8 TOP_LEFT
  switch (direction) {
    case TOP: return { dx: 0, dy: -1 };
    case TOP_RIGHT: return { dx: 1, dy: -1 };
    case RIGHT: return { dx: 1, dy: 0 };
    case BOTTOM_RIGHT: return { dx: 1, dy: 1 };
    case BOTTOM: return { dx: 0, dy: 1 };
    case BOTTOM_LEFT: return { dx: -1, dy: 1 };
    case LEFT: return { dx: -1, dy: 0 };
    case TOP_LEFT: return { dx: -1, dy: -1 };
    default:
      return { dx: 0, dy: 0 };
  }
}

function inRoomBounds(x: number, y: number): boolean {
  return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function samePos(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function posKey(roomName: string, pos: { x: number; y: number }): string {
  return `${roomName}:${pos.x},${pos.y}`;
}

function tileKey(roomName: string, x: number, y: number): string {
  return `${roomName}:${x},${y}`;
}

function hasBlockingStructureAt(room: Room, x: number, y: number): boolean {
  const structures = room.lookForAt(LOOK_STRUCTURES, x, y) as Structure[];
  // Keep it simple per spec: any structure blocks shoves
  return structures.length > 0;
}

function isWalkableTerrain(room: Room, x: number, y: number): boolean {
  return room.getTerrain().get(x, y) !== TERRAIN_MASK_WALL;
}

class TrafficManagerImpl {
  private intents: Map<CreepName, MoveIntent> = new Map();
  private reservedTiles: Set<string> = new Set();

  startTick(): void {
    this.intents.clear();
    this.reservedTiles.clear();
  }

  register(creep: Creep, direction: Direction): void {
    // Ignore invalid, spawning, or fatigued creeps (fatigue will also be checked at execution)
    if (!creep.my) return;
    if (creep.spawning) return;

    this.intents.set(creep.name, {
      creepName: creep.name,
      roomName: creep.room.name,
      from: { x: creep.pos.x, y: creep.pos.y },
      direction,
    });
  }

  resolveAndExecute(): void {
    if (this.intents.size === 0) return;

    // Build a fast lookup from current creep positions (avoid room.lookForAt in hot loops)
    const creepLookup: Map<string, Creep> = new Map();
    for (const name in Game.creeps) {
      const c = Game.creeps[name];
      creepLookup.set(tileKey(c.room.name, c.pos.x, c.pos.y), c);
    }

    const getCreepAtFast = (roomName: string, x: number, y: number): Creep | undefined =>
      creepLookup.get(tileKey(roomName, x, y));

    // Build initial plans
    const plans: Map<CreepName, PlannedMove> = new Map();

    for (const intent of this.intents.values()) {
      const creep = Game.creeps[intent.creepName];
      if (!creep) continue;
      if (creep.spawning) continue;

      const canMove = creep.fatigue === 0;

      const delta = directionToDelta(intent.direction);
      const toX = intent.from.x + delta.dx;
      const toY = intent.from.y + delta.dy;

      const isExit = !inRoomBounds(toX, toY);

      plans.set(intent.creepName, {
        creepName: intent.creepName,
        roomName: intent.roomName,
        from: { ...intent.from },
        to: { x: toX, y: toY },
        direction: intent.direction,
        valid: false,
        forced: false,
        canMove,
        isExit,
      });
    }

    if (plans.size === 0) return;

    // 1) Exits are immediately valid (we don't do cross-room collision resolution)
    for (const plan of plans.values()) {
      if (!plan.canMove) continue;
      if (plan.isExit) {
        plan.valid = true;
      }
    }

    // 2) Empty tiles are immediately valid
    for (const plan of plans.values()) {
      if (plan.valid) continue;
      if (!plan.canMove) continue;
      if (plan.isExit) continue;

      const occupant = getCreepAtFast(plan.roomName, plan.to.x, plan.to.y);
      if (!occupant) {
        plan.valid = true;
      }
    }

    // 3) Swap (zipper)
    for (const planA of plans.values()) {
      if (planA.valid) continue;
      if (!planA.canMove) continue;
      if (planA.isExit) continue;

      const occupantB = getCreepAtFast(planA.roomName, planA.to.x, planA.to.y);
      if (!occupantB) continue;

      const planB = plans.get(occupantB.name);
      if (!planB) continue;
      if (!planB.canMove) continue;
      if (planB.isExit) continue;

      if (samePos(planB.to, planA.from)) {
        planA.valid = true;
        planB.valid = true;
      }
    }

    // 4) Cycles (3+ ring rotations)
    // Detect directed cycles where each creep wants to move into the next creep's current position.
    // This unlocks "rings of death" that train/swap won't resolve.
    const nextByName: Map<CreepName, CreepName> = new Map();
    for (const plan of plans.values()) {
      if (plan.isExit) continue;
      const occupant = getCreepAtFast(plan.roomName, plan.to.x, plan.to.y);
      if (!occupant) continue;
      if (!plans.has(occupant.name)) continue;
      nextByName.set(plan.creepName, occupant.name);
    }

    const visitState: Map<CreepName, 0 | 1 | 2> = new Map();
    const stack: CreepName[] = [];
    const stackIndex: Map<CreepName, number> = new Map();

    const dfs = (name: CreepName): void => {
      visitState.set(name, 1);
      stackIndex.set(name, stack.length);
      stack.push(name);

      const next = nextByName.get(name);
      if (next) {
        const nextState = visitState.get(next) ?? 0;
        if (nextState === 0) {
          dfs(next);
        } else if (nextState === 1) {
          const startIdx = stackIndex.get(next);
          if (startIdx !== undefined) {
            const cycle = stack.slice(startIdx);
            if (cycle.length >= 3) {
              const allMovable = cycle.every(n => {
                const p = plans.get(n);
                return !!p && p.canMove && !p.isExit;
              });
              if (allMovable) {
                for (const n of cycle) {
                  const p = plans.get(n);
                  if (p) p.valid = true;
                }
              }
            }
          }
        }
      }

      stack.pop();
      stackIndex.delete(name);
      visitState.set(name, 2);
    };

    for (const name of plans.keys()) {
      if ((visitState.get(name) ?? 0) === 0) dfs(name);
    }

    // 5) Train (iterative until stable): if B has a valid move out, A can move into B's tile
    // This resolves chains without recursion.
    for (let i = 0; i < plans.size; i++) {
      let changed = false;

      for (const planA of plans.values()) {
        if (planA.valid) continue;
        if (!planA.canMove) continue;
        if (planA.isExit) continue;

        const occupantB = getCreepAtFast(planA.roomName, planA.to.x, planA.to.y);
        if (!occupantB) {
          planA.valid = true;
          changed = true;
          continue;
        }

        const planB = plans.get(occupantB.name);
        if (!planB) continue;

        if (planB.valid && planB.canMove) {
          planA.valid = true;
          changed = true;
        }
      }

      if (!changed) break;
    }

    // 6) Shove: only shove idle creeps (no registered intent), no chain shoves.
    // We do this after train resolution so we only shove for truly blocked intents.
    for (const planA of plans.values()) {
      if (planA.valid) continue;
      if (!planA.canMove) continue;
      if (planA.isExit) continue;

      const room = Game.rooms[planA.roomName];
      if (!room) continue;

      const occupantB = getCreepAtFast(planA.roomName, planA.to.x, planA.to.y);
      if (!occupantB) {
        planA.valid = true;
        continue;
      }

      // Only shove if B has no intent registered
      if (plans.has(occupantB.name)) continue;
      if (occupantB.spawning || occupantB.fatigue > 0) continue;

      const shoveTo = this.findShoveSpot(room, occupantB.pos, planA.from);
      if (!shoveTo) continue;

      // Reserve this destination tile so subsequent shoves can't use it.
      this.reservedTiles.add(tileKey(room.name, shoveTo.x, shoveTo.y));

      const shoveDir = occupantB.pos.getDirectionTo(shoveTo.x, shoveTo.y) as Direction;
      plans.set(occupantB.name, {
        creepName: occupantB.name,
        roomName: occupantB.room.name,
        from: { x: occupantB.pos.x, y: occupantB.pos.y },
        to: { x: shoveTo.x, y: shoveTo.y },
        direction: shoveDir,
        valid: true,
        forced: true,
        canMove: true,
        isExit: false,
      });

      planA.valid = true;
    }

    // 7) Execute valid moves
    for (const plan of plans.values()) {
      if (!plan.valid) continue;

      const creep = Game.creeps[plan.creepName];
      if (!creep) continue;
      if (creep.spawning) continue;
      if (creep.fatigue > 0) continue;

      // Record previous position for stuck detection (used by movement helpers)
      creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y };

      // Execute. Errors are ignored; the engine is authoritative.
      creep.move(plan.direction);
    }
  }

  private findShoveSpot(
    room: Room,
    creepPos: RoomPosition,
    forbidden: { x: number; y: number }
  ): { x: number; y: number } | null {
    // Scan 8 adjacent tiles. We keep the scan order stable for determinism.
    const candidates = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 1, dy: 1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: -1, dy: -1 },
    ];

    for (const c of candidates) {
      const x = creepPos.x + c.dx;
      const y = creepPos.y + c.dy;
      if (!inRoomBounds(x, y)) continue;
      if (x === forbidden.x && y === forbidden.y) continue;
      if (!isWalkableTerrain(room, x, y)) continue;
      if (hasBlockingStructureAt(room, x, y)) continue;

      // Block tiles reserved by other shoves this tick.
      if (this.reservedTiles.has(tileKey(room.name, x, y))) continue;

      // We use Room.lookForAt here intentionally because shove checks are rare (only for blocked moves)
      // and must account for creeps that aren't in our intent set.
      const creepThere = room.lookForAt(LOOK_CREEPS, x, y) as Creep[];
      if (creepThere.length > 0) continue;

      return { x, y };
    }

    return null;
  }
}

/**
 * Singleton TrafficManager.
 *
 * Usage:
 * - Early tick: `TrafficManager.startTick()`
 * - During logic: `TrafficManager.register(creep, direction)`
 * - End of tick: `TrafficManager.resolveAndExecute()`
 */
export const TrafficManager = new TrafficManagerImpl();
