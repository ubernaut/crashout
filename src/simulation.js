// Deterministic scenario, in SI units internally. Flight-path integration keeps
// vertical speed and traveled distance consistent with the requested airspeed.
export const FT = 0.3048;
export const MPH = 0.44704;
export const KT = 0.514444;
export const SITE = { lat: 26.6325, lon: -80.1138, altitudeFt: 16 };
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
const radians = v => v * Math.PI / 180;
const degrees = v => v * 180 / Math.PI;
export const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
export function weatherAt(altitudeFt, time = 0) {
  // Surface anchor: KDJT 011753Z, 26C, 08016G28KT, OVC060, 10SM -RA.
  // Temperature aloft is a lapse-rate interpolation to the reported -47C;
  // it is deliberately not presented as a measured atmospheric sounding.
  const temperatureC = lerp(26, -47, clamp(altitudeFt / 35000));
  const cloud = smooth((altitudeFt - 5600) / 1200) * (1 - smooth((altitudeFt - 36500) / 6500));
  const turbulence = (0.35 + 0.65 * cloud) * (Math.sin(time * 2.1) * 0.55 + Math.sin(time * 4.7 + 1) * 0.3 + Math.sin(time * 8.3) * 0.15);
  return { temperatureC, cloud, turbulence, rain: altitudeFt < 14000 ? (0.35 + cloud * 0.4) : 0, ice: clamp((altitudeFt - 10000) / 14000) * 0.7, surfaceWindKt: 16, surfaceGustKt: 28, surfaceWindFrom: 80 };
}
export function makeCustomTrack() {
  const steps = 1200;
  const motion = u => {
    const speed = (100 + 700 * u ** 0.85) * MPH;
    const gamma = radians(4 + 79 * u ** 1.65);
    const heading = radians(90 + 185 * u ** 3);
    return { speed, gamma, heading, vertical: speed * Math.sin(gamma), horizontal: speed * Math.cos(gamma) };
  };
  let integral = 0;
  for (let i = 1; i <= steps; i++) integral += (motion((i - 1) / steps).vertical + motion(i / steps).vertical) / (2 * steps);
  const duration = (40000 - SITE.altitudeFt) * FT / integral;
  let north = 0, east = 0, height = 40000 * FT;
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, m = motion(u);
    if (i) {
      const midpoint = motion((i - 0.5) / steps), dt = duration / steps;
      // Use the observed surface wind only near the surface; upper-air winds
      // are unknown. The vertical taper is a disclosed scenario assumption.
      const wind = 16 * KT * clamp(1 - height / FT / 10000);
      north += (midpoint.horizontal * Math.cos(midpoint.heading) + wind * Math.cos(radians(260))) * dt;
      east += (midpoint.horizontal * Math.sin(midpoint.heading) + wind * Math.sin(radians(260))) * dt;
      height -= midpoint.vertical * dt;
    }
    samples.push({ time: u * duration, north, east, altitudeFt: height / FT, speedMph: m.speed / MPH, speedKt: m.speed / KT, verticalFpm: -m.vertical / FT * 60, heading: degrees(m.heading), pitch: -degrees(m.gamma), bank: 48 * Math.sin(Math.PI * u) ** 1.2, speedKind: 'TAS' });
  }
  const last = samples.at(-1);
  for (const sample of samples) {
    sample.lat = SITE.lat + degrees((sample.north - last.north) / 6378137);
    sample.lon = SITE.lon + degrees((sample.east - last.east) / (6378137 * Math.cos(radians(SITE.lat))));
  }
  samples[0].altitudeFt = 40000;
  last.altitudeFt = SITE.altitudeFt;
  last.speedMph = 800;
  return { id: 'custom', duration, samples, endsInImpact: true };
}
export function makeRecordedTrack(data) {
  const first = data.samples[0].timestamp;
  const samples = data.samples.map((s, i, a) => {
    const before = a[Math.max(0, i - 1)], after = a[Math.min(a.length - 1, i + 1)];
    const dt = Math.max(1, after.timestamp - before.timestamp);
    const vertical = (after.altitudeFt - before.altitudeFt) * FT / dt;
    const speed = s.groundspeedKt * KT;
    const turn = ((after.heading - before.heading + 540) % 360 - 180) / dt;
    return { ...s, time: s.timestamp - first, speedKt: s.groundspeedKt, speedMph: speed / MPH, verticalFpm: vertical / FT * 60, pitch: degrees(Math.atan2(vertical, Math.max(1, speed))), bank: clamp(degrees(Math.atan(speed * radians(turn) / 9.80665)), -65, 65), speedKind: 'GS' };
  });
  return { id: 'recorded', duration: samples.at(-1).time, samples, endsInImpact: false };
}
export function sampleTrack(track, time) {
  const t = clamp(time, 0, track.duration);
  let lo = 0, hi = track.samples.length - 1;
  while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (track.samples[mid].time <= t) lo = mid; else hi = mid; }
  const a = track.samples[lo], b = track.samples[hi];
  const f = clamp((t - a.time) / Math.max(0.0001, b.time - a.time));
  const sample = { time: t, speedKind: a.speedKind };
  for (const key of ['lat', 'lon', 'altitudeFt', 'speedMph', 'speedKt', 'verticalFpm', 'pitch', 'bank']) sample[key] = lerp(a[key], b[key], f);
  sample.heading = (a.heading + ((b.heading - a.heading + 540) % 360 - 180) * f + 360) % 360;
  sample.weather = weatherAt(sample.altitudeFt, t);
  sample.progress = t / track.duration;
  sample.finished = t >= track.duration;
  sample.impacted = sample.finished && track.endsInImpact;
  return sample;
}
