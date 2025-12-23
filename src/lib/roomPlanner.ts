/**
 * Room Planner Utilities
 *
 * Design goals:
 * - Keep layout "DNA" static in code (no Memory storage)
 * - Use a per-room anchor stored in Memory to translate relative blueprint coords → absolute room coords
 * - Place construction sites deterministically and safely
 */

type RCL = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface RelativePos {
  /** Relative x offset from anchor */
  x: number;
  /** Relative y offset from anchor */
  y: number;
}

export type LayoutByStructure = Partial<Record<BuildableStructureConstant, RelativePos[]>>;

export type LayoutDNA = Record<RCL, LayoutByStructure>;

export interface LayoutParserOptions {
  /** Map from ASCII symbol to structure type */
  symbolMap?: Partial<Record<string, BuildableStructureConstant>>;
  /** Spawn symbol used to determine center point (first occurrence) */
  spawnSymbol?: string;
  /**
   * If true, blocks after the first may omit the spawn symbol.
   * The block will be anchored relative to the last known spawn center.
   */
  allowMissingSpawnInBlocks?: boolean;
}

const DEFAULT_SYMBOL_MAP: Record<string, BuildableStructureConstant> = {
  S: STRUCTURE_SPAWN,
  E: STRUCTURE_EXTENSION,
  '.': STRUCTURE_ROAD,
  R: STRUCTURE_ROAD,
  T: STRUCTURE_TOWER,
  C: STRUCTURE_CONTAINER,
  L: STRUCTURE_LINK,
  K: STRUCTURE_STORAGE,
  X: STRUCTURE_RAMPART,
  W: STRUCTURE_WALL,
};

const DEFAULT_SPAWN_SYMBOL = 'S';

const RCL_HEADER = /^\s*(?:#|@)?\s*RCL\s*([1-8])\s*:?\s*$/i;

function emptyDNA(): LayoutDNA {
  return {
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
    7: {},
    8: {},
  };
}

function pushPos(target: LayoutByStructure, structureType: BuildableStructureConstant, pos: RelativePos): void {
  const arr = target[structureType] ?? (target[structureType] = []);
  arr.push(pos);
}

/**
 * Parse one or more RCL layout blocks from an ASCII blueprint.
 *
 * Supported formats:
 * - Single block (no headers): interpreted as RCL 1 layout.
 * - Multi-block: each block starts with a line like `RCL 2` or `@RCL2`.
 *
 * The "center" (0,0) is defined as the first spawn symbol in the block.
 */
export function parseLayout(ascii: string, options: LayoutParserOptions = {}): LayoutDNA {
  const symbolMap: Record<string, BuildableStructureConstant> = { ...DEFAULT_SYMBOL_MAP };
  if (options.symbolMap) {
    for (const [symbol, structureType] of Object.entries(options.symbolMap)) {
      if (!structureType) continue;
      symbolMap[symbol] = structureType;
    }
  }
  const spawnSymbol = options.spawnSymbol ?? DEFAULT_SPAWN_SYMBOL;
  const allowMissingSpawnInBlocks = options.allowMissingSpawnInBlocks ?? false;

  const lines = ascii
    .split('\n')
    .map(l => l.replace(/\r/g, ''))
    .filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    return emptyDNA();
  }

  // Split into blocks keyed by RCL header. If no header is present, treat as RCL1.
  const blocks: Array<{ rcl: RCL; grid: string[] }> = [];
  let currentRcl: RCL = 1;
  let currentGrid: string[] = [];
  let sawHeader = false;

  for (const line of lines) {
    const match = line.match(RCL_HEADER);
    if (match) {
      sawHeader = true;

      if (currentGrid.length > 0) {
        blocks.push({ rcl: currentRcl, grid: currentGrid });
      }

      currentRcl = Number(match[1]) as RCL;
      currentGrid = [];
      continue;
    }

    currentGrid.push(line);
  }

  if (currentGrid.length > 0) {
    blocks.push({ rcl: currentRcl, grid: currentGrid });
  }

  // If headers existed but no actual grids, return empty.
  if (sawHeader && blocks.length === 0) {
    return emptyDNA();
  }

  const dna = emptyDNA();

  let lastCenter: { x: number; y: number } | null = null;

  for (const block of blocks) {
    const { rcl, grid } = block;

    // Find first spawn symbol to define center.
    let centerX: number | null = null;
    let centerY: number | null = null;

    for (let y = 0; y < grid.length && centerX === null; y++) {
      const row = grid[y];
      const x = row.indexOf(spawnSymbol);
      if (x >= 0) {
        centerX = x;
        centerY = y;
      }
    }

    if (centerX === null || centerY === null) {
      if (!allowMissingSpawnInBlocks || !lastCenter) {
        throw new Error(`parseLayout: block RCL ${rcl} missing spawn symbol '${spawnSymbol}'`);
      }

      centerX = lastCenter.x;
      centerY = lastCenter.y;
    }

    lastCenter = { x: centerX, y: centerY };

    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const structureType = symbolMap[ch];
        if (!structureType) continue;

        pushPos(dna[rcl], structureType, {
          x: x - centerX,
          y: y - centerY,
        });
      }
    }
  }

  return dna;
}

export interface AutoBuilderOptions {
  /** Layout DNA to use. Defaults to empty (no-op). */
  dna?: LayoutDNA;
  /** If true, logs when anchor seems invalid (e.g. walls). */
  logWarnings?: boolean;
}

// Cache merged layouts per (DNA identity, RCL). This avoids re-merging every tick.
const MERGED_LAYOUT_CACHE: WeakMap<LayoutDNA, Map<RCL, LayoutByStructure>> = new WeakMap();

function getMergedLayoutCached(dna: LayoutDNA, upToRcl: RCL): LayoutByStructure {
  let byRcl = MERGED_LAYOUT_CACHE.get(dna);
  if (!byRcl) {
    byRcl = new Map();
    MERGED_LAYOUT_CACHE.set(dna, byRcl);
  }

  const cached = byRcl.get(upToRcl);
  if (cached) return cached;

  const merged = mergeLayouts(dna, upToRcl);
  byRcl.set(upToRcl, merged);
  return merged;
}

function absPos(room: Room, rel: RelativePos): { x: number; y: number } {
  const anchor = room.memory.anchor!;
  return {
    x: anchor.x + rel.x,
    y: anchor.y + rel.y,
  };
}

function inBounds(pos: { x: number; y: number }): boolean {
  return pos.x >= 0 && pos.x <= 49 && pos.y >= 0 && pos.y <= 49;
}

function hasStructureAt(room: Room, x: number, y: number, type: BuildableStructureConstant): boolean {
  const structures = room.lookForAt(LOOK_STRUCTURES, x, y) as Structure[];
  return structures.some(s => s.structureType === type);
}

function hasConstructionSiteAt(room: Room, x: number, y: number, type: BuildableStructureConstant): boolean {
  const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y) as ConstructionSite[];
  return sites.some(s => s.structureType === type);
}

function countExistingAndSites(room: Room, type: BuildableStructureConstant): number {
  const structures = room.find(FIND_STRUCTURES, {
    filter: s => s.structureType === type,
  }) as Structure[];

  const sites = room.find(FIND_CONSTRUCTION_SITES, {
    filter: s => s.structureType === type,
  }) as ConstructionSite[];

  return structures.length + sites.length;
}

function maxAllowedAtRcl(type: BuildableStructureConstant, rcl: number): number {
  // In Screeps runtime, CONTROLLER_STRUCTURES is a global constant.
  // In tests/node, it may exist only as a property on globalThis.
  const table =
    (typeof CONTROLLER_STRUCTURES !== 'undefined' ? CONTROLLER_STRUCTURES : (globalThis as any).CONTROLLER_STRUCTURES) as
      | Partial<Record<BuildableStructureConstant, Record<number, number>>>
      | undefined;

  if (!table) return 0;
  const row = table[type];
  if (!row) return 0;
  return row[rcl] ?? 0;
}

function mergeLayouts(dna: LayoutDNA, upToRcl: RCL): LayoutByStructure {
  const merged: LayoutByStructure = {};
  const seen: Map<BuildableStructureConstant, Set<string>> = new Map();

  for (let r = 1 as RCL; r <= upToRcl; r = (r + 1) as RCL) {
    const level = dna[r];
    for (const key of Object.keys(level) as BuildableStructureConstant[]) {
      const relPositions = level[key] ?? [];
      let set = seen.get(key);
      if (!set) {
        set = new Set();
        seen.set(key, set);
      }

      for (const rel of relPositions) {
        const k = `${rel.x},${rel.y}`;
        if (set.has(k)) continue;
        set.add(k);
        pushPos(merged, key, rel);
      }
    }
  }

  return merged;
}

/**
 * End-to-end builder that places at most one construction site per tick per room.
 *
 * - Requires `room.memory.anchor` to be present.
 * - Iterates layouts up to current controller level.
 * - Validates terrain (skip walls), avoids duplicate sites/structures, and respects max structure limits.
 */
export function runAutoBuilder(room: Room, options: AutoBuilderOptions = {}): void {
  if (!room.controller?.my) return;
  if (!room.memory.anchor) return;

  const currentRcl = room.controller.level as RCL;
  const dna = options.dna ?? emptyDNA();
  const logWarnings = options.logWarnings ?? false;

  // Merge all RCL layers up to current level (cached per global reset).
  const layout = getMergedLayoutCached(dna, currentRcl);

  const terrain = room.getTerrain();

  // Cache structure counts per type (lazy). Only computed if we find a missing tile.
  const countCache: Partial<Record<BuildableStructureConstant, number>> = {};

  const getCount = (type: BuildableStructureConstant): number => {
    const cached = countCache[type];
    if (cached !== undefined) return cached;
    const count = countExistingAndSites(room, type);
    countCache[type] = count;
    return count;
  };

  // Deterministic structure iteration: by structureType key ordering.
  for (const structureType of Object.keys(layout) as BuildableStructureConstant[]) {
    const relPositions = layout[structureType] ?? [];
    if (relPositions.length === 0) continue;

    const allowed = maxAllowedAtRcl(structureType, currentRcl);
    if (allowed <= 0) continue;

    for (const rel of relPositions) {
      const pos = absPos(room, rel);
      if (!inBounds(pos)) continue;

      // A) Check if this specific tile is already satisfied.
      if (hasStructureAt(room, pos.x, pos.y, structureType)) continue;
      if (hasConstructionSiteAt(room, pos.x, pos.y, structureType)) continue;

      // B) It's missing here: now check if we're at cap (lazy evaluation).
      const currentCount = getCount(structureType);
      if (currentCount >= allowed) {
        break;
      }

      // C) Validation
      if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) {
        if (logWarnings) {
          console.log(
            `[AutoBuilder] ${room.name} anchor invalid: ${structureType} on wall at ${pos.x},${pos.y}`
          );
        }
        continue;
      }

      // D) Build and return (throttle: one createConstructionSite call per tick)
      const result = room.createConstructionSite(pos.x, pos.y, structureType);

      if (result === OK) {
        countCache[structureType] = currentCount + 1;
        return;
      }

      if (result === ERR_FULL) return;
    }
  }
}
