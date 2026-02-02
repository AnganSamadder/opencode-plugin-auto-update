import { readFile, writeFile } from 'node:fs/promises';

const MAX_ENTRIES = 5;

interface LogEntry {
  timestamp: string;
  pluginsUpdated: string[];
  errors: string[];
  duration: number;
  success: boolean;
}

export interface CircularLog {
  entries: LogEntry[];
}

export async function readCircularLog(logPath: string): Promise<CircularLog> {
  try {
    const contents = await readFile(logPath, 'utf-8');
    return JSON.parse(contents) as CircularLog;
  } catch {
    return { entries: [] };
  }
}

export async function appendCircularLog(
  logPath: string,
  entry: LogEntry
): Promise<void> {
  const log = await readCircularLog(logPath);
  log.entries.push(entry);
  if (log.entries.length > MAX_ENTRIES) {
    log.entries = log.entries.slice(-MAX_ENTRIES);
  }
  await writeFile(logPath, JSON.stringify(log, null, 2) + '\n', 'utf-8');
}

export function formatLogEntry(
  plugins: string[],
  errors: string[],
  duration: number,
  success: boolean
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    pluginsUpdated: plugins,
    errors: errors.slice(0, 10),
    duration,
    success,
  };
}
