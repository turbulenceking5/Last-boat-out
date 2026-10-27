# Units and support

Everything is bought from the bar along the bottom. Troops and vehicles drive out of Fort Aldermoor to the spot you tap; militia appear at the block they were raised from.

## Ground units

| Unit | Cost | Strength | Health each | Damage | Range | Fires every | Accuracy | Speed |
|---|---|---|---|---|---|---|---|---|
| Militia | $100 | 6 people | 3 | 1 | 5 | 1.3 s | 45% | 2.4 |
| Infantry squad | $300 | 8 soldiers | 6 | 1.5 | 7 | 0.8 s | 70% | 2.6 |
| APC | $700 | 1 vehicle | 70 | 1.2 | 8 | 0.14 s | 65% | 4.2 |
| Tank | $1,200 | 1 vehicle | 160 | 4, splash 1.8 | 10 | 1.8 s | 90% | 3.0 |

Range and speed are in cells (a block is 6 cells across, a road 2). Every unit fires at the nearest infected in range on its own, including while it moves.

- **Militia** are raised from 60 of a block's residents. They are cheap and weak. Survivors leave on the last ship and count as saved; militia who die count as dead.
- **Infantry** are the backbone: steady, accurate and cheap enough to buy in numbers.
- **APCs** have a fast machine gun and carry civilians: see [Civilians and evacuation](05-civilians-and-evacuation.md#apc-rescues). If an APC is destroyed, everyone aboard is lost.
- **Tanks** hit everything near the shell's landing point and shrug off most attacks, though brutes do real damage to vehicles.

Soldiers who die have a 50% chance of rising as infected.

## Special abilities

Every ground unit has one ability on a cooldown. Select units and press **F**, or use the ability button in the unit panel; F fires the ability of every selected unit at once. The button shows the seconds left, or "ready".

| Unit | Ability | Cooldown | What it does |
|---|---|---|---|
| Militia | Molotovs | 30 s | Two petrol bombs on the thickest knot of infected within 6 cells: 3 damage within 1.6 cells each |
| Infantry | Grenades | 20 s | Two grenades on the thickest knot within 8 cells: 4 damage within 1.9 cells each, which kills walkers and runners outright |
| APC | Flare and siren | 45 s | For 12 seconds, every infected within about 26 cells comes for the APC instead of anyone else. Drive away and they follow; park it in front of your guns and they walk into them |
| Tank | HE barrage | 40 s | Four shells on the thickest knot within 14 cells: 8 damage within 2.4 cells each |

Thrown weapons and shells need at least 3 infected close together, land after half a second to a second, and never hurt civilians. If there's no target, the toast says so and the cooldown isn't spent.

## Ranks

Units earn ranks from their kills. Each rank adds 8 points of accuracy (up to 97%), fires 15% faster, and recharges the ability 15% sooner.

| Rank | Kills | Shown as |
|---|---|---|
| Rookie | 0 | |
| Veteran | 50 | ★ over the unit and in its panel |
| Elite | 150 | ★★ |

A promotion plays a short bugle call and shows over the unit. The panel says how many kills to the next rank. The end screen names the unit of the night: the one with the most kills.

## Reinforcing and repairs

Bring a unit to Fort Aldermoor (within 9 cells) or an evacuation point (within 6 cells, 8 at the harbour), out of contact (no infected within 5 cells), and press **R** or the Reinforce button. Fallen soldiers are replaced, the wounded patched up and vehicles repaired, and the unit keeps its rank. It costs 60% of the unit's price for what was lost: about $22 a soldier for infantry, $4.50 a point of a tank's armour. Militia are volunteers and can't be reinforced.

## Support

| Support | Cost | What it does |
|---|---|---|
| Air strike | $500 | 2.5 seconds after you tap, a jet drops 5 bombs in a line about 8 cells long. Each kills every infected and every civilian within 2.4 cells, hurts soldiers (−4) and vehicles (−20), and blocks close to the target lose 15% of the people inside. The camera shakes. |
| Gunship | $1,000 | Circles the point you tap (5 cells out) for 45 seconds, firing every 0.1 s at the nearest infected within 11 cells: 80% hit, 2 damage. |
| Evac point | $300 | A bus stop on a street or the quay, at least 6 cells from another. Buses take 70 people every 10 seconds; it holds up to 350 waiting. |

## Where to put them

- Troops on the streets between the infected and the people you are evacuating buy the most time.
- Crowds at evacuation points draw the infected, so guard them.
- Air strikes kill civilians too: use them on hordes that are away from people.
