import { Game } from './core/Game';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('WebGL canvas element not found!');
    return;
  }

  const game = new Game(canvas);
  game.start();
});
