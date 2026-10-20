import { randomBytes } from 'node:crypto';
import { writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output') {
  console.error('Usage: npm run provision -- --output ./secrets/roadguard-auth.json');
  process.exitCode = 1;
} else {
  try {
    const output = path.resolve(args[1]);
    if (!statSync(path.dirname(output)).isDirectory()) throw new Error('Parent is not a directory');
    const credential = (role, extra = {}) => ({ role, token: randomBytes(32).toString('hex'), ...extra });
    const credentials = [credential('reader'), credential('authority'), credential('source', { sourceId: 'dashcam-A', sourceType: 'dashcam' }), credential('source', { sourceId: 'dashcam-B', sourceType: 'dashcam' }), credential('source', { sourceId: 'cctv-01', sourceType: 'cctv' })];
    writeFileSync(output, JSON.stringify({ credentials }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.info('Private credential configuration created. Tokens are not printed. Restrict Windows ACLs or Unix permissions; provision each device separately.');
  } catch { console.error('Provisioning failed. Check that the parent exists and destination does not already exist.'); process.exitCode = 1; }
}
