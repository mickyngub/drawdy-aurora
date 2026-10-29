// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2

// One direction of pen strokes; each stroke appears once the shade passes its own hashed threshold.
float strokes(vec2 p, vec2 dir, float gap, float seed, float amount, float wpx) {
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x)) / gap;
  float k = floor(across + 0.5);
  float a = along / (gap * 11.0) + hash12(vec2(k, seed)) * 4.0;
  float id = floor(a);
  float f = a - id;
  float h = hash12(vec2(k * 3.7 + id, seed + id * 0.17));
  float end = 0.8 + 0.17 * h;
  float taper = smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(end - 0.1, end, f));
  float wobble = 0.06 * sin(along * 0.021 + h * 6.28) + (h - 0.5) * 0.12;
  float dist = abs(across - k - wobble) * gap * (u_res.y / u_viewport.y);
  float w = wpx * mix(0.5, 1.0, taper);
  float line = clamp(0.5 + max(w, 1.0) * 0.5 - dist, 0.0, 1.0) * min(w, 1.0);
  float th = 0.7 * h;
  return line * taper * smoothstep(th, th + 0.3, amount);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float wpx = 1.0 * (u_res.y / u_viewport.y);
  float gap = 9.0 * u_height;
  vec2 q = px / 460.0 + flow * 0.15;
  float shade = smoothstep(-0.15, 0.85, fbm2(q + vec2(t * 0.016, -t * 0.012)));
  float one = strokes(px, vec2(0.766, 0.643), gap, 1.0, smoothstep(0.0, 0.3, shade), wpx);
  float two = strokes(px, vec2(0.643, -0.766), gap, 2.0, smoothstep(0.35, 0.65, shade), wpx);
  float three = strokes(px, vec2(0.0, 1.0), gap * 1.15, 3.0, smoothstep(0.7, 0.95, shade), wpx);
  float ink = min(one + two + three, 1.5);
  return vec4(ink * 1.1 * mix(0.6, 1.0, smoothstep(0.4, 1.0, u_height)), 1.0 - shade, 0.06 * shade, 1.0 - shade);
}
