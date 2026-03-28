export interface HarvestTaskOptions {
  source?: Source;
  move?: (creep: Creep, targetPos: RoomPosition) => void;
}

export const runHarvest = (
  creep: Creep,
  options: HarvestTaskOptions = {},
): Source | null => {
  const source = options.source ?? creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);

  if (!source) {
    return null;
  }

  if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
    if (options.move) {
      options.move(creep, source.pos);
    } else {
      creep.moveTo(source);
    }
  }

  return source;
};