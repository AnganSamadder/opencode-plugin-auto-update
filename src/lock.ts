/**
 * Lock and throttle utilities for auto-update operations
 * 
 * Provides file-based locking mechanism with stale lock detection
 * and JSON-based throttle state management.
 */

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, hostname as osHostname } from 'node:os';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'opencode');
const STALE_LOCK_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface LockData {
  pid: number;
  timestamp: number;
  hostname: string;
}

export interface ThrottleState {
  lastRun?: number;
  lastSuccess?: number;
}

interface LockPaths {
  configDir: string;
  lockFile: string;
  throttleFile: string;
}

function resolvePaths(configDir?: string): LockPaths {
  const resolvedConfigDir = configDir ?? DEFAULT_CONFIG_DIR;
  return {
    configDir: resolvedConfigDir,
    lockFile: join(resolvedConfigDir, '.auto-update.lock'),
    throttleFile: join(resolvedConfigDir, '.auto-update.json'),
  };
}

/**
 * Check if a lock file is stale (older than 2 hours)
 */
export async function isLockStale(lockPath: string): Promise<boolean> {
  try {
    const content = await readFile(lockPath, 'utf-8');
    const lockData: LockData = JSON.parse(content);
    const age = Date.now() - lockData.timestamp;
    return age > STALE_LOCK_MS;
  } catch (error) {
    // If file doesn't exist or can't be read, it's not stale
    return false;
  }
}

/**
 * Acquire a lock for auto-update operations
 * 
 * @param options - Lock options
 * @param options.force - Force acquire even if lock exists but is stale
 * @param options.debug - Enable debug logging
 * @returns true if lock was acquired, false otherwise
 */
export async function acquireLock(options: {
  force?: boolean;
  debug?: boolean;
  configDir?: string;
} = {}): Promise<boolean> {
  const { force = false, debug = false, configDir } = options;
  const { configDir: resolvedConfigDir, lockFile } = resolvePaths(configDir);

  try {
    // Ensure config directory exists
    await mkdir(resolvedConfigDir, { recursive: true });

    // Check if lock already exists
    try {
      const existingLock = await readFile(lockFile, 'utf-8');
      const lockData: LockData = JSON.parse(existingLock);
      
      // Check if lock is stale
      const stale = await isLockStale(lockFile);
      
      if (stale && force) {
        if (debug) {
          console.log(`[lock] Stale lock detected (pid: ${lockData.pid}), forcing acquisition`);
        }
        // Continue to acquire lock below
      } else if (!stale) {
        if (debug) {
          console.log(`[lock] Lock already held by pid ${lockData.pid}`);
        }
        return false;
      } else {
        // Stale but not forcing
        if (debug) {
          console.log(`[lock] Stale lock exists but force=false`);
        }
        return false;
      }
    } catch (error) {
      // Lock file doesn't exist or is invalid, proceed to create
    }

    // Create lock file
    const lockData: LockData = {
      pid: process.pid,
      timestamp: Date.now(),
      hostname: await getHostname(),
    };

    await writeFile(lockFile, JSON.stringify(lockData, null, 2), 'utf-8');
    
    if (debug) {
      console.log(`[lock] Lock acquired by pid ${process.pid}`);
    }
    
    return true;
  } catch (error) {
    if (debug) {
      console.error('[lock] Failed to acquire lock:', error);
    }
    return false;
  }
}

/**
 * Release the lock file
 * 
 * @param options - Release options
 * @param options.debug - Enable debug logging
 */
export async function releaseLock(options: {
  debug?: boolean;
  configDir?: string;
} = {}): Promise<void> {
  const { debug = false, configDir } = options;
  const { lockFile } = resolvePaths(configDir);

  try {
    await unlink(lockFile);
    if (debug) {
      console.log(`[lock] Lock released by pid ${process.pid}`);
    }
  } catch (error) {
    // Ignore errors if lock file doesn't exist
    if (debug && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[lock] Failed to release lock:', error);
    }
  }
}

/**
 * Read the throttle state from disk
 * 
 * @returns The throttle state object, or an empty object if file doesn't exist
 */
export async function readThrottleState(options: {
  configDir?: string;
} = {}): Promise<ThrottleState> {
  const { configDir } = options;
  const { throttleFile } = resolvePaths(configDir);
  try {
    const data = await readFile(throttleFile, 'utf-8');
    return JSON.parse(data) as ThrottleState;
  } catch (error) {
    // Return empty state if file doesn't exist or is invalid
    return {};
  }
}

/**
 * Write the throttle state to disk
 * 
 * @param state - The throttle state to persist
 * @param options - Write options
 * @param options.debug - Enable debug logging
 */
export async function writeThrottleState(
  state: ThrottleState,
  options: { debug?: boolean; configDir?: string } = {}
): Promise<void> {
  const { debug = false, configDir } = options;
  const { configDir: resolvedConfigDir, throttleFile } = resolvePaths(configDir);

  try {
    // Ensure config directory exists
    await mkdir(resolvedConfigDir, { recursive: true });

    await writeFile(throttleFile, JSON.stringify(state, null, 2), 'utf-8');
    
    if (debug) {
      console.log('[throttle] State written:', state);
    }
  } catch (error) {
    if (debug) {
      console.error('[throttle] Failed to write state:', error);
    }
    throw error;
  }
}

/**
 * Get the hostname for lock identification
 */
async function getHostname(): Promise<string> {
  try {
    return osHostname();
  } catch {
    // Fallback to 'unknown' if hostname is not available
    return 'unknown';
  }
}
