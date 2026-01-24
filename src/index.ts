import { runAutoUpdate } from './update.js';

interface PluginInput {
  directory: string;
  serverUrl?: URL | string;
  client: {
    session: {
      status(): Promise<{ data?: Record<string, { type: string }> }>;
      subscribe(callback: (event: { type: string; properties?: unknown }) => void): () => void;
    };
  };
}

interface PluginOutput {
  name: string;
  event?: (input: { event: { type: string; properties?: unknown } }) => Promise<void>;
  tool?: Record<string, unknown>;
  config?: unknown;
}

export default async function (ctx: PluginInput): Promise<PluginOutput> {
  const args = process.argv ?? [];
  
  const debugLevelFlag = args.includes('--log-level') && args.includes('DEBUG');
  const envDebug = process.env.OPENCODE_AUTO_UPDATE_DEBUG?.toLowerCase() === 'true';
  const envBypassThrottle = process.env.OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE?.toLowerCase() === 'true';
  
  const debug = debugLevelFlag || envDebug;
  const ignoreThrottle = debugLevelFlag || envBypassThrottle;
  
  setTimeout(() => {
    runAutoUpdate({ debug, ignoreThrottle }).catch((error) => {
      if (debug) {
        console.error('[opencode-plugin-auto-update] Update check failed:', error);
      }
    });
  }, 0);

  return {
    name: 'opencode-plugin-auto-update',
  };
}
