import { describe, expect, it } from 'vitest';

import {
  createDefaultRoomEconomyRecord,
  createDefaultSourceEconomyRecord,
} from '../../src/model/roomEconomy';
import {
  applyPassiveRemoteRecovery,
  advanceSourceState,
  chooseBootstrapShuttleSource,
  chooseNextCommissioningSource,
  classifyBootstrapSpawn,
  deriveBootstrapCleanupEffects,
  deriveBootstrapPhase,
  deriveRoomPhase,
} from '../../src/policies/roomEconomyPolicy';

describe('room economy policy', () => {
  it('keeps the room in bootstrap until the RCL2 extension buildout is complete', () => {
    const record = createDefaultRoomEconomyRecord('W1N1');

    expect(
      deriveRoomPhase({
        room: record,
        extensionBuildoutComplete: false,
        controllerLevel: 2,
        localSourceHardeningComplete: false,
      }),
    ).toBe('bootstrap');
  });

  it('selects extension-build at RCL2 before the exit charge is full', () => {
    expect(
      deriveBootstrapPhase({
        controllerLevel: 2,
        extensionCount: 3,
        energyAvailable: 300,
        energyCapacityAvailable: 550,
        localSourceIds: ['source-a' as Id<Source>, 'source-b' as Id<Source>],
        stationaryTransitionComplete: false,
      }),
    ).toBe('extension-build');
  });

  it('selects stationary-transition for a fully built and fully charged RCL2 envelope even before local sources are discovered', () => {
    expect(
      deriveBootstrapPhase({
        controllerLevel: 2,
        extensionCount: 5,
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        localSourceIds: [],
        stationaryTransitionComplete: false,
      }),
    ).toBe('stationary-transition');
  });

  it('selects exit-charge once the five-extension envelope is built but not fully charged', () => {
    expect(
      deriveBootstrapPhase({
        controllerLevel: 2,
        extensionCount: 5,
        energyAvailable: 500,
        energyCapacityAvailable: 550,
        localSourceIds: ['source-a' as Id<Source>, 'source-b' as Id<Source>],
        stationaryTransitionComplete: false,
      }),
    ).toBe('exit-charge');
  });

  it('selects complete once the stationary transition is marked done', () => {
    expect(
      deriveBootstrapPhase({
        controllerLevel: 2,
        extensionCount: 5,
        energyAvailable: 550,
        energyCapacityAvailable: 550,
        localSourceIds: ['source-a' as Id<Source>, 'source-b' as Id<Source>],
        stationaryTransitionComplete: true,
      }),
    ).toBe('complete');
  });

  it('chooses the least-staffed shuttle source with an open slot while counting assignments and reserved slots', () => {
    expect(
      chooseBootstrapShuttleSource({
        localSourceIds: ['source-a' as Id<Source>, 'source-b' as Id<Source>],
        assignments: {
          shuttleOne: {
            creepName: 'shuttle-1',
            assignmentClass: 'shuttle',
            sourceId: 'source-a' as Id<Source>,
            slotKey: '10,10',
            deliveryMode: 'deliver',
          },
        },
        sourceSlots: {
          'source-a': {
            '10,10': {
              occupantCreepName: 'shuttle-1',
              claimState: 'occupied',
              reservedAtTick: 1,
            },
          },
          'source-b': {
            '20,20': {
              occupantCreepName: null,
              claimState: 'reserved',
              reservedAtTick: 2,
            },
            '21,20': {
              occupantCreepName: null,
              claimState: 'open',
              reservedAtTick: 0,
            },
          },
        },
      }),
    ).toBe('source-b');
  });

  it('does not double count a pending shuttle assignment that already holds the reserved slot', () => {
    expect(
      chooseBootstrapShuttleSource({
        localSourceIds: ['source-a' as Id<Source>, 'source-b' as Id<Source>],
        assignments: {
          pendingShuttle: {
            creepName: 'bootstrap-pending',
            assignmentClass: 'shuttle',
            sourceId: 'source-a' as Id<Source>,
            slotKey: '10,10',
            deliveryMode: 'harvest',
          },
        },
        sourceSlots: {
          'source-a': {
            '10,10': {
              occupantCreepName: 'bootstrap-pending',
              claimState: 'reserved',
              reservedAtTick: 2,
            },
            '10,11': {
              occupantCreepName: null,
              claimState: 'open',
              reservedAtTick: 0,
            },
          },
          'source-b': {
            '20,20': {
              occupantCreepName: null,
              claimState: 'reserved',
              reservedAtTick: 3,
            },
            '20,21': {
              occupantCreepName: null,
              claimState: 'open',
              reservedAtTick: 0,
            },
          },
        },
      }),
    ).toBe('source-a');
  });

  it('breaks shuttle source ties deterministically by source id', () => {
    expect(
      chooseBootstrapShuttleSource({
        localSourceIds: ['source-b' as Id<Source>, 'source-a' as Id<Source>],
        assignments: {},
        sourceSlots: {
          'source-b': {
            '20,20': {
              occupantCreepName: null,
              claimState: 'open',
              reservedAtTick: 0,
            },
          },
          'source-a': {
            '10,10': {
              occupantCreepName: null,
              claimState: 'open',
              reservedAtTick: 0,
            },
          },
        },
      }),
    ).toBe('source-a');
  });

  it('clears rerouted shuttle state and requests a replacement when the shuttle dies', () => {
    expect(
      deriveBootstrapCleanupEffects({
        deadCreepName: 'shuttle-1',
        assignments: {
          'shuttle-1': {
            creepName: 'shuttle-1',
            assignmentClass: 'shuttle',
            sourceId: 'source-a' as Id<Source>,
            slotKey: '10,10',
            deliveryMode: 'rerouted',
          },
        },
        reroutes: {
          'shuttle-1': {
            shuttleName: 'shuttle-1',
            targetHaulerName: 'hauler-1',
            sourceId: 'source-a' as Id<Source>,
          },
        },
      }),
    ).toEqual({
      clearedSourceId: 'source-a',
      clearedSlotKey: '10,10',
      affectedHaulerName: 'hauler-1',
      replacementDemand: true,
    });
  });

  it('classifies bootstrap shuttle spawns as overflow build haulers when no slots are open', () => {
    expect(
      classifyBootstrapSpawn({
        phase: 'extension-build',
        openSlotCount: 0,
      }),
    ).toBe('overflow-build-hauler');
  });

  it('classifies stationary-transition bootstrap spawns as stationary miners', () => {
    expect(
      classifyBootstrapSpawn({
        phase: 'stationary-transition',
        openSlotCount: 0,
      }),
    ).toBe('stationary-miner');
  });

  it('classifies exit-charge respawns using the same slot-aware split as late bootstrap', () => {
    expect(
      classifyBootstrapSpawn({
        phase: 'exit-charge',
        openSlotCount: 2,
      }),
    ).toBe('shuttle');
    expect(
      classifyBootstrapSpawn({
        phase: 'exit-charge',
        openSlotCount: 0,
      }),
    ).toBe('overflow-build-hauler');
  });

  it('returns no bootstrap spawn classification once bootstrap is complete', () => {
    expect(
      classifyBootstrapSpawn({
        phase: 'complete',
        openSlotCount: 2,
      }),
    ).toBeNull();
  });

  it('promotes a local source into stationary-online once the container is live and the room can spawn the miner', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'local-1' as Id<Source>,
      roomName: 'W1N1',
      classification: 'local',
    });

    source.state = 'container-bootstrap';
    source.requiredSpawnEnergyCapacity = 550;

    const next = advanceSourceState(source, {
      tick: 150,
      structuralEnergyCapacity: 550,
      containerComplete: true,
      roadComplete: false,
      routeRiskDetected: false,
      hostileDetected: false,
      logisticsServiced: true,
      minerOnPrimeTile: true,
    });

    expect(next.state).toBe('stationary-online');
  });

  it('demotes a local source when structural energy capacity collapses below the miner envelope', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'local-1' as Id<Source>,
      roomName: 'W1N1',
      classification: 'local',
    });

    source.state = 'logistics-active';
    source.requiredSpawnEnergyCapacity = 550;

    const next = advanceSourceState(source, {
      tick: 300,
      structuralEnergyCapacity: 300,
      containerComplete: true,
      roadComplete: true,
      routeRiskDetected: false,
      hostileDetected: false,
      logisticsServiced: true,
      minerOnPrimeTile: true,
    });

    expect(next.state).toBe('degraded-local');
  });

  it('keeps accruing logistics starvation while a degraded local source still expects logistics service', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'local-1' as Id<Source>,
      roomName: 'W1N1',
      classification: 'local',
    });

    source.state = 'degraded-local';
    source.health.logisticsStarvationStreak = 3;

    const next = advanceSourceState(source, {
      tick: 301,
      structuralEnergyCapacity: 550,
      containerComplete: true,
      roadComplete: true,
      routeRiskDetected: false,
      hostileDetected: false,
      logisticsServiced: false,
      minerOnPrimeTile: true,
    });

    expect(next.state).toBe('degraded-local');
    expect(next.health.logisticsStarvationStreak).toBe(4);
  });

  it('does not suspend a remote on the first hostile scout tick', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'remote-1' as Id<Source>,
      roomName: 'W1N2',
      classification: 'remote',
    });

    source.state = 'logistics-active';

    const next = advanceSourceState(source, {
      tick: 400,
      structuralEnergyCapacity: 550,
      containerComplete: true,
      roadComplete: true,
      routeRiskDetected: true,
      hostileDetected: true,
      logisticsServiced: true,
      minerOnPrimeTile: true,
    });

    expect(next.state).toBe('logistics-active');
    expect(next.health.hostilePresenceStreak).toBe(1);
  });

  it('tracks route risk separately from hostile sightings for remote sources', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'remote-1' as Id<Source>,
      roomName: 'W1N2',
      classification: 'remote',
    });

    source.state = 'logistics-active';

    const next = advanceSourceState(source, {
      tick: 401,
      structuralEnergyCapacity: 550,
      containerComplete: true,
      roadComplete: true,
      routeRiskDetected: true,
      hostileDetected: false,
      logisticsServiced: true,
      minerOnPrimeTile: true,
    });

    expect(next.state).toBe('logistics-active');
    expect(next.health.hostilePresenceStreak).toBe(0);
    expect(next.health.routeRiskScore).toBe(1);
  });

  it('suspends a remote after sustained route risk even without hostile sightings', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'remote-1' as Id<Source>,
      roomName: 'W1N2',
      classification: 'remote',
    });

    source.state = 'logistics-active';
    source.health.routeRiskScore = 2;

    const next = advanceSourceState(source, {
      tick: 402,
      structuralEnergyCapacity: 550,
      containerComplete: true,
      roadComplete: true,
      routeRiskDetected: true,
      hostileDetected: false,
      logisticsServiced: true,
      minerOnPrimeTile: true,
    });

    expect(next.state).toBe('suspended');
    expect(next.health.hostilePresenceStreak).toBe(0);
    expect(next.health.routeRiskScore).toBe(3);
    expect(next.health.reactivationCooldownUntil).toBe(427);
  });

  it('suspends a remote after sustained logistics starvation', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'remote-1' as Id<Source>,
      roomName: 'W1N2',
      classification: 'remote',
    });

    source.state = 'logistics-active';
    source.health.logisticsStarvationStreak = 2;

    const next = advanceSourceState(source, {
      tick: 403,
      structuralEnergyCapacity: 550,
      containerComplete: true,
      roadComplete: true,
      routeRiskDetected: false,
      hostileDetected: false,
      logisticsServiced: false,
      minerOnPrimeTile: true,
    });

    expect(next.state).toBe('suspended');
    expect(next.health.logisticsStarvationStreak).toBe(3);
    expect(next.health.reactivationCooldownUntil).toBe(428);
  });

  it('clears suspended remote recovery counters only after cooldown plus the recovery window', () => {
    const source = createDefaultSourceEconomyRecord({
      sourceId: 'remote-1' as Id<Source>,
      roomName: 'W1N2',
      classification: 'remote',
    });

    source.state = 'suspended';
    source.health.reactivationCooldownUntil = 500;
    source.health.hostilePresenceStreak = 3;
    source.health.routeRiskScore = 2;
    source.health.logisticsStarvationStreak = 1;

    const beforeWindow = applyPassiveRemoteRecovery(source, 504);
    const afterWindow = applyPassiveRemoteRecovery(source, 505);

    expect(beforeWindow.health.hostilePresenceStreak).toBe(3);
    expect(beforeWindow.health.routeRiskScore).toBe(2);
    expect(beforeWindow.health.logisticsStarvationStreak).toBe(1);
    expect(afterWindow.health.hostilePresenceStreak).toBe(0);
    expect(afterWindow.health.routeRiskScore).toBe(0);
    expect(afterWindow.health.logisticsStarvationStreak).toBe(0);
  });

  it('chooses the nearest remote source when no commissioning slot is active', () => {
    const room = createDefaultRoomEconomyRecord('W1N1');
    room.localSourceHardeningComplete = true;

    room.sourceRecords = {
      'remote-a': {
        ...createDefaultSourceEconomyRecord({
          sourceId: 'remote-a' as Id<Source>,
          roomName: 'W1N2',
          classification: 'remote',
        }),
      },
      'remote-b': {
        ...createDefaultSourceEconomyRecord({
          sourceId: 'remote-b' as Id<Source>,
          roomName: 'W2N1',
          classification: 'remote',
        }),
      },
    };

    const remoteA = room.sourceRecords['remote-a'];

    if (!remoteA) {
      throw new Error('expected remote-a to exist');
    }

    remoteA.state = 'suspended';
    remoteA.health.reactivationCooldownUntil = 500;

    const nextId = chooseNextCommissioningSource(
      room,
      {
        'remote-a': 12,
        'remote-b': 20,
      },
      450,
    );

    expect(nextId).toBe('remote-b');
  });

  it('ignores local bootstrap candidates once local hardening is complete', () => {
    const room = createDefaultRoomEconomyRecord('W1N1');
    room.localSourceHardeningComplete = true;

    room.sourceRecords = {
      'local-a': {
        ...createDefaultSourceEconomyRecord({
          sourceId: 'local-a' as Id<Source>,
          roomName: 'W1N1',
          classification: 'local',
        }),
      },
      'remote-a': {
        ...createDefaultSourceEconomyRecord({
          sourceId: 'remote-a' as Id<Source>,
          roomName: 'W1N2',
          classification: 'remote',
        }),
      },
    };

    const nextId = chooseNextCommissioningSource(
      room,
      {
        'local-a': 2,
        'remote-a': 12,
      },
      450,
    );

    expect(nextId).toBe('remote-a');
  });

  it('returns null when no remote candidate has a defined path distance', () => {
    const room = createDefaultRoomEconomyRecord('W1N1');
    room.localSourceHardeningComplete = true;

    room.sourceRecords = {
      'remote-a': {
        ...createDefaultSourceEconomyRecord({
          sourceId: 'remote-a' as Id<Source>,
          roomName: 'W1N2',
          classification: 'remote',
        }),
      },
    };

    const nextId = chooseNextCommissioningSource(room, {}, 450);

    expect(nextId).toBeNull();
  });

  it('keeps a suspended remote out of selection on the first tick after cooldown expiry', () => {
    const room = createDefaultRoomEconomyRecord('W1N1');
    room.localSourceHardeningComplete = true;

    room.sourceRecords = {
      'remote-a': {
        ...createDefaultSourceEconomyRecord({
          sourceId: 'remote-a' as Id<Source>,
          roomName: 'W1N2',
          classification: 'remote',
        }),
      },
    };

    const remoteA = room.sourceRecords['remote-a'];

    if (!remoteA) {
      throw new Error('expected remote-a to exist');
    }

    remoteA.state = 'suspended';
    remoteA.health.reactivationCooldownUntil = 500;

    const nextId = chooseNextCommissioningSource(room, { 'remote-a': 12 }, 501);

    expect(nextId).toBeNull();
  });

  it('allows a suspended remote back into selection only after a stable recovery window', () => {
    const room = createDefaultRoomEconomyRecord('W1N1');
    room.localSourceHardeningComplete = true;

    room.sourceRecords = {
      'remote-a': {
        ...createDefaultSourceEconomyRecord({
          sourceId: 'remote-a' as Id<Source>,
          roomName: 'W1N2',
          classification: 'remote',
        }),
      },
    };

    const remoteA = room.sourceRecords['remote-a'];

    if (!remoteA) {
      throw new Error('expected remote-a to exist');
    }

    remoteA.state = 'suspended';
    remoteA.health.reactivationCooldownUntil = 500;

    const nextId = chooseNextCommissioningSource(room, { 'remote-a': 12 }, 506);

    expect(nextId).toBe('remote-a');
  });

  it('breaks equal-distance remote commissioning ties by source id even with reversed insertion order', () => {
    const room = createDefaultRoomEconomyRecord('W1N1');
    room.localSourceHardeningComplete = true;

    room.sourceRecords = {
      'remote-b': createDefaultSourceEconomyRecord({
        sourceId: 'remote-b' as Id<Source>,
        roomName: 'W2N1',
        classification: 'remote',
      }),
      'remote-a': createDefaultSourceEconomyRecord({
        sourceId: 'remote-a' as Id<Source>,
        roomName: 'W1N2',
        classification: 'remote',
      }),
    };

    const nextId = chooseNextCommissioningSource(
      room,
      {
        'remote-a': 12,
        'remote-b': 12,
      },
      450,
    );

    expect(nextId).toBe('remote-a');
  });

  it('preserves the active commissioning slot when one is already assigned', () => {
    const room = createDefaultRoomEconomyRecord('W1N1');
    room.currentCommissioningSourceId = 'remote-a' as Id<Source>;
    room.sourceRecords = {
      'remote-a': createDefaultSourceEconomyRecord({
        sourceId: 'remote-a' as Id<Source>,
        roomName: 'W1N2',
        classification: 'remote',
      }),
      'remote-b': createDefaultSourceEconomyRecord({
        sourceId: 'remote-b' as Id<Source>,
        roomName: 'W2N1',
        classification: 'remote',
      }),
    };

    const nextId = chooseNextCommissioningSource(
      room,
      {
        'remote-a': 20,
        'remote-b': 10,
      },
      450,
    );

    expect(nextId).toBe('remote-a');
  });
});