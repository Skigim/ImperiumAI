/**
 * Task: Transfer Energy
 * 
 * A specific action task that transfers energy to nearby structures.
 * Called by roles when a creep needs to deliver energy.
 * Tasks are granular, reusable actions; Roles orchestrate them.
 */

import '../memory';
import { CreepState } from "../types";


export function runTransfer(creep: Creep) {
    // Priority: Spawn > Extension
    const target = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
        filter: (s) => {
            return (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                   s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        }
    });

    if (target) {
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
        }
    } else {
        // If no transfer targets need energy, switch to upgrading immediately
        creep.memory.state = CreepState.UPGRADE;
    }
}