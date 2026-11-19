// Neon Bay — procedural sunset city: road grid, buildings, neon strip, palms.
// All layout uses G.rng (seeded), so ?seed= always rebuilds the same city.
export const BLOCK = 44;
export const ROAD = 14;
export const STEP = 58;

const ROAD_LINES = [];
for (let k = 0; k < 9; k += 1) ROAD_LINES.push(-232 + k * STEP);
const FACADE_COLORS = [0xd9a066, 0xc98f7a, 0xb7a6d9, 0x9fc3d4, 0xd4b48c, 0xa8c6a0, 0xe0b0b8];
const NEON_SIGNS = [
  { text: 'NEON BAY', color: '#ff4fd8' }, { text: 'PALM HOTEL', color: '#37e6ff' },
  { text: 'SOL CLUB', color: '#ffb347' }, { text: 'BAY TACOS', color: '#7dff6a' },
  { text: 'REEF BAR', color: '#ff5a5a' }, { text: 'LUNA MOTEL', color: '#c58cff' },
];

const facadeCache = new Map();
const signCache = new Map();

// Canvas texture: warm facade with a grid of lit / dark windows.
function facadeTexture(colorHex) {
  if (facadeCache.has(colorHex)) return facadeCache.get(colorHex);
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      const lit = ((x * 7 + y * 13) % 10) < 5; // deterministic pattern, no RNG
      ctx.fillStyle = lit ? '#ffe9a8' : '#2a2f45'; ctx.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  facadeCache.set(colorHex, tex);
  return tex;
}

// Canvas texture: glowing neon sign text on a dark board.
function signTexture(text, color) {
  const key = text + color;
  if (signCache.has(key)) return signCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#12081f'; ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  signCache.set(key, tex);
  return tex;
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function flat(w, h, mat, x, y, z) { // ground plane, rotated flat
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
  return m;
}

export function buildCity(G) {
  const scene = G.scene;
  const rng = G.rng;
  const nightLights = [];

  // Sunset sky, warm sun, haze.
  scene.background = new THREE.Color(0xff9a56);
  scene.fog = new THREE.Fog(0xff9a56, 180, 700);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(120, 90, -180);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffb37a, 0x3a2f5a, 0.9));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  sunBall.position.set(-260, 55, -420);
  scene.add(sunBall);

  // Ground, beach, sea.
  scene.add(flat(1400, 1400, new THREE.MeshLambertMaterial({ color: 0x3d3d46 }), 0, 0, 0));
  scene.add(flat(1400, 40, new THREE.MeshLambertMaterial({ color: 0xd9c08a }), 0, 0.02, 280));
  scene.add(flat(1400, 500, new THREE.MeshLambertMaterial({ color: 0x1f6f9f }), 0, -0.5, 550));

  // Roads: one dark strip per road line, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x23232b });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  for (const line of ROAD_LINES) {
    scene.add(flat(ROAD, 478, roadMat, line, 0.05, 0));
    scene.add(flat(478, ROAD, roadMat, 0, 0.05, line));
    // Dashed centre line, skipping the intersection boxes.
    for (let t = -232; t <= 232; t += 12) {
      const nearCross = ROAD_LINES.some((c) => Math.abs(t - c) < 10);
      if (nearCross) continue;
      scene.add(box(0.6, 0.06, 4, dashMat, line, 0.08, t));
      scene.add(box(4, 0.06, 0.6, dashMat, t, 0.08, line));
    }
  }

  // Zebra crossings at every intersection, on both roads.
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0xe8e8dc });
  for (const cx of ROAD_LINES) {
    for (const cz of ROAD_LINES) {
      for (let s = -5; s <= 5; s += 2.5) {
        scene.add(box(1.1, 0.06, 10, zebraMat, cx + s, 0.08, cz - 8.5));
        scene.add(box(10, 0.06, 1.1, zebraMat, cx - 8.5, 0.08, cz + s));
      }
    }
  }

  // Blocks, sidewalks, buildings, palms, lamps.
  const blockCenters = [];
  for (let i = 0; i < 8; i += 1) blockCenters.push(-203 + i * STEP);
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x8a8a92 });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e5f, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const buildings = [];
  let signIndex = 0;

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      scene.add(flat(BLOCK, BLOCK, walkMat, bx, 0.03, bz)); // sidewalk slab

      const downtown = Math.abs(bx) <= 29 && Math.abs(bz) <= 29;
      const count = rng.int(1, 4);
      for (let q = 0; q < count; q += 1) {
        const qx = (q % 2 === 0 ? -1 : 1) * 11;
        const qz = (q < 2 ? -1 : 1) * 11;
        const w = rng.range(10, 20);
        const d = rng.range(10, 20);
        const h = downtown ? rng.range(25, 55) : rng.range(8, 38);
        const x = bx + qx + rng.range(-3, 3);
        const z = bz + qz + rng.range(-3, 3);
        const facade = rng.pick(FACADE_COLORS);
        const mat = new THREE.MeshLambertMaterial({ map: facadeTexture(facade) });
        scene.add(box(w, h, d, mat, x, h / 2, z));
        scene.add(box(w + 0.6, 0.8, d + 0.6, new THREE.MeshLambertMaterial({ color: 0x4a4a55 }), x, h + 0.4, z));
        buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });

        // Neon sign on one downtown building per block, facing the road.
        if (downtown && q === 0) {
          const sign = NEON_SIGNS[signIndex % NEON_SIGNS.length];
          signIndex += 1;
          const glow = new THREE.MeshBasicMaterial({ map: signTexture(sign.text, sign.color), transparent: true });
          scene.add(box(Math.min(16, w + 2), 4, 0.5, glow, x, Math.min(h - 3, 18), z + d / 2 + 0.4));
          nightLights.push(glow);
        }
      }

      // Two palms near block corners.
      for (let p = 0; p < 2; p += 1) {
        const px = bx + rng.pick([-19, 19]);
        const pz = bz + rng.range(-16, 16);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
        trunk.position.set(px, 3, pz); scene.add(trunk);
        for (let leaf = 0; leaf < 6; leaf += 1) {
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), leafMat);
          const a = (leaf / 6) * Math.PI * 2;
          plane.position.set(px + Math.cos(a) * 1.4, 6.2, pz + Math.sin(a) * 1.4);
          plane.rotation.set(0.5, -a, 0.5); scene.add(plane);
        }
      }
    }
  }

  // Street lamps along road edges, roughly every 30 units.
  for (const line of ROAD_LINES) {
    for (let t = -220; t <= 220; t += 30) {
      for (const [lx, lz] of [[line + 8, t], [t, line + 8]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
        pole.position.set(lx, 3, lz); scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
        bulb.position.set(lx, 6.2, lz); scene.add(bulb);
      }
    }
  }
  nightLights.push(lampMat); // one shared lamp material, pushed once

  // Road graph: 81 nodes, edges between neighbours along roads.
  const nodes = [];
  const nodeIndex = new Map();
  ROAD_LINES.forEach((z, zi) => {
    ROAD_LINES.forEach((x, xi) => {
      nodeIndex.set(xi + ',' + zi, nodes.length); nodes.push({ x, z });
    });
  });
  const edges = [];
  for (let zi = 0; zi < 9; zi += 1) {
    for (let xi = 0; xi < 9; xi += 1) {
      const a = nodeIndex.get(xi + ',' + zi);
      if (xi < 8) edges.push({ a, b: nodeIndex.get((xi + 1) + ',' + zi) });
      if (zi < 8) edges.push({ a, b: nodeIndex.get(xi + ',' + (zi + 1)) });
    }
  }
  const roads = [];
  for (const e of edges) { const A = nodes[e.a], B = nodes[e.b]; roads.push({ x1: A.x, z1: A.z, x2: B.x, z2: B.z }); }

  // Random car spawn points on road centrelines, facing along the road.
  const carSpawns = [];
  for (let i = 0; i < 60; i += 1) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(ROAD_LINES);
    const along = rng.range(-220, 220);
    carSpawns.push({ x: vertical ? line : along, z: vertical ? along : line,
      heading: vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) });
  }
  // Pedestrian spawns on sidewalks, near block edges.
  const pedSpawns = [];
  for (let i = 0; i < 80; i += 1) {
    const bx = rng.pick(blockCenters);
    const bz = rng.pick(blockCenters);
    pedSpawns.push({ x: bx + rng.pick([-19, 19, rng.range(-18, 18)]), z: bz + rng.range(-18, 18) });
  }

  function isRoad(x, z) {
    let best = Infinity;
    for (const line of ROAD_LINES) best = Math.min(best, Math.abs(x - line), Math.abs(z - line));
    return best < ROAD / 2;
  }

  function collideCircle(pos, r) {
    let hit = false;
    if (pos.x < -255) { pos.x = -255; hit = true; } if (pos.x > 255) { pos.x = 255; hit = true; }
    if (pos.z < -255) { pos.z = -255; hit = true; } if (pos.z > 255) { pos.z = 255; hit = true; }
    for (const b of buildings) {
      if (pos.x > b.minX - r && pos.x < b.maxX + r && pos.z > b.minZ - r && pos.z < b.maxZ + r) {
        const pushL = pos.x - (b.minX - r), pushR = (b.maxX + r) - pos.x;
        const pushB = pos.z - (b.minZ - r), pushF = (b.maxZ + r) - pos.z;
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) pos.x = b.minX - r;
        else if (m === pushR) pos.x = b.maxX + r;
        else if (m === pushB) pos.z = b.minZ - r;
        else pos.z = b.maxZ + r;
        hit = true;
      }
    }
    return hit;
  }

  G.world = {
    size: 478,
    blockSize: BLOCK,
    roadWidth: ROAD,
    roads,
    nodes,
    edges,
    buildings,
    colliders: buildings,
    spawn: { x: 0, z: 203, heading: Math.PI },
    missionSpots: {
      garage: { x: 0, z: 203 }, marina: { x: -203, z: 232 }, strip: { x: 0, z: 0 },
      harbor: { x: 203, z: -203 }, cannery: { x: -203, z: -203 },
    },
    carSpawns, pedSpawns, isRoad, collideCircle, nightLights,
  };
  return G.world;
}
