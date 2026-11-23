import numpy as np, cv2, json, base64
d=np.load('rig.npz'); P=d['P']; UV=d['UV']; I=d['I']; N=d['N']; Jb=d['J']; W=d['W']
S=1.55/1.9
Pg=(P+np.array([0,0.95,0.06]))*S
q=1/4096.0
Pq=np.round(Pg/q).astype(np.int16)
Nq=np.round(N*127).astype(np.int8)
UVq=np.round(np.clip(UV,0,1)*65535).astype(np.uint16)
Wq=np.round(W*255).astype(np.int32); Wq[:,0]+=255-Wq.sum(1); Wq=Wq.astype(np.uint8)
Jq=Jb.astype(np.uint8)
buf=Pq.tobytes()+Nq.tobytes()+UVq.tobytes()+Jq.tobytes()+Wq.tobytes()+I.astype(np.uint16).tobytes()
J=json.load(open('esqueleto.json'))
Jg={k:[round((v[0])*S,4),round((v[1]+0.95)*S,4),round((v[2]+0.06)*S,4)] for k,v in J['J'].items()}
tex=cv2.imread('tex0.jpg'); tex=cv2.resize(tex,(2048,2048),interpolation=cv2.INTER_AREA)
ok,jpg=cv2.imencode('.jpg',tex,[cv2.IMWRITE_JPEG_QUALITY,80])
print('verts',len(P),'tris',len(I),'geo bytes',len(buf),'jpg',len(jpg))
js=f"""// Personagem "pescador com boia de pato" (modelo do usuário, Meshy AI) — malha reduzida e esqueleto automático.
// Gerado por ferramentas/pescador: posições int16 (×1/4096 m), normais int8, uv uint16, 4 ossos + pesos por vértice.
export const PESCADOR = {{ nv: {len(P)}, nt: {len(I)}, ossos: {json.dumps(J['ORD'])}, juntas: {json.dumps(Jg)} }};
export const PESCADOR_GEO = '{base64.b64encode(buf).decode()}';
export const PESCADOR_TEX = 'data:image/jpeg;base64,{base64.b64encode(jpg.tobytes()).decode()}';
"""
open('/home/claude/abismo/client/src/entities/pescador_dados.js','w').write(js)
print('js bytes',len(js))
