import type { KernelProcess } from '@kernel/process';

import { createWorkerRoomProcess } from './workerRoomProcess';

export interface ProcessDescriptor {
  name: string;
  roomName?: string;
}

export const getProcessDescriptors = (): ProcessDescriptor[] => {
  return Object.values(Game.rooms)
    .filter((room) => room.controller?.my)
    .map((room) => ({
      name: 'WorkerRoomProcess',
      roomName: room.name,
    }));
};

export const getKernelProcesses = (): KernelProcess[] => {
  return getProcessDescriptors()
    .filter((descriptor): descriptor is ProcessDescriptor & { roomName: string } => {
      return descriptor.name === 'WorkerRoomProcess' && descriptor.roomName !== undefined;
    })
    .map((descriptor) => createWorkerRoomProcess(descriptor.roomName));
};
