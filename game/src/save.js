// Save/load Neon Bay Heist lewat localStorage. Satu key, satu versi,
// semua gagal I/O ditelan diam-diam supaya game tidak pernah crash karenanya.

export const SAVE_KEY = 'neon-bay-heist-save-v1';

export function saveGame(G) {
  try {
    const data = {
      version: 1,
      cash: G.player.cash,
      health: G.player.health,
      missionsDone: G.missions ? [...G.missions.done] : [],
      unlocked: G.missions ? [...G.missions.unlocked] : ['m1'],
      stats: G.stats ? { ...G.stats } : {},
      playerPos: { x: G.player.pos.x, z: G.player.pos.z },
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) {
    // Penyimpanan penuh / privat: abaikan, game tetap jalan.
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    if (typeof data.cash !== 'number' || Number.isNaN(data.cash)) return null;
    return data;
  } catch (err) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Abaikan.
  }
}
