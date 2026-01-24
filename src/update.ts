import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

import {
  acquireLock,
  readThrottleState,
  releaseLock,
  writeThrottleState,
} from './lock.js';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'opencode');

interface OpenCodeConfig {
  plugin?: string[];
  plugins?: string[];
  [key: string]: unknown;
}

export interface AutoUpdateOptions {
  configDir?: string;
  intervalHours?: number;
  disabled?: boolean;
  debug?: boolean;
  preservePinned?: boolean;
  ignoreThrottle?: boolean;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface UpdateResult {
  plugins: string[];
  changed: boolean;
}

export async function runAutoUpdate(options: AutoUpdateOptions = {}): Promise<void> {
  const disabled = options.disabled ?? envFlag('OPENCODE_AUTO_UPDATE_DISABLED');
  if (disabled) {
    return;
  }

  const debug = options.debug ?? envFlag('OPENCODE_AUTO_UPDATE_DEBUG');
  const ignoreThrottle = options.ignoreThrottle ?? envFlag('OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE');
  const intervalHours = options.intervalHours ?? envNumber('OPENCODE_AUTO_UPDATE_INTERVAL_HOURS', 24);
  const preservePinned = options.preservePinned ?? envFlag('OPENCODE_AUTO_UPDATE_PINNED');
  const configDir = options.configDir ?? DEFAULT_CONFIG_DIR;
  const configPath = join(configDir, 'opencode.json');

  const log = (...args: unknown[]) => {
    if (debug) {
      console.log(...args);
    }
  };

  const error = (...args: unknown[]) => {
    if (debug) {
      console.error(...args);
    }
  };

  const lockAcquired = await acquireLock({ debug, configDir });
  if (!lockAcquired) {
    log('[auto-update] Lock already held, skipping.');
    return;
  }

  try {
    const state = await readThrottleState({ configDir });
    const now = Date.now();
    const intervalMs = Math.max(intervalHours, 1) * 60 * 60 * 1000;

    if (!ignoreThrottle && state.lastRun && now - state.lastRun < intervalMs) {
      log('[auto-update] Throttled, skipping update.');
      return;
    }

    await writeThrottleState({ ...state, lastRun: now }, { debug, configDir });

    const config = await readConfig(configPath);
    const { plugins, key } = getPluginList(config);
    if (!plugins || plugins.length === 0 || !key) {
      log('[auto-update] No plugins found to update.');
      return;
    }

    const useBun = await commandExists('bun');
    log('[auto-update] Starting update', {
      pluginCount: plugins.length,
      useBun,
      preservePinned,
      ignoreThrottle,
    });
    const updateResult = await updatePlugins({
      plugins,
      configDir,
      preservePinned,
      useBun,
      log,
      error,
    });

    if (updateResult.changed) {
      const updatedConfig: OpenCodeConfig = { ...config, [key]: updateResult.plugins };
      await writeConfig(configPath, updatedConfig);
    }

    await writeThrottleState(
      { ...state, lastRun: now, lastSuccess: Date.now() },
      { debug, configDir }
    );
    log('[auto-update] Update complete.');
  } catch (err) {
    error('[auto-update] Failed to update plugins:', err);
  } finally {
    await releaseLock({ debug, configDir });
  }
}

async function readConfig(configPath: string): Promise<OpenCodeConfig | null> {
  try {
    const contents = await readFile(configPath, 'utf-8');
    return JSON.parse(contents) as OpenCodeConfig;
  } catch {
    return null;
  }
}

async function writeConfig(configPath: string, config: OpenCodeConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const contents = JSON.stringify(config, null, 2);
  await writeFile(configPath, `${contents}\n`, 'utf-8');
}

function getPluginList(config: OpenCodeConfig | null): {
  plugins: string[] | null;
  key: 'plugin' | 'plugins' | null;
} {
  if (!config) {
    return { plugins: null, key: null };
  }

  if (Array.isArray(config.plugin)) {
    return { plugins: config.plugin, key: 'plugin' };
  }

  if (Array.isArray(config.plugins)) {
    return { plugins: config.plugins, key: 'plugins' }; 
  }

  return { plugins: null, key: null };
}

async function updatePlugins(options: {
  plugins: string[];
  configDir: string;
  preservePinned: boolean;
  useBun: boolean;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}): Promise<UpdateResult> {
  const { plugins, configDir, preservePinned, useBun, log, error } = options;
  const updated: string[] = [];
  let changed = false;

  for (const entry of plugins) {
    if (isNonRegistryPlugin(entry)) {
      log('[auto-update] Skipping non-registry plugin:', entry);
      updated.push(entry);
      continue;
    }

    const { name, version } = parsePackageSpec(entry);
    if (preservePinned && version) {
      log('[auto-update] Preserving pinned plugin:', entry);
      updated.push(entry);
      continue;
    }

    log('[auto-update] Updating plugin:', name);
    const installedVersion = await installLatest({
      name,
      configDir,
      useBun,
      log,
      error,
    });

    if (!installedVersion) {
      updated.push(entry);
      continue;
    }

    const nextEntry = `${name}@${installedVersion}`;
    log('[auto-update] Installed:', nextEntry);
    updated.push(nextEntry);
    if (nextEntry !== entry) {
      changed = true;
    }
  }

  return { plugins: updated, changed };
}

async function installLatest(options: {
  name: string;
  configDir: string;
  useBun: boolean;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}): Promise<string | null> {
  const { name, configDir, useBun, log, error } = options;
  await mkdir(configDir, { recursive: true });

  if (useBun) {
    const result = await runCommand('bun', ['add', `${name}@latest`, '--cwd', configDir]);
    if (result.code !== 0) {
      error('[auto-update] bun add failed:', result.stderr || result.stdout);
      return null;
    }
  } else {
    const result = await runCommand('npm', [
      'install',
      `${name}@latest`,
      '--prefix',
      configDir,
      '--no-save',
    ]);
    if (result.code !== 0) {
      error('[auto-update] npm install failed:', result.stderr || result.stdout);
      return null;
    }
  }

  const version = await readInstalledVersion(name, configDir);
  if (!version) {
    log('[auto-update] Unable to read installed version for', name);
  }
  return version;
}

async function readInstalledVersion(name: string, configDir: string): Promise<string | null> {
  try {
    const packagePath = name.startsWith('@')
      ? join(configDir, 'node_modules', ...name.split('/'), 'package.json')
      : join(configDir, 'node_modules', name, 'package.json');
    const data = await readFile(packagePath, 'utf-8');
    const parsed = JSON.parse(data) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

function isNonRegistryPlugin(spec: string): boolean {
  const trimmed = spec.trim();
  if (!trimmed) {
    return true;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('file:') ||
    lower.startsWith('git+') ||
    lower.startsWith('git:') ||
    lower.startsWith('ssh://') ||
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('github:') ||
    lower.startsWith('workspace:')
  ) {
    return true;
  }

  return trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~');
}

function parsePackageSpec(spec: string): { name: string; version?: string } {
  if (spec.startsWith('@')) {
    const secondAt = spec.indexOf('@', 1);
    if (secondAt === -1) {
      return { name: spec };
    }
    return {
      name: spec.slice(0, secondAt),
      version: spec.slice(secondAt + 1) || undefined,
    };
  }

  const at = spec.lastIndexOf('@');
  if (at <= 0) {
    return { name: spec };
  }

  return {
    name: spec.slice(0, at),
    version: spec.slice(at + 1) || undefined,
  };
}

async function commandExists(command: string): Promise<boolean> {
  const result = await runCommand(command, ['--version']);
  return result.code === 0;
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: `${stderr}${err.message}` });
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function envFlag(name: string): boolean {
  return process.env[name]?.toLowerCase() === 'true';
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
