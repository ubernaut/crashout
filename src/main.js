import './styles.css';
import { makeCustomTrack, makeRecordedTrack, sampleTrack, clamp, SITE } from './simulation.js';
import { CockpitGlobe } from './globe.js';
import { WindshieldWeather, SimulationAudio } from './weather.js';
import { sources } from './evidence.js';

const $ = id => document.getElementById(id);
const compactPanels = matchMedia('(max-width: 760px)');
const panels = [$('telemetry-panel'), $('environment-panel')];
const setPanelDefaults = () => panels.forEach(panel => { panel.open = !compactPanels.matches; });
setPanelDefaults();
compactPanels.addEventListener('change', setPanelDefaults);
panels.forEach(panel => {
  const summary = panel.querySelector('summary');
  const label = panel.id === 'telemetry-panel' ? 'flight telemetry' : 'environment';
  const updateTitle = () => { summary.title = `${panel.open ? 'Minimize' : 'Restore'} ${label}`; };
  panel.addEventListener('toggle', updateTitle);
  updateTitle();
});
const number = value => Math.round(value).toLocaleString('en-US');
const timecode = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const state = { playing: false, time: 0, rate: 1, weather: true, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, track: makeCustomTrack(), ready: false };
const audio = new SimulationAudio();
const windshield = new WindshieldWeather($('weather-canvas'));
let globe;
function status(message) { $('render-status').hidden = false; $('render-status').textContent = message; }
try {
  globe = new CockpitGlobe($('globe'), status);
  globe.setTrack(state.track);
  globe.ready.then(() => { $('loading').hidden = true; });
} catch (error) {
  $('loading').hidden = true;
  status(`3D view could not initialize. Enable WebGL in your browser and reload. ${error.message}`);
}
$('motion').checked = state.motion;

for (const source of sources) {
  const li = document.createElement('li'), a = document.createElement('a');
  a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = source.title;
  li.append(a, document.createTextNode(` — ${source.detail}`)); $('source-list').append(li);
}
$('sources-button').onclick = () => $('sources-dialog').showModal();
$('close-sources').onclick = () => $('sources-dialog').close();
$('sources-dialog').addEventListener('click', e => { if (e.target === $('sources-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });

function setPlaying(value) {
  if (value && state.time >= state.track.duration) state.time = 0;
  state.playing = value;
  $('play').ariaLabel = value ? 'Pause descent' : 'Play descent';
  $('play').innerHTML = value ? '<svg viewBox="0 0 20 20"><path d="M5 3h4v14H5zm7 0h4v14h-4z"/></svg>' : '<svg viewBox="0 0 20 20"><path d="m6 3 11 7-11 7z"/></svg>';
  $('play-state').textContent = value ? 'PLAYING' : state.time >= state.track.duration ? 'COMPLETE' : 'PAUSED';
}
$('play').onclick = () => setPlaying(!state.playing);
$('reset').onclick = () => { state.time = 0; setPlaying(false); };
$('replay').onclick = () => { state.time = 0; setPlaying(true); };
$('rate').onchange = e => { state.rate = Number(e.target.value); };
$('timeline').oninput = e => { state.time = Number(e.target.value) * state.track.duration; if (state.time >= state.track.duration) setPlaying(false); };
document.querySelectorAll('[data-seek]').forEach(button => { button.onclick = () => { state.time = Number(button.dataset.seek) * state.track.duration; if (state.time >= state.track.duration) setPlaying(false); }; });
$('satellite').onchange = e => { if (globe) globe.imagery.show = e.target.checked; };
$('weather').onchange = e => { state.weather = e.target.checked; };
$('motion').onchange = e => { state.motion = e.target.checked; };
function switchView() {
  if (!globe) return;
  const overview = globe.toggleOverview();
  $('flight-view').classList.toggle('overview', overview);
  $('view-mode').ariaLabel = overview ? 'Switch to cockpit' : 'Switch to overview';
  $('view-mode').title = overview ? 'Switch to cockpit (V)' : 'Switch to overview (V)';
  $('view-mode').ariaPressed = String(overview);
}
$('view-mode').onclick = switchView;
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('app').requestFullscreen(); }
  catch { status('Fullscreen is unavailable in this browser.'); }
};
$('sound').onclick = async () => {
  try { const enabled = await audio.toggle(); $('sound').ariaPressed = String(enabled); $('sound').querySelector('span').textContent = enabled ? 'Sound on' : 'Sound off'; }
  catch { status('Audio is unavailable in this browser.'); }
};
window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'SUMMARY'].includes(document.activeElement.tagName) || $('sources-dialog').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
  if (e.key.toLowerCase() === 'v') switchView();
  if (e.key === 'ArrowRight') { e.preventDefault(); state.time = clamp(state.time + 5, 0, state.track.duration); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); state.time = clamp(state.time - 5, 0, state.track.duration); }
});

let recorded;
$('profile').onchange = async e => {
  setPlaying(false);
  const id = e.target.value;
  if (id === 'recorded' && !recorded) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/recorded-track.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      recorded = makeRecordedTrack(await response.json());
    } catch (error) { status(`Published track could not load: ${error.message}`); e.target.value = state.track.id; return; }
  }
  state.track = id === 'recorded' ? recorded : makeCustomTrack(); state.time = 0;
  globe?.setTrack(state.track);
  $('mode-label').textContent = id === 'recorded' ? 'PUBLISHED ADS-B TRACK' : 'CUSTOM SCENARIO';
  document.querySelector('.telemetry-grid>div>span').textContent = id === 'recorded' ? 'GROUNDSPEED' : 'TRUE AIRSPEED';
  document.querySelector('.speed-tape small').textContent = id === 'recorded' ? 'GS KT' : 'TAS KT';
  $('provenance-note').textContent = id === 'recorded' ? 'ADS-B · Published positions & groundspeed; attitude inferred. Ends at 8,750 ft.' : 'SCENARIO · User-set speed endpoints; inferred path and attitude.';
  document.querySelector('.timeline-markers button:last-child').textContent = id === 'recorded' ? 'LAST SAMPLE' : 'IMPACT';
  $('impact-card').querySelector('h2').textContent = id === 'recorded' ? 'End of received data' : 'Ground impact';
  $('impact-card').querySelector('p:last-of-type').textContent = id === 'recorded' ? 'The replay stops here. The final impact is not in this published track.' : 'Impact speed and final trajectory are modeled assumptions.';
  $('impact-card').querySelector('.eyebrow').textContent = id === 'recorded' ? 'PUBLISHED TRACK ENDS' : 'END OF SCENARIO';
  $('replay').textContent = id === 'recorded' ? '↻ Replay track' : '↻ Replay descent';
  drawChart(); drawNavPath();
};

function navXY(sample) { return { x: 160 + (sample.lon - SITE.lon) * 470, y: 118 - (sample.lat - SITE.lat) * 470 }; }
function drawNavPath() {
  $('nav-path').setAttribute('d', state.track.samples.filter((_, i) => i % Math.max(1, Math.floor(state.track.samples.length / 100)) === 0).map((s, i) => { const p = navXY(s); return `${i ? 'L' : 'M'}${p.x},${p.y}`; }).join(' '));
  $('nav-site').setAttribute('cx', 160); $('nav-site').setAttribute('cy', 118); $('nav-site-label').setAttribute('x', 167); $('nav-site-label').setAttribute('y', 121);
}
function drawChart() {
  const canvas = $('chart'), rect = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  ctx.strokeStyle = '#8298a31a'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { const y = i * (h - 2) / 2 + 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(w * i / 8, 0); ctx.lineTo(w * i / 8, h); ctx.stroke(); }
  const plot = (key, max, color, fill = false) => {
    ctx.beginPath(); state.track.samples.forEach((s, i) => { const x = s.time / state.track.duration * w, y = h - 2 - s[key] / max * (h - 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke();
    if (fill) { ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, '#dfb67b16'); gradient.addColorStop(1, '#dfb67b00'); ctx.fillStyle = gradient; ctx.fill(); }
  };
  plot('altitudeFt', 40000, '#dfb67b', true); plot('speedMph', 850, '#80acb1');
}
new ResizeObserver(drawChart).observe($('chart'));
drawNavPath();

let last = performance.now(), lastUi = 0;
function frame(now) {
  const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
  if (state.playing && !$('sources-dialog').open) {
    state.time = Math.min(state.track.duration, state.time + dt * state.rate);
    if (state.time >= state.track.duration) setPlaying(false);
  }
  const sample = sampleTrack(state.track, state.time);
  if (now - lastUi > 30) {
    lastUi = now;
    globe?.update(sample, state);
    windshield.draw(sample, state.weather);
    $('altitude').textContent = number(sample.altitudeFt);
    $('speed').innerHTML = `${number(sample.speedMph)} <small>MPH</small>`;
    $('vs').innerHTML = `${number(sample.verticalFpm)} <small>FT/MIN</small>`;
    $('heading').innerHTML = `${String(Math.round(sample.heading) % 360).padStart(3, '0')}<small>°</small>`;
    $('temperature').innerHTML = `${Math.round(sample.weather.temperatureC)}<small>°C</small>`;
    $('altitude-bar').style.width = `${sample.altitudeFt / 40000 * 100}%`;
    $('phase').textContent = sample.finished ? state.track.endsInImpact ? '04 / GROUND IMPACT' : '04 / LAST RECEIVED SAMPLE' : sample.progress < .2 ? '01 / DESCENT ENTRY' : sample.progress < .55 ? '02 / ACCELERATING DESCENT' : '03 / STEEP DESCENT';
    $('elapsed').textContent = timecode(state.time); $('duration').textContent = timecode(state.track.duration);
    $('timeline').value = sample.progress; $('timeline').setAttribute('aria-valuetext', `${timecode(state.time)} of ${timecode(state.track.duration)}, ${number(sample.altitudeFt)} feet, ${number(sample.speedMph)} miles per hour`);
    $('playhead').style.left = `${sample.progress * 100}%`;
    $('ice').style.opacity = state.weather ? sample.weather.ice : 0;
    $('attitude-world').style.transform = `rotate(${-sample.bank}deg) translateY(${sample.pitch * 1.1}px)`;
    $('standby-horizon').style.transform = `rotate(${-sample.bank}deg) translateY(${sample.pitch * .3}px)`;
    $('pfd-speed').textContent = Math.round(sample.speedKt); $('pfd-alt').textContent = Math.round(sample.altitudeFt);
    const speedTick = Math.round(sample.speedKt / 20) * 20, altTick = Math.round(sample.altitudeFt / 1000) * 1000;
    $('speed-ticks').textContent = `${speedTick + 40}\n${speedTick + 20}\n${speedTick}\n${Math.max(0, speedTick - 20)}\n${Math.max(0, speedTick - 40)}`;
    $('alt-ticks').textContent = `${altTick + 2000}\n${altTick + 1000}\n${altTick}\n${Math.max(0, altTick - 1000)}\n${Math.max(0, altTick - 2000)}`;
    const hdg = `${String(Math.round(sample.heading) % 360).padStart(3, '0')}° T`;
    $('pfd-heading').textContent = hdg; $('nav-heading').textContent = hdg;
    const soundSpeed = Math.sqrt(1.4 * 287.05 * (sample.weather.temperatureC + 273.15));
    $('mach').textContent = sample.speedKind === 'GS' ? 'GS ONLY' : `M ${(sample.speedMph * .44704 / soundSpeed).toFixed(3)}`;
    const nav = navXY(sample); $('nav-plane').setAttribute('transform', `translate(${nav.x},${nav.y}) rotate(${sample.heading})`);
    const distance = Math.hypot((sample.lat - SITE.lat) * 60, (sample.lon - SITE.lon) * 60 * Math.cos(SITE.lat * Math.PI / 180));
    $('nav-distance').textContent = `SITE ${distance.toFixed(1)} NM`;
    $('nav-gs').textContent = `${sample.speedKind} ${Math.round(sample.speedKt)} KT`;
    $('ice-warning').classList.toggle('active', state.weather && sample.weather.ice > .2);
    // Scenario thresholds are visual cues, not Learjet Vmo/Mmo or GPWS logic.
    $('overspeed-warning').classList.toggle('active', sample.speedKind === 'TAS' && sample.speedMph > 535);
    $('terrain-warning').classList.toggle('active', sample.altitudeFt < 5000);
    $('terrain-warning').classList.toggle('danger', sample.altitudeFt < 2500);
    $('pfd-mode').textContent = sample.finished ? state.track.endsInImpact ? 'IMPACT' : 'DATA END' : 'DESCENT';
    $('impact-card').hidden = !sample.finished;
    $('impact-detail').textContent = state.track.endsInImpact ? '800 mph · scenario target reached' : `${number(sample.altitudeFt)} ft · ${Math.round(sample.speedKt)} kt groundspeed`;
    window.__crashout = { ready: true, profile: state.track.id, sample, playing: state.playing, satellite: globe?.imagery.show, overview: globe?.overview, duration: state.track.duration, renderedFrames: globe?.renderedFrames, cameraPitch: globe?.viewer.camera.pitch, cameraHeading: globe?.viewer.camera.heading, renderLoop: globe?.viewer.useDefaultRenderLoop, weatherReady: globe?.weatherStage.ready };
  }
  audio.update(sample, state.playing && !$('sources-dialog').open);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('pagehide', () => { setPlaying(false); });
