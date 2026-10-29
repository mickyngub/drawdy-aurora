// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 3

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float scale = u_res.y / u_viewport.y;
  float spacing = 12.0 * u_height;
  vec2 q = px / 700.0 + flow * 0.05;
  float s = t * 0.02;
  vec2 bend = vec2(snoise(q * 0.7 + vec2(s, 2.7)), snoise(q * 0.7 + vec2(5.1, -s)));
  vec2 w = q + 0.22 * bend;
  float n = fbm2(w * 1.3 + vec2(-s * 0.7, s * 0.5));
  vec2 dir = normalize(vec2(1.0, 0.3));
  // A stream function: its level sets are the streamlines of a steady drift bent by noise.
  float v = (dot(w, vec2(-dir.y, dir.x)) + 0.15 * n) * 700.0 / spacing;
  float g = max(length(vec2(dFdx(v), dFdy(v))), 1e-4);
  float k = floor(v + 0.5);

  // Where streamlines bunch up, drop every other one so the spacing stays even.
  float lod = clamp(log2(g * scale * spacing / 1.3), 0.0, 2.0);
  float rank = mod(k, 2.0) > 0.5 ? 0.0 : mod(k, 4.0) > 0.5 ? 1.0 : 2.0;
  float keep = clamp(rank + 1.0 - lod, 0.0, 1.0);

  float wpx = 1.1 * scale;
  float dist = abs(v - k) / g;
  float line = clamp(0.5 + max(wpx, 1.0) * 0.5 - dist, 0.0, 1.0) * min(wpx, 1.0);

  float h = hash12(vec2(k, 3.1));
  float a = dot(w, dir) * 700.0 / (170.0 * u_height) + h * 7.0 - t * (0.06 + 0.05 * h);
  float seg = fract(a);
  float head = 0.75;
  float comet = smoothstep(0.0, head, seg) * (1.0 - smoothstep(head, head + max(fwidth(a), 0.01), seg));

  float level = clamp(0.5 + 0.8 * n, 0.0, 1.0);
  return vec4(line * keep * (0.25 + 1.35 * comet * comet) * mix(0.6, 1.0, smoothstep(0.4, 1.0, u_height)), level, 0.08 * level, 0.8);
}
