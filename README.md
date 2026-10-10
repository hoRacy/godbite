# Godbite — a white forest without windows

A native-scroll journey through five Three.js scenes: the threshold, ritual, cinema, live club and signal. Vite, TypeScript, semantic HTML, local fonts and original Godbite artwork. English and Polish, pulsing synthesized ambient, enabled by default, and still-image fallback.

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
- `node scripts/capture-stills.mjs` against the running dev server exports the five real scene stills, social card and desktop/mobile previews.
- Append `--live-only` after the dev URL to refresh only the club, including its portrait fallback. The captured silhouette and its invisible button share the same position on both layouts.
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

Camera positions, room alignment and text fades live in `src/journey.ts`. The forest door and first recording share the centre of the frame. A level arc clears the final pedestal and joins a straight axis through the cinema doorway and screen into the live club; move the rooms and their focal points together when changing a doorway. Camera interpolation preserves velocity and acceleration at every join, with critically damped scroll tracking. `RECORD_STOPS` controls the five recording views; `chapterPresentation` controls text independently of camera motion. `scenePresence` fades each room and its lights continuously instead of toggling them during the recording visits.

The world renders through a custom cinematic diffusion pipeline: soft focus, low-resolution halation, drifting haze, dark color grading and a vignette. Mist is a continuous world-space volume in `src/cinematic.ts`, integrated along each camera ray up to the scene depth at half resolution. Smooth 3D noise replaces the rectangular mist meshes, so there are no card edges or layer crossings; density changes gradually along the journey. Independently drifting denser pockets gather in parts of the volume, with a lighter treatment around album artwork. Both doors have restrained red light behind the opening and thin, softly feathered streaks beside the jambs. These are integrated analytically into the mist, following the doorway transforms and scene fades without adding fog cards or washing the scene in red. Diffusion and image distortion fall to 12% in the gallery, with lighter halation and grain to keep album artwork legible while forest mist remains until the cinema approach; the cinema retains a softer reduction. Direct lighting is sparse and moving. Instanced grass, irregular dark shrubs, twigs, rocks and a textured forest floor continue through the recording gallery, framed by trees around the clear central path. Velvet curtains catch red side light, while a soft rear wash reveals the cinema seats. The next space is an empty club with scuffed walls, stage equipment, litter, warm and cool spotlights, dense drifting haze and softly rising dust motes. Its screen plays the supplied live show in an aligned YouTube iframe after an explicit click; leaving the chapter removes the player and restores ambient sound. All fog and atmospheric haze fade out before the final “Let it in” chapter. The cinema entrance light flare is softened. Signal threads deform independently with slow traveling waves in three dimensions. HTML remains sharp and readable. Reduced-motion and unsupported-WebGL visitors receive captured frames from the same darker scenery.

Ambient synthesis uses two slow pressure waves, an irregular double pulse, detuned low drones, moving filtered air and a long stereo reverb. It has no audio downloads. Its AudioContext respects browser autoplay restrictions; a waiting hint explains the first-interaction requirement.

The club drum kit includes curved cymbals, a paired hi-hat with pedal, snare, bass-mounted tom and floor tom. The kit fades out over 0.8 seconds during live-screen playback and returns when the player closes, while world animation continues. There is no manual motion toggle; opening Credits or other dialogs leaves the scene moving. The operating system’s reduced-motion preference still uses scene stills. Static views use matching captures with and without drums; reduced-motion views switch immediately. A faint figure faces the wall on the right, with a dim cool outline; clicking it opens the secret Godrite concert and stops any live-screen playback. Its button also supports keyboard focus and Enter, including the still-image fallback.
