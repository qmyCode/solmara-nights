// Cash pickups: bundles of notes somebody left around Solmara — behind the casino, on the
// pier, in the warehouse alleys. Walking over one pockets the money with a chime; they
// respawn after a while so a broke wheelman always has a way back into the game.

const PICKUP_SPOTS = [
  { x: 580, y: 700 }, // south edge of the north-west block
  { x: 1500, y: 860 }, // behind Café Brisa
  { x: 2580, y: 700 }, // near the Comisaría (bold)
  { x: 700, y: 1620 }, // west avenue, mid-city
  { x: 1540, y: 2960 }, // halfway down the pier
  { x: 2450, y: 1620 }, // east side
  { x: 1080, y: 2360 }, // beach avenue west junction
  { x: 2900, y: 2560 }, // east end of the beach
];
const RESPAWN_SECONDS = 45;

export function createPickups() {
  return PICKUP_SPOTS.map((spot) => ({ ...spot, amount: 25, taken: false, timer: 0 }));
}

export function updatePickups(state, dt) {
  for (const pickup of state.pickups) {
    if (pickup.taken) {
      pickup.timer -= dt;
      if (pickup.timer <= 0) pickup.taken = false;
      continue;
    }
    if (state.player.car || state.player.dead) continue;
    const d = Math.hypot(state.player.x - pickup.x, state.player.y - pickup.y);
    if (d < 24) {
      pickup.taken = true;
      pickup.timer = RESPAWN_SECONDS;
      state.cash += pickup.amount;
      state.audio.pickup();
      state.toast = `Found $${pickup.amount} in small bills.`;
      state.toastT = 1.6;
    }
  }
}

export function drawPickups(ctx, state) {
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    const bob = Math.sin(state.time * 3 + pickup.x * 0.1) * 2.6;
    ctx.fillStyle = 'rgba(255,215,90,0.30)';
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y + bob, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f9e44';
    ctx.fillRect(pickup.x - 8, pickup.y - 5 + bob, 16, 10);
    ctx.fillStyle = '#e8f5e9';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', pickup.x, pickup.y + 3 + bob);
  }
}
