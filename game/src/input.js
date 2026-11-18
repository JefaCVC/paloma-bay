// input.js — keyboard + mouse state for PALOMA BAY.
// One object, updated by listeners: held keys, pressed-this-frame edges,
// mouse deltas (pointer lock), wheel steps, and click edges. The game reads
// it; nothing else touches the DOM events.

export function createInput() {
  const input = {
    keys: {}, // code -> held
    pressed: {}, // code -> pressed this frame (cleared by endFrame)
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    mousePressed: false, // left button pressed this frame
    rightDown: false,
    wheel: 0, // accumulated wheel steps this frame
    locked: false, // pointer lock active
    anyKey: false,
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    input.pressed[e.code] = true;
    input.anyKey = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.code] = false;
  });
  window.addEventListener('blur', () => {
    input.keys = {};
    input.mouseDown = false;
    input.rightDown = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) {
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = !!document.pointerLockElement;
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      input.mouseDown = true;
      input.mousePressed = true;
    } else if (e.button === 2) {
      input.rightDown = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
    else if (e.button === 2) input.rightDown = false;
  });
  window.addEventListener('wheel', (e) => {
    input.wheel += e.deltaY > 0 ? 1 : -1;
  }, { passive: true });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  input.endFrame = () => {
    input.pressed = {};
    input.mousePressed = false;
    input.mouseDX = 0;
    input.mouseDY = 0;
    input.wheel = 0;
    input.anyKey = false;
  };
  input.down = (code) => !!input.keys[code];
  input.hit = (code) => !!input.pressed[code];

  return input;
}

export function requestPointerLock(canvas) {
  try {
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  } catch (e) {
    // Pointer lock is a nicety, not a requirement.
  }
}

export function exitPointerLock() {
  try {
    if (document.exitPointerLock) document.exitPointerLock();
  } catch (e) {
    // ignore
  }
}
