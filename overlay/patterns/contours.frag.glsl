#version 300 es
precision highp float;

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
#pragma include(OKLAB_TO_SRGB)

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  vec3 c = mix(u_palette[0], u_palette[1], clamp(t, 0.0, 1.0));
  c = mix(c, u_palette[2], clamp(t - 1.0, 0.0, 1.0));
  return mix(c, u_palette[3], clamp(t - 2.0, 0.0, 1.0));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 flow = (texture(u_flow, uv).xy - 0.5) * (2.0 * MAX_VELOCITY) * u_motion;
  vec2 q = vec2(uv.x * u_aspect, uv.y);
  float t = u_phase;

  float field = fbm2(q * 1.25 + vec2(t * 0.035, t * 0.022) + flow * 0.15);
  float v = field * (9.0 / u_height);
  float k = floor(v + 0.5);
  float major = step(mod(k, 4.0), 0.5);
  // Line width in CSS px, so lines look the same at any device pixel ratio.
  float width = mix(1.1, 2.0, major) * (u_res.y / u_viewport.y);
  float dist = abs(fract(v + 0.5) - 0.5) / max(fwidth(v), 1e-4);
  float line = 1.0 - smoothstep(width * 0.5, width * 0.5 + 1.0, dist);
  float level = clamp(field * 0.5 + 0.5, 0.0, 1.0);

  float guard = 1.0 - 0.5 * smoothstep(1.0 - u_toolbar * 1.3, 1.0 - u_toolbar * 0.8, uv.y);
  float ink = clamp(line * mix(0.55, 1.0, major) * 1.5 * u_strength, 0.0, 1.0) * guard;
  float haze = clamp(u_haze * 0.12 * level * u_strength, 0.0, 1.0) * guard;

  vec3 inkColour = clamp(oklabToSrgb(palette(1.0 - level)), 0.0, 1.0);
  vec3 hazeColour = clamp(oklabToSrgb(palette(0.8)), 0.0, 1.0);
  o = vec4(inkColour * ink + hazeColour * haze * (1.0 - ink), ink + haze * (1.0 - ink));
}
