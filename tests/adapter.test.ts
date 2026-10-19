import test from 'node:test';
import assert from 'node:assert/strict';
// The boundary is intentionally a small runtime ESM module; this test is its typed consumer.
// @ts-expect-error no declaration file is desired for the server-only contract module
import { convertEnvelope, validateCameraEnvelope } from '../server/camera-contract.mjs';
import { SimulatedReplayAdapter } from '../adapter/camera-source';
import { FixedSegmentMatcher } from '../adapter/gps-route-matcher';

const now = 1_700_000_000_000;
const base = (overrides: Record<string, unknown> = {}) => ({
  version: 1, deviceId: 'device-1', sourceId: 'camera-1', sourceType: 'dashcam',
  captureTime: now - 1000, receiveTime: now - 900, frameId: 'frame-1', hazardType: 'pothole',
  lighting: 'day', confidence: 0.9, clearView: true,
  gps: { lat: 0, lon: 0.001, accuracyM: 4, headingDeg: 90, speedKph: 30, timestamp: now - 900 },
  ...overrides,
});
const matcher = new FixedSegmentMatcher({ segmentId: 'seg-a', origin: { lat: 0, lon: 0 }, lengthM: 300, headingDeg: 90 });

test('valid strict envelope validates', () => assert.equal(validateCameraEnvelope(base(), { now }).ok, true));
test('malformed and unknown fields are rejected', () => {
  assert.equal(validateCameraEnvelope(null, { now }).reason, 'malformed-envelope');
  assert.equal(validateCameraEnvelope({ ...base(), mystery: true }, { now }).reason, 'unknown-field');
});
test('duplicate frame IDs are rejected without guessing', () => {
  const seen = new Set<string>();
  assert.equal(convertEnvelope(base(), { now, matcher, seenFrameIds: seen }).ok, true);
  assert.equal(convertEnvelope(base(), { now, matcher, seenFrameIds: seen }).reason, 'duplicate-frame');
});
test('missing, stale, and inaccurate GPS are explicit rejections', () => {
  assert.equal(convertEnvelope(base({ gps: undefined }), { now, matcher }).reason, 'gps-required');
  assert.equal(convertEnvelope(base({ gps: { ...base().gps as object, timestamp: now - 200_000 } }), { now, matcher }).reason, 'stale-gps');
  assert.equal(convertEnvelope(base({ gps: { ...base().gps as object, accuracyM: 40 } }), { now, matcher }).reason, 'poor-gps-accuracy');
});
test('wrong heading and out-of-route are rejected', () => {
  assert.equal(convertEnvelope(base({ gps: { ...base().gps as object, headingDeg: 180 } }), { now, matcher }).reason, 'wrong-heading');
  assert.equal(convertEnvelope(base({ gps: { ...base().gps as object, lon: -0.001 } }), { now, matcher }).reason, 'out-of-route');
});
test('successful conversion produces the existing Observation shape', () => {
  const result = convertEnvelope(base(), { now, matcher });
  assert.equal(result.ok, true);
  assert.equal(result.observation?.id, 'frame-1');
  assert.equal(result.observation?.segmentId, 'seg-a');
  assert.equal(result.observation?.direction, 1);
  assert.ok(Math.abs((result.observation?.offsetM ?? 0) - 111.32) < 0.1);
  assert.equal(result.observation?.severity, 'medium');
});

test('simulated replay preserves order and enforces bounded input', async () => {
  const replay = new SimulatedReplayAdapter('camera-1', '{"frameId":"a"}\n{"frameId":"b"}', { maxBuffered: 2 });
  const frames: string[] = [];
  for await (const frame of replay.observations()) frames.push(frame);
  assert.deepEqual(frames, ['{"frameId":"a"}', '{"frameId":"b"}']);
  await assert.rejects(async () => new SimulatedReplayAdapter('camera-1', 'a\nb\nc', { maxBuffered: 2 }));
});
