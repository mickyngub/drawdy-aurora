// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float scale = u_res.y / u_viewport.y;
  vec2 p = (px + flow * 30.0) / u_height;
  float across = dot(p, vec2(0.7071, 0.7071));
  float along = dot(p, vec2(-0.7071, 0.7071));
  float s = t * 0.1;
  float swing = 0.55 + 0.45 * sin(across * 0.0042 + along * 0.0015 - s * 0.35);
  float phase = along * 0.028 + across * 0.006 + s;
  float v = across / 22.0 + 0.9 * swing * sin(phase);
  float g = max(length(vec2(dFdx(v), dFdy(v))), 1e-4);
  float k = floor(v + 0.5);
  // Stripes swell where they lean hardest, which reads as light falling across a fold.
  float lean = swing * cos(phase);
  float duty = mix(0.1, 0.42, lean * lean);
  float halfWidth = max(duty * 0.5 / g, 0.5 * scale);
  float band = clamp(halfWidth - abs(v - k) / g + 0.5, 0.0, 1.0);
  band = mix(band, duty, smoothstep(0.15, 0.3, g));
  float level = clamp(0.45 + 0.35 * sin(across * 0.003 - s * 0.2) + 0.2 * (mod(k, 2.0) - 0.5), 0.0, 1.0);
  return vec4(band * 0.75 * mix(0.6, 1.0, smoothstep(0.4, 1.0, u_height)), level, 0.0, 0.5);
}
