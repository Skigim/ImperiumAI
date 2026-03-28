import { runKernel } from '@kernel/bootstrap';

let hasAnnouncedStartup = false;

export const loop = (): void => {
  if (!hasAnnouncedStartup) {
    console.log('[Imperium] Global reset detected. Boot sequence initialized.');
    hasAnnouncedStartup = true;
  }

  console.log(`[Imperium] Tick ${Game.time} on ${Game.shard.name}`);
  runKernel();
};
