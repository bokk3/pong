import { Game } from './core/Game';

function showBootError(message: string): void {
  const text = document.getElementById('boot-text');
  const screen = document.getElementById('boot-screen');
  if (text) text.textContent = message;
  screen?.classList.add('boot-error');
}

function hideBootScreen(): void {
  const screen = document.getElementById('boot-screen');
  if (!screen) return;
  screen.classList.add('boot-hidden');
  window.setTimeout(() => screen.remove(), 600);
}

function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot(): void {
  const versionBadge = document.getElementById('version-badge');
  if (versionBadge) versionBadge.textContent = `v${__APP_VERSION__}`;

  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    showBootError('Something went wrong loading the game. Please refresh the page.');
    return;
  }

  if (!hasWebGL()) {
    showBootError('Your browser or device does not support WebGL, which Spin Pong 3D needs. Try an up-to-date Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is turned on.');
    return;
  }

  try {
    const game = new Game(canvas);
    game.start();
    hideBootScreen();
  } catch (err) {
    console.error('[SpinPong] Failed to start:', err);
    showBootError('The game failed to start on this device. Please refresh, or try another browser.');
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
