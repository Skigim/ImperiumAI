/// <reference types="screeps" />

// src/utils/pathing.ts


export interface PathfindingOptions {
    maxOps?: number;
    maxRooms?: number;
    plainCost?: number;
    swampCost?: number;
}

/**
 * Find a path between two positions using Screeps' built-in pathfinding
 * Optimized for CPU efficiency with bounded search
 */
export function findPath(
    from: RoomPosition,
    to: RoomPosition,
    options: PathfindingOptions = {}
): RoomPosition[] {
    const searchOpts = {
        maxOps: options.maxOps ?? 2000,
        maxRooms: options.maxRooms ?? 1,
        plainCost: options.plainCost ?? 1,
        swampCost: options.swampCost ?? 5,
    };

    return PathFinder.search(from, { pos: to, range: 1 }, {
        roomCallback: (roomName: string) => {
            const room = Game.rooms[roomName];
            if (!room) return false;
            const terrain = room.getTerrain();
            const costs = new PathFinder.CostMatrix();
            for (let y = 0; y < 50; y++) {
                for (let x = 0; x < 50; x++) {
                    const terrainType = terrain.get(x, y);
                    if (terrainType === TERRAIN_MASK_WALL) {
                        costs.set(x, y, 255);
                    } else if (terrainType === TERRAIN_MASK_SWAMP) {
                        costs.set(x, y, searchOpts.swampCost);
                    } else {
                        costs.set(x, y, searchOpts.plainCost);
                    }
                }
            }
            return costs;
        },
        ...searchOpts,
    }).path;
}

/**
 * Check if two positions are adjacent (including diagonals)
 */
export function isAdjacent(pos1: RoomPosition, pos2: RoomPosition): boolean {
    if (pos1.roomName !== pos2.roomName) return false;
    return Math.abs(pos1.x - pos2.x) <= 1 && Math.abs(pos1.y - pos2.y) <= 1;
}

/**
 * Get next position along cached path
 */
export function getNextInPath(path: RoomPosition[]): RoomPosition | null {
    return path[0] ?? null;
}