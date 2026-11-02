# Screw Loose

A puzzle game: move screws between holes to unscrew overlapping wooden panels and let them all fall. Built with Phaser 4, Vite and Electron — playable in the browser and as a desktop app for macOS, Windows and Linux.

- Play in your browser: <https://jd4rider.github.io/screw-loose/play/>
- Downloads: <https://github.com/jd4rider/screw-loose/releases/latest>

## How to play

- Tap a free (uncovered) screw, then tap an empty hole to move it. Screws under another panel are blocked.
- A panel held by 2+ screws is rigid; with one screw left it swings down like a hinge; with none it falls.
- **Sliders** hang on one screw and slide out when it is gone. **Heavy plates** need all of their screws, so pulling any one drops them.
- Remove every panel. 200 levels (seeded, each checked solvable by a solver) across 5 workshops. Undo (U), hint (H), restart (R), Esc for levels.

## Develop

```sh
npm install
npm run dev      # web dev server
npm test         # level generator and solver tests
npm start        # build and open in Electron
npm run dist:mac # package an installer (also dist:win, dist:linux)
```

## Release

Push a tag like `v0.1.0` and the **Release apps** workflow builds the macOS, Windows and Linux installers. Every push to `main` deploys the web version to GitHub Pages.
