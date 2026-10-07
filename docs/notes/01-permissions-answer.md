# 01. How to give Claude permission to load the game

## Short answer

You don't need to grant anything to load the game from this repository. The whole game is `index.html`, and the cloud container already has Chromium and Playwright. Claude opened it, started a campaign, and took screenshots without any extra permission (see [03-loading-the-game.md](03-loading-the-game.md)).

## The one thing that is blocked

The **live site** at https://turbulenceking5.github.io/Last-boat-out/ is blocked. The environment's network policy refuses the host `turbulenceking5.github.io` (the proxy returns 403).

To allow it:

1. Open the cloud environment menu in the session's title bar and choose **Edit**.
2. Under **Network access**, either pick a broader access level, or pick **Custom** and add `turbulenceking5.github.io` under **Allowed domains**. Keep the default list of package managers.
3. Start a new session (or continue this one) and ask Claude to load the live URL.

Docs: https://code.claude.com/docs/en/cloud-environments#network-access

## When you'd want the live site

- To check the deployed GitHub Pages build matches `main`.
- To test something that only happens over HTTP rather than `file://` (for example caching or font loading).

For playing, testing balance or fuzzing the UI, the local file is enough.

## Update

Done: the host was added in the Claude environment settings (not on GitHub), and the live site now loads. See [09-live-site-check.md](09-live-site-check.md).
