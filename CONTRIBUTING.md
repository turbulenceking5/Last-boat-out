# Contributing

## Layout

| Path | What |
|---|---|
| `index.html` | The original game, all in one file |
| `models/` | TypeScript 3D place models for the original (`src/`), and the compiled `models.js` |
| `city/` | The City game: `index.html`, TypeScript `src/`, and the compiled `city.js` |
| `tests/` | Balance simulations and random-input tests for both games |
| `docs/` | Player guides and code references ([start here](docs/README.md)) |
| `docs/notes/` | Working notes from development sessions |

## Setup

```sh
npm install   # TypeScript, @types/three and Playwright
```

If Playwright's browser isn't installed: `npx playwright install chromium`.

## Making changes

- **The original game:** edit `index.html` directly. There is no build step.
- **The 3D models or the City:** edit the TypeScript, then rebuild and commit the compiled file alongside it:

  ```sh
  npm run build:models   # models/src -> models/models.js
  npm run build:city     # city/src -> city/city.js
  ```

  The sources are plain global scripts (no `import` or `export`), so the build stays a single classic script that works from `file://`. Keep it that way.

## Checks

Run these before opening a pull request:

| Changed | Run | Expect |
|---|---|---|
| Original game rules | `npm run balance` | Targets in [docs/original/10-testing-and-balance.md](docs/original/10-testing-and-balance.md); leak 0.00 |
| Original game interface | `npm run fuzz` | `errs: []`, scrollWidth 1280 and 390 |
| City rules | `npm run city` | Targets in [docs/city/14-testing-and-balance.md](docs/city/14-testing-and-balance.md) |
| City interface | `node tests/city-fuzz.js` | `errs: []`, scrollWidth 1280 and 390 (about 11 minutes) |
| Any TypeScript | `npm run build:models` / `npm run build:city` | No `tsc` errors (`strict`, `noUnusedLocals`) |

## Conventions

- Match the surrounding code's style: compact, with comments that explain why.
- Every `localStorage` access goes in try/catch; the games must work with storage blocked.
- Anything loaded from a CDN must be optional, or fail with a clear message.
- Keep the simulation free of DOM and Three.js calls, so the tests can run it flat out.
- Update the docs and `CHANGELOG.md` with the change.

## Releasing

Merge into `main`; GitHub Pages republishes. See [docs/deploying.md](docs/deploying.md).
