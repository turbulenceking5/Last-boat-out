# Deploying

The games are static files served by **GitHub Pages** from the `main` branch.

| Page | Served from |
|---|---|
| https://turbulenceking5.github.io/Last-boat-out/ | `index.html` (plus `models/models.js`) |
| https://turbulenceking5.github.io/Last-boat-out/city/ | `city/index.html` and `city/city.js` |

## Releasing a change

1. Make the change on a branch. If you changed TypeScript, rebuild (`npm run build:models` or `npm run build:city`) and commit the rebuilt `.js` file too.
2. Run the checks in [CONTRIBUTING.md](../CONTRIBUTING.md#checks).
3. Open a pull request into `main` and merge it.
4. GitHub Pages republishes within a minute or two. To check it's live, compare the served file with `main`:

```sh
curl -s https://turbulenceking5.github.io/Last-boat-out/city/city.js | cmp - <(git show origin/main:city/city.js) && echo live
```

## External resources

| Resource | From | Needed for |
|---|---|---|
| Fonts (Special Elite, Barlow Semi Condensed, IBM Plex Mono) | Google Fonts | Looks; falls back to system fonts |
| Three.js r149 | cdn.jsdelivr.net, pinned with an integrity hash | The 3D place models (optional) and the City (required) |

If you update Three.js, recompute the integrity hash:

```sh
curl -s https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js | openssl dgst -sha384 -binary | openssl base64 -A
```

Three.js deprecated the `build/three.min.js` global build in r150 and removed it in r160. Moving past r149 means either accepting a deprecation warning or switching to ES modules (which also changes how the TypeScript is built).
