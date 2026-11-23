# leva os grupos (braço E, braço D, boia, resto) da malha reduzida para a malha original,
# usando vizinho mais próximo com a normal parecida (braço e barriga encostados têm normais opostas)
import numpy as np
from scipy.spatial import cKDTree
b=np.load('bruto.npz'); P=b['P'].astype(np.float64); N=b['N'].astype(np.float64)
r=np.load('rig.npz'); Pr=r['P']; Nr=r['N']; G=r['G']
g4=np.zeros(len(G),np.int64); g4[G==1]=1; g4[G==2]=2; g4[G==6]=3
d,ii=cKDTree(Pr).query(P,k=10)
dots=np.einsum('vkj,vj->vk',Nr[ii],N)
ok=dots>0.25
first=np.where(ok.any(1),ok.argmax(1),0)
esc=ii[np.arange(len(P)),first]
go=g4[esc]
np.save('grupos_orig.npy',go)
print('grupos originais',np.bincount(go))
