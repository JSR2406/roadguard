import test from 'node:test';
import assert from 'node:assert/strict';
import { openStreetMapUrl } from '../src/device';

test('map link accepts bounded coordinates and rejects malformed values', () => {
  assert.match(openStreetMapUrl(19.076, 72.8777), /mlat=19.076/);
  assert.throws(() => openStreetMapUrl(91, 0));
  assert.throws(() => openStreetMapUrl(0, Number.NaN));
  assert.throws(() => openStreetMapUrl(0, 0, 21));
});
