// Keyboard + mouse input for Neon Bay Heist: a live key set, edge-triggered presses
// (cleared once per frame), and accumulated pointer movement for the orbit camera.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  const GAME_KEYS = new Set([
    'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM',
    'Digit1', 'Digit2', 'ShiftLeft', 'ShiftRight',
  ]);

  window.addEventListener('keydown', (event) => {
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      mouseDX += event.movementX;
      mouseDY += event.movementY;
    }
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      mouseClicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  return {
    keys,
    pressed,
    down(code) {
      return keys.has(code);
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    takeMouse() {
      const delta = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return delta;
    },
    takeClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    isMouseDown() {
      return mouseDown;
    },
    endFrame() {
      pressed.clear();
    },
    lockPointer() {
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    },
    unlockPointer() {
      if (document.exitPointerLock) document.exitPointerLock();
    },
  };
}
