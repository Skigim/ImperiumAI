/**
 * Jest Test Setup for Screeps
 * 
 * This file runs before each test suite and sets up global mocks
 * and utilities needed for testing Screeps code.
 */

/// <reference types="jest" />
import { mockGlobal } from 'screeps-jest';

/**
 * Global test helpers
 */
declare global {
  namespace NodeJS {
    interface Global {
      resetGameMocks: () => void;
    }
  }
}

/**
 * Reset all game mocks to a clean state.
 * Call this in beforeEach() to ensure test isolation.
 */
function resetGameMocks(): void {
  // Initialize Memory structure
  mockGlobal<Memory>('Memory', {
    creeps: {},
    rooms: {},
    spawns: {},
    flags: {},
    powerCreeps: {},
    kernel: {
      registeredProcesses: [],
      lastTick: 0,
    },
  }, true);

  // Initialize basic Game object
  mockGlobal<Game>('Game', {
    time: 1,
    creeps: {},
    rooms: {},
    spawns: {},
    structures: {},
    constructionSites: {},
    flags: {},
    resources: {},
    market: {
      credits: 0,
      incomingTransactions: [],
      outgoingTransactions: [],
      orders: {},
    },
    gcl: {
      level: 1,
      progress: 0,
      progressTotal: 1000000,
    },
    gpl: {
      level: 0,
      progress: 0,
      progressTotal: 1000,
    },
    cpu: {
      limit: 20,
      tickLimit: 500,
      bucket: 10000,
      shardLimits: {},
      unlocked: false,
      unlockedTime: 0,
      getUsed: jest.fn(() => 0.5),
      setShardLimits: jest.fn(),
      halt: jest.fn(),
      getHeapStatistics: jest.fn(() => ({
        total_heap_size: 0,
        total_heap_size_executable: 0,
        total_physical_size: 0,
        total_available_size: 0,
        used_heap_size: 0,
        heap_size_limit: 0,
        malloced_memory: 0,
        peak_malloced_memory: 0,
        does_zap_garbage: 0,
        externally_allocated_size: 0,
      })),
    },
    map: {
      describeExits: jest.fn(),
      findExit: jest.fn(),
      findRoute: jest.fn(),
      getRoomLinearDistance: jest.fn(),
      getRoomTerrain: jest.fn(),
      getWorldSize: jest.fn(() => 202),
      getRoomStatus: jest.fn(),
    },
    shard: {
      name: 'shard3',
      type: 'normal',
      ptr: false,
    },
    getObjectById: jest.fn(),
    notify: jest.fn(),
  }, true);
}

// Make reset function available globally
(global as any).resetGameMocks = resetGameMocks;

// Run reset before each test by default
beforeEach(() => {
  resetGameMocks();
});

// Console spy helper to capture logs during tests
export function createConsoleSpy(): { logs: string[]; clear: () => void } {
  const logs: string[] = [];
  const originalLog = console.log;
  
  beforeEach(() => {
    console.log = jest.fn((...args: unknown[]) => {
      logs.push(args.map(a => String(a)).join(' '));
    });
  });

  afterEach(() => {
    console.log = originalLog;
    logs.length = 0;
  });

  return {
    logs,
    clear: () => { logs.length = 0; }
  };
}
