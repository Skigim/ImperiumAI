/**
 * Body Builder Utility
 * 
 * Generates creep bodies based on available energy and role requirements.
 * Uses incremental pattern-based building for flexibility.
 * Parts are ordered for combat effectiveness: TOUGH → WORK/CARRY/ATTACK → MOVE
 */

/** Part costs for body building */
const PART_COSTS: Record<BodyPartConstant, number> = {
  [MOVE]: 50,
  [WORK]: 100,
  [CARRY]: 50,
  [ATTACK]: 80,
  [RANGED_ATTACK]: 150,
  [HEAL]: 250,
  [CLAIM]: 600,
  [TOUGH]: 10,
};

/**
 * Part ordering priority for combat effectiveness.
 * Lower number = placed earlier in body (takes damage first).
 * TOUGH at front (damage absorption), MOVE at back (preserve mobility).
 */
const PART_ORDER: Record<BodyPartConstant, number> = {
  [TOUGH]: 0,
  [WORK]: 1,
  [CARRY]: 2,
  [ATTACK]: 3,
  [RANGED_ATTACK]: 4,
  [HEAL]: 5,
  [CLAIM]: 6,
  [MOVE]: 7,
};

/**
 * Sort body parts for optimal combat ordering.
 * TOUGH first, MOVE last, everything else in between.
 */
function sortBodyParts(body: BodyPartConstant[]): BodyPartConstant[] {
  return [...body].sort((a, b) => PART_ORDER[a] - PART_ORDER[b]);
}

/**
 * Build a body by repeating a pattern until budget is exhausted.
 * Parts are added incrementally, then sorted for combat effectiveness.
 * 
 * @param budget - Energy budget to spend
 * @param pattern - Array of body parts to repeat in order
 * @returns Body parts array (sorted: TOUGH → WORK/CARRY → MOVE)
 */
function buildBodyFromPattern(budget: number, pattern: BodyPartConstant[]): BodyPartConstant[] {
  const body: BodyPartConstant[] = [];
  let spent = 0;
  let patternIndex = 0;

  while (spent + PART_COSTS[pattern[patternIndex]] <= budget) {
    const part = pattern[patternIndex];
    body.push(part);
    spent += PART_COSTS[part];
    patternIndex = (patternIndex + 1) % pattern.length;
  }

  return sortBodyParts(body);
}

/**
 * Worker body for remote harvesting.
 * Pattern: CARRY, MOVE, WORK, MOVE - full speed on plains when loaded.
 * Balanced CARRY/WORK with 1:1 MOVE ratio for non-MOVE parts.
 */
export function buildRemoteWorkerBody(energyCapacity: number): BodyPartConstant[] {
  const maxCost = 1000;
  const budget = Math.min(energyCapacity, maxCost);

  if (budget < 150) {
    return [CARRY, MOVE];
  }

  // CARRY, MOVE, WORK, MOVE = 250 per cycle, 1:1 MOVE ratio
  return buildBodyFromPattern(budget, [CARRY, MOVE, WORK, MOVE]);
}

/**
 * Worker body for local operations (harvesting + building).
 * Pattern: WORK, CARRY, MOVE - prioritizes WORK, less MOVE for near-spawn ops.
 */
export function buildLocalWorkerBody(energyCapacity: number): BodyPartConstant[] {
  const maxCost = 800;
  const budget = Math.min(energyCapacity, maxCost);

  if (budget < 200) {
    return [WORK, CARRY, MOVE];
  }

  // WORK, CARRY, MOVE = 200 per cycle, WORK-heavy for local harvesting
  return buildBodyFromPattern(budget, [WORK, CARRY, MOVE]);
}

/**
 * Filler body - local worker variant.
 * Pattern: WORK, CARRY, MOVE - same as local worker, operates near spawn.
 */
export function buildFillerBody(energyCapacity: number): BodyPartConstant[] {
  const maxCost = 800;
  const budget = Math.min(energyCapacity, maxCost);

  if (budget < 200) {
    return [WORK, CARRY, MOVE];
  }

  // WORK, CARRY, MOVE = 200 per cycle
  return buildBodyFromPattern(budget, [WORK, CARRY, MOVE]);
}

/**
 * Calculate the cost of a body.
 */
export function getBodyCost(body: BodyPartConstant[]): number {
  return body.reduce((sum, part) => sum + PART_COSTS[part], 0);
}
