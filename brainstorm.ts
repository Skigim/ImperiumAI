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
- 1-2 fillers: harvest → fill spawn/extensions (supplies energy for incremental upgrades and remote workers)
- Workers: harvest → build extensions → build containers → upgrade
- Build 5 extensions one at a time
- Goal: 550 energy capacity unlocked

PHASE 2: Upgrade Push (all 5 extensions built, 550 capacity)
- Let old 250e workers expire naturally (or keep them, doesn't matter)
- Keep 1 filler: harvest → fill spawn/extensions
- Other workers and remotes: harvest → upgrade
- Push hard to RCL 3

--------------------------------------------------------------------------------
*/