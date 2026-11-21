import * as THREE from 'three';

/**
 * Curve Battle arena: size, obstacles and portals.
 * Geometry is pure data (ArenaLayout) so the host can generate it once per round and send it to the
 * client; CurveArena turns it into meshes and answers collision / teleport queries.
 */

export type ArenaSize = 'S' | 'M' | 'L';

export interface CurveArenaSettings {
  size: ArenaSize;
  obstacles: boolean;
  portals: boolean;
}

export const DEFAULT_ARENA_SETTINGS: CurveArenaSettings = { size: 'M', obstacles: false, portals: false };

export const ARENA_SIZES: Record<ArenaSize, number> = { S: 3.4, M: 4.8, L: 6.4 };
export const ARENA_SIZE_LABELS: Record<ArenaSize, string> = { S: 'Small', M: 'Medium', L: 'Large' };

/** Capsule obstacle: a segment with a radius (a round pillar when both ends coincide). */
export interface ArenaObstacle {
  x1: number; z1: number;
  x2: number; z2: number;
  r: number;
}

export interface ArenaPortalPair {
  ax: number; az: number;
  bx: number; bz: number;
}

export interface ArenaLayout {
  size: ArenaSize;
  obstacles: ArenaObstacle[];
  portals: ArenaPortalPair[];
}

export interface SpawnPoint { x: number; z: number; angle: number }

export const PORTAL_RADIUS = 0.12;
const PORTAL_COLORS = [0xa855f7, 0x22c55e];
const FLOOR_Y = 0.04;

export function sanitizeArenaSettings(raw: unknown): CurveArenaSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const size: ArenaSize = r.size === 'S' || r.size === 'L' ? r.size : 'M';
  return { size, obstacles: r.obstacles === true, portals: r.portals === true };
}

export function describeArena(s: CurveArenaSettings): string {
  const parts = [ARENA_SIZE_LABELS[s.size]];
  if (s.obstacles) parts.push('Obstacles');
  if (s.portals) parts.push('Portals');
  return parts.join(' · ');
}

/** Validates a layout received over the network (numbers in range, bounded counts). */
export function sanitizeLayout(raw: unknown): ArenaLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const size: ArenaSize = r.size === 'S' || r.size === 'L' ? r.size : 'M';
  const half = ARENA_SIZES[size] / 2;
  const num = (v: unknown, lim: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);

  const obstacles: ArenaObstacle[] = (Array.isArray(r.obstacles) ? r.obstacles : []).slice(0, 12).map((o: Record<string, unknown>) => ({
    x1: num(o?.x1, half), z1: num(o?.z1, half), x2: num(o?.x2, half), z2: num(o?.z2, half),
    r: Math.max(0.03, Math.min(0.3, num(o?.r, 0.3)))
  }));
  const portals: ArenaPortalPair[] = (Array.isArray(r.portals) ? r.portals : []).slice(0, 2).map((p: Record<string, unknown>) => ({
    ax: num(p?.ax, half), az: num(p?.az, half), bx: num(p?.bx, half), bz: num(p?.bz, half)
  }));
  return { size, obstacles, portals };
}

function distToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  let t = l2 === 0 ? 0 : ((px - x1) * dx + (pz - z1) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

/** Random spawns for both curves, well apart and away from the walls. */
export function generateSpawns(size: ArenaSize): [SpawnPoint, SpawnPoint] {
  const arena = ARENA_SIZES[size];
  const span = arena * 0.62;
  const minApart = arena * 0.25;
  const pick = (): SpawnPoint => ({
    x: (Math.random() - 0.5) * span,
    z: (Math.random() - 0.5) * span,
    angle: Math.random() * Math.PI * 2
  });
  const p1 = pick();
  let p2 = pick();
  for (let i = 0; i < 50 && Math.hypot(p2.x - p1.x, p2.z - p1.z) < minApart; i++) p2 = pick();
  // Don't start heading straight into the nearest wall: point roughly toward the centre
  for (const p of [p1, p2]) {
    const toCenter = Math.atan2(-p.z, -p.x);
    p.angle = toCenter + (Math.random() - 0.5) * Math.PI * 1.2;
  }
  return [p1, p2];
}

/**
 * Random obstacles/portals that keep each spawn and its first ~0.9m of travel clear,
 * and never overlap each other.
 */
export function generateLayout(settings: CurveArenaSettings, spawns: SpawnPoint[]): ArenaLayout {
  const size = ARENA_SIZES[settings.size];
  const half = size / 2;
  const edge = 0.35;
  const scale = size / 4.8;

  // Keep-out zones: spawn points plus their opening straight line
  const keepOut: Array<{ x: number; z: number; r: number }> = [];
  for (const s of spawns) {
    for (let d = 0; d <= 0.9; d += 0.3) {
      keepOut.push({ x: s.x + Math.cos(s.angle) * d, z: s.z + Math.sin(s.angle) * d, r: 0.32 });
    }
  }
  const isClear = (x: number, z: number, r: number) =>
    keepOut.every(k => Math.hypot(x - k.x, z - k.z) > r + k.r);
  const randPos = () => ({ x: (Math.random() * 2 - 1) * (half - edge), z: (Math.random() * 2 - 1) * (half - edge) });

  const obstacles: ArenaObstacle[] = [];
  if (settings.obstacles) {
    const count = Math.round(4 * scale) + Math.floor(Math.random() * 2);
    for (let i = 0, tries = 0; i < count && tries < 300; tries++) {
      const c = randPos();
      const isWall = Math.random() < 0.5;
      const len = isWall ? (0.35 + Math.random() * 0.45) * Math.max(0.85, scale) : 0;
      const a = Math.random() * Math.PI;
      const r = isWall ? 0.05 : 0.09 + Math.random() * 0.07;
      const o: ArenaObstacle = {
        x1: c.x - Math.cos(a) * len / 2, z1: c.z - Math.sin(a) * len / 2,
        x2: c.x + Math.cos(a) * len / 2, z2: c.z + Math.sin(a) * len / 2,
        r
      };
      // Clear of keep-out zones along its whole length, and inside the walls
      const ok = [0, 0.5, 1].every(t => {
        const x = o.x1 + (o.x2 - o.x1) * t;
        const z = o.z1 + (o.z2 - o.z1) * t;
        return Math.abs(x) < half - edge && Math.abs(z) < half - edge && isClear(x, z, r + 0.1);
      });
      if (!ok) continue;
      obstacles.push(o);
      keepOut.push({ x: c.x, z: c.z, r: len / 2 + r + 0.3 });
      i++;
    }
  }

  const portals: ArenaPortalPair[] = [];
  if (settings.portals) {
    const pairs = settings.size === 'S' ? 1 : 2;
    const minPairDist = size * 0.4;
    for (let i = 0, tries = 0; i < pairs && tries < 800; tries++) {
      const a = randPos();
      const b = randPos();
      // Crowded (small) arenas: relax spacing after many misses so the player always gets a portal
      const relax = tries > 300 ? 0.7 : 1;
      if (Math.hypot(a.x - b.x, a.z - b.z) < minPairDist * relax) continue;
      const pad = (PORTAL_RADIUS + 0.15) * relax;
      if (!isClear(a.x, a.z, pad) || !isClear(b.x, b.z, pad)) continue;
      portals.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
      keepOut.push({ x: a.x, z: a.z, r: PORTAL_RADIUS + 0.25 }, { x: b.x, z: b.z, r: PORTAL_RADIUS + 0.25 });
      i++;
    }
  }

  return { size: settings.size, obstacles, portals };
}

export class CurveArena {
  public group: THREE.Group = new THREE.Group();
  public size: number = ARENA_SIZES.M;
  public half: number = ARENA_SIZES.M / 2;
  public layout: ArenaLayout = { size: 'M', obstacles: [], portals: [] };

  private baseGroup: THREE.Group = new THREE.Group();
  private featureGroup: THREE.Group = new THREE.Group();
  private portalMeshes: THREE.Mesh[] = [];
  private builtSize: ArenaSize | null = null;
  private time: number = 0;

  private readonly obstacleMat = new THREE.MeshStandardMaterial({
    color: 0x334155, emissive: 0x7dd3fc, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.6
  });
  private readonly obstacleCapMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });

  constructor() {
    this.group.add(this.baseGroup);
    this.group.add(this.featureGroup);
    this.setLayout(this.layout);
  }

  /** Rebuilds floor/walls when the size changes, and the obstacles/portals every call. */
  public setLayout(layout: ArenaLayout): void {
    this.layout = layout;
    if (this.builtSize !== layout.size) {
      this.buildBase(layout.size);
    }
    this.buildFeatures();
  }

  private disposeGroup(g: THREE.Group): void {
    g.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (mat && mat !== this.obstacleMat && mat !== this.obstacleCapMat) {
        (Array.isArray(mat) ? mat : [mat]).forEach(m => m.dispose());
      }
    });
    g.clear();
  }

  private buildBase(sizeKey: ArenaSize): void {
    this.disposeGroup(this.baseGroup);
    this.builtSize = sizeKey;
    this.size = ARENA_SIZES[sizeKey];
    this.half = this.size / 2;
    const size = this.size;
    const half = this.half;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ color: 0x070c18 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    this.baseGroup.add(floor);

    const grid = new THREE.GridHelper(size, Math.round(size / 0.24), 0x1e293b, 0x0f172a);
    grid.position.y = FLOOR_Y + 0.002;
    this.baseGroup.add(grid);

    const borderMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const t = 0.025;
    const h = 0.06;
    const y = FLOOR_Y + h / 2;
    const walls: Array<[number, number, number, number]> = [
      [size + t * 2, t, 0, half + t / 2],
      [size + t * 2, t, 0, -half - t / 2],
      [t, size, -half - t / 2, 0],
      [t, size, half + t / 2, 0]
    ];
    for (const [w, d, x, z] of walls) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), borderMat);
      wall.position.set(x, y, z);
      this.baseGroup.add(wall);
    }
  }

  private buildFeatures(): void {
    this.disposeGroup(this.featureGroup);
    this.portalMeshes = [];
    const height = 0.07;

    for (const o of this.layout.obstacles) {
      const len = Math.hypot(o.x2 - o.x1, o.z2 - o.z1);
      const cx = (o.x1 + o.x2) / 2;
      const cz = (o.z1 + o.z2) / 2;
      const angle = Math.atan2(o.z2 - o.z1, o.x2 - o.x1);
      if (len > 0.001) {
        const body = new THREE.Mesh(new THREE.BoxGeometry(len, height, o.r * 2), this.obstacleMat);
        body.position.set(cx, FLOOR_Y + height / 2, cz);
        body.rotation.y = -angle;
        this.featureGroup.add(body);
      }
      for (const [x, z] of [[o.x1, o.z1], [o.x2, o.z2]]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, height, 20), this.obstacleMat);
        cap.position.set(x, FLOOR_Y + height / 2, z);
        this.featureGroup.add(cap);
        const top = new THREE.Mesh(new THREE.RingGeometry(o.r * 0.7, o.r, 24), this.obstacleCapMat);
        top.rotation.x = -Math.PI / 2;
        top.position.set(x, FLOOR_Y + height + 0.001, z);
        this.featureGroup.add(top);
        if (len <= 0.001) break; // round pillar: one cap is enough
      }
    }

    this.layout.portals.forEach((p, i) => {
      const color = PORTAL_COLORS[i % PORTAL_COLORS.length];
      for (const [x, z] of [[p.ax, p.az], [p.bx, p.bz]]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(PORTAL_RADIUS, 0.018, 10, 36),
          new THREE.MeshBasicMaterial({ color })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, FLOOR_Y + 0.02, z);
        this.featureGroup.add(ring);
        this.portalMeshes.push(ring);

        const swirl = new THREE.Mesh(
          new THREE.CircleGeometry(PORTAL_RADIUS * 0.85, 32),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 })
        );
        swirl.rotation.x = -Math.PI / 2;
        swirl.position.set(x, FLOOR_Y + 0.004, z);
        this.featureGroup.add(swirl);
      }
    });
  }

  public update(dt: number): void {
    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 5) * 0.08;
    for (const m of this.portalMeshes) {
      m.scale.set(pulse, pulse, 1);
      m.rotation.z += dt * 2.5;
    }
  }

  /** True if a circle of radius `r` at (x, z) touches an obstacle. */
  public hitsObstacle(x: number, z: number, r: number): boolean {
    for (const o of this.layout.obstacles) {
      if (distToSegment(x, z, o.x1, o.z1, o.x2, o.z2) < o.r + r) return true;
    }
    return false;
  }

  /** If (x, z) is inside a portal, returns the linked portal's centre. */
  public portalExit(x: number, z: number): { x: number; z: number } | null {
    const enter = PORTAL_RADIUS * 0.75;
    for (const p of this.layout.portals) {
      if (Math.hypot(x - p.ax, z - p.az) < enter) return { x: p.bx, z: p.bz };
      if (Math.hypot(x - p.bx, z - p.bz) < enter) return { x: p.ax, z: p.az };
    }
    return null;
  }
}
