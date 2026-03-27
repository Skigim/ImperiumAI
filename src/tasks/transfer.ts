/**
 * Task: Transfer Energy
 *
 * A specific action task that transfers energy to nearby structures.
 * Called by roles when a creep needs to deliver energy.
 * Tasks are granular, reusable actions; Roles orchestrate them.
 */

export type TransferTarget = StructureExtension | StructureSpawn;

export interface TransferTaskOptions {
    target?: TransferTarget;
    move?: (creep: Creep, targetPos: RoomPosition) => void;
    onNoTarget?: (creep: Creep) => void;
}

export function findTransferTarget(
    creep: Creep,
    targetId?: Id<TransferTarget>,
): TransferTarget | null {
    if (targetId) {
        const cachedTarget = Game.getObjectById(targetId);

        if (cachedTarget && cachedTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return cachedTarget;
        }
    }

    return creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
        filter: (
            s,
        ): s is TransferTarget =>
            (s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
}

export function runTransfer(
    creep: Creep,
    options: TransferTaskOptions = {},
): TransferTarget | null {
    const { move, onNoTarget, target: providedTarget } = options;
    const target = providedTarget ?? findTransferTarget(creep);

    if (!target) {
        onNoTarget?.(creep);
        return null;
    }

    if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        if (move) {
            move(creep, target.pos);
        } else {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
        }
    }

    return target;
}