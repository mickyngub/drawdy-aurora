# Developing Aurora

```bash
pnpm install
pnpm test
pnpm run typecheck
pnpm run dev         # dev server on :5216; in Drawdy run ⌘K → "Add extension dev server" on a local board
pnpm run build       # regenerates src/panel-css.ts, src/overlay-html.ts, src/webview-html.ts and dist/*.drawdyx
pnpm run preflight   # before submitting: committed, built, pushed, under Drawdy's limits, above the live version
```

The aurora runs in a full-window floating iframe that Drawdy puts above the board and below its toolbars. Extensions have no way to draw behind the board, so it washes over the drawings and Drawdy's UI alike: the iframe and its wrapper both carry `pointer-events: none`, opacity stays at `strength` in `src/look.ts` (0.34 dark, 0.26 light), and the shader halves it behind the top toolbar. The iframe declares the same `color-scheme` as Drawdy's page; a mismatch makes Chrome paint it opaque.

`overlay/` is the iframe's page: `main.ts` mounts the WebGL harness from the `webgl-hero-canvas` skill (copied into `overlay/webgl/`, with a `transparent` option added), and each pattern is one shader in `overlay/patterns/`. `PATTERN_SETUP` in `main.ts` gives each its render scale: Curtains is soft enough for half resolution at DPR 1, while Glyphs, Dots and Contours render every pixel up to DPR 2 so their edges stay crisp. Changing the pattern destroys and remounts the harness inside the same iframe; every other setting is a uniform. `rollup.config.mjs` bundles it with its Tailwind CSS into `src/overlay-html.ts`, which is committed because Drawdy builds published versions from `src/index.ts` alone. The driver swaps `__AURORA_LOOK__` in that page for the theme's colours, so a theme change reloads the iframe.

The panel is a webview (`webview/main.ts`, markup in `src/webview-shell.ts`, settings and starting points in `src/settings.ts`). Drawdy relays panel messages only to the driver and has no command that reaches into a floating iframe, so while you drag, the panel posts `mickyngub.aurora:settings` to every frame of `window.top` and the overlay applies it and answers `mickyngub.aurora:ack`. The panel sends the settings to the driver 300 ms after the last change, which saves them; if no ack came back, the driver reloads the overlay with them instead.

Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`. `pnpm test` holds the manifest and listing files to Drawdy's submission rules.
