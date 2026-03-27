export function smartMove(
  creep: Creep,
  target: RoomPosition | _HasRoomPosition,
): void {
  // 1. Stuck Detection: Check if we are in the same spot as last tick
  const isStuck =
    creep.memory._lastPos &&
    creep.pos.isEqualTo(creep.memory._lastPos.x, creep.memory._lastPos.y);

  // 2. Execute Move
  creep.moveTo(target, {
    reusePath: isStuck ? 0 : 20, // If stuck, pathfind immediately. Else, use cache.
    visualizePathStyle: { stroke: isStuck ? "#ff0000" : "#ffffff" },
  });

  // 3. Save current position for next tick's comparison
  creep.memory._lastPos = {
    x: creep.pos.x,
    y: creep.pos.y,
    roomName: creep.pos.roomName,
  };
}
