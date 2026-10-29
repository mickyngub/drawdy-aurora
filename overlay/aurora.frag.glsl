#version 300 es
precision highp float;

uniform sampler2D u_flow;
uniform vec2 u_res;
uniform float u_time;
uniform float u_aspect;
uniform vec3 u_palette[4];
uniform float u_strength;
uniform float u_toolbar;

out vec4 o;

#pragma include(FBM2)
#pragma include(OKLAB_TO_SRGB)

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  vec3 c = mix(u_palette[0], u_palette[1], clamp(t, 0.0, 1.0));
  c = mix(c, u_palette[2], clamp(t - 1.0, 0.0, 1.0));
  return mix(c, u_palette[3], clamp(t - 2.0, 0.0, 1.0));
}

// A curtain hangs from a wavy lower edge: sharp below, rays fading upward.
vec2 curtain(vec2 q, float base, float seed, float t, float drift) {
  float edge = base
    + 0.11 * snoise(vec2(q.x * 0.55 + seed, t * 0.03))
    + 0.04 * snoise(vec2(q.x * 1.8 - t * 0.05, seed + 2.3))
    + 0.03 * sin(t * 0.04 + seed);
  float d = q.y - edge;
  float rise = max(d, 0.0);
  float body = exp(-rise / 0.2) * exp(-max(-d, 0.0) / 0.025);
  float rays = 0.55 + 0.45 * snoise(vec2(q.x * 9.0 + seed * 3.7 + drift, t * 0.07 + seed));
  return vec2(body * rays, rise / 0.3);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 flow = (texture(u_flow, uv).xy - 0.5) * (2.0 * MAX_VELOCITY);
  float t = u_time;
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  float drift = flow.x * 0.6;

  vec2 low = curtain(q, 0.16, 1.3, t, drift);
  vec2 mid = curtain(q, 0.47, 7.9, t * 0.85, drift);
  vec2 high = curtain(q, 0.76, 4.4, t * 1.1, drift);

  float hazeField = fbm2(q * 0.8 + vec2(t * 0.012, -t * 0.009) + flow * 0.2);
  float haze = 0.28 + 0.14 * hazeField;

  vec3 lit = palette(low.y) * low.x + palette(mid.y) * mid.x + palette(high.y) * high.x
    + palette(0.75 + 0.2 * hazeField) * haze;
  float weight = low.x + mid.x + high.x + haze;
  vec3 rgb = clamp(oklabToSrgb(lit / weight), 0.0, 1.0);

  // Drawdy's toolbar runs along the top, where its small icons need the most contrast.
  float guard = 1.0 - 0.5 * smoothstep(1.0 - u_toolbar * 1.3, 1.0 - u_toolbar * 0.8, uv.y);
  float alpha = clamp((low.x + mid.x + high.x) * 0.75 + haze, 0.0, 1.0) * u_strength * guard;
  o = vec4(rgb * alpha, alpha);
}
