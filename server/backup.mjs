import { DatabaseSync, backup } from 'node:sqlite';
import { statSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** SQLite's online backup includes committed WAL data; never copy only the live .sqlite file. */
export async function backupDatabase(databasePath, destination) {
  if (!statSync(databasePath).isFile() || !statSync(path.dirname(destination)).isDirectory()) throw new Error('Invalid backup paths');
  const output = path.resolve(destination);
  const fd = openSync(output, 'wx', 0o600); closeSync(fd);
  let db;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true });
    await backup(db, output);
    const check = new DatabaseSync(output, { readOnly: true });
    try { if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Integrity check failed'); }
    finally { check.close(); }
  } catch (error) { unlinkSync(output); throw error; }
  finally { db?.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--database' || args[2] !== '--output') {
    console.error('Usage: node server/backup.mjs --database /data/roadguard.sqlite --output /backups/new-snapshot.sqlite'); process.exitCode = 1;
  } else {
    try { await backupDatabase(args[1], args[3]); console.info('Database backup integrity verified. Protect the snapshot as private operational data.'); }
    catch { console.error('Backup failed. Verify paths, permissions and that destination is new.'); process.exitCode = 1; }
  }
}
