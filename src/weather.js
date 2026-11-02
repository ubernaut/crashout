import { clamp } from './simulation.js';
export class WindshieldWeather {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drops = Array.from({ length: 120 }, (_, i) => ({ x: ((i * .61803398875) % 1), y: ((i * .381966) % 1), speed: 0.6 + ((i * .23) % 1), length: 6 + ((i * .77) % 1) * 25 }));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  draw(sample, enabled) {
    const { ctx, width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);
    if (!enabled) return;
    const intensity = sample.weather.rain || sample.weather.cloud * .22;
    ctx.strokeStyle = `rgba(218,232,239,${intensity * .28})`;
    ctx.lineWidth = .8;
    ctx.beginPath();
    for (const drop of this.drops) {
      const x = drop.x * w, y = ((drop.y + sample.time * .18 * drop.speed) % 1) * h;
      const dx = (x - w * .5) / w * 20, length = drop.length * clamp(sample.speedMph / 350, .5, 2);
      ctx.moveTo(x, y); ctx.lineTo(x + dx, y + length);
    }
    ctx.stroke();
  }
  destroy() { this.observer.disconnect(); }
}

export class SimulationAudio {
  constructor() { this.enabled = true; }
  async unlock() {
    if (!this.enabled) return false;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * .02) / 1.02; data[i] = last * 3.5; }
      this.noise = this.context.createBufferSource(); this.noise.buffer = buffer; this.noise.loop = true;
      this.filter = this.context.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 700;
      this.gain = this.context.createGain(); this.gain.gain.value = 0;
      this.noise.connect(this.filter).connect(this.gain).connect(this.context.destination); this.noise.start();
    }
    await this.context.resume();
    return true;
  }
  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) await this.unlock();
    else if (this.context) this.gain.gain.setTargetAtTime(0, this.context.currentTime, .1);
    return this.enabled;
  }
  update(sample, playing) {
    if (!this.context || !this.enabled) return;
    this.gain.gain.setTargetAtTime(playing ? .03 + sample.motionMph / 800 * .12 : 0, this.context.currentTime, .15);
    this.filter.frequency.setTargetAtTime(350 + sample.motionMph * 2, this.context.currentTime, .1);
  }
}
