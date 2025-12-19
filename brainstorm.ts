/* 

I will use this file to brainstorm ideas and have the LLM review it. 

Cold Boot (RCL 1):

1. Spawn first worker with WORK, CARRY, MOVE, MOVE (250 energy)
2. Run worker role with max worker count 2
3. As soon as 2nd worker exists, upgrade controller until RCL 2
4. At RCL 2, kernel loads EarlyDevelopmentProcess

================================================================================

RCL 2 Plan:

PHASE 1: Extension Rush
- Spawn workers up to max mining positions
- Workers: harvest → fill spawn → build extensions → upgrade controller (only if at risk of downgrade)
- Goal: Get 5 extensions built (550 total energy capacity)

PHASE 2: First Miner Transition  
- Once extensions done, spawn Miner1 [WORK×5, MOVE] = 550 energy
- Miner1 goes to assigned position at Source1, starts drop mining
- Send 1 worker to build container at Miner1's feet (using dropped energy)
- Send 2 workers to adjacent rooms as scouts (mine until death, no respawn)

PHASE 3: First Hauler
- Once container1 built, spawn Hauler1 [CARRY×4, MOVE×2] = 300 energy
- Hauler1: pickup from container1 → deliver to spawn/extensions
- Remaining workers continue mining Source2 normally

PHASE 4: Second Source
- Spawn Miner2 [WORK×5, MOVE] = 550 energy for Source2
- Worker builds container2 at Miner2's position (using dropped energy)
- Spawn Hauler2 once container2 built
- All remaining workers can expire naturally or become scouts

PHASE 5: Upgrade Push
- With both sources containerized and hauled, energy income stable
- All excess energy → controller upgrades
- Transition to RCL 3 process when controller hits level 3

--------------------------------------------------------------------------------

Creep Bodies (RCL 2 - 550 capacity):
- Worker:  [WORK, CARRY, MOVE, MOVE]           = 250 energy (existing)
- Miner:   [WORK, WORK, WORK, WORK, WORK, MOVE] = 550 energy (10 e/tick)
- Hauler:  [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE] = 300 energy (200 capacity)
- Scout:   Repurposed worker, no respawn

--------------------------------------------------------------------------------

Key Mechanics:
- Miner drop-mines (no CARRY), energy piles on ground
- Worker picks up dropped energy to build container
- Once container exists, miner auto-deposits into it (drop mining into container)
- Container decays but income > decay at 10 e/tick

================================================================================

Future RCL 3+:

- 800 energy capacity unlocks bigger creeps
- Roads to sources
- Tower for defense
- Second room claiming?

*/