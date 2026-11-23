import numpy as np, cv2, json, base64, struct
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
d=np.load('dec.npz'); P=d['P'].astype(np.float64); UV=d['UV']; I=d['I'].astype(np.int64)
nv=len(P)
# ---- esqueleto (unidades do modelo)
J={'hips':(0,-0.33,-0.06),'spine':(0,-0.12,-0.07),'chest':(0,0.10,-0.07),'neck':(0,0.32,-0.07),'head':(0,0.40,-0.05),
   'shL':(-0.37,0.25,-0.10),'elL':(-0.47,0.06,-0.08),'hdL':(-0.49,-0.10,-0.04),
   'shR':(0.37,0.25,-0.10),'elR':(0.47,0.06,-0.08),'hdR':(0.49,-0.10,-0.04),
   'thL':(-0.18,-0.40,-0.06),'knL':(-0.22,-0.62,-0.08),'anL':(-0.23,-0.84,-0.08),
   'thR':(0.18,-0.40,-0.06),'knR':(0.22,-0.62,-0.08),'anR':(0.23,-0.84,-0.08)}
ORD=['hips','spine','chest','neck','head','shL','elL','hdL','shR','elR','hdR','thL','knL','anL','thR','knR','anR']
PAI={'hips':None,'spine':'hips','chest':'spine','neck':'chest','head':'neck','shL':'chest','elL':'shL','hdL':'elL','shR':'chest','elR':'shR','hdR':'elR','thL':'hips','knL':'thL','anL':'knL','thR':'hips','knR':'thR','anR':'knR'}
FIM={'hips':(0,-0.12,-0.06),'spine':J['chest'],'chest':J['neck'],'neck':J['head'],'head':(0,0.8,-0.05),
     'shL':J['elL'],'elL':J['hdL'],'hdL':(-0.49,-0.3,-0.01),'shR':J['elR'],'elR':J['hdR'],'hdR':(0.49,-0.3,-0.01),
     'thL':J['knL'],'knL':J['anL'],'anL':(-0.23,-0.9,0.15),'thR':J['knR'],'knR':J['anR'],'anR':(0.23,-0.9,0.15)}
R={'hips':0.32,'spine':0.36,'chest':0.32,'neck':0.12,'head':0.34,'shL':0.09,'elL':0.08,'hdL':0.08,'shR':0.09,'elR':0.08,'hdR':0.08,'thL':0.15,'knL':0.12,'anL':0.12,'thR':0.15,'knR':0.12,'anR':0.12}
def segdist(p,a,b):
    a=np.array(a);b=np.array(b);ab=b-a;t=np.clip(((p-a)@ab)/(ab@ab),0,1)
    return np.linalg.norm(p-(a+t[:,None]*ab),axis=1)
E=np.stack([segdist(P,J[k],FIM[k]) for k in ORD],1)
lab0=E.argmin(1)
# ---- grafo (funde vértices de mesma posição)
key=np.round(P*1e5).astype(np.int64); _,pid=np.unique(key,axis=0,return_inverse=True); pid=pid.ravel(); npnt=pid.max()+1
e=np.concatenate([I[:,[0,1]],I[:,[1,2]],I[:,[2,0]]]); a=pid[e[:,0]]; b=pid[e[:,1]]
L=np.linalg.norm(P[e[:,0]]-P[e[:,1]],axis=1)+1e-6
G=coo_matrix((np.concatenate([L,L]),(np.concatenate([a,b]),np.concatenate([b,a]))),shape=(npnt,npnt)).tocsr()
Pp=np.zeros((npnt,3)); Pp[pid]=P
Ep=np.zeros((npnt,len(ORD))); Ep[pid]=E
labp=Ep.argmin(1)
D=np.full((npnt,len(ORD)),np.inf)
for bi,k in enumerate(ORD):
    seeds=np.where((labp==bi)&(Ep[:,bi]<R[k]*0.8))[0]
    if len(seeds)==0: seeds=np.where(labp==bi)[0]
    if len(seeds)==0: continue
    dist=dijkstra(G,indices=seeds,min_only=True,limit=1.5)
    D[:,bi]=dist
D=np.where(np.isfinite(D),D,10)+Ep*0.25
for k in ['shL','shR']:
    bi=ORD.index(k); D[np.abs(Pp[:,0])<0.31,bi]=10
for k in ['shL','elL','hdL','shR','elR','hdR']:
    bi=ORD.index(k); sgn=-1 if k.endswith('L') else 1; D[(Pp[:,0]*sgn)<0.2,bi]=10
lab=D.argmin(1)
# ---- pato/boia: amarelo/laranja/preto na região da cintura → rígido no quadril
tex=cv2.imread('tex0.jpg'); th,tw=tex.shape[:2]; hsv=cv2.cvtColor(tex,cv2.COLOR_BGR2HSV)
uvp=np.zeros((npnt,2)); uvp[pid]=UV
px=np.clip((uvp[:,0]*tw).astype(int),0,tw-1); py=np.clip((uvp[:,1]*th).astype(int),0,th-1)
h=hsv[py,px,0].astype(int); s=hsv[py,px,1].astype(int); v=hsv[py,px,2].astype(int)
amarelo=(h>=19)&(h<=34)&(s>180)&(v>170)
boia=amarelo&(Pp[:,1]>-0.32)&(Pp[:,1]<0.28)
# expande a boia por vizinhança (bico laranja, óculos) dentro da região do pato
from scipy.sparse.csgraph import connected_components
sub=G.copy(); 
reg=(Pp[:,1]>-0.32)&(Pp[:,1]<0.3)&(Pp[:,2]>0.0)&(amarelo|((h<16)&(s>205))|(v<70))
idx=np.where(reg)[0]; Gs=G[idx][:,idx]; nco,cc=connected_components(Gs,directed=False)
bcomp=set(cc[np.isin(idx,np.where(boia)[0])])
boia2=np.zeros(npnt,bool); boia2[idx[np.isin(cc,list(bcomp))]]=True
boia=boia|boia2
print('boia',boia.sum(),'de',npnt)
lab[boia]=0
# ---- pesos: bone principal + vizinhos na hierarquia
viz={bi:[bi] for bi in range(len(ORD))}
for bi,k in enumerate(ORD):
    if PAI[k]: pj=ORD.index(PAI[k]); viz[bi].append(pj); viz[pj].append(bi)
W=np.zeros((npnt,len(ORD)))
sig=0.035
for p in range(npnt):
    bi=lab[p]; cand=viz[bi]
    dd=np.array([D[p,c] for c in cand])
    sg=np.array([0.08 if {ORD[bi],ORD[c]} & {'shL','shR'} and {ORD[bi],ORD[c]} & {'chest'} else 0.05 for c in cand])
    w=np.exp(-(dd-dd.min())/sg); 
    for c,x in zip(cand,w): W[p,c]=x
W[boia]=0; W[boia,0]=1
# mão/dedos: rígido na mão; cabeça: rígida (chapéu)
W/=W.sum(1,keepdims=True)
top=np.argsort(-W,1)[:,:4]; tw4=np.take_along_axis(W,top,1); tw4/=tw4.sum(1,keepdims=True)
# ---- normais suaves por posição
nrm=np.zeros((npnt,3)); 
v0,v1,v2=Pp[pid[I[:,0]]],Pp[pid[I[:,1]]],Pp[pid[I[:,2]]]
fn=np.cross(v1-v0,v2-v0)
for k in range(3): np.add.at(nrm,pid[I[:,k]],fn)
nrm/=np.linalg.norm(nrm,axis=1,keepdims=True)+1e-12
# corta os triângulos que grudam a boia nas mãos/braços (malha da IA é uma peça só)
bra=np.isin(lab,[ORD.index(k) for k in ['shL','elL','hdL','shR','elR','hdR']])
bv=boia[pid[I]]; av=bra[pid[I]]
corta=(bv.any(1)&av.any(1))
# idem pernas x braços e cabeça x braços (dedos encostados)
I=I[~corta]
print('triangulos cortados',corta.sum())
np.savez('rig.npz',P=P,UV=UV,I=I,N=nrm[pid],J=top[pid],W=tw4[pid],lab=lab[pid])
json.dump({'J':J,'ORD':ORD,'PAI':PAI},open('esqueleto.json','w'))
print('labels',np.bincount(lab,minlength=len(ORD)))
