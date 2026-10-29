// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2.5

float stroke(float d, float w, float aa) {
  return clamp((min(d + 0.5 * aa, 0.5 * w) - max(d - 0.5 * aa, -0.5 * w)) / aa, 0.0, 1.0);
}

// Distance to the quarter arc of radius 0.5 around a tile corner, w measured from that corner towards the tile.
float arc(vec2 w) {
  return w.x > 0.0 && w.y > 0.0 ? abs(length(w) - 0.5)
    : min(length(w - vec2(0.5, 0.0)), length(w - vec2(0.0, 0.5)));
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float aa = u_viewport.y / u_res.y;
  float tile = 34.0 * u_height;
  vec2 p = (px - 0.5 * u_viewport) / tile;
  vec2 id = floor(p);
  vec2 q = p - id - 0.5;

  // A quarter turn swaps the orientation; dividing by tile area keeps turns per screen steady across Scale.
  float period = mix(120.0, 320.0, hash12(id + 31.7)) / (u_height * u_height);
  float cycle = t / period + 9.0 * hash12(id);
  float k = clamp(fract(cycle) * period / 2.4, 0.0, 1.0);
  float a = 1.5707963 * (floor(cycle) + k * k * (3.0 - 2.0 * k));
  vec2 cs = vec2(cos(a), sin(a));
  q = mat2(cs.x, cs.y, -cs.y, cs.x) * q;
  float d = min(arc(0.5 - q), arc(q + 0.5)) * tile;
  float turning = sin(3.1415927 * k);

  float n = fbm2(p * tile / 760.0 + vec2(t * 0.02, t * 0.013) + flow * 0.3);
  float ink = stroke(d, 1.4, aa) * (0.75 + 0.3 * n) * (1.0 + 0.6 * turning);
  float level = clamp(0.55 + 0.35 * n - 0.35 * turning, 0.0, 1.0);
  float halo = turning * (1.0 - smoothstep(0.1, 0.5, length(q)));
  return vec4(ink, level, 0.05 * (0.6 + 0.4 * n) + 0.35 * halo, level);
}
