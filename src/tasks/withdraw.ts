export type WithdrawTarget = StructureContainer | StructureStorage | StructureSpawn;

export interface WithdrawTaskOptions {
  target?: WithdrawTarget;
  move?: (creep: Creep, targetPos: RoomPosition) => void;
}

export const runWithdraw = (
  creep: Creep,
  options: WithdrawTaskOptions = {},
): WithdrawTarget | null => {
  const { move, target: providedTarget } = options;
  const target =
    providedTarget ??
    creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure): structure is WithdrawTarget => {
        return (
          (structure.structureType === STRUCTURE_CONTAINER ||
            ((structure.structureType === STRUCTURE_STORAGE ||
              structure.structureType === STRUCTURE_SPAWN) &&
              structure.my === true)) &&
          structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        );
      },
    });

  if (!target) {
    return null;
  }

  if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    if (move) {
      move(creep, target.pos);
    } else {
      creep.moveTo(target);
    }
  }

  return target;
};