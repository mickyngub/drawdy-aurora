// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 3.5

// Trochoid (Gerstner) profile: solving th = phi + q sin(th) by two fixed-point steps peaks the crests.
float swell(float phi, float q) {
  float th = phi + q * sin(phi);
  return cos(phi + q * sin(th));
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float scale = u_res.y / u_viewport.y;
  vec2 p = (px + flow * 40.0) / u_height;
  float calm = 0.75 + 0.3 * snoise(p * 0.0015 + vec2(t * 0.008, 1.7));
  float h = 13.0 * swell(p.x * 0.018 + p.y * 0.006 + t * 0.18, 0.62)
    + 5.5 * swell(p.x * 0.033 - p.y * 0.013 - t * 0.23 + 1.3, 0.45)
    + 2.2 * swell(p.x * 0.061 + p.y * 0.021 + t * 0.4 + 4.1, 0.3);
  h *= calm;
  float v = (p.y - h) / 16.0;
  float g = max(length(vec2(dFdx(v), dFdy(v))), 1e-4);
  float k = floor(v + 0.5);
  float wpx = 1.1 * scale;
  float dist = abs(v - k) / g;
  float line = clamp(0.5 + max(wpx, 1.0) * 0.5 - dist, 0.0, 1.0) * min(wpx, 1.0);
  float crest = clamp(h / (20.7 * calm) * 0.5 + 0.5, 0.0, 1.0);
  float crowd = smoothstep(3.0, 7.0, 1.0 / (g * scale));
  return vec4(line * crowd * mix(0.6, 1.6, crest * crest) * mix(0.6, 1.0, smoothstep(0.4, 1.0, u_height)), 1.0 - crest, 0.08 * crest, 0.7);
}
