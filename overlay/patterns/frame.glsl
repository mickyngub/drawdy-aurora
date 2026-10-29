#version 300 es
precision highp float;

// Shared by every pattern: rollup-plugins.mjs splices each overlay/patterns/<id>.glsl in at the pattern marker below.
//
// A pattern defines
//   vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow)
// uv    0..1 across the screen, origin bottom-left
// px    CSS pixels from the bottom-left (u_viewport is the screen size in CSS px)
// t     seconds, already scaled by the Speed slider
// flow  a gentle drift vector from the flow field, zero when Speed is 0
// and returns vec4(ink, level, haze, hazeLevel):
// ink        how strongly the pattern's marks show, ~0..2; the frame multiplies it by Strength
// level      0..1 palette position of the marks (0 is the first colour of the starting point)
// haze       0..1 soft wash between the marks; the frame multiplies it by Haze and Strength
// hazeLevel  0..1 palette position of the wash
//
// Available: u_aspect, u_viewport, u_res, u_height (the Scale slider, 0.4..2.2, 1 is the default),
// u_motion, u_flow, MAX_VELOCITY, snoise(vec2), fbm2(vec2), fbm3(vec2), hash12(vec2), palette(float).

uniform sampler2D u_flow;
uniform vec2 u_res;
uniform vec2 u_viewport;
uniform float u_phase;
uniform float u_motion;
uniform float u_aspect;
uniform vec3 u_palette[4];
uniform float u_strength;
uniform float u_toolbar;
uniform float u_height;
uniform float u_haze;

out vec4 o;

#pragma include(FBM2)
#pragma include(HASH)
#pragma include(OKLAB_TO_SRGB)

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  vec3 c = mix(u_palette[0], u_palette[1], clamp(t, 0.0, 1.0));
  c = mix(c, u_palette[2], clamp(t - 1.0, 0.0, 1.0));
  return mix(c, u_palette[3], clamp(t - 2.0, 0.0, 1.0));
}

#pragma pattern

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 px = uv * u_viewport;
  vec2 flow = (texture(u_flow, uv).xy - 0.5) * (2.0 * MAX_VELOCITY) * u_motion;
  vec4 p = pattern(uv, px, u_phase, flow);

  // Drawdy's toolbar runs along the top, where its small icons need the most contrast.
  float guard = u_toolbar > 0.0
    ? 1.0 - 0.5 * smoothstep(1.0 - u_toolbar * 1.3, 1.0 - u_toolbar * 0.8, uv.y)
    : 1.0;
  float ink = clamp(p.x * u_strength, 0.0, 1.0) * guard;
  float haze = clamp(p.z * u_haze * u_strength, 0.0, 1.0) * guard;
  vec3 inkColour = clamp(oklabToSrgb(palette(p.y)), 0.0, 1.0);
  vec3 hazeColour = clamp(oklabToSrgb(palette(p.w)), 0.0, 1.0);
  o = vec4(inkColour * ink + hazeColour * haze * (1.0 - ink), ink + haze * (1.0 - ink));
}
