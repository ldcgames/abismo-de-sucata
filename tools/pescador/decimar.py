import numpy as np, sys
d=np.load('bruto.npz'); P=d['P'].astype(np.float64); UV=d['UV'].astype(np.float64); I=d['I'].astype(np.int64)
cell=float(sys.argv[1]) if len(sys.argv)>1 and not sys.argv[1].startswith('-') else 0.012
UB=40
mn=P.min(0)
ci=np.floor((P-mn)/cell).astype(np.int64)
dims=ci.max(0)+1
cid=(ci[:,0]*dims[1]+ci[:,1])*dims[2]+ci[:,2]
import os
GO=np.load('grupos_orig.npy') if os.path.exists('grupos_orig.npy') and '--grupos' in sys.argv else np.zeros(len(P),np.int64)
cid=cid*4+GO   # células não misturam peças diferentes (braço, boia, corpo)
ucell, cinv=np.unique(cid, return_inverse=True)
nc=len(ucell)
# quadrics por célula
v0,v1,v2=P[I[:,0]],P[I[:,1]],P[I[:,2]]
nrm=np.cross(v1-v0,v2-v0); area=np.linalg.norm(nrm,axis=1)+1e-20; n=nrm/area[:,None]; dd=-(n*v0).sum(1)
w=area
A=np.einsum('ti,tj->tij',n,n)*w[:,None,None]; b=n*(dd*w)[:,None]
QA=np.zeros((nc,3,3)); Qb=np.zeros((nc,3))
for k in range(3):
    c=cinv[I[:,k]]
    np.add.at(QA,c,A); np.add.at(Qb,c,b)
cnt=np.bincount(cinv,minlength=nc).astype(float); mean=np.zeros((nc,3))
for k in range(3): mean[:,k]=np.bincount(cinv,weights=P[:,k],minlength=nc)/cnt
# resolve (A + eps I) x = -b + eps*mean, eps pequeno puxa para a média
eps=1e-3*np.trace(QA,axis1=1,axis2=2)[:,None]/3+1e-12
M=QA+np.eye(3)[None]*eps[:,:,None]
rhs=-Qb+eps*mean
pos=np.linalg.solve(M,rhs[:,:,None])[:,:,0]
# não deixa sair da célula (+ meia célula)
uc_=ucell//4
lo=mn+(np.stack([uc_//(dims[1]*dims[2]), (uc_//dims[2])%dims[1], uc_%dims[2]],1))*cell
pos=np.clip(pos,lo-cell*0.5,lo+cell*1.5)
# subclusters por UV
ub=np.floor(UV*UB).astype(np.int64)
key=cinv*(UB*UB*4)+ (np.clip(ub[:,0],0,UB*2-1)*UB*2+np.clip(ub[:,1],0,UB*2-1))
uk, kinv=np.unique(key, return_inverse=True)
nv=len(uk); kc=np.zeros(nv,np.int64); kc[kinv]=cinv
cntk=np.bincount(kinv,minlength=nv).astype(float)
uvk=np.stack([np.bincount(kinv,weights=UV[:,j],minlength=nv)/cntk for j in range(2)],1)
T=kinv[I]
cellT=kc[T]
ok=(cellT[:,0]!=cellT[:,1])&(cellT[:,1]!=cellT[:,2])&(cellT[:,0]!=cellT[:,2])
T=T[ok]
Ts=np.sort(T,1); _,ui=np.unique(Ts,axis=0,return_index=True); T=T[np.sort(ui)]
# compacta
used=np.unique(T); remap=-np.ones(nv,np.int64); remap[used]=np.arange(len(used))
Pk=pos[kc[used]]; UVk=uvk[used]; T=remap[T]
print('celulas',nc,'vertices',len(used),'triangulos',len(T))
gcell=ucell%4
np.savez('dec.npz',P=Pk.astype(np.float32),UV=UVk.astype(np.float32),I=T.astype(np.int32),G=gcell[kc[used]])
