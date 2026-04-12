export interface BuildTaskOptions {
  target?: ConstructionSite<BuildableStructureConstant>;
  move?: (creep: Creep, targetPos: RoomPosition) => void;
}

export const runBuild = (
  creep: Creep,
  options: BuildTaskOptions = {},
): ConstructionSite<BuildableStructureConstant> | null => {
  const { move, target: providedTarget } = options;
  const target =
    providedTarget ?? creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);

  if (!target) {
    return null;
  }

  if (creep.build(target) === ERR_NOT_IN_RANGE) {
    if (move) {
      move(creep, target.pos);
    } else {
      creep.moveTo(target);
    }
  }

  return target;
};