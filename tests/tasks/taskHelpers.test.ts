import { describe, expect, it, vi } from 'vitest';

import { runBuild } from '../../src/tasks/build';
import { runRepair } from '../../src/tasks/repair';
import { runWithdraw } from '../../src/tasks/withdraw';

Object.assign(globalThis, {
  ERR_NOT_IN_RANGE: -9,
  FIND_MY_CONSTRUCTION_SITES: 101,
  FIND_STRUCTURES: 107,
  RESOURCE_ENERGY: 'energy',
  STRUCTURE_CONTAINER: 'container',
  STRUCTURE_EXTENSION: 'extension',
  STRUCTURE_RAMPART: 'rampart',
  STRUCTURE_ROAD: 'road',
  STRUCTURE_SPAWN: 'spawn',
  STRUCTURE_STORAGE: 'storage',
});

const createCreep = () => {
  const findClosestByRange = vi.fn();
  const moveTo = vi.fn();
  const build = vi.fn();
  const withdraw = vi.fn();
  const repair = vi.fn();

  const creep = {
    pos: {
      findClosestByRange,
    },
    moveTo,
    build,
    withdraw,
    repair,
  } as unknown as Creep;

  return {
    creep,
    findClosestByRange,
    moveTo,
    build,
    withdraw,
    repair,
  };
};

describe('task helpers', () => {
  it('uses the provided move callback for build instead of creep.moveTo', () => {
    const { creep, build, moveTo } = createCreep();
    const move = vi.fn();
    const target = { pos: { x: 10, y: 15, roomName: 'W1N1' } } as ConstructionSite<BuildableStructureConstant>;

    build.mockReturnValue(ERR_NOT_IN_RANGE);

    expect(runBuild(creep, { move, target })).toBe(target);
    expect(build).toHaveBeenCalledWith(target);
    expect(move).toHaveBeenCalledWith(creep, target.pos);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('builds the nearest own construction site and moves into range when needed', () => {
    const { creep, findClosestByRange, build, moveTo } = createCreep();
    const target = { pos: { x: 10, y: 15, roomName: 'W1N1' } } as ConstructionSite<BuildableStructureConstant>;

    findClosestByRange.mockReturnValue(target);
    build.mockReturnValue(ERR_NOT_IN_RANGE);

    expect(runBuild(creep)).toBe(target);
    expect(findClosestByRange).toHaveBeenCalledWith(FIND_MY_CONSTRUCTION_SITES);
    expect(build).toHaveBeenCalledWith(target);
    expect(moveTo).toHaveBeenCalledWith(target);
  });

  it('returns null for build without calling build or move when no site exists', () => {
    const { creep, findClosestByRange, build, moveTo } = createCreep();

    findClosestByRange.mockReturnValue(null);

    expect(runBuild(creep)).toBeNull();
    expect(build).not.toHaveBeenCalled();
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('returns the build target without moving when already in range', () => {
    const { creep, build, moveTo } = createCreep();
    const target = { pos: { x: 11, y: 14, roomName: 'W1N1' } } as ConstructionSite<BuildableStructureConstant>;

    build.mockReturnValue(0);

    expect(runBuild(creep, { target })).toBe(target);
    expect(build).toHaveBeenCalledWith(target);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('withdraws only from energy-bearing container, storage, or spawn targets', () => {
    const { creep, findClosestByRange, withdraw, moveTo } = createCreep();
    const spawn = {
      structureType: STRUCTURE_SPAWN,
      my: true,
      store: {
        getUsedCapacity: vi.fn().mockReturnValue(150),
      },
      pos: { x: 12, y: 18, roomName: 'W1N1' },
    } as unknown as StructureSpawn;

    findClosestByRange.mockImplementation((_constant, options) => {
      expect(options?.filter?.(spawn)).toBe(true);
      expect(
        options?.filter?.({
          structureType: STRUCTURE_SPAWN,
          my: false,
          store: {
            getUsedCapacity: () => 50,
          },
        } as StructureSpawn),
      ).toBe(false);
      expect(
        options?.filter?.({
          structureType: STRUCTURE_STORAGE,
          my: false,
          store: {
            getUsedCapacity: () => 50,
          },
        } as StructureStorage),
      ).toBe(false);
      expect(
        options?.filter?.({
          structureType: STRUCTURE_CONTAINER,
          store: {
            getUsedCapacity: () => 50,
          },
        } as StructureContainer),
      ).toBe(true);
      expect(
        options?.filter?.({
          structureType: STRUCTURE_EXTENSION,
          store: {
            getUsedCapacity: () => 50,
          },
        } as StructureExtension),
      ).toBe(false);
      expect(
        options?.filter?.({
          structureType: STRUCTURE_SPAWN,
          store: {
            getUsedCapacity: () => 0,
          },
        } as StructureSpawn),
      ).toBe(false);

      return spawn;
    });
    withdraw.mockReturnValue(ERR_NOT_IN_RANGE);

    expect(runWithdraw(creep)).toBe(spawn);
    expect(findClosestByRange).toHaveBeenCalledWith(
      FIND_STRUCTURES,
      expect.any(Object),
    );
    expect(withdraw).toHaveBeenCalledWith(spawn, RESOURCE_ENERGY);
    expect(moveTo).toHaveBeenCalledWith(spawn);
  });

  it('returns null without withdrawing or moving when no withdraw target exists', () => {
    const { creep, findClosestByRange, moveTo, withdraw } = createCreep();

    findClosestByRange.mockReturnValue(null);

    expect(runWithdraw(creep)).toBeNull();
    expect(withdraw).not.toHaveBeenCalled();
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('uses the provided move callback for withdraw instead of creep.moveTo', () => {
    const { creep, moveTo, withdraw } = createCreep();
    const move = vi.fn();
    const target = {
      structureType: STRUCTURE_STORAGE,
      my: true,
      store: {
        getUsedCapacity: vi.fn().mockReturnValue(200),
      },
      pos: { x: 16, y: 11, roomName: 'W1N1' },
    } as unknown as StructureStorage;

    withdraw.mockReturnValue(ERR_NOT_IN_RANGE);

    expect(runWithdraw(creep, { move, target })).toBe(target);
    expect(withdraw).toHaveBeenCalledWith(target, RESOURCE_ENERGY);
    expect(move).toHaveBeenCalledWith(creep, target.pos);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('returns the withdraw target without moving when already in range', () => {
    const { creep, moveTo, withdraw } = createCreep();
    const target = {
      structureType: STRUCTURE_STORAGE,
      my: true,
      store: {
        getUsedCapacity: vi.fn().mockReturnValue(200),
      },
      pos: { x: 16, y: 11, roomName: 'W1N1' },
    } as unknown as StructureStorage;

    withdraw.mockReturnValue(0);

    expect(runWithdraw(creep, { target })).toBe(target);
    expect(withdraw).toHaveBeenCalledWith(target, RESOURCE_ENERGY);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('repairs only damaged roads and containers', () => {
    const { creep, findClosestByRange, repair, moveTo } = createCreep();
    const road = {
      structureType: STRUCTURE_ROAD,
      hits: 250,
      hitsMax: 500,
      pos: { x: 20, y: 20, roomName: 'W1N1' },
    } as unknown as StructureRoad;

    findClosestByRange.mockImplementation((_constant, options) => {
      expect(options?.filter?.(road)).toBe(true);
      expect(
        options?.filter?.({
          structureType: STRUCTURE_CONTAINER,
          hits: 250000,
          hitsMax: 250000,
        } as StructureContainer),
      ).toBe(false);
      expect(
        options?.filter?.({
          structureType: STRUCTURE_RAMPART,
          hits: 1000,
          hitsMax: 10000,
        } as StructureRampart),
      ).toBe(false);

      return road;
    });
    repair.mockReturnValue(ERR_NOT_IN_RANGE);

    expect(runRepair(creep)).toBe(road);
    expect(findClosestByRange).toHaveBeenCalledWith(
      FIND_STRUCTURES,
      expect.any(Object),
    );
    expect(repair).toHaveBeenCalledWith(road);
    expect(moveTo).toHaveBeenCalledWith(road);
  });

  it('returns the repair target without moving when already in range', () => {
    const { creep, moveTo, repair } = createCreep();
    const container = {
      structureType: STRUCTURE_CONTAINER,
      hits: 100000,
      hitsMax: 250000,
      pos: { x: 20, y: 21, roomName: 'W1N1' },
    } as unknown as StructureContainer;

    repair.mockReturnValue(0);

    expect(runRepair(creep, { target: container })).toBe(container);
    expect(repair).toHaveBeenCalledWith(container);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('uses the provided move callback for repair instead of creep.moveTo', () => {
    const { creep, moveTo, repair } = createCreep();
    const move = vi.fn();
    const target = {
      structureType: STRUCTURE_ROAD,
      hits: 250,
      hitsMax: 500,
      pos: { x: 20, y: 20, roomName: 'W1N1' },
    } as unknown as StructureRoad;

    repair.mockReturnValue(ERR_NOT_IN_RANGE);

    expect(runRepair(creep, { move, target })).toBe(target);
    expect(repair).toHaveBeenCalledWith(target);
    expect(move).toHaveBeenCalledWith(creep, target.pos);
    expect(moveTo).not.toHaveBeenCalled();
  });

  it('returns null for repair without calling repair or move when no target exists', () => {
    const { creep, findClosestByRange, moveTo, repair } = createCreep();

    findClosestByRange.mockReturnValue(null);

    expect(runRepair(creep)).toBeNull();
    expect(repair).not.toHaveBeenCalled();
    expect(moveTo).not.toHaveBeenCalled();
  });
});