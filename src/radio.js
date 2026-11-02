// Editorial alignment of the supplied recording, not a verified UTC sync.
export const RADIO_CUE = { phraseEnd: 105.30, impactDelay: .35 };
export function radioTime(simulationTime, duration) {
  return simulationTime + RADIO_CUE.phraseEnd + RADIO_CUE.impactDelay - duration;
}
export class RecordedRadio {
  constructor(onError = () => {}) {
    this.media = new Audio();
    this.media.preload = 'auto';
    this.media.volume = .85;
    this.media.preservesPitch = true;
    this.enabled = true;
    this.pending = false;
    this.media.addEventListener('error', () => onError('Recorded ATC audio could not load.'));
    this.onError = onError;
    // A local Blob supports arbitrary seeking even on static preview servers
    // without byte-range responses. The complete clip is under one megabyte.
    this.ready = this.load().catch(() => onError('Recorded ATC audio could not load.'));
  }
  async load() {
    const response = await fetch(`${import.meta.env.BASE_URL}media/n722bd-atc.m4a`);
    if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
    this.url = URL.createObjectURL(await response.blob());
    this.media.src = this.url;
    this.media.load();
  }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.media.pause();
    return this.enabled;
  }
  // Unlock media from the Play/ATC click, including a profile's leading silence.
  unlock() {
    if (!this.enabled || !this.url || !this.media.paused || this.pending) return;
    this.media.muted = true;
    this.pending = true;
    this.media.play().then(() => { this.media.pause(); }).catch(() => {}).finally(() => { this.media.muted = false; this.pending = false; });
  }
  sync(time, duration, playing, rate = 1) {
    if (!this.enabled) { this.media.pause(); return; }
    const target = radioTime(time, duration);
    this.target = target;
    if (this.media.readyState === 0 || this.pending) return;
    const clamped = Math.max(0, Math.min(target, this.media.duration || Infinity));
    if (Math.abs(this.media.currentTime - clamped) > (playing ? .25 : .04)) this.media.currentTime = clamped;
    this.media.playbackRate = rate;
    const shouldPlay = playing && target >= 0 && target < this.media.duration;
    if (!shouldPlay) { this.media.pause(); return; }
    if (this.media.paused && !this.blocked) {
      this.pending = true;
      this.media.play().catch(() => {
        this.blocked = true;
        this.onError('Tap ATC off, then on, to allow recorded audio in this browser.');
      }).finally(() => { this.pending = false; });
    }
  }
}
