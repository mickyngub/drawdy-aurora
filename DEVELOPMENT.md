# Developing Aurora

```bash
pnpm install
pnpm test
pnpm run typecheck
pnpm run dev         # dev server on :5216; in Drawdy run ⌘K → "Add extension dev server" on a local board
pnpm run build       # regenerates src/panel-css.ts, src/overlay-html.ts, src/webview-html.ts and dist/*.drawdyx
node scripts/gallery.mjs   # dist/gallery.html, every pattern over a sample sketch
pnpm run preflight   # before submitting: committed, built, pushed, under Drawdy's limits, above the live version
```

The aurora runs in a full-window floating iframe that Drawdy puts above the board and below its toolbars. Extensions have no way to draw behind the board, so it washes over the drawings and Drawdy's UI alike: the iframe and its wrapper both carry `pointer-events: none`, opacity stays at `strength` in `src/look.ts` (0.34 dark, 0.26 light), and the shader halves it behind the top toolbar. The iframe declares the same `color-scheme` as Drawdy's page; a mismatch makes Chrome paint it opaque.

`overlay/` is the iframe's page: `main.ts` mounts the WebGL harness from the `webgl-hero-canvas` skill (copied into `overlay/webgl/`, with a `transparent` option added). Each pattern is one file, `overlay/patterns/<id>.glsl`, that defines `vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow)`; `frame.glsl` documents the contract and does the uniforms, palette, toolbar guard and compositing. The `// @render-scale`, `// @max-dpr`, `// @grain` and `// @thumb-zoom` header lines set how each pattern renders: soft ones at half resolution and DPR 1, crisp ones at full resolution up to DPR 2. `scripts/rollup-plugins.mjs` splices every pattern into the frame and serves them as `virtual:aurora-patterns`; restart the dev server after editing that file, because Node keeps the first copy it loaded. Changing the pattern remounts the harness inside the same iframe; every other setting is a uniform.

To add a pattern: register it in `src/patterns.ts`, write its `.glsl`, and review it with the gallery, which renders patterns as stills over a sample sketch on a dark and a light board:

```bash
node scripts/gallery.mjs            # writes dist/gallery.html
# open dist/gallery.html?ids=clouds,lava&t=12&preset=mono&scale=1
```

The panel's thumbnails use the same still renderer (`overlay/still.ts`) through one shared WebGL context, a few per frame, because a page only gets about 16 contexts.

The panel is a webview (`webview/main.ts`, markup in `src/webview-shell.ts`, settings and starting points in `src/settings.ts`). Drawdy relays panel messages only to the driver and has no command that reaches into a floating iframe, so while you drag, the panel posts `mickyngub.aurora:settings` to every frame of `window.top` and the overlay applies it and answers `mickyngub.aurora:ack`. The panel sends the settings to the driver 300 ms after the last change, which saves them; if no ack came back, the driver reloads the overlay with them instead.

Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`. `pnpm test` holds the manifest and listing files to Drawdy's submission rules.
