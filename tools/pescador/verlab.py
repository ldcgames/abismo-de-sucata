import numpy as np, cv2, sys
d=np.load('rig.npz'); P=d['P']; I=d['I']; lab=d['lab']
pal=np.array([[200,200,200],[0,0,255],[0,128,255],[0,255,255],[0,255,0],[255,0,0],[255,0,255],[128,0,128],[255,128,0],[128,255,0],[0,128,0],[255,255,0],[128,128,255],[60,60,60],[255,200,150],[150,100,50],[90,90,160]],np.uint8)
def render(view,H=700):
    if view=='frente': X=P[:,0]; Y=P[:,1]; Z=P[:,2]
    else: X=-P[:,2]; Y=P[:,1]; Z=P[:,0]
    s=H/2; W=int(1.3*s)+100; img=np.full((H+40,W,3),40,np.uint8)
    px=X*s+W/2; py=H/2+20-Y*s; zc=Z[I].mean(1); o=np.argsort(zc)
    tl=lab[I[:,0]]
    for t in o: cv2.fillConvexPoly(img,np.round(np.stack([px[I[t]],py[I[t]]],-1)*4).astype(np.int32),tuple(int(c) for c in pal[tl[t]]),shift=2)
    return img
cv2.imwrite('lab.png',np.hstack([render('frente'),render('lado')]))
