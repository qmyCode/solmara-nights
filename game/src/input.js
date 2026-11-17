// Keyboard and mouse state for the game: held keys by code, one-shot action flags for the
// keys a press (not a hold) should trigger, and the mouse position in screen pixels plus its
// click queue. main.js turns the screen mouse into a world position through the camera.

export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_MUTE = 8;

const ACTION_KEYS = {
  KeyE: ACTION_INTERACT,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyM: ACTION_MUTE,
};

export function createInput(canvas) {
  const held = new Set();
  const clicks = [];
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    const action = ACTION_KEYS[event.code];
    if (action) actions |= action;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('mousedown', (event) => {
    mouse.down = true;
    clicks.push({ x: mouse.x, y: mouse.y, button: event.button });
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    mouse,
    clicks,
    /** Movement axes from WASD or the arrow keys: {x: -1..1, y: -1..1}. */
    moveAxis() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    /** Driving input: throttle -1..1 (S brakes/reverses) and steer -1..1. */
    driveAxis() {
      const throttle = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      const steer = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      return { throttle, steer };
    },
    /** Read and clear the one-shot action flags gathered since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Read and clear the queued mouse clicks (screen pixels). */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
  };
}
