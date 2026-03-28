export type TransferTarget = StructureExtension | StructureSpawn;

export interface TransferTaskOptions {
  target?: TransferTarget;
  move?: (creep: Creep, targetPos: RoomPosition) => void;
  onNoTarget?: (creep: Creep) => void;
}

export const findTransferTarget = (
  creep: Creep,
  targetId?: Id<TransferTarget>,
): TransferTarget | null => {
  if (targetId) {
    const cachedTarget = Game.getObjectById(targetId);

    if (cachedTarget && cachedTarget.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      return cachedTarget;
    }
  }

  return creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
    filter: (structure): structure is TransferTarget => {
      return (
        (structure.structureType === STRUCTURE_SPAWN ||
          structure.structureType === STRUCTURE_EXTENSION) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      );
    },
  });
};

export const runTransfer = (
  creep: Creep,
  options: TransferTaskOptions = {},
): TransferTarget | null => {
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
      creep.moveTo(target);
    }
  }

  return target;
};