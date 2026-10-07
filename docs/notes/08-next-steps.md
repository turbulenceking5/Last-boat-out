# 08. Next steps

## Without changing anything

- Ask Claude to play a campaign with a given strategy and seed and report the result with screenshots.
- Run `npm run fuzz` to check for script errors at desktop and phone sizes.
- Run the full `npm run balance` (40 campaigns, all six strategies).

## Small fixes worth making

- Update the grade buckets in `tests/sim.js` to `[58, 46, 32]` so the balance table matches the game (see [07-findings.md](07-findings.md)).

## Needs a network change

- Done: the live site is allowed and matches `index.html` (see [09-live-site-check.md](09-live-site-check.md)).
