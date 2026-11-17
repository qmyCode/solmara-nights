// All sound is synthesised with WebAudio — no audio files. A tiny engine hum whose pitch
// follows the car's speed, a two-tone police siren that sounds while a chase is close,
// one-shot noises for gunshots, impacts and cash pickups, and a soft success chime for
// mission rewards. M toggles mute. The context is created lazily on the first user gesture,
// as browsers require, and every call is safe before that (it just stays silent).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    return true;
  }

  function blip(freqA, freqB, seconds, type, volume) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function noise(seconds, volume, filterFreq) {
    if (!ensure()) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** speedRatio 0..1 drives the engine note; 0 (or on foot) silences it. */
    engine(speedRatio) {
      if (!ctx) return;
      const target = speedRatio > 0.02 ? 0.05 + speedRatio * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, ctx.currentTime, 0.08);
    },
    /** active while police are near: the siren wails between two tones. */
    siren(active, dt) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(active ? 0.035 : 0, ctx.currentTime, 0.15);
      if (active) {
        sirenTimer += dt;
        sirenOsc.frequency.value = Math.floor(sirenTimer * 1.6) % 2 === 0 ? 660 : 880;
      }
    },
    shot() {
      noise(0.13, 0.5, 2600);
      blip(220, 40, 0.1, 'square', 0.16);
    },
    hit() {
      noise(0.08, 0.3, 900);
    },
    crash() {
      noise(0.28, 0.55, 500);
      blip(120, 35, 0.25, 'sawtooth', 0.2);
    },
    pickup() {
      blip(880, 1320, 0.12, 'sine', 0.22);
    },
    cash() {
      blip(990, 990, 0.07, 'square', 0.14);
      setTimeout(() => blip(1320, 1320, 0.1, 'square', 0.14), 60);
    },
    door() {
      blip(180, 90, 0.09, 'sine', 0.25);
    },
    busted() {
      blip(392, 392, 0.16, 'triangle', 0.2);
      setTimeout(() => blip(311, 311, 0.16, 'triangle', 0.2), 170);
      setTimeout(() => blip(262, 196, 0.3, 'triangle', 0.2), 340);
    },
  };
}
