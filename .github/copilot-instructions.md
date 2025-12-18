# ImperiumAI - AI Coding Agent Instructions

## Project Overview
ImperiumAI is a **Screeps AI bot** - an autonomous AI for the MMO programming game Screeps where you control units through JavaScript. This project aims for self-sufficiency, customizability, and expandability.

## Technology Stack
- **Runtime**: Screeps game engine (JavaScript-based MMO)
- **Language**: TypeScript (strict mode, ES2020 target)
- **Build Tool**: Rollup (bundles to single `dist/main.js` for Screeps)
- **Entry Point**: `src/main.ts` exports `loop()` function called every game tick

## Architecture Patterns

### Kernel-Based OS Design
This project uses a **kernel-based operating system approach** where:
- A central kernel manages process scheduling and resource allocation
- Individual "processes" (creeps, rooms, systems) register with the kernel
- Kernel handles CPU budgeting and prioritization across processes (critical with 20 CPU cap)
- Processes communicate through well-defined interfaces, not direct coupling

### Game Loop Design
- Screeps calls `loop()` function from [src/main.ts](../src/main.ts) every game tick
- Kernel orchestrates all process execution within CPU budget
- State persists in `Memory` global object between ticks (provided by Screeps API)
- Game objects accessed via `Game` global (rooms, creeps, structures, etc.)

### Code Organization (Current)
- Single entry point: [src/main.ts](../src/main.ts) will initialize and run the kernel
- Expected expansion:
  - `kernel/` - Core OS: process scheduler, memory manager, IPC
  - `processes/` - Individual processes (creep roles, room planners, economy)
  - `lib/` - Shared utilities and helper functions

## Development Workflow

### Building
```bash
npm run build
```
- Compiles TypeScript and bundles to `dist/main.js`
- Generates sourcemaps for debugging
- Output file ready to copy/paste into Screeps game client

### Screeps-Specific Constraints
- **CPU Limits**: Deployed on Shard 3 with **20 CPU hard cap** - extreme optimization required
- **Memory Limits**: Total Memory object size limited (typically 2MB)
- **No External Dependencies**: Only Screeps API available at runtime (no Node.js APIs)
- **No Async/Await**: Game is tick-based, not async - all operations synchronous

## Key Screeps Concepts

### Global Objects (provided by Screeps engine)
- `Game`: Access to all game objects (creeps, rooms, structures)
- `Memory`: Persistent storage between ticks (serialized JSON)
- `RawMemory`: Low-level memory access for performance optimization

### Common Patterns
- **Creep Roles**: Assign roles (harvester, builder, upgrader) via `Memory.creeps[name].role`
- **Room Management**: Iterate `Game.rooms` to manage owned/visible rooms
- **State Machines**: Use Memory to track multi-tick operations (pathfinding, construction)
- **Profiling**: Wrap expensive operations with `Game.cpu.getUsed()` checks

## Project Conventions

### TypeScript Usage
- Strict mode enabled - no implicit any, null checks enforced
- Use Screeps type definitions from `@types/screeps`
- ES2020 features available (optional chaining, nullish coalescing)

### Module Structure
- **Kernel modules**: Process scheduler, CPU manager, inter-process communication
- **Processes**: Self-contained units (creep controllers, room managers, spawn queues)
- **Process lifecycle**: Register → Schedule → Execute → Sleep/Terminate
- Keep tick-based nature in mind - processes must yield control back to kernel

## Important Files
- [src/main.ts](../src/main.ts) - Game loop entry point
- [rollup.config.mjs](../rollup.config.mjs) - Build configuration (single file output required)
- [tsconfig.json](../tsconfig.json) - TypeScript strict mode, ES2020 target
- [package.json](../package.json) - Dependencies (only dev deps, no runtime deps allowed)

## Common Tasks

### Adding New Processes
1. Create process class implementing the process interface
2. Register process with kernel (either persistent or per-tick)
3. Implement `run()` method with CPU budget awareness (20 CPU total limit)
4. Profile with `Game.cpu.getUsed()` - every 0.1 CPU matters
5. Test via `npm run build` and copy `dist/main.js` to Screeps game

### Adding Kernel Features
1. Create kernel module in `kernel/` (when structure exists)
2. Integrate with main kernel loop
3. Ensure CPU profiling for kernel overhead

### Debugging
- Use `console.log()` - appears in Screeps game console
- Check CPU usage: `Game.cpu.getUsed()` before/after operations
- Monitor kernel process execution order and CPU allocation
- Sourcemaps enabled for line-accurate errors
- Test live in-game - build and copy `dist/main.js` to game client

## Anti-Patterns to Avoid
- **Don't bypass the kernel**: Processes should not directly manipulate global state
- **Don't use setTimeout/setInterval**: Not available in Screeps, use tick counting instead
- **Don't use Node.js APIs**: fs, http, etc. not available at runtime
- **Don't use async/await**: All operations are synchronous tick-based
- **Don't bundle external libraries**: Only Screeps-compatible code works
- **Avoid excessive Memory writes**: Serialization has CPU cost every tick
- **Don't create tight coupling**: Processes communicate via kernel, not direct calls

## Resources
- Screeps API Docs: https://docs.screeps.com/api/
- Game mechanics: Creeps cost energy to spawn, structures cost resources to build
- Victory conditions: Reach Game Control Level (GCL) 8+ through room control
