/**
 * Mining Positions Tests
 * 
 * Tests for mining position utilities that manage
 * creep placement around energy sources.
 */

import {
  countMiningPositions,
  findAndAssignMiningPosition,
  releaseMiningPosition,
} from '../../src/lib/miningPositions';
import { mockRoom, mockCreep, mockSource, mockTerrain } from '../utils';
import { mockInstanceOf } from 'screeps-jest';

describe('miningPositions', () => {
  beforeEach(() => {
    // Reset Memory for each test
    Memory.rooms = {};
  });

  describe('countMiningPositions', () => {
    it('should count all walkable positions around a single source', () => {
      // Create a source at position (10, 10) with all surrounding tiles plain
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      const terrain = mockTerrain(); // All plains
      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      const count = countMiningPositions(room);
      
      // 8 surrounding tiles, all walkable
      expect(count).toBe(8);
    });

    it('should exclude wall tiles from count', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      // Create walls at some positions around the source
      const terrain = mockTerrain([
        [9, 9],   // top-left
        [10, 9],  // top
        [11, 9],  // top-right
        [9, 10],  // left
      ]);

      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      const count = countMiningPositions(room);
      
      // 8 - 4 walls = 4 walkable
      expect(count).toBe(4);
    });

    it('should count positions for multiple sources', () => {
      const source1 = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });
      const source2 = mockSource('source2', {
        pos: { x: 30, y: 30, roomName: 'W1N1' },
      });

      const terrain = mockTerrain(); // All plains
      const room = mockRoom('W1N1', {
        sources: [source1, source2],
        terrain,
      });

      const count = countMiningPositions(room);
      
      // 8 positions per source * 2 sources = 16
      expect(count).toBe(16);
    });

    it('should cache the count in room memory', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      const terrain = mockTerrain();
      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      // First call calculates
      const count1 = countMiningPositions(room);
      expect(count1).toBe(8);
      expect(room.memory.miningPositionCount).toBe(8);

      // Second call uses cache (verify getTerrain not called again)
      const getTerrainSpy = room.getTerrain as jest.Mock;
      const callCount = getTerrainSpy.mock.calls.length;
      
      const count2 = countMiningPositions(room);
      expect(count2).toBe(8);
      expect(getTerrainSpy.mock.calls.length).toBe(callCount); // Not called again
    });

    it('should return cached value if available', () => {
      const room = mockRoom('W1N1');
      room.memory.miningPositionCount = 5;

      const count = countMiningPositions(room);
      expect(count).toBe(5);
    });
  });

  describe('findAndAssignMiningPosition', () => {
    it('should assign first available position', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      const terrain = mockTerrain();
      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      const result = findAndAssignMiningPosition(room, 'miner1');

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('source1');
      expect(result!.pos.roomName).toBe('W1N1');
    });

    it('should record assignment in room memory', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      const terrain = mockTerrain();
      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      const result = findAndAssignMiningPosition(room, 'miner1');

      expect(result).not.toBeNull();
      const posKey = `${result!.pos.x},${result!.pos.y}`;
      expect(Memory.rooms['W1N1'].assignedPositions![posKey]).toBe('miner1');
    });

    it('should not assign same position twice', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      const terrain = mockTerrain();
      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      const result1 = findAndAssignMiningPosition(room, 'miner1');
      const result2 = findAndAssignMiningPosition(room, 'miner2');

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      
      // Different positions
      const pos1Key = `${result1!.pos.x},${result1!.pos.y}`;
      const pos2Key = `${result2!.pos.x},${result2!.pos.y}`;
      expect(pos1Key).not.toBe(pos2Key);
    });

    it('should skip wall positions', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      // All positions except (11, 11) are walls
      const terrain = mockTerrain([
        [9, 9], [10, 9], [11, 9],
        [9, 10], [11, 10],
        [9, 11], [10, 11],
      ]);

      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      const result = findAndAssignMiningPosition(room, 'miner1');

      expect(result).not.toBeNull();
      expect(result!.pos).toEqual({ x: 11, y: 11, roomName: 'W1N1' });
    });

    it('should return null when all positions are taken', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      // Only one walkable position
      const terrain = mockTerrain([
        [9, 9], [10, 9], [11, 9],
        [9, 10], [11, 10],
        [9, 11], [10, 11],
      ]);

      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      // Take the only position
      const result1 = findAndAssignMiningPosition(room, 'miner1');
      expect(result1).not.toBeNull();

      // Try to get another
      const result2 = findAndAssignMiningPosition(room, 'miner2');
      expect(result2).toBeNull();
    });

    it('should use preferred source when provided', () => {
      const source1 = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });
      const source2 = mockSource('source2', {
        pos: { x: 30, y: 30, roomName: 'W1N1' },
      });

      const terrain = mockTerrain();
      const room = mockRoom('W1N1', {
        sources: [source1, source2],
        terrain,
      });

      const result = findAndAssignMiningPosition(room, 'miner1', source2);

      expect(result).not.toBeNull();
      expect(result!.sourceId).toBe('source2');
    });
  });

  describe('releaseMiningPosition', () => {
    it('should remove position assignment from memory', () => {
      const source = mockSource('source1', {
        pos: { x: 10, y: 10, roomName: 'W1N1' },
      });

      const terrain = mockTerrain();
      const room = mockRoom('W1N1', {
        sources: [source],
        terrain,
      });

      // Assign a position
      const result = findAndAssignMiningPosition(room, 'miner1');
      expect(result).not.toBeNull();

      // Create a mock creep with the assigned position
      const creep = mockCreep('miner1', {
        memory: {
          role: 'miner',
          assignedPos: result!.pos,
        },
      });

      // Release the position
      releaseMiningPosition(creep);

      // Check position is no longer assigned
      const posKey = `${result!.pos.x},${result!.pos.y}`;
      expect(Memory.rooms['W1N1'].assignedPositions![posKey]).toBeUndefined();
    });

    it('should do nothing if creep has no assigned position', () => {
      const creep = mockCreep('miner1', {
        memory: {
          role: 'miner',
        },
      });

      // Should not throw
      expect(() => releaseMiningPosition(creep)).not.toThrow();
    });

    it('should clear assignedPos from creep memory', () => {
      // Create a regular object for memory so we can verify deletion
      const creepMemory = {
        role: 'miner' as const,
        state: 'mining' as const,
        stuckCount: 0,
        assignedPos: { x: 10, y: 10, roomName: 'W1N1' },
      };
      
      // Create creep with direct memory reference
      const creep = {
        name: 'miner1',
        memory: creepMemory,
      } as Creep;

      // Set up room memory
      Memory.rooms['W1N1'] = {
        assignedPositions: {
          '10,10': 'miner1',
        },
      };

      releaseMiningPosition(creep);

      // Verify the position was released from room memory
      expect(Memory.rooms['W1N1'].assignedPositions!['10,10']).toBeUndefined();
      
      // Verify assignedPos property was deleted from creep memory
      expect('assignedPos' in creepMemory).toBe(false);
    });
  });
});