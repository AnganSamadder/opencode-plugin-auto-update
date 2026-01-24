# Opencode Plugin Auto-Update

[![npm version](https://img.shields.io/npm/v/opencode-plugin-auto-update.svg)](https://www.npmjs.com/package/opencode-plugin-auto-update)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Automatically updates OpenCode plugins in the background on startup. No prompts, no blocking IO, and minimal logging by default.

## 🚀 Overview

- Runs a background update pass on startup
- Throttled to once every 24 hours
- Uses a lock file to prevent concurrent runs
- Updates to latest by default (optional pin-preserving mode)

## ✨ Features

- Zero startup delay (async, detached update)
- Bun-first installs with npm fallback
- Logs update output to the console sidebar with a toast summary
- Skips local/path/git plugins

## 📦 Installation

### 🤖 Let an LLM do it (Recommended)

Paste this into any LLM agent (OpenCode, Claude Code, Cursor, etc.):

```text
Install the opencode-plugin-auto-update plugin by following: https://raw.githubusercontent.com/AnganSamadder/opencode-plugin-auto-update/main/README.md
```

<details>
<summary><b>Instructions for LLM Agents</b></summary>

To install this plugin, please perform the following steps for the user:

1. **Install the NPM package globally:**
   ```bash
   bun add -g opencode-plugin-auto-update
   # or
   npm install -g opencode-plugin-auto-update
   ```

2. **Configure OpenCode:**
   Add `"opencode-plugin-auto-update"` to the `plugin` array in the user's config file (usually `~/.config/opencode/opencode.json`).

   ```json
    {
      "plugin": [
        "opencode-plugin-auto-update"
      ]
    }
   ```

3. **Verify & Finalize:**
   Tell the user: **"Installation complete! Your OpenCode plugins will now update automatically in the background."**

</details>

### 👤 For Humans (Manual)

1. **Install:**
   ```bash
   bun add -g opencode-plugin-auto-update
   # or
   npm install -g opencode-plugin-auto-update
   ```

2. **Enable the plugin:**
   Add `"opencode-plugin-auto-update"` to `~/.config/opencode/opencode.json`:
   ```json
    {
      "plugin": [
        "opencode-plugin-auto-update"
      ]
    }
   ```

3. **Restart OpenCode:**
   The plugin runs on the next OpenCode startup.

## 🛠️ How it works

1. On startup, schedules a background update task.
2. Applies a 24h throttle and lock to avoid repeated updates.
3. Installs latest versions into `~/.config/opencode/node_modules`.
4. Rewrites `opencode.json` plugin versions to the latest (unless pinned).

## ⚙️ Configuration

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_AUTO_UPDATE_DISABLED` | `false` | Disable all updates when `true` |
| `OPENCODE_AUTO_UPDATE_INTERVAL_HOURS` | `24` | Throttle interval in hours |
| `OPENCODE_AUTO_UPDATE_PINNED` | `false` | Preserve pinned versions |
| `OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE` | `false` | Ignore throttle (useful for testing) |

### Local Config File

You can bypass throttling without relying on CLI flags by creating:

`~/.config/opencode/opencode-plugin-auto-update.json`

```json
{
  "ignoreThrottle": true
}
```

## ❓ Troubleshooting

1. **Updates not running**: ensure `OPENCODE_AUTO_UPDATE_DISABLED` is not set to `true`.
2. **No logs**: confirm the plugin is enabled and watch for the "Auto-update logs" output after startup.
3. **Plugin not loading**: check the `plugin` array in `~/.config/opencode/opencode.json`.
4. **Testing updates**: set `OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE=true` or the local config `ignoreThrottle=true`.

## 🚀 Release Process

1. Land changes on `main` using conventional commits.
2. The Release workflow opens a Release Please PR with version + changelog updates.
3. Merge the Release Please PR to create the tag + GitHub release.
4. The Publish workflow (environment: `release`) builds and publishes to npm via OIDC.

## 📄 License

MIT

## 🙏 Acknowledgements

Inspired by opencode-agent-tmux and the OpenCode plugin ecosystem.
