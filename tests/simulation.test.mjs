import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeCustomTrack, makeRecordedTrack, sampleTrack, SITE, FT, MPH, weatherAt } from '../src/simulation.js';
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
test('recorded replay preserves speeds and stops at received data without an invented impact', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/recorded-track.json', import.meta.url)));
  const track = makeRecordedTrack(data), end = sampleTrack(track, track.duration);
  assert.equal(track.duration, 97); assert.equal(end.altitudeFt, 8750); assert.equal(end.speedKt, 275);
  assert.equal(end.speedKind, 'GS'); assert.equal(end.finished, true); assert.equal(end.impacted, false);
});
test('weather is historical and altitude-dependent', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/weather-observations.json', import.meta.url)));
  const metar = data.observations.find(o => o.valid.endsWith('17:53'));
  assert.match(metar.metar, /08016G28KT 10SM -RA SCT026 SCT050 OVC060 26\/23 A3006/);
  assert.equal(weatherAt(0).temperatureC, 26); assert.equal(weatherAt(40000).temperatureC, -47);
  assert.equal(weatherAt(0).surfaceWindFrom, 80); assert.equal(weatherAt(0).rain, .35);
  assert.ok(weatherAt(15000).cloud > .9); assert.equal(weatherAt(1000).cloud, 0);
});
