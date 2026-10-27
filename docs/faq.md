# FAQ

**Where can I play?**
The original: https://turbulenceking5.github.io/Last-boat-out/. The City: https://turbulenceking5.github.io/Last-boat-out/city/. Both run in any modern browser, on desktop or phone, with no install.

**Do I need an internet connection?**
The original game works offline once loaded; only its fonts and the optional 3D place models come from the internet. The City needs to download Three.js the first time.

**Is my progress saved?**
The original saves your campaign, preferences and record of past campaigns in your browser, so it survives a reload. Clearing site data, or a private window, loses them. The City doesn't save games in progress yet.

**Why is the 3D view missing?**
Your browser couldn't load Three.js from jsDelivr, or doesn't support WebGL. The original game works without it. The City needs it, and says so.

**How do I replay a campaign?**
Every campaign has a seed. In the original, enter it on the setup screen, use **Replay this seed** on the end screen, or open a share link like `…/#seed=4242&scenario=random&diff=veteran`. In the City, add `#seed=123` to the address.

**Is there sound?**
Yes, in both. All of it is synthesised in the browser. The City's mute button (or M) remembers your choice.

**Can I play with a keyboard or a screen reader?**
The original is fully playable by keyboard, and screen readers hear each place's state and the result of every turn and order. See [the original's architecture](original/09-code-architecture.md#accessibility). The City has keyboard shortcuts, but needs a mouse or touch to select and move units.

**How hard is it?**
On Regular, doing nothing saves about 14% (original) or 20% (City). A good scripted player reaches about 49 to 52% (original) and 52 to 65% (City). See the strategy guides.

**How do I change the game?**
See [CONTRIBUTING.md](../CONTRIBUTING.md).
