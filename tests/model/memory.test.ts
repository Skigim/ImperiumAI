import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initializeMemory,
  MEMORY_SCHEMA_VERSION,
} from '../../src/model/memory';

describe('memory model', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves existing imperium state and normalizes room economy records when the schema is outdated', () => {
    vi.stubGlobal('Game', {
      shard: { name: 'shard3' },
      time: 12345,
      cpu: {
        getUsed: () => 4.2,
      },
    });
    vi.stubGlobal('Memory', {
      imperium: {
        schemaVersion: 1,
        shard: 'legacy-shard',
        kernel: {
          lastTick: 1,
          scheduler: {
            lastRunCpu: 9,
          },
        },
        processes: {
          'process-1': {
            id: 'process-1',
            type: 'room',
            state: 'unknown',
          },
          'process-2': {
            id: 'process-2',
            state: 'idle',
          },
        },
        rooms: {
          W1N1: {
            roomName: 'W1N1',
            lastSeenTick: 100,
            economy: {
              roomName: 'W1N1',
              phase: 'bootstrap',
              sourceRecords: {
                'source-1': {
                  sourceId: 'source-1',
                  roomName: 'legacy-room-name',
                  classification: 'local',
                  state: 'stationary-online',
                  assignedBuilderNames: ['builder-1', 42],
                  assignedHaulerNames: 'hauler-1',
                  requiredSpawnEnergyCapacity: 550,
                  health: {
                    hostilePresenceStreak: 2,
                    pendingReplacement: true,
                    routeRiskScore: 'bad',
                  },
                  throughput: {
                    expectedPickupPerCycle: 10,
                    expectedMaintenanceBleedPerCycle: 3,
                    expectedNetDeliveryPerCycle: 999,
                  },
                },
                'source-2': {
                  sourceId: 'source-2',
                  classification: 'remote',
                  throughput: 'bad',
                },
                'source-3': 'invalid',
              },
            },
          },
        },
        intel: {
          W1N1: {
            lastUpdatedTick: 90,
            threatLevel: 'unsafe',
          },
          W1N2: {
            threatLevel: 3,
          },
          W1N3: 'invalid',
        },
        unexpectedTopLevelField: {
          ignore: true,
        },
        otherGarbage: {
          nested: true,
        },
      } as never,
    });

    initializeMemory();

    expect(MEMORY_SCHEMA_VERSION).toBeGreaterThan(1);
    expect(Memory.imperium.schemaVersion).toBe(MEMORY_SCHEMA_VERSION);
    expect(Memory.imperium.shard).toBe('shard3');
    expect(Memory.imperium.processes).toEqual({
      'process-1': {
        id: 'process-1',
        type: 'room',
        state: 'idle',
      },
    });
    expect(Memory.imperium.intel).toEqual({
      W1N1: {
        lastUpdatedTick: 90,
        threatLevel: 0,
      },
      W1N2: {
        lastUpdatedTick: 0,
        threatLevel: 3,
      },
    });
    expect(Memory.imperium.rooms).toEqual({
      W1N1: {
        roomName: 'W1N1',
        lastSeenTick: 100,
        economy: {
          roomName: 'W1N1',
          phase: 'bootstrap',
          cachedStructuralEnergyCapacity: 300,
          extensionBuildoutComplete: false,
          localSourceHardeningComplete: false,
          currentCommissioningSourceId: null,
          lastStructuralReviewTick: 0,
          lastRemoteRiskReviewTick: 0,
          sourceRecords: {
            'source-1': {
              sourceId: 'source-1',
              roomName: 'legacy-room-name',
              classification: 'local',
              state: 'stationary-online',
              designatedMiningTile: null,
              containerId: null,
              containerPosition: null,
              roadAnchor: null,
              logisticsStopId: null,
              assignedMinerName: null,
              assignedBuilderNames: ['builder-1'],
              assignedHaulerNames: [],
              requiredSpawnEnergyCapacity: 550,
              health: {
                lastStructurallyValidTick: 0,
                lastServicedTick: 0,
                routeRiskScore: 0,
                hostilePresenceStreak: 2,
                logisticsStarvationStreak: 0,
                pendingReplacement: true,
                reactivationCooldownUntil: 0,
              },
              throughput: {
                expectedPickupPerCycle: 10,
                expectedMaintenanceBleedPerCycle: 3,
                expectedNetDeliveryPerCycle: 7,
              },
            },
            'source-2': {
              sourceId: 'source-2',
              roomName: 'W1N1',
              classification: 'remote',
              state: 'bootstrap-candidate',
              designatedMiningTile: null,
              containerId: null,
              containerPosition: null,
              roadAnchor: null,
              logisticsStopId: null,
              assignedMinerName: null,
              assignedBuilderNames: [],
              assignedHaulerNames: [],
              requiredSpawnEnergyCapacity: 300,
              health: {
                lastStructurallyValidTick: 0,
                lastServicedTick: 0,
                routeRiskScore: 0,
                hostilePresenceStreak: 0,
                logisticsStarvationStreak: 0,
                pendingReplacement: false,
                reactivationCooldownUntil: 0,
              },
              throughput: {
                expectedPickupPerCycle: 0,
                expectedMaintenanceBleedPerCycle: 0,
                expectedNetDeliveryPerCycle: 0,
              },
            },
          },
        },
      },
    });
    expect(Memory.imperium.kernel.lastTick).toBe(12345);
    expect(Memory.imperium.kernel.scheduler.lastRunCpu).toBe(4.2);
  });
});