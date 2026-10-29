# Developing Aurora

```bash
pnpm install
pnpm test
pnpm run typecheck
pnpm run dev         # dev server on :5216; in Drawdy run ⌘K → "Add extension dev server" on a local board
pnpm run build       # regenerates src/overlay-html.ts and dist/*.drawdyx
pnpm run preflight   # before submitting: committed, built, pushed, under Drawdy's limits, above the live version
```

The aurora runs in a full-window floating iframe that Drawdy puts above the board and below its toolbars. Extensions have no way to draw behind the board, so the iframe and its wrapper both carry `pointer-events: none`, and the shader stays low and fades out before the bottom corners, where Drawdy keeps its minimap and help buttons. The iframe declares the same `color-scheme` as Drawdy's page; a mismatch makes Chrome paint it opaque.

`overlay/` is the iframe's page: `main.ts` mounts the WebGL harness from the `webgl-hero-canvas` skill (copied into `overlay/webgl/`, with a `transparent` option added) and `aurora.frag.glsl` is the effect. `rollup.config.mjs` bundles it with its Tailwind CSS into `src/overlay-html.ts`, which is committed because Drawdy builds published versions from `src/index.ts` alone. The driver swaps `__AURORA_LOOK__` in that page for the theme's colours, so a theme change reloads the iframe.

Bump `driverVersion` in `manifest.json` for every release and add it to `CHANGELOG.md`. `pnpm test` holds the manifest and listing files to Drawdy's submission rules.
