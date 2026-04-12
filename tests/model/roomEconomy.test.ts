import { describe, expect, it } from 'vitest';

import {
  createRouteThroughputModel,
  createDefaultRoomEconomyRecord,
  createDefaultSourceEconomyRecord,
  type PersistedRoomPosition,
} from '../../src/model/roomEconomy';

describe('room economy model', () => {
  it('creates a bootstrap room record with no commissioning slot', () => {
    const record = createDefaultRoomEconomyRecord('W1N1');

    expect(record.phase).toBe('bootstrap');
    expect(record.currentCommissioningSourceId).toBeNull();
    expect(record.localSourceHardeningComplete).toBe(false);
    expect(record.cachedStructuralEnergyCapacity).toBe(300);
  });

  it('creates a source record with bootstrap state and zeroed health counters', () => {
    const record = createDefaultSourceEconomyRecord({
      sourceId: 'source-1' as Id<Source>,
      roomName: 'W1N1',
      classification: 'local',
    });

    expect(record.state).toBe('bootstrap-candidate');
    expect(record.health.hostilePresenceStreak).toBe(0);
    expect(record.health.routeRiskScore).toBe(0);
    expect(record.logisticsStopId).toBeNull();
  });

  it('stores persisted source positions as serializable coordinates', () => {
    const record = createDefaultSourceEconomyRecord({
      sourceId: 'source-1' as Id<Source>,
      roomName: 'W1N1',
      classification: 'local',
    });
    const position: PersistedRoomPosition = {
      x: 10,
      y: 20,
      roomName: 'W1N1',
    };

    record.designatedMiningTile = position;
    record.containerPosition = position;
    record.roadAnchor = position;

    expect(record.designatedMiningTile).toEqual(position);
    expect(record.containerPosition).toEqual(position);
    expect(record.roadAnchor).toEqual(position);
  });

  it('derives net delivery from pickup minus maintenance bleed', () => {
    expect(
      createRouteThroughputModel({
        expectedPickupPerCycle: 14,
        expectedMaintenanceBleedPerCycle: 3,
      }),
    ).toEqual({
      expectedPickupPerCycle: 14,
      expectedMaintenanceBleedPerCycle: 3,
      expectedNetDeliveryPerCycle: 11,
    });
  });
});