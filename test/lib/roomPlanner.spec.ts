/**
 * Room Planner Tests
 */

import { parseLayout, runAutoBuilder, type LayoutDNA } from '../../src/lib/roomPlanner';
import { mockRoom } from '../utils';
import { mockInstanceOf } from 'screeps-jest';

function dnaWith(dna: Partial<LayoutDNA>): LayoutDNA {
  return {
    1: dna[1] ?? {},
    2: dna[2] ?? {},
    3: dna[3] ?? {},
    4: dna[4] ?? {},
    5: dna[5] ?? {},
    6: dna[6] ?? {},
    7: dna[7] ?? {},
    8: dna[8] ?? {},
  } as LayoutDNA;
}

describe('roomPlanner', () => {
  describe('parseLayout', () => {
    it('computes relative coords based on first spawn', () => {
      const dna = parseLayout(`
S.E
...
`);

      const rcl1 = dna[1];
      expect(rcl1[STRUCTURE_SPAWN]).toEqual([{ x: 0, y: 0 }]);
      expect(rcl1[STRUCTURE_EXTENSION]).toEqual([{ x: 2, y: 0 }]);
      expect(rcl1[STRUCTURE_ROAD]).toEqual([
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ]);
    });

    it('supports RCL block headers', () => {
      const dna = parseLayout(`
RCL 1
S
RCL 2
SE
`);

      expect(dna[1][STRUCTURE_SPAWN]).toEqual([{ x: 0, y: 0 }]);
      expect(dna[2][STRUCTURE_SPAWN]).toEqual([{ x: 0, y: 0 }]);
      expect(dna[2][STRUCTURE_EXTENSION]).toEqual([{ x: 1, y: 0 }]);
    });
  });

  describe('runAutoBuilder', () => {
    beforeEach(() => {
      // Default CONTROLLER_STRUCTURES for tests (keep minimal)
      (globalThis as any).CONTROLLER_STRUCTURES = {
        [STRUCTURE_EXTENSION]: { 1: 0, 2: 5, 3: 10, 4: 20 },
        [STRUCTURE_ROAD]: { 1: 2500, 2: 2500, 3: 2500, 4: 2500 },
        [STRUCTURE_SPAWN]: { 1: 1, 2: 1, 3: 1, 4: 1 },
      };
    });

    it('skips when anchor missing', () => {
      const room = mockRoom('W1N1', { rcl: 2 });
      room.memory.anchor = undefined;
      room.createConstructionSite = jest.fn(() => OK) as any;

      runAutoBuilder(room, { dna: dnaWith({ 2: { [STRUCTURE_EXTENSION]: [{ x: 1, y: 0 }] } }) });
      expect(room.createConstructionSite).not.toHaveBeenCalled();
    });

    it('wall conflict: verifies terrain and skips', () => {
      const terrain = mockInstanceOf<RoomTerrain>({
        get: jest.fn((x: number, y: number) => {
          // Make (11,10) a wall
          if (x === 11 && y === 10) return TERRAIN_MASK_WALL;
          return 0;
        }),
      });

      const room = mockRoom('W1N1', { rcl: 2, terrain });
      room.memory.anchor = { x: 10, y: 10 };
      room.lookForAt = jest.fn(() => []) as any;
      room.find = jest.fn((t: FindConstant) => {
        if (t === FIND_STRUCTURES) return [];
        if (t === FIND_CONSTRUCTION_SITES) return [];
        return [];
      }) as any;
      room.createConstructionSite = jest.fn(() => OK) as any;

      const dna = dnaWith({
        2: { [STRUCTURE_EXTENSION]: [{ x: 1, y: 0 }] },
      });

      runAutoBuilder(room, { dna });
      expect(room.createConstructionSite).not.toHaveBeenCalled();
    });

    it('creep block: does not treat creeps as occupancy', () => {
      const room = mockRoom('W1N1', { rcl: 2 });
      room.memory.anchor = { x: 10, y: 10 };

      // Even if there is a creep, we only check LOOK_STRUCTURES and LOOK_CONSTRUCTION_SITES.
      room.lookForAt = jest.fn((type: string) => {
        if (type === LOOK_STRUCTURES) return [];
        if (type === LOOK_CONSTRUCTION_SITES) return [];
        if (type === LOOK_CREEPS) return [{ name: 'blocker' }];
        return [];
      }) as any;

      room.find = jest.fn((t: FindConstant) => {
        if (t === FIND_STRUCTURES) return [];
        if (t === FIND_CONSTRUCTION_SITES) return [];
        return [];
      }) as any;

      room.createConstructionSite = jest.fn(() => OK) as any;

      const dna = dnaWith({
        2: { [STRUCTURE_EXTENSION]: [{ x: 1, y: 0 }] },
      });

      runAutoBuilder(room, { dna });
      expect(room.createConstructionSite).toHaveBeenCalledWith(11, 10, STRUCTURE_EXTENSION);
    });

    it('RCL downgrade: only builds up to current controller level', () => {
      const room = mockRoom('W1N1', { rcl: 3 });
      room.memory.anchor = { x: 10, y: 10 };
      room.lookForAt = jest.fn(() => []) as any;
      room.find = jest.fn((t: FindConstant) => {
        if (t === FIND_STRUCTURES) return [];
        if (t === FIND_CONSTRUCTION_SITES) return [];
        return [];
      }) as any;
      room.createConstructionSite = jest.fn(() => OK) as any;

      const dna = dnaWith({
        4: { [STRUCTURE_EXTENSION]: [{ x: 1, y: 0 }] },
      });

      runAutoBuilder(room, { dna });
      expect(room.createConstructionSite).not.toHaveBeenCalled();
    });

    it('ghost site: detects existing construction site and does not duplicate', () => {
      const room = mockRoom('W1N1', { rcl: 2 });
      room.memory.anchor = { x: 10, y: 10 };

      room.lookForAt = jest.fn((type: string) => {
        if (type === LOOK_STRUCTURES) return [];
        if (type === LOOK_CONSTRUCTION_SITES) {
          return [{ structureType: STRUCTURE_EXTENSION }];
        }
        return [];
      }) as any;

      room.find = jest.fn((t: FindConstant) => {
        if (t === FIND_STRUCTURES) return [];
        if (t === FIND_CONSTRUCTION_SITES) return [{ structureType: STRUCTURE_EXTENSION }];
        return [];
      }) as any;

      room.createConstructionSite = jest.fn(() => OK) as any;

      const dna = dnaWith({
        2: { [STRUCTURE_EXTENSION]: [{ x: 1, y: 0 }] },
      });

      runAutoBuilder(room, { dna });
      expect(room.createConstructionSite).not.toHaveBeenCalled();
    });

    it('max structure limit: rebuilds missing coordinate but does not exceed max', () => {
      const room = mockRoom('W1N1', { rcl: 2 });
      room.memory.anchor = { x: 10, y: 10 };
      room.lookForAt = jest.fn(() => []) as any;

      // Already have 4 extensions (max 5). Should create exactly one.
      const existingExtensions = new Array(4).fill(null).map(() => ({ structureType: STRUCTURE_EXTENSION }));
      room.find = jest.fn((t: FindConstant, opts?: any) => {
        if (t === FIND_STRUCTURES) {
          const filter = opts?.filter;
          return filter ? existingExtensions.filter(filter) : existingExtensions;
        }
        if (t === FIND_CONSTRUCTION_SITES) return [];
        return [];
      }) as any;

      room.createConstructionSite = jest.fn(() => OK) as any;

      const dna = dnaWith({
        2: {
          [STRUCTURE_EXTENSION]: [
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
            { x: 4, y: 0 },
            { x: 5, y: 0 },
            { x: 6, y: 0 }, // extra beyond max
          ],
        },
      });

      runAutoBuilder(room, { dna });
      expect(room.createConstructionSite).toHaveBeenCalledTimes(1);
    });
  });
});
