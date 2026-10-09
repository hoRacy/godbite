# Godbite — a white forest without windows

A native-scroll journey through four Three.js scenes: the threshold, ritual, cinema and signal. Vite, TypeScript, semantic HTML, local fonts and original Godbite artwork. English and Polish, optional synthesized ambient, and still-image fallback.

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

Tests cover all recordings and films, lazy media loading, keyboard dialogs, language persistence, motion preferences, context loss, WebGL denial and mobile layout. External YouTube playback is mocked in UI tests; use the published site to verify the real player. Mobile tests emulate a device; confirm frame rate on a physical phone before advertising a performance guarantee.

## GitHub Pages

The repository is `hoRacy/godbite`, default branch `master`; Vite's base is `/godbite/`.
Select **Settings → Pages → Source: GitHub Actions**. The included workflow checks and builds pull requests; pushes to master publish `dist` to **https://horacy.github.io/godbite/**. No separate build branch is needed.

The canonical URL, social metadata, sitemap and robots file use that address. Update them and Vite's base together if moving to a custom domain. No secrets, backend, analytics, or third-party scripts are used at startup. YouTube is contacted only after a visitor starts a film. Ambient sound starts only after a visitor enables it.
