#version 300 es
precision highp float;

uniform vec2 u_res;
uniform vec2 u_viewport;
uniform float u_phase;
uniform vec3 u_palette[4];
uniform float u_strength;
uniform float u_toolbar;
uniform float u_height;
uniform float u_haze;

out vec4 o;

#pragma include(OKLAB_TO_SRGB)

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  vec3 c = mix(u_palette[0], u_palette[1], clamp(t, 0.0, 1.0));
  c = mix(c, u_palette[2], clamp(t - 1.0, 0.0, 1.0));
  return mix(c, u_palette[3], clamp(t - 2.0, 0.0, 1.0));
}

// Glyphs sit on an 8 x 8 pixel grid; g is a glyph pixel's centre relative to the cell centre (±0.5 … ±3.5).
float ring(vec2 g, float r) {
  vec2 a = abs(g);
  return step(abs(max(a.x, a.y) - r), 0.25) * step(a.x + a.y, r * 1.5 + 0.5);
}

float plus(vec2 g) {
  vec2 a = abs(g);
  return step(min(a.x, a.y), 0.5) * step(max(a.x, a.y), 2.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 px = vec2(uv.x, 1.0 - uv.y) * u_viewport;
  // Whole multiples of 8 px keep every glyph pixel the same size.
  float cellPx = 8.0 * max(1.0, floor(3.0 * u_height + 0.5));
  vec2 cell = floor(px / cellPx);
  vec2 g = floor((px - cell * cellPx) / cellPx * 8.0) - 3.5;
  vec2 c = cell - floor(u_viewport / cellPx * 0.5);
  float t = u_phase * 2.0;
  float wave = (sin(c.x * 0.3 + t) + sin(c.y * 0.3 - t) + sin((c.x + c.y) * 0.2 + t)) / 3.0;

  float lit = wave > 0.5 ? max(ring(g, 3.5), plus(g))
    : wave > 0.0 ? ring(g, 2.5)
    : wave > -0.5 ? ring(g, 1.5)
    : ring(g, 0.5);
  float level = clamp(wave * 0.5 + 0.5, 0.0, 1.0);

  float guard = 1.0 - 0.5 * smoothstep(1.0 - u_toolbar * 1.3, 1.0 - u_toolbar * 0.8, uv.y);
  float ink = clamp(lit * mix(0.25, 1.0, level) * u_strength, 0.0, 1.0) * guard;
  float haze = clamp(u_haze * 0.12 * level * u_strength, 0.0, 1.0) * guard;

  vec3 inkColour = clamp(oklabToSrgb(palette(1.0 - level)), 0.0, 1.0);
  vec3 hazeColour = clamp(oklabToSrgb(palette(0.8)), 0.0, 1.0);
  o = vec4(inkColour * ink + hazeColour * haze * (1.0 - ink), ink + haze * (1.0 - ink));
}
