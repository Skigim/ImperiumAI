export type RepairTarget = StructureRoad | StructureContainer;

export interface RepairTaskOptions {
  target?: RepairTarget;
  move?: (creep: Creep, targetPos: RoomPosition) => void;
}

export const runRepair = (
  creep: Creep,
  options: RepairTaskOptions = {},
): RepairTarget | null => {
  const { move, target: providedTarget } = options;
  const target =
    providedTarget ??
    creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure): structure is RepairTarget => {
        return (
          (structure.structureType === STRUCTURE_ROAD ||
            structure.structureType === STRUCTURE_CONTAINER) &&
          structure.hits < structure.hitsMax
        );
      },
    });

  if (!target) {
    return null;
  }

  if (creep.repair(target) === ERR_NOT_IN_RANGE) {
    if (move) {
      move(creep, target.pos);
    } else {
      creep.moveTo(target);
    }
  }

  return target;
};