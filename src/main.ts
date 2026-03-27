import './types';
import './memory';
import { getKernel } from './kernel';
import { BootstrapProcess } from './processes';

/**
 * Main game loop - called every tick by Screeps engine.
 * The kernel manages all process scheduling and execution.
 */
export function loop(): void {
  const kernel = getKernel();

  if (!kernel.getProcess(BootstrapProcess.ID)) {
    kernel.register(new BootstrapProcess(kernel));
  }

  kernel.run();
}
