// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 6

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  float field = 0.0;
  float tint = 0.0;
  for (int i = 0; i < 6; i++) {
    float k = float(i);
    vec2 rate = vec2(0.043, 0.061) + 0.017 * vec2(sin(k * 2.1), cos(k * 1.7));
    vec2 c = vec2(
      u_aspect * (0.5 + 0.42 * sin(t * rate.x + k * 1.9)),
      0.5 + 0.4 * sin(t * rate.y + k * 2.7 + 0.6));
    float r = (0.09 + 0.08 * fract(k * 0.618 + 0.3)) * pow(u_height, 0.6);
    vec2 d = q - c;
    float w = r * r / (dot(d, d) + 1e-5);
    field += w;
    tint += w * k / 5.0;
  }
  // For one blob this is 1 - distance / radius: 0 on the surface, 1 at the centre.
  float s = 1.0 - inversesqrt(field);
  float rim = exp(-s * s / 0.005);
  float inside = smoothstep(-0.02, 0.1, s) * (0.18 + 0.22 * exp(-s / 0.2));
  float level = tint / field;
  float halo = exp(min(s, 0.0) * 3.0);
  return vec4(rim * 1.3 + inside, level, 0.08 + 0.25 * halo, clamp(level + 0.1, 0.0, 1.0));
}
