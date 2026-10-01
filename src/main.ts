import './styles.css';
import { Game } from './core/Game';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;

if (!webglAvailable()) {
  ui.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#aaa;font-family:sans-serif">This game needs WebGL. Please use a modern desktop browser.</div>';
} else {
  const game = new Game(canvas, ui);
  game.start();
}
