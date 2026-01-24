# Changelog

## [0.2.0](https://github.com/AnganSamadder/opencode-plugin-auto-update/compare/v0.1.3...v0.2.0) (2026-01-24)


### Features

* initial commit - auto-update plugin v0.1.1 ([dc8662c](https://github.com/AnganSamadder/opencode-plugin-auto-update/commit/dc8662c45381ae6ae796f2839849af0147e0c13f))
* streamline update logging and add release workflows ([1be210a](https://github.com/AnganSamadder/opencode-plugin-auto-update/commit/1be210ac50a2daf1468e48bda8956806330b4ddc))

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
