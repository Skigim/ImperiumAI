/* 

I will use this file to brainstorm ideas and have the LLM review it. 

Cold Boot (RCL 1):

1. Spawn first worker with WORK, CARRY, MOVE, MOVE (250 energy)
2. Run worker role with max worker count 4
3. As soon as 4th worker exists, upgrade controller until RCL 2
4. At RCL 2, kernel loads EarlyDevelopmentProcess

================================================================================

RCL 2 Plan (Revised - Workers Only):

GOAL: Stay simple. Workers all the way through RCL 2. Scale body with capacity.

PHASE 1: Extension Rush (300 capacity → 550 capacity)
- Start with existing workers from RCL 1
- Workers: harvest → fill spawn/extensions → build extensions → upgrade (if downgrade risk)
- Build 5 extensions one at a time
- Goal: 550 energy capacity unlocked

PHASE 2: Worker Upgrade + Upgrade Push (550 capacity)
- Once at 550 capacity, spawn BIGGER workers [WORK×2, CARRY×2, MOVE×2] = 400e
- Let old 250e workers expire naturally (or keep them, doesn't matter)
- Reduce worker count since bigger workers = more efficient
- All workers: harvest → fill spawn/extensions → upgrade controller
- Push hard to RCL 3

--------------------------------------------------------------------------------

Creep Bodies (RCL 2):

At 300 capacity (start of RCL 2):
- Worker: [WORK, CARRY, MOVE, MOVE] = 250e (same as RCL 1)

At 550 capacity (5 extensions built):
- Worker: [WORK×2, CARRY×2, MOVE×2] = 400e (4 e/tick, 100 carry, on-road speed)
  OR
- Worker: [WORK×2, CARRY×3, MOVE×3] = 500e (4 e/tick, 150 carry)

--------------------------------------------------------------------------------

Worker Count Logic:
- Mining positions: ~6-8 per room typically (depends on source layout)
- At 250e body: Need more workers (lower harvest rate)
- At 400e body: Need fewer workers (2 WORK each = 4 e/tick vs 2 e/tick)
- Target: 4-6 workers early, reduce to 3-4 once upgraded

--------------------------------------------------------------------------------

Why NOT Miner/Hauler at RCL 2:
- 550e miner sits idle during source regen (150 ticks every 300)
- Coordination overhead (container building, role switching)
- Workers are flexible - can build, upgrade, refill
- Miner/Hauler makes sense at RCL 3+ when you have roads + tower + more extensions

================================================================================

RCL 3 Plan - Creep Perspective:

STATE AT START OF RCL 3:
- 3-4 upgraded workers [WORK×2, CARRY×2, MOVE×2]
- 10 extensions, 800 capacity
- No containers yet (workers were harvesting directly)

--------------------------------------------------------------------------------

WHAT EACH CREEP TYPE NEEDS TO DO:

MINERS (2 existing, upgrade on death)
[ ] Keep doing exactly what they're doing - sit at source, harvest
[ ] When a miner dies, replace with bigger body [WORK×6, MOVE] = 650e
    - 6 WORK = 12 e/tick, maxes out source (3000 energy / 300 ticks)
[ ] No behavior change needed, just bigger body on respawn

HAULERS (2 existing, may need a 3rd)
[ ] Still: pickup from container → deliver to spawn/extensions
[ ] NEW: Also deliver to tower (when tower exists and needs energy)
[ ] NEW: Also deliver to controller container (when it exists)
[ ] Decision: Do haulers also repair? Or separate role?
    - Option A: Hauler repairs roads/containers when full and nothing needs energy
    - Option B: Dedicated repairer creep
[ ] May need 3rd hauler once roads/tower/upgraders increase demand

BUILDERS (NEW ROLE - or repurpose workers?)
[ ] Spawn 1-2 builders when construction sites exist
[ ] Behavior: Get energy (from where?) → Build → Repeat
    - Option A: Pickup from containers (competes with haulers)
    - Option B: Withdraw from spawn/extensions (blocks spawning)
    - Option C: Haulers deliver to builder (complex coordination)
    - Option D: Pickup dropped energy near miners
[ ] Build priority: Extensions > Tower > Roads > Controller container
[ ] When nothing to build: Upgrade controller? Repair? Die off?

UPGRADERS (NEW DEDICATED ROLE)
[ ] Sit at controller, continuously upgrade
[ ] Behavior: Get energy → upgradeController → Repeat
[ ] Energy source options:
    - Option A: Controller container (hauler delivers here)
    - Option B: Walk to source container, return to controller (slow)
    - Option C: Pickup from dropped pile if near controller
[ ] How many? 1-2 dedicated upgraders
[ ] Body: Maximize WORK, enough CARRY for 1 trip, minimal MOVE

REPAIRERS (NEW ROLE - or add to existing?)
[ ] Containers decay: ~2 hits/tick, 2500 total over 5000 ticks
[ ] Roads decay faster under traffic
[ ] Options:
    - Hauler repairs when idle (no trips needed)
    - Builder repairs when no construction
    - Dedicated repairer (seems overkill for RCL3)
    - Tower repairs (uses energy, but convenient)

--------------------------------------------------------------------------------

WHAT NEEDS TO BE BUILT (in order):

[ ] 5 more extensions (reach 800 capacity)
    - Unlocks bigger creep bodies
    - Builder job

[ ] Tower (1)
    - Defense + emergency repairs
    - Needs hauler to refill

[ ] Roads: Source containers → Spawn
    - Faster hauler trips = more throughput
    - Builder job, then ongoing repair

[ ] Roads: Spawn → Controller
    - Faster upgrader energy runs (if no controller container)

[ ] Controller container
    - Upgrader sits here, hauler delivers
    - Eliminates upgrader travel time

--------------------------------------------------------------------------------

OPEN QUESTIONS TO DECIDE:

1. Where do BUILDERS get energy?
   [ ] Pickup from ground near miners?
   [ ] Withdraw from containers?
   [ ] Hauler delivery to a "build pile"?

2. Where do UPGRADERS get energy?
   [ ] Controller container (requires building it + hauler route)
   [ ] Walk to source container and back (slow but simple)

3. Who repairs decaying structures?
   [ ] Haulers when idle
   [ ] Builders when no sites
   [ ] Tower (costs 10 energy/repair action)

4. How many of each creep?
   [ ] Miners: 2 (one per source) - fixed
   [ ] Haulers: 2-3 (depends on distance + demand)
   [ ] Builders: 1-2 (temporary, during construction)
   [ ] Upgraders: 1-2 (permanent, controller focus)

--------------------------------------------------------------------------------

CREEP BODIES (800 energy cap):

Miner:    [WORK×6, MOVE]              = 650e (12 e/tick, maxes source)
Hauler:   [CARRY×6, MOVE×3]           = 450e (300 cap, 1:2 on roads)
Builder:  [WORK×2, CARRY×4, MOVE×3]   = 450e (build-focused)
Upgrader: [WORK×5, CARRY×2, MOVE×2]   = 650e (upgrade-focused, slow but strong)

================================================================================

Future RCL 4+:

- Storage unlocked (big deal - central logistics hub)
- 20 extensions, 1250 capacity
- Ramparts for defense
- Link to controller area?

*/