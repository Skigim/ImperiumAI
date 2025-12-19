# Testing Guide for ImperiumAI

This project uses **Jest** with **screeps-jest** for unit testing the Screeps AI bot.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Testing Stack

### screeps-jest

[screeps-jest](https://github.com/eduter/screeps-jest) provides:
- **Screeps constants** (OK, ERR_*, FIND_*, STRUCTURE_*, etc.) available globally
- **lodash** (`_`) available globally
- **Mock utilities** for creating test doubles of game objects
- **RoomPosition** constructor already mocked

### Test Environment

The test environment automatically:
1. Sets up all Screeps constants
2. Mocks the `RoomPosition` constructor
3. Stubs game object prototypes
4. Resets `Game` and `Memory` mocks before each test (via `test/setup.ts`)

## Writing Tests

### Basic Test Structure

```typescript
import { mockGlobal, mockInstanceOf, mockStructure } from 'screeps-jest';

describe('MyModule', () => {
  beforeEach(() => {
    // Game and Memory are automatically reset - see test/setup.ts
  });

  it('should do something', () => {
    // Your test here
  });
});
```

### Mocking Game Objects

Use the helpers from `test/utils.ts`:

```typescript
import { mockRoom, mockCreep, mockSpawn, mockSource } from '../utils';

// Create a mock room with RCL 3 and 550 energy
const room = mockRoom('W1N1', {
  rcl: 3,
  energyAvailable: 550,
  energyCapacity: 550,
});

// Create a mock creep
const creep = mockCreep('harvester1', {
  body: [WORK, WORK, CARRY, MOVE],
  room: room,
  memory: { role: 'harvester' },
});

// Create a mock spawn
const spawn = mockSpawn('Spawn1', {
  room: room,
  energy: 300,
});

// Create a mock source
const source = mockSource('source1', {
  pos: { x: 10, y: 10, roomName: 'W1N1' },
  energy: 3000,
});
```

### Mocking Terrain

```typescript
import { mockTerrain } from '../utils';

// Create terrain with specific walls and swamps
const terrain = mockTerrain(
  [[10, 10], [10, 11], [10, 12]],  // Wall positions
  [[5, 5], [6, 6]]                  // Swamp positions
);

const room = mockRoom('W1N1', { terrain });
```

### Using screeps-jest Mocking Directly

```typescript
import { mockGlobal, mockInstanceOf, mockStructure } from 'screeps-jest';

// Mock the global Game object
mockGlobal<Game>('Game', {
  time: 12345,
  cpu: {
    bucket: 9500,
    getUsed: () => 5.5,
  },
});

// Mock any object instance
const creep = mockInstanceOf<Creep>({
  fatigue: 0,
  hits: 100,
  moveTo: () => OK,
});

// Mock a structure with auto-generated ID
const tower = mockStructure(STRUCTURE_TOWER, {
  hits: 3000,
  hitsMax: 3000,
  attack: () => OK,
});
```

### Testing Process Classes

```typescript
import { Kernel } from '../../src/kernel/Kernel';
import { MyProcess } from '../../src/processes/MyProcess';

describe('MyProcess', () => {
  let kernel: Kernel;

  beforeEach(() => {
    kernel = new Kernel();
    // Set up required game state...
  });

  it('should register with kernel', () => {
    const process = new MyProcess('W1N1');
    kernel.register(process);
    
    expect(kernel.processCount).toBe(1);
  });

  it('should execute correctly', () => {
    const process = new MyProcess('W1N1');
    const result = process.run();
    
    expect(result.success).toBe(true);
  });
});
```

## Test File Organization

```
test/
├── setup.ts           # Global test setup, runs before all tests
├── utils.ts           # Mock factories and helper functions
├── kernel/
│   └── Kernel.spec.ts # Kernel unit tests
├── lib/
│   ├── bodyBuilder.spec.ts
│   └── miningPositions.spec.ts
├── processes/
│   └── ...            # Process tests
└── integration/
    └── ...            # Integration tests
```

## Best Practices

### 1. Test Isolation

Each test should be independent. The `beforeEach` in `test/setup.ts` resets mocks automatically.

### 2. Mock Only What You Need

The `mockInstanceOf` function throws an error if you access unmocked properties (by default). This helps catch missing mocks:

```typescript
const creep = mockInstanceOf<Creep>({
  hits: 100,
});

// This throws: "Unexpected access to unmocked property 'hitsMax'"
console.log(creep.hitsMax);
```

If you need undefined access to be allowed:

```typescript
const creep = mockInstanceOf<Creep>({ hits: 100 }, true); // Allow undefined access
```

### 3. Test Pure Functions First

Functions like `buildRemoteWorkerBody` that don't depend on game state are easiest to test. Start with these.

### 4. Use Jest Spies for Actions

```typescript
const creep = mockCreep('worker1');
// creep.moveTo, creep.harvest, etc. are already jest.fn()

yourFunction(creep);

expect(creep.moveTo).toHaveBeenCalledWith(expect.anything());
```

### 5. Test Edge Cases

- Empty rooms
- No energy available
- CPU budget exhausted
- All positions taken
- Invalid game objects

## Coverage

Run `npm run test:coverage` to generate a coverage report in the `coverage/` directory.

## Troubleshooting

### "Game is not defined" / "Memory is not defined"

The test environment should set these up. If you see this error:
1. Ensure `testEnvironment: "screeps-jest"` is in `jest.config.js`
2. Check that `test/setup.ts` is listed in `setupFilesAfterEnv`

### Tests Hang or Timeout

- Increase timeout: `jest.setTimeout(10000)` or in config
- Check for infinite loops in your code
- Ensure mocks return appropriate values

### Mock Not Working

- Verify you're mocking the right property path
- Use `allowUndefinedAccess: true` for debugging
- Check mock is created before the code under test runs
