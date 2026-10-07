# 03. Loading the game

The game was loaded from the local file in headless Chromium.

## Result

- Page title: `Last Boat to Calder`
- 21 map places loaded, turn 0, one opening event (the briefing) queued
- **No script errors and no failed requests**

| Screen | File |
|---|---|
| New campaign setup | [screens/01-setup.png](screens/01-setup.png) |
| Opening briefing after "Take command" | [screens/02-briefing.png](screens/02-briefing.png) |

## Script used

```js
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('requestfailed', r => errs.push('reqfail ' + r.url()));
  await p.goto('file://' + path.resolve(process.argv[2]));
  await p.waitForTimeout(800);
  await p.screenshot({ path: process.argv[3] + '/01-setup.png' });
  await p.click('#startbtn');
  await p.waitForTimeout(300);
  await p.screenshot({ path: process.argv[3] + '/02-briefing.png' });
  const info = await p.evaluate(() => ({
    title: document.title, turn: S.turn,
    nodes: Object.keys(S.nodes || {}).length, events: S.events.length,
  }));
  console.log(JSON.stringify({ info, errs }));
  await b.close();
})();
```

Run it with:

```sh
NODE_PATH=$(npm root -g) node load.js index.html docs/notes/screens
```

## Playing it from code

The game exposes its functions globally, so a script can play turns directly, as `tests/ui.js` does:

```js
await page.evaluate(() => {
  decide(0);                       // answer the briefing
  orderEvac('brennan');            // evacuate a town
  orderMove('aldermoor', 'cedar', 3); // move 3 battalions
  endTurn();
  render();
});
```
