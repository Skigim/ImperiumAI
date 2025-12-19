/**
 * Body Builder Tests
 * 
 * Tests for the body building utilities that generate
 * optimal creep bodies based on energy capacity.
 */

import {
  buildRemoteWorkerBody,
  buildLocalWorkerBody,
  buildFillerBody,
  getBodyCost,
} from '../../src/lib/bodyBuilder';

describe('bodyBuilder', () => {
  describe('buildRemoteWorkerBody', () => {
    it('should return minimal body when energy is very low', () => {
      const body = buildRemoteWorkerBody(100);
      expect(body).toEqual([CARRY, MOVE]);
      expect(getBodyCost(body)).toBeLessThanOrEqual(100);
    });

    it('should build balanced body at 300 energy', () => {
      const body = buildRemoteWorkerBody(300);
      
      // Should have at least one of each part type
      expect(body).toContain(WORK);
      expect(body).toContain(CARRY);
      expect(body).toContain(MOVE);
      
      // Cost should not exceed budget
      expect(getBodyCost(body)).toBeLessThanOrEqual(300);
    });

    it('should maintain 1:1 MOVE ratio for non-MOVE parts', () => {
      const body = buildRemoteWorkerBody(500);
      
      const moveCount = body.filter((p: BodyPartConstant) => p === MOVE).length;
      const nonMoveCount = body.filter((p: BodyPartConstant) => p !== MOVE).length;
      
      // Pattern is CARRY, MOVE, WORK, MOVE - so should have 1:1 ratio
      expect(moveCount).toBeGreaterThanOrEqual(nonMoveCount);
    });

    it('should cap at 1000 energy', () => {
      const bodyAt1000 = buildRemoteWorkerBody(1000);
      const bodyAt2000 = buildRemoteWorkerBody(2000);
      
      // Both should be the same since max is 1000
      expect(bodyAt1000).toEqual(bodyAt2000);
      expect(getBodyCost(bodyAt1000)).toBeLessThanOrEqual(1000);
    });

    it('should sort parts with TOUGH first and MOVE last', () => {
      const body = buildRemoteWorkerBody(500);
      
      // Find first and last MOVE positions
      const firstMove = body.indexOf(MOVE);
      const lastNonMove = body.findIndex((p: BodyPartConstant) => p === MOVE) - 1;
      
      // All non-MOVE parts should come before MOVE parts
      for (let i = 0; i < firstMove; i++) {
        expect(body[i]).not.toBe(MOVE);
      }
      for (let i = firstMove; i < body.length; i++) {
        expect(body[i]).toBe(MOVE);
      }
    });
  });

  describe('buildLocalWorkerBody', () => {
    it('should return minimal body when energy is very low', () => {
      const body = buildLocalWorkerBody(150);
      expect(body).toEqual([WORK, CARRY, MOVE]);
      expect(getBodyCost(body)).toBeLessThanOrEqual(200);
    });

    it('should prioritize WORK parts', () => {
      const body = buildLocalWorkerBody(600);
      
      const workCount = body.filter((p: BodyPartConstant) => p === WORK).length;
      const carryCount = body.filter((p: BodyPartConstant) => p === CARRY).length;
      
      // Pattern is WORK, CARRY, MOVE - so WORK should equal CARRY
      expect(workCount).toBe(carryCount);
    });

    it('should cap at 800 energy', () => {
      const bodyAt800 = buildLocalWorkerBody(800);
      const bodyAt1200 = buildLocalWorkerBody(1200);
      
      expect(bodyAt800).toEqual(bodyAt1200);
      expect(getBodyCost(bodyAt800)).toBeLessThanOrEqual(800);
    });

    it('should have fewer MOVE parts ratio than remote worker', () => {
      const localBody = buildLocalWorkerBody(600);
      const remoteBody = buildRemoteWorkerBody(600);
      
      const localMoveRatio = localBody.filter((p: BodyPartConstant) => p === MOVE).length / localBody.length;
      const remoteMoveRatio = remoteBody.filter((p: BodyPartConstant) => p === MOVE).length / remoteBody.length;
      
      // Local workers have less MOVE (1:2 ratio vs 1:1)
      expect(localMoveRatio).toBeLessThan(remoteMoveRatio);
    });
  });

  describe('buildFillerBody', () => {
    it('should build same pattern as local worker', () => {
      const fillerBody = buildFillerBody(400);
      const localBody = buildLocalWorkerBody(400);
      
      expect(fillerBody).toEqual(localBody);
    });

    it('should cap at 800 energy', () => {
      const bodyAt800 = buildFillerBody(800);
      const bodyAt1000 = buildFillerBody(1000);
      
      expect(bodyAt800).toEqual(bodyAt1000);
    });
  });

  describe('getBodyCost', () => {
    it('should calculate correct cost for known body', () => {
      const body: BodyPartConstant[] = [WORK, CARRY, MOVE];
      expect(getBodyCost(body)).toBe(200); // 100 + 50 + 50
    });

    it('should calculate correct cost for complex body', () => {
      const body: BodyPartConstant[] = [TOUGH, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      // 10 + 100 + 100 + 50 + 50 + 50 + 50 = 410
      expect(getBodyCost(body)).toBe(410);
    });

    it('should return 0 for empty body', () => {
      expect(getBodyCost([])).toBe(0);
    });

    it('should handle all body part types', () => {
      const allParts: BodyPartConstant[] = [
        MOVE, WORK, CARRY, ATTACK, RANGED_ATTACK, HEAL, CLAIM, TOUGH
      ];
      // 50 + 100 + 50 + 80 + 150 + 250 + 600 + 10 = 1290
      expect(getBodyCost(allParts)).toBe(1290);
    });
  });
});
