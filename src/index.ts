import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { runAutoUpdate } from './update.js';

const CONFIG_PATH = join(homedir(), '.config', 'opencode', 'opencode-plugin-auto-update.json');
const DEBUG_FILE = '/tmp/opencode-auto-update-debug.log';
const DEBUG_ENABLED = false;

interface PluginInput {
  directory: string;
  client: {
    tui?: {
      showToast?: (input: { body: { title?: string; message: string; variant?: 'info' | 'success' | 'warning' | 'error' } }) => Promise<unknown>;
    };
  };
}

interface PluginOutput {
  name: string;
  config?: (input: { logLevel?: string }) => Promise<void>;
}

interface PluginConfig {
  ignoreThrottle?: boolean;
}

export default async function (ctx: PluginInput): Promise<PluginOutput> {
  const envBypassThrottle = process.env.OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE?.toLowerCase() === 'true';

  let configIgnoreThrottle = false;
  let updateStarted = false;
  let startupTimer: ReturnType<typeof setTimeout> | null = null;
  let updateMessage: string | null = null;
  let lastToastMessage: string | null = null;

  const localConfig = await readLocalConfig();
  configIgnoreThrottle = localConfig.ignoreThrottle ?? false;

  const shouldIgnoreThrottle = (): boolean => envBypassThrottle || configIgnoreThrottle;

  const notifyUser = async (message: string): Promise<void> => {
    await writeDebug('notifyUser invoked');
    const toastMessage = summarizeMessage(message);
    if (toastMessage === lastToastMessage) {
      return;
    }
    lastToastMessage = toastMessage;

    if (typeof ctx?.client?.tui?.showToast === 'function') {
      await ctx.client.tui.showToast({
        body: {
          title: 'Auto-update',
          message: toastMessage,
          variant: 'info',
        },
      });
      await writeDebug('toast shown');
    }

    console.log(message);
    await writeDebug('console fallback used');
  };

  const startUpdate = (): void => {
    if (updateStarted) {
      return;
    }
    updateStarted = true;
    void writeDebug(`startUpdate invoked (ignoreThrottle=${shouldIgnoreThrottle()})`);

    const logEntries: string[] = [];
    const errorEntries: string[] = [];

    runAutoUpdate({
      debug: false,
      ignoreThrottle: shouldIgnoreThrottle(),
      onLog: (message) => logEntries.push(message),
      onError: (message) => errorEntries.push(message),
    })
      .then(() => {
        updateMessage = formatUpdateMessage(logEntries, errorEntries);
        void writeDebug(`update finished (logs=${logEntries.length}, errors=${errorEntries.length})`);
        notifyUser(updateMessage).catch((error) => {
          void writeDebug(`notifyUser error: ${String(error)}`);
          console.error('[opencode-plugin-auto-update] Failed to notify user:', error);
        });
      })
      .catch((error) => {
        void writeDebug(`runAutoUpdate error: ${String(error)}`);
        console.error('[opencode-plugin-auto-update] Update check failed:', error);
      });
  };

  startupTimer = setTimeout(() => {
    if (!updateStarted) {
      void writeDebug('startup timer fired');
      startUpdate();
    }
  }, 1500);

  return {
    name: 'opencode-plugin-auto-update',
    config: async (config: { logLevel?: string }) => {
      await writeDebug(`config hook invoked (logLevel=${config?.logLevel ?? 'unset'})`);
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
      startUpdate();
    },
  };
}

function formatUpdateMessage(logs: string[], errors: string[]): string {
  const lines: string[] = ['Auto-update logs'];
  const logLines = logs.length > 0 ? logs : ['No update output recorded.'];

  lines.push('', ...limitLines(logLines, 40));

  if (errors.length > 0) {
    lines.push('', 'Errors:', ...limitLines(errors, 10));
  }

  return lines.join('\n');
}

function limitLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }
  return [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more lines)`];
}


async function writeDebug(message: string): Promise<void> {
  if (!DEBUG_ENABLED) {
    return;
  }
  const timestamp = new Date().toISOString();
  await appendFile(DEBUG_FILE, `[${timestamp}] ${message}\n`);
}

async function readLocalConfig(): Promise<PluginConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as PluginConfig;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function summarizeMessage(message: string): string {
  const lines = message.split('\n').filter((line) => line.trim().length > 0);
  const summary = lines.slice(0, 4).join(' | ');
  return summary.length > 240 ? `${summary.slice(0, 237)}...` : summary;
}
