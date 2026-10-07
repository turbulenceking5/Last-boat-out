# 02. Environment check

Checked at the start of the session (2026-10-07).

| Check | Result |
|---|---|
| Node | v22.22.0 |
| Playwright | 1.56.1, installed globally (`NODE_PATH=$(npm root -g)`) |
| Chromium | Pre-installed under `/opt/pw-browsers` |
| `registry.npmjs.org` | Reachable (200) |
| `turbulenceking5.github.io` | **Blocked** by the network policy (403 on CONNECT) |
| Google Fonts | Reachable; the game's fonts loaded with no failed requests |

## What this means

- `npm install` would work, but isn't needed: Playwright is already available globally.
- Don't run `npx playwright install chromium` here. The README asks for it for local machines; in this container the browser is already installed.
- Anything that needs the live GitHub Pages site needs a network change first (see [01-permissions-answer.md](01-permissions-answer.md)).
