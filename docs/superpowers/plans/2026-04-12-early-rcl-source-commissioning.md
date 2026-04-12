# Early RCL Source Commissioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the RCL 1 through RCL 3 source commissioning model with reversible source states, bounded reevaluation, local-source hardening, and serialized remote expansion.

**Architecture:** Keep source truth in room-scoped model records and pure policy functions. Use a pure room-economy policy layer for state transitions and demand planning, a domain snapshot layer for cheap room facts, and a single room process that orchestrates execution with cached memory and bounded reevaluation.

**Tech Stack:** TypeScript, Screeps runtime globals, Vitest for pure policy tests, existing npm validation commands (`test`, `typecheck`, `build`, `lint`).

---

## File Structure

- `package.json`
  - Add a minimal test script and the `vitest` dev dependency.

- `vitest.config.ts`
  - Keep the test runner in Node mode and limit discovery to the `tests/**/*.test.ts` tree.

- `src/model/roomEconomy.ts`
  - Define room phase, source state, health record, logistics stop, throughput, and demand contracts.

- `src/model/memory.ts`
  - Extend room and creep memory for room-economy state, source records, cached invalidation fields, and role-specific assignments.

- `src/domain/roomEconomy.ts`
  - Build cheap room snapshots from current Screeps state and cached memory diffs.

- `src/domain/index.ts`
  - Re-export room-economy domain helpers.

- `src/policies/roomEconomyPolicy.ts`
  - Implement pure source admission, demotion, hysteresis, commissioning order, and demand-planning logic.

- `src/policies/index.ts`
  - Re-export room-economy policy helpers.

- `src/tasks/build.ts`
  - Provide a focused build helper for bootstrap builders.

- `src/tasks/withdraw.ts`
  - Provide a focused withdraw helper for builders and haulers.

- `src/tasks/repair.ts`
  - Provide a focused repair helper for route-hauler maintenance.

- `src/tasks/index.ts`
  - Re-export new task helpers.

- `src/processes/workerRoomProcess.ts`
  - Replace the generic worker loop with room-economy orchestration, role dispatch, and bounded policy reevaluation.

- `src/processes/index.ts`
  - Keep the room process registration but update the process label and selection logic if required.

- `tests/model/roomEconomy.test.ts`
  - Verify default room and source records.

- `tests/policies/roomEconomyPolicy.test.ts`
  - Verify commissioning promotion, structural demotion, hysteresis, and serialized remote selection.

- `tests/domain/roomEconomy.test.ts`
  - Verify snapshot derivation and cheap invalidation behavior.

## Task 1: Introduce Model Contracts And Test Harness

**Files:**
- Create: `vitest.config.ts`
- Create: `src/model/roomEconomy.ts`
- Create: `tests/model/roomEconomy.test.ts`
- Modify: `package.json`
- Modify: `src/model/memory.ts`

- [ ] **Step 1: Add the test runner to `package.json`**

Replace the `scripts` and `devDependencies` sections with the following content so the repo can run pure TypeScript tests without changing the build pipeline:

```json
{
  "scripts": {
    "build": "node scripts/build.mjs",
    "clean": "node -e \"require('fs').rmSync('dist', { recursive: true, force: true })\"",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "format": "prettier . --write",
    "check-format": "prettier . --check",
    "test": "vitest run",
    "deploy": "node scripts/deploy-placeholder.mjs"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/lodash": "^4.17.17",
    "@types/node": "^25.5.0",
    "@types/screeps": "^3.3.8",
    "esbuild": "^0.28.0",
    "eslint": "^10.1.0",
    "eslint-config-prettier": "^10.1.1",
    "globals": "^17.4.0",
    "prettier": "^3.8.1",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.57.2",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
```

- [ ] **Step 3: Write the failing model tests**

Create `tests/model/roomEconomy.test.ts` with these tests first:

```ts
import { describe, expect, it } from 'vitest';

import {
  createDefaultRoomEconomyRecord,
  createDefaultSourceEconomyRecord,
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
});
```

- [ ] **Step 4: Implement `src/model/roomEconomy.ts` and wire memory types**

Create `src/model/roomEconomy.ts` with the core shared contracts:

```ts
export type RoomEconomyPhase =
  | 'bootstrap'
  | 'local-source-hardening'
  | 'serialized-remote-expansion'
  | 'rcl3-stabilization'
  | 'degraded-recovery';

export type SourceClassification = 'local' | 'remote';

export type SourceEconomyState =
  | 'bootstrap-candidate'
  | 'container-bootstrap'
  | 'stationary-online'
  | 'road-bootstrap'
  | 'logistics-active'
  | 'degraded-local'
  | 'suspended';

export interface SourceHealthRecord {
  lastStructurallyValidTick: number;
  lastServicedTick: number;
  routeRiskScore: number;
  hostilePresenceStreak: number;
  logisticsStarvationStreak: number;
  pendingReplacement: boolean;
  reactivationCooldownUntil: number;
}

export interface RouteThroughputModel {
  expectedPickupPerCycle: number;
  expectedMaintenanceBleedPerCycle: number;
  expectedNetDeliveryPerCycle: number;
}

export interface SourceEconomyRecord {
  sourceId: Id<Source>;
  roomName: string;
  classification: SourceClassification;
  state: SourceEconomyState;
  designatedMiningTile: RoomPosition | null;
  containerId: Id<StructureContainer> | null;
  containerPosition: RoomPosition | null;
  roadAnchor: RoomPosition | null;
  logisticsStopId: string | null;
  assignedMinerName: string | null;
  assignedBuilderNames: string[];
  assignedHaulerNames: string[];
  requiredSpawnEnergyCapacity: number;
  health: SourceHealthRecord;
  throughput: RouteThroughputModel;
}

export interface RoomEconomyRecord {
  roomName: string;
  phase: RoomEconomyPhase;
  cachedStructuralEnergyCapacity: number;
  extensionBuildoutComplete: boolean;
  localSourceHardeningComplete: boolean;
  currentCommissioningSourceId: Id<Source> | null;
  lastStructuralReviewTick: number;
  lastRemoteRiskReviewTick: number;
  sourceRecords: Record<string, SourceEconomyRecord>;
}

export const createDefaultSourceHealthRecord = (): SourceHealthRecord => ({
  lastStructurallyValidTick: 0,
  lastServicedTick: 0,
  routeRiskScore: 0,
  hostilePresenceStreak: 0,
  logisticsStarvationStreak: 0,
  pendingReplacement: false,
  reactivationCooldownUntil: 0,
});

export const createDefaultSourceEconomyRecord = (input: {
  sourceId: Id<Source>;
  roomName: string;
  classification: SourceClassification;
}): SourceEconomyRecord => ({
  sourceId: input.sourceId,
  roomName: input.roomName,
  classification: input.classification,
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
  health: createDefaultSourceHealthRecord(),
  throughput: {
    expectedPickupPerCycle: 0,
    expectedMaintenanceBleedPerCycle: 0,
    expectedNetDeliveryPerCycle: 0,
  },
});

export const createDefaultRoomEconomyRecord = (roomName: string): RoomEconomyRecord => ({
  roomName,
  phase: 'bootstrap',
  cachedStructuralEnergyCapacity: 300,
  extensionBuildoutComplete: false,
  localSourceHardeningComplete: false,
  currentCommissioningSourceId: null,
  lastStructuralReviewTick: 0,
  lastRemoteRiskReviewTick: 0,
  sourceRecords: {},
});
```

Then extend `src/model/memory.ts` so room and creep memory can store the new state:

```ts
import type { RoomEconomyRecord } from './roomEconomy';

export interface RoomDomainMemory {
  roomName: string;
  lastSeenTick: number;
  economy: RoomEconomyRecord;
}

declare global {
  interface CreepMemory {
    role?: 'generalist' | 'bootstrapBuilder' | 'stationaryMiner' | 'routeHauler';
    harvesting?: boolean;
    transferTargetId?: Id<StructureExtension | StructureSpawn>;
    assignedSourceId?: Id<Source>;
    assignedRoomName?: string;
  }

  interface RoomMemory {
    workerCount?: number;
  }
}
```

- [ ] **Step 5: Run the new model test and typecheck**

Run:

```powershell
npm run test -- tests/model/roomEconomy.test.ts
npm run typecheck
```

Expected:
- `tests/model/roomEconomy.test.ts` passes
- `npm run typecheck` exits with code `0`

## Task 2: Implement The Pure Commissioning State Machine

**Files:**
- Create: `src/policies/roomEconomyPolicy.ts`
- Create: `tests/policies/roomEconomyPolicy.test.ts`
- Modify: `src/policies/index.ts`

- [ ] **Step 1: Write failing tests for promotion, demotion, and hysteresis**

Create `tests/policies/roomEconomyPolicy.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';

import {
  createDefaultRoomEconomyRecord,
  createDefaultSourceEconomyRecord,
} from '../../src/model/roomEconomy';
import {
  advanceSourceState,
  chooseNextCommissioningSource,
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

    room.sourceRecords['remote-a'].state = 'suspended';
    room.sourceRecords['remote-a'].health.reactivationCooldownUntil = 500;

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

  it('allows a suspended remote back into selection only after cooldown expiry', () => {
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

    room.sourceRecords['remote-a'].state = 'suspended';
    room.sourceRecords['remote-a'].health.reactivationCooldownUntil = 500;

    const nextId = chooseNextCommissioningSource(room, { 'remote-a': 12 }, 501);

    expect(nextId).toBe('remote-a');
  });
});
```

- [ ] **Step 2: Implement `src/policies/roomEconomyPolicy.ts`**

```ts
import type {
  RoomEconomyPhase,
  RoomEconomyRecord,
  SourceEconomyRecord,
} from '../model/roomEconomy';

const REMOTE_SUSPEND_STREAK = 3;
const REMOTE_REACTIVATION_COOLDOWN = 25;
const LOCAL_STARVATION_GRACE = 3;

export interface SourceStateInput {
  tick: number;
  structuralEnergyCapacity: number;
  containerComplete: boolean;
  roadComplete: boolean;
  routeRiskDetected: boolean;
  hostileDetected: boolean;
  logisticsServiced: boolean;
  minerOnPrimeTile: boolean;
}

export const deriveRoomPhase = (input: {
  room: RoomEconomyRecord;
  extensionBuildoutComplete: boolean;
  controllerLevel: number;
  localSourceHardeningComplete: boolean;
}): RoomEconomyPhase => {
  if (!input.extensionBuildoutComplete) {
    return 'bootstrap';
  }

  if (!input.localSourceHardeningComplete) {
    return 'local-source-hardening';
  }

  if (input.controllerLevel >= 3) {
    return 'rcl3-stabilization';
  }

  return 'serialized-remote-expansion';
};

export const advanceSourceState = (
  source: SourceEconomyRecord,
  input: SourceStateInput,
): SourceEconomyRecord => {
  const next: SourceEconomyRecord = {
    ...source,
    health: { ...source.health },
  };

  if (input.structuralEnergyCapacity < source.requiredSpawnEnergyCapacity) {
    next.state = source.classification === 'local' ? 'degraded-local' : 'suspended';
    next.health.reactivationCooldownUntil = input.tick + REMOTE_REACTIVATION_COOLDOWN;
    return next;
  }

  if (input.hostileDetected || input.routeRiskDetected) {
    next.health.hostilePresenceStreak += 1;
    next.health.routeRiskScore += 1;
  } else {
    next.health.hostilePresenceStreak = 0;
    next.health.routeRiskScore = Math.max(0, next.health.routeRiskScore - 1);
  }

  next.health.logisticsStarvationStreak = input.logisticsServiced
    ? 0
    : next.health.logisticsStarvationStreak + 1;

  if (source.classification === 'remote' && next.health.hostilePresenceStreak >= REMOTE_SUSPEND_STREAK) {
    next.state = 'suspended';
    next.health.reactivationCooldownUntil = input.tick + REMOTE_REACTIVATION_COOLDOWN;
    return next;
  }

  if (source.classification === 'local' && next.health.logisticsStarvationStreak > LOCAL_STARVATION_GRACE) {
    next.state = 'degraded-local';
    return next;
  }

  if (source.state === 'container-bootstrap' && input.containerComplete && input.minerOnPrimeTile) {
    next.state = 'stationary-online';
  }

  if (next.state === 'stationary-online' && input.roadComplete) {
    next.state = 'logistics-active';
  }

  next.health.lastStructurallyValidTick = input.tick;
  if (input.logisticsServiced) {
    next.health.lastServicedTick = input.tick;
  }

  return next;
};

export const chooseNextCommissioningSource = (
  room: RoomEconomyRecord,
  pathDistanceBySourceId: Record<string, number>,
  tick: number,
): Id<Source> | null => {
  if (room.currentCommissioningSourceId) {
    return room.currentCommissioningSourceId;
  }

  const candidates = Object.values(room.sourceRecords).filter((source) => {
    return (
      source.state === 'bootstrap-candidate' ||
      (source.state === 'suspended' && tick > source.health.reactivationCooldownUntil)
    );
  });

  candidates.sort((left, right) => {
    return (pathDistanceBySourceId[left.sourceId] ?? Number.MAX_SAFE_INTEGER) -
      (pathDistanceBySourceId[right.sourceId] ?? Number.MAX_SAFE_INTEGER);
  });

  return candidates[0]?.sourceId ?? null;
};
```

- [ ] **Step 3: Re-export the new policy file**

Update `src/policies/index.ts` to:

```ts
export * from './roomEconomyPolicy';
```

- [ ] **Step 4: Run policy tests and the full test suite**

Run:

```powershell
npm run test -- tests/policies/roomEconomyPolicy.test.ts
npm run test
```

Expected:
- the policy test passes
- the suite still passes end to end

## Task 3: Build Cheap Room Snapshots And Structural Invalidators

**Files:**
- Create: `src/domain/roomEconomy.ts`
- Create: `tests/domain/roomEconomy.test.ts`
- Modify: `src/domain/index.ts`

- [ ] **Step 1: Write failing snapshot tests**

Create `tests/domain/roomEconomy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  detectStructuralEnvelopeChange,
  summarizeRoomEconomySnapshot,
} from '../../src/domain/roomEconomy';

describe('room economy domain', () => {
  it('detects structural envelope changes from cached energy capacity', () => {
    expect(detectStructuralEnvelopeChange(550, 300)).toBe(true);
    expect(detectStructuralEnvelopeChange(550, 550)).toBe(false);
  });

  it('marks the extension buildout complete only when five extensions exist at rcl2', () => {
    const snapshot = summarizeRoomEconomySnapshot({
      roomName: 'W1N1',
      controllerLevel: 2,
      energyAvailable: 300,
      energyCapacityAvailable: 550,
      extensionCount: 5,
      localSourceIds: ['a', 'b'],
      remoteSourceIds: ['c'],
      hostileCount: 0,
    });

    expect(snapshot.extensionBuildoutComplete).toBe(true);
    expect(snapshot.controllerLevel).toBe(2);
  });
});
```

- [ ] **Step 2: Implement `src/domain/roomEconomy.ts`**

```ts
export interface RoomEconomySnapshot {
  roomName: string;
  controllerLevel: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  extensionBuildoutComplete: boolean;
  hostileCount: number;
  localSourceIds: string[];
  remoteSourceIds: string[];
}

export const detectStructuralEnvelopeChange = (
  previousCapacity: number,
  currentCapacity: number,
): boolean => {
  return previousCapacity !== currentCapacity;
};

export const summarizeRoomEconomySnapshot = (input: {
  roomName: string;
  controllerLevel: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  extensionCount: number;
  localSourceIds: string[];
  remoteSourceIds: string[];
  hostileCount: number;
}): RoomEconomySnapshot => ({
  roomName: input.roomName,
  controllerLevel: input.controllerLevel,
  energyAvailable: input.energyAvailable,
  energyCapacityAvailable: input.energyCapacityAvailable,
  extensionBuildoutComplete:
    input.controllerLevel >= 2 && input.energyCapacityAvailable >= 550 && input.extensionCount >= 5,
  hostileCount: input.hostileCount,
  localSourceIds: input.localSourceIds,
  remoteSourceIds: input.remoteSourceIds,
});
```

- [ ] **Step 3: Re-export domain helpers and run tests**

Update `src/domain/index.ts` to:

```ts
export * from './roomEconomy';
```

Run:

```powershell
npm run test -- tests/domain/roomEconomy.test.ts
npm run typecheck
```

Expected:
- snapshot tests pass
- typecheck still passes

## Task 4: Refactor The Room Process Into Economy Orchestration

**Files:**
- Modify: `src/processes/workerRoomProcess.ts`
- Modify: `src/processes/index.ts`
- Modify: `src/model/memory.ts`

- [ ] **Step 1: Replace the process body with room-economy orchestration**

Update `src/processes/workerRoomProcess.ts` so it stops acting like a generic worker loop and instead becomes the room-economy process. Use the following structure inside the file:

```ts
import type { KernelProcess, ProcessStatus } from '@kernel/process';
import {
  summarizeRoomEconomySnapshot,
  detectStructuralEnvelopeChange,
} from '@domain/roomEconomy';
import {
  advanceSourceState,
  chooseNextCommissioningSource,
  deriveRoomPhase,
} from '@policies/roomEconomyPolicy';
import {
  createDefaultRoomEconomyRecord,
  createDefaultSourceEconomyRecord,
} from '@model/roomEconomy';
import { runBuild } from '@tasks/build';
import { runHarvest } from '@tasks/harvest';
import { runRepair } from '@tasks/repair';
import { runTransfer } from '@tasks/transfer';
import { runWithdraw } from '@tasks/withdraw';

const ensureRoomEconomyMemory = (room: Room): void => {
  const existing = Memory.imperium.rooms[room.name];

  if (!existing?.economy) {
    Memory.imperium.rooms[room.name] = {
      roomName: room.name,
      lastSeenTick: Game.time,
      economy: createDefaultRoomEconomyRecord(room.name),
    };
  }
};

export const createWorkerRoomProcess = (roomName: string): KernelProcess => ({
  id: `process.room.economy.${roomName}`,
  label: `RoomEconomyProcess(${roomName})`,
  priority: 10,
  run(): ProcessStatus {
    const room = Game.rooms[roomName];

    if (!room?.controller?.my) {
      return 'suspended';
    }

    ensureRoomEconomyMemory(room);

    const roomMemory = Memory.imperium.rooms[room.name];
    const economy = roomMemory.economy;
    const structuralChanged = detectStructuralEnvelopeChange(
      economy.cachedStructuralEnergyCapacity,
      room.energyCapacityAvailable,
    );
    const shouldRunStructuralReview =
      structuralChanged || Game.time - economy.lastStructuralReviewTick >= 10;

    const snapshot = summarizeRoomEconomySnapshot({
      roomName: room.name,
      controllerLevel: room.controller.level,
      energyAvailable: room.energyAvailable,
      energyCapacityAvailable: room.energyCapacityAvailable,
      extensionCount: shouldRunStructuralReview
        ? room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_EXTENSION,
          }).length
        : economy.extensionBuildoutComplete
          ? 5
          : 0,
      localSourceIds: room.find(FIND_SOURCES).map((source) => source.id),
      remoteSourceIds: [],
      hostileCount: room.find(FIND_HOSTILE_CREEPS).length,
    });

    economy.phase = deriveRoomPhase({
      room: economy,
      extensionBuildoutComplete: snapshot.extensionBuildoutComplete,
      controllerLevel: snapshot.controllerLevel,
      localSourceHardeningComplete: economy.localSourceHardeningComplete,
    });

    if (shouldRunStructuralReview) {
      economy.cachedStructuralEnergyCapacity = snapshot.energyCapacityAvailable;
      economy.extensionBuildoutComplete = snapshot.extensionBuildoutComplete;
      economy.lastStructuralReviewTick = Game.time;
    }

    roomMemory.lastSeenTick = Game.time;

    const nextCommissioningSourceId = chooseNextCommissioningSource(economy, {}, Game.time);
    economy.currentCommissioningSourceId = nextCommissioningSourceId;

    // Keep role execution simple in the first implementation.
    // Generalists refill and upgrade, builders build, miners stay pinned, haulers service routes.
    for (const creep of room.find(FIND_MY_CREEPS)) {
      switch (creep.memory.role) {
        case 'bootstrapBuilder':
          if (creep.store[RESOURCE_ENERGY] === 0) {
            runHarvest(creep);
          } else {
            runBuild(creep);
          }
          break;
        case 'stationaryMiner':
          runHarvest(creep);
          break;
        case 'routeHauler':
          if (creep.store[RESOURCE_ENERGY] === 0) {
            runWithdraw(creep);
          } else {
            const transferTarget = runTransfer(creep);

            if (!transferTarget && creep.store[RESOURCE_ENERGY] > 25) {
              runRepair(creep);
            }
          }
          break;
        default:
          if (creep.store[RESOURCE_ENERGY] === 0) {
            runHarvest(creep);
          } else {
            runTransfer(creep, {
              onNoTarget: (worker) => {
                if (worker.upgradeController(room.controller!) === ERR_NOT_IN_RANGE) {
                  worker.moveTo(room.controller!);
                }
              },
            });
          }
      }
    }

    return 'completed';
  },
});
```

- [ ] **Step 2: Preserve process discovery while updating descriptors**

Update `src/processes/index.ts` so the descriptor names and labels match the room economy process:

```ts
import type { KernelProcess } from '@kernel/process';

import { createWorkerRoomProcess } from './workerRoomProcess';

export interface ProcessDescriptor {
  name: 'RoomEconomyProcess';
  roomName?: string;
}

export const getProcessDescriptors = (): ProcessDescriptor[] => {
  return Object.values(Game.rooms)
    .filter((room) => room.controller?.my)
    .map((room) => ({
      name: 'RoomEconomyProcess',
      roomName: room.name,
    }));
};

export const getKernelProcesses = (): KernelProcess[] => {
  return getProcessDescriptors()
    .filter((descriptor): descriptor is ProcessDescriptor & { roomName: string } => {
      return descriptor.roomName !== undefined;
    })
    .map((descriptor) => createWorkerRoomProcess(descriptor.roomName));
};
```

- [ ] **Step 3: Run narrow validation for the process refactor**

Run:

```powershell
npm run typecheck
npm run build
```

Expected:
- `npm run typecheck` passes
- `npm run build` emits the Screeps bundle without new compile errors

- [ ] **Step 4: Verify the cooldown gate and hauler delivery order in the resulting code**

Check these exact conditions after implementation:
- `chooseNextCommissioningSource` excludes suspended sources until `tick > source.health.reactivationCooldownUntil`
- route haulers attempt delivery before repairs and only spend energy on repairs when no delivery target exists and enough payload remains

Expected:
- suspended remotes do not thrash back into commissioning before cooldown expiry
- route maintenance cannot preempt steady-state energy delivery

## Task 5: Add The Bootstrap Builder And Route-Hauler Helpers

**Files:**
- Create: `src/tasks/build.ts`
- Create: `src/tasks/withdraw.ts`
- Create: `src/tasks/repair.ts`
- Modify: `src/tasks/index.ts`

- [ ] **Step 1: Create `src/tasks/build.ts`**

```ts
export const runBuild = (
  creep: Creep,
  target?: ConstructionSite<BuildableStructureConstant>,
): ConstructionSite<BuildableStructureConstant> | null => {
  const resolvedTarget =
    target ?? creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);

  if (!resolvedTarget) {
    return null;
  }

  if (creep.build(resolvedTarget) === ERR_NOT_IN_RANGE) {
    creep.moveTo(resolvedTarget);
  }

  return resolvedTarget;
};
```

- [ ] **Step 2: Create `src/tasks/withdraw.ts`**

```ts
export type WithdrawTarget = StructureContainer | StructureStorage | StructureSpawn;

export const runWithdraw = (
  creep: Creep,
  target?: WithdrawTarget,
): WithdrawTarget | null => {
  const resolvedTarget =
    target ??
    creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure): structure is WithdrawTarget => {
        return (
          (structure.structureType === STRUCTURE_CONTAINER ||
            structure.structureType === STRUCTURE_STORAGE ||
            structure.structureType === STRUCTURE_SPAWN) &&
          structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        );
      },
    });

  if (!resolvedTarget) {
    return null;
  }

  if (creep.withdraw(resolvedTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    creep.moveTo(resolvedTarget);
  }

  return resolvedTarget;
};
```

- [ ] **Step 3: Create `src/tasks/repair.ts` and export the helpers**

`src/tasks/repair.ts`:

```ts
export const runRepair = (
  creep: Creep,
  target?: StructureRoad | StructureContainer,
): StructureRoad | StructureContainer | null => {
  const resolvedTarget =
    target ??
    creep.pos.findClosestByRange(FIND_STRUCTURES, {
      filter: (structure): structure is StructureRoad | StructureContainer => {
        return (
          (structure.structureType === STRUCTURE_ROAD ||
            structure.structureType === STRUCTURE_CONTAINER) &&
          structure.hits < structure.hitsMax
        );
      },
    });

  if (!resolvedTarget) {
    return null;
  }

  if (creep.repair(resolvedTarget) === ERR_NOT_IN_RANGE) {
    creep.moveTo(resolvedTarget);
  }

  return resolvedTarget;
};
```

`src/tasks/index.ts`:

```ts
export * from './build';
export * from './harvest';
export * from './repair';
export * from './transfer';
export * from './withdraw';
```

- [ ] **Step 4: Run final project validation**

Run:

```powershell
npm run test
npm run typecheck
npm run build
npm run lint
```

Expected:
- unit tests pass
- typecheck passes
- build succeeds
- lint passes without new violations

## Task 6: Scenario Validation And Review Notes

**Files:**
- No additional file changes required unless validation exposes defects

- [ ] **Step 1: Manually verify the approved scenarios against the implementation**

Check these scenarios in order:
- RCL 1 to RCL 2 bootstrap keeps the room in `bootstrap` until five extensions are complete
- local source records reach `logistics-active` before any remote source is selected
- structural capacity collapse from 550 to 300 demotes local source plans to `degraded-local`
- a single hostile scout tick increments remote risk without immediate suspension
- repeated hostile ticks suspend a remote and set a reactivation cooldown
- route-hauler throughput math uses net delivery after maintenance bleed

Expected:
- Each scenario maps to a test or a plainly inspectable code path in `src/policies/roomEconomyPolicy.ts` or `src/processes/workerRoomProcess.ts`

- [ ] **Step 2: Inspect the final diff scope**

Run:

```powershell
git status --short
git diff -- src/model src/domain src/policies src/processes src/tasks package.json vitest.config.ts tests
```

Expected:
- the diff stays focused on room-economy commissioning
- no unrelated architectural layers are changed

- [ ] **Step 3: Do not commit unless the user explicitly requests it**

Expected:
- the work remains uncommitted after validation

## Self-Review Checklist

- The plan introduces the smallest new test harness needed for TDD on pure policy and domain logic.
- Source truth remains in room-scoped model records instead of creep-local heuristics.
- Structural invalidation uses cached scalar diffs, not expensive pseudo-events.
- Remote commissioning remains serialized by default.
- The room process changes stay inside the existing scaffold instead of inventing a new scheduler.
- Validation covers tests, typecheck, build, and lint.
- The plan does not require a commit unless the user explicitly asks for one.