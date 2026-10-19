import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupDatabase } from '../server/backup.mjs';

test('online backup preserves committed WAL data, restores cleanly and never overwrites a snapshot', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'roadguard-backup-'));
  const source = path.join(folder, 'live.sqlite');
  const destination = path.join(folder, 'snapshot.sqlite');
  const db = new DatabaseSync(source);
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE observations(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO observations VALUES(1, 'committed');");
    await backupDatabase(source, destination);
    const restored = new DatabaseSync(destination, { readOnly: true });
    try { assert.equal(restored.prepare('SELECT value FROM observations WHERE id=1').get()!.value, 'committed'); }
    finally { restored.close(); }
    await assert.rejects(backupDatabase(source, destination));
  } finally { db.close(); rmSync(folder, { recursive: true, force: true }); }
});
