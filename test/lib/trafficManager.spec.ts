/**
 * Traffic Manager Tests
 *
 * Focuses on classic failure cases:
 * - Ring cycles (3 or more)
 * - Shove non-recursion constraint
 * - Fatigue swap trap
 * - Exit boundary handling
 * - Double shove reservation
 */

import { TrafficManager } from '../../src/lib/trafficManager';
import { mockRoom } from '../utils';
import { mockInstanceOf, mockGlobal } from 'screeps-jest';

function directionBetween(from: { x: number; y: number }, to: { x: number; y: number }): DirectionConstant {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  if (dx === 0 && dy === -1) return TOP;
  if (dx === 1 && dy === -1) return TOP_RIGHT;
  if (dx === 1 && dy === 0) return RIGHT;
  if (dx === 1 && dy === 1) return BOTTOM_RIGHT;
  if (dx === 0 && dy === 1) return BOTTOM;
  if (dx === -1 && dy === 1) return BOTTOM_LEFT;
  if (dx === -1 && dy === 0) return LEFT;
  if (dx === -1 && dy === -1) return TOP_LEFT;

  return TOP;
}

function makePos(roomName: string, x: number, y: number): RoomPosition {
  return mockInstanceOf<RoomPosition>({
    x,
    y,
    roomName,
    getDirectionTo: jest.fn((tx: number, ty: number) => directionBetween({ x, y }, { x: tx, y: ty })),
  });
}

function makeCreep(
  name: string,
  room: Room,
  x: number,
  y: number,
  opts: { fatigue?: number } = {}
): Creep {
  const fatigue = opts.fatigue ?? 0;

  return mockInstanceOf<Creep>({
    name,
    my: true,
    spawning: false,
    fatigue,
    room,
    pos: makePos(room.name, x, y),
    memory: {} as any,
    move: jest.fn(() => OK),
  });
}

function setGame(room: Room, creeps: Creep[]): void {
  const creepMap: Record<string, Creep> = {};
  for (const c of creeps) creepMap[c.name] = c;

  mockGlobal<Game>('Game', {
    time: 1,
    creeps: creepMap,
    rooms: { [room.name]: room } as any,
    cpu: {
      getUsed: jest.fn(() => 0),
      limit: 20,
      tickLimit: 500,
      bucket: 10000,
      shardLimits: {},
      unlocked: false,
      unlockedTime: 0,
      setShardLimits: jest.fn(),
      halt: jest.fn(),
      getHeapStatistics: jest.fn(),
    } as any,
    map: {} as any,
    shard: { name: 'shard3', type: 'normal', ptr: false } as any,
    getObjectById: jest.fn(),
    notify: jest.fn(),
  } as any,
  true);
}

describe('TrafficManager', () => {
  beforeEach(() => {
    TrafficManager.startTick();
  });

  it('Ring of Death: resolves 3-creep cycle by rotating', () => {
    const room = mockRoom('W1N1');
    room.getTerrain = jest.fn(() => mockInstanceOf<RoomTerrain>({ get: jest.fn(() => 0) })) as any;
    room.lookForAt = jest.fn(() => []) as any;

    const a = makeCreep('A', room, 10, 10);
    const b = makeCreep('B', room, 11, 10);
    const c = makeCreep('C', room, 11, 11);

    setGame(room, [a, b, c]);

    TrafficManager.register(a, RIGHT); // -> (11,10)
    TrafficManager.register(b, BOTTOM); // -> (11,11)
    TrafficManager.register(c, TOP_LEFT); // -> (10,10)

    TrafficManager.resolveAndExecute();

    expect(a.move).toHaveBeenCalledWith(RIGHT);
    expect(b.move).toHaveBeenCalledWith(BOTTOM);
    expect(c.move).toHaveBeenCalledWith(TOP_LEFT);
  });

  it('Sandwich: shove does not recurse into another creep', () => {
    // Surround B so the ONLY walkable adjacent tile is (10,11), which is occupied by C.
    const wallSet = new Set<string>([
      '11,9', '11,10', '11,11',
      '9,11', '9,10', '9,9',
      '10,12',
    ]);

    const terrain = mockInstanceOf<RoomTerrain>({
      get: jest.fn((x: number, y: number) => (wallSet.has(`${x},${y}`) ? TERRAIN_MASK_WALL : 0)),
    });

    const room = mockRoom('W1N1', { terrain });

    // No blocking structures; only creeps occupy tiles.
    room.lookForAt = jest.fn((type: string, x: number, y: number) => {
      if (type === LOOK_STRUCTURES) return [];
      if (type === LOOK_CREEPS) {
        // Idle C at (10,11) blocks the only open shove spot.
        if (x === 10 && y === 11) return [{ name: 'C' }];
        return [];
      }
      return [];
    }) as any;

    const a = makeCreep('A', room, 10, 9);
    const b = makeCreep('B', room, 10, 10);
    const c = makeCreep('C', room, 10, 11);

    setGame(room, [a, b, c]);

    TrafficManager.register(a, BOTTOM); // wants into B
    // B and C are idle (no register)

    TrafficManager.resolveAndExecute();

    expect(a.move).not.toHaveBeenCalled();
    expect(b.move).not.toHaveBeenCalled();
    expect(c.move).not.toHaveBeenCalled();
  });

  it('Fatigue Trap: swap is not considered valid if one side is fatigued', () => {
    const room = mockRoom('W1N1');
    room.getTerrain = jest.fn(() => mockInstanceOf<RoomTerrain>({ get: jest.fn(() => 0) })) as any;
    room.lookForAt = jest.fn(() => []) as any;

    const a = makeCreep('A', room, 10, 10, { fatigue: 0 });
    const b = makeCreep('B', room, 11, 10, { fatigue: 10 });

    setGame(room, [a, b]);

    TrafficManager.register(a, RIGHT);
    TrafficManager.register(b, LEFT);

    TrafficManager.resolveAndExecute();

    expect(a.move).not.toHaveBeenCalled();
    expect(b.move).not.toHaveBeenCalled();
  });

  it('Exit Void: allows edge move off-room (49->RIGHT) to execute', () => {
    const room = mockRoom('W1N1');
    room.getTerrain = jest.fn(() => mockInstanceOf<RoomTerrain>({ get: jest.fn(() => 0) })) as any;
    room.lookForAt = jest.fn(() => []) as any;

    const a = makeCreep('A', room, 49, 25);
    setGame(room, [a]);

    TrafficManager.register(a, RIGHT);
    TrafficManager.resolveAndExecute();

    expect(a.move).toHaveBeenCalledWith(RIGHT);
  });

  it('Double Shove: reserves shove destination so only one shove wins', () => {
    const terrain = mockInstanceOf<RoomTerrain>({ get: jest.fn(() => 0) });
    const room = mockRoom('W1N1', { terrain });

    // Block some candidates so both idle creeps choose (11,10) as first available.
    const blockedTiles = new Set<string>([
      '11,9', // blocks B top-right
      '13,9', '13,10', '13,11', '12,11', '11,11', // blocks D candidates until LEFT
    ]);

    room.lookForAt = jest.fn((type: string, x: number, y: number) => {
      if (type === LOOK_STRUCTURES) {
        // Use blocking structures to eliminate candidates deterministically.
        return blockedTiles.has(`${x},${y}`) ? ([{ structureType: STRUCTURE_ROAD }] as any) : [];
      }
      if (type === LOOK_CREEPS) {
        // No extra creeps for shove checks in this test.
        return [];
      }
      return [];
    }) as any;

    const a = makeCreep('A', room, 10, 9);
    const b = makeCreep('B', room, 10, 10); // idle target 1
    const c = makeCreep('C', room, 12, 9);
    const d = makeCreep('D', room, 12, 10); // idle target 2

    setGame(room, [a, b, c, d]);

    TrafficManager.register(a, BOTTOM); // shove B
    TrafficManager.register(c, BOTTOM); // shove D

    TrafficManager.resolveAndExecute();

    // Exactly one pair should move (mover + shoved). Order is deterministic based on register order.
    expect(a.move).toHaveBeenCalledTimes(1);
    expect(b.move).toHaveBeenCalledTimes(1);

    expect(c.move).toHaveBeenCalledTimes(0);
    expect(d.move).toHaveBeenCalledTimes(0);
  });

  it('Ghost Shove: move error does not crash execution', () => {
    const room = mockRoom('W1N1');
    room.getTerrain = jest.fn(() => mockInstanceOf<RoomTerrain>({ get: jest.fn(() => 0) })) as any;
    room.lookForAt = jest.fn(() => []) as any;

    const a = makeCreep('A', room, 10, 10);
    (a.move as jest.Mock).mockReturnValue(ERR_INVALID_TARGET);

    setGame(room, [a]);

    TrafficManager.register(a, RIGHT);
    expect(() => TrafficManager.resolveAndExecute()).not.toThrow();
  });
});
