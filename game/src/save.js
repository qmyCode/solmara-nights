// Save and load through localStorage: cash, story progress, position and health. The save
// is written when a mission completes, when an errand lands, and on a slow autosave timer in
// main.js. Storage can be unavailable (private windows), so every call is wrapped and a
// failed save simply means the run lasts for this visit only.

const SAVE_KEY = 'solmara-nights-save-v1';

/** Persist the parts of the state worth keeping between visits. */
export function saveGame(state) {
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        cash: state.cash,
        missionIndex: state.mission.index,
        storyDone: state.mission.storyDone,
        errandsDone: state.stats.errandsDone,
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        health: Math.round(state.player.health),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** The saved game as a plain object, or null when there is none worth continuing. */
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
