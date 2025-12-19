/**
 * Efficient movement system inspired by harabi-bot.
 * 
 * Key optimizations:
 * 1. Cache paths in creep memory - avoid recalculating every tick
 * 2. Only repath when stuck for N ticks
 * 3. Use PathFinder.search directly (cheaper than moveTo)
 * 4. Don't pathfind around creeps - handle collisions separately
 * 5. Use cached cost matrix per-tick
 */

import { getBaseCostMatrix } from './cache';

// Stuck threshold - repath after this many ticks stuck
const REPATH_STUCK_THRESHOLD = 3;

// How long to cache a path before forcing recalculation
const PATH_TTL = 50;

interface CachedPath {
  path: Array<{ x: number; y: number }>;
  dest: { x: number; y: number; roomName: string };
  tick: number;
  idx: number;
}

/**
 * Move creep toward a target position efficiently.
 * Uses cached paths and only recalculates when stuck or path is stale.
 */
export function moveToTarget(creep: Creep, target: RoomPosition, range: number = 1): ScreepsReturnCode {
  // Already in range
  if (creep.pos.inRangeTo(target, range)) {
    return OK;
  }

  // Check if we have a valid cached path
  const cached = creep.memory._move as CachedPath | undefined;
  
  // Is path still valid for this destination?
  const pathValid = cached && 
    cached.dest.x === target.x && 
    cached.dest.y === target.y && 
    cached.dest.roomName === target.roomName &&
    cached.path.length > 0 &&
    (Game.time - cached.tick) < PATH_TTL;

  // Track stuck detection
  const lastPos = creep.memory._lastPos as { x: number; y: number } | undefined;
  const isStuck = lastPos && 
    creep.pos.x === lastPos.x && 
    creep.pos.y === lastPos.y;
  
  // Update last position
  creep.memory._lastPos = { x: creep.pos.x, y: creep.pos.y };

  // Update stuck counter
  if (isStuck) {
    creep.memory._stuck = ((creep.memory._stuck as number) || 0) + 1;
  } else {
    creep.memory._stuck = 0;
  }

  const stuckCount = (creep.memory._stuck as number) || 0;
  const needsRepath = !pathValid || stuckCount >= REPATH_STUCK_THRESHOLD;

  if (needsRepath) {
    // Calculate new path using PathFinder with cached cost matrix
    const result = PathFinder.search(
      creep.pos,
      { pos: target, range },
      {
        plainCost: 2,
        swampCost: 10,
        maxOps: 2000,
        roomCallback: (roomName) => {
          const room = Game.rooms[roomName];
          if (!room) return false;
          // Use cached cost matrix (computed once per tick per room)
          return getBaseCostMatrix(room);
        }
      }
    );

    if (result.incomplete || result.path.length === 0) {
      // Fallback - try to move directly
      return creep.move(creep.pos.getDirectionTo(target));
    }

    // Cache the new path
    creep.memory._move = {
      path: result.path.map(p => ({ x: p.x, y: p.y })),
      dest: { x: target.x, y: target.y, roomName: target.roomName },
      tick: Game.time,
      idx: 0
    };
    creep.memory._stuck = 0;
  }

  // Follow cached path
  const move = creep.memory._move as CachedPath;
  
  // Find current position in path
  let idx = move.idx;
  
  // Check if we're on the path
  const onPath = move.path.some((p, i) => {
    if (creep.pos.x === p.x && creep.pos.y === p.y && creep.room.name === move.dest.roomName) {
      idx = i;
      return true;
    }
    return false;
  });
  
  // If we're on the path, move to next position
  if (onPath && idx < move.path.length - 1) {
    idx++;
    move.idx = idx;
    const next = move.path[idx];
    const direction = creep.pos.getDirectionTo(next.x, next.y);
    return creep.move(direction);
  }
  
  // If we're adjacent to first position, move there
  if (move.path.length > 0) {
    const first = move.path[0];
    if (creep.pos.isNearTo(first.x, first.y)) {
      move.idx = 0;
      return creep.move(creep.pos.getDirectionTo(first.x, first.y));
    }
  }
  
  // Path seems invalid, force repath next tick
  creep.memory._stuck = REPATH_STUCK_THRESHOLD;
  return creep.move(creep.pos.getDirectionTo(target));
}

/**
 * Clear movement cache for a creep.
 * Call when destination changes.
 */
export function clearMovementCache(creep: Creep): void {
  delete creep.memory._move;
  delete creep.memory._lastPos;
  delete creep.memory._stuck;
}
