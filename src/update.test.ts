import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, expect, test } from 'bun:test';

import { runAutoUpdate } from './update.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

test('runAutoUpdate recovers from stale lock files', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'opencode-plugin-auto-update-'));
  tempDirs.push(configDir);

  const lockFile = join(configDir, '.auto-update.lock');
  await writeFile(
    lockFile,
    JSON.stringify(
      {
        pid: 999999,
        timestamp: Date.now() - 3 * 60 * 60 * 1000,
        hostname: 'test-host',
      },
      null,
      2
    ),
    'utf-8'
  );
  await writeFile(
    join(configDir, 'opencode.json'),
    JSON.stringify({ plugin: [] }, null, 2),
    'utf-8'
  );

  const logs: string[] = [];
  await runAutoUpdate({
    configDir,
    debug: false,
    intervalHours: 0,
    onLog: (message) => logs.push(message),
  });

  await expect(stat(lockFile)).rejects.toThrow();
  await expect(
    readFile(join(configDir, '.auto-update.json'), 'utf-8')
  ).resolves.toContain('lastRun');
  expect(logs).toContain('[auto-update] No plugins found to update.');
  expect(logs).not.toContain('[auto-update] Lock already held, skipping.');
});
