export interface RoomExecutionDomain {
  roomName: string;
}

export const collectDomains = (): RoomExecutionDomain[] => {
  return [];
};

export * from './roomEconomy';
