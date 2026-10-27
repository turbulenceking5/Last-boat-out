# 13. Making the City more fun

From playing the City prototype through its tests, three things were missing: things to react to (every infected was the same and the middle of the game was quiet), things to do beyond placing units (troops only stand and shoot), and feedback (no sound, no impact). This round adds:

## Special infected

| Kind | Health | Speed | Notes |
|---|---|---|---|
| Walker | 3 | 0.55 to 1.0 | As before |
| Runner | 1.5 | 1.6 to 2.0 | Red shirts, lean into a sprint, notice people from 8 cells further away |
| Brute | 16 | 0.45 to 0.6 | Drawn 1.6 times the size; batter doors 6 times as fast; hit troops for 2 and vehicles for 5 |

Runners and brutes get commoner as the 12 minutes go on: brutes from 2% to 5% of new infected, runners from 6% to 16%.

## APC rescues

A parked APC beside a populated block takes 10 people aboard every half second, up to 60. Beside an evacuation point it lets them off into the queue. Select an APC and tap a block to send it to that block's nearest door; tap near an evacuation point to drop people off. If the APC is destroyed, everyone aboard is lost.

## Missions

About once a minute, while fewer than two are active, a mission appears on a street away from the fort and the evacuation points:

- **Supply drop:** get any unit there within 60 seconds for $700.
- **Survivors:** 60 to 90 people signalling from a rooftop, worth $400. Get any unit there within 75 seconds; an APC takes them aboard, otherwise they walk to the evacuation points. They draw the infected like any crowd, and are added to the city's total when they appear, so losing them counts against you.

Missions show as beams of light with a pulsing ring, in a Missions list with countdowns and a Show button that moves the camera there.

## The great horde

At 7:30 a siren sounds and a banner warns that a great horde is 30 seconds out. At 8:00, 220 infected (2,200 people's worth, with extra runners and brutes) appear on the eastern roads and march toward the centre of the city until they find someone.

## Sound and impact

All sound is synthesised with Web Audio: rifle shots, APC and gunship machine guns, tank cannon, explosions, ship horns, the siren, chimes for completed missions and drop-offs, brutes crunching into doors and vehicles, and groans when infected are in view. Sounds fade with distance from where the camera is looking, and each kind is rate-limited so firefights stay readable. Air strikes shake the camera. The mute button or M toggles sound, and the setting is remembered.

## Balance (tests/city.js, 4 seeded games each)

| Strategy | Before | After |
|---|---|---|
| Do nothing | 23.0% | see below |
| Evacuate everything at once | 32.5% | see below |
| Steady scripted player | 50.8% | see below |
| Active: steady plus missions and two rescue APCs | | see below |

The active player completes 7 to 9 missions a game and carries about 3,000 people out by APC.
