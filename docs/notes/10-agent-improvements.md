# 10. Improvements from three agents

Three agents worked in parallel, each in its own copy of the repo, and their work was merged here.

## Balance and correctness

- Grade thresholds now live in one constant, `GRADES` in `index.html`. `tests/sim.js` and the end screen read them from there, which fixes the mismatch in [07-findings.md](07-findings.md).
- **Fixed:** people waiting on a quay of 0.5k or fewer vanished from the books when the port fell. They are now counted as lost.
- **Fixed:** a "great march" that qualified after turn 16 was scheduled in the past, never happened, and the top bar counted down into negative turns.
- **Fixed:** an empty, fallen town whose horde wandered off was rewarded as "cleared" and could then fall again, repeating the penalty and spilling more infected.
- No tuning was needed. A two-turn "funnel" opening (evacuate Kessler by rail to Calder, then blow the Kessler links) averages 52.3% against the bot's 49.5%. It was judged skilled play, not an exploit.

## Usability and accessibility

- Keyboard focus is kept or moved somewhere sensible after every action, dialogs hold focus, and the map has one Tab stop with arrow-key movement between places.
- Screen readers hear each place's state and the result of every turn and order.
- Disabled orders say why, for example "Needs 8 supply, you have 5".
- On phones the order sheet steps aside while you pick a destination or road, and tap targets are at least 44px.

## End of campaign and replayability

- An after-action report: the score against the grade thresholds, saved and not saved broken down, a turn-by-turn chart of people shipped out and lost (with a table view), and the turning points in time order.
- A service record of past campaigns and personal bests, kept in the browser under `lastboat_record_v1`, shown on the end and setup screens.
- Replay this seed, and copy the seed to share.

## Checks after merging

Full balance suite, 40 campaigns each (Kessler, Regular):

| Strategy | Mean saved | ≥58 / ≥46 / ≥32 |
|---|---|---|
| nothing | 14.2% | 0 / 0 / 0 |
| evacAll | 40.0% | 0 / 0 / 40 |
| bEP | 49.5% | 0 / 36 / 40 |
| strikeK | 48.7% | 0 / 33 / 39 |
| crush | 48.1% | 0 / 37 / 40 |
| cutKessler_bot | 42.6% | 0 / 2 / 40 |

The UI fuzzer ran 12 campaigns with no script errors and no horizontal scroll at 1280px or 390px. A campaign played to the end at both sizes showed the report, recorded the run once, kept focus inside the report, and Replay started a new campaign.

## Follow-up

- Arrow keys now step through the buttons of any open dialog, in Tab order, wrapping at the ends.
- Copy seed now includes a share link, `…/#seed=…&scenario=…&diff=…`. Opening it shows the setup screen with that campaign filled in. If you have a campaign in progress you can press Esc to go back to it. The link is removed from the address bar once read, so a reload doesn't reopen setup. Links without a valid seed are ignored.
- The UI fuzzer doesn't click Replay or Copy seed; those, and the share link, were tested separately in Playwright.
