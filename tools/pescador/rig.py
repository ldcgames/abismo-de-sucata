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
amarelo=(h>=17)&(h<=38)&(s>110)&(v>120)
zonaAnel=(Pp[:,1]>-0.28)&(Pp[:,1]<0.03)
zonaPato=(Pp[:,1]>=0.03)&(Pp[:,1]<0.3)&(Pp[:,2]>0.12)&(np.abs(Pp[:,0])<0.2)
boia=amarelo&(zonaAnel|zonaPato)
# expande a boia por vizinhança (bico laranja, óculos) dentro da região do pato
from scipy.sparse.csgraph import connected_components
sub=G.copy(); 
reg=(zonaAnel|zonaPato)&(amarelo|((h<16)&(s>205))|(v<70))
idx=np.where(reg)[0]; Gs=G[idx][:,idx]; nco,cc=connected_components(Gs,directed=False)
bcomp=set(cc[np.isin(idx,np.where(boia)[0])])
boia2=np.zeros(npnt,bool); boia2[idx[np.isin(cc,list(bcomp))]]=True
boia=boia|boia2
# volume da boia (toro elíptico ajustado pelos pontos amarelos): pega também a parte de baixo/sombra da boia
corpoAnel=amarelo&zonaAnel&((np.abs(Pp[:,0])>0.15)|(Pp[:,2]<0))
qa=Pp[corpoAnel]
y0,y1=np.percentile(qa[:,1],[3,97]); x0,x1=np.percentile(qa[:,0],[2,98]); z0,z1=np.percentile(qa[:,2],[2,98])
rr=(y1-y0)/2; cy=(y0+y1)/2; cx=(x0+x1)/2; cz=(z0+z1)/2; ea=(x1-x0)/2-rr; eb=(z1-z0)/2-rr
phi=np.arctan2((Pp[:,2]-cz)/eb,(Pp[:,0]-cx)/ea)
cen=np.stack([cx+ea*np.cos(phi),np.full(npnt,cy),cz+eb*np.sin(phi)],1)
dAnel=np.linalg.norm(Pp-cen,axis=1)
pele=(h>=3)&(h<=16)&(s>70)&(s<190)&(v>140)
noAnel=(dAnel<rr*1.12)&~pele
print('anel: centro',np.round([cx,cy,cz],3),'semi-eixos',np.round([ea,eb],3),'raio do tubo',round(rr,3),'novos',(noAnel&~boia).sum())
boia=boia|noAnel
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
# mandíbula (boca abre e fecha quando fala): queixo e lábio de baixo, com transição suave
ORD.append('jaw'); PAI['jaw']='head'; J['jaw']=(0,0.5,-0.05)
W=np.concatenate([W,np.zeros((npnt,1))],1); ji=len(ORD)-1; hi=ORD.index('head')
yy=Pp[:,1]; xx=np.abs(Pp[:,0]); zz=Pp[:,2]
ss=lambda a,b,x: np.clip((x-a)/(b-a),0,1)**2*(3-2*np.clip((x-a)/(b-a),0,1))
wj=(1-ss(0.474,0.49,yy))*ss(0.34,0.39,yy)*(1-ss(0.1,0.17,xx))*ss(-0.02,0.06,zz)
wj[lab!=hi]=0; wj[boia]=0
W[:,ji]=wj*W[:,hi]+0; W[:,hi]*=(1-wj)
# mão/dedos: rígido na mão; cabeça: rígida (chapéu)
W/=W.sum(1,keepdims=True)
top=np.argsort(-W,1)[:,:4]; tw4=np.take_along_axis(W,top,1); tw4/=tw4.sum(1,keepdims=True)
# ---- normais suaves por posição
nrm=np.zeros((npnt,3)); 
v0,v1,v2=Pp[pid[I[:,0]]],Pp[pid[I[:,1]]],Pp[pid[I[:,2]]]
fn=np.cross(v1-v0,v2-v0)
for k in range(3): np.add.at(nrm,pid[I[:,k]],fn)
nrm/=np.linalg.norm(nrm,axis=1,keepdims=True)+1e-12
# triângulos que grudam a boia nas mãos/braços (a malha da IA é uma peça só): em vez de cortar (deixava furos),
# cada triângulo vai inteiro para o lado da maioria; o vértice do outro lado é duplicado com os pesos desse lado
# grupos de pele que a IA "soldou" uns nos outros: braço x barriga/quadril, boia x qualquer outra parte
gidx=lambda ks:[ORD.index(k) for k in ks]
grupo=np.zeros(npnt,np.int64)  # 0 = tronco/cabeça (normal)
grupo[np.isin(lab,gidx(['shL','elL','hdL']))]=1
grupo[np.isin(lab,gidx(['shR','elR','hdR']))]=2
grupo[np.isin(lab,gidx(['thL','knL','anL']))]=3
grupo[np.isin(lab,gidx(['thR','knR','anR']))]=4
grupo[np.isin(lab,gidx(['hips','spine']))]=5
grupo[boia]=6
def colado(g1,g2):
    s_={g1,g2}
    if 6 in s_ and s_!={6,5} and len(s_)==2: return True          # boia com braço/perna/peito
    if s_ & {1,2} and s_ & {5,3,4}: return True                    # braço com barriga/quadril/perna
    if s_=={1,2}: return True
    return False
Pv=list(P); UVv=list(UV); Nv=list(nrm[pid]); Jv=list(top[pid]); Wv=list(tw4[pid]); labv=list(lab[pid])
Iout=I.copy(); nmix=0
G3=grupo[pid[I]]
for t in range(len(I)):
    g=G3[t]
    if g[0]==g[1]==g[2]: continue
    if not (colado(g[0],g[1]) or colado(g[1],g[2]) or colado(g[0],g[2])): continue
    vals,cnt=np.unique(g,return_counts=True); dono=vals[cnt.argmax()]
    ref=I[t][list(g).index(dono)]
    for k in range(3):
        if g[k]!=dono:
            v=I[t,k]; Pv.append(P[v]); UVv.append(UV[v]); Nv.append(nrm[pid[v]]); Jv.append(top[pid[ref]]); Wv.append(tw4[pid[ref]]); labv.append(lab[pid[ref]]); Iout[t,k]=len(Pv)-1
    nmix+=1
print('triangulos misturados resolvidos',nmix)
P=np.array(Pv); UV=np.array(UVv); I=Iout
NN=np.array(Nv); JJ=np.array(Jv); WW=np.array(Wv); LL=np.array(labv)
# máscara da camisa (verde) para pintar com a cor do jogador
TM=1024
texs=cv2.resize(tex,(TM,TM),interpolation=cv2.INTER_AREA); hs=cv2.cvtColor(texs,cv2.COLOR_BGR2HSV)
camisaV=np.isin(LL,[ORD.index(k) for k in ['spine','chest','neck','shL','shR','elL','elR']])&(P[:,1]>-0.1)&(P[:,1]<0.42)
zona=np.zeros((TM,TM),np.uint8)
for t in np.where(camisaV[I].sum(1)>=2)[0]:
    q=np.round(UV[I[t]]*TM*4).astype(np.int32); cv2.fillConvexPoly(zona,q,255,shift=2)
zona=cv2.dilate(zona,np.ones((5,5),np.uint8))
verde=((hs[:,:,0]>=28)&(hs[:,:,0]<=75)&(hs[:,:,1]>45)).astype(np.uint8)*255
verde=cv2.morphologyEx(verde,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
mask=cv2.GaussianBlur(cv2.bitwise_and(zona,verde),(3,3),0)
cv2.imwrite('mascara.png',mask)
print('mascara cobertura',(mask>128).mean())
np.savez('rig.npz',P=P,UV=UV,I=I,N=NN,J=JJ,W=WW,lab=LL)
json.dump({'J':J,'ORD':ORD,'PAI':PAI},open('esqueleto.json','w'))
print('labels',np.bincount(lab,minlength=len(ORD)))
