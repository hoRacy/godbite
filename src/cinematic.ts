import * as THREE from 'three';
import { atmospherePresence } from './journey';

export interface PortalGlow { object: THREE.Object3D; presence: number }

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}
`;
const diffuse = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uStep;
  uniform float uExtract;
  varying vec2 vUv;
  vec3 sampleGlow(vec2 uv){
    vec3 c=texture2D(uTexture,uv).rgb;
    return mix(c,max(c-vec3(.105),vec3(0.)),uExtract);
  }
  void main(){
    vec3 c=sampleGlow(vUv)*.227027;
    c+=(sampleGlow(vUv+uStep*1.384615)+sampleGlow(vUv-uStep*1.384615))*.316216;
    c+=(sampleGlow(vUv+uStep*3.230769)+sampleGlow(vUv-uStep*3.230769))*.070270;
    gl_FragColor=vec4(c,1.);
  }
`;
const atmosphere = /* glsl */ `
  uniform sampler2D uDepth;
  uniform highp sampler3D uNoise;
  uniform mat4 uInverseProjection, uCameraWorld;
  uniform vec3 uLightPosition, uMistLightColor;
  uniform mat4 uPortalInverse[2];
  uniform float uPortalStrength[2];
  uniform float uTime, uDensity, uBillowDensity;
  varying vec2 vUv;
  out vec4 outMist;
  float volumeNoise(vec3 p){
    vec3 cell=floor(p),f=fract(p);
    f=f*f*f*(f*(f*6.-15.)+10.);
    return texture(uNoise,(cell+f+.5)/32.).r;
  }
  float cloudDensity(vec3 p){
    // Smooth volume samples, with a broad scale and no density threshold.
    vec3 flow=vec3(uTime*.012,uTime*.002,-uTime*.006);
    float broad=volumeNoise(p*.055+flow);
    float detail=volumeNoise(p*.125-flow*.7+vec3(3.1,1.7,4.3));
    return .25+broad*.55+detail*.2;
  }
  float billows(vec3 p){
    // Independently advected pockets gather and disperse within the same volume.
    vec3 flow=vec3(uTime*.029,-uTime*.003,-uTime*.017);
    vec3 q=p*vec3(.085,.11,.075)+flow+vec3(7.3,2.8,5.1);
    float curl=volumeNoise(q*.55-flow*.4);
    float body=volumeNoise(q+vec3(curl,-curl*.35,curl*.6));
    float wisps=volumeNoise(q*1.8-flow*.5+4.7);
    return pow(smoothstep(.38,.72,body*.78+wisps*.22),2.);
  }
  float erfApprox(float x){
    float a=abs(x),t=1./(1.+.3275911*a);
    float polynomial=(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t;
    return sign(x)*(1.-polynomial*exp(-a*a));
  }
  float lightVeil(vec3 origin,vec3 direction,float travel,vec3 center,vec3 radii){
    vec3 o=(origin-center)/radii;
    vec3 d=direction/radii;
    float a=dot(d,d),b=dot(o,d),closest=-b/a;
    float perpendicular=max(0.,dot(o,o)-b*b/a);
    float root=sqrt(a);
    float segment=.5*(erfApprox(root*(travel-closest))-erfApprox(-root*closest));
    return exp(-perpendicular)*max(0.,segment)*exp(-uDensity*max(0.,closest)*.6);
  }
  float portalGlow(vec3 origin,vec3 direction,float travel,mat4 inversePortal){
    // The opening warms up as the camera approaches, with feathered light at the jambs.
    vec3 o=(inversePortal*vec4(origin,1.)).xyz;
    vec3 d=mat3(inversePortal)*direction;
    float approach=1.-smoothstep(3.,20.,length(o-vec3(0.,3.5,0.)));
    float veil=lightVeil(o,d,travel,vec3(0.,3.7,-.55),vec3(1.25,3.1,.7))*(.07+approach*.65);
    float left=lightVeil(o,d,travel,vec3(-1.28,3.7,-.4),vec3(.27,3.6,.65));
    float right=lightVeil(o,d,travel,vec3(1.28,3.3,-.4),vec3(.24,3.3,.65));
    // Slanted outer wisps move gently rather than filling the whole doorway with red.
    o.x+=(o.y-3.5)*.065;d.x+=d.y*.065;
    float wisps=lightVeil(o,d,travel,vec3(-1.55,4.,-.6),vec3(.5,4.3,.8));
    wisps+=lightVeil(o,d,travel,vec3(1.6,3.,-.6),vec3(.4,3.8,.8));
    float flicker=.72+volumeNoise(vec3(uTime*.018,2.3,5.7))*.28;
    return veil+(left+right)*.45+wisps*.18*flicker;
  }
  void main(){
    vec4 ray=uInverseProjection*vec4(vUv*2.-1.,1.,1.);
    vec3 viewRay=normalize(ray.xyz/ray.w);
    vec4 surface=uInverseProjection*vec4(vUv*2.-1.,texture2D(uDepth,vUv).r*2.-1.,1.);
    float distanceToSurface=length(surface.xyz/surface.w);
    float travel=min(distanceToSurface,100.);
    vec3 direction=mat3(uCameraWorld)*viewRay;
    vec3 origin=uCameraWorld[3].xyz;
    float stepSize=travel/12.;
    vec3 scatter=vec3(0.);
    float transmission=1.;
    // A single continuous volume: no cards, tile borders, or near-plane crossings.
    for(int i=0;i<12;i++){
      vec3 p=origin+direction*((float(i)+.5)*stepSize);
      float height=exp(-pow((p.y-2.)*.1,2.));
      float pocketHeight=exp(-pow((p.y-2.5)*.18,2.));
      float density=uDensity*height*cloudDensity(p)+uBillowDensity*pocketHeight*billows(p);
      float absorbed=1.-exp(-density*stepSize);
      float light=1./(1.+dot(p-uLightPosition,p-uLightPosition)*.018);
      vec3 color=vec3(.14,.17,.21)+uMistLightColor*light*.045;
      scatter+=transmission*absorbed*color;
      transmission*=1.-absorbed;
    }
    float portals=portalGlow(origin,direction,travel,uPortalInverse[0])*uPortalStrength[0];
    portals+=portalGlow(origin,direction,travel,uPortalInverse[1])*uPortalStrength[1];
    scatter+=vec3(.32,.002,.009)*portals;
    outMist=vec4(scatter,transmission);
  }
`;
const film = /* glsl */ `
  uniform sampler2D uScene, uGlow, uMist;
  uniform vec2 uPixel, uLight;
  uniform vec3 uLightColor;
  uniform float uTime, uJourney, uAspect, uBreath, uAtmosphere;
  varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
  float cloud(vec2 p){return noise(p)*.67+noise(p*2.07)*.33;}
  void main(){
    vec2 center=vUv-.5;
    float gallery=smoothstep(.85,1.12,uJourney)*(1.-smoothstep(1.72,1.94,uJourney));
    float cinema=smoothstep(1.72,1.98,uJourney)*(1.-smoothstep(2.4,2.65,uJourney));
    float club=smoothstep(2.6,2.95,uJourney)*(1.-smoothstep(3.45,3.8,uJourney));
    float diffusion=mix(1.,.12,gallery)*mix(1.,.78,cinema)*mix(1.,.75,club);
    vec2 flow=vec2(uTime*.024,-uTime*.012);
    float vapor=cloud(vUv*vec2(4.1,2.6)+flow);
    vec2 uv=clamp(vUv+vec2(sin(vUv.y*11.+uTime*.13),cos(vUv.x*7.-uTime*.08))*.00075*vapor*diffusion*uAtmosphere,.001,.999);
    float defocus=(.75+smoothstep(.12,.56,length(center)))*2.0*diffusion;
    vec2 px=uPixel*defocus;
    vec3 c=texture2D(uScene,uv).rgb*.38;
    c+=(texture2D(uScene,uv+vec2(px.x,0.)).rgb+texture2D(uScene,uv-vec2(px.x,0.)).rgb)*.16;
    c+=(texture2D(uScene,uv+vec2(0.,px.y)).rgb+texture2D(uScene,uv-vec2(0.,px.y)).rgb)*.15;
    vec4 mist=texture2D(uMist,uv);
    c=c*mist.a+mist.rgb;
    float grey=dot(c,vec3(.2126,.7152,.0722));
    float red=clamp((c.r-max(c.g,c.b))*3.,0.,1.);
    c=mix(vec3(grey)*vec3(.88,.94,1.),c,min(1.,.48+red*.42+gallery*.35+club*.3));
    vec3 halo=texture2D(uGlow,uv).rgb;
    float halation=mix(.8,.12,gallery)*mix(1.,.75,cinema);
    c+=halo*halation+vec3(halo.r*.075*diffusion,0.,0.);
    vec2 lightDelta=(uv-uLight)*vec2(uAspect,1.);
    float distanceToLight=length(lightDelta);
    float aureole=exp(-distanceToLight*distanceToLight*14.);
    float rayAngle=atan(lightDelta.y,lightDelta.x);
    float shafts=pow(max(0.,sin(rayAngle*19.+vapor*2.5+uTime*.028)),12.);
    float cinemaLight=1.-.3*smoothstep(1.6,1.78,uJourney)*(1.-smoothstep(2.4,2.65,uJourney));
    c+=uLightColor*(aureole*(.035+.075*vapor)+shafts*.018*exp(-distanceToLight*3.)+exp(-abs(lightDelta.y)*120.)*exp(-abs(lightDelta.x)*2.5)*.018)*uBreath*cinemaLight*uAtmosphere;
    float curtain=cloud(vUv*vec2(2.9,3.7)-flow*.6+4.3);
    c*=1.-smoothstep(.34,.83,curtain)*mix(.38,.09,gallery)*mix(1.,.8,cinema)*uAtmosphere;
    c+=vec3(.013,.016,.021)*pow(vapor,2.)*(.7+uBreath*.3)*uAtmosphere;
    float auditorium=smoothstep(1.65,1.98,uJourney)*(1.-smoothstep(2.3,2.65,uJourney));
    auditorium=max(auditorium,club);
    float vignette=1.-smoothstep(.16,.76,length(center*vec2(.82,1.)));
    c*=mix(mix(.075,.22,auditorium),1.,pow(vignette,mix(1.35,1.0,auditorium)));
    float crossing=pow(sin(fract(uJourney)*3.14159265),4.);
    c*=1.-crossing*.4;
    gl_FragColor=vec4(max(c,vec3(0.)),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    float grain=hash(gl_FragCoord.xy+floor(uTime*14.)*vec2(13.1,7.7))-.5;
    gl_FragColor.rgb=max(vec3(0.),gl_FragColor.rgb+grain*mix(.018,.006,gallery)*mix(1.,.8,cinema));
  }
`;

/** Scene diffusion is deliberately limited to the world; HTML and film playback stay sharp. */
export class CinematicLens {
  private source: THREE.WebGLRenderTarget;
  private glowX: THREE.WebGLRenderTarget;
  private glowY: THREE.WebGLRenderTarget;
  private mist: THREE.WebGLRenderTarget;
  private volumeNoise: THREE.Data3DTexture;
  private camera=new THREE.Camera();
  private quad=new THREE.Mesh<THREE.PlaneGeometry,THREE.Material>(new THREE.PlaneGeometry(2,2));
  private scene=new THREE.Scene();
  private blur=new THREE.ShaderMaterial({
    vertexShader:vertex,fragmentShader:diffuse,depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{uTexture:{value:null},uStep:{value:new THREE.Vector2()},uExtract:{value:1}},
  });
  private grade=new THREE.ShaderMaterial({
    vertexShader:vertex,fragmentShader:film,depthTest:false,depthWrite:false,
    uniforms:{
      uScene:{value:null},uGlow:{value:null},uMist:{value:null},uPixel:{value:new THREE.Vector2()},
      uLight:{value:new THREE.Vector2(.5,.4)},uLightColor:{value:new THREE.Color('#bc092b')},
      uTime:{value:0},uJourney:{value:0},uAspect:{value:1},uBreath:{value:1},uAtmosphere:{value:1},
    },
  });
  private vapor=new THREE.ShaderMaterial({
    glslVersion:THREE.GLSL3,vertexShader:vertex,fragmentShader:atmosphere,
    depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{
      uDepth:{value:null},uNoise:{value:null},uInverseProjection:{value:new THREE.Matrix4()},
      uCameraWorld:{value:new THREE.Matrix4()},uLightPosition:{value:new THREE.Vector3()},
      uMistLightColor:{value:new THREE.Color()},uTime:{value:0},uDensity:{value:.014},uBillowDensity:{value:.055},
      uPortalInverse:{value:[new THREE.Matrix4(),new THREE.Matrix4()]},uPortalStrength:{value:new Float32Array(2)},
    },
  });
  constructor(private renderer: THREE.WebGLRenderer){
    const type=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
    this.source=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:true});
    this.source.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    this.glowX=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    this.glowY=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    this.mist=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    const size=32,data=new Uint8Array(size*size*size);
    let seed=71;
    for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=(seed-1)/2147483646*255;}
    this.volumeNoise=new THREE.Data3DTexture(data,size,size,size);
    this.volumeNoise.format=THREE.RedFormat;
    this.volumeNoise.minFilter=this.volumeNoise.magFilter=THREE.LinearFilter;
    this.volumeNoise.wrapS=this.volumeNoise.wrapT=this.volumeNoise.wrapR=THREE.RepeatWrapping;
    this.volumeNoise.unpackAlignment=1;this.volumeNoise.needsUpdate=true;
    this.vapor.uniforms.uNoise.value=this.volumeNoise;
    this.vapor.uniforms.uDepth.value=this.source.depthTexture;
    this.quad.material.dispose();this.quad.frustumCulled=false;
    this.scene.add(this.quad);
    this.grade.uniforms.uScene.value=this.source.texture;
    this.grade.uniforms.uGlow.value=this.glowY.texture;
    this.grade.uniforms.uMist.value=this.mist.texture;
  }
  resize(width: number,height: number){
    const w=Math.max(1,Math.floor(width)),h=Math.max(1,Math.floor(height));
    this.source.setSize(w,h);
    this.glowX.setSize(Math.max(1,Math.floor(w/4)),Math.max(1,Math.floor(h/4)));
    this.glowY.setSize(this.glowX.width,this.glowX.height);
    this.mist.setSize(Math.max(1,Math.floor(w/2)),Math.max(1,Math.floor(h/2)));
    this.grade.uniforms.uPixel.value.set(1/w,1/h);
    this.grade.uniforms.uAspect.value=w/h;
  }
  render(scene: THREE.Scene,camera: THREE.PerspectiveCamera,time: number,journey: number,light: THREE.Vector3,breath: number,portals: readonly PortalGlow[]){
    this.renderer.setRenderTarget(this.source);this.renderer.render(scene,camera);
    this.vapor.uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);
    this.vapor.uniforms.uCameraWorld.value.copy(camera.matrixWorld);
    this.vapor.uniforms.uLightPosition.value.copy(light);
    this.vapor.uniforms.uMistLightColor.value.set('#e31332');
    this.vapor.uniforms.uTime.value=time;
    const indoor=THREE.MathUtils.smoothstep(journey,.82,1.14);
    const theater=THREE.MathUtils.smoothstep(journey,1.7,2.);
    const club=THREE.MathUtils.smoothstep(journey,2.55,2.95);
    const atmosphere=atmospherePresence(journey);
    this.vapor.uniforms.uDensity.value=(THREE.MathUtils.lerp(.014,.005,indoor)-.003*theater+.002*club)*atmosphere;
    this.vapor.uniforms.uBillowDensity.value=(THREE.MathUtils.lerp(.055,.009,indoor)-.003*theater+.018*club)*atmosphere;
    for(let i=0;i<2;i++){
      this.vapor.uniforms.uPortalInverse.value[i].copy(portals[i].object.matrixWorld).invert();
      this.vapor.uniforms.uPortalStrength.value[i]=portals[i].presence*(.82+breath*.25);
    }
    this.quad.material=this.vapor;
    this.renderer.setRenderTarget(this.mist);this.renderer.render(this.scene,this.camera);
    this.quad.material=this.blur;
    this.blur.uniforms.uTexture.value=this.source.texture;
    this.blur.uniforms.uExtract.value=1;
    this.blur.uniforms.uStep.value.set(2.7/this.glowX.width,0);
    this.renderer.setRenderTarget(this.glowX);this.renderer.render(this.scene,this.camera);
    this.blur.uniforms.uTexture.value=this.glowX.texture;
    this.blur.uniforms.uExtract.value=0;
    this.blur.uniforms.uStep.value.set(0,2.7/this.glowY.height);
    this.renderer.setRenderTarget(this.glowY);this.renderer.render(this.scene,this.camera);
    this.grade.uniforms.uTime.value=time;this.grade.uniforms.uJourney.value=journey;
    this.grade.uniforms.uBreath.value=breath;
    this.grade.uniforms.uAtmosphere.value=atmosphere;
    const projected=light.clone().project(camera);
    this.grade.uniforms.uLight.value.set(projected.x*.5+.5,projected.y*.5+.5);
    const cinema=THREE.MathUtils.smoothstep(journey,1.72,1.98)*(1-THREE.MathUtils.smoothstep(journey,2.4,2.65));
    this.grade.uniforms.uLightColor.value.set('#e31332').lerp(new THREE.Color('#85939f'),cinema);
    this.quad.material=this.grade;
    this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
  }
  destroy(){
    this.source.dispose();this.glowX.dispose();this.glowY.dispose();this.mist.dispose();this.volumeNoise.dispose();
    this.quad.geometry.dispose();this.blur.dispose();this.grade.dispose();this.vapor.dispose();
  }
}
