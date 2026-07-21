// src/index.ts
import { appendFile, readFile as readFile4 } from "fs/promises";
import { join as join3 } from "path";
import { homedir as homedir3 } from "os";

// src/update.ts
import { access, readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2 } from "fs/promises";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";
import { spawn } from "child_process";
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  printParseErrorCode
} from "jsonc-parser";

// src/lock.ts
import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { homedir, hostname as osHostname } from "os";
var DEFAULT_CONFIG_DIR = join(homedir(), ".config", "opencode");
var STALE_LOCK_MS = 2 * 60 * 60 * 1e3;
function resolvePaths(configDir) {
  const resolvedConfigDir = configDir ?? DEFAULT_CONFIG_DIR;
  return {
    configDir: resolvedConfigDir,
    lockFile: join(resolvedConfigDir, ".auto-update.lock"),
    throttleFile: join(resolvedConfigDir, ".auto-update.json")
  };
}
async function isLockStale(lockPath) {
  try {
    const content = await readFile(lockPath, "utf-8");
    const lockData = JSON.parse(content);
    const age = Date.now() - lockData.timestamp;
    return age > STALE_LOCK_MS;
  } catch (error) {
    return false;
  }
}
async function acquireLock(options = {}) {
  const { force = false, debug = false, configDir } = options;
  const { configDir: resolvedConfigDir, lockFile } = resolvePaths(configDir);
  try {
    await mkdir(resolvedConfigDir, { recursive: true });
    try {
      const existingLock = await readFile(lockFile, "utf-8");
      const lockData2 = JSON.parse(existingLock);
      const stale = await isLockStale(lockFile);
      if (stale && force) {
        if (debug) {
          console.log(`[lock] Stale lock detected (pid: ${lockData2.pid}), forcing acquisition`);
        }
      } else if (!stale) {
        if (debug) {
          console.log(`[lock] Lock already held by pid ${lockData2.pid}`);
        }
        return false;
      } else {
        if (debug) {
          console.log(`[lock] Stale lock exists but force=false`);
        }
        return false;
      }
    } catch (error) {
    }
    const lockData = {
      pid: process.pid,
      timestamp: Date.now(),
      hostname: await getHostname()
    };
    await writeFile(lockFile, JSON.stringify(lockData, null, 2), "utf-8");
    if (debug) {
      console.log(`[lock] Lock acquired by pid ${process.pid}`);
    }
    return true;
  } catch (error) {
    if (debug) {
      console.error("[lock] Failed to acquire lock:", error);
    }
    return false;
  }
}
async function releaseLock(options = {}) {
  const { debug = false, configDir } = options;
  const { lockFile } = resolvePaths(configDir);
  try {
    await unlink(lockFile);
    if (debug) {
      console.log(`[lock] Lock released by pid ${process.pid}`);
    }
  } catch (error) {
    if (debug && error.code !== "ENOENT") {
      console.error("[lock] Failed to release lock:", error);
    }
  }
}
async function readThrottleState(options = {}) {
  const { configDir } = options;
  const { throttleFile } = resolvePaths(configDir);
  try {
    const data = await readFile(throttleFile, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}
async function writeThrottleState(state, options = {}) {
  const { debug = false, configDir } = options;
  const { configDir: resolvedConfigDir, throttleFile } = resolvePaths(configDir);
  try {
    await mkdir(resolvedConfigDir, { recursive: true });
    await writeFile(throttleFile, JSON.stringify(state, null, 2), "utf-8");
    if (debug) {
      console.log("[throttle] State written:", state);
    }
  } catch (error) {
    if (debug) {
      console.error("[throttle] Failed to write state:", error);
    }
    throw error;
  }
}
async function getHostname() {
  try {
    return osHostname();
  } catch {
    return "unknown";
  }
}

// src/update.ts
var DEFAULT_CONFIG_DIR2 = join2(homedir2(), ".config", "opencode");
var CONFIG_FILENAMES = ["opencode.jsonc", "opencode.json"];
function normalizePluginConfig(config) {
  const existingPlugin = Array.isArray(config.plugin) ? [...config.plugin] : [];
  const existingPlugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  if (existingPlugins.length === 0) {
    return { config, changed: false };
  }
  const merged = [];
  for (const entry of [...existingPlugin, ...existingPlugins]) {
    if (!merged.includes(entry)) {
      merged.push(entry);
    }
  }
  config.plugin = merged;
  delete config.plugins;
  return { config, changed: true };
}
async function runAutoUpdate(options = {}) {
  const disabled = options.disabled ?? envFlag("OPENCODE_AUTO_UPDATE_DISABLED");
  if (disabled) {
    return;
  }
  const debug = options.debug ?? envFlag("OPENCODE_AUTO_UPDATE_DEBUG");
  const ignoreThrottle = options.ignoreThrottle ?? envFlag("OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE");
  const intervalHours = options.intervalHours ?? envNumber("OPENCODE_AUTO_UPDATE_INTERVAL_HOURS", 0);
  const preservePinned = options.preservePinned ?? envFlag("OPENCODE_AUTO_UPDATE_PINNED");
  const configDir = options.configDir ?? DEFAULT_CONFIG_DIR2;
  const log = (...args) => {
    const message = formatLogMessage(args);
    if (debug) {
      console.log(message);
    }
    options.onLog?.(message);
  };
  const error = (...args) => {
    const message = formatLogMessage(args);
    if (debug) {
      console.error(message);
    }
    options.onError?.(message);
  };
  const lockAcquired = await acquireLock({ debug, configDir });
  if (!lockAcquired) {
    log("[auto-update] Lock already held, skipping.");
    return;
  }
  try {
    const state = await readThrottleState({ configDir });
    const now = Date.now();
    const intervalMs = intervalHours * 60 * 60 * 1e3;
    if (!ignoreThrottle && state.lastRun && now - state.lastRun < intervalMs) {
      log("[auto-update] Throttled, skipping update.");
      return;
    }
    await writeThrottleState({ ...state, lastRun: now }, { debug, configDir });
    const loaded = await loadConfig(configDir);
    if (!loaded) {
      log(
        "[auto-update] No config found, skipping. Looked for:",
        CONFIG_FILENAMES.map((name) => join2(configDir, name)).join(", ")
      );
      return;
    }
    log("[auto-update] Using config:", loaded.path);
    const normalized = normalizePluginConfig(loaded.config);
    let configText = loaded.text;
    if (normalized.changed) {
      configText = setPluginListInText(configText, normalized.config.plugin ?? []);
      configText = applyConfigEdit(configText, ["plugins"], void 0);
      await writeFile2(loaded.path, ensureTrailingNewline(configText), "utf-8");
      log("[auto-update] Migrated config.plugins -> config.plugin");
    }
    const { plugins } = getPluginList(normalized.config);
    if (!plugins || plugins.length === 0) {
      log("[auto-update] No plugins found to update.");
      return;
    }
    const useBun = await commandExists("bun");
    log("[auto-update] Starting update", {
      pluginCount: plugins.length,
      useBun,
      preservePinned,
      ignoreThrottle
    });
    const updateResult = await updatePlugins({
      plugins,
      configDir,
      preservePinned,
      useBun,
      log,
      error
    });
    if (updateResult.changed) {
      const nextText = setPluginListInText(configText, updateResult.plugins);
      await writeFile2(loaded.path, ensureTrailingNewline(nextText), "utf-8");
      log("[auto-update] Wrote updated plugin list to", loaded.path);
    }
    const hasOcx = await commandExists("ocx");
    if (hasOcx) {
      log("[auto-update] Found ocx, checking for extension updates...");
      const ocxResult = await runCommand("ocx", ["update"]);
      if (ocxResult.code === 0) {
        const output = ocxResult.stdout.trim();
        if (output) {
          log("[auto-update] ocx update result:", output);
        } else {
          log("[auto-update] ocx update complete (no output).");
        }
      } else {
        error("[auto-update] ocx update failed:", ocxResult.stderr || ocxResult.stdout);
      }
    }
    await writeThrottleState(
      { ...state, lastRun: now, lastSuccess: Date.now() },
      { debug, configDir }
    );
    log("[auto-update] Update complete.");
  } catch (err) {
    error("[auto-update] Failed to update plugins:", err);
  } finally {
    await releaseLock({ debug, configDir });
  }
}
async function resolveConfigPath(configDir) {
  for (const name of CONFIG_FILENAMES) {
    const candidate = join2(configDir, name);
    try {
      await access(candidate);
      return candidate;
    } catch {
    }
  }
  return null;
}
async function loadConfig(configDir) {
  const configPath = await resolveConfigPath(configDir);
  if (!configPath) {
    return null;
  }
  try {
    const text = await readFile2(configPath, "utf-8");
    const errors = [];
    const config = parseJsonc(text, errors, {
      allowTrailingComma: true,
      disallowComments: false
    });
    if (errors.length > 0) {
      const first = errors[0];
      const where = first ? `${printParseErrorCode(first.error)} at offset ${first.offset}` : "unknown parse error";
      throw new Error(`Invalid JSON/JSONC in ${configPath}: ${where}`);
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`Config root must be an object: ${configPath}`);
    }
    return { path: configPath, text, config };
  } catch {
    return null;
  }
}
function applyConfigEdit(text, path, value) {
  const edits = modify(text, path, value, {
    formattingOptions: {
      tabSize: 2,
      insertSpaces: true
    }
  });
  return applyEdits(text, edits);
}
function setPluginListInText(text, plugins) {
  return applyConfigEdit(text, ["plugin"], plugins);
}
function ensureTrailingNewline(text) {
  return text.endsWith("\n") ? text : `${text}
`;
}
function getPluginList(config) {
  if (Array.isArray(config.plugin)) {
    return { plugins: config.plugin };
  }
  return { plugins: null };
}
async function updatePlugins(options) {
  const { plugins, configDir, preservePinned, useBun, log, error } = options;
  const updated = [];
  let changed = false;
  for (const entry of plugins) {
    if (isNonRegistryPlugin(entry)) {
      log("[auto-update] Skipping non-registry plugin:", entry);
      updated.push(entry);
      continue;
    }
    const { name, version } = parsePackageSpec(entry);
    if (preservePinned && version) {
      log("[auto-update] Preserving pinned plugin:", entry);
      updated.push(entry);
      continue;
    }
    log("[auto-update] Updating plugin:", name);
    const installedVersion = await installLatest({
      name,
      configDir,
      useBun,
      log,
      error
    });
    if (!installedVersion) {
      updated.push(entry);
      continue;
    }
    const nextEntry = `${name}@${installedVersion}`;
    log("[auto-update] Installed:", nextEntry);
    updated.push(nextEntry);
    if (nextEntry !== entry) {
      changed = true;
    }
  }
  return { plugins: updated, changed };
}
async function installLatest(options) {
  const { name, configDir, useBun, log, error } = options;
  await mkdir2(configDir, { recursive: true });
  if (useBun) {
    const result = await runCommand("bun", ["add", `${name}@latest`, "--cwd", configDir]);
    if (result.code !== 0) {
      error("[auto-update] bun add failed:", result.stderr || result.stdout);
      return null;
    }
  } else {
    const result = await runCommand("npm", [
      "install",
      `${name}@latest`,
      "--prefix",
      configDir,
      "--no-save"
    ]);
    if (result.code !== 0) {
      error("[auto-update] npm install failed:", result.stderr || result.stdout);
      return null;
    }
  }
  const version = await readInstalledVersion(name, configDir);
  if (!version) {
    log("[auto-update] Unable to read installed version for", name);
  }
  return version;
}
async function readInstalledVersion(name, configDir) {
  try {
    const packagePath = name.startsWith("@") ? join2(configDir, "node_modules", ...name.split("/"), "package.json") : join2(configDir, "node_modules", name, "package.json");
    const data = await readFile2(packagePath, "utf-8");
    const parsed = JSON.parse(data);
    return parsed.version ?? null;
  } catch {
    return null;
  }
}
function isNonRegistryPlugin(spec) {
  const trimmed = spec.trim();
  if (!trimmed) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("file:") || lower.startsWith("git+") || lower.startsWith("git:") || lower.startsWith("ssh://") || lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("github:") || lower.startsWith("workspace:")) {
    return true;
  }
  return trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("/") || trimmed.startsWith("~");
}
function parsePackageSpec(spec) {
  if (spec.startsWith("@")) {
    const secondAt = spec.indexOf("@", 1);
    if (secondAt === -1) {
      return { name: spec };
    }
    return {
      name: spec.slice(0, secondAt),
      version: spec.slice(secondAt + 1) || void 0
    };
  }
  const at = spec.lastIndexOf("@");
  if (at <= 0) {
    return { name: spec };
  }
  return {
    name: spec.slice(0, at),
    version: spec.slice(at + 1) || void 0
  };
}
async function commandExists(command) {
  const result = await runCommand(command, ["--version"]);
  return result.code === 0;
}
async function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: `${stderr}${err.message}` });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}
function envFlag(name) {
  return process.env[name]?.toLowerCase() === "true";
}
function envNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function formatLogMessage(args) {
  return args.map((arg) => {
    if (typeof arg === "string") {
      return arg;
    }
    if (arg instanceof Error) {
      return arg.message || arg.name;
    }
    if (arg && typeof arg === "object" && "message" in arg) {
      const message = arg.message;
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(" ");
}

// src/utils/circular-log.ts
import { readFile as readFile3, writeFile as writeFile3 } from "fs/promises";
var MAX_ENTRIES = 5;
async function readCircularLog(logPath) {
  try {
    const contents = await readFile3(logPath, "utf-8");
    return JSON.parse(contents);
  } catch {
    return { entries: [] };
  }
}
async function appendCircularLog(logPath, entry) {
  const log = await readCircularLog(logPath);
  log.entries.push(entry);
  if (log.entries.length > MAX_ENTRIES) {
    log.entries = log.entries.slice(-MAX_ENTRIES);
  }
  await writeFile3(logPath, JSON.stringify(log, null, 2) + "\n", "utf-8");
}
function formatLogEntry(plugins, errors, duration, success) {
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    pluginsUpdated: plugins,
    errors: errors.slice(0, 10),
    duration,
    success
  };
}

// src/index.ts
var CONFIG_PATH = join3(homedir3(), ".config", "opencode", "opencode-plugin-auto-update.json");
function extractUpdatedPlugins(logEntries) {
  const plugins = [];
  for (const entry of logEntries) {
    const match = entry.match(/Updated\s+(.+?)\s+from\s+v[\d.]+\s+to\s+v[\d.]+/i);
    if (match && match[1]) {
      plugins.push(match[1]);
    }
  }
  return plugins;
}
var DEBUG_FILE = "/tmp/opencode-auto-update-debug.log";
var DEBUG_ENABLED = false;
async function src_default(ctx) {
  const envBypassThrottle = process.env.OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE?.toLowerCase() === "true";
  let configIgnoreThrottle = false;
  let updateStarted = false;
  let startupTimer = null;
  let updateMessage = null;
  let lastToastMessage = null;
  const localConfig = await readLocalConfig();
  configIgnoreThrottle = localConfig.ignoreThrottle ?? false;
  const configDebug = localConfig.debug ?? false;
  const shouldIgnoreThrottle = () => envBypassThrottle || configIgnoreThrottle;
  const notifyUser = async (message) => {
    await writeDebug("notifyUser invoked");
    const toastMessage = summarizeMessage(message);
    if (toastMessage === lastToastMessage) {
      return;
    }
    lastToastMessage = toastMessage;
    if (typeof ctx?.client?.tui?.showToast === "function") {
      await ctx.client.tui.showToast({
        body: {
          title: "Auto-update",
          message: toastMessage,
          variant: "info"
        }
      });
      await writeDebug("toast shown");
    }
  };
  const CIRCULAR_LOG_PATH = join3(ctx.directory, "..", ".auto-update-history.json");
  const startUpdate = () => {
    if (updateStarted) {
      return;
    }
    updateStarted = true;
    void writeDebug(`startUpdate invoked (ignoreThrottle=${shouldIgnoreThrottle()})`);
    const logEntries = [];
    const errorEntries = [];
    const startTime = Date.now();
    runAutoUpdate({
      debug: configDebug,
      ignoreThrottle: shouldIgnoreThrottle(),
      onLog: (message) => logEntries.push(message),
      onError: (message) => errorEntries.push(message)
    }).then(() => {
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
    }).catch((error) => {
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
      void writeDebug("startup timer fired");
      startUpdate();
    }
  }, 1500);
  return {
    name: "opencode-plugin-auto-update",
    config: async (config) => {
      await writeDebug(`config hook invoked (logLevel=${config?.logLevel ?? "unset"})`);
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
      startUpdate();
    }
  };
}
function formatUpdateMessage(logs, errors) {
  const lines = ["Auto-update logs"];
  const logLines = logs.length > 0 ? logs : ["No update output recorded."];
  lines.push("", ...limitLines(logLines, 40));
  if (errors.length > 0) {
    lines.push("", "Errors:", ...limitLines(errors, 10));
  }
  return lines.join("\n");
}
function limitLines(lines, maxLines) {
  if (lines.length <= maxLines) {
    return lines;
  }
  return [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more lines)`];
}
async function writeDebug(message) {
  if (!DEBUG_ENABLED) {
    return;
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  await appendFile(DEBUG_FILE, `[${timestamp}] ${message}
`);
}
async function readLocalConfig() {
  try {
    const raw = await readFile4(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed ?? {};
  } catch {
    return {};
  }
}
function summarizeMessage(message) {
  const lines = message.split("\n").filter((line) => line.trim().length > 0);
  const summary = lines.slice(0, 4).join(" | ");
  return summary.length > 240 ? `${summary.slice(0, 237)}...` : summary;
}
export {
  src_default as default
};
