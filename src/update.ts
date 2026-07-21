import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  type ParseError as JsoncParseError,
  printParseErrorCode,
} from 'jsonc-parser';

import {
  acquireLock,
  readThrottleState,
  releaseLock,
  writeThrottleState,
} from './lock.js';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'opencode');

/** Prefer OpenCode's JSONC config, then fall back to plain JSON. */
const CONFIG_FILENAMES = ['opencode.jsonc', 'opencode.json'] as const;

interface OpenCodeConfig {
  plugin?: string[];
  plugins?: string[];
  [key: string]: unknown;
}

interface LoadedConfig {
  path: string;
  /** Raw file text — preserved so JSONC comments/formatting can be edited in place. */
  text: string;
  config: OpenCodeConfig;
}

function normalizePluginConfig(config: OpenCodeConfig): {
  config: OpenCodeConfig;
  changed: boolean;
} {
  const existingPlugin = Array.isArray(config.plugin) ? [...config.plugin] : [];
  const existingPlugins = Array.isArray(config.plugins) ? [...config.plugins] : [];

  if (existingPlugins.length === 0) {
    return { config, changed: false };
  }

  const merged: string[] = [];
  for (const entry of [...existingPlugin, ...existingPlugins]) {
    if (!merged.includes(entry)) {
      merged.push(entry);
    }
  }

  config.plugin = merged;
  delete config.plugins;

  return { config, changed: true };
}

export interface AutoUpdateOptions {
  configDir?: string;
  intervalHours?: number;
  disabled?: boolean;
  debug?: boolean;
  preservePinned?: boolean;
  ignoreThrottle?: boolean;
  onLog?: (message: string) => void;
  onError?: (message: string) => void;
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
  const intervalHours = options.intervalHours ?? envNumber('OPENCODE_AUTO_UPDATE_INTERVAL_HOURS', 0);
  const preservePinned = options.preservePinned ?? envFlag('OPENCODE_AUTO_UPDATE_PINNED');
  const configDir = options.configDir ?? DEFAULT_CONFIG_DIR;

  const log = (...args: unknown[]) => {
    const message = formatLogMessage(args);
    if (debug) {
      console.log(message);
    }
    options.onLog?.(message);
  };

  const error = (...args: unknown[]) => {
    const message = formatLogMessage(args);
    if (debug) {
      console.error(message);
    }
    options.onError?.(message);
  };

  const lockAcquired = await acquireLock({ debug, configDir });
  if (!lockAcquired) {
    log('[auto-update] Lock already held, skipping.');
    return;
  }

  try {
    const state = await readThrottleState({ configDir });
    const now = Date.now();
    const intervalMs = intervalHours * 60 * 60 * 1000;

    if (!ignoreThrottle && state.lastRun && now - state.lastRun < intervalMs) {
      log('[auto-update] Throttled, skipping update.');
      return;
    }

    await writeThrottleState({ ...state, lastRun: now }, { debug, configDir });

    const loaded = await loadConfig(configDir);
    if (!loaded) {
      log(
        '[auto-update] No config found, skipping. Looked for:',
        CONFIG_FILENAMES.map((name) => join(configDir, name)).join(', ')
      );
      return;
    }

    log('[auto-update] Using config:', loaded.path);

    const normalized = normalizePluginConfig(loaded.config);
    let configText = loaded.text;
    if (normalized.changed) {
      // Migrate plugins -> plugin while preserving JSONC comments via jsonc-parser edits.
      configText = setPluginListInText(configText, normalized.config.plugin ?? []);
      // Drop legacy key if present (undefined removes the property).
      configText = applyConfigEdit(configText, ['plugins'], undefined);
      await writeFile(loaded.path, ensureTrailingNewline(configText), 'utf-8');
      log('[auto-update] Migrated config.plugins -> config.plugin');
    }

    const { plugins } = getPluginList(normalized.config);
    if (!plugins || plugins.length === 0) {
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
      // Surgical edit of the plugin array — keeps // comments and trailing commas intact.
      const nextText = setPluginListInText(configText, updateResult.plugins);
      await writeFile(loaded.path, ensureTrailingNewline(nextText), 'utf-8');
      log('[auto-update] Wrote updated plugin list to', loaded.path);
    }

    const hasOcx = await commandExists('ocx');
    if (hasOcx) {
      log('[auto-update] Found ocx, checking for extension updates...');
      const ocxResult = await runCommand('ocx', ['update']);
      if (ocxResult.code === 0) {
        const output = ocxResult.stdout.trim();
        if (output) {
          log('[auto-update] ocx update result:', output);
        } else {
          log('[auto-update] ocx update complete (no output).');
        }
      } else {
        error('[auto-update] ocx update failed:', ocxResult.stderr || ocxResult.stdout);
      }
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

/**
 * Resolve which OpenCode config file to use.
 * Prefer `opencode.jsonc` (OpenCode's default for commented configs), then `opencode.json`.
 */
export async function resolveConfigPath(configDir: string): Promise<string | null> {
  for (const name of CONFIG_FILENAMES) {
    const candidate = join(configDir, name);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

async function loadConfig(configDir: string): Promise<LoadedConfig | null> {
  const configPath = await resolveConfigPath(configDir);
  if (!configPath) {
    return null;
  }

  try {
    const text = await readFile(configPath, 'utf-8');
    const errors: JsoncParseError[] = [];
    const config = parseJsonc(text, errors, {
      allowTrailingComma: true,
      disallowComments: false,
    }) as OpenCodeConfig | undefined;

    if (errors.length > 0) {
      const first = errors[0];
      const where = first
        ? `${printParseErrorCode(first.error)} at offset ${first.offset}`
        : 'unknown parse error';
      // Treat parse failure like a missing config so the run is a clean skip, not a crash.
      throw new Error(`Invalid JSON/JSONC in ${configPath}: ${where}`);
    }

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Config root must be an object: ${configPath}`);
    }

    return { path: configPath, text, config };
  } catch {
    return null;
  }
}

/** Apply a single jsonc-parser edit and return the new text. */
function applyConfigEdit(text: string, path: Array<string | number>, value: unknown): string {
  const edits = modify(text, path, value, {
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true,
    },
  });
  return applyEdits(text, edits);
}

/** Replace the entire `plugin` array while preserving surrounding comments/layout. */
function setPluginListInText(text: string, plugins: string[]): string {
  return applyConfigEdit(text, ['plugin'], plugins);
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function getPluginList(config: OpenCodeConfig): {
  plugins: string[] | null;
} {
  if (Array.isArray(config.plugin)) {
    return { plugins: config.plugin };
  }

  return { plugins: null };
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

  return (
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~')
  );
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

function formatLogMessage(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg;
      }
      if (arg instanceof Error) {
        return arg.message || arg.name;
      }
      if (arg && typeof arg === 'object' && 'message' in arg) {
        const message = (arg as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim().length > 0) {
          return message;
        }
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}
