#version 300 es
precision highp float;

uniform sampler2D u_flow;
uniform vec2 u_res;
uniform vec2 u_viewport;
uniform float u_phase;
uniform float u_motion;
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
  vec2 px = uv * u_viewport;
  float cellPx = 22.0 * u_height;
  vec2 centre = (floor(px / cellPx) + 0.5) * cellPx;
  vec2 flow = (texture(u_flow, centre / u_viewport).xy - 0.5) * (2.0 * MAX_VELOCITY) * u_motion;
  float t = u_phase;

  float n = fbm2(centre / u_viewport.y * 2.2 + vec2(t * 0.06, -t * 0.045) + flow * 0.4);
  float level = smoothstep(-0.55, 0.75, n);
  float radius = cellPx * 0.38 * level;
  float d = length(px - centre);
  float aa = max(fwidth(d), 0.5);
  float dot = 1.0 - smoothstep(radius - aa, radius + aa, d);

  float guard = 1.0 - 0.5 * smoothstep(1.0 - u_toolbar * 1.3, 1.0 - u_toolbar * 0.8, uv.y);
  float ink = clamp(dot * mix(0.3, 1.0, level) * 0.8 * u_strength, 0.0, 1.0) * guard;
  float haze = clamp(u_haze * 0.12 * level * u_strength, 0.0, 1.0) * guard;

  vec3 inkColour = clamp(oklabToSrgb(palette(1.0 - level)), 0.0, 1.0);
  vec3 hazeColour = clamp(oklabToSrgb(palette(0.8)), 0.0, 1.0);
  o = vec4(inkColour * ink + hazeColour * haze * (1.0 - ink), ink + haze * (1.0 - ink));
}
