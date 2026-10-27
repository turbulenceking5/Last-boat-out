# Scoring and medals

## Share saved

When the last ships sail (after turn 24), you are scored on the share of Vessmark's people saved:

| Counted | Weight |
|---|---|
| Shipped out | 100% |
| Still waiting on an open quay | 75% |
| Still at home behind a held line | 50% |
| Militia still alive | 50% of their survivors |

If the campaign ends early (Aldermoor falls, confidence reaches 0, or every port falls), only the people already shipped out count.

## Grades

| Saved | Grade |
|---|---|
| 58% or more | Saviour of Vessmark |
| 46% or more | An orderly withdrawal |
| 32% or more | A bitter retreat |
| Less | Catastrophe |

Early endings have their own titles: **The government has fallen**, **Relieved of command** and **No way out**. The thresholds live in one constant, `GRADES`, which the end screen and `tests/sim.js` both read.

## Medals

| Medal | Earned for |
|---|---|
| Every port held | No port fell |
| No civilians killed by our own strikes | No air strike killed civilians |
| Dr Okafor's treatment | The treatment reached the field |
| Army intact | As many battalions at the end as at the start |
| (The origin city) never sealed | The outbreak city kept every road open |
| Every promise kept | You made promises, and kept them all |
| An elite garrison | A garrison reached elite experience |

## After-action report

The end screen shows how close you came to the next grade, a breakdown of who was saved and who wasn't, a turn-by-turn chart of people shipped out and lost, the five worst moments in order, your medals, what became of the people in the story, and your service record of past campaigns.
