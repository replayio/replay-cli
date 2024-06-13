# Miriam - Adi pairing

## Two parallel debugging systems

Can we avoid two parallel debugging systems. Right now we have `dbg` and we are adding `grafanaLogger`.

- There are 336 calls using `dbg` overall.
- There are 193 calls using the `dbg` library where a parameter is passed in using the `dbg`-specific formatter.
  - We found this by searching the code-base in VS Code using this regex: `debug\(["'].*%.*["'].*\)`.

Should we focus on removing the parallel system just in `test-utils` for now?

- `test-utils`: 36 `debug()` calls
- `playwright`: 13 `debug()` calls
- `cypress`: 40 `debug()` calls

What about this pattern?

`logDebug("Test", { [sendToGrafana]: true });`

Adi said this is actually an uncommon pattern. The issues with it:

- If we want to determine what to send to Grafana based on log level, this is confusing because now we have two booleans that could contradict.
- It is a normal pattern to use log levels to determine what to send to diagnostic tools.
- If we use one logging system for now, we can default everything to `debug`, and send `error` levels to Grafana (as long as it is initialized + not disabled).
- Adi: `log.verbose()`
- https://betterstack.com/community/guides/logging/log-levels-explained/#6-trace

error - sent to grafana
warn - sent to grafana
info and above - sent to grafana
debug - not sent to grafana

## Identifying the user

- This question stems from whether we should throw if the grafana logger is not initialized. Adi pointed out the initialization depends on an internet connection, so this is not a great idea. [x]
