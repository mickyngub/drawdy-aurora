/**
 * OKLab colour helpers.
 *
 * Every palette in this pipeline is converted to OKLab on the CPU and uploaded
 * as raw Lab triples; the shaders convert back to sRGB exactly once, on the last
 * line. Doing the conversion here rather than in the shader means the expensive
 * cube roots run once per palette change instead of once per pixel per frame.
 *
 * This module is pure arithmetic: no DOM, no GL, no imports from the harness or
 * the surfaces. That is deliberate and worth preserving. Astro frontmatter, a
 * Next.js server component, or any other build-time context has to produce the
 * fallback gradient and derive palettes without ever creating a canvas, so
 * everything needed for that path lives here and nowhere else.
 */

/** An OKLab colour: perceptual lightness, green-red axis, blue-yellow axis. */
export type OklabColor = readonly [L: number, a: number, b: number];

/** Exactly five stops, darkest to brightest. Every ramp in this pipeline is five wide. */
export type PaletteStops = readonly [string, string, string, string, string];

const HEX_PATTERN = /^#?([0-9a-f]{6})$/i;

/** sRGB transfer, encoded to linear. */
function srgbToLinear(channel: number): number {
    return channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Linear to sRGB, clamped because out-of-gamut Lab values land outside 0..1. */
function linearToSrgb(channel: number): number {
    const encoded =
        channel <= 0.0031308
            ? 12.92 * channel
            : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, encoded));
}

/**
 * "#1a2b3c" (or "1a2b3c") to OKLab.
 *
 * @throws on a malformed hex string. Palettes come from design tokens and a
 *   typo there should fail at mount, not render as black.
 */
export function hexToOklab(hex: string): OklabColor {
    const match = HEX_PATTERN.exec(hex.trim());
    if (!match)
        throw new Error(`Expected a 6-digit hex colour, received "${hex}".`);

    const packed = Number.parseInt(match[1], 16);
    const red = srgbToLinear(((packed >> 16) & 255) / 255);
    const green = srgbToLinear(((packed >> 8) & 255) / 255);
    const blue = srgbToLinear((packed & 255) / 255);

    // Linear RGB to the LMS cone space OKLab is built on, then the cube root that
    // gives OKLab its perceptual uniformity.
    const longCone = Math.cbrt(
        0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
    );
    const mediumCone = Math.cbrt(
        0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
    );
    const shortCone = Math.cbrt(
        0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
    );

    return [
        0.2104542553 * longCone +
            0.793617785 * mediumCone -
            0.0040720468 * shortCone,
        1.9779984951 * longCone -
            2.428592205 * mediumCone +
            0.4505937099 * shortCone,
        0.0259040371 * longCone +
            0.7827717662 * mediumCone -
            0.808675766 * shortCone,
    ];
}

/**
 * OKLab back to a hex string. Out-of-gamut colours are clamped per channel,
 * which shifts the hue; use {@link gamutClipChroma} when hue must be preserved.
 */
export function oklabToHex(lab: OklabColor): string {
    const [lightness, greenRed, blueYellow] = lab;

    const longCone =
        (lightness + 0.3963377774 * greenRed + 0.2158037573 * blueYellow) ** 3;
    const mediumCone =
        (lightness - 0.1055613458 * greenRed - 0.0638541728 * blueYellow) ** 3;
    const shortCone =
        (lightness - 0.0894841775 * greenRed - 1.291485548 * blueYellow) ** 3;

    const red = linearToSrgb(
        4.0767416621 * longCone -
            3.3077115913 * mediumCone +
            0.2309699292 * shortCone
    );
    const green = linearToSrgb(
        -1.2684380046 * longCone +
            2.6097574011 * mediumCone -
            0.3413193965 * shortCone
    );
    const blue = linearToSrgb(
        -0.0041960863 * longCone -
            0.7034186147 * mediumCone +
            1.707614701 * shortCone
    );

    const packed =
        0x1000000 |
        (Math.round(255 * red) << 16) |
        (Math.round(255 * green) << 8) |
        Math.round(255 * blue);
    return `#${packed.toString(16).slice(1)}`;
}

/**
 * Flattens hex stops into the Float32Array that `gl.uniform3fv` wants for a
 * `vec3[N]` uniform.
 *
 * The shader receives Lab, not RGB. Uploading RGB and converting per-pixel
 * would be both slower and wrong: the ramp's smoothsteps have to interpolate in
 * the perceptual space or the midpoints go muddy.
 */
export function labStops(stops: readonly string[]): Float32Array {
    const flat = new Float32Array(stops.length * 3);
    stops.forEach((hex, index) => {
        const [lightness, greenRed, blueYellow] = hexToOklab(hex);
        flat[index * 3] = lightness;
        flat[index * 3 + 1] = greenRed;
        flat[index * 3 + 2] = blueYellow;
    });
    return flat;
}

/** An OKLCh colour: the polar form of OKLab, which is the form hue rotation needs. */
export interface OklchColor {
    /** Perceptual lightness, 0..1. */
    readonly lightness: number;
    /** Distance from the neutral axis. Roughly 0..0.4 in OKLab units. */
    readonly chroma: number;
    /** Hue angle in degrees, 0..360. */
    readonly hueDegrees: number;
}

/** Hex to the polar form. */
export function hexToOklch(hex: string): OklchColor {
    const [lightness, greenRed, blueYellow] = hexToOklab(hex);
    const hueRadians = Math.atan2(blueYellow, greenRed);
    return {
        lightness,
        chroma: Math.hypot(greenRed, blueYellow),
        hueDegrees: ((hueRadians * 180) / Math.PI + 360) % 360,
    };
}

/** Options for {@link gamutClipChroma}. */
export interface GamutClipOptions {
    /** Perceptual lightness to hold, 0..1. */
    lightness: number;
    /** Chroma to aim for, before clipping. Roughly 0..0.4 in OKLab. */
    chroma: number;
    /** Hue in degrees, 0..360. */
    hueDegrees: number;
    /** Chroma fraction removed per attempt. Smaller is more precise and slower. */
    step?: number;
    /** How close the round trip must land, in OKLab distance. */
    tolerance?: number;
}

/**
 * Finds the most saturated in-gamut hex colour at a given lightness and hue.
 *
 * Naively clamping RGB shifts the hue, which is fatal when generating a family
 * of colours that must read as one system: clamp a purple and a green at the
 * same lightness and they no longer look like siblings. Instead this walks
 * chroma down until the colour survives a round trip through hex unchanged,
 * which is exactly the condition "this colour is representable".
 *
 * Returns the achromatic colour at that lightness if even zero chroma fails,
 * which only happens for lightness outside 0..1.
 */
export function gamutClipChroma(options: GamutClipOptions): string {
    const {
        lightness,
        chroma,
        hueDegrees,
        step = 0.05,
        tolerance = 0.02,
    } = options;
    const hueRadians = (hueDegrees * Math.PI) / 180;

    for (let fraction = 1; fraction > 0; fraction -= step) {
        const candidate: OklabColor = [
            lightness,
            chroma * fraction * Math.cos(hueRadians),
            chroma * fraction * Math.sin(hueRadians),
        ];
        const hex = oklabToHex(candidate);
        const roundTrip = hexToOklab(hex);
        const drift = Math.hypot(
            roundTrip[0] - candidate[0],
            roundTrip[1] - candidate[1],
            roundTrip[2] - candidate[2]
        );
        if (drift < tolerance) return hex;
    }

    return oklabToHex([lightness, 0, 0]);
}

/**
 * Rotates a colour's hue by a delta while holding its own lightness and chroma.
 *
 * The result is gamut-clipped rather than RGB-clamped. Clamping in RGB shifts
 * the hue, which defeats the point: rotate a saturated blue toward yellow with a
 * clamp and you get a colour that is neither the hue you asked for nor a
 * sibling of what you started with.
 *
 * Achromatic colours (near-zero chroma) come back unchanged, because rotating
 * the hue of a grey is meaningless and would otherwise introduce a tint from
 * floating-point noise in `atan2`.
 */
export function rotateHexHue(hex: string, deltaDegrees: number): string {
    const { lightness, chroma, hueDegrees } = hexToOklch(hex);
    if (chroma < 1e-4) return hex;
    return gamutClipChroma({
        lightness,
        chroma,
        hueDegrees: (((hueDegrees + deltaDegrees) % 360) + 360) % 360,
    });
}

/**
 * Lightness and chroma of each stop in a palette, which is the shape a hue
 * rotation needs: keep the lightness/chroma profile, swap the hue, and a new
 * palette lands with the same contrast structure as the original.
 */
export function paletteProfile(
    stops: readonly string[]
): { lightness: number; chroma: number }[] {
    return stops.map((hex) => {
        const [lightness, greenRed, blueYellow] = hexToOklab(hex);
        return { lightness, chroma: Math.hypot(greenRed, blueYellow) };
    });
}

/**
 * Flattens a palette onto ONE absolute hue, keeping each stop's lightness and
 * chroma.
 *
 * Every stop ends on the same hue, so the result is a clean single-hue ramp
 * regardless of what the source palette did. Reach for this when the base
 * palette is monochromatic anyway, or when you want a guaranteed one-hue family
 * from a base whose stops drift in hue.
 *
 * @param baseStops palette whose lightness/chroma profile to keep
 * @param hueDegrees absolute target hue, 0..360
 */
export function generateOrbPalette(
    baseStops: PaletteStops,
    hueDegrees: number
): PaletteStops {
    const profile = paletteProfile(baseStops);
    const generated = profile.map((stop) =>
        gamutClipChroma({
            lightness: stop.lightness,
            chroma: stop.chroma,
            hueDegrees,
        })
    );
    return [
        generated[0],
        generated[1],
        generated[2],
        generated[3],
        generated[4],
    ];
}

/**
 * Rotates every stop's hue by the SAME delta, keeping each stop's own
 * lightness, chroma, and hue relationship to its neighbours.
 *
 * This is the one to reach for by default. Most real palettes are not
 * single-hue: a good ramp warms or cools as it brightens, and that internal hue
 * drift is a large part of why it looks designed. {@link generateOrbPalette}
 * flattens that drift away; this preserves it and moves the whole ramp around
 * the wheel, so six orbs generated at 60-degree steps read as six members of one
 * family rather than six unrelated single-hue ramps.
 *
 * Chroma is gamut-clipped per stop rather than the result being clamped in RGB,
 * because clamping shifts hue and breaks exactly the family resemblance this
 * exists for.
 *
 * @param baseStops palette to rotate
 * @param hueDegrees delta in degrees, not an absolute hue; may be negative
 */
export function rotateOrbPalette(
    baseStops: PaletteStops,
    hueDegrees: number
): PaletteStops {
    const rotated = baseStops.map((hex) => rotateHexHue(hex, hueDegrees));
    return [rotated[0], rotated[1], rotated[2], rotated[3], rotated[4]];
}

/**
 * Builds a CSS `linear-gradient` from the same stops the shader uses, for the
 * fallback that shows under reduced motion or when the GL context fails.
 *
 * Positions match the shader's ramp stops so the fallback is recognisably the
 * same artwork, just still.
 */
export function stopsToCssGradient(
    stops: readonly string[],
    angle = "to top"
): string {
    const positions = [0, 20, 50, 78, 100];
    const list = stops
        .map(
            (hex, index) =>
                `${hex} ${positions[index] ?? (index / (stops.length - 1)) * 100}%`
        )
        .join(", ");
    return `linear-gradient(${angle}, ${list})`;
}
