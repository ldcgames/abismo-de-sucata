import json, struct, numpy as np, io
from PIL import Image
b=open('pescador.glb','rb').read()
jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl])
off=20+jl; bl=struct.unpack('<I',b[off:off+4])[0]; bin_=b[off+8:off+8+bl]
def acc(i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]
    n={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]; dt={5126:np.float32,5125:np.uint32}[a['componentType']]
    o=bv.get('byteOffset',0)+a.get('byteOffset',0)
    return np.frombuffer(bin_,dtype=dt,count=a['count']*n,offset=o).reshape(-1,n) if n>1 else np.frombuffer(bin_,dtype=dt,count=a['count'],offset=o)
P=acc(0);UV=acc(1);N=acc(2);I=acc(3).reshape(-1,3)
np.savez('bruto.npz',P=P,UV=UV,N=N,I=I)
for k,im in enumerate(j['images']):
    bv=j['bufferViews'][im['bufferView']]; data=bin_[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]
    open(f'tex{k}.jpg','wb').write(data); print(k, Image.open(io.BytesIO(data)).size, len(data))
print(P.shape, I.shape)
