import type { KernelProcess, ProcessStatus } from '@kernel/process';
import { findTransferTarget, runTransfer } from '@tasks/transfer';
import { runHarvest } from '@tasks/harvest';

const updateWorkerState = (creep: Creep): void => {
  if (creep.memory.harvesting && creep.store.getFreeCapacity() === 0) {
    creep.memory.harvesting = false;
    delete creep.memory.transferTargetId;
  }

  if (!creep.memory.harvesting && creep.store[RESOURCE_ENERGY] === 0) {
    creep.memory.harvesting = true;
  }
};

const runWorker = (creep: Creep, controller: StructureController): void => {
  updateWorkerState(creep);

  if (creep.memory.harvesting) {
    runHarvest(creep);
    return;
  }

  const target = findTransferTarget(creep, creep.memory.transferTargetId);

  if (target) {
    creep.memory.transferTargetId = target.id;
    runTransfer(creep, { target });
    return;
  }

  delete creep.memory.transferTargetId;

  if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
    creep.moveTo(controller);
  }
};

export const createWorkerRoomProcess = (roomName: string): KernelProcess => {
  return {
    id: `process.room.workers.${roomName}`,
    label: `WorkerRoomProcess(${roomName})`,
    priority: 10,
    run(): ProcessStatus {
      const room = Game.rooms[roomName];

      if (!room?.controller?.my) {
        return 'suspended';
      }

      const workers = room.find(FIND_MY_CREEPS).filter((creep) => creep.memory.role === 'worker');
      room.memory.workerCount = workers.length;

      for (const worker of workers) {
        runWorker(worker, room.controller);
      }

      return 'completed';
    },
  };
};