export enum CreepState {
    IDLE = 'idle',
    HARVEST = 'harvest',
    UPGRADE = 'upgrade',
    TRANSFER = 'transfer',
    BUILD = 'build'
}

declare global {
  // Console is provided by Screeps runtime
  const console: {
    log(...args: unknown[]): void;
  };
}
