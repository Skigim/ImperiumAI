import { describe, expect, it } from 'vitest';

import {
  detectStructuralEnvelopeChange,
  isInitialExtensionEnvelopeReady,
  summarizeRoomEconomySnapshot,
} from '../../src/domain/roomEconomy';

const localSourceIds: readonly Id<Source>[] = [
  'a' as Id<Source>,
  'b' as Id<Source>,
];
const remoteSourceIds: readonly Id<Source>[] = ['c' as Id<Source>];

describe('room economy domain', () => {
  it('detects structural envelope changes from cached energy capacity', () => {
    expect(detectStructuralEnvelopeChange(550, 300)).toBe(true);
    expect(detectStructuralEnvelopeChange(550, 550)).toBe(false);
  });

  it('exposes explicit readiness for the initial RCL2 five-extension envelope and keeps the legacy alias aligned', () => {
    const completeSnapshot = summarizeRoomEconomySnapshot({
      roomName: 'W1N1',
      controllerLevel: 2,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      extensionCount: 5,
      localSourceIds,
      remoteSourceIds,
      hostileCount: 0,
    });

    const lowRclSnapshot = summarizeRoomEconomySnapshot({
      roomName: 'W1N1',
      controllerLevel: 1,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      extensionCount: 5,
      localSourceIds,
      remoteSourceIds,
      hostileCount: 0,
    });

    const lowCapacitySnapshot = summarizeRoomEconomySnapshot({
      roomName: 'W1N1',
      controllerLevel: 2,
      energyAvailable: 300,
      energyCapacityAvailable: 500,
      extensionCount: 5,
      localSourceIds,
      remoteSourceIds,
      hostileCount: 0,
    });

    const lowExtensionSnapshot = summarizeRoomEconomySnapshot({
      roomName: 'W1N1',
      controllerLevel: 2,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      extensionCount: 4,
      localSourceIds,
      remoteSourceIds,
      hostileCount: 0,
    });

    expect(completeSnapshot.initialExtensionEnvelopeReady).toBe(true);
    expect(completeSnapshot.extensionBuildoutComplete).toBe(true);
    expect(completeSnapshot.extensionBuildoutComplete).toBe(
      completeSnapshot.initialExtensionEnvelopeReady,
    );
    expect(completeSnapshot.controllerLevel).toBe(2);
    expect(lowRclSnapshot.initialExtensionEnvelopeReady).toBe(false);
    expect(lowRclSnapshot.extensionBuildoutComplete).toBe(false);
    expect(lowCapacitySnapshot.initialExtensionEnvelopeReady).toBe(false);
    expect(lowCapacitySnapshot.extensionBuildoutComplete).toBe(false);
    expect(lowExtensionSnapshot.initialExtensionEnvelopeReady).toBe(false);
    expect(lowExtensionSnapshot.extensionBuildoutComplete).toBe(false);
  });

  it('exports a helper that names the initial extension envelope contract directly', () => {
    expect(
      isInitialExtensionEnvelopeReady({
        controllerLevel: 2,
        energyCapacityAvailable: 550,
        extensionCount: 5,
      }),
    ).toBe(true);

    expect(
      isInitialExtensionEnvelopeReady({
        controllerLevel: 3,
        energyCapacityAvailable: 550,
        extensionCount: 5,
      }),
    ).toBe(true);

    expect(
      isInitialExtensionEnvelopeReady({
        controllerLevel: 2,
        energyCapacityAvailable: 500,
        extensionCount: 5,
      }),
    ).toBe(false);

    expect(
      isInitialExtensionEnvelopeReady({
        controllerLevel: 2,
        energyCapacityAvailable: 550,
        extensionCount: 4,
      }),
    ).toBe(false);
  });

  it('copies source id arrays so the snapshot does not share caller-owned references', () => {
    const localSourceIds: Id<Source>[] = ['a' as Id<Source>, 'b' as Id<Source>];
    const remoteSourceIds: Id<Source>[] = ['c' as Id<Source>];

    const snapshot = summarizeRoomEconomySnapshot({
      roomName: 'W1N1',
      controllerLevel: 2,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      extensionCount: 5,
      localSourceIds,
      remoteSourceIds,
      hostileCount: 0,
    });

    localSourceIds.push('d' as Id<Source>);
    remoteSourceIds[0] = 'z' as Id<Source>;

    expect(snapshot.localSourceIds).not.toBe(localSourceIds);
    expect(snapshot.remoteSourceIds).not.toBe(remoteSourceIds);
    expect(snapshot.localSourceIds).toEqual(['a', 'b']);
    expect(snapshot.remoteSourceIds).toEqual(['c']);
  });
});