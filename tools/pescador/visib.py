# quantas direções "enxergam" cada ponto da malha (z-buffer por splat dos pontos da malha original)
import numpy as np
def visibilidade(pts, oclus, ndir=60, px=0.005, eps=0.012):
    i=np.arange(ndir)+0.5; phi=np.arccos(1-2*i/ndir); th=np.pi*(1+5**0.5)*i
    D=np.stack([np.cos(th)*np.sin(phi),np.sin(th)*np.sin(phi),np.cos(phi)],1)
    cont=np.zeros(len(pts),int)
    for d in D:
        up=np.array([0,1,0]) if abs(d[1])<0.9 else np.array([1,0,0])
        u=np.cross(up,d); u/=np.linalg.norm(u); v=np.cross(d,u)
        def proj(X): return np.floor(X@u/px).astype(np.int64), np.floor(X@v/px).astype(np.int64), X@d
        ou,ov,oz=proj(oclus); mu,mv=ou.min()-2,ov.min()-2
        W=ou.max()-mu+3; H=ov.max()-mv+3
        zb=np.full(W*H,np.inf); np.minimum.at(zb,(ou-mu)*H+(ov-mv),oz)
        pu,pv,pz=proj(pts)
        idx=(np.clip(pu-mu,0,W-1))*H+np.clip(pv-mv,0,H-1)
        cont+= pz <= zb[idx]+eps
    return cont, ndir
