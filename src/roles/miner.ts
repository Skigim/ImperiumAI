/**
 * Role Behavior: Miner
 * 
 * Stationary harvester that drop-mines at assigned position.
 * Works with haulers to transport energy.
 */

/**
 * Run miner behavior for one tick.
 */
export function runMiner(creep: Creep): void {
  if (!creep.memory.sourceId) return;

  const source = Game.getObjectById(creep.memory.sourceId);
  if (!source) return;

  // Move to assigned position
  if (creep.memory.assignedPos) {
    const pos = new RoomPosition(
      creep.memory.assignedPos.x,
      creep.memory.assignedPos.y,
      creep.memory.assignedPos.roomName
    );

    if (!creep.pos.isEqualTo(pos)) {
      creep.moveTo(pos, { reusePath: 10 });
      return;
    }
  }

  // At position - harvest (drop mining)
  creep.harvest(source);
}
