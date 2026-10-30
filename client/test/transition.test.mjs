import test from 'node:test';
import assert from 'node:assert/strict';
import { fadeCurves, overlapTarget, leadSeconds, transitionStep } from '../src/audio/transition.js';

test('equal-power curves keep constant power', () => {
  const c = fadeCurves(64);
  for (let i = 0; i < 64; i++) assert.ok(Math.abs(c.out[i] ** 2 + c.in[i] ** 2 - 1) < 1e-6);
  assert.ok(Math.abs(c.out[0] - 1) < 1e-9 && Math.abs(c.in[0]) < 1e-9 && Math.abs(c.out[63]) < 1e-6 && Math.abs(c.in[63] - 1) < 1e-9);
});

test('which song overlaps next', () => {
  const q = [{ kind: 'local' }, { kind: 'local' }, { kind: 'video' }];
  assert.equal(overlapTarget({ index: 0, queue: q, repeat: 'off' }), 1);
  assert.equal(overlapTarget({ index: 1, queue: q, repeat: 'off' }), null);                     // next is a video
  assert.equal(overlapTarget({ index: 0, queue: q, repeat: 'one' }), null);
  assert.equal(overlapTarget({ index: 0, queue: q, repeat: 'off', sleepSong: true }), null);    // sleep timer: stop after this song
  assert.equal(overlapTarget({ index: 1, queue: [q[0], q[1]], repeat: 'all' }), 0);              // wraps with repeat-all
  assert.equal(overlapTarget({ index: 1, queue: [q[0], q[1]], repeat: 'off' }), null);           // end of queue
  assert.equal(overlapTarget({ index: 0, queue: [q[0], { kind: 'local', missing: true }], repeat: 'off' }), null);
});

test('transition timing', () => {
  assert.equal(leadSeconds({ crossfade: 0, gapless: false }), -1);
  assert.equal(leadSeconds({ crossfade: 0, gapless: true }), 0.06);
  assert.equal(leadSeconds({ crossfade: 5, gapless: false }), 5);
  assert.equal(transitionStep({ remaining: 30, lead: 5, ready: false }), 'idle');
  assert.equal(transitionStep({ remaining: 8, lead: 5, ready: false }), 'prefetch');
  assert.equal(transitionStep({ remaining: 4.9, lead: 5, ready: false }), 'prefetch');   // not ready yet → keep preparing, fall back to normal end
  assert.equal(transitionStep({ remaining: 4.9, lead: 5, ready: true }), 'start');
  assert.equal(transitionStep({ remaining: 3, lead: -1, ready: true }), 'idle');
});
