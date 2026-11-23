// Simplificação por colapso de arestas com quádricas (Garland-Heckbert), preservando:
//  - malha 2-manifold (condição de link), sem triângulos invertidos;
//  - costuras de UV (vértice com mais de uma UV não se move);
//  - fronteiras entre peças (braço / boia / corpo): arestas entre grupos diferentes não colapsam.
// Entrada (stdin binário): nV, nT, pos[nV*3] float, tri[nT*3] int, uv[nT*6] float, grp[nV] int, alvo int
// Saída (stdout binário): nT', tri[nT'*3] int, uv[nT'*6] float, pos[nV*3] float
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <vector>
#include <queue>
#include <algorithm>
using namespace std;
struct Q { double a[10]; Q(){for(double&x:a)x=0;} void add(const Q&o){for(int i=0;i<10;i++)a[i]+=o.a[i];}
  double ev(const double*p)const{double x=p[0],y=p[1],z=p[2];
    return a[0]*x*x+2*a[1]*x*y+2*a[2]*x*z+2*a[3]*x+a[4]*y*y+2*a[5]*y*z+2*a[6]*y+a[7]*z*z+2*a[8]*z+a[9];}};
int nV,nT; vector<double> P; vector<int> T; vector<float> UV; vector<int> G; vector<char> vivoT, vivoV, costura, borda; vector<int> ver;
vector<vector<int>> vt; vector<Q> q;
struct E{double c;int a,b,va,vb; bool operator<(const E&o)const{return c>o.c;}};
priority_queue<E> heap;
static void cross(const double*u,const double*v,double*r){r[0]=u[1]*v[2]-u[2]*v[1];r[1]=u[2]*v[0]-u[0]*v[2];r[2]=u[0]*v[1]-u[1]*v[0];}
static void nrm(int t,const double*pa,int va,double*n){ // normal do triângulo t com o vértice va colocado em pa
  const double* p[3]; for(int k=0;k<3;k++){int v=T[t*3+k]; p[k]= v==va? pa : &P[v*3];}
  double u[3],w[3]; for(int i=0;i<3;i++){u[i]=p[1][i]-p[0][i];w[i]=p[2][i]-p[0][i];} cross(u,w,n);}
static double len(const double*n){return sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);}
int semUV=0;
void push(int a,int b){ if((costura[a]&&!semUV)||G[a]!=G[b]) return; if(borda[a]&&!borda[b]) return;
  Q s=q[a]; s.add(q[b]); double c=s.ev(&P[b*3]); heap.push({c,a,b,ver[a],ver[b]});}
void vizinhos(int v,vector<int>&out){out.clear(); for(int t:vt[v]) if(vivoT[t]) for(int k=0;k<3;k++){int u=T[t*3+k]; if(u!=v) out.push_back(u);} sort(out.begin(),out.end()); out.erase(unique(out.begin(),out.end()),out.end());}
int main(){
  if(fread(&nV,4,1,stdin)!=1||fread(&nT,4,1,stdin)!=1) return 1;
  vector<float> pf(nV*3); fread(pf.data(),4,nV*3,stdin); P.assign(pf.begin(),pf.end());
  T.resize(nT*3); fread(T.data(),4,nT*3,stdin); UV.resize(nT*6); fread(UV.data(),4,nT*6,stdin); G.resize(nV); fread(G.data(),4,nV,stdin);
  int alvo; fread(&alvo,4,1,stdin); fread(&semUV,4,1,stdin);
  vivoT.assign(nT,1); vivoV.assign(nV,1); costura.assign(nV,0); borda.assign(nV,0); ver.assign(nV,0); vt.resize(nV); q.resize(nV);
  for(int t=0;t<nT;t++){ double n[3]; nrm(t,nullptr,-1,n); double l=len(n); if(l<1e-30) l=1e-30; double a=l*0.5; for(int i=0;i<3;i++)n[i]/=l;
    double d=-(n[0]*P[T[t*3]*3]+n[1]*P[T[t*3]*3+1]+n[2]*P[T[t*3]*3+2]); Q k; double m[4]={n[0],n[1],n[2],d};
    int id=0; double* A=k.a; A[0]=m[0]*m[0];A[1]=m[0]*m[1];A[2]=m[0]*m[2];A[3]=m[0]*m[3];A[4]=m[1]*m[1];A[5]=m[1]*m[2];A[6]=m[1]*m[3];A[7]=m[2]*m[2];A[8]=m[2]*m[3];A[9]=m[3]*m[3]; (void)id;
    for(double&x:k.a)x*=a; for(int j=0;j<3;j++){int v=T[t*3+j]; q[v].add(k); vt[v].push_back(t);} }
  // costura de UV e borda entre grupos
  for(int v=0;v<nV;v++){ float u0=-1,v0=-1; for(int t:vt[v]){ int k=0; while(T[t*3+k]!=v)k++; float uu=UV[t*6+k*2],vv=UV[t*6+k*2+1];
      if(u0<0){u0=uu;v0=vv;} else if(fabs(uu-u0)>1e-6||fabs(vv-v0)>1e-6){costura[v]=1;} for(int j=0;j<3;j++) if(G[T[t*3+j]]!=G[v]) borda[v]=1; } }
  for(int t=0;t<nT;t++) for(int k=0;k<3;k++){int a=T[t*3+k],b=T[t*3+(k+1)%3]; push(a,b); push(b,a);}
  int vivos=nT; vector<int> na,nb;
  while(vivos>alvo && !heap.empty()){
    E e=heap.top(); heap.pop(); int a=e.a,b=e.b;
    if(!vivoV[a]||!vivoV[b]||e.va!=ver[a]||e.vb!=ver[b]) continue;
    // aresta ainda existe? e condição de link
    vizinhos(a,na); if(!binary_search(na.begin(),na.end(),b)) continue;
    vizinhos(b,nb); int comuns=0; for(int x:na) if(binary_search(nb.begin(),nb.end(),x)) comuns++;
    if(comuns!=2) continue;
    // UV: cada "cunha" de a (cantos de a com a mesma UV) precisa encostar na aresta ab, para herdar a UV de b do mesmo lado da costura
    int tab[2]={-1,-1},nab=0; for(int t:vt[a]) if(vivoT[t]){ for(int k=0;k<3;k++) if(T[t*3+k]==b){ if(nab<2) tab[nab]=t; nab++; } }
    if(nab!=2) continue;
    float wa[2][2],wb[2][2];
    for(int i=0;i<2;i++){ int t=tab[i]; for(int k=0;k<3;k++){ if(T[t*3+k]==a){wa[i][0]=UV[t*6+k*2];wa[i][1]=UV[t*6+k*2+1];} if(T[t*3+k]==b){wb[i][0]=UV[t*6+k*2];wb[i][1]=UV[t*6+k*2+1];} } }
    bool ok=true; float ub=0,vb_=0;
    auto achaUV=[&](float u,float v,float&ou,float&ov)->bool{ for(int i=0;i<2;i++) if(fabs(wa[i][0]-u)<1e-6&&fabs(wa[i][1]-v)<1e-6){ou=wb[i][0];ov=wb[i][1];return true;} return false; };
    for(int t:vt[a]) if(vivoT[t]){ for(int k=0;k<3;k++) if(T[t*3+k]==a){ float ou,ov; if(!achaUV(UV[t*6+k*2],UV[t*6+k*2+1],ou,ov)) ok=false; } }
    if(!ok) continue;
    // se a costura passa por ab, b também tem de ser costura dos dois lados (senão a costura "desliza" e estica a textura)
    (void)ub;(void)vb_;
    // sem triângulo invertido nem degenerado
    for(int t:vt[a]) if(vivoT[t]){ bool temb=false; for(int k=0;k<3;k++) if(T[t*3+k]==b) temb=true; if(temb) continue;
      double n0[3],n1[3]; nrm(t,nullptr,-1,n0); nrm(t,&P[b*3],a,n1); double l0=len(n0),l1=len(n1);
      if(l1<1e-14||(n0[0]*n1[0]+n0[1]*n1[1]+n0[2]*n1[2])<0.35*l0*l1){ok=false;break;}
      // qualidade: evita lascas finas
      const double* p[3]; for(int k=0;k<3;k++){int v=T[t*3+k]; p[k]= v==a? &P[b*3] : &P[v*3];}
      double s=0; for(int k=0;k<3;k++){double d2=0; for(int i=0;i<3;i++){double d=p[k][i]-p[(k+1)%3][i]; d2+=d*d;} s+=d2;}
      if(l1/(s+1e-30) < 0.03){ok=false;break;} }
    if(!ok) continue;
    for(int t:vt[a]) if(vivoT[t]){ bool temb=false; for(int k=0;k<3;k++) if(T[t*3+k]==b) temb=true;
      if(temb){ vivoT[t]=0; vivos--; continue; }
      for(int k=0;k<3;k++) if(T[t*3+k]==a){ float ou=0,ov=0; achaUV(UV[t*6+k*2],UV[t*6+k*2+1],ou,ov); T[t*3+k]=b; UV[t*6+k*2]=ou; UV[t*6+k*2+1]=ov; }
      vt[b].push_back(t); }
    vivoV[a]=0; q[b].add(q[a]); ver[b]++;
    // limpa lista de b
    vector<int> nl; for(int t:vt[b]) if(vivoT[t]) nl.push_back(t); sort(nl.begin(),nl.end()); nl.erase(unique(nl.begin(),nl.end()),nl.end()); vt[b]=nl;
    vizinhos(b,nb); for(int x:nb){ push(b,x); push(x,b); }
  }
  int n=0; for(int t=0;t<nT;t++) if(vivoT[t]) n++;
  fwrite(&n,4,1,stdout);
  for(int t=0;t<nT;t++) if(vivoT[t]) fwrite(&T[t*3],4,3,stdout);
  for(int t=0;t<nT;t++) if(vivoT[t]) fwrite(&UV[t*6],4,6,stdout);
  vector<float> po(P.begin(),P.end()); fwrite(po.data(),4,nV*3,stdout);
  fprintf(stderr,"triangulos %d -> %d\n",nT,n);
  return 0;
}
