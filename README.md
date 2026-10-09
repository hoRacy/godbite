# Godbite — a white forest without windows

A native-scroll journey through four Three.js scenes: the threshold, ritual, cinema and signal. Vite, TypeScript, semantic HTML, local fonts and original Godbite artwork. English and Polish, pulsing synthesized ambient, enabled by default, and still-image fallback.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the /godbite/ address printed by Vite. Production: `npm run build`, then `npm run preview`.

## Update music and films

Edit `src/content.ts`: typed recordings, YouTube IDs, social links and both translations. The EP displayed as **You can lead a horse EP** links to its existing Bandcamp **demo** page. Replace images in `public/images`; the asset preparation script documents their original sources.

- `npm run assets` refreshes official covers and film thumbnails.
- `node scripts/capture-stills.mjs` against the running dev server exports the four real scene stills, social card and desktop/mobile previews.
- Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` if using an installed browser instead of Playwright Chromium.
- Cover credits: Mir — Artur Ciechorski; JISM and Social Media Girls — Trash Boat. The original artwork is not licensed for reuse outside Godbite's site.

## Checks

```sh
npx playwright install chromium firefox webkit
npm run build
npm test
```

Tests cover all recordings and films, lazy media loading, keyboard dialogs, language persistence, motion preferences, context loss, WebGL denial, default audio, retained mute preference, film audio suppression and mobile layout. External YouTube playback is mocked in UI tests; use the published site to verify the real player. Mobile tests emulate a device; confirm frame rate on a physical phone before advertising a performance guarantee.

## GitHub Pages

The repository is `hoRacy/godbite`, default branch `master`; Vite's base is `/godbite/`.
Select **Settings → Pages → Source: GitHub Actions**. Pushes to master check types, build and test all five browser projects, then publish to **https://horacy.github.io/godbite/**. For a manual deployment, select **Actions → Publish Godbite → Run workflow → master**. Deployment is skipped cleanly until Pages is enabled. No separate build branch is needed.

The canonical URL, social metadata, sitemap and robots file use that address. Update them and Vite's base together if moving to a custom domain. No secrets, backend, analytics, or third-party scripts are used at startup. YouTube is contacted only after a visitor starts a film. Ambient sound is enabled by default and starts automatically when allowed, or with the first click, tap or keyboard interaction when the browser blocks autoplay. A deliberate mute is remembered for the tab session. Film playback temporarily silences the ambient and closing the film restores it.

## Atmosphere

The world renders through a custom cinematic diffusion pipeline: soft focus, low-resolution halation, drifting haze, dark color grading and a vignette. Direct lighting is sparse and moving; foreground mist hides tree, stone and seat edges. HTML remains sharp and readable. Reduced-motion and unsupported-WebGL visitors receive captured frames from the same darker scenery.

Ambient synthesis uses two slow pressure waves, an irregular double pulse, detuned low drones, moving filtered air and a long stereo reverb. It has no audio downloads. Its AudioContext respects browser autoplay restrictions; a waiting hint explains the first-interaction requirement.
