import numpy as np, cv2, sys
d=np.load('bruto.npz'); P=d['P']; UV=d['UV']; I=d['I']
tex=cv2.imread('tex0.jpg'); th,tw=tex.shape[:2]
def render(view, H=900, out='v.png'):
    if view=='frente': X=P[:,0]; Y=P[:,1]; Z=P[:,2]
    elif view=='tras': X=-P[:,0]; Y=P[:,1]; Z=-P[:,2]
    elif view=='lado': X=-P[:,2]; Y=P[:,1]; Z=P[:,0]
    s=H/2.0; W=int(1.3*s*1.0)+200
    img=np.full((H+40,W,3),60,np.uint8)
    px=(X*s+W/2).astype(np.float32); py=(H/2+20-Y*s).astype(np.float32)
    tri=I
    zc=Z[tri].mean(1); order=np.argsort(zc)  # far first (viewer at +Z)
    uvc=UV[tri].mean(1)
    cols=tex[np.clip(((uvc[:,1])*th).astype(int),0,th-1), np.clip((uvc[:,0]*tw).astype(int),0,tw-1)]
    pts=np.stack([px[tri],py[tri]],-1)
    for t in order:
        cv2.fillConvexPoly(img, np.round(pts[t]*4).astype(np.int32), tuple(int(c) for c in cols[t]), lineType=cv2.LINE_8, shift=2)
    for yv in np.arange(-0.9,1.0,0.1):
        y=int(H/2+20-yv*s); cv2.line(img,(0,y),(40,y),(255,255,255),1); cv2.putText(img,f'{yv:.1f}',(42,y+4),0,0.4,(255,255,255),1)
    for xv in np.arange(-0.6,0.61,0.1):
        x=int(xv*s+W/2); cv2.line(img,(x,H+20),(x,H+40),(255,255,255),1); cv2.putText(img,f'{xv:.1f}',(x-10,H+38),0,0.35,(255,255,0),1)
    cv2.imwrite(out,img)
for v in sys.argv[1:]: render(v,out=f'ver_{v}.png')
