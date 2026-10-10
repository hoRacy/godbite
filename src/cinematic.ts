import * as THREE from 'three';

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
const film = /* glsl */ `
  uniform sampler2D uScene, uGlow;
  uniform vec2 uPixel, uLight;
  uniform vec3 uLightColor;
  uniform float uTime, uJourney, uAspect, uBreath;
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
    vec2 uv=clamp(vUv+vec2(sin(vUv.y*11.+uTime*.13),cos(vUv.x*7.-uTime*.08))*.00075*vapor*diffusion,.001,.999);
    float defocus=(.75+smoothstep(.12,.56,length(center)))*2.0*diffusion;
    vec2 px=uPixel*defocus;
    vec3 c=texture2D(uScene,uv).rgb*.38;
    c+=(texture2D(uScene,uv+vec2(px.x,0.)).rgb+texture2D(uScene,uv-vec2(px.x,0.)).rgb)*.16;
    c+=(texture2D(uScene,uv+vec2(0.,px.y)).rgb+texture2D(uScene,uv-vec2(0.,px.y)).rgb)*.15;
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
    c+=uLightColor*(aureole*(.035+.075*vapor)+shafts*.018*exp(-distanceToLight*3.)+exp(-abs(lightDelta.y)*120.)*exp(-abs(lightDelta.x)*2.5)*.018)*uBreath;
    float curtain=cloud(vUv*vec2(2.9,3.7)-flow*.6+4.3);
    c*=1.-smoothstep(.34,.83,curtain)*mix(.38,.09,gallery)*mix(1.,.8,cinema);
    c+=vec3(.013,.016,.021)*pow(vapor,2.)*(.7+uBreath*.3);
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
      uScene:{value:null},uGlow:{value:null},uPixel:{value:new THREE.Vector2()},
      uLight:{value:new THREE.Vector2(.5,.4)},uLightColor:{value:new THREE.Color('#bc092b')},
      uTime:{value:0},uJourney:{value:0},uAspect:{value:1},uBreath:{value:1},
    },
  });
  constructor(private renderer: THREE.WebGLRenderer){
    const type=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
    this.source=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:true});
    this.glowX=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    this.glowY=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
    this.quad.material.dispose();this.quad.frustumCulled=false;
    this.scene.add(this.quad);
    this.grade.uniforms.uScene.value=this.source.texture;
    this.grade.uniforms.uGlow.value=this.glowY.texture;
  }
  resize(width: number,height: number){
    const w=Math.max(1,Math.floor(width)),h=Math.max(1,Math.floor(height));
    this.source.setSize(w,h);
    this.glowX.setSize(Math.max(1,Math.floor(w/4)),Math.max(1,Math.floor(h/4)));
    this.glowY.setSize(this.glowX.width,this.glowX.height);
    this.grade.uniforms.uPixel.value.set(1/w,1/h);
    this.grade.uniforms.uAspect.value=w/h;
  }
  render(scene: THREE.Scene,camera: THREE.Camera,time: number,journey: number,light: THREE.Vector3,breath: number){
    this.renderer.setRenderTarget(this.source);this.renderer.render(scene,camera);
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
    const projected=light.clone().project(camera);
    this.grade.uniforms.uLight.value.set(projected.x*.5+.5,projected.y*.5+.5);
    const cinema=THREE.MathUtils.smoothstep(journey,1.72,1.98)*(1-THREE.MathUtils.smoothstep(journey,2.4,2.65));
    this.grade.uniforms.uLightColor.value.set('#e31332').lerp(new THREE.Color('#85939f'),cinema);
    this.quad.material=this.grade;
    this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
  }
  destroy(){
    this.source.dispose();this.glowX.dispose();this.glowY.dispose();
    this.quad.geometry.dispose();this.blur.dispose();this.grade.dispose();
  }
}
