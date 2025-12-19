/**
 * Shared Harvest Utilities
 * 
 * Common harvesting logic used by multiple roles.
 */

import { findAndAssignMiningPosition } from './miningPositions';

/**
 * Harvest from assigned mining position.
 * Assigns a position if not already assigned, moves to it, and harvests.
 * 
 * @param creep - The creep to run harvest logic for
 * @param targetRoom - Optional room to harvest in (for remote workers)
 */
export function doHarvest(creep: Creep, targetRoom?: string): void {
  // If target room specified and not there yet, travel first
  if (targetRoom && creep.room.name !== targetRoom) {
    creep.moveTo(new RoomPosition(25, 25, targetRoom), { reusePath: 20 });
    return;
  }

  const room = creep.room;

  // Assign mining position if not already assigned
  if (!creep.memory.assignedPos) {
    const preferredSource = creep.memory.sourceId
      ? Game.getObjectById(creep.memory.sourceId)
      : null;
    const assignment = findAndAssignMiningPosition(room, creep.name, preferredSource);
    if (!assignment) {
      // No positions available, wait
      return;
    }
    creep.memory.assignedPos = assignment.pos;
    creep.memory.sourceId = assignment.sourceId;
  }

  // Move to assigned position
  const pos = new RoomPosition(
    creep.memory.assignedPos.x,
    creep.memory.assignedPos.y,
    creep.memory.assignedPos.roomName
  );

  if (!creep.pos.isEqualTo(pos)) {
    creep.moveTo(pos, { reusePath: 5 });
    return;
  }

  // At position - harvest
  if (creep.memory.sourceId) {
    const source = Game.getObjectById(creep.memory.sourceId);
    if (source) {
      creep.harvest(source);
    }
  }
}

/**
 * Update creep state based on energy capacity.
 * Transitions between 'harvesting' and 'delivering' states.
 * 
 * @param creep - The creep to update state for
 * @returns The current state after update
 */
export function updateHarvestDeliverState(creep: Creep): 'harvesting' | 'delivering' {
  if (creep.memory.state === 'harvesting' && creep.store.getFreeCapacity() === 0) {
    creep.memory.state = 'delivering';
  }
  if (creep.memory.state === 'delivering' && creep.store.getUsedCapacity() === 0) {
    creep.memory.state = 'harvesting';
  }
  return creep.memory.state as 'harvesting' | 'delivering';
}
