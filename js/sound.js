// Move sounds, made here with the Web Audio API: a short wooden "tock" (a burst of noise through a band-pass filter
// plus a low thump). No sound files, so nothing to license. Settings > Look turns them on or off and sets the volume.

import { look } from "./look.js";

let audio = null;

export function play(kind = "move") {
  const { sound, volume } = look();
  if (!sound || !volume) return;
  try {
    audio = audio || new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const t = audio.currentTime;
    const loud = volume * (kind === "capture" ? 1.25 : 1);
    const length = 0.055;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * length), audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 5);
    const noise = audio.createBufferSource();
    noise.buffer = buffer;
    const band = audio.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = kind === "capture" ? 1250 : kind === "check" ? 2400 : 1750;
    band.Q.value = 2.5;
    const g1 = audio.createGain();
    g1.gain.setValueAtTime(loud * 0.9, t);
    g1.gain.exponentialRampToValueAtTime(0.0008, t + length);
    noise.connect(band).connect(g1).connect(audio.destination);
    noise.start(t);
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(kind === "capture" ? 150 : 210, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    const g2 = audio.createGain();
    g2.gain.setValueAtTime(loud * 0.55, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
    osc.connect(g2).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.13);
    if (kind === "check" || kind === "end") {
      const ping = audio.createOscillator();
      ping.type = "triangle";
      ping.frequency.setValueAtTime(kind === "end" ? 660 : 880, t + 0.02);
      const g3 = audio.createGain();
      g3.gain.setValueAtTime(loud * 0.18, t + 0.02);
      g3.gain.exponentialRampToValueAtTime(0.0008, t + 0.35);
      ping.connect(g3).connect(audio.destination);
      ping.start(t + 0.02);
      ping.stop(t + 0.36);
    }
  } catch (e) { /* no audio on this device */ }
}
