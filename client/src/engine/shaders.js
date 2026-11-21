// Shaders GLSL ES 3.0 do motor.
export const COMMON = /* glsl */`
precision highp float;
precision highp sampler2DShadow;
vec3 toLin(vec3 c){ return pow(max(c,vec3(0.)), vec3(2.2)); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
vec3 outCol(vec3 c, float expo){ return pow(aces(c*expo), vec3(1.0/2.2)); }
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
`;

// --------------------------------------------------------------- material padrão
export const STD_VS = /* glsl */`#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aUv;
#ifdef INST
layout(location=4) in mat4 aInst; layout(location=8) in vec4 aInstCol;
#endif
uniform mat4 uModel, uViewProj; uniform float uTime, uWind, uSwim;
out vec3 vW; out vec3 vN; out vec4 vC; out vec3 vL; out vec4 vUv;
void main(){
  vec3 p = aPos; vec3 n = aNor; vec4 col = aCol; float ph = 0.;
  mat4 M = uModel;
#ifdef INST
  M = uModel * aInst; col.rgb *= aInstCol.rgb; ph = aInstCol.a * 6.2831;
#endif
  if (uSwim > 0.) {
    // ondulação de nado: a cauda (-z local) balança mais que a cabeça
    float tail = clamp(-p.z * 1.2 + 0.25, 0., 1.6);
    float sw = sin(uTime * (7.0 * uSwim) + p.z * 5.0 + ph) * 0.11 * tail * tail;
    p.x += sw; n.x -= sw * 0.6;
  }
  vec4 w = M * vec4(p, 1.);
  if (uWind > 0.) {
    float k = col.a; // peso do vento no alfa do vértice
    float t = uTime * 1.3 + w.x * 0.05 + w.z * 0.04 + ph;
    w.x += (sin(t) * 0.6 + sin(t * 2.7) * 0.25) * k * uWind;
    w.z += (cos(t * 0.8) * 0.5) * k * uWind;
  }
  vW = w.xyz; vN = normalize(mat3(M) * n); vC = col; vL = p; vUv = aUv;
  gl_Position = uViewProj * w;
}`;

export const STD_FS = /* glsl */`#version 300 es
${COMMON}
in vec3 vW; in vec3 vN; in vec4 vC; in vec3 vL; in vec4 vUv;
uniform sampler2D uNoise, uBark, uBarkN, uLeaf, uWood; uniform float uKind, uRust, uTexScale;
uniform vec3 uColor, uEmissive; uniform float uRough, uMetal, uOpacity, uTime, uExpo, uDouble, uCaust, uGlow, uVE;
uniform vec3 uCamPos, uSunDir, uSunCol, uSkyAmb, uGndAmb;
uniform float uUnder; uniform vec3 uWFogCol; uniform float uWFogDen;
uniform vec3 uFogCol; uniform float uFogDen;
uniform int uNSpot; uniform vec3 uSpotPos[6]; uniform vec3 uSpotDir[6]; uniform vec3 uSpotCol[6]; uniform vec2 uSpotPar[6];
uniform int uNPt; uniform vec3 uPtPos[10]; uniform vec3 uPtCol[10]; uniform float uPtRange[10];
uniform sampler2DShadow uShadow; uniform mat4 uShadowMat; uniform float uShadowOn;
out vec4 fragColor;

float shadowAt(vec3 w, vec3 n){
  if (uShadowOn < .5) return 1.;
  vec4 s = uShadowMat * vec4(w + n * 0.06, 1.);
  vec3 c = s.xyz / s.w * .5 + .5;
  if (c.x < 0. || c.x > 1. || c.y < 0. || c.y > 1. || c.z > 1.) return 1.;
  float b = 0.0012, sum = 0.; vec2 t = vec2(1.0/2048.0);
  for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) sum += texture(uShadow, vec3(c.xy + vec2(i,j)*t*1.3, c.z - b));
  return sum / 9.;
}
float caustic(vec2 p, float t){
  vec2 q = p * .35;
  float c = 0.;
  for (int i=0;i<3;i++){
    q += vec2(sin(q.y*1.7 + t*.9 + float(i)), cos(q.x*1.3 - t*.7 + float(i)*2.));
    c += abs(sin(q.x + q.y));
  }
  return pow(1. - c/3., 6.) * 3.;
}
vec4 tri(vec3 p, vec3 n, float s){
  vec3 b = pow(abs(n), vec3(4.)); b /= dot(b, vec3(1.));
  return texture(uNoise, p.yz*s)*b.x + texture(uNoise, p.xz*s)*b.y + texture(uNoise, p.xy*s)*b.z;
}
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 tn){
  vec3 dp1=dFdx(p), dp2=dFdy(p); vec2 du1=dFdx(uv), du2=dFdy(uv);
  vec3 dp2p=cross(dp2,N), dp1p=cross(N,dp1);
  vec3 T=dp2p*du1.x+dp1p*du2.x, B=dp2p*du1.y+dp1p*du2.y;
  float inv = inversesqrt(max(dot(T,T),dot(B,B))+1e-12);
  return normalize(mat3(T*inv,B*inv,N)*tn);
}
void main(){
#ifdef KFIX
  const float kind = float(KFIX);   // variante especializada: o compilador remove os outros materiais
#else
  float kind = uKind >= 0. ? uKind : floor(vUv.z + 0.5);
#endif
  vec3 base = toLin(uColor * vC.rgb);
  vec3 N = normalize(vN);
  if ((uDouble > .5 || kind > 8.5 && kind < 9.5) && !gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vW);
  float metalK = uMetal, roughK = uRough, ao = 1.0, transl = 0.0;
  vec3 P = vL * uTexScale;
  if (kind > 8.5 && kind < 9.5) {            // FOLHA: cartão recortado do atlas
    vec4 t = texture(uLeaf, vUv.xy);
    if (t.a < 0.45) discard;
    base = toLin(t.rgb) * vC.rgb * 1.15;
    base *= 0.8 + 0.4 * texture(uNoise, vW.xz*0.21 + vW.y*0.13).g;
    N = normalize(N + vec3(0., 0.45, 0.));
    roughK = 0.75; transl = 0.55; ao = mix(0.55, 1.0, vC.r);
  } else if (kind > 0.5 && kind < 1.5) {     // TERRENO: grama/terra/areia com detalhe
    vec4 a = texture(uNoise, vW.xz*0.045), b = texture(uNoise, vW.xz*0.31), c = texture(uNoise, vW.xz*1.9);
    base *= mix(0.72, 1.2, a.r) * mix(0.84, 1.12, b.g) * mix(0.88, 1.1, c.b);
    base *= mix(0.9, 1.0, smoothstep(0.02, 0.15, c.a));             // pedrisco fino
    N = normalize(N + vec3(c.r - 0.5, 0., c.g - 0.5) * 0.45 + vec3(b.r - 0.5, 0., b.b - 0.5) * 0.25);
    roughK = 0.95;
  } else if (kind > 1.5 && kind < 2.5) {     // ROCHA triplanar com fendas e musgo
    vec3 q = P * 0.9;
    vec4 tx = tri(q, N, 0.35), tf = tri(q, N, 1.6);
    base *= mix(0.55, 1.25, tx.r) * mix(0.8, 1.15, tf.g);
    base = mix(base, base * 0.35, smoothstep(0.1, 0.0, tx.a) * 0.8);
    float moss = smoothstep(0.55, 0.85, N.y + (tx.g - 0.5) * 0.6);
    base = mix(base, vec3(0.045, 0.075, 0.02) * (0.7 + 0.6 * tf.b), moss * 0.8);
    N = normalize(N + (tf.rgb - 0.5) * 0.55);
    roughK = 0.92;
  } else if (kind > 2.5 && kind < 3.5) {     // METAL / FERRO nu: escovado, manchado
    vec4 tx = tri(P, N, 1.3);
    float esc = texture(uNoise, vec2(dot(P, vec3(0.7, 0., 0.7)) * 0.15, P.y * 4.0)).b;
    base *= (0.65 + 0.45 * tx.g) * (0.9 + 0.2 * esc);
    roughK = 0.28 + 0.35 * tx.r; metalK = 0.85;
    float ox = smoothstep(0.6, 0.8, tx.b + tx.r * 0.3);
    base = mix(base, vec3(0.09, 0.05, 0.03), ox * 0.6); roughK = mix(roughK, 0.9, ox);
  } else if (kind > 3.5 && kind < 4.5) {     // METAL PINTADO com ferrugem e arranhões
    vec4 tx = tri(P, N, 0.7), tf = tri(P, N, 3.0);
    // ferrugem só em manchas e escorridos (antes cobria tudo e parecia camuflagem)
    float rust = smoothstep(0.64, 0.8, tx.r * 0.75 + tf.r * 0.25 + (uRust - 0.5) * 0.35) * (0.35 + 0.65 * uRust);
    float escorre = smoothstep(0.7, 0.9, texture(uNoise, vec2(P.x * 0.6 + P.z * 0.6, P.y * 0.08)).r) * uRust * 0.6;
    rust = clamp(rust + escorre * smoothstep(0.4, 0.6, tx.g), 0., 1.);
    float risco = smoothstep(0.012, 0.0, abs(tf.g - 0.5) - 0.006) * step(0.72, tx.g);
    base *= 0.9 + 0.18 * tf.b;
    base = mix(base, vec3(0.5, 0.5, 0.52), risco * 0.35);
    base = mix(base, vec3(0.13, 0.055, 0.025) * (0.6 + 0.7 * tf.r), rust);
    roughK = mix(0.42, 0.95, rust); metalK = mix(0.25, 0.05, rust);
    N = normalize(N + (tf.rgb - 0.5) * 0.18 * (0.3 + rust));
  } else if (kind > 4.5 && kind < 5.5) {     // CASCO DO SUBMARINO: chapas, rebites, escorridos de ferrugem
    float ang = atan(P.y, P.x);
    float pz = P.z / 0.62, pa = ang * 12.0 / 6.2831;
    vec2 cel = vec2(fract(pz), fract(pa));
    float costura = min(abs(cel.x - 0.5), abs(cel.y - 0.5));
    float junta = smoothstep(0.47, 0.5, 0.5 - costura) ;
    // rebites ao longo das costuras
    vec2 rv = vec2(fract(pz * 1.0), fract(pa * 4.0));
    float reb = smoothstep(0.09, 0.05, length(vec2((rv.x - 0.06) * 3.0, rv.y - 0.5))) + smoothstep(0.09, 0.05, length(vec2((rv.y - 0.5), (cel.y - 0.04) * 3.0)));
    vec4 tx = tri(P, N, 0.9), tf = tri(P, N, 3.5);
    float painel = hash12(floor(vec2(pz, pa)));
    base *= (0.88 + 0.16 * painel) * (0.85 + 0.25 * tf.b);
    base *= 1.0 - junta * 0.45;
    // escorridos verticais de ferrugem a partir das juntas e rebites
    float escorre = texture(uNoise, vec2(ang * 0.9 + P.z * 0.13, P.y * 0.12)).r;
    float streak = smoothstep(0.62, 0.85, escorre + tx.r * 0.25) * uRust;
    float rust = clamp(smoothstep(0.66, 0.84, tx.r * 0.8 + tx.b * 0.25 + (uRust - 0.5) * 0.3) * uRust * 1.2 + streak * 0.7, 0., 1.);
    base = mix(base, vec3(0.16, 0.07, 0.03) * (0.7 + 0.6 * tf.r), rust);
    base = mix(base, base * 1.25 + 0.04, reb * 0.6);
    // desgaste da tinta nas bordas
    float desg = smoothstep(0.7, 0.9, tf.g) * (1.0 - uRust * 0.5);
    base = mix(base, vec3(0.45, 0.46, 0.48), desg * 0.35);
    roughK = mix(0.38, 0.92, rust); metalK = mix(0.3, 0.05, rust);
    vec3 bump = vec3((tf.r - 0.5) * 0.25, (tf.g - 0.5) * 0.25, 0.) + vec3(0.) ;
    N = normalize(N + bump * (0.4 + rust) - normalize(vN) * 0.0 + (reb > 0.5 ? (normalize(vN) * 0.0) : vec3(0.)));
    ao = 1.0 - junta * 0.3;
  } else if (kind > 5.5 && kind < 6.5) {     // MADEIRA (tábuas): veio e nós
    vec2 uv = vUv.xy;
    vec4 w = texture(uWood, vec2(uv.x * 0.22, uv.y * 0.9));
    float g = mix(0.68, 1.18, w.r) * mix(0.82, 1.1, w.b);
    float no = smoothstep(0.85, 0.95, texture(uNoise, uv * 0.35).r);
    base *= g * (1.0 - no * 0.45);
    base = mix(base, base * vec3(0.7, 0.75, 0.7), smoothstep(0.55, 0.8, tri(vW, N, 0.2).g) * 0.5); // madeira velha/úmida
    N = perturb(N, vW, uv, normalize(vec3(0., (w.r - 0.5) * 0.5, 1.)));
    roughK = 0.85;
  } else if (kind > 6.5 && kind < 7.5) {     // CONCRETO: manchas, poros, rachaduras
    vec4 a = tri(vW, N, 0.09), b = tri(vW, N, 0.6), c = tri(vW, N, 3.5);
    base *= mix(0.78, 1.12, a.r) * mix(0.9, 1.08, b.g) * mix(0.9, 1.06, c.b);
    float crack = smoothstep(0.05, 0.0, b.a) * step(0.55, a.g);
    base *= 1.0 - crack * 0.55;
    base = mix(base, base * vec3(0.8, 0.85, 0.7), smoothstep(0.6, 0.8, a.b) * 0.5); // limo/umidade
    N = normalize(N + (c.rgb - 0.5) * 0.12);
    roughK = 0.95;
  } else if (kind > 7.5 && kind < 8.5) {     // CASCA de árvore com relevo (mapa de normais)
    vec2 uv = vUv.xy * vec2(1.0, 0.45);
    vec4 b = texture(uBark, uv); vec3 bn = texture(uBarkN, uv).xyz * 2.0 - 1.0;
    base *= b.r * 1.25;
    N = perturb(N, vW, uv, bn); ao = mix(0.55, 1.0, b.a); roughK = 0.92;
  } else if (kind > 9.5 && kind < 10.5) {    // TECIDO (roupa): trama
    vec4 t = tri(P, N, 9.0);
    float trama = 0.9 + 0.1 * sin(P.x * 900.0 + P.y * 900.0) * sin(P.y * 900.0 - P.z * 900.0);
    base *= (0.86 + 0.22 * t.b) * trama; roughK = 0.95;
  } else if (kind > 11.5 && kind < 12.5) {   // ESCAMAS
    vec2 e = vec2(vUv.x * 22.0, vUv.y * 9.0); e.x += floor(e.y) * 0.5;
    float esc = smoothstep(0.25, 0.5, length(fract(e) - 0.5));
    base *= 0.82 + 0.25 * (1.0 - esc); roughK = 0.3; metalK = 0.15;
  } else if (kind > 12.5 && kind < 13.5) {   // BORRACHA
    base *= 0.85 + 0.2 * tri(P, N, 4.0).g; roughK = 0.95;
  } else {
    base *= 0.92 + 0.16 * tri(P, N, 1.5).b;
  }
  float depth = max(0., -vW.y);
  float under = step(0.0, -vW.y);
  // luz do sol atenuada pela coluna d'água
  float sunAtt = mix(1., exp(-depth * 0.032), under);
  float ambAtt = mix(1., exp(-depth * 0.022) * .9 + .02, under);
  float NL = max(dot(N, uSunDir), 0.);
  float sh = shadowAt(vW, N);
  vec3 diff = uSunCol * NL * sh * sunAtt;
  if (under > .5 && uCaust > .5) diff *= 0.6 + caustic(vW.xz, uTime) * max(N.y, 0.) * exp(-depth*0.08);
  vec3 amb = mix(uGndAmb, uSkyAmb, N.y * .5 + .5) * ambAtt * ao;
  // folhas: luz atravessando quando o sol está atrás
  if (transl > 0.) diff += uSunCol * transl * pow(max(dot(-V, uSunDir), 0.), 3.) * sh * sunAtt * 0.6 + uSunCol * max(dot(-N, uSunDir), 0.) * transl * 0.3 * sunAtt;
  // especular
  float rough = clamp(roughK, 0.05, 1.);
  float sp = exp2(10. * (1. - rough) + 1.);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.), sp) * (sp + 8.) / 25.13 * (1. - rough*0.85);
  vec3 F0 = mix(vec3(0.04), base, metalK);
  // reflexo do céu nos metais (sem isso o ferro fica "plástico")
  vec3 R = reflect(-V, N);
  vec3 env = mix(uGndAmb, uSkyAmb * 1.6, smoothstep(-0.2, 0.6, R.y)) * ambAtt;
  vec3 col = base * (1. - metalK*0.85) * (diff + amb) + F0 * spec * uSunCol * NL * sh * sunAtt + F0 * env * (1. - rough) * 0.8;
  // holofotes (faróis dos submarinos)
  for (int i=0;i<6;i++){
    if (i >= uNSpot) break;
    vec3 L = uSpotPos[i] - vW; float d = length(L); L /= d;
    float cs = dot(-L, uSpotDir[i]);
    float cone = smoothstep(uSpotPar[i].x, uSpotPar[i].x + 0.08, cs);
    float att = cone * clamp(1. - d / uSpotPar[i].y, 0., 1.) / (1. + d*d*0.004);
    att *= mix(1., exp(-d * 0.035), under);
    float nl = max(dot(N, L), 0.);
    vec3 Hs = normalize(L + V);
    col += uSpotCol[i] * att * (base * nl + F0 * pow(max(dot(N,Hs),0.), sp) * 0.5);
  }
  for (int i=0;i<10;i++){
    if (i >= uNPt) break;
    vec3 L = uPtPos[i] - vW; float d = length(L); L /= d;
    float att = clamp(1. - d / uPtRange[i], 0., 1.); att *= att;
    col += uPtCol[i] * att * base * (max(dot(N, L), 0.) * .8 + .2);
  }
  float ve = uVE > 1.5 ? pow(abs(dot(normalize(vN), V)), 2.0) : 1.0; // feixe de luz: some nas bordas (sem contorno duro)
  col += toLin(uEmissive * (uVE > .5 ? vC.rgb : vec3(1.))) * uGlow * ve;
  // névoa: dentro d'água (câmera submersa) ou atmosférica
  float dist = length(vW - uCamPos);
  if (uUnder > .5) {
    float f = 1. - exp(-dist * uWFogDen);
    col = mix(col, uWFogCol, f);
  } else {
    float f = 1. - exp(-dist * uFogDen);
    f *= clamp(1.2 - max(vW.y, 0.) * 0.004, .25, 1.);
    col = mix(col, uFogCol, f);
  }
  fragColor = vec4(outCol(col, uExpo), uOpacity);
}`;

export const DEPTH_FS = /* glsl */`#version 300 es
precision highp float; in vec4 vUv; uniform sampler2D uLeaf; uniform float uKind; out vec4 o;
void main(){ float k = uKind >= 0. ? uKind : floor(vUv.z + 0.5); if (k > 8.5 && k < 9.5 && texture(uLeaf, vUv.xy).a < 0.45) discard; o = vec4(1.); }`;

// --------------------------------------------------------------- céu
export const SKY_VS = /* glsl */`#version 300 es
const vec2 P[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
out vec2 vUv; void main(){ vUv = P[gl_VertexID]; gl_Position = vec4(P[gl_VertexID], 0.9999, 1.); }`;
export const SKY_FUNC = /* glsl */`
uniform vec3 uSunDir, uSkyTop, uSkyHor, uSunCol; uniform float uNight, uCloud, uTime;
vec3 skyColor(vec3 d){
  float e = d.y;
  vec3 c = mix(uSkyHor, uSkyTop, pow(clamp(e,0.,1.), 0.45));
  if (e < 0.) c = mix(uSkyHor, uSkyHor*0.55, clamp(-e*4.,0.,1.));
  float sd = max(dot(d, uSunDir), 0.);
  c += uSunCol * (pow(sd, 900.) * 40. + pow(sd, 12.) * 0.25) * step(-0.05, uSunDir.y);
  // halo do pôr do sol
  c += vec3(1.,.45,.2) * pow(sd, 4.) * 0.35 * clamp(1. - uSunDir.y*4., 0., 1.) * step(-0.1, uSunDir.y);
  // nuvens (plano em altura)
  if (e > 0.01) {
    vec2 uv = d.xz / (e + 0.08) * 1.4 + vec2(uTime*0.004, uTime*0.0015);
    float n = fbm(uv * .9);
    float cl = smoothstep(.48 - uCloud*.18, .78, n);
    vec3 cc = mix(uSkyHor*1.05, vec3(1.), .55) * (0.55 + 0.5*max(uSunDir.y,0.)) + uSunCol*0.15;
    cc = mix(cc, cc*0.25, uNight);
    c = mix(c, cc, cl * smoothstep(0.01, 0.15, e) * .9);
  }
  // estrelas
  if (uNight > .01 && e > 0.) {
    vec2 g = d.xz / (e + .3) * 120.;
    float st = step(.996, hash12(floor(g))) * hash12(floor(g)+3.);
    c += vec3(st) * uNight * 1.6 * smoothstep(0., .2, e);
  }
  return c;
}`;
export const SKY_FS = /* glsl */`#version 300 es
${COMMON}
${SKY_FUNC}
in vec2 vUv; uniform mat4 uInvVP; uniform float uExpo; out vec4 o;
void main(){
  vec4 a = uInvVP * vec4(vUv, 1., 1.); vec4 b = uInvVP * vec4(vUv, -1., 1.);
  vec3 d = normalize(a.xyz/a.w - b.xyz/b.w);
  o = vec4(outCol(skyColor(d), uExpo), 1.);
}`;

// --------------------------------------------------------------- cópia (cor + profundidade)
export const COPY_FS = /* glsl */`#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uCol, uDep; out vec4 o;
void main(){ vec2 uv = vUv*.5+.5; o = texture(uCol, uv); gl_FragDepth = texture(uDep, uv).r; }`;
export const COPY_VS = /* glsl */`#version 300 es
const vec2 P[3] = vec2[3](vec2(-1,-1), vec2(3,-1), vec2(-1,3));
out vec2 vUv; void main(){ vUv = P[gl_VertexID]; gl_Position = vec4(P[gl_VertexID], 0., 1.); }`;

// --------------------------------------------------------------- água
export const WATER_VS = /* glsl */`#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj; uniform vec3 uOrigin; uniform float uTime, uWaveAmp;
uniform vec4 uRip[16]; uniform int uNRip; // xz, t0, força
out vec3 vW; out vec3 vWN;
vec3 waves(vec2 p, out vec3 n){
  float h = 0.; vec2 g = vec2(0.);
  // ondas de lago (comprimentos e velocidades distintos)
  vec4 W[4] = vec4[4](vec4(0.8,0.6,9.0,0.07), vec4(-0.4,0.9,5.5,0.05), vec4(0.95,-0.3,3.1,0.03), vec4(-0.7,-0.7,13.,0.06));
  for (int i=0;i<4;i++){
    vec2 d = normalize(W[i].xy); float k = 6.2831/W[i].z; float c = sqrt(9.8/k);
    float f = k*(dot(d,p) - c*uTime*0.6);
    float a = W[i].w * uWaveAmp;
    h += a*sin(f); g += a*k*d*cos(f);
  }
  for (int i=0;i<16;i++){
    if (i >= uNRip) break;
    vec2 d = p - uRip[i].xy; float r = length(d) + 1e-3;
    float age = uTime - uRip[i].z; if (age < 0. || age > 7.) continue;
    float front = age * 3.2;
    float env = exp(-pow((r - front)*0.9, 2.)) * exp(-age*0.55) * uRip[i].w / (1. + r*0.15);
    float ph = (r - front) * 4.;
    h += sin(ph) * env * 0.35;
    g += d/r * cos(ph) * env * 0.35 * 4.;
  }
  n = normalize(vec3(-g.x, 1., -g.y));
  return vec3(0., h, 0.);
}
void main(){
  vec2 p = aPos.xz + uOrigin.xz;
  vec3 n; vec3 d = waves(p, n);
  vW = vec3(p.x, d.y, p.y); vWN = n;
  gl_Position = uViewProj * vec4(vW, 1.);
}`;
export const WATER_FS = /* glsl */`#version 300 es
${COMMON}
${SKY_FUNC}
in vec3 vW; in vec3 vWN;
uniform vec3 uCamPos; uniform float uExpo, uUnder; uniform vec2 uRes; uniform float uNear, uFar;
uniform sampler2D uSceneCol, uSceneDep;
uniform vec3 uWaterShallow, uWaterDeep, uWFogCol; uniform float uWFogDen, uFogDen; uniform vec3 uFogCol;
uniform float uLightLvl;
out vec4 o;
float linZ(float d){ float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
void main(){
  vec3 V = uCamPos - vW; float dist = length(V); V /= dist;
  // normais de detalhe animadas (duas camadas cruzadas)
  vec2 q = vW.xz;
  float e = 0.12;
  float h0 = fbm(q*0.35 + uTime*vec2(0.05,0.03)) + fbm(q*0.9 - uTime*vec2(0.04,-0.07))*0.5;
  float hx = fbm((q+vec2(e,0.))*0.35 + uTime*vec2(0.05,0.03)) + fbm((q+vec2(e,0.))*0.9 - uTime*vec2(0.04,-0.07))*0.5;
  float hz = fbm((q+vec2(0.,e))*0.35 + uTime*vec2(0.05,0.03)) + fbm((q+vec2(0.,e))*0.9 - uTime*vec2(0.04,-0.07))*0.5;
  float detail = mix(0.55, 0.12, clamp(dist/250., 0., 1.));
  vec3 N = normalize(vWN + vec3(-(hx-h0)/e, 0., -(hz-h0)/e) * detail);
  vec2 suv = gl_FragCoord.xy / uRes;
  if (uUnder > .5) {
    // vista de baixo: janela de Snell + reflexão interna total
    N = -N;
    float cosi = max(dot(V, N), 0.);
    float snell = smoothstep(0.62, 0.72, cosi);
    vec3 refr = refract(-V, N, 1.33);
    vec3 sky = skyColor(normalize(vec3(refr.x, abs(refr.y)+0.05, refr.z))) * 1.2;
    vec3 col = mix(uWFogCol * 1.2, sky, snell);
    float f = 1. - exp(-dist * uWFogDen);
    col = mix(col, uWFogCol, f);
    o = vec4(outCol(col, uExpo), 1.);
    return;
  }
  // refração: amostra a cena atrás da superfície, deslocada pela normal
  vec2 off = N.xz * 0.035 * clamp(18./dist, 0.15, 1.);
  float sceneD = linZ(texture(uSceneDep, suv + off).r);
  float surfD = linZ(gl_FragCoord.z);
  if (sceneD < surfD) { off = vec2(0.); sceneD = linZ(texture(uSceneDep, suv).r); }
  vec3 scene = texture(uSceneCol, suv + off).rgb; // já em espaço de tela
  float viewScale = dist / max(surfD, 0.01);
  float thick = max(sceneD - surfD, 0.) * viewScale;
  vec3 absorb = vec3(0.55, 0.22, 0.2);
  vec3 trans = exp(-absorb * thick * 0.8);
  float turb = 1. - exp(-thick * 0.3);
  vec3 wcol = mix(uWaterShallow, uWaterDeep, 1. - exp(-thick*0.08)) * uLightLvl;
  vec3 underD = scene * trans * (1. - turb) + outCol(wcol, uExpo) * turb;
  // reflexão: céu + silhueta escura da margem perto do horizonte
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 refl = skyColor(R);
  float az = atan(R.z, R.x);
  float ridge = 0.05 + 0.06 * fbm(vec2(az*3.0, 1.3));
  float shore = smoothstep(ridge + 0.025, ridge - 0.02, R.y);
  refl = mix(refl, vec3(0.025,0.05,0.035)*uLightLvl + uFogCol*0.3, shore*0.85);
  vec3 H = normalize(uSunDir + V);
  refl += uSunCol * pow(max(dot(N, H), 0.), 420.) * 6. * step(0., uSunDir.y) * (1. - uNight * 0.75);
  float F = 0.02 + 0.98 * pow(1. - max(dot(N, V), 0.), 5.);
  vec3 col = mix(underD, outCol(refl, uExpo), F);
  // espuma onde a água encosta em pedras/cais/margem
  float foam = smoothstep(0.7, 0.0, thick) * smoothstep(0.35, 0.65, fbm(q*2.2 + uTime*0.3));
  col = mix(col, outCol(vec3(0.85,0.9,0.92)*(uLightLvl*0.8+0.05), uExpo), foam*0.7);
  float f = 1. - exp(-dist * uFogDen);
  col = mix(col, outCol(uFogCol, uExpo), f);
  o = vec4(col, 1.);
}`;

// --------------------------------------------------------------- partículas
export const PART_VS = /* glsl */`#version 300 es
layout(location=0) in vec3 aPos; layout(location=2) in vec4 aCol; layout(location=1) in vec3 aSz;
uniform mat4 uViewProj; uniform float uScaleY; uniform vec3 uCamPos;
out vec4 vC;
void main(){ vC = aCol; vec4 p = uViewProj * vec4(aPos,1.); gl_Position = p; gl_PointSize = clamp(aSz.x * uScaleY / max(p.w, 0.1), 1., 96.); }`;
export const PART_FS = /* glsl */`#version 300 es
precision highp float; in vec4 vC; out vec4 o; uniform float uSoft;
void main(){ vec2 d = gl_PointCoord*2.-1.; float r = dot(d,d); if (r > 1.) discard; float a = mix(1., 1.-r, uSoft); o = vec4(vC.rgb, vC.a * a); }`;

// --------------------------------------------------------------- texturizado (placas, nomes)
export const TEX_VS = /* glsl */`#version 300 es
layout(location=0) in vec3 aPos; layout(location=3) in vec4 aUv;
uniform mat4 uModel, uViewProj; uniform float uBill; uniform vec3 uCamRight, uCamUp;
out vec2 vUv; out vec3 vW;
void main(){
  vec4 w;
  if (uBill > .5) { vec3 c = (uModel * vec4(0,0,0,1)).xyz; float s = length(uModel[0].xyz); w = vec4(c + uCamRight * aPos.x * s + uCamUp * aPos.y * s, 1.); }
  else w = uModel * vec4(aPos, 1.);
  vW = w.xyz; vUv = aUv.xy; gl_Position = uViewProj * w;
}`;
export const TEX_FS = /* glsl */`#version 300 es
precision highp float; in vec2 vUv; in vec3 vW; uniform sampler2D uTex; uniform float uOpacity, uBright; out vec4 o;
void main(){ vec4 c = texture(uTex, vUv); if (c.a < 0.04) discard; o = vec4(c.rgb * uBright, c.a * uOpacity); }`;
