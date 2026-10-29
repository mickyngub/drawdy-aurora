#version 300 es
precision highp float;

// ─────────────────────────────────────────────────────────────────────────────
// Present pass: the only pass that writes to the canvas. The surface renders to
// an offscreen target at a fraction of canvas resolution; this pass upsamples it
// with a LINEAR filter and adds the two effects that must happen at drawing-
// buffer resolution to look right. The mobile target can reduce effective DPR.
//
// Grain in particular has to be here. Applied inside the surface pass it would
// be magnified along with everything else and read as blotches instead of film
// texture.
// ─────────────────────────────────────────────────────────────────────────────

uniform sampler2D u_color;
uniform vec2  u_res;
uniform float u_time;
uniform float u_aspect;

// Both exposed rather than baked in, because the right amount depends entirely
// on the palette: a dark navy panel hides grain that would be obvious on cream.
uniform float u_grain;      // amplitude of the per-pixel noise, ~0.022 is filmic, 0 is clean
uniform float u_vignette;   // 0 disables edge darkening, 1 is the ported strength

out vec4 fragColor;

#pragma include(HASH)

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec4 sampled = texture(u_color, uv);
  vec3 color = sampled.rgb;

  // Aspect is capped at 1.8 so an ultrawide viewport does not stretch the
  // vignette into a horizontal band across the middle of the panel.
  vec2 centered = (uv - 0.5) * vec2(min(u_aspect, 1.8), 1.0);
  color *= 1.0 - 0.1 * u_vignette * smoothstep(0.55, 1.05, length(centered));

  // Two different time scales on the hash seed so the grain does not repeat on
  // a visible period; a single scrolling seed reads as drifting sand.
  float noise = hash12(gl_FragCoord.xy + vec2(fract(u_time * 0.61) * 61.7,
                                              fract(u_time * 0.83) * 83.3)) - 0.5;
  // Colour is premultiplied, so grain scales with alpha and a clear pixel of a
  // transparent surface stays clear. Opaque surfaces have alpha 1.
  color += noise * u_grain * sampled.a;

  fragColor = vec4(color, sampled.a);
}
