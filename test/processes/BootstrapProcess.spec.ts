import { Kernel } from '../../src/kernel';
import { BootstrapProcess, WorkerProcess } from '../../src/processes';
import { mockCreep, mockRoom, mockSpawn, registerWithGame } from '../utils';

describe('BootstrapProcess', () => {
  it('registers a worker process for each owned room', () => {
    const kernel = new Kernel();
    const room = mockRoom('W1N1');

    registerWithGame({ rooms: { [room.name]: room } });

    kernel.register(new BootstrapProcess(kernel));
    kernel.run();

    expect(kernel.getProcess(WorkerProcess.getId(room.name))).toBeDefined();
  });

  it('routes worker creeps through the kernel after bootstrap', () => {
    const kernel = new Kernel();
    const room = mockRoom('W1N1', {
      controller: {
        ticksToDowngrade: 5000,
      },
    });
    const spawn = mockSpawn('Spawn1', { room });
    const worker = mockCreep('Worker1', { room });

    room.memory.maxWorkers = undefined;
    room.memory.harvestPosCap = undefined;
    worker.memory.role = 'worker';
    worker.memory.harvesting = false;
    (worker.store as StoreDefinition & Record<ResourceConstant, number>)[RESOURCE_ENERGY] = 50;
    (worker.store.getFreeCapacity as jest.Mock).mockReturnValue(0);
    (worker.store.getUsedCapacity as jest.Mock).mockReturnValue(50);
    (worker.upgradeController as jest.Mock).mockReturnValue(OK);

    (room.find as jest.Mock).mockImplementation((type: FindConstant) => {
      switch (type) {
        case FIND_MY_SPAWNS:
          return [spawn];
        case FIND_MY_CREEPS:
          return [worker];
        case FIND_MY_CONSTRUCTION_SITES:
          return [];
        default:
          return [];
      }
    });

    registerWithGame({
      rooms: { [room.name]: room },
      creeps: { [worker.name]: worker },
      spawns: { [spawn.name]: spawn },
    });

    kernel.register(new BootstrapProcess(kernel));

    kernel.run();
    kernel.run();

    expect(worker.upgradeController).toHaveBeenCalledWith(room.controller);
    expect(room.memory.workerCount).toBe(1);
  });
});