# Changelog

## 0.1.1

- Changed from custom `--log-update` flag to standard `--log-level DEBUG` for compatibility
- Detects `--log-level DEBUG` for verbose updates and throttle bypass
- Works natively without wrapper on standard OpenCode installs

## 0.1.2

- Posts update logs into the session when `--log-level DEBUG` is used
- Captures update output without requiring environment variables

## 0.1.3

- Add local config file to enable debug logging without CLI flags
- Use prompt/Toast UI for visible update logs

## 0.1.0

- Initial release
- Background auto-update on startup with 24h throttle
- Lock file to avoid concurrent runs
- Optional pin-preserving mode and debug logging
