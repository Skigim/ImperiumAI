import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initializeMemory,
  MEMORY_SCHEMA_VERSION,
} from '../../src/model/memory';

const hasOwn = (value: object, key: PropertyKey): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

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
                stale_source_key: {
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
          bootstrap: {
            phase: 'bootstrap-shuttle',
            activeExtensionSiteId: null,
            lastExtensionPlacementTick: 0,
            sourceSlots: {},
            assignments: {},
            fetchRequests: {},
            reroutes: {},
          },
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
    const normalizedRoomW1N1 = Memory.imperium.rooms.W1N1;
    expect(normalizedRoomW1N1).toBeDefined();
    if (normalizedRoomW1N1 === undefined) {
      throw new Error('Expected W1N1 room memory to be initialized');
    }
    expect(hasOwn(normalizedRoomW1N1.economy.sourceRecords, 'stale_source_key')).toBe(
      false,
    );
    expect(Memory.imperium.kernel.lastTick).toBe(12345);
    expect(Memory.imperium.kernel.scheduler.lastRunCpu).toBe(4.2);
  });

  it('normalizes bootstrap room economy state while pruning sparse invalid slot claims', () => {
    vi.stubGlobal('Game', {
      shard: { name: 'shard3' },
      time: 200,
      cpu: {
        getUsed: () => 1.5,
      },
    });
    vi.stubGlobal('Memory', {
      imperium: {
        schemaVersion: MEMORY_SCHEMA_VERSION - 1,
        shard: 'legacy',
        kernel: {
          lastTick: 10,
          scheduler: {
            lastRunCpu: 3,
          },
        },
        processes: {},
        rooms: {
          W1N1: {
            roomName: 'W1N1',
            lastSeenTick: 150,
            economy: {
              roomName: 'W1N1',
              phase: 'bootstrap',
              sourceRecords: {},
              bootstrap: {
                phase: 'extension-build',
                activeExtensionSiteId: 'site-1',
                sourceSlots: {
                  sourceA: {
                    '10,20': {
                      occupantCreepName: 'shuttle-1',
                      claimState: 'occupied',
                    },
                    '11,20': 'invalid',
                    '12,20': {
                      occupantCreepName: 'shuttle-2',
                      claimState: 'bad-state',
                    },
                    '13,20': {},
                    '14,20': {
                      occupantCreepName: 42,
                      claimState: 'bad-state',
                    },
                  },
                  sourceB: {
                    '15,20': {},
                  },
                },
                assignments: {
                  shuttle_1: {
                    creepName: 'shuttle-1',
                    assignmentClass: 'shuttle',
                    sourceId: 'sourceA',
                    slotKey: '10,20',
                    deliveryMode: 'rerouted',
                  },
                  hauler_1: {
                    creepName: 'hauler-1',
                    assignmentClass: 'overflow-build-hauler',
                    sourceId: null,
                    slotKey: null,
                    deliveryMode: 'build',
                  },
                  invalid_assignment: {
                    assignmentClass: 'bootstrap-builder',
                    sourceId: 'sourceA',
                    slotKey: '10,20',
                    deliveryMode: 'build',
                  },
                },
                fetchRequests: {
                  hauler_1: {
                    creepName: 'hauler-1',
                    status: 'matched',
                    requestedAtTick: 180,
                    assignedShuttleName: 'shuttle-1',
                  },
                  invalid_fetch: {
                    status: 'pending',
                    requestedAtTick: 181,
                  },
                },
                reroutes: {
                  shuttle_1: {
                    shuttleName: 'shuttle-1',
                    targetHaulerName: 'hauler-1',
                    sourceId: 'sourceA',
                  },
                  shuttle_2: {
                    shuttleName: 'shuttle-2',
                    targetHaulerName: 'hauler-2',
                    sourceId: null,
                  },
                  invalid_reroute: {
                    targetHaulerName: 'hauler-2',
                    sourceId: 'sourceB',
                  },
                },
              },
            },
          },
          W1N2: {
            roomName: 'W1N2',
            lastSeenTick: 151,
            economy: {
              roomName: 'W1N2',
              phase: 'bootstrap',
              sourceRecords: {},
              bootstrap: 'invalid',
            },
          },
        },
        intel: {},
      } as never,
    });

    initializeMemory();

    const roomW1N1 = Memory.imperium.rooms.W1N1;
    expect(roomW1N1).toBeDefined();
    if (roomW1N1 === undefined) {
      throw new Error('Expected W1N1 room memory to be initialized');
    }

    expect(roomW1N1.economy.bootstrap).toEqual({
      phase: 'extension-build',
      activeExtensionSiteId: 'site-1',
      lastExtensionPlacementTick: 0,
      sourceSlots: {
        sourceA: {
          '10,20': {
            occupantCreepName: 'shuttle-1',
            claimState: 'occupied',
            reservedAtTick: 0,
          },
          '12,20': {
            occupantCreepName: 'shuttle-2',
            claimState: 'open',
            reservedAtTick: 0,
          },
        },
      },
      assignments: {
        shuttle_1: {
          creepName: 'shuttle-1',
          assignmentClass: 'shuttle',
          sourceId: 'sourceA',
          slotKey: '10,20',
          deliveryMode: 'rerouted',
        },
        hauler_1: {
          creepName: 'hauler-1',
          assignmentClass: 'overflow-build-hauler',
          sourceId: null,
          slotKey: null,
          deliveryMode: 'build',
        },
      },
      fetchRequests: {
        hauler_1: {
          creepName: 'hauler-1',
          status: 'matched',
          requestedAtTick: 180,
          assignedShuttleName: 'shuttle-1',
        },
      },
      reroutes: {
        shuttle_1: {
          shuttleName: 'shuttle-1',
          targetHaulerName: 'hauler-1',
          sourceId: 'sourceA',
        },
        shuttle_2: {
          shuttleName: 'shuttle-2',
          targetHaulerName: 'hauler-2',
          sourceId: null,
        },
      },
    });

    const roomW1N2 = Memory.imperium.rooms.W1N2;
    expect(roomW1N2).toBeDefined();
    if (roomW1N2 === undefined) {
      throw new Error('Expected W1N2 room memory to be initialized');
    }

    expect(roomW1N2.economy.bootstrap).toEqual({
      phase: 'bootstrap-shuttle',
      activeExtensionSiteId: null,
      lastExtensionPlacementTick: 0,
      sourceSlots: {},
      assignments: {},
      fetchRequests: {},
      reroutes: {},
    });
  });

  it('canonicalizes normalized source records by normalized sourceId', () => {
    vi.stubGlobal('Game', {
      shard: { name: 'shard3' },
      time: 400,
      cpu: {
        getUsed: () => 0.75,
      },
    });
    vi.stubGlobal('Memory', {
      imperium: {
        schemaVersion: MEMORY_SCHEMA_VERSION - 1,
        shard: 'legacy',
        kernel: {
          lastTick: 10,
          scheduler: {
            lastRunCpu: 3,
          },
        },
        processes: {},
        rooms: {
          W1N1: {
            roomName: 'W1N1',
            lastSeenTick: 150,
            economy: {
              roomName: 'W1N1',
              phase: 'bootstrap',
              sourceRecords: {
                stale_source_key: {
                  sourceId: 'source-live',
                  classification: 'local',
                },
                'source-live': {
                  sourceId: 'source-live',
                  classification: 'remote',
                  state: 'road-bootstrap',
                },
                'source-fallback': {
                  classification: 'remote',
                },
              },
            },
          },
        },
        intel: {},
      } as never,
    });

    initializeMemory();

    const roomW1N1 = Memory.imperium.rooms.W1N1;
    expect(roomW1N1).toBeDefined();
    if (roomW1N1 === undefined) {
      throw new Error('Expected W1N1 room memory to be initialized');
    }

    expect(roomW1N1.economy.sourceRecords).toEqual({
      'source-live': {
        sourceId: 'source-live',
        roomName: 'W1N1',
        classification: 'remote',
        state: 'road-bootstrap',
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
      'source-fallback': {
        sourceId: 'source-fallback',
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
    });
  });

  it('prefers the canonical outer source key when a stale duplicate is encountered later', () => {
    vi.stubGlobal('Game', {
      shard: { name: 'shard3' },
      time: 401,
      cpu: {
        getUsed: () => 0.8,
      },
    });
    vi.stubGlobal('Memory', {
      imperium: {
        schemaVersion: MEMORY_SCHEMA_VERSION - 1,
        shard: 'legacy',
        kernel: {
          lastTick: 10,
          scheduler: {
            lastRunCpu: 3,
          },
        },
        processes: {},
        rooms: {
          W1N1: {
            roomName: 'W1N1',
            lastSeenTick: 150,
            economy: {
              roomName: 'W1N1',
              phase: 'bootstrap',
              sourceRecords: {
                'source-live': {
                  sourceId: 'source-live',
                  classification: 'remote',
                  state: 'road-bootstrap',
                },
                stale_source_key: {
                  sourceId: 'source-live',
                  classification: 'local',
                },
              },
            },
          },
        },
        intel: {},
      } as never,
    });

    initializeMemory();

    const roomW1N1 = Memory.imperium.rooms.W1N1;
    expect(roomW1N1).toBeDefined();
    if (roomW1N1 === undefined) {
      throw new Error('Expected W1N1 room memory to be initialized');
    }

    expect(roomW1N1.economy.sourceRecords['source-live']).toMatchObject({
      sourceId: 'source-live',
      classification: 'remote',
      state: 'road-bootstrap',
    });
    expect(hasOwn(roomW1N1.economy.sourceRecords, 'stale_source_key')).toBe(false);
  });
});