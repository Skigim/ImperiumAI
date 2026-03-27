/**
 * Traffic Manager Utility
 * Handles movement with stuck detection and path caching.
 */
export function moveTo(creep: Creep, targetPos: RoomPosition): void {
    // 1. Check if we are stuck
    const isStuck = creep.memory._lastPos && 
                    creep.pos.x === creep.memory._lastPos.x && 
                    creep.pos.y === creep.memory._lastPos.y &&
                    creep.pos.roomName === creep.memory._lastPos.roomName;

    // 2. Move based on stuck status
    const result = creep.moveTo(targetPos, {
        reusePath: isStuck ? 0 : 20, // Re-path immediately if stuck
        visualizePathStyle: { 
            stroke: isStuck ? '#ff0000' : '#ffffff',
            opacity: 0.5 
        }
    });

    // 3. Update the "internal" position tracker for next tick
    creep.memory._lastPos = {
        x: creep.pos.x,
        y: creep.pos.y,
        roomName: creep.pos.roomName
    };
}