import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_PROVIDER_PROFILES, selectPilotProvider } from '../map/providers';

test('Pune pilot map catalogue is explicit and fail-closed until licence/configuration is verified', () => {
  assert.equal(MAP_PROVIDER_PROFILES.length, 5);
  assert.equal(MAP_PROVIDER_PROFILES.find(item => item.id === 'osm-maplibre')?.status, 'not-configured');
  assert.throws(() => selectPilotProvider('osm-maplibre'), /not configured/);
  assert.ok(MAP_PROVIDER_PROFILES.every(item => item.routing && item.mapMatching));
});
