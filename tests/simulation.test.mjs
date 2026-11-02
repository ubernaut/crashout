import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeCustomTrack, makeRecordedTrack, sampleTrack, SITE, FT, MPH, weatherAt } from '../src/simulation.js';
import { radioTime, RADIO_CUE } from '../src/radio.js';
test('requested endpoints, ground location and bounded scrubbing', () => {
  const track = makeCustomTrack();
  const start = sampleTrack(track, -100), end = sampleTrack(track, Infinity);
  assert.equal(start.altitudeFt, 40000); assert.equal(start.speedMph, 100);
  assert.equal(end.altitudeFt, SITE.altitudeFt); assert.equal(end.speedMph, 800);
  assert.equal(end.lat, SITE.lat); assert.equal(end.lon, SITE.lon);
  assert.equal(end.impacted, true);
  let previous = start;
  for (let t = 1; t < track.duration; t += .5) {
    const s = sampleTrack(track, t);
    assert.ok(s.altitudeFt < previous.altitudeFt); assert.ok(s.speedMph >= previous.speedMph);
    assert.ok(Math.abs(s.verticalFpm * FT / 60) <= s.speedMph * MPH + .1, 'vertical velocity cannot exceed total airspeed');
    assert.ok(Object.values(s).filter(v => typeof v === 'number').every(Number.isFinite)); previous = s;
  }
});
test('altitude derivative agrees with instrument vertical speed', () => {
  const track = makeCustomTrack();
  for (let t = 5; t < track.duration - 5; t += 5) {
    const a = sampleTrack(track, t - .05), b = sampleTrack(track, t + .05), sample = sampleTrack(track, t);
    assert.ok(Math.abs((b.altitudeFt - a.altitudeFt) / .1 * 60 - sample.verticalFpm) < 80);
  }
});
test('published data remains available without an inferred tail', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/recorded-track.json', import.meta.url)));
  const track = makeRecordedTrack(data, { continueToImpact: false }), end = sampleTrack(track, track.duration);
  assert.equal(track.duration, 97); assert.equal(end.altitudeFt, 8750); assert.equal(end.speedKt, 275);
  assert.equal(end.speedKind, 'GS'); assert.equal(end.finished, true); assert.equal(end.impacted, false);
});
test('recorded replay preserves every source point and marks its continuous extension to ground', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/recorded-track.json', import.meta.url)));
  const track = makeRecordedTrack(data);
  for (let i = 0; i < data.samples.length; i++) {
    assert.equal(track.samples[i].lat, data.samples[i].lat);
    assert.equal(track.samples[i].lon, data.samples[i].lon);
    assert.equal(track.samples[i].altitudeFt, data.samples[i].altitudeFt);
    assert.equal(track.samples[i].speedKt, data.samples[i].groundspeedKt);
  }
  assert.equal(track.recordedDuration, 97);
  const boundary = sampleTrack(track, 97), after = sampleTrack(track, 97.001), end = sampleTrack(track, track.duration);
  assert.equal(boundary.inferred, false); assert.equal(after.inferred, true);
  assert.ok(Math.abs(after.altitudeFt - boundary.altitudeFt) < 1);
  assert.equal(end.altitudeFt, SITE.altitudeFt); assert.equal(end.lat, SITE.lat); assert.equal(end.lon, SITE.lon); assert.equal(end.impacted, true);
  const tail = track.samples.slice(data.samples.length - 1);
  for (let i = 1; i < tail.length; i++) {
    assert.ok(tail[i].altitudeFt < tail[i - 1].altitudeFt);
    assert.ok(tail[i].motionMph > tail[i - 1].motionMph, 'total 3D speed must keep increasing until ground impact');
    assert.ok(Math.abs(tail[i].motionMph * MPH - Math.hypot(tail[i].speedMph * MPH, tail[i].verticalFpm * FT / 60)) < 1e-8);
    assert.ok(Number.isFinite(tail[i].pitch)); assert.ok(Number.isFinite(tail[i].heading));
  }
});
test('granular onset fills the coarse gap and preserves the measured timing evidence', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/recorded-track.json', import.meta.url)));
  assert.ok(data.samples.filter(s => s.source === 'granular').length > 30);
  const peak = data.samples.reduce((a, b) => a.altitudeFt >= b.altitudeFt ? a : b);
  assert.equal(peak.altitudeFt, 35450);
  assert.equal(peak.utc, '2026-11-01T17:48:14.875183000Z');
  assert.equal(data.timingEvidence.impactTimeMeasured, false);
  assert.ok(Math.abs(data.timingEvidence.measuredIntervalSeconds - 68.079828) < .001);
});
test('radio aligns impact after the supplied final phrase for both replay durations', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/recorded-track.json', import.meta.url)));
  for (const track of [makeCustomTrack(), makeRecordedTrack(data)]) {
    assert.ok(Math.abs(radioTime(track.duration, track.duration) - RADIO_CUE.phraseEnd - RADIO_CUE.impactDelay) < 1e-10);
    assert.ok(Math.abs(radioTime(track.duration - 5, track.duration) - (RADIO_CUE.phraseEnd + RADIO_CUE.impactDelay - 5)) < 1e-10);
  }
});
test('bundled building footprints are real closed polygons with explicit height provenance', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/buildings.json', import.meta.url)));
  assert.ok(data.features.length > 1000); assert.match(data.source, /api.openstreetmap.org/); assert.match(data.license, /odbl/);
  for (const f of data.features) {
    assert.ok(f.ring.length >= 4); assert.deepEqual(f.ring[0], f.ring.at(-1));
    assert.ok(f.ring.flat().every(Number.isFinite)); assert.ok(f.heightM > 0);
    assert.ok(['assumed', 'height', 'levels × assumed 3m'].includes(f.heightSource));
  }
});
test('weather is historical and altitude-dependent', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/weather-observations.json', import.meta.url)));
  const metar = data.observations.find(o => o.valid.endsWith('17:53'));
  assert.match(metar.metar, /08016G28KT 10SM -RA SCT026 SCT050 OVC060 26\/23 A3006/);
  assert.equal(weatherAt(0).temperatureC, 26); assert.equal(weatherAt(40000).temperatureC, -47);
  assert.equal(weatherAt(0).surfaceWindFrom, 80); assert.equal(weatherAt(0).rain, .35);
  assert.ok(weatherAt(15000).cloud > .9); assert.equal(weatherAt(1000).cloud, 0);
});
