# Portal builds (CrazyGames, Poki)

A separate build of the game for portals. The normal site and its deploy are unchanged.

```sh
npm run build:crazygames   # portal-build/crazygames
npm run build:poki         # portal-build/poki
```

Zip the contents of the folder (so `index.html` is at the top level) and upload it to the portal.

## What differs from the website

- Solo only: no accounts, leaderboard or multiplayer, and no server calls. Gems, ships and the equipped ship are saved in the browser (`client/src/lib/local-game-store.ts`), using the same rules as the server.
- Your AdSense and Google Analytics tags and Google Fonts are removed, because portals allow only their own ads and block third-party requests. The fonts are bundled instead.
- The portal's SDK is added. It is told when a run starts and stops, and an ad break is requested when a run ends (`client/src/lib/portal-sdk.ts`). If the SDK or an ad is unavailable, the game carries on.
- Rewarded ad: after a run, the player can choose to watch an ad for bonus gems equal to the run's gems. The bonus is only given when the ad is watched to the end.
- The layout fills the portal's frame with no page scroll: a slim top bar, a 16:9 game frame that scales to fit (also on landscape phones), and a compact game-over panel on short screens.
- Routing is kept in memory, so the address bar inside the portal's iframe never changes.

## Before submitting

- Checked in a desktop browser at Poki's sizes (640x360, 836x470, 1031x580) and at phone sizes; still try it on a real phone.
- Add the cover images, description and controls text the portal asks for.
- Test inside each portal's own tool (CrazyGames QA tool, Poki Inspector).
