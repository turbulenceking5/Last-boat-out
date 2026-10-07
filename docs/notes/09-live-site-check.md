# 09. Live site check

Done after `turbulenceking5.github.io` was added to the environment's allowed domains.

## Result

- https://turbulenceking5.github.io/Last-boat-out/ returns 200.
- The served page is **byte-for-byte identical** to `index.html` in the repo (84,312 bytes), so GitHub Pages is serving the current version.
- Loaded in headless Chromium: title `Last Boat to Calder`, 21 places, turn 0, briefing queued. **No script errors and no failed requests.**

| Screen | File |
|---|---|
| New campaign setup | [screens/live/01-setup.png](screens/live/01-setup.png) |
| Opening briefing | [screens/live/02-briefing.png](screens/live/02-briefing.png) |

The infected counts in the side panel differ a little from the local screenshots because each campaign without a seed rolls its own numbers. The layout and text are the same.

## How it was loaded

The script in [03-loading-the-game.md](03-loading-the-game.md), with `p.goto` pointed at the URL instead of a `file://` path.
