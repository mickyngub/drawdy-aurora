/**
 * The single point where this port touches your bundler.
 *
 * The three core shaders live as real `.glsl` files so editors highlight them
 * and diffs stay readable. Getting their text into the bundle is the one thing
 * no framework agrees on.
 *
 * ── Recommended: inline them, and the problem disappears ────────────────────
 *
 *     node scripts/inline-glsl.mjs assets/
 *
 * That writes a sibling `.glsl.ts` next to every `.glsl` file, exporting the
 * source as a template literal. Under bundler or node16 resolution
 * `"./flow.frag.glsl"` then resolves to the generated `.glsl.ts`, and it works
 * identically in Next.js, esbuild, Vite, Rollup, and plain `tsc`.
 *
 * After running it, edit the five text imports by hand. There are three in this
 * file and one each in `surfaces/ribbon.ts` and `surfaces/orb.ts`. In every case
 * delete the `?raw` suffix and the `// @ts-ignore` line above it. If you added a
 * `glsl.d.ts` containing `declare module "*.glsl?raw"`, delete that file too:
 * with the shaders inlined nothing imports a `?raw` specifier any more, and a
 * stale wildcard declaration will silently shadow the real generated module.
 *
 * Before:
 *
 *     // @ts-ignore -- text import provided by the bundler, see the note above
 *     import flowFragmentSource from "./flow.frag.glsl?raw";
 *
 * After:
 *
 *     import flowFragmentSource from "./flow.frag.glsl";
 *
 * Commit the generated `.glsl.ts` files. They are build inputs, not build
 * output: a fresh clone that runs `tsc` or `next build` without them fails on
 * three unresolved imports, and CI has no reason to know about this script. The
 * alternative, if you would rather keep `.glsl` as the only file in git, is a
 * prebuild step that regenerates them, for example
 * `"prebuild": "node scripts/inline-glsl.mjs src/hero"` in package.json. Pick
 * one; do not gitignore them and hope. Either way, re-run the script after
 * editing a shader.
 *
 * ── Alternatives, if you would rather load the .glsl files directly ─────────
 *
 *   Vite / Astro / SvelteKit  the `?raw` suffix below already works
 *   Next.js (webpack)         a `raw-loader` rule for `/\.glsl$/`
 *   Next.js (turbopack)       `experimental.turbo.rules` with `as: "raw"`
 *   esbuild                   `--loader:.glsl=text`
 *   last resort               paste each file's contents into a template
 *                             literal right here by hand
 *
 * The `@ts-ignore`s are deliberate. They cost one line each and keep the `?raw`
 * path working with zero type-declaration setup; if you add a `glsl.d.ts` with a
 * wildcard module declaration, or inline the shaders as above, delete them.
 *
 * ── TypeScript version ─────────────────────────────────────────────────────
 *
 * This port targets TypeScript 5.7 or newer, because `core/audio.ts` declares
 * its analyser buffer as `Uint8Array<ArrayBuffer>`, and the typed-array generic
 * only exists from 5.7. On an older compiler that annotation is an error. The
 * downgrade is one line: in `core/audio.ts` change the declaration to
 * `let bins: Uint8Array | null = null;`. On 5.6 and earlier that is the whole
 * change, since the allocation and `getByteFrequencyData` both accept a plain
 * `Uint8Array` there; if your setup still objects, cast at the single call site
 * with `analyser.getByteFrequencyData(data as Uint8Array)`. Nothing else in the
 * port depends on a 5.7 feature.
 */

// @ts-ignore -- text import provided by the bundler, see the note above
import fullscreenVertexSource from "./fullscreen.vert.glsl?raw";
// @ts-ignore -- text import provided by the bundler, see the note above
import flowFragmentSource from "./flow.frag.glsl?raw";
// @ts-ignore -- text import provided by the bundler, see the note above
import presentFragmentSource from "./present.frag.glsl?raw";

/** The three shaders the harness owns. A surface supplies only the fourth. */
export interface CoreShaderSources {
    /** Shared by all three passes; emits a fullscreen triangle from gl_VertexID. */
    readonly vertex: string;
    /** The velocity field simulation. */
    readonly flowFragment: string;
    /** Vignette and grain, drawn straight to the canvas. */
    readonly presentFragment: string;
}

export const CORE_SHADERS: CoreShaderSources = {
    vertex: fullscreenVertexSource as string,
    flowFragment: flowFragmentSource as string,
    presentFragment: presentFragmentSource as string,
};
