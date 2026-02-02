import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

import { runAutoUpdate } from './update.js';
import {
  appendCircularLog,
  formatLogEntry,
} from './utils/circular-log.js';

const CONFIG_PATH = join(homedir(), '.config', 'opencode', 'opencode-plugin-auto-update.json');

function extractUpdatedPlugins(logEntries: string[]): string[] {
  const plugins: string[] = [];
  for (const entry of logEntries) {
    const match = entry.match(/Updated\s+(.+?)\s+from\s+v[\d.]+\s+to\s+v[\d.]+/i);
    if (match && match[1]) {
      plugins.push(match[1]);
    }
  }
  return plugins;
}
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
  debug?: boolean;
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
  const configDebug = localConfig.debug ?? false;

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
  };

    const CIRCULAR_LOG_PATH = join(ctx.directory, '..', '.auto-update-history.json');

  const startUpdate = (): void => {
    if (updateStarted) {
      return;
    }
    updateStarted = true;
    void writeDebug(`startUpdate invoked (ignoreThrottle=${shouldIgnoreThrottle()})`);

    const logEntries: string[] = [];
    const errorEntries: string[] = [];
    const startTime = Date.now();

    runAutoUpdate({
      debug: configDebug,
      ignoreThrottle: shouldIgnoreThrottle(),
      onLog: (message) => logEntries.push(message),
      onError: (message) => errorEntries.push(message),
    })
      .then(() => {
        const duration = Date.now() - startTime;
        const success = errorEntries.length === 0;
        const pluginsUpdated = extractUpdatedPlugins(logEntries);
        
        void appendCircularLog(
          CIRCULAR_LOG_PATH,
          formatLogEntry(pluginsUpdated, errorEntries, duration, success)
        );
        
        updateMessage = formatUpdateMessage(logEntries, errorEntries);
        void writeDebug(`update finished (logs=${logEntries.length}, errors=${errorEntries.length})`);
        notifyUser(updateMessage).catch((error) => {
          void writeDebug(`notifyUser error: ${String(error)}`);
        });
      })
      .catch((error) => {
        const duration = Date.now() - startTime;
        void appendCircularLog(
          CIRCULAR_LOG_PATH,
          formatLogEntry([], [String(error)], duration, false)
        );
        void writeDebug(`runAutoUpdate error: ${String(error)}`);
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
