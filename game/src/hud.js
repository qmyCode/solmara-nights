// Everything drawn in screen space: the HUD (health, cash, wanted stars, the objective
// panel, toasts, prompts, the bust warning), the story dialogue box, and the full-screen
// title, pause, death and busted overlays. The world itself is painted by main.js; this
// module only ever talks to the player.

import { MAP_H, MAP_W, drawMinimap } from './minimap.js';
import { nearestCar } from './player.js';

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(trial).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function panel(ctx, x, y, w, h, fill = 'rgba(16,24,32,0.78)') {
  ctx.fillStyle = fill;
  ctx.strokeStyle = 'rgba(255,209,102,0.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();
  ctx.stroke();
}

function drawStars(ctx, state, x, y) {
  // A dark pill behind the stars: gold on a sunlit roof would wash out otherwise.
  panel(ctx, x - 9, y - 25, 148, 48);
  ctx.font = '24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < state.wanted ? '#ffcf3f' : 'rgba(255,255,255,0.28)';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText('★', x + i * 26, y);
  }
  if (state.wanted > 0) {
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = '#ff8a7a';
    ctx.fillText('WANTED', x + 2, y + 15);
  }
}

function drawObjective(ctx, state, view) {
  const m = state.mission;
  ctx.font = '700 14px system-ui, sans-serif';
  const title = m.storyDone && m.index >= 3 ? m.title : `MISSION — ${m.title.toUpperCase()}`;
  const lines = wrapText(ctx, m.text, 400);
  const h = 30 + lines.length * 17;
  const x = Math.max(14, view.w / 2 - 225);
  panel(ctx, x, 12, 450, h);
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 14, 32);
  ctx.font = '13.5px system-ui, sans-serif';
  ctx.fillStyle = '#f5efe2';
  lines.forEach((line, i) => ctx.fillText(line, x + 14, 52 + i * 17));
}

export function drawHUD(ctx, state, view) {
  // Health and cash, top-left.
  panel(ctx, 14, 12, 218, 64);
  ctx.fillStyle = '#f5efe2';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('RICO', 26, 31);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(64, 21, 156, 11);
  ctx.fillStyle = state.player.health > 30 ? '#5ec962' : '#e4572e';
  ctx.fillRect(64, 21, 156 * Math.max(0, state.player.health / 100), 11);
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(`$${state.cash}`, 26, 62);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(245,239,226,0.75)';
  ctx.fillText(state.audio.isMuted() ? 'sound off (M)' : 'M — mute', 118, 62);
  if (state.player.car) {
    panel(ctx, 14, 84, 218, 34);
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = '#f5efe2';
    ctx.fillText(state.player.car.type.label.toUpperCase(), 26, 99);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(26, 105, 194, 6);
    ctx.fillStyle = state.player.car.health > 35 ? '#7fb5d9' : '#e4572e';
    ctx.fillRect(26, 105, 194 * Math.max(0, state.player.car.health / 100), 6);
  }

  drawObjective(ctx, state, view);
  drawMinimap(ctx, state, view.w - MAP_W - 14, 12);
  drawStars(ctx, state, view.w - MAP_W - 12, MAP_H + 40);

  // Bust warning: pinned by an interceptor.
  if (state.busting) {
    ctx.font = '800 21px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = Math.floor(state.time * 6) % 2 === 0 ? '#ff3b30' : '#ffffff';
    ctx.fillText('⚠ THE POLICÍA HAVE YOU PINNED — MOVE! ⚠', view.w / 2, view.h - 148);
  }

  // Context prompt.
  if (!state.player.car && !state.player.dead && !state.dialogue) {
    const car = nearestCar(state);
    if (car) {
      ctx.font = '700 14.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`E — Get in the ${car.type.label}`, view.w / 2, view.h - 118);
    }
  }
  if (state.player.car && Math.abs(state.player.car.speed) < 24) {
    ctx.font = '600 12.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(245,239,226,0.8)';
    ctx.fillText('E — Get out', view.w / 2, view.h - 118);
  }

  // Toast line.
  if (state.toast && state.toastT > 0) {
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(state.toast).width + 34;
    panel(ctx, view.w / 2 - w / 2, view.h - 96, w, 34, 'rgba(60,30,8,0.85)');
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(state.toast, view.w / 2, view.h - 74);
  }

  drawDialogue(ctx, state, view);

  // Damage vignette and the death / busted washes.
  if (!state.player.car && state.player.health < 32 && !state.player.dead) {
    const grad = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h / 3, view.w / 2, view.h / 2, view.h / 1.15);
    grad.addColorStop(0, 'rgba(180,20,20,0)');
    grad.addColorStop(1, 'rgba(180,20,20,0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, view.w, view.h);
  }
  if (state.player.dead) {
    ctx.fillStyle = 'rgba(120,10,10,0.45)';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('WRECKED', view.w / 2, view.h / 2 - 8);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('The Clínica Solmara is on its way…', view.w / 2, view.h / 2 + 24);
  }
  if (state.bustedFlash > 0) {
    ctx.fillStyle = `rgba(38,84,124,${Math.min(0.4, state.bustedFlash * 0.3)})`;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('BUSTED', view.w / 2, view.h / 2 - 8);
  }
}

export function drawDialogue(ctx, state, view) {
  const dlg = state.dialogue;
  if (!dlg) return;
  const w = Math.min(680, view.w - 60);
  const x = view.w / 2 - w / 2;
  const y = view.h - 108;
  panel(ctx, x, y, w, 84, 'rgba(12,18,26,0.92)');
  ctx.textAlign = 'left';
  ctx.font = '700 12.5px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText(dlg.speaker.toUpperCase(), x + 16, y + 21);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#f5efe2';
  const lines = wrapText(ctx, dlg.lines[dlg.i], w - 32);
  lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, x + 16, y + 43 + i * 19));
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(245,239,226,0.65)';
  ctx.textAlign = 'right';
  ctx.fillText(dlg.i < dlg.lines.length - 1 ? 'click / E ▸' : 'click / E — got it', x + w - 14, y + 76);
}

export function drawTitleScreen(ctx, state, view, hasSave) {
  const grad = ctx.createLinearGradient(0, 0, 0, view.h);
  grad.addColorStop(0, 'rgba(38,16,48,0.55)');
  grad.addColorStop(0.55, 'rgba(90,30,40,0.35)');
  grad.addColorStop(1, 'rgba(20,20,30,0.78)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = '800 74px system-ui, sans-serif';
  ctx.fillText('SOLMARA', view.w / 2, view.h / 2 - 118);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText('N I G H T S', view.w / 2, view.h / 2 - 70);
  ctx.font = '16.5px system-ui, sans-serif';
  ctx.fillStyle = '#f5efe2';
  const intro = [
    'A sun-drowned city of avenues, beaches and bad decisions.',
    'You are Rico Solano, a wheelman with empty pockets and a phone that just rang.',
    'Steal cars. Run jobs for Marina. Outrun the Policía. Get rich or get busted.',
  ];
  intro.forEach((line, i) => ctx.fillText(line, view.w / 2, view.h / 2 - 22 + i * 24));
  ctx.font = '600 14.5px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(245,239,226,0.9)';
  ctx.fillText('WASD / arrows — move & drive      Mouse — aim      Click — shoot', view.w / 2, view.h / 2 + 66);
  ctx.fillText('E — enter / exit car      P — pause      M — mute', view.w / 2, view.h / 2 + 90);
  ctx.font = '800 21px system-ui, sans-serif';
  ctx.fillStyle = Math.floor(state.time * 1.6) % 2 === 0 ? '#ffd166' : '#ffffff';
  ctx.fillText(hasSave ? 'ENTER — Continue      N — New game' : 'CLICK OR PRESS ENTER TO START', view.w / 2, view.h / 2 + 138);
}

export function drawPauseScreen(ctx, state, view) {
  ctx.fillStyle = 'rgba(10,14,20,0.66)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText('PAUSED', view.w / 2, view.h / 2 - 40);
  ctx.font = '15.5px system-ui, sans-serif';
  ctx.fillStyle = '#f5efe2';
  ctx.fillText('P — resume      E — enter / exit car      M — mute', view.w / 2, view.h / 2 + 4);
  ctx.fillText('Your progress saves itself after every job.', view.w / 2, view.h / 2 + 30);
  ctx.fillText(`Cash $${state.cash} · Errands done: ${state.stats.errandsDone} · Wanted: ${state.wanted}★`, view.w / 2, view.h / 2 + 56);
}
