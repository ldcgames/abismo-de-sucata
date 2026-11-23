# Redução da malha original (Meshy, ~1,5 mi triângulos) mantendo a superfície fechada e as costuras de UV.
# Uso: python3 decimar_qem.py [triangulos_alvo]   -> dec.npz (P, UV, I, G) no mesmo formato do decimar.py
import numpy as np, subprocess, sys, os, struct
alvo=int(sys.argv[1]) if len(sys.argv)>1 else 100000
d=np.load('bruto.npz'); P=d['P'].astype(np.float64); UV=d['UV'].astype(np.float32); I=d['I'].astype(np.int64)
GO=np.load('grupos_orig.npy') if os.path.exists('grupos_orig.npy') else np.zeros(len(P),np.int64)
key=np.round(P*1e5).astype(np.int64); _,wid=np.unique(key,axis=0,return_inverse=True); wid=wid.ravel()
nw=wid.max()+1
Pw=np.zeros((nw,3)); Pw[wid]=P
Gw=np.zeros(nw,np.int32); Gw[wid]=GO
Tw=wid[I].astype(np.int32)
ok=(Tw[:,0]!=Tw[:,1])&(Tw[:,1]!=Tw[:,2])&(Tw[:,0]!=Tw[:,2]); Tw=Tw[ok]; Ic=I[ok]
UVc=UV[Ic].reshape(-1,6).astype(np.float32)
if not os.path.exists('qem') or os.path.getmtime('qem.cpp')>os.path.getmtime('qem'):
    subprocess.run(["g++","-O2","-w",'-o','qem','qem.cpp'],check=True)
inp=struct.pack('ii',nw,len(Tw))+Pw.astype(np.float32).tobytes()+Tw.tobytes()+UVc.tobytes()+Gw.tobytes()+struct.pack('ii',alvo,1)
r=subprocess.run(['./qem'],input=inp,capture_output=True,check=True); print(r.stderr.decode().strip())
o=r.stdout; n=struct.unpack('i',o[:4])[0]; off=4
T=np.frombuffer(o[off:off+n*12],np.int32).reshape(-1,3); off+=n*12
U=np.frombuffer(o[off:off+n*24],np.float32).reshape(-1,3,2); off+=n*24
Pn=np.frombuffer(o[off:],np.float32).reshape(-1,3)
if '--reproj' in sys.argv:
    # UV: reprojeta cada canto no mapa (ilha de UV) do triângulo original mais próximo
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    nraw=len(P)
    A=coo_matrix((np.ones(len(Ic)*2),(np.concatenate([Ic[:,0],Ic[:,1]]),np.concatenate([Ic[:,1],Ic[:,2]]))),shape=(nraw,nraw))
    _,ilha_v=connected_components(A,directed=False); ilha=ilha_v[Ic[:,0]]
    from scipy.spatial import cKDTree
    A0=P[Ic[:,0]];A1=P[Ic[:,1]];A2=P[Ic[:,2]]; cen=(A0+A1+A2)/3
    kd=cKDTree(cen)
    def proj(p,ids):
        # p:(n,3) ids:(n,k) -> dist (n,k), bary (n,k,3)
        a=A0[ids];b=A1[ids];c=A2[ids]; pp=p[:,None,:]
        v0=b-a;v1=c-a;v2=pp-a
        d00=(v0*v0).sum(-1);d01=(v0*v1).sum(-1);d11=(v1*v1).sum(-1);d20=(v2*v0).sum(-1);d21=(v2*v1).sum(-1)
        den=d00*d11-d01*d01+1e-30; v=(d11*d20-d01*d21)/den; w=(d00*d21-d01*d20)/den; u=1-v-w
        B=np.stack([u,v,w],-1); B=np.clip(B,0,None); B/=B.sum(-1,keepdims=True)+1e-30
        q=B[...,0:1]*a+B[...,1:2]*b+B[...,2:3]*c
        return np.linalg.norm(q-pp,axis=-1),B
    Pt=Pn[T].astype(np.float64)              # (n,3,3)
    cT=Pt.mean(1)
    K=24
    _,idc=kd.query(cT,k=K); dc,_=proj(cT,idc)
    ilhaT=ilha[idc[np.arange(len(T)),dc.argmin(1)]]
    UVo=UV[Ic]                                # (m,3,2)
    U=np.zeros((len(T),3,2),np.float32)
    for k in range(3):
        p=Pt[:,k]; _,idk=kd.query(p,k=K); dk,Bk=proj(p,idk)
        mesmo=ilha[idk]==ilhaT[:,None]
        dk2=np.where(mesmo,dk,dk+1e3)
        j=dk2.argmin(1); r=np.arange(len(T)); tri=idk[r,j]; B=Bk[r,j]
        U[:,k]=(UVo[tri]*B[:,:,None]).sum(1)
        dist_k=dk2[r,j]; print('canto',k,'longe da ilha (>4mm)',int((dist_k>0.004).sum()),'(>1cm)',int((dist_k>0.01).sum()))
        falha=np.where(~mesmo.any(1))[0]
        if len(falha):
            _,idf=kd.query(p[falha],k=600); df,Bf=proj(p[falha],idf)
            mf=ilha[idf]==ilhaT[falha][:,None]; df=np.where(mf,df,df+1e3); jf=df.argmin(1); rf=np.arange(len(falha))
            U[falha,k]=(UVo[idf[rf,jf]]*Bf[rf,jf][:,:,None]).sum(1)
            print('canto',k,'refeitos',len(falha),'ainda sem ilha',int((~mf.any(1)).sum()))

# um vértice por (posição, uv)
cv=T.ravel(); cu=U.reshape(-1,2)
k2=np.concatenate([cv[:,None].astype(np.int64),np.round(cu*65535).astype(np.int64)],1)
uk,inv=np.unique(k2,axis=0,return_inverse=True); inv=inv.ravel()
Pk=Pn[uk[:,0]]; UVk=np.zeros((len(uk),2),np.float32); UVk[inv]=cu
Ik=inv.reshape(-1,3)
print('vertices',len(Pk),'triangulos',len(Ik))
np.savez('dec.npz',P=Pk.astype(np.float32),UV=UVk,I=Ik.astype(np.int32),G=Gw[uk[:,0]].astype(np.int64))
