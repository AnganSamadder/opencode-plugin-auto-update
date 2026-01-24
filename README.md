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
- Silent by default; debug logging via env
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
| `OPENCODE_AUTO_UPDATE_DEBUG` | `false` | Enable debug logs |
| `OPENCODE_AUTO_UPDATE_PINNED` | `false` | Preserve pinned versions |
| `OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE` | `false` | Ignore throttle (useful for testing) |

### CLI Flags

- `opencode --log-level DEBUG`: enable debug mode for OpenCode and trigger verbose update logs with throttle bypass.

## ❓ Troubleshooting

1. **Updates not running**: ensure `OPENCODE_AUTO_UPDATE_DISABLED` is not set to `true`.
2. **No logs**: run `opencode --log-level DEBUG` or set `OPENCODE_AUTO_UPDATE_DEBUG=true` for verbose output.
3. **Plugin not loading**: check the `plugin` array in `~/.config/opencode/opencode.json`.
4. **Testing updates**: run `opencode --log-level DEBUG` to bypass the 24h throttle and see detailed update logs.

## 🚀 Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. `bun run build`
4. `npm publish`
5. `git tag vX.Y.Z && git push --tags`
6. `gh release create vX.Y.Z --notes "..."`

## 📄 License

MIT

## 🙏 Acknowledgements

Inspired by opencode-agent-tmux and the OpenCode plugin ecosystem.
