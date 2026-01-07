export function runHarvest(creep: Creep) {
    // 1. Check RoomMemory for sources (Implementation step for later)
    // 2. For now, standard find
    const source = creep.room.find(FIND_SOURCES)[0];
    
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
        creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
    }
}