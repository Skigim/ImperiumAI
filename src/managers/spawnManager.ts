import { WORKER_BODY, WORKER_COST } from '../types';
import { countMiningPositions } from '../utils/positions';
import { getSpawns, getWorkerCount } from '../utils/cache';

/**
 * Generate creep name: first letter of role + last digit of Game.time.
 * Adds digits if name already exists.
 */
function generateCreepName(role: string): string {
  const prefix = role.charAt(0).toUpperCase();
  const timeStr = Game.time.toString();
  
  // Start with last digit
  let suffix = timeStr.charAt(timeStr.length - 1);
  let name = `${prefix}${suffix}`;
  
  // Add more digits if name exists
  let digitIndex = timeStr.length - 2;
  while (Game.creeps[name] && digitIndex >= 0) {
    suffix = timeStr.charAt(digitIndex) + suffix;
    name = `${prefix}${suffix}`;
    digitIndex--;
  }
  
  // Fallback: add random digit if all time digits used
  while (Game.creeps[name]) {
    suffix = suffix + Math.floor(Math.random() * 10);
    name = `${prefix}${suffix}`;
  }
  
  return name;
}

/**
 * Run spawn manager for cold boot phase.
 * Spawns workers up to max mining positions.
 */
export function runSpawnManager(room: Room): void {
  const spawns = getSpawns(room);
  if (spawns.length === 0) return;

  const spawn = spawns[0];
  
  // Don't interrupt active spawning
  if (spawn.spawning) return;

  // Check energy
  if (room.energyAvailable < WORKER_COST) return;

  // Count current workers (cached)
  const workerCount = getWorkerCount(room);
  
  // Calculate max workers based on available mining positions (from Memory)
  const maxWorkers = countMiningPositions(room);

  // Spawn if under cap
  if (workerCount < maxWorkers) {
    const name = generateCreepName('worker');
    const result = spawn.spawnCreep(WORKER_BODY, name, {
      memory: {
        role: 'worker',
        state: 'harvesting',
        stuckCount: 0
      }
    });

    if (result === OK) {
      console.log(`Spawning worker: ${name}`);
    }
  }
}
