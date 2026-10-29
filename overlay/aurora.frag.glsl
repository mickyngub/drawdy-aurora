#version 300 es
precision highp float;

uniform sampler2D u_flow;
uniform vec2 u_res;
uniform float u_time;
uniform float u_aspect;
uniform vec3 u_palette[4];
uniform float u_reach;
uniform float u_strength;

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
  vec2 flow = (texture(u_flow, uv).xy - 0.5) * (2.0 * MAX_VELOCITY);
  float t = u_time;
  float x = uv.x * u_aspect + flow.x * 0.04;
  float h = uv.y;

  float crest = u_reach * (0.55 + 0.45 * fbm2(vec2(x * 0.9 + t * 0.018, t * 0.025)));
  float rise = h / max(crest, 1e-3);
  float curtain = 1.0 - smoothstep(0.0, 1.0, rise);
  curtain *= curtain;

  float folds = snoise(vec2(x * 2.2 - t * 0.03, t * 0.05 + 4.1));
  float rays = snoise(vec2(x * 11.0 + folds * 0.6, t * 0.06));
  float streak = clamp(0.62 + 0.28 * folds + 0.22 * rays * smoothstep(0.0, 0.6, rise), 0.0, 1.0);
  float haze = 0.22 * (1.0 - smoothstep(0.0, 1.4, rise));

  // Drawdy keeps its minimap and help buttons in the bottom corners and its toolbar along the top.
  float span = smoothstep(0.03, 0.3, uv.x) * smoothstep(0.97, 0.7, uv.x);

  float shade = clamp(rise * 0.8 + 0.15 * folds, 0.0, 1.0);
  vec3 rgb = clamp(oklabToSrgb(palette(shade)), 0.0, 1.0);
  float alpha = clamp((curtain * streak + haze) * span * u_strength, 0.0, 1.0);
  o = vec4(rgb * alpha, alpha);
}
