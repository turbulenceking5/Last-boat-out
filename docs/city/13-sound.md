# Sound

`city/src/audio.ts` synthesises every sound with Web Audio, so there are no files to download.

## When it starts

Browsers only allow audio after a user gesture, so the audio context starts on **Take command** or the first touch of the map. Mute with the speaker button or M; the choice is saved in local storage (wrapped in try/catch, so blocked storage is fine).

## The sounds

| Event | Recorded by | Sound |
|---|---|---|
| Rifle and militia fire | A soldier fires | A short band-passed noise crack |
| APC and gunship fire | Their guns fire | A shorter, lower crack |
| Tank cannon | A tank fires, or fires an HE barrage | A low-passed noise thump and a falling sine |
| Explosion | Air strike bombs; grenades, molotovs and shells landing; a vehicle destroyed | A long low-passed rumble and a deep falling sine |
| Ship horn | The harbour ship sails; 90 and 30 seconds before the last ship | Two low sawtooth tones |
| Siren | The great horde warning | A rising and falling square wave, three times |
| APC siren | An APC's flare and siren ability, every 1.5 s while it lasts | A rising then falling sawtooth wail |
| Throw | A grenade or molotov thrown | A short band-passed whoosh; the landing is an explosion |
| Bugle | A unit is promoted | Three rising triangle-wave notes |
| Tick | The last 10 seconds before the last ship | A short high square blip |
| Chime | Mission done; APC drop-off; new mission; an order from HQ done; a decision; reinforcements | Two sine notes |
| Crunch | A brute hits a door or a vehicle | A band-passed noise crunch |
| Groan | More than 5 infected near the camera | A low, filtered sawtooth every few seconds |

## Keeping it listenable

- The simulation only records events (`G.sfx`); `playSfx` plays them once a frame.
- Each frame keeps only the loudest event of each kind.
- Each kind has a minimum gap (45 ms for rifles, 250 ms for cannon, 2 s for horns).
- Volume falls off with distance from where the camera is looking, and with zoom. The horde siren, horn, chimes, bugle and countdown tick always play at full volume.
