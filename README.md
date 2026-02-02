# Opencode Plugin Auto-Update

[![npm version](https://img.shields.io/npm/v/opencode-plugin-auto-update.svg)](https://www.npmjs.com/package/opencode-plugin-auto-update)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-Fast-black?logo=bun)](https://bun.sh)

**Keep your OpenCode environment fresh without lifting a finger.**

`opencode-plugin-auto-update` is a lightweight, background-running plugin that
ensures your OpenCode plugins are always up-to-date. Zero-latency background
updates for your OpenCode plugins. Includes 24h throttling and concurrency
locking. It handles the heavy lifting of dependency management in the
background, so you can focus on building.

## 🚀 Why use this?

- **Set and Forget**: Once installed, your plugins stay updated automatically.
- **Zero Latency**: Updates run in a detached background process—no startup
  delay for your OpenCode session.
- **Smart Throttling**: Only checks for updates once every 24 hours
  (configurable) to save bandwidth and resources.
- **Safe & Reliable**: Uses lock files to prevent concurrent update runs and
  handles config migrations automatically.

## ✨ Key Features

- **Background Execution**: Updates are detached from the main process. No
  prompts, no blocking IO, and minimal noise.
- **Bun-First Performance**: Automatically detects and uses `bun` for
  lightning-fast installs, with a reliable `npm` fallback.
- **Intelligent Filtering**: Automatically skips local paths, git repositories,
  and workspace plugins to avoid breaking development setups.
- **Update History**: Maintains a circular history of the last 5 updates,
  including metadata and timestamps.
- **Config Migration**: Seamlessly handles transitions between `plugin` and
  `plugins` keys in your `opencode.json`.
- **Toast Notifications**: Provides a brief, non-intrusive summary after a
  successful update pass.

## 📦 Installation

### 🤖 For LLM Agents (Recommended)

If you are using an AI agent (OpenCode, Claude Code, Cursor, etc.), simply paste
this:

```text
Install the opencode-plugin-auto-update plugin by following: https://raw.githubusercontent.com/AnganSamadder/opencode-plugin-auto-update/main/README.md
```

<details>
<summary><b>Detailed Agent Instructions</b></summary>

1. **Install the NPM package globally:**

   ```bash
   bun add -g opencode-plugin-auto-update || npm install -g opencode-plugin-auto-update
   ```

2. **Enable in OpenCode Config:**
   Add `"opencode-plugin-auto-update"` to the `plugin` array in
   `~/.config/opencode/opencode.json`.

   ```json
    {
      "plugin": [
        "opencode-plugin-auto-update"
      ]
    }
   ```

3. **Verify:**
   Inform the user: **"Installation complete! Your OpenCode plugins will now
   update automatically in the background."**

</details>

### 👤 Manual Installation

1. **Install the package:**

   ```bash
   bun add -g opencode-plugin-auto-update
   # or
   npm install -g opencode-plugin-auto-update
   ```

2. **Enable the plugin:**
   Add `"opencode-plugin-auto-update"` to your
   `~/.config/opencode/opencode.json`:

   ```json
    {
      "plugin": [
        "opencode-plugin-auto-update"
      ]
    }
   ```

3. **Restart OpenCode:**
   The plugin will trigger its first check on the next startup.

## ⚙️ Configuration

You can fine-tune the behavior using environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `OPENCODE_AUTO_UPDATE_DISABLED` | `false` | Set to `true` to completely disable background updates. |
| `OPENCODE_AUTO_UPDATE_INTERVAL_HOURS` | `24` | How often to check for updates (in hours). |
| `OPENCODE_AUTO_UPDATE_PINNED` | `false` | If `true`, preserves pinned versions in your config. |
| `OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE` | `false` | Force an update check on every startup (useful for debugging). |

### Local Override

For persistent overrides without environment variables, create:
`~/.config/opencode/opencode-plugin-auto-update.json`

```json
{
  "ignoreThrottle": true
}
```

## 🛠️ How It Works

1. **Trigger**: On OpenCode startup, the plugin schedules a background task.
2. **Lock & Throttle**: It checks if an update is already running or if the 24h
   interval has passed.
3. **Fetch**: It identifies registry-based plugins and fetches their latest
   versions.
4. **Install**: Updates are installed into `~/.config/opencode/node_modules`.
5. **Sync**: Updates `opencode.json` with the new versions (unless pinning is
   enabled).

## ❓ Troubleshooting

- **Updates not running?** Check if `OPENCODE_AUTO_UPDATE_DISABLED` is set.
- **No logs?** The plugin is designed to be quiet. Check the "Auto-update logs"
  output in your agent's console for details.
- **Testing?** Use `OPENCODE_AUTO_UPDATE_BYPASS_THROTTLE=true` to force a run.

## 📄 License

MIT © [Angan Samadder](https://github.com/AnganSamadder)

---

*Inspired by the OpenCode plugin ecosystem.*
