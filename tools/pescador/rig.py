import numpy as np, cv2, json, base64, struct
import os; SEM_LISO=bool(os.environ.get("SEM_LISO"))
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
d=np.load('dec.npz'); P=d['P'].astype(np.float64); UV=d['UV']; I=d['I'].astype(np.int64); GD=d['G'] if 'G' in d else np.zeros(len(P),np.int64)
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
Gp=np.zeros(npnt,np.int64); Gp[pid]=GD
# limpa lascas: cada braço e a boia ficam só com o maior pedaço conectado; pedacinhos soltos voltam para o vizinho
from scipy.sparse.csgraph import connected_components as _cc
for gg in (1,2,3):
    idx=np.where(Gp==gg)[0]
    if len(idx)==0: continue
    sub_=G[idx][:,idx]; nco,cc=_cc(sub_,directed=False)
    tam=np.bincount(cc); grande=tam.argmax()
    solto=idx[cc!=grande]
    for _ in range(6):
        if len(solto)==0: break
        nb=G[solto]
        novo=[]
        for r_,v in enumerate(solto):
            viz=nb[r_].indices; gs=Gp[viz]; gs=gs[gs!=gg]
            if len(gs): Gp[v]=np.bincount(gs).argmax()
            else: novo.append(v)
        solto=np.array(novo,np.int64)
    print('grupo',gg,'pedaços',nco,'lascas devolvidas',int((cc!=grande).sum()))
GD=Gp[pid]
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
# peças separadas na redução: braço só pode ser osso de braço (e peito no ombro); corpo nunca é braço
for k in ['shL','elL','hdL']: D[Gp==2,ORD.index(k)]=10; D[Gp==0,ORD.index(k)]=10
for k in ['shR','elR','hdR']: D[Gp==1,ORD.index(k)]=10; D[Gp==0,ORD.index(k)]=10
for k in ORD:
    if k not in ['shL','elL','hdL','shR','elR','hdR','chest']: D[(Gp==1)|(Gp==2),ORD.index(k)]=10
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
boia=boia|noAnel|(Gp==3)
boia[(Gp==1)|(Gp==2)]=False
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
grupo[np.isin(lab,gidx(['hips']))]=5
grupo[np.isin(lab,gidx(['spine']))]=7
grupo[boia]=6
def colado(g1,g2):
    s_={g1,g2}
    if 6 in s_ and s_!={6,5} and len(s_)==2: return True          # boia com qualquer parte que não seja o quadril
    if s_ & {1,2} and s_ & {5,3,4,7}: return True                  # braço com barriga/quadril/perna
    if s_=={1,2}: return True
    return False
Pv=list(P); UVv=list(UV); Nv=list(nrm[pid]); Jv=list(top[pid]); Wv=list(tw4[pid]); labv=list(lab[pid]); gv=list(grupo[pid])
Iout=I.copy(); nmix=0; apagar=[]
G3=grupo[pid[I]]
for t in range(len(I)):
    g=G3[t]
    if g[0]==g[1]==g[2]: continue
    if not (colado(g[0],g[1]) or colado(g[1],g[2]) or colado(g[0],g[2])): continue
    vals,cnt=np.unique(g,return_counts=True); dono=vals[cnt.argmax()]
    if set(g) & {1,2}:
        # braço/mão soldado na boia ou na barriga: o triângulo de ligação some (não arrasta lasca nem deixa pedaço no corpo)
        apagar.append(t); nmix+=1; continue
    if 6 in g:
        # encostado na boia: decide pela cor do próprio triângulo (amarelo/bico/óculos fica na boia; pele/roupa vai com o braço/corpo)
        uc=UV[I[t]].mean(0); hx,sx_,vx=hsv[min(th-1,int(uc[1]*th)),min(tw-1,int(uc[0]*tw))]
        corBoia=(17<=hx<=38 and sx_>100 and vx>110) or (hx<16 and sx_>205)
        if corBoia: dono=6
        else:
            outros=[x for x in g if x!=6]
            vv,cc=np.unique(outros,return_counts=True); dono=vv[cc.argmax()]

    ref=I[t][list(g).index(dono)]
    for k in range(3):
        if g[k]!=dono:
            v=I[t,k]; Pv.append(P[v]); UVv.append(UV[v]); Nv.append(nrm[pid[v]]); Jv.append(top[pid[ref]]); Wv.append(tw4[pid[ref]]); labv.append(lab[pid[ref]]); gv.append(dono); Iout[t,k]=len(Pv)-1
    nmix+=1
print('triangulos misturados resolvidos',nmix)
print('triangulos de ligação apagados',len(apagar))
# superfícies de boia/barriga que atravessam o braço (ficavam escondidas dentro dele e apareciam como lascas quando ele mexe)
from scipy.spatial import cKDTree as _KD
def _segd0(p,a,b):
    a=np.array(a);b=np.array(b);ab=b-a;t=np.clip(((p-a)@ab)/(ab@ab),0,1);return np.linalg.norm(p-(a+t[:,None]*ab),axis=1)
_P=np.array(Pv); _G=np.array(gv); _N=np.array(Nv)
_arm=np.where(np.isin(_G,[1,2]))[0]; _kd=_KD(_P[_arm])
_out=np.where(~np.isin(_G,[1,2]))[0]
_d,_i=_kd.query(_P[_out])
_viz=_arm[_i]
_dentro=np.zeros(len(_P),bool)
_dentro[_out]=(_d<0.05)&(np.einsum('ij,ij->i',_P[_out]-_P[_viz],_N[_viz])<-0.002)
for _sd in 'LR':
    for _k in ('el','hd'):
        _dd=_segd0(_P,J[_k+_sd],FIM[_k+_sd]); _dentro|=(_dd<0.08)&(_G==6)
_ap=set(apagar)
for t in range(len(Iout)):
    if t in _ap: continue
    if _dentro[Iout[t]].any(): apagar.append(t)
print('triangulos de boia/corpo dentro do braço apagados',int(_dentro.sum()),len(apagar))
# fecha os buracos que ficaram onde a IA tinha soldado braço/boia/corpo: cada borda aberta vira uma "tampa" (leque)
Ifill=np.delete(Iout,apagar,axis=0) if len(apagar) else Iout.copy()
from collections import defaultdict
GVf=np.array(gv)
tampas=[]; nbur=0
n_antes_tampa=len(Pv)
_Pf=np.array(Pv); _wk=np.unique(np.round(_Pf*1e5).astype(np.int64),axis=0,return_inverse=True)[1].ravel()
for g_ in np.unique(GVf[Ifill[:,0]]):
    T=Ifill[GVf[Ifill[:,0]]==g_]
    rep={}
    for tri in T:
        for v in tri: rep.setdefault(_wk[v],v)
    TW=_wk[T]
    cont=defaultdict(int)
    for a,b,c in TW:
        for x,y in ((a,b),(b,c),(c,a)): cont[(x,y)]+=1
    prox=defaultdict(list)
    for (x,y),n in cont.items():
        if (y,x) not in cont: prox[x].append(y)
    for x0 in list(prox.keys()):
        while prox[x0]:
            laco=[x0]; x=prox[x0].pop()
            while x!=x0 and prox[x] and len(laco)<4000:
                laco.append(x); x=prox[x].pop()
            if x!=x0 or len(laco)<3: continue
            laco=[rep[w] for w in laco]
            pts=np.array([Pv[v] for v in laco])
            per=np.linalg.norm(np.diff(np.vstack([pts,pts[:1]]),axis=0),axis=1).sum()
            if per>1.5: continue
            c=pts.mean(0); n_=np.mean([Nv[v] for v in laco],axis=0); n_=n_/(np.linalg.norm(n_)+1e-9)
            w_=np.zeros(len(ORD))
            for v in laco:
                for j_,ww in zip(Jv[v],Wv[v]): w_[j_]+=ww
            jj=np.argsort(-w_)[:4]; ww=w_[jj]/w_[jj].sum()
            Pv.append(c); UVv.append(UVv[laco[0]]); Nv.append(n_); Jv.append(jj); Wv.append(ww); labv.append(labv[laco[0]]); gv.append(g_)
            ci=len(Pv)-1
            for k in range(len(laco)):
                tampas.append([laco[(k+1)%len(laco)],laco[k],ci])
            nbur+=1
if tampas and not os.environ.get("SEM_TAMPA"): Ifill=np.vstack([Ifill,np.array(tampas)])
# pedacinhos soltos (ilhas pequenas que sobraram depois dos cortes) somem
from scipy.sparse.csgraph import connected_components as _cc
from scipy.sparse import coo_matrix as _coo
_Pf=np.array(Pv); _wk=np.unique(np.round(_Pf*1e5).astype(np.int64),axis=0,return_inverse=True)[1].ravel()
_GV=np.array(gv); _keep=np.ones(len(Ifill),bool)
for g_ in np.unique(_GV[Ifill[:,0]]):
    ti=np.where(_GV[Ifill[:,0]]==g_)[0]; W_=_wk[Ifill[ti]]
    n_=_wk.max()+1
    A_=_coo((np.ones(len(ti)*2),(np.concatenate([W_[:,0],W_[:,1]]),np.concatenate([W_[:,1],W_[:,2]]))),shape=(n_,n_))
    _,lb=_cc(A_,directed=False); tl=lb[W_[:,0]]
    u_,c_=np.unique(tl,return_counts=True); peq=set(u_[c_<60])
    for k_,t_ in enumerate(ti):
        if tl[k_] in peq: _keep[t_]=False
print('triangulos de ilhas soltas removidos',int((~_keep).sum()))
Ifill=Ifill[_keep]
print('buracos tampados',nbur,'triangulos de tampa',len(tampas))
# zonas escondidas (braço encostado na barriga/boia, lado de dentro do braço): a textura da IA ali tem manchas.
# Triângulos inteiros dessas zonas passam a usar uma amostra lisa da cor certa (pele, manga, amarelo da boia ou jeans),
# com vértices duplicados na borda — assim não "puxa" a textura de outro lugar do atlas.
from scipy.spatial import cKDTree
P=np.array(Pv); UV=np.array(UVv)
GV=np.array(gv); NNa=np.array(Nv)
pxa=np.clip((UV[:,0]*tw).astype(int),0,tw-1); pya=np.clip((UV[:,1]*th).astype(int),0,th-1)
ha=hsv[pya,pxa,0].astype(int); sa=hsv[pya,pxa,1].astype(int); va=hsv[pya,pxa,2].astype(int)
classe=np.full(len(P),-1)
classe[(ha>=3)&(ha<=17)&(sa>=60)&(sa<=200)&(va>=150)]=0      # pele
classe[(ha>=28)&(ha<=80)&(sa>45)]=1                            # camisa
classe[(ha>=17)&(ha<=38)&(sa>110)&(va>110)]=2                  # boia
classe[(ha>=95)&(ha<=125)&(sa>70)]=3                           # jeans
# amostra lisa de cada classe: texel cercado da mesma cor (5x5 com pouca variação)
amostra={0:np.array([3552,2240])/4096.,1:np.array([3488,256])/4096.,2:np.array([1952,1728])/4096.,3:np.array([672,416])/4096.}
print('amostras',{k:np.round(v,3).tolist() for k,v in amostra.items()})
pulseira=np.linalg.norm(P-np.array([-0.49,-0.07,-0.04]),axis=1)<0.06
flag=np.zeros(len(P),bool)
outra={1:[0,5,6,7,3,4,2],2:[0,5,6,7,3,4,1],5:[1,2],7:[1,2],6:[1,2],0:[1,2]}
for g_,ops in outra.items():
    mg=np.where(GV==g_)[0]; mo=np.where(np.isin(GV,ops))[0]
    if len(mg)==0 or len(mo)==0: continue
    dist,_=cKDTree(P[mo]).query(P[mg]); lim=0.06 if g_ in (1,2) else 0.04
    flag[mg[dist<lim]]=True
for g_,sx in ((1,-1),(2,1)):
    mg=np.where(GV==g_)[0]; flag[mg[NNa[mg,0]*sx<-0.15]]=True
    flag[mg[classe[mg]<0]]=True
flag[np.unique(np.array(tampas,int).ravel()) if tampas else []]=True
# partes escondidas na pose original (quase nenhuma direção enxerga): textura da IA ali é chute — usa a cor vizinha
from visib import visibilidade
_vis,_nd=visibilidade(P.astype(np.float64),np.load('bruto.npz')['P'].astype(np.float64))
LIMV=int(os.environ.get('LIMV','8'))
_esc=np.isin(GV,[1,2,6,0,7,5])&(_vis<=LIMV)
flag[_esc]=True
print('vertices escondidos (visibilidade baixa)',int(_esc.sum()))
flag&=~pulseira
# classe desejada: a do vizinho visível (não marcado) mais próximo da mesma peça
alvo=np.full(len(P),-1)
for g_ in np.unique(GV):
    mg=np.where((GV==g_)&flag)[0]; ok_=np.where((GV==g_)&~flag&(classe>=0))[0]
    if len(mg)==0 or len(ok_)==0: continue
    if g_ in (1,2): ok_=ok_[classe[ok_]<=1]
    if len(ok_)==0: continue
    _,ii=cKDTree(P[ok_]).query(P[mg]); alvo[mg]=classe[ok_[ii]]
# antebraço/mão: não tem manga — qualquer mancha verde/branca/marrom ali vira pele
ante=np.isin(GV,[1,2])&(P[:,1]<0.12)&~pulseira
fix=ante&(classe!=0)
flag[fix]=True; alvo[fix]=0
# boia: manchas marrons/cor de pele onde o braço encostava viram amarelo
mb=np.where(GV==6)[0]; ma=np.where(np.isin(GV,[1,2]))[0]
dist_,_=cKDTree(P[ma]).query(P[mb]); fb=mb[(dist_<0.16)&(classe[mb]!=2)&((np.abs(P[mb,0])>0.2)|(sa[mb]<215))]
flag[fb]=True; alvo[fb]=2
print('manchas na boia',len(fb))
alvo[ante&flag]=0
# manga x pele no braço: decide pela altura ao longo do braço (a barra da manga é reta), não pelo vizinho
for g_,sd,sx in ((1,'L',-1),(2,'R',1)):
    mg=np.where(GV==g_)[0]
    a_=np.array(J['sh'+sd]); b_=np.array(J['el'+sd]); ab=b_-a_
    tt=((P[mg]-a_)@ab)/(ab@ab)
    fora=(~flag[mg])&(NNa[mg,0]*sx>0.3)
    ts=tt[fora&(classe[mg]==1)]; tk=tt[fora&(classe[mg]==0)&(tt>-0.2)]
    if len(ts)>50 and len(tk)>50:
        lim=0.5*(np.percentile(ts,95)+np.percentile(tk,5))
        print('barra da manga',sd,round(float(lim),3))
        m2=mg[flag[mg]&(tt<1.0)]
        alvo[m2]=np.where(tt[flag[mg]&(tt<1.0)]<lim,1,0)
# partes escondidas: a cor é "pintada de novo" na própria textura, espalhando suavemente a cor das partes visíveis
# vizinhas (mesma peça e cor certa) — sem remendo de cor chapada, sem mosaico.
from scipy.sparse import coo_matrix as _coo2
from scipy.sparse.linalg import spsolve
Iuse=Ifill
Pva=np.array(Pv); UVa=np.array(UVv)
texb=cv2.GaussianBlur(tex,(7,7),0).astype(np.float64)
pxv=np.clip((UVa[:,0]*tw).astype(int),0,tw-1); pyv=np.clip((UVa[:,1]*th).astype(int),0,th-1)
colv=texb[pyv,pxv]
nV=len(Pva)
conhecido=~flag.copy()
GVv=np.array(gv)
for g_ in (1,2): conhecido[(GVv==g_)&(classe>1)]=False
conhecido[ante&(classe!=0)]=False
conhecido[(GVv==6)&(classe!=2)&(np.abs(Pva[:,0])>0.2)]=False
wk2=np.unique(np.round(Pva*1e5).astype(np.int64),axis=0,return_inverse=True)[1].ravel()
nW=wk2.max()+1
# cor por nó soldado (média dos conhecidos) e incógnitas
cw=np.zeros((nW,3)); nw_=np.zeros(nW)
np.add.at(cw,wk2[conhecido],colv[conhecido]); np.add.at(nw_,wk2[conhecido],1)
known=nw_>0; cw[known]/=nw_[known][:,None]
gW=np.zeros(nW,int); gW[wk2]=GVv
# arestas só dentro da mesma peça
E_=np.concatenate([Iuse[:,[0,1]],Iuse[:,[1,2]],Iuse[:,[2,0]]]); ea=wk2[E_[:,0]]; eb=wk2[E_[:,1]]
ok_e=(gW[ea]==gW[eb])&(ea!=eb); ea=ea[ok_e]; eb=eb[ok_e]
A_=_coo2((np.ones(len(ea)*2),(np.concatenate([ea,eb]),np.concatenate([eb,ea]))),shape=(nW,nW)).tocsr(); A_.data[:]=1
deg=np.asarray(A_.sum(1)).ravel()
unk=np.where(~known&(deg>0))[0]
pos_u=-np.ones(nW,int); pos_u[unk]=np.arange(len(unk))
L_=(_coo2((deg[unk],(np.arange(len(unk)),np.arange(len(unk)))),shape=(len(unk),len(unk)))).tocsr()
Au=A_[unk][:,unk]; Ak=A_[unk][:,np.where(known)[0]]
M_=L_-Au+1e-4*_coo2((np.ones(len(unk)),(np.arange(len(unk)),np.arange(len(unk)))),shape=(len(unk),len(unk))).tocsr()
rhs=Ak@cw[known]
# nós sem nenhum vizinho conhecido no componente ficam com a cor da classe-alvo
alvoW=-np.ones(nW,int); alvoW[wk2]=alvo
amC={c_:texb[int(amostra[c_][1]*th),int(amostra[c_][0]*tw)] for c_ in amostra}
fb_=np.array([amC.get(alvoW[u],np.array([150,170,230.])) for u in unk])
rhs=rhs+1e-4*fb_
sol=np.stack([spsolve(M_,rhs[:,c_]) for c_ in range(3)],1)
cw[unk]=np.clip(sol,0,255)
colF=cw[wk2]
colF[conhecido]=colv[conhecido]
tex=tex.copy()
ehTampa=np.zeros(len(Iuse),bool)
if tampas and not os.environ.get("SEM_TAMPA"):
    ehTampa[len(Iuse)-0:]=False
tamV=set(np.unique(np.array(tampas,int).ravel()).tolist()) if tampas else set()
ntri=0; ntam=0
for t in range(len(Iuse)):
    tri=Iuse[t]
    if SEM_LISO or not flag[tri].any(): continue
    if any(v>=len(UVa) for v in tri): continue
    if len(tamV) and tri[2] in tamV and Pva[tri[2]].tolist()==Pva[tri[2]].tolist() and tri[2]>=n_antes_tampa:
        # tampa: um texel só (o do primeiro vértice da borda, que já foi repintado)
        uvn=UVa[tri[0]]
        for k in range(3):
            v=tri[k]; Pv.append(Pv[v]); UVv.append(uvn); Nv.append(Nv[v]); Jv.append(Jv[v]); Wv.append(Wv[v]); labv.append(labv[v]); gv.append(gv[v]); Iuse[t,k]=len(Pv)-1
        ntam+=1; continue
    q=UVa[tri]*np.array([tw,th]); c3=colF[tri]
    x0=int(np.floor(q[:,0].min()))-2; x1=int(np.ceil(q[:,0].max()))+2; y0=int(np.floor(q[:,1].min()))-2; y1=int(np.ceil(q[:,1].max()))+2
    if x1-x0>400 or y1-y0>400: continue
    yy,xx=np.mgrid[max(0,y0):min(th,y1),max(0,x0):min(tw,x1)]
    xs=xx+0.5; ys=yy+0.5
    d_=(q[1,1]-q[2,1])*(q[0,0]-q[2,0])+(q[2,0]-q[1,0])*(q[0,1]-q[2,1])
    if abs(d_)<1e-9: continue
    l0=((q[1,1]-q[2,1])*(xs-q[2,0])+(q[2,0]-q[1,0])*(ys-q[2,1]))/d_
    l1=((q[2,1]-q[0,1])*(xs-q[2,0])+(q[0,0]-q[2,0])*(ys-q[2,1]))/d_
    l2=1-l0-l1
    # margem de ~1,5 texel fora do triângulo
    per=np.linalg.norm(q[[1,2,0]]-q,axis=1); hmin=abs(d_)/max(per.max(),1e-6)
    tol=-1.5/max(hmin,1e-6)
    m_=(l0>=tol)&(l1>=tol)&(l2>=tol)
    if not m_.any(): continue
    L3=np.clip(np.stack([l0,l1,l2],-1),0,None); L3/=L3.sum(-1,keepdims=True)+1e-9
    cc=L3@c3
    tex[yy[m_],xx[m_]]=np.clip(cc[m_],0,255).astype(np.uint8)
    ntri+=1
print('triangulos escondidos repintados na textura',ntri,'tampas',ntam)
cv2.imwrite('tex_final.png',tex)
hsv=cv2.cvtColor(tex,cv2.COLOR_BGR2HSV)
P=np.array(Pv); UV=np.array(UVv); I=Iuse
NN=np.array(Nv); JJ=np.array(Jv); WW=np.array(Wv); LL=np.array(labv)
# braço só obedece ossos do próprio braço (sem isso, pedaços ficavam presos no quadril e esticavam como lascas)
GG=np.array(gv)
def _segd(p,a,b):
    a=np.array(a);b=np.array(b);ab=b-a;t=np.clip(((p-a)@ab)/(ab@ab),0,1);return np.linalg.norm(p-(a+t[:,None]*ab),axis=1)
ncorr=0
for g_,sd in ((1,'L'),(2,'R')):
    ok_=[ORD.index(k+sd) for k in ('sh','el','hd')]+[ORD.index('chest')]
    for v in np.where(GG==g_)[0]:
        j=JJ[v]; w=WW[v].copy()
        bad=~np.isin(j,ok_)|((j==ORD.index('chest'))&(P[v,1]<0.14))
        if (w[bad]>1e-4).any():
            ncorr+=1; w[bad]=0
            if w.sum()<0.3:
                ds=[_segd(P[v:v+1],J[k+sd],FIM[k+sd])[0] for k in ('sh','el','hd')]
                JJ[v]=[ok_[int(np.argmin(ds))],0,0,0]; WW[v]=[1,0,0,0]; continue
            WW[v]=w/w.sum()
print('vertices de braço com peso de fora corrigidos',ncorr)
# máscara da camisa (verde) para pintar com a cor do jogador
TM=1024
texs=cv2.resize(tex,(TM,TM),interpolation=cv2.INTER_AREA); hs=cv2.cvtColor(texs,cv2.COLOR_BGR2HSV)
camisaV=np.isin(LL,[ORD.index(k) for k in ['spine','chest','neck','shL','shR','elL','elR']])&(P[:,1]>-0.1)&(P[:,1]<0.42)&~(np.isin(np.array(gv),[1,2])&(P[:,1]<0.12))
zona=np.zeros((TM,TM),np.uint8)
for t in np.where(camisaV[I].sum(1)>=2)[0]:
    q=np.round(UV[I[t]]*TM*4).astype(np.int32); cv2.fillConvexPoly(zona,q,255,shift=2)
zona=cv2.dilate(zona,np.ones((5,5),np.uint8))
verde=((hs[:,:,0]>=28)&(hs[:,:,0]<=75)&(hs[:,:,1]>45)).astype(np.uint8)*255
verde=cv2.morphologyEx(verde,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
mask=cv2.GaussianBlur(cv2.bitwise_and(zona,verde),(3,3),0)
cv2.imwrite('mascara.png',mask)
print('mascara cobertura',(mask>128).mean())
np.savez('rig.npz',P=P,UV=UV,I=I,N=NN,J=JJ,W=WW,lab=LL,G=np.array(gv))
json.dump({'J':J,'ORD':ORD,'PAI':PAI},open('esqueleto.json','w'))
print('labels',np.bincount(lab,minlength=len(ORD)))
