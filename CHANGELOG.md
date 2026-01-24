# Changelog

## 0.1.1

- Changed from custom `--log-update` flag to standard `--log-level DEBUG` for compatibility
- Detects `--log-level DEBUG` for verbose updates and throttle bypass
- Works natively without wrapper on standard OpenCode installs

## 0.1.0

- Initial release
- Background auto-update on startup with 24h throttle
- Lock file to avoid concurrent runs
- Optional pin-preserving mode and debug logging
