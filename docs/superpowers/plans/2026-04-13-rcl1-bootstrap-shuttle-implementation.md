# RCL1 Bootstrap Shuttle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the bootstrap shuttle economy described in the RCL1 bootstrap shuttle spec, from capped RCL1 shuttle mining through RCL2 extension buildout, exit charge, and the first stationary-miner transition.

**Architecture:** Keep bootstrap behavior inside the room-economy architecture already present in the repo. Add explicit bootstrap state and contracts to the room economy model, derive bootstrap phases and decisions in `src/policies/roomEconomyPolicy.ts`, expose cheap structural predicates from `src/domain/roomEconomy.ts`, and let `src/processes/workerRoomProcess.ts` orchestrate room facts, cleanup, spawning, construction intent, logistics matching, and creep execution.

**Tech Stack:** TypeScript, Screeps runtime globals, Vitest, existing npm validation commands (`test`, `typecheck`, `typecheck:tests`, `build`, `lint`).

---

## File Structure

- `src/model/roomEconomy.ts`
  - Extend the room economy contracts with bootstrap phases, assignment classes, slot claims, fetch requests, reroute records, and bootstrap substate.

- `src/model/memory.ts`
  - Normalize the new bootstrap room-economy fields and extend creep memory with bootstrap assignment metadata used at runtime.

- `src/domain/roomEconomy.ts`
  - Add explicit structural and charge predicates for the bootstrap envelope and a small bootstrap snapshot helper for pure policy decisions.

- `src/policies/roomEconomyPolicy.ts`
  - Add the bootstrap phase enum and pure helpers for phase derivation, least-staffed source selection, spawn classification, replacement demand, and reroute cleanup decisions.

- `src/processes/workerRoomProcess.ts`
  - Add bootstrap cleanup, spatial cache refresh, single-site extension intent, spawn planning, logistics matching, and phase-specific worker execution.

- `tests/model/memory.test.ts`
  - Extend normalization coverage for bootstrap state, source slot maps, fetch requests, and reroutes.

- `tests/domain/roomEconomy.test.ts`
  - Add pure structural tests for exit-charge readiness and the RCL2 buildout predicates.

- `tests/policies/roomEconomyPolicy.test.ts`
  - Add policy coverage for bootstrap phase selection, least-staffed source selection, slot-aware spawn classification, and dead-reroute cleanup decisions.

- `tests/processes/workerRoomProcess.test.ts`
  - Add orchestration coverage for slot claims, one-at-a-time extension sites, overflow reroutes, dead-rerouted-shuttle cleanup, replacement demand, and stationary-transition behavior.

## Execution Phases

Keep this as one implementation document, but execute it in four explicit review phases. Do not batch across phases without a checkpoint review.

### Phase 1: Contracts And Memory Hygiene

Scope:
- `src/model/roomEconomy.ts`
- `src/model/memory.ts`
- `tests/model/memory.test.ts`

Exit criteria:
- bootstrap state exists in the room economy model
- normalization is stable for missing and malformed bootstrap fields
- cleanup-sensitive dictionaries are explicitly bounded by test coverage and by later process cleanup work

Review focus:
- memory shape correctness
- default values
- parse-time bloat risk from stale records

### Phase 2: Pure Domain And Policy Decisions

Scope:
- `src/domain/roomEconomy.ts`
- `src/policies/roomEconomyPolicy.ts`
- `tests/domain/roomEconomy.test.ts`
- `tests/policies/roomEconomyPolicy.test.ts`

Exit criteria:
- bootstrap phase derivation is pure and deterministic
- least-staffed source selection has a deterministic tie-breaker
- exit-charge readiness is distinct from five-extension build completion

Review focus:
- deterministic source selection
- replacement-demand semantics
- no process or memory mutation in policy helpers

### Phase 3: Room Process Orchestration

Scope:
- `src/processes/workerRoomProcess.ts`
- `tests/processes/workerRoomProcess.test.ts`

Exit criteria:
- dead-creep cleanup releases slot claims and reroutes correctly
- extension-site creation is serialized and debounced
- spawn reservation behavior is correct before worker execution details are expanded

Review focus:
- cleanup completeness
- construction-site placement idempotence across ticks
- no create-construction-site spam when room state lags by a tick

### Phase 4: Worker And Logistics Runtime Behavior

Scope:
- `src/processes/workerRoomProcess.ts`
- `tests/processes/workerRoomProcess.test.ts`

Exit criteria:
- rerouted shuttles preempt normal spawn delivery immediately
- overflow fetch matching works and is recoverable after shuttle death
- stationary-transition builders tolerate dropped-energy contention and retry cleanly

Review focus:
- reroute preemption over normal delivery
- dropped-resource race tolerance
- direct-build fallback when no fetch request is active

## Review Checkpoints

Pause for review after completing each phase.

- Checkpoint A: after Task 1
- Checkpoint B: after Task 3
- Checkpoint C: after Task 5
- Checkpoint D: after Task 7

After Checkpoint A, Task 2 and Task 3 may be executed in parallel because they touch separate production files and separate test files. Do not start either task before Phase 1 is complete, and merge both back before starting Phase 3.

## Phase 1: Contracts And Memory Hygiene

### Task 1: Extend The Room Economy Model And Memory Schema

**Files:**
- Modify: `src/model/roomEconomy.ts`
- Modify: `src/model/memory.ts`
- Modify: `tests/model/memory.test.ts`

- [ ] **Step 1: Write the failing memory-normalization test for bootstrap state**

Add this test near the existing normalization coverage in `tests/model/memory.test.ts`:

```ts
it('normalizes bootstrap room economy state, slot claims, and fetch routing records', () => {
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
        scheduler: { lastRunCpu: 3 },
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
              sourceSlots: {
                sourceA: {
                  '10,20': {
                    occupantCreepName: 'shuttle-1',
                    claimState: 'occupied',
                  },
                  '11,20': 'invalid',
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
              },
            },
          },
        },
      },
      intel: {},
    },
  });

  initializeMemory();

  expect(Memory.imperium.rooms.W1N1.economy.bootstrap.phase).toBe('extension-build');
  expect(Memory.imperium.rooms.W1N1.economy.bootstrap.sourceSlots.sourceA['10,20']).toEqual({
    occupantCreepName: 'shuttle-1',
    claimState: 'occupied',
    reservedAtTick: 0,
  });
  expect(Memory.imperium.rooms.W1N1.economy.bootstrap.fetchRequests.hauler_1).toMatchObject({
    creepName: 'hauler-1',
    status: 'matched',
    assignedShuttleName: 'shuttle-1',
  });
});
```

- [ ] **Step 2: Run the focused memory test and verify it fails**

Run:

```bash
npm run test -- tests/model/memory.test.ts
```

Expected:
- `FAIL`
- Type or property errors mentioning missing `bootstrap`, `sourceSlots`, `fetchRequests`, or `reroutes` fields.

- [ ] **Step 3: Add bootstrap contracts to `src/model/roomEconomy.ts`**

Add these types above `RoomEconomyRecord` and wire them into the room record:

```ts
export type BootstrapPhase =
  | 'bootstrap-shuttle'
  | 'extension-build'
  | 'exit-charge'
  | 'stationary-transition'
  | 'complete';

export type BootstrapAssignmentClass =
  | 'shuttle'
  | 'overflow-build-hauler'
  | 'stationary-miner'
  | 'bootstrap-builder';

export type BootstrapDeliveryMode =
  | 'harvest'
  | 'deliver'
  | 'rerouted'
  | 'build'
  | 'charge';

export interface SourceSlotClaim {
  occupantCreepName: string | null;
  claimState: 'open' | 'reserved' | 'occupied';
  reservedAtTick: number;
}

export interface BootstrapAssignmentRecord {
  creepName: string;
  assignmentClass: BootstrapAssignmentClass;
  sourceId: Id<Source> | null;
  slotKey: string | null;
  deliveryMode: BootstrapDeliveryMode;
}

export interface BootstrapFetchRequest {
  creepName: string;
  status: 'pending' | 'matched';
  requestedAtTick: number;
  assignedShuttleName: string | null;
}

export interface BootstrapRerouteRecord {
  shuttleName: string;
  targetHaulerName: string;
  sourceId: Id<Source> | null;
}

export interface BootstrapState {
  phase: BootstrapPhase;
  activeExtensionSiteId: Id<ConstructionSite<BuildableStructureConstant>> | null;
  sourceSlots: Record<string, Record<string, SourceSlotClaim>>;
  assignments: Record<string, BootstrapAssignmentRecord>;
  fetchRequests: Record<string, BootstrapFetchRequest>;
  reroutes: Record<string, BootstrapRerouteRecord>;
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
  bootstrap: BootstrapState;
}

export const createDefaultBootstrapState = (): BootstrapState => ({
  phase: 'bootstrap-shuttle',
  activeExtensionSiteId: null,
  sourceSlots: {},
  assignments: {},
  fetchRequests: {},
  reroutes: {},
});
```

Update `createDefaultRoomEconomyRecord` to include:

```ts
bootstrap: createDefaultBootstrapState(),
```

- [ ] **Step 4: Normalize the new bootstrap fields in `src/model/memory.ts`**

Add the normalization helpers and room record mapping below `normalizeSourceRecords`:

```ts
const BOOTSTRAP_PHASES = new Set<BootstrapState['phase']>([
  'bootstrap-shuttle',
  'extension-build',
  'exit-charge',
  'stationary-transition',
  'complete',
]);

const normalizeSourceSlots = (
  value: unknown,
): BootstrapState['sourceSlots'] => {
  if (!isRecord(value)) {
    return {};
  }

  const next: BootstrapState['sourceSlots'] = {};

  for (const [sourceId, slotMap] of Object.entries(value)) {
    if (!isRecord(slotMap)) {
      continue;
    }

    next[sourceId] = {};

    for (const [slotKey, slotValue] of Object.entries(slotMap)) {
      if (!isRecord(slotValue)) {
        continue;
      }

      next[sourceId][slotKey] = {
        occupantCreepName:
          typeof slotValue.occupantCreepName === 'string'
            ? slotValue.occupantCreepName
            : null,
        claimState:
          slotValue.claimState === 'reserved' ||
          slotValue.claimState === 'occupied'
            ? slotValue.claimState
            : 'open',
        reservedAtTick:
          typeof slotValue.reservedAtTick === 'number'
            ? slotValue.reservedAtTick
            : 0,
      };
    }
  }

  return next;
};

const normalizeBootstrapState = (value: unknown): BootstrapState => {
  const defaults = createDefaultBootstrapState();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    phase: BOOTSTRAP_PHASES.has(value.phase as BootstrapState['phase'])
      ? (value.phase as BootstrapState['phase'])
      : defaults.phase,
    activeExtensionSiteId:
      typeof value.activeExtensionSiteId === 'string'
        ? (value.activeExtensionSiteId as Id<ConstructionSite<BuildableStructureConstant>>)
        : defaults.activeExtensionSiteId,
    sourceSlots: normalizeSourceSlots(value.sourceSlots),
    assignments: normalizeBootstrapAssignments(value.assignments),
    fetchRequests: normalizeBootstrapFetchRequests(value.fetchRequests),
    reroutes: normalizeBootstrapReroutes(value.reroutes),
  };
};
```

Then add this property inside `normalizeRoomEconomyRecord`:

```ts
bootstrap: normalizeBootstrapState(value.bootstrap),
```

Extend the global creep memory declaration with:

```ts
bootstrapAssignmentClass?: BootstrapAssignmentClass;
bootstrapSlotKey?: string;
bootstrapDeliveryMode?: BootstrapDeliveryMode;
bootstrapFetchRequesting?: boolean;
```

While adding these records, keep the bootstrap dictionaries intentionally sparse. The implementation in later phases must delete dead assignments, stale fetch requests, and obsolete reroutes promptly so per-tick memory parse cost does not drift upward.

- [ ] **Step 5: Run the focused memory test and verify it passes**

Run:

```bash
npm run test -- tests/model/memory.test.ts
```

Expected:
- `PASS`
- The existing legacy normalization test still passes.

- [ ] **Step 6: Commit the schema change**

Run:

```bash
git add src/model/roomEconomy.ts src/model/memory.ts tests/model/memory.test.ts
git commit -m "feat: add bootstrap room economy state"
```

Expected:
- A commit that contains only the bootstrap model and normalization work.

## Phase 2: Pure Domain And Policy Decisions

### Task 2: Add Bootstrap Snapshot Helpers In The Domain Layer

**Files:**
- Modify: `src/domain/roomEconomy.ts`
- Modify: `tests/domain/roomEconomy.test.ts`

- [ ] **Step 1: Write the failing domain tests for envelope charge and buildout facts**

Add these tests to `tests/domain/roomEconomy.test.ts`:

```ts
it('distinguishes five built extensions from a fully charged 550-energy envelope', () => {
  expect(
    isBootstrapExitChargeReady({
      controllerLevel: 2,
      extensionCount: 5,
      energyCapacityAvailable: 550,
      energyAvailable: 500,
    }),
  ).toBe(false);

  expect(
    isBootstrapExitChargeReady({
      controllerLevel: 2,
      extensionCount: 5,
      energyCapacityAvailable: 550,
      energyAvailable: 550,
    }),
  ).toBe(true);
});

it('summarizes the bootstrap room snapshot for pure policy helpers', () => {
  expect(
    summarizeBootstrapRoomSnapshot({
      roomName: 'W1N1',
      controllerLevel: 2,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      extensionCount: 3,
      localSourceIds: ['a' as Id<Source>, 'b' as Id<Source>],
      hostileCount: 0,
    }),
  ).toMatchObject({
    roomName: 'W1N1',
    controllerLevel: 2,
    canAffordWcmm: true,
    initialExtensionEnvelopeReady: false,
    exitChargeReady: false,
  });
});
```

- [ ] **Step 2: Run the focused domain test and verify it fails**

Run:

```bash
npm run test -- tests/domain/roomEconomy.test.ts
```

Expected:
- `FAIL`
- Missing export errors for `isBootstrapExitChargeReady` or `summarizeBootstrapRoomSnapshot`.

- [ ] **Step 3: Add the bootstrap domain helpers**

Insert these exports below `isInitialExtensionEnvelopeReady` in `src/domain/roomEconomy.ts`:

```ts
export interface BootstrapRoomSnapshot {
  roomName: string;
  controllerLevel: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  extensionCount: number;
  localSourceIds: readonly Id<Source>[];
  hostileCount: number;
  initialExtensionEnvelopeReady: boolean;
  exitChargeReady: boolean;
  canAffordWcmm: boolean;
}

export const isBootstrapExitChargeReady = (input: {
  controllerLevel: number;
  extensionCount: number;
  energyCapacityAvailable: number;
  energyAvailable: number;
}): boolean => {
  return (
    input.controllerLevel >= 2 &&
    input.extensionCount >= 5 &&
    input.energyCapacityAvailable >= 550 &&
    input.energyAvailable >= 550
  );
};

export const summarizeBootstrapRoomSnapshot = (input: {
  roomName: string;
  controllerLevel: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  extensionCount: number;
  localSourceIds: readonly Id<Source>[];
  hostileCount: number;
}): BootstrapRoomSnapshot => ({
  roomName: input.roomName,
  controllerLevel: input.controllerLevel,
  energyAvailable: input.energyAvailable,
  energyCapacityAvailable: input.energyCapacityAvailable,
  extensionCount: input.extensionCount,
  localSourceIds: [...input.localSourceIds],
  hostileCount: input.hostileCount,
  initialExtensionEnvelopeReady: isInitialExtensionEnvelopeReady({
    controllerLevel: input.controllerLevel,
    energyCapacityAvailable: input.energyCapacityAvailable,
    extensionCount: input.extensionCount,
  }),
  exitChargeReady: isBootstrapExitChargeReady({
    controllerLevel: input.controllerLevel,
    extensionCount: input.extensionCount,
    energyCapacityAvailable: input.energyCapacityAvailable,
    energyAvailable: input.energyAvailable,
  }),
  canAffordWcmm: input.energyAvailable >= 250,
});
```

- [ ] **Step 4: Run the domain test suite and verify it passes**

Run:

```bash
npm run test -- tests/domain/roomEconomy.test.ts
```

Expected:
- `PASS`
- The legacy snapshot tests still pass alongside the new bootstrap helpers.

- [ ] **Step 5: Commit the domain helpers**

Run:

```bash
git add src/domain/roomEconomy.ts tests/domain/roomEconomy.test.ts
git commit -m "feat: add bootstrap room economy domain helpers"
```

Expected:
- A commit containing only domain-level bootstrap predicates and tests.

### Task 3: Add Bootstrap Phase And Planning Policy Helpers

**Files:**
- Modify: `src/policies/roomEconomyPolicy.ts`
- Modify: `tests/policies/roomEconomyPolicy.test.ts`

- [ ] **Step 1: Write the failing policy tests for bootstrap phase, source selection, and replacement demand**

Add these tests to `tests/policies/roomEconomyPolicy.test.ts`:

```ts
it('derives extension-build once the room reaches RCL2 before the exit charge is full', () => {
  expect(
    deriveBootstrapPhase({
      controllerLevel: 2,
      extensionCount: 3,
      energyAvailable: 250,
      energyCapacityAvailable: 550,
      localSourceIds: ['a' as Id<Source>, 'b' as Id<Source>],
      stationaryTransitionComplete: false,
    }),
  ).toBe('extension-build');
});

it('chooses the least-staffed source while counting pending claims', () => {
  expect(
    chooseBootstrapShuttleSource({
      localSourceIds: ['source-a' as Id<Source>, 'source-b' as Id<Source>],
      assignments: {
        one: { creepName: 'one', assignmentClass: 'shuttle', sourceId: 'source-a' as Id<Source>, slotKey: '10,10', deliveryMode: 'deliver' },
      },
      sourceSlots: {
        'source-a': {
          '10,10': { occupantCreepName: 'one', claimState: 'occupied', reservedAtTick: 1 },
        },
        'source-b': {
          '20,20': { occupantCreepName: null, claimState: 'reserved', reservedAtTick: 2 },
          '21,20': { occupantCreepName: null, claimState: 'open', reservedAtTick: 0 },
        },
      },
    }),
  ).toBe('source-a');
});

it('breaks least-staffed source ties deterministically by source id', () => {
  expect(
    chooseBootstrapShuttleSource({
      localSourceIds: ['source-b' as Id<Source>, 'source-a' as Id<Source>],
      assignments: {},
      sourceSlots: {
        'source-a': {
          '10,10': { occupantCreepName: null, claimState: 'open', reservedAtTick: 0 },
        },
        'source-b': {
          '20,20': { occupantCreepName: null, claimState: 'open', reservedAtTick: 0 },
        },
      },
    }),
  ).toBe('source-a');
});

it('treats a dead rerouted shuttle as both a cleared reroute and a replacement demand', () => {
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
    clearedSlotKey: '10,10',
    clearedSourceId: 'source-a',
    affectedHaulerName: 'hauler-1',
    replacementDemand: true,
  });
});
```

- [ ] **Step 2: Run the focused policy tests and verify they fail**

Run:

```bash
npm run test -- tests/policies/roomEconomyPolicy.test.ts
```

Expected:
- `FAIL`
- Missing export errors for `deriveBootstrapPhase`, `chooseBootstrapShuttleSource`, or `deriveBootstrapCleanupEffects`.

- [ ] **Step 3: Add bootstrap policy helpers to `src/policies/roomEconomyPolicy.ts`**

Add the bootstrap enum and pure helpers near the top of the file:

```ts
export type BootstrapPhaseMode = BootstrapState['phase'];

export const deriveBootstrapPhase = (input: {
  controllerLevel: number;
  extensionCount: number;
  energyAvailable: number;
  energyCapacityAvailable: number;
  localSourceIds: readonly Id<Source>[];
  stationaryTransitionComplete: boolean;
}): BootstrapPhaseMode => {
  if (input.stationaryTransitionComplete) {
    return 'complete';
  }

  if (input.controllerLevel < 2) {
    return 'bootstrap-shuttle';
  }

  if (
    input.extensionCount >= 5 &&
    input.energyCapacityAvailable >= 550 &&
    input.energyAvailable >= 550
  ) {
    return 'stationary-transition';
  }

  if (input.extensionCount >= 5 && input.energyCapacityAvailable >= 550) {
    return 'exit-charge';
  }

  return 'extension-build';
};

export const chooseBootstrapShuttleSource = (input: {
  localSourceIds: readonly Id<Source>[];
  assignments: BootstrapState['assignments'];
  sourceSlots: BootstrapState['sourceSlots'];
}): Id<Source> | null => {
  const counts = new Map<Id<Source>, number>();

  for (const sourceId of input.localSourceIds) {
    counts.set(sourceId, 0);
  }

  for (const assignment of Object.values(input.assignments)) {
    if (assignment.assignmentClass !== 'shuttle' || !assignment.sourceId) {
      continue;
    }

    counts.set(assignment.sourceId, (counts.get(assignment.sourceId) ?? 0) + 1);
  }

  for (const [sourceId, slotMap] of Object.entries(input.sourceSlots)) {
    for (const slot of Object.values(slotMap)) {
      if (slot.claimState === 'reserved') {
        counts.set(sourceId as Id<Source>, (counts.get(sourceId as Id<Source>) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return left[1] - right[1];
      }

      return left[0].localeCompare(right[0]);
    })[0]?.[0] ?? null;
};

export const deriveBootstrapCleanupEffects = (input: {
  deadCreepName: string;
  assignments: BootstrapState['assignments'];
  reroutes: BootstrapState['reroutes'];
}): {
  clearedSourceId: Id<Source> | null;
  clearedSlotKey: string | null;
  affectedHaulerName: string | null;
  replacementDemand: boolean;
} => {
  const assignment = input.assignments[input.deadCreepName];
  const reroute = input.reroutes[input.deadCreepName];

  return {
    clearedSourceId: assignment?.sourceId ?? null,
    clearedSlotKey: assignment?.slotKey ?? null,
    affectedHaulerName: reroute?.targetHaulerName ?? null,
    replacementDemand:
      assignment?.assignmentClass === 'shuttle' && assignment.sourceId !== null,
  };
};
```

Keep the tie-break explicit even if source discovery order looks stable in tests. Bootstrap planning should make the same decision every time given the same room state.

Also add a pure spawn-classification helper below those exports:

```ts
export const classifyBootstrapSpawn = (input: {
  phase: BootstrapPhaseMode;
  openSlotCount: number;
}): BootstrapAssignmentClass | null => {
  if (input.phase === 'stationary-transition') {
    return 'stationary-miner';
  }

  if (input.phase === 'bootstrap-shuttle' || input.phase === 'extension-build') {
    return input.openSlotCount > 0 ? 'shuttle' : 'overflow-build-hauler';
  }

  return null;
};
```

- [ ] **Step 4: Run the policy suite and verify it passes**

Run:

```bash
npm run test -- tests/policies/roomEconomyPolicy.test.ts
```

Expected:
- `PASS`
- Existing remote-economy policy tests still pass.

- [ ] **Step 5: Commit the policy helpers**

Run:

```bash
git add src/policies/roomEconomyPolicy.ts tests/policies/roomEconomyPolicy.test.ts
git commit -m "feat: add bootstrap room economy policy"
```

Expected:
- A commit containing pure bootstrap policy logic and tests only.

## Phase 3: Room Process Orchestration

### Task 4: Teach The Worker Room Process To Orchestrate Bootstrap State

**Files:**
- Modify: `src/processes/workerRoomProcess.ts`
- Modify: `tests/processes/workerRoomProcess.test.ts`

- [ ] **Step 1: Write the failing worker-process test for phase updates and single extension intent**

Add this test to `tests/processes/workerRoomProcess.test.ts`:

```ts
it('updates bootstrap phase and creates only one extension site during RCL2 buildout', () => {
  const spawn = {
    id: 'spawn-1',
    spawning: null,
    pos: { x: 25, y: 25, roomName: 'W1N1' },
    store: createEnergyStore(250, 50),
    spawnCreep: vi.fn().mockReturnValue(OK),
  } as unknown as StructureSpawn;

  const room = {
    name: 'W1N1',
    controller: { level: 2, my: true } as StructureController,
    energyAvailable: 250,
    energyCapacityAvailable: 550,
    memory: {},
    createConstructionSite: vi.fn().mockReturnValue(OK),
    find: vi.fn().mockImplementation((findConstant: number) => {
      switch (findConstant) {
        case FIND_MY_STRUCTURES:
          return [spawn];
        case FIND_SOURCES:
          return [{ id: 'source-a', pos: { roomName: 'W1N1', x: 10, y: 10 } }];
        case FIND_CONSTRUCTION_SITES:
          return [];
        case FIND_MY_CREEPS:
          return [];
        case FIND_HOSTILE_CREEPS:
          return [];
        default:
          return [];
      }
    }),
  } as unknown as Room;

  Game.rooms[room.name] = room;

  summarizeRoomEconomySnapshot.mockReturnValue({
    roomName: room.name,
    controllerLevel: 2,
    energyAvailable: 250,
    energyCapacityAvailable: 550,
    initialExtensionEnvelopeReady: false,
    extensionBuildoutComplete: false,
    hostileCount: 0,
    localSourceIds: ['source-a'],
    remoteSourceIds: [],
  });

  createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

  expect(Memory.imperium.rooms[room.name].economy.bootstrap.phase).toBe('extension-build');
  expect(room.createConstructionSite).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Add the failing worker-process test for dead rerouted-shuttle cleanup**

Add this test to `tests/processes/workerRoomProcess.test.ts`:

```ts
it('clears slot claims and unmatched hauler reroutes when a rerouted shuttle dies', () => {
  const roomName = 'W1N1';

  Memory.imperium.rooms[roomName] = {
    roomName,
    lastSeenTick: Game.time - 1,
    economy: {
      ...createDefaultRoomEconomyRecord(roomName),
      bootstrap: {
        ...createDefaultRoomEconomyRecord(roomName).bootstrap,
        sourceSlots: {
          'source-a': {
            '10,10': {
              occupantCreepName: 'shuttle-1',
              claimState: 'occupied',
              reservedAtTick: Game.time - 5,
            },
          },
        },
        assignments: {
          'shuttle-1': {
            creepName: 'shuttle-1',
            assignmentClass: 'shuttle',
            sourceId: 'source-a' as Id<Source>,
            slotKey: '10,10',
            deliveryMode: 'rerouted',
          },
          'hauler-1': {
            creepName: 'hauler-1',
            assignmentClass: 'overflow-build-hauler',
            sourceId: null,
            slotKey: null,
            deliveryMode: 'build',
          },
        },
        fetchRequests: {
          'hauler-1': {
            creepName: 'hauler-1',
            status: 'matched',
            requestedAtTick: Game.time - 2,
            assignedShuttleName: 'shuttle-1',
          },
        },
        reroutes: {
          'shuttle-1': {
            shuttleName: 'shuttle-1',
            targetHaulerName: 'hauler-1',
            sourceId: 'source-a' as Id<Source>,
          },
        },
      },
    },
  };

  const room = {
    name: roomName,
    controller: { level: 2, my: true } as StructureController,
    energyAvailable: 250,
    energyCapacityAvailable: 550,
    memory: {},
    find: vi.fn().mockImplementation((findConstant: number) => {
      switch (findConstant) {
        case FIND_MY_CREEPS:
          return [];
        case FIND_SOURCES:
          return [{ id: 'source-a', pos: { roomName, x: 10, y: 10 } }];
        case FIND_HOSTILE_CREEPS:
          return [];
        case FIND_MY_STRUCTURES:
          return [];
        default:
          return [];
      }
    }),
  } as unknown as Room;

  Game.rooms[roomName] = room;

  createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

  expect(
    Memory.imperium.rooms[roomName].economy.bootstrap.sourceSlots['source-a']['10,10'].claimState,
  ).toBe('open');
  expect(Memory.imperium.rooms[roomName].economy.bootstrap.reroutes['shuttle-1']).toBeUndefined();
  expect(Memory.imperium.rooms[roomName].economy.bootstrap.fetchRequests['hauler-1']).toMatchObject({
    status: 'pending',
    assignedShuttleName: null,
  });
});
```

- [ ] **Step 3: Run the worker-process suite and verify the new tests fail**

Run:

```bash
npm run test -- tests/processes/workerRoomProcess.test.ts
```

Expected:
- `FAIL`
- Assertions failing on bootstrap phase, construction-site count, or reroute cleanup.

- [ ] **Step 4: Add bootstrap helpers inside `src/processes/workerRoomProcess.ts`**

Add these focused local helpers above `createWorkerRoomProcess`:

```ts
const ensureBootstrapSourceSlots = (
  roomMemory: RoomDomainMemory,
  localSources: readonly Source[],
): void => {
  for (const source of localSources) {
    roomMemory.economy.bootstrap.sourceSlots[source.id] ??= {};
  }
};

const cleanupDeadBootstrapAssignments = (
  roomMemory: RoomDomainMemory,
  liveCreepNames: Set<string>,
): void => {
  for (const [creepName, assignment] of Object.entries(roomMemory.economy.bootstrap.assignments)) {
    if (liveCreepNames.has(creepName)) {
      continue;
    }

    const cleanup = deriveBootstrapCleanupEffects({
      deadCreepName: creepName,
      assignments: roomMemory.economy.bootstrap.assignments,
      reroutes: roomMemory.economy.bootstrap.reroutes,
    });

    if (cleanup.clearedSourceId && cleanup.clearedSlotKey) {
      const slot = roomMemory.economy.bootstrap.sourceSlots[cleanup.clearedSourceId]?.[cleanup.clearedSlotKey];

      if (slot) {
        slot.occupantCreepName = null;
        slot.claimState = 'open';
        slot.reservedAtTick = 0;
      }
    }

    if (cleanup.affectedHaulerName) {
      const request = roomMemory.economy.bootstrap.fetchRequests[cleanup.affectedHaulerName];

      if (request) {
        request.status = 'pending';
        request.assignedShuttleName = null;
      }
    }

    delete roomMemory.economy.bootstrap.reroutes[creepName];
    delete roomMemory.economy.bootstrap.assignments[creepName];
  }
};

const ensureSingleBootstrapExtensionSite = (room: Room, roomMemory: RoomDomainMemory): void => {
  if (roomMemory.economy.bootstrap.phase !== 'extension-build') {
    return;
  }

  const existingExtensionSites = getConstructionSites(room).filter((site) => {
    return site.structureType === STRUCTURE_EXTENSION;
  });

  if (existingExtensionSites.length > 0) {
    roomMemory.economy.bootstrap.activeExtensionSiteId = existingExtensionSites[0]?.id ?? null;
    return;
  }

  if (roomMemory.economy.bootstrap.lastExtensionPlacementTick === Game.time) {
    return;
  }

  const spawn = getOwnedSpawns(room)[0];

  if (!spawn) {
    return;
  }

  placeLayoutSites(room, spawn.pos, INITIAL_EXTENSION_LAYOUT, STRUCTURE_EXTENSION, 1);
  roomMemory.economy.bootstrap.lastExtensionPlacementTick = Game.time;
};
```

Add `lastExtensionPlacementTick: number` to the bootstrap state model in Task 1 and normalize it in memory so extension placement is debounced across ticks even if Screeps does not surface the new site immediately.

- [ ] **Step 5: Wire the bootstrap orchestration into the room process run loop**

Inside the process `run` function, insert this sequence immediately after room memory and source records are ensured:

```ts
const managedCreeps = getManagedCreeps(room);
const liveCreepNames = new Set(managedCreeps.map((creep) => creep.name));

ensureBootstrapSourceSlots(roomMemory, localSources);
cleanupDeadBootstrapAssignments(roomMemory, liveCreepNames);

roomMemory.economy.bootstrap.phase = deriveBootstrapPhase({
  controllerLevel: snapshot.controllerLevel,
  extensionCount: countExtensions(room),
  energyAvailable: room.energyAvailable,
  energyCapacityAvailable: room.energyCapacityAvailable,
  localSourceIds: snapshot.localSourceIds,
  stationaryTransitionComplete: false,
});

ensureSingleBootstrapExtensionSite(room, roomMemory);
```

- [ ] **Step 6: Run the worker-process suite and verify the new tests pass**

Run:

```bash
npm run test -- tests/processes/workerRoomProcess.test.ts
```

Expected:
- `PASS`
- Existing room-process tests still pass.

- [ ] **Step 7: Commit the orchestration changes**

Run:

```bash
git add src/processes/workerRoomProcess.ts tests/processes/workerRoomProcess.test.ts
git commit -m "feat: orchestrate bootstrap room economy state"
```

Expected:
- A commit containing bootstrap orchestration, cleanup, and single-site extension management.

### Task 5: Add Spawn Planning, Logistics Matching, And Bootstrap Worker Dispatch

**Files:**
- Modify: `src/processes/workerRoomProcess.ts`
- Modify: `tests/processes/workerRoomProcess.test.ts`

- [ ] **Step 1: Write the failing worker-process tests for shuttle replacement demand and overflow reroutes**

Add these tests to `tests/processes/workerRoomProcess.test.ts`:

```ts
it('requests a replacement shuttle when cleanup reopens a claimed source slot', () => {
  const spawn = {
    id: 'spawn-1',
    name: 'Spawn1',
    spawning: null,
    store: createEnergyStore(250, 50),
    pos: { x: 25, y: 25, roomName: 'W1N1' },
    spawnCreep: vi.fn().mockReturnValue(OK),
  } as unknown as StructureSpawn;

  const roomName = 'W1N1';
  const room = {
    name: roomName,
    controller: { level: 2, my: true } as StructureController,
    energyAvailable: 250,
    energyCapacityAvailable: 550,
    memory: {},
    find: vi.fn().mockImplementation((findConstant: number) => {
      switch (findConstant) {
        case FIND_MY_STRUCTURES:
          return [spawn];
        case FIND_SOURCES:
          return [{ id: 'source-a', pos: { roomName, x: 10, y: 10 } }];
        case FIND_MY_CREEPS:
          return [];
        case FIND_HOSTILE_CREEPS:
          return [];
        default:
          return [];
      }
    }),
  } as unknown as Room;

  Game.rooms[roomName] = room;
  Memory.imperium.rooms[roomName] = {
    roomName,
    lastSeenTick: Game.time - 1,
    economy: {
      ...createDefaultRoomEconomyRecord(roomName),
      bootstrap: {
        ...createDefaultRoomEconomyRecord(roomName).bootstrap,
        phase: 'extension-build',
        sourceSlots: {
          'source-a': {
            '10,10': { occupantCreepName: null, claimState: 'open', reservedAtTick: 0 },
          },
        },
      },
    },
  };

  createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

  expect(spawn.spawnCreep).toHaveBeenCalled();
});

it('matches the nearest delivery-state shuttle to an empty overflow hauler fetch request', () => {
  const roomName = 'W1N1';
  const shuttle = {
    name: 'shuttle-1',
    memory: { role: 'worker' },
    pos: { getRangeTo: vi.fn().mockReturnValue(3), roomName },
    store: createEnergyStore(50, 0),
  } as unknown as Creep;
  const hauler = {
    name: 'hauler-1',
    memory: { role: 'worker' },
    pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName },
    store: createEnergyStore(0, 50),
  } as unknown as Creep;

  const room = {
    name: roomName,
    controller: { level: 2, my: true } as StructureController,
    energyAvailable: 200,
    energyCapacityAvailable: 550,
    memory: {},
    find: vi.fn().mockImplementation((findConstant: number) => {
      switch (findConstant) {
        case FIND_MY_CREEPS:
          return [shuttle, hauler];
        case FIND_SOURCES:
          return [];
        case FIND_HOSTILE_CREEPS:
          return [];
        case FIND_MY_STRUCTURES:
          return [];
        default:
          return [];
      }
    }),
  } as unknown as Room;

  Game.rooms[roomName] = room;
  Memory.imperium.rooms[roomName] = {
    roomName,
    lastSeenTick: Game.time - 1,
    economy: {
      ...createDefaultRoomEconomyRecord(roomName),
      bootstrap: {
        ...createDefaultRoomEconomyRecord(roomName).bootstrap,
        phase: 'extension-build',
        assignments: {
          'shuttle-1': {
            creepName: 'shuttle-1',
            assignmentClass: 'shuttle',
            sourceId: 'source-a' as Id<Source>,
            slotKey: '10,10',
            deliveryMode: 'deliver',
          },
          'hauler-1': {
            creepName: 'hauler-1',
            assignmentClass: 'overflow-build-hauler',
            sourceId: null,
            slotKey: null,
            deliveryMode: 'build',
          },
        },
        fetchRequests: {
          'hauler-1': {
            creepName: 'hauler-1',
            status: 'pending',
            requestedAtTick: Game.time,
            assignedShuttleName: null,
          },
        },
      },
    },
  };

  createWorkerRoomProcess(roomName).run({ tick: Game.time, cpuUsed: 0 });

  expect(Memory.imperium.rooms[roomName].economy.bootstrap.reroutes['shuttle-1']).toMatchObject({
    targetHaulerName: 'hauler-1',
  });
  expect(Memory.imperium.rooms[roomName].economy.bootstrap.fetchRequests['hauler-1']).toMatchObject({
    status: 'matched',
    assignedShuttleName: 'shuttle-1',
  });
});
```

- [ ] **Step 2: Run the worker-process suite and verify these tests fail**

Run:

```bash
npm run test -- tests/processes/workerRoomProcess.test.ts
```

Expected:
- `FAIL`
- The spawn or reroute assertions fail because no bootstrap planner exists yet.

- [ ] **Step 3: Add bootstrap spawn planning and reroute matching**

Add these local helpers to `src/processes/workerRoomProcess.ts`:

```ts
const countOpenBootstrapSlots = (sourceSlots: BootstrapState['sourceSlots']): number => {
  return Object.values(sourceSlots).reduce((sum, slotMap) => {
    return sum + Object.values(slotMap).filter((slot) => slot.claimState === 'open').length;
  }, 0);
};

const reserveBootstrapSlot = (
  roomMemory: RoomDomainMemory,
  sourceId: Id<Source>,
  creepName: string,
): string | null => {
  const slotMap = roomMemory.economy.bootstrap.sourceSlots[sourceId] ?? {};
  const entry = Object.entries(slotMap).find(([, slot]) => slot.claimState === 'open');

  if (!entry) {
    return null;
  }

  const [slotKey, slot] = entry;
  slot.claimState = 'reserved';
  slot.occupantCreepName = creepName;
  slot.reservedAtTick = Game.time;
  return slotKey;
};

const matchBootstrapFetchRequests = (
  roomMemory: RoomDomainMemory,
  creepsByName: Map<string, Creep>,
): void => {
  for (const request of Object.values(roomMemory.economy.bootstrap.fetchRequests)) {
    if (request.status !== 'pending') {
      continue;
    }

    const hauler = creepsByName.get(request.creepName);

    if (!hauler) {
      continue;
    }

    const shuttleName = Object.values(roomMemory.economy.bootstrap.assignments)
      .filter((assignment) => assignment.assignmentClass === 'shuttle' && assignment.deliveryMode === 'deliver')
      .map((assignment) => assignment.creepName)
      .sort((left, right) => {
        const leftCreep = creepsByName.get(left);
        const rightCreep = creepsByName.get(right);

        return (leftCreep?.pos.getRangeTo(hauler) ?? 99) - (rightCreep?.pos.getRangeTo(hauler) ?? 99);
      })[0];

    if (!shuttleName) {
      continue;
    }

    roomMemory.economy.bootstrap.reroutes[shuttleName] = {
      shuttleName,
      targetHaulerName: request.creepName,
      sourceId: roomMemory.economy.bootstrap.assignments[shuttleName]?.sourceId ?? null,
    };
    request.status = 'matched';
    request.assignedShuttleName = shuttleName;
    roomMemory.economy.bootstrap.assignments[shuttleName].deliveryMode = 'rerouted';
  }
};
```

Then invoke a simple planner inside the run loop after cleanup and before worker execution:

```ts
const creepsByName = new Map(managedCreeps.map((creep) => [creep.name, creep]));
matchBootstrapFetchRequests(roomMemory, creepsByName);

const idleSpawn = getIdleSpawn(room);
const openSlotCount = countOpenBootstrapSlots(roomMemory.economy.bootstrap.sourceSlots);

if (idleSpawn && room.energyAvailable >= 250) {
  const assignmentClass = classifyBootstrapSpawn({
    phase: roomMemory.economy.bootstrap.phase,
    openSlotCount,
  });

  if (assignmentClass === 'shuttle') {
    const sourceId = chooseBootstrapShuttleSource({
      localSourceIds: snapshot.localSourceIds,
      assignments: roomMemory.economy.bootstrap.assignments,
      sourceSlots: roomMemory.economy.bootstrap.sourceSlots,
    });

    if (sourceId) {
      const creepName = `bootstrap-${Game.time}`;
      const slotKey = reserveBootstrapSlot(roomMemory, sourceId, creepName);

      if (slotKey) {
        idleSpawn.spawnCreep(['work', 'carry', 'move', 'move'], creepName, {
          memory: {
            role: 'worker',
            assignedSourceId: sourceId,
            bootstrapAssignmentClass: 'shuttle',
            bootstrapSlotKey: slotKey,
            bootstrapDeliveryMode: 'harvest',
            homeRoomName: room.name,
          },
        });
      }
    }
  }
}
```

- [ ] **Step 4: Run the worker-process suite and verify it passes**

Run:

```bash
npm run test -- tests/processes/workerRoomProcess.test.ts
```

Expected:
- `PASS`
- Replacement demand and fetch reroutes are now covered.

- [ ] **Step 5: Commit the planner and logistics logic**

Run:

```bash
git add src/processes/workerRoomProcess.ts tests/processes/workerRoomProcess.test.ts
git commit -m "feat: add bootstrap spawn planning and reroute matching"
```

Expected:
- A commit containing spawn planning and bootstrap logistics matching.

## Phase 4: Worker And Logistics Runtime Behavior

### Task 6: Add Phase-Specific Worker Execution And Stationary Transition

**Files:**
- Modify: `src/processes/workerRoomProcess.ts`
- Modify: `tests/processes/workerRoomProcess.test.ts`

- [ ] **Step 1: Write the failing worker-process test for shuttle fallback and stationary builder pickup**

Add these tests to `tests/processes/workerRoomProcess.test.ts`:

```ts
it('lets shuttles build directly in extension-build when no overflow fetch request is active', () => {
  const creep = {
    name: 'shuttle-1',
    memory: {
      role: 'worker',
      assignedSourceId: 'source-a' as Id<Source>,
      bootstrapAssignmentClass: 'shuttle',
      bootstrapSlotKey: '10,10',
      bootstrapDeliveryMode: 'deliver',
    },
    store: createEnergyStore(50, 0),
    pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName: 'W1N1' },
    moveTo: vi.fn(),
    transfer: vi.fn(),
    build: vi.fn().mockReturnValue(OK),
  } as unknown as Creep;

  const site = {
    id: 'site-1',
    structureType: STRUCTURE_EXTENSION,
    pos: { roomName: 'W1N1', x: 24, y: 24 },
  } as unknown as ConstructionSite<BuildableStructureConstant>;

  const room = {
    name: 'W1N1',
    controller: { level: 2, my: true } as StructureController,
    energyAvailable: 200,
    energyCapacityAvailable: 550,
    memory: {},
    find: vi.fn().mockImplementation((findConstant: number) => {
      switch (findConstant) {
        case FIND_MY_CREEPS:
          return [creep];
        case FIND_CONSTRUCTION_SITES:
          return [site];
        case FIND_HOSTILE_CREEPS:
          return [];
        default:
          return [];
      }
    }),
  } as unknown as Room;

  Game.rooms[room.name] = room;
  Memory.imperium.rooms[room.name] = {
    roomName: room.name,
    lastSeenTick: Game.time,
    economy: {
      ...createDefaultRoomEconomyRecord(room.name),
      bootstrap: {
        ...createDefaultRoomEconomyRecord(room.name).bootstrap,
        phase: 'extension-build',
        activeExtensionSiteId: site.id,
        assignments: {
          [creep.name]: {
            creepName: creep.name,
            assignmentClass: 'shuttle',
            sourceId: 'source-a' as Id<Source>,
            slotKey: '10,10',
            deliveryMode: 'deliver',
          },
        },
      },
    },
  };

  createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

  expect(creep.build).toHaveBeenCalledWith(site);
});

it('preempts spawn delivery immediately once a shuttle is rerouted to a hauler', () => {
  const shuttle = {
    name: 'shuttle-1',
    memory: { role: 'worker' },
    store: createEnergyStore(50, 0),
    pos: { getRangeTo: vi.fn().mockReturnValue(2), roomName: 'W1N1' },
    moveTo: vi.fn(),
    transfer: vi.fn().mockReturnValue(ERR_NOT_IN_RANGE),
    upgradeController: vi.fn(),
  } as unknown as Creep;
  const hauler = {
    name: 'hauler-1',
    pos: { roomName: 'W1N1', x: 20, y: 20 },
  } as unknown as Creep;

  Game.creeps[hauler.name] = hauler;

  const room = {
    name: 'W1N1',
    controller: { level: 2, my: true } as StructureController,
    energyAvailable: 200,
    energyCapacityAvailable: 550,
    memory: {},
    find: vi.fn().mockImplementation((findConstant: number) => {
      switch (findConstant) {
        case FIND_MY_CREEPS:
          return [shuttle];
        case FIND_CONSTRUCTION_SITES:
          return [];
        case FIND_HOSTILE_CREEPS:
          return [];
        default:
          return [];
      }
    }),
  } as unknown as Room;

  Game.rooms[room.name] = room;
  Memory.imperium.rooms[room.name] = {
    roomName: room.name,
    lastSeenTick: Game.time,
    economy: {
      ...createDefaultRoomEconomyRecord(room.name),
      bootstrap: {
        ...createDefaultRoomEconomyRecord(room.name).bootstrap,
        phase: 'extension-build',
        assignments: {
          [shuttle.name]: {
            creepName: shuttle.name,
            assignmentClass: 'shuttle',
            sourceId: 'source-a' as Id<Source>,
            slotKey: '10,10',
            deliveryMode: 'rerouted',
          },
        },
        reroutes: {
          [shuttle.name]: {
            shuttleName: shuttle.name,
            targetHaulerName: hauler.name,
            sourceId: 'source-a' as Id<Source>,
          },
        },
      },
    },
  };

  createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

  expect(shuttle.transfer).toHaveBeenCalledWith(hauler, RESOURCE_ENERGY);
  expect(shuttle.upgradeController).not.toHaveBeenCalled();
});

it('makes bootstrap builders pick up dropped energy before a source container exists', () => {
  const droppedEnergy = {
    id: 'drop-1',
    amount: 50,
    pos: { roomName: 'W1N1', x: 10, y: 10 },
  } as unknown as Resource<ResourceConstant>;
  const builder = {
    name: 'builder-1',
    memory: {
      role: 'bootstrapBuilder',
      assignedSourceId: 'source-a' as Id<Source>,
      bootstrapAssignmentClass: 'bootstrap-builder',
    },
    store: createEnergyStore(0, 50),
    pos: { getRangeTo: vi.fn().mockReturnValue(1), roomName: 'W1N1' },
    moveTo: vi.fn(),
    pickup: vi.fn().mockReturnValue(OK),
  } as unknown as Creep;

  const room = {
    name: 'W1N1',
    controller: { level: 2, my: true } as StructureController,
    energyAvailable: 100,
    energyCapacityAvailable: 550,
    memory: {},
    find: vi.fn().mockImplementation((findConstant: number) => {
      switch (findConstant) {
        case FIND_MY_CREEPS:
          return [builder];
        case FIND_DROPPED_RESOURCES:
          return [droppedEnergy];
        case FIND_HOSTILE_CREEPS:
          return [];
        default:
          return [];
      }
    }),
  } as unknown as Room;

  Game.rooms[room.name] = room;
  Memory.imperium.rooms[room.name] = {
    roomName: room.name,
    lastSeenTick: Game.time,
    economy: {
      ...createDefaultRoomEconomyRecord(room.name),
      bootstrap: {
        ...createDefaultRoomEconomyRecord(room.name).bootstrap,
        phase: 'stationary-transition',
        assignments: {
          [builder.name]: {
            creepName: builder.name,
            assignmentClass: 'bootstrap-builder',
            sourceId: 'source-a' as Id<Source>,
            slotKey: null,
            deliveryMode: 'build',
          },
        },
      },
    },
  };

  createWorkerRoomProcess(room.name).run({ tick: Game.time, cpuUsed: 0 });

  expect(builder.pickup).toHaveBeenCalledWith(droppedEnergy);
});
```

- [ ] **Step 2: Run the worker-process suite and verify these tests fail**

Run:

```bash
npm run test -- tests/processes/workerRoomProcess.test.ts
```

Expected:
- `FAIL`
- The process still routes workers through the old generalist behavior.

- [ ] **Step 3: Add bootstrap worker dispatch helpers**

Add these local functions to `src/processes/workerRoomProcess.ts`:

```ts
const runBootstrapShuttle = (
  creep: Creep,
  room: Room,
  roomMemory: RoomDomainMemory,
): void => {
  const assignment = roomMemory.economy.bootstrap.assignments[creep.name];

  if (!assignment) {
    return;
  }

  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    assignment.deliveryMode = 'harvest';
    runHarvest(creep);
    return;
  }

  if (roomMemory.economy.bootstrap.phase === 'exit-charge') {
    assignment.deliveryMode = 'charge';
    const target = findTransferTarget(creep);

    if (target) {
      runTransfer(creep, { target });
    }

    return;
  }

  const reroute = roomMemory.economy.bootstrap.reroutes[creep.name];
  if (reroute) {
    assignment.deliveryMode = 'rerouted';
    const hauler = Game.creeps[reroute.targetHaulerName];

    if (hauler) {
      if (creep.transfer(hauler, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(hauler);
      }
      return;
    }
  }

  const activeSite = room.find(FIND_CONSTRUCTION_SITES).find((site) => {
    return site.id === roomMemory.economy.bootstrap.activeExtensionSiteId;
  });

  if (roomMemory.economy.bootstrap.phase === 'extension-build' && activeSite) {
    assignment.deliveryMode = 'build';
    runBuild(creep, { target: activeSite });
    return;
  }

  assignment.deliveryMode = 'deliver';
  const target = findTransferTarget(creep);
  if (target) {
    runTransfer(creep, { target });
  } else if (room.controller) {
    creep.upgradeController(room.controller);
  }
};

const runBootstrapBuilder = (creep: Creep, room: Room): void => {
  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    const dropped = room.find(FIND_DROPPED_RESOURCES).find((resource) => {
      return resource.resourceType === RESOURCE_ENERGY;
    });

    if (dropped) {
      const pickupResult = creep.pickup(dropped);

      if (pickupResult === OK || pickupResult === ERR_NOT_IN_RANGE) {
        return;
      }
    }

    runWithdraw(creep);
    return;
  }

  const site = room.find(FIND_CONSTRUCTION_SITES)[0];

  if (site) {
    runBuild(creep, { target: site });
  }
};
```

Then replace the existing generic per-creep dispatch with:

```ts
for (const creep of managedCreeps) {
  const assignment = roomMemory.economy.bootstrap.assignments[creep.name];

  if (assignment?.assignmentClass === 'shuttle') {
    runBootstrapShuttle(creep, room, roomMemory);
    continue;
  }

  if (assignment?.assignmentClass === 'bootstrap-builder') {
    runBootstrapBuilder(creep, room);
    continue;
  }

  if (assignment?.assignmentClass === 'overflow-build-hauler') {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      roomMemory.economy.bootstrap.fetchRequests[creep.name] ??= {
        creepName: creep.name,
        status: 'pending',
        requestedAtTick: Game.time,
        assignedShuttleName: null,
      };
      continue;
    }

    const activeSite = room.find(FIND_CONSTRUCTION_SITES).find((site) => {
      return site.id === roomMemory.economy.bootstrap.activeExtensionSiteId;
    });

    if (activeSite) {
      runBuild(creep, { target: activeSite });
    }
  }
}
```

Treat dropped-energy contention as normal runtime behavior rather than a special failure. Builders should tolerate a disappearing resource pile and reacquire a target on the next tick without poisoning bootstrap state.

- [ ] **Step 4: Run the worker-process suite and verify it passes**

Run:

```bash
npm run test -- tests/processes/workerRoomProcess.test.ts
```

Expected:
- `PASS`
- Bootstrap worker behavior is now covered for shuttle build fallback and stationary-transition builder pickup.

- [ ] **Step 5: Commit the worker behavior changes**

Run:

```bash
git add src/processes/workerRoomProcess.ts tests/processes/workerRoomProcess.test.ts
git commit -m "feat: add bootstrap worker behavior dispatch"
```

Expected:
- A commit containing phase-specific bootstrap worker execution.

### Task 7: Run Full Validation And Inspect Final Scope

**Files:**
- Validate: `src/model/roomEconomy.ts`
- Validate: `src/model/memory.ts`
- Validate: `src/domain/roomEconomy.ts`
- Validate: `src/policies/roomEconomyPolicy.ts`
- Validate: `src/processes/workerRoomProcess.ts`
- Validate: `tests/model/memory.test.ts`
- Validate: `tests/domain/roomEconomy.test.ts`
- Validate: `tests/policies/roomEconomyPolicy.test.ts`
- Validate: `tests/processes/workerRoomProcess.test.ts`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm run test
```

Expected:
- `PASS`
- No regressions outside the bootstrap coverage.

- [ ] **Step 2: Run TypeScript checks for app and tests**

Run:

```bash
npm run typecheck
npm run typecheck:tests
```

Expected:
- Both commands exit `0`.
- No missing Screeps globals or mismatched bootstrap type definitions.

- [ ] **Step 3: Run the build and lint checks**

Run:

```bash
npm run build
npm run lint
```

Expected:
- Both commands exit `0`.
- The bootstrap process changes do not introduce build or style regressions.

- [ ] **Step 4: Inspect final scope before handoff**

Run:

```bash
git status --short
git diff --stat
```

Expected:
- Only the room economy model, memory, domain, policy, process, and matching test files changed.
- No unrelated kernel or remote-expansion files were modified.

- [ ] **Step 5: Create the final feature commit**

Run:

```bash
git add src/model/roomEconomy.ts src/model/memory.ts src/domain/roomEconomy.ts src/policies/roomEconomyPolicy.ts src/processes/workerRoomProcess.ts tests/model/memory.test.ts tests/domain/roomEconomy.test.ts tests/policies/roomEconomyPolicy.test.ts tests/processes/workerRoomProcess.test.ts
git commit -m "feat: implement bootstrap shuttle room economy"
```

Expected:
- A single final feature commit ready for review.