import * as THREE from 'three';
import { asset, films, releases, liveConcert } from './content';
import { CinematicLens, type PortalGlow } from './cinematic';
import { cameraRoute, activeRecording, atmospherePresence, forestDoor, forestTreePosition, interiorLayout, interiorPoint, scenePresence, CAMERA_HEIGHT, RETREAT_LIMIT, liveFigurePosition } from './journey';

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
let seed = 17;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const surfaceVertex = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main(){
    vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
  }
`;
const waterFragment = /* glsl */ `
  uniform float uTime, uPresence; varying vec2 vUv;
  #include <fog_pars_fragment>
  void main(){
    vec2 p=vUv*45.; float ripples=sin(length(p-vec2(23.,17.))*5.-uTime*.45);
    float grain=sin(p.x*9.+sin(p.y*1.8+uTime*.13))*sin(p.y*11.+uTime*.12);
    float red=exp(-abs(p.x-22.5)*1.5)*(.28+.2*ripples);
    vec3 color=vec3(.018,.029,.027)+vec3(.12,.004,.012)*red+vec3(.014)*grain;
    gl_FragColor=vec4(color,.82*uPresence);
    #include <fog_fragment>
  }
`;
const dustVertex = /* glsl */ `
  uniform float uTime; varying float vAlpha;
  void main(){
    vec3 p=position;p.x+=sin(uTime*.08+p.y)*.3;p.y+=sin(uTime*.06+p.x)*.2;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(24./max(-mv.z,1.),1.,3.);vAlpha=clamp(1.-(-mv.z)/70.,0.,1.)*.28;
  }
`;
const dustFragment = /* glsl */ `
  varying float vAlpha;
  void main(){float r=length(gl_PointCoord-.5);gl_FragColor=vec4(.67,.72,.82,(1.-smoothstep(.1,.5,r))*vAlpha);}
`;

const clubDustVertex = /* glsl */ `
  uniform float uTime; attribute float aPhase;
  varying float vAlpha, vWarm;
  void main(){
    vec3 p=position;
    float phase=aPhase*6.2831853;
    p.x+=sin(uTime*.12+phase+p.z*.14)*.38;
    p.z+=cos(uTime*.09+phase+p.x*.18)*.3;
    // Slow upward drift wraps invisibly at the floor and ceiling.
    p.y=mod(p.y+uTime*(.035+aPhase*.025),8.);
    float edge=smoothstep(.2,1.,p.y)*(1.-smoothstep(6.8,7.8,p.y));
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(55./max(-mv.z,1.),1.4,4.);
    float glint=.65+.35*sin(uTime*.4+phase);
    vAlpha=edge*glint*.42*clamp(1.-(-mv.z)/48.,0.,1.);
    vWarm=1.-smoothstep(-8.,4.,p.x);
  }
`;
const clubDustFragment = /* glsl */ `
  uniform float uPresence; varying float vAlpha, vWarm;
  void main(){
    float r=length(gl_PointCoord-.5);
    float speck=exp(-r*r*26.)*(1.-smoothstep(.35,.5,r));
    vec3 color=mix(vec3(.62,.73,.87),vec3(.96,.76,.56),vWarm);
    gl_FragColor=vec4(color,speck*vAlpha*uPresence);
  }
`;

const threadVertex = /* glsl */ `
  uniform float uTime, uPhase, uDrift;
  varying float vPresence;
  void main(){
    vec3 p=position;
    float travel=p.z*.22+p.x*.14;
    p.x+=(sin(uTime*.16+uPhase+travel)*.75+sin(uTime*.09+p.y*.21+uPhase)*.42)*uDrift;
    p.y+=cos(uTime*.13+uPhase*1.3+p.x*.19)*.48*uDrift;
    p.z+=sin(uTime*.11+uPhase+p.y*.17)*.65*uDrift;
    vPresence=.76+sin(uTime*.18+uPhase+p.x*.09)*.24;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
  }
`;
const threadFragment = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity, uPresence; varying float vPresence;
  void main(){gl_FragColor=vec4(uColor,uOpacity*vPresence*uPresence);}
`;

const fireflyVertex = /* glsl */ `
  uniform float uTime; attribute float aPhase; varying float vLight;
  void main(){
    vec3 p=position;
    p.x+=sin(uTime*(.18+aPhase*.05)+aPhase*29.)*1.4;
    p.y+=sin(uTime*.31+aPhase*41.)*.65;
    p.z+=cos(uTime*.21+aPhase*19.)*1.6;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp(80./max(-mv.z,1.),2.,6.);
    vLight=.7+sin(uTime*.85+aPhase*31.)*.25;
  }
`;
const fireflyFragment = /* glsl */ `
  uniform float uPresence; varying float vLight;
  void main(){
    float r=length(gl_PointCoord-.5);
    float core=exp(-r*r*38.),halo=exp(-r*r*12.)*.3;
    gl_FragColor=vec4(1.8,1.1,.42,(core+halo)*vLight*uPresence);
  }
`;

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  onFailure: () => void;
  onRelease: (index: number) => void;
  onRecording?: (index: number) => void;
  onRetreat?: (progress: number) => void;
  onFilm?: () => void;
  onLiveScreen?: (bounds:{x:number;y:number;width:number;height:number}) => void;
  onSecretFigure?: (bounds:{x:number;y:number;width:number;height:number}|null) => void;
}
export class World {
  private renderer: THREE.WebGLRenderer;
  private lens: CinematicLens;
  private ritualGlow = new THREE.PointLight('#b10c2d', 75, 38, 1.7);
  private cinemaWash = new THREE.SpotLight('#a53e52', 780, 60, .95, 1, 1.8);
  private screenGlow = new THREE.PointLight('#a0abb7', 95, 40, 1.8);
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, .1, 210);
  private forest = new THREE.Group();
  private terrain = new THREE.Group();
  private interior = new THREE.Group();
  private forestVeil = new THREE.MeshBasicMaterial({color:'#130409',transparent:true,opacity:.84,depthWrite:false});
  private aperture = new THREE.Group();
  private exitGate = new THREE.Group();
  private portalGlows: PortalGlow[] = [{object:this.aperture,presence:0},{object:this.exitGate,presence:0}];
  private fadeMaterials = new Map<THREE.Group,Map<THREE.Material,number>>();
  private fadeLights = new Map<THREE.Group,Map<THREE.Light,number>>();
  private activeRecord = -1;
  private filmHoverControl = false;
  private filmHoverRay = false;
  private filmHover = 0;
  private ritual = new THREE.Group();
  private cinema = new THREE.Group();
  private live = new THREE.Group();
  private liveScreen!: THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
  private liveTextureLoading=false;
  private liveDrums=new THREE.Group();
  private livePlaying=false;
  private drumVisibility=1;
  private secretFigure=new THREE.Group();
  private signal = new THREE.Group();
  private timeMaterials: THREE.ShaderMaterial[] = [];
  private screens: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private screenFrame!: THREE.Mesh;
  private offerings: THREE.Mesh[] = [];
  private coverMaterials: THREE.MeshBasicMaterial[] = [];
  private reflections: THREE.MeshBasicMaterial[] = [];
  private filmTextures = new Map<string, THREE.Texture>();
  private coversLoaded = false;
  private targetProgress = 0;
  private progress = 0;
  private progressVelocity = 0;
  private secretStarted: number | null = null;
  private secretFading: number | null = null;
  private secretFinished?: () => void;
  private secretReturn?: {started:number;position:THREE.Vector3;rotation:THREE.Quaternion;targetRotation:THREE.Quaternion;done:()=>void};
  private secretLight = new THREE.PointLight('#bd153a',0,70,1.4);
  private pointer = new THREE.Vector2();
  private pointerTarget = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private timer = 0;
  private frame = 0;
  private lastTime = 0;
  private paused = false;
  private stopped = false;
  private lowQuality = false;
  private performanceFrames = 0;
  private performanceTime = 0;
  private hasMeasured = false;
  private whiteLight = new THREE.SpotLight('#adb8c5', 620, 95, .32, 1, 1.7);
  private redLight = new THREE.PointLight('#bf082c', 150, 42, 1.6);
  private beam: THREE.Mesh;
  private lastPointerDown = { x: 0, y: 0 };
  private hoveredRelease = -1;
  private options: WorldOptions;
  private capture = import.meta.env.DEV && new URLSearchParams(location.search).has('capture');

  constructor(options: WorldOptions) {
    this.options = options;
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas, alpha: false, antialias: innerWidth > 800,
      powerPreference: 'high-performance', preserveDrawingBuffer: this.capture,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .82;
    this.lens = new CinematicLens(this.renderer);
    this.scene.background = new THREE.Color('#020306');
    this.scene.fog = new THREE.FogExp2('#020306', .06);
    this.scene.add(new THREE.HemisphereLight('#a1acbf', '#030104', .14));
    this.whiteLight.position.set(-12, 20, 8);
    this.whiteLight.target.position.set(1, 2, -28);
    this.scene.add(this.whiteLight, this.whiteLight.target);
    this.redLight.position.set(0, 3, -24); this.scene.add(this.redLight);
    this.scene.add(this.secretLight);
    this.scene.add(this.forest,this.interior);
    this.forest.add(this.terrain);
    this.interior.add(this.ritual,this.cinema,this.live,this.signal,this.exitGate);
    this.makeForest();
    this.makeRitual();
    const layout=interiorLayout(innerWidth<800);
    this.makeDoor(this.exitGate,layout.cinemaX,layout.exitZ);
    this.beam = this.makeCinema();
    this.makeLive();
    this.makeSignal();
    this.makeDust();
    for(const group of [this.forest,this.terrain,this.ritual,this.cinema,this.live,this.signal,this.exitGate])this.prepareFade(group);
    this.prepareFade(this.liveDrums);
    this.resize();
    addEventListener('resize', this.resize);
    addEventListener('pointermove', this.movePointer, { passive: true });
    addEventListener('pointerdown', this.pointerDown, { passive: true });
    addEventListener('pointerup', this.pickOffering);
    document.addEventListener('visibilitychange', this.visibility);
    options.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.render(0);
  }

  private barkTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#969895'; ctx.fillRect(0,0,256,1024);
    for (let i=0;i<700;i++) {
      ctx.fillStyle = 'rgba(55,67,59,'+(random()*.19)+')';
      ctx.fillRect(random()*256, random()*1024, 1+random()*85, .4+random()*4);
    }
    for (let i=0;i<45;i++) {
      ctx.fillStyle='rgba(22,30,24,'+(.18+random()*.35)+')';
      const x=random()*230,y=random()*1024;
      ctx.fillRect(x,y,14+random()*45,2+random()*7);
      ctx.fillRect(x+4,y+3,random()*25,1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace; texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    return texture;
  }

  private makeForest() {
    const material = new THREE.MeshStandardMaterial({ map:this.barkTexture(), color:'#6d7479', roughness:1 });
    const trunkGeo = new THREE.CylinderGeometry(.1,.29,1,16,1);
    const branchGeo = new THREE.CylinderGeometry(.014,.065,1,8,1);
    const trunks = new THREE.InstancedMesh(trunkGeo,material,165);
    const branches = new THREE.InstancedMesh(branchGeo,material,660);
    const object = new THREE.Object3D();
    const up = new THREE.Vector3(0,1,0);
    let branchIndex=0;
    for (let i=0;i<165;i++) {
      let x=(random()-.5)*68;
      let z=i>=120?-38-random()*38:14-random()*82;
      if (Math.abs(x)<4.3) x+=(x<0?-1:1)*(5+random()*5);
      if(z< -28 && Math.abs(x)<17) x+=(x<0?-1:1)*15;
      if(i>=120)x=i%2===0?-8-random()*10:29+random()*10;
      [x,z]=forestTreePosition(x,z,i);
      const height=8+random()*13, width=.55+random()*1.05;
      object.position.set(x,height/2,z); object.rotation.set((random()-.5)*.055,random()*6,(random()-.5)*.09);
      object.scale.set(width,height,width); object.updateMatrix(); trunks.setMatrixAt(i,object.matrix);
      for(let j=0;j<4;j++){
        const start=new THREE.Vector3(x,height*(.4+random()*.4),z);
        const angle=random()*Math.PI*2;
        const length=1.1+random()*3;
        const end=start.clone().add(new THREE.Vector3(Math.cos(angle)*length,1.3+random()*2.8,Math.sin(angle)*length));
        const direction=end.clone().sub(start);
        object.position.copy(start).add(end).multiplyScalar(.5);
        object.quaternion.setFromUnitVectors(up,direction.clone().normalize());
        object.scale.set(width,direction.length(),width);object.updateMatrix();branches.setMatrixAt(branchIndex++,object.matrix);
      }
    }
    this.forest.add(trunks,branches);
    const groundMap=this.groundTexture();groundMap.repeat.y*=240/130;
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,240),new THREE.MeshStandardMaterial({map:groundMap,color:'#394039',roughness:1}));
    ground.rotation.x=-Math.PI/2;ground.position.set(0,-.06,31);this.terrain.add(ground);
    this.makeUndergrowth();
    const door=forestDoor(innerWidth<800);
    this.makeDoor(this.aperture,door.position[0],door.position[2]);
    this.aperture.rotation.y=door.rotation;
    const inside=new THREE.Mesh(new THREE.PlaneGeometry(2.4,6.9),this.forestVeil);
    inside.position.set(0,3.45,-.04);this.aperture.add(inside);
    this.forest.add(this.aperture);
    // Preserve the scenery's seed sequence after removing the seven mist cards.
    for(let i=0;i<21;i++)random();
  }

  private groundTexture(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#172019';ctx.fillRect(0,0,512,512);
    for(let i=0;i<9500;i++){
      ctx.fillStyle=i%3===0?'#263028':i%3===1?'#111612':'#302b21';
      const x=random()*512,y=random()*512;
      ctx.beginPath();ctx.ellipse(x,y,1+random()*6,.5+random()*2,random()*Math.PI,0,Math.PI*2);ctx.fill();
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(14,18);
    texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private makeUndergrowth(){
    // Bent blades and low, irregular shrubs share a handful of instanced draw calls.
    const blade=new THREE.BufferGeometry();
    blade.setAttribute('position',new THREE.Float32BufferAttribute([
      -.055,0,0,.055,0,0,-.035,.36,.035,.045,.36,.035,.12,.78,.10,
    ],3));
    blade.setIndex([0,1,2,1,3,2,2,3,4]);blade.computeVertexNormals();
    const grassMaterial=new THREE.MeshStandardMaterial({color:'#303d2c',roughness:1,side:THREE.DoubleSide});
    const grass=new THREE.InstancedMesh(blade,grassMaterial,6000),object=new THREE.Object3D();
    for(let patch=0;patch<240;patch++){
      let x=patch<80?-4+random()*34:(random()-.5)*64;
      const z=patch<80?-45-random()*17:19-random()*88;
      if(Math.abs(x)<3.2)x+=(x<0?-1:1)*4.2;
      for(let i=0;i<25;i++){
        object.position.set(x+(random()-.5)*3.1,0,z+(random()-.5)*3.1);
        object.rotation.set(0,random()*Math.PI*2,0);
        const height=.25+random()*.85;object.scale.set(.65+random()*.9,height,1);
        object.updateMatrix();grass.setMatrixAt(patch*25+i,object.matrix);
      }
    }
    const shrubGeometry=new THREE.IcosahedronGeometry(1,1),vertices=shrubGeometry.attributes.position;
    for(let i=0;i<vertices.count;i++){
      const ripple=1+.18*Math.sin(vertices.getX(i)*19+vertices.getZ(i)*13);
      vertices.setXYZ(i,vertices.getX(i)*ripple,vertices.getY(i)*ripple,vertices.getZ(i)*ripple);
    }
    shrubGeometry.computeVertexNormals();
    const shrubMaterial=new THREE.MeshStandardMaterial({color:'#18231d',roughness:1,flatShading:true});
    const shrubs=new THREE.InstancedMesh(shrubGeometry,shrubMaterial,240);
    const twigs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.035,1,5),new THREE.MeshStandardMaterial({color:'#22251f',roughness:1}),240);
    for(let patch=0;patch<60;patch++){
      let x=patch<25?-7+random()*40:(random()-.5)*62;
      const z=patch<25?-49-random()*15:10-random()*73;
      if(Math.abs(x)<5)x+=(x<0?-1:1)*6;
      const size=.5+random()*.9;
      for(let i=0;i<4;i++){
        object.position.set(x+(random()-.5)*2, .35+random()*.45,z+(random()-.5)*1.8);
        object.rotation.set(random()*.2,random()*6,random()*.2);
        object.scale.set(size*(.6+random()*.4),size*(.3+random()*.35),size*.7);
        object.position.y=object.scale.y*.82;
        object.updateMatrix();shrubs.setMatrixAt(patch*4+i,object.matrix);
        object.position.y=.45;object.rotation.z=(random()-.5)*.9;object.scale.set(1,.9+random()*.7,1);
        object.updateMatrix();twigs.setMatrixAt(patch*4+i,object.matrix);
      }
    }
    const rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),
      new THREE.MeshStandardMaterial({color:'#454842',roughness:1,flatShading:true}),100);
    for(let i=0;i<100;i++){
      object.position.set(-8+random()*42,.12,-45-random()*22);
      object.rotation.set(random(),random()*6,random());
      const size=.16+random()*.42;object.scale.set(size*1.5,size*.65,size);
      object.updateMatrix();rocks.setMatrixAt(i,object.matrix);
    }
    this.terrain.add(grass,shrubs,twigs,rocks);
  }

  private prepareFade(group:THREE.Group){
    const materials=new Map<THREE.Material,number>(),lights=new Map<THREE.Light,number>();
    group.traverse(object=>{
      if(object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line){
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          materials.set(material,material.opacity);material.transparent=true;
        }
      }
      if(object instanceof THREE.Light)lights.set(object,object.intensity);
    });
    this.fadeMaterials.set(group,materials);this.fadeLights.set(group,lights);
  }

  private setPresence(group:THREE.Group,presence:number){
    group.visible=presence>0;
    for(const [material,opacity] of this.fadeMaterials.get(group)!){
      if(material instanceof THREE.ShaderMaterial&&material.uniforms.uPresence)material.uniforms.uPresence.value=presence;
      else material.opacity=opacity*presence;
    }
    for(const [light,intensity] of this.fadeLights.get(group)!){
      const animated=light===this.ritualGlow||light===this.cinemaWash||light===this.screenGlow;
      light.intensity=(animated?light.intensity:intensity)*presence;
    }
  }

  private makeDoor(group:THREE.Group,x:number,z:number){
    group.position.set(x,0,z);
    const frameMaterial=new THREE.MeshBasicMaterial({color:'#a50c31',toneMapped:false,fog:false});
    for(const side of [-1.25,1.25]){
      const frame=new THREE.Mesh(new THREE.BoxGeometry(.065,7,.065),frameMaterial);
      frame.position.set(side,3.5,0);group.add(frame);
    }
    const top=new THREE.Mesh(new THREE.BoxGeometry(2.55,.045,.07),frameMaterial);
    top.position.set(0,7,0);group.add(top);
  }

  private makeRitual() {
    const water=new THREE.Mesh(new THREE.PlaneGeometry(110,160),new THREE.ShaderMaterial({
      vertexShader:surfaceVertex,fragmentShader:waterFragment,
      uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uPresence:{value:1}}]),
      transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true,
    }));
    water.rotation.x=-Math.PI/2;water.position.set(0,.02,-40);
    this.ritual.add(water);this.timeMaterials.push(water.material);
    const stoneMaterial=new THREE.MeshStandardMaterial({color:'#17171f',metalness:.28,roughness:.78});
    const edgeMaterial=new THREE.MeshBasicMaterial({color:'#817887',transparent:true,opacity:.2});
    for(let i=0;i<5;i++){
      const group=new THREE.Group();
      group.position.set((i-2)*4.4,0,-(2-Math.abs(i-2))*1.8);
      const stone=new THREE.Mesh(new THREE.BoxGeometry(2.65,6.4,.7),stoneMaterial);
      stone.position.y=3.2;stone.userData.release=i;this.offerings.push(stone);group.add(stone);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(stone.geometry),edgeMaterial);
      edges.position.copy(stone.position);group.add(edges);
      const coverMaterial=new THREE.MeshBasicMaterial({color:'#94878b'});
      this.coverMaterials.push(coverMaterial);
      const cover=new THREE.Mesh(new THREE.PlaneGeometry(2.3,2.3),coverMaterial);
      cover.position.set(0,4.48,.36);cover.userData.release=i;group.add(cover);
      const sigil=this.makeSigil(i);sigil.position.set(0,1.65,.38);group.add(sigil);
      const foot=new THREE.Mesh(new THREE.BoxGeometry(2.67,.035,.8),new THREE.MeshBasicMaterial({color:'#a52a3d'}));
      foot.position.set(0,.025,0);group.add(foot);
      this.ritual.add(group);
      const reflectedMaterial=coverMaterial.clone();
      reflectedMaterial.transparent=true;reflectedMaterial.opacity=.13;
      this.reflections.push(reflectedMaterial);
      const reflection=new THREE.Mesh(new THREE.PlaneGeometry(2.3,2.3),reflectedMaterial);
      reflection.position.set(group.position.x,-4.48,group.position.z+.36);
      reflection.scale.y=-1;this.ritual.add(reflection);
    }
    const glow=this.ritualGlow;glow.position.set(0,5,2);this.ritual.add(glow);
    const rim=new THREE.SpotLight('#a2aabb',820,50,.65,1,1.6);rim.position.set(-17,16,6);rim.target.position.set(0,3,-2);this.ritual.add(rim,rim.target);
    const fill=new THREE.SpotLight('#a7b4c5',780,38,.85,1,1.5);
    fill.position.set(10,12,9);fill.target.position.set(0,3,-2);this.ritual.add(fill,fill.target);
    this.makeFireflies();
  }

  private makeSigil(index: number) {
    const group=new THREE.Group();
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color('#ffd4b8').multiplyScalar(2.4),toneMapped:false,fog:false});
    const circle=[];
    for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;circle.push(new THREE.Vector3(Math.cos(a)*.44,Math.sin(a)*.44,0));}
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(circle),64,.014,5,false),material));
    const wireGeometry=new THREE.CylinderGeometry(.014,.014,1,6);
    for(let i=0;i<3+index;i++){
      const a=i/(3+index)*Math.PI*2;
      const start=new THREE.Vector3(Math.cos(a)*.62,Math.sin(a)*.62,0);
      const end=new THREE.Vector3(-Math.cos(a)*.27,-Math.sin(a)*.27,0),direction=end.clone().sub(start);
      const wire=new THREE.Mesh(wireGeometry,material);
      wire.position.copy(start).add(end).multiplyScalar(.5);
      wire.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
      wire.scale.y=direction.length();group.add(wire);
    }
    const spill=new THREE.PointLight('#ffc59a',14,3.8,1.25);
    spill.position.z=.5;group.add(spill);return group;
  }

  private makeFireflies(){
    const positions=new Float32Array(120*3),phases=new Float32Array(120);
    for(let i=0;i<120;i++){
      positions[i*3]=(random()-.5)*25;positions[i*3+1]=.65+random()*6;
      positions[i*3+2]=(random()-.5)*16;phases[i]=random();
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('aPhase',new THREE.BufferAttribute(phases,1));
    const material=new THREE.ShaderMaterial({
      vertexShader:fireflyVertex,fragmentShader:fireflyFragment,uniforms:{uTime:{value:0},uPresence:{value:1}},
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    });
    this.timeMaterials.push(material);
    const swarm=new THREE.Points(geometry,material);swarm.frustumCulled=false;this.ritual.add(swarm);
  }

  private makeCinema() {
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(46,42),new THREE.MeshStandardMaterial({color:'#090b0a',roughness:.6}));
    floor.rotation.x=-Math.PI/2;floor.position.z=13;this.cinema.add(floor);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(12.5,7.2,.35),new THREE.MeshStandardMaterial({color:'#201d19',roughness:.6}));
    frame.position.set(0,CAMERA_HEIGHT,0);this.cinema.add(frame);
    this.screenFrame=frame;
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(11.73,6.6),new THREE.MeshBasicMaterial({color:'#ffffff'}));
    screen.position.set(0,CAMERA_HEIGHT,.2);this.cinema.add(screen);this.screens.push(screen);
    const curtainMaterial=new THREE.MeshStandardMaterial({color:'#47111f',roughness:.96});
    for(const x of [-12.4,12.4]){
      const geometry=new THREE.PlaneGeometry(8.4,22,64,1);
      const positions=geometry.attributes.position;
      for(let i=0;i<positions.count;i++)positions.setZ(i,Math.sin(positions.getX(i)*3.8)*.36);
      geometry.computeVertexNormals();
      const curtain=new THREE.Mesh(geometry,curtainMaterial);curtain.position.set(x,8,-.2);this.cinema.add(curtain);
    }
    // Low side light catches velvet folds without flattening the auditorium.
    for(const x of [-11.5,11.5]){
      const glow=new THREE.SpotLight('#bf3654',520,32,.5,1,1.55);
      glow.position.set(Math.sign(x)*7.8,3.2,4.2);glow.target.position.set(x,8,-.2);
      this.cinema.add(glow,glow.target);
    }
    const backWall=new THREE.Mesh(new THREE.PlaneGeometry(40,22),new THREE.MeshStandardMaterial({color:'#0b0608',roughness:1}));
    backWall.position.set(0,8,-.7);this.cinema.add(backWall);
    const shape=new THREE.Shape();
    shape.moveTo(-.44,0);shape.lineTo(.44,0);shape.lineTo(.44,.65);
    shape.quadraticCurveTo(.44,1,0,1);shape.quadraticCurveTo(-.44,1,-.44,.65);shape.closePath();
    const backGeometry=new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:true,bevelThickness:.05,bevelSize:.05,bevelSegments:2,steps:1,curveSegments:5});
    const seatsMaterial=new THREE.MeshStandardMaterial({color:'#281019',roughness:.88});
    const backrests=new THREE.InstancedMesh(backGeometry,seatsMaterial,84);
    const cushions=new THREE.InstancedMesh(new THREE.BoxGeometry(.88,.16,.85),seatsMaterial,84);
    const object=new THREE.Object3D();let count=0;
    for(let row=0;row<7;row++){
      for(let column=0;column<12;column++){
        const x=(column-5.5)*1.3+(column<6?-.8:.8),z=7+row*2.15;
        object.position.set(x,.42+row*.07,z);object.rotation.set(0,Math.PI,0);object.scale.set(1,1,1);object.updateMatrix();backrests.setMatrixAt(count,object.matrix);
        object.position.set(x,.38+row*.07,z-.45);object.rotation.set(0,0,0);object.updateMatrix();cushions.setMatrixAt(count,object.matrix);count++;
      }
    }
    this.cinema.add(backrests,cushions);
    const seatRim=new THREE.SpotLight('#a29dac',1050,40,.95,1,1.45);
    seatRim.position.set(-8,7,25);seatRim.target.position.set(1,1,11);
    this.cinema.add(seatRim,seatRim.target);
    for(const x of [-1.2,1.2]){
      const aisle=new THREE.Mesh(new THREE.BoxGeometry(.025,.018,23),new THREE.MeshBasicMaterial({color:'#a5293c'}));
      aisle.position.set(x,.02,15);this.cinema.add(aisle);
    }
    const wash=this.cinemaWash;wash.position.set(0,16,13);wash.target.position.set(0,1,8);this.cinema.add(wash,wash.target);
    const screenGlow=this.screenGlow;screenGlow.position.set(0,6,4);this.cinema.add(screenGlow);
    const beamMaterial=new THREE.MeshBasicMaterial({color:'#91a0b3',transparent:true,opacity:.009,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,8.5,28,24,1,true),beamMaterial);
    beam.position.set(0,7,14);beam.rotation.x=Math.PI/2;this.cinema.add(beam);
    return beam;
  }

  private makeLive(){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const paint=canvas.getContext('2d')!;paint.fillStyle='#383431';paint.fillRect(0,0,512,512);
    for(let i=0;i<2400;i++){
      paint.fillStyle=i%3===0?'#17191a':i%3===1?'#55514b':'#272320';
      paint.fillRect(random()*512,random()*512,1+random()*13,1+random()*38);
    }
    for(let i=0;i<25;i++){
      paint.strokeStyle='#121416';paint.lineWidth=1+random()*2;paint.beginPath();
      const x=random()*512,y=random()*512;paint.moveTo(x,y);paint.lineTo(x+random()*35,y+80);paint.stroke();
    }
    const grime=new THREE.CanvasTexture(canvas);grime.colorSpace=THREE.SRGBColorSpace;grime.wrapS=grime.wrapT=THREE.RepeatWrapping;grime.repeat.set(3,2);
    const wall=new THREE.MeshStandardMaterial({map:grime,color:'#49433f',roughness:.98});
    const metal=new THREE.MeshStandardMaterial({color:'#161b1e',roughness:.65,metalness:.6});
    const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);this.live.add(mesh);return mesh;
    };
    box(0,-.14,16,32,.25,54,new THREE.MeshStandardMaterial({map:this.groundTexture(),color:'#3b3530',roughness:.76,metalness:.12}));
    box(0,5,-5,32,10,.4,wall);box(-16,5,16,.4,10,44,wall);box(16,5,16,.4,10,44,wall);
    box(0,10,15,32,.4,44,metal);
    box(0,.42,0,22,.84,8,new THREE.MeshStandardMaterial({map:grime,color:'#282420',roughness:.94}));
    box(0,.1,5.1,10,.2,2,metal);box(0,.23,4.2,10,.26,1,metal);
    const frame=box(0,4.4,-3,12.2,6.9,.35,metal);
    this.liveScreen=new THREE.Mesh(new THREE.PlaneGeometry(11.6,6.525),new THREE.MeshBasicMaterial({color:'#777777'}));
    this.liveScreen.position.set(0,4.4,frame.position.z+.2);this.live.add(this.liveScreen);
    // Empty instruments, cables and battered speaker stacks leave the stage ready for a show.
    const speaker=new THREE.MeshStandardMaterial({color:'#101315',roughness:.97});
    for(const side of [-1,1]){
      for(let level=0;level<3;level++){
        box(side*12.1,1.15+level*1.9,1,2.3,1.85,1.6,speaker);
        const cone=new THREE.Mesh(new THREE.CircleGeometry(.54,24),metal);cone.position.set(side*12.1,1.15+level*1.9,1.81);this.live.add(cone);
      }
      box(side*7,1.6,-.8,2.6,1.6,1.1,speaker);
      box(side*7,2.55,-.8,2.3,.3,.85,metal);
      box(side*14.2,1.6,22,2.4,3.2,1.3,metal);
    }
    this.makeDrums();this.makeSecretFigure();
    for(const x of [-4,4]){
      box(x,2.05,2.5,.035,2.5,.035,metal);box(x,.9,2.5,.8,.04,.6,metal);
      const mic=box(x,3.35,2.5,.06,.07,.5,metal);mic.rotation.y=.35;
    }
    const wire=new THREE.LineBasicMaterial({color:'#090b0d'});
    for(let i=0;i<9;i++){
      const points=Array.from({length:24},(_,j)=>new THREE.Vector3((i-4)*1.6+Math.sin(j*.6+i)*.6,.86,j*.17-1));
      this.live.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),wire));
    }
    for(const side of [-1,1]){
      box(side*5,8.3,0,8.8,.16,.18,metal);
      for(let i=0;i<3;i++){
        const x=side*(3+i*3.2),color=side<0?'#d13a29':'#658da0';
        box(x,8,0,.5,.48,.5,metal);
        const light=new THREE.SpotLight(color,1250,45,.34,.65,1.4);
        light.position.set(x,7.7,.2);light.target.position.set(x*.25,.7,6+i*3);this.live.add(light,light.target);
        const direction=light.target.position.clone().sub(light.position);
        const beam=new THREE.Mesh(new THREE.CylinderGeometry(.09,2.4,direction.length(),20,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.028,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
        beam.position.copy(light.position).add(light.target.position).multiplyScalar(.5);beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize().negate());this.live.add(beam);
      }
    }
    const fill=new THREE.SpotLight('#d79a67',900,45,1,1,1.45);fill.position.set(-5,8,17);fill.target.position.set(0,1,0);this.live.add(fill,fill.target);
    const screenLight=new THREE.PointLight('#7d8eaf',180,30,1.65);screenLight.position.set(0,5,0);this.live.add(screenLight);
    const red=new THREE.PointLight('#a12529',180,30,1.6);red.position.set(12,3,12);this.live.add(red);
    const litter=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.2,.1),new THREE.MeshStandardMaterial({color:'#73695b',roughness:.9}),70),object=new THREE.Object3D();
    for(let i=0;i<70;i++){object.position.set((random()-.5)*28,.08,7+random()*30);object.rotation.set(random()*2,random()*6,random());object.updateMatrix();litter.setMatrixAt(i,object.matrix);}this.live.add(litter);
    this.makeClubDust();
  }

  private makeClubDust(){
    let dustSeed=93;
    const dustRandom=()=>{dustSeed=(dustSeed*16807)%2147483647;return (dustSeed-1)/2147483646;};
    const count=240,positions=new Float32Array(count*3),phases=new Float32Array(count);
    for(let i=0;i<count;i++){
      positions[i*3]=(dustRandom()-.5)*27;positions[i*3+1]=dustRandom()*8;
      positions[i*3+2]=2+dustRandom()*32;phases[i]=dustRandom();
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('aPhase',new THREE.BufferAttribute(phases,1));
    const material=new THREE.ShaderMaterial({
      vertexShader:clubDustVertex,fragmentShader:clubDustFragment,
      uniforms:{uTime:{value:0},uPresence:{value:1}},
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    });
    const dust=new THREE.Points(geometry,material);dust.name='club-dust';dust.frustumCulled=false;
    this.timeMaterials.push(material);this.live.add(dust);
  }

  private makeDrums(){
    const kit=this.liveDrums;this.live.add(kit);
    const chrome=new THREE.MeshStandardMaterial({color:'#a9a8a2',roughness:.3,metalness:.88});
    const shell=new THREE.MeshStandardMaterial({color:'#481a22',roughness:.37,metalness:.3});
    const skin=new THREE.MeshStandardMaterial({color:'#b0aa98',roughness:.82,side:THREE.DoubleSide});
    const darkSkin=new THREE.MeshStandardMaterial({color:'#181b1d',roughness:.78,side:THREE.DoubleSide});
    const bronze=new THREE.MeshStandardMaterial({color:'#ac864d',roughness:.38,metalness:.85,side:THREE.DoubleSide});
    const felt=new THREE.MeshStandardMaterial({color:'#131315',roughness:1});
    const rod=(group:THREE.Group,a:THREE.Vector3,b:THREE.Vector3,r=.025,material:THREE.Material=chrome)=>{
      const direction=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,direction.length(),10),material);
      mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());group.add(mesh);
    };
    const tripod=(x:number,z:number,height:number)=>{
      rod(kit,new THREE.Vector3(x,.89,z),new THREE.Vector3(x,height,z));
      for(let i=0;i<3;i++){
        const angle=i*Math.PI*2/3;
        rod(kit,new THREE.Vector3(x,1.18,z),new THREE.Vector3(x+Math.cos(angle)*.43,.88,z+Math.sin(angle)*.43),.018);
      }
    };
    const drum=(radius:number,depth:number,material:THREE.Material,headMaterial=skin)=>{
      const group=new THREE.Group();
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,depth,40,1,true),material));
      for(const side of [-1,1]){
        const head=new THREE.Mesh(new THREE.CircleGeometry(radius-.025,40),headMaterial);
        head.rotation.x=-side*Math.PI/2;head.position.y=side*(depth/2+.008);group.add(head);
        const rim=new THREE.Mesh(new THREE.TorusGeometry(radius,.025,8,40),chrome);
        rim.rotation.x=Math.PI/2;rim.position.y=side*(depth/2+.022);group.add(rim);
      }
      for(let i=0;i<8;i++){
        const angle=i*Math.PI/4,x=Math.cos(angle)*(radius+.015),z=Math.sin(angle)*(radius+.015);
        rod(group,new THREE.Vector3(x,-depth*.38,z),new THREE.Vector3(x,depth*.38,z),.016);
        for(const side of [-1,1]){
          const lug=new THREE.Mesh(new THREE.BoxGeometry(.07,.1,.07),chrome);lug.position.set(x,side*depth*.3,z);group.add(lug);
        }
      }
      return group;
    };
    const bass=drum(.82,.9,shell,darkSkin);bass.rotation.x=Math.PI/2;bass.position.set(0,1.7,.5);kit.add(bass);
    const port=new THREE.Mesh(new THREE.CircleGeometry(.17,24),felt);port.position.set(-.32,1.41,.975);kit.add(port);
    for(const side of [-1,1])rod(kit,new THREE.Vector3(side*.65,1.32,.63),new THREE.Vector3(side*.99,.87,.98),.035);
    const snare=drum(.4,.26,chrome);snare.position.set(.95,1.92,-.55);snare.rotation.x=.08;kit.add(snare);tripod(.95,-.55,1.77);
    // Keep the rack tom on its mount, with the playing head tilted toward the drummer.
    const tom=drum(.43,.5,shell);tom.position.set(-.12,2.62,.2);tom.rotation.x=-.22;kit.add(tom);
    rod(kit,new THREE.Vector3(0,2.18,.5),new THREE.Vector3(0,2.64,.5),.035);
    rod(kit,new THREE.Vector3(0,2.64,.5),new THREE.Vector3(-.12,2.64,.2),.03);
    const floor=drum(.54,.72,shell);floor.position.set(-1.18,1.67,-.5);kit.add(floor);
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3,x=-1.18-Math.cos(angle)*.57,z=-.5+Math.sin(angle)*.57;
      rod(kit,new THREE.Vector3(x,1.74,z),new THREE.Vector3(x,1.03,z),.024);
      rod(kit,new THREE.Vector3(x,1.03,z),new THREE.Vector3(x-Math.cos(angle)*.13,.87,z+Math.sin(angle)*.13),.024);
    }
    // A cymbal is a curved sheet with a raised bell, shoulder and thin rolled edge.
    const cymbal=(radius:number)=>{
      const profile=[[.018,.18],[.065,.18],[.12,.17],[.19,.13],[.26,.075],[.36,.048],[.55,.028],[.76,.014],[.94,0],[1,-.006]];
      const group=new THREE.Group();
      group.add(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r*radius,y*radius)),64),bronze));
      const edge=new THREE.Mesh(new THREE.TorusGeometry(radius,.007,6,64),bronze);edge.rotation.x=Math.PI/2;edge.position.y=-.006*radius;group.add(edge);
      const washer=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.028,16),felt);washer.position.y=.18*radius+.012;group.add(washer);
      return group;
    };
    for(const [x,z,y,r,tilt] of [[1.65,-.3,3.18,.76,.12],[-1.85,-.35,2.95,.9,-.18]]){
      tripod(x,z,y);const disc=cymbal(r);disc.position.set(x,y,z);disc.rotation.z=tilt;kit.add(disc);
      rod(disc,new THREE.Vector3(0,0,0),new THREE.Vector3(0,.18*r+.075,0),.018);
    }
    const hiX=1.45,hiZ=-1.25,hiY=2.34;tripod(hiX,hiZ,hiY+.14);
    const hiTop=cymbal(.45);hiTop.position.set(hiX,hiY+.055,hiZ);kit.add(hiTop);
    const hiBottom=cymbal(.45);hiBottom.rotation.x=Math.PI;hiBottom.position.set(hiX,hiY-.025,hiZ);kit.add(hiBottom);
    rod(kit,new THREE.Vector3(hiX,.91,hiZ),new THREE.Vector3(hiX,.91,hiZ+.5),.05,felt);
    const pedal=new THREE.Mesh(new THREE.BoxGeometry(.16,.04,.38),chrome);pedal.position.set(hiX,.93,hiZ+.36);pedal.rotation.x=-.12;kit.add(pedal);
    const stool=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.12,24),felt);stool.position.set(-.1,1.49,-1.3);kit.add(stool);tripod(-.1,-1.3,1.43);
  }

  private makeSecretFigure(){
    const cloth=new THREE.MeshStandardMaterial({color:'#252a32',roughness:1,emissive:'#35414e',emissiveIntensity:.48});
    const add=(geometry:THREE.BufferGeometry,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{
      const mesh=new THREE.Mesh(geometry,cloth);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);this.secretFigure.add(mesh);return mesh;
    };
    const coatProfile=[[.27,.65],[.32,1],[.25,1.7],[.39,2.16],[.27,2.27],[.12,2.34]];
    add(new THREE.LatheGeometry(coatProfile.map(([r,y])=>new THREE.Vector2(r,y)),24),0,0,0,1,1,.58);
    add(new THREE.SphereGeometry(.22,20,16),0,2.57,-.035,.88,1.35,.88);
    // The nape and coat seam face the viewer; the figure looks toward the wall.
    add(new THREE.CylinderGeometry(.09,.1,.18,12),0,2.32,0);
    for(const side of [-1,1]){
      const arm=add(new THREE.CapsuleGeometry(.085,.84,4,12),side*.36,1.65,.015);arm.rotation.z=side*.07;
      add(new THREE.CapsuleGeometry(.08,.59,4,12),side*.14,.43,0);
      add(new THREE.SphereGeometry(.1,12,8),side*.14,.075,-.05,1,.6,1.65);
    }
    this.secretFigure.rotation.y=.16;this.live.add(this.secretFigure);
  }

  private makeSignal() {
    for(let i=0;i<36;i++){
      const points=[];
      const phase=random()*Math.PI*2, radius=3+random()*13;
      for(let j=0;j<9;j++){
        const angle=phase+j*.65;
        points.push(new THREE.Vector3(Math.cos(angle)*radius+(random()-.5)*3,Math.sin(angle)*radius*.6+CAMERA_HEIGHT,-random()*12));
      }
      const curve=new THREE.CatmullRomCurve3(points);
      const material=new THREE.ShaderMaterial({
        vertexShader:threadVertex,fragmentShader:threadFragment,transparent:true,depthWrite:false,
        uniforms:{
          uTime:{value:0},uPresence:{value:1},uPhase:{value:phase},uDrift:{value:.65+random()*.8},
          uColor:{value:new THREE.Color(i%4===0?'#c22f51':'#b3acb1')},uOpacity:{value:i%4===0?.48:.23},
        },
      });
      const thread=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(80)),material);
      thread.frustumCulled=false;
      this.timeMaterials.push(material);this.signal.add(thread);
    }
    const blade=new THREE.Mesh(new THREE.PlaneGeometry(20,.065),new THREE.MeshBasicMaterial({color:'#dc2442',toneMapped:false}));
    blade.position.set(0,CAMERA_HEIGHT,-13);this.signal.add(blade);
  }

  private makeDust() {
    const geometry=new THREE.BufferGeometry(), positions=new Float32Array(1800);
    for(let i=0;i<600;i++){positions[i*3]=(random()-.5)*40;positions[i*3+1]=random()*16;positions[i*3+2]=16-random()*180;}
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material=new THREE.ShaderMaterial({vertexShader:dustVertex,fragmentShader:dustFragment,uniforms:{uTime:{value:0}},transparent:true,depthWrite:false});
    this.timeMaterials.push(material);this.scene.add(new THREE.Points(geometry,material));
  }

  private loadCovers() {
    if(this.coversLoaded)return;this.coversLoaded=true;
    const loader=new THREE.TextureLoader();
    releases.forEach((release,index)=>{
      loader.load(asset('images/cover-'+release.cover+'.webp'),texture=>{
        texture.colorSpace=THREE.SRGBColorSpace;
        texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
        this.coverMaterials[index].map=texture;this.coverMaterials[index].needsUpdate=true;
        this.reflections[index].map=texture;this.reflections[index].needsUpdate=true;
      },undefined,()=>{/* The HTML recording selector remains available if an image fails. */});
    });
  }

  selectFilm(id: string) {
    const film=films.find(item=>item.id===id);if(!film)return;
    this.selectedFilm=id;
    const apply=(texture: THREE.Texture)=>{
      for(const screen of this.screens){screen.material.map=texture;screen.material.color.setScalar(1.05);screen.material.needsUpdate=true;}
      if(this.paused)this.draw();
    };
    const cached=this.filmTextures.get(id);
    if(cached){apply(cached);return;}
    new THREE.TextureLoader().load(asset('images/film-'+film.youtubeId+'.webp'),texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;this.filmTextures.set(id,texture);
      // A slower response for a previously selected film must not replace the current one.
      if(this.selectedFilm===id)apply(texture);
    },undefined,()=>{});
    this.selectedFilm=id;
  }
  private selectedFilm='social-media-girls';
  setFilmHovered(hovered:boolean){this.filmHoverControl=hovered;}

  setSecretPlaying(playing: boolean){
    this.secretStarted=playing?performance.now():null;
    this.secretFading=null;this.secretFinished=undefined;
    this.secretReturn=undefined;
    if(playing){this.targetProgress=this.progress;this.progressVelocity=0;}
    if(!playing){this.secretLight.intensity=0;this.renderer.toneMappingExposure=.82;}
  }
  finishSecretEffect(done: () => void){
    if(this.secretStarted===null){done();return;}
    this.secretFading=performance.now();this.secretFinished=done;
  }
  beginReturnToStart(done: () => void){
    const start=cameraRoute(0,innerWidth<800),view=this.camera.clone();
    view.position.fromArray(start.position);view.lookAt(new THREE.Vector3().fromArray(start.target));
    this.secretReturn={started:performance.now(),position:this.camera.position.clone(),
      rotation:this.camera.quaternion.clone(),targetRotation:view.quaternion.clone(),done};
  }
  returnToStart(){
    this.setSecretPlaying(false);
    this.targetProgress=0;this.progress=0;this.progressVelocity=0;
    this.pointer.set(0,0);this.pointerTarget.set(0,0);
  }
  setProgress(progress: number) {
    if(this.secretStarted!==null||this.secretReturn)return;
    this.targetProgress=clamp(progress,RETREAT_LIMIT,4);
    if(this.capture){this.progress=this.targetProgress;this.progressVelocity=0;}
    if(progress>2.25&&!this.liveTextureLoading){
      this.liveTextureLoading=true;
      new THREE.TextureLoader().load(asset('images/film-'+liveConcert.youtubeId+'.webp'),texture=>{
        texture.colorSpace=THREE.SRGBColorSpace;this.liveScreen.material.map=texture;this.liveScreen.material.color.setScalar(1.05);this.liveScreen.material.needsUpdate=true;
        if(this.paused)this.draw();
      });
    }
    if(progress>.18)this.loadCovers();
    if(progress>1.25 && !this.filmTextures.size)this.selectFilm(this.selectedFilm);
    if(this.paused)this.draw();
  }
  setPaused(paused: boolean) { this.paused=paused; }
  setLivePlaying(playing:boolean){this.livePlaying=playing;}
  private resize=()=>{
    this.camera.aspect=innerWidth/innerHeight;
    this.camera.fov=innerWidth<800?58:44;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.lowQuality?.7:innerWidth<800?1:1.3));
    this.renderer.setSize(innerWidth,innerHeight,false);
    const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());this.lens.resize(size.x,size.y);
    if(this.paused)this.draw();
  };
  private movePointer=(event: PointerEvent)=>{
    if(event.pointerType!=='mouse')return;
    this.pointerTarget.set(event.clientX/innerWidth-.5,event.clientY/innerHeight-.5);
    const interactive=event.target instanceof Element && event.target.closest('a,button,dialog,header,footer');
    this.filmHoverRay=false;
    if(this.progress>1.06 && this.progress<1.78 && !interactive){
      this.raycaster.setFromCamera(new THREE.Vector2(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1),this.camera);
      const offering=this.raycaster.intersectObjects(this.offerings)[0];
      this.hoveredRelease=offering?offering.object.userData.release as number:-1;
      document.body.style.cursor=offering?'pointer':'';
    }else{
      this.hoveredRelease=-1;
      if(this.progress>1.85&&this.progress<2.4&&!interactive){
        this.raycaster.setFromCamera(new THREE.Vector2(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1),this.camera);
        this.filmHoverRay=this.raycaster.intersectObjects(this.screens).length>0;
      }
      document.body.style.cursor=this.filmHoverRay?'pointer':'';
    }
  };
  private pointerDown=(event: PointerEvent)=>{this.lastPointerDown={x:event.clientX,y:event.clientY};};
  private pickOffering=(event: PointerEvent)=>{
    if(event.target instanceof Element && event.target.closest('a,button,dialog,header,footer'))return;
    if(Math.hypot(event.clientX-this.lastPointerDown.x,event.clientY-this.lastPointerDown.y)>8)return;
    this.raycaster.setFromCamera(new THREE.Vector2(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1),this.camera);
    if(this.progress>1.06&&this.progress<1.78){
      const hit=this.raycaster.intersectObjects(this.offerings)[0];
      if(hit)this.options.onRelease(hit.object.userData.release as number);
    }else if(this.progress>1.85&&this.progress<2.4&&this.raycaster.intersectObjects(this.screens).length){
      this.options.onFilm?.();
    }
  };
  private visibility=()=>{this.lastTime=0;};
  private contextLost=(event: Event)=>{event.preventDefault();this.destroy();this.options.onFailure();};

  private draw() {
    const p=this.progress,mobile=innerWidth<800,route=cameraRoute(p,mobile);
    this.options.onRetreat?.(p);
    const layout=interiorLayout(mobile),door=forestDoor(mobile);
    this.interior.position.fromArray(layout.origin);this.interior.rotation.y=layout.rotation;
    this.ritual.position.set(layout.galleryCenterX,0,0);this.ritual.scale.setScalar(layout.scale);
    const cinemaScale=mobile?.7:1;
    this.cinema.position.set(layout.cinemaX,0,layout.cinemaZ);this.cinema.scale.setScalar(cinemaScale);
    this.screenFrame.position.y=CAMERA_HEIGHT/cinemaScale;
    for(const screen of this.screens)screen.position.y=CAMERA_HEIGHT/cinemaScale;
    this.signal.position.set(layout.cinemaX,0,layout.signalZ);
    this.live.position.set(layout.cinemaX,0,layout.liveZ);
    this.secretFigure.position.fromArray(liveFigurePosition(mobile));
    this.exitGate.position.set(layout.cinemaX,0,layout.exitZ);
    this.aperture.position.fromArray(door.position);this.aperture.rotation.y=door.rotation;
    this.redLight.position.set(door.position[0],3,door.position[2]+1);
    this.camera.position.fromArray(route.position);
    const target=new THREE.Vector3().fromArray(route.target);
    target.x+=this.pointer.x*.85*route.lookAround;target.y-=this.pointer.y*.45*route.lookAround;
    this.camera.lookAt(target);
    if(this.secretStarted!==null){
      const t=(performance.now()-this.secretStarted)/1000;
      const fade=this.secretFading===null?0:clamp((performance.now()-this.secretFading)/1200,0,1);
      const strength=1-fade*fade*(3-2*fade);
      const spinTime=this.secretFading===null?t:(this.secretFading-this.secretStarted)/1000+1.2*(fade-fade*fade/2);
      this.camera.rotateY(spinTime*18);
      this.camera.rotateX(Math.sin(t*11)*.65*strength);
      this.camera.rotateZ(Math.sin(t*7)*.85*strength);
      const surge=Math.pow(Math.max(0,Math.sin(t*15+Math.sin(t*6)*2)),3);
      this.secretLight.position.copy(this.camera.position).add(new THREE.Vector3(Math.sin(t*9)*8,2,Math.cos(t*13)*8));
      this.secretLight.color.set(Math.sin(t*4)>.2?'#71303b':'#53616b');
      this.secretLight.intensity=(220+surge*1100)*strength;
      this.renderer.toneMappingExposure=.82+(-.12+surge*.65)*strength;
    }
    if(this.secretReturn){
      const returning=this.secretReturn,t=clamp((performance.now()-returning.started)/2200,0,1);
      const blend=t*t*t*(10+t*(-15+6*t));
      const start=cameraRoute(0,mobile);
      this.camera.position.copy(returning.position).lerp(new THREE.Vector3().fromArray(start.position),blend);
      this.camera.quaternion.copy(returning.rotation).slerp(returning.targetRotation,blend);
    }
    const presence=scenePresence(p),forestFade=presence.forest;
    const breath=.68+Math.sin(this.timer*.22)*.17+Math.sin(this.timer*.73+.8)*.095
      +Math.pow(Math.max(0,Math.sin(this.timer*3.1)),8)*.15;
    const fog=this.scene.fog as THREE.FogExp2;
    // Distant surfaces must disappear into the background, not reveal room-sized rectangles.
    fog.color.copy(this.scene.background as THREE.Color);
    fog.density=THREE.MathUtils.lerp(.061,.019,smooth(p,1.76,2.04))*(1+Math.sin(this.timer*.12)*.035);
    fog.density+=.012*presence.live;
    fog.density*=atmospherePresence(p);
    this.whiteLight.intensity=620*forestFade*(.64+breath*.48);
    this.whiteLight.target.position.set(Math.sin(this.timer*.085)*12,3,-27+Math.sin(this.timer*.12)*4);
    this.redLight.intensity=150*forestFade*breath;
    this.ritualGlow.intensity=145*(.86+breath*.14);
    const recording=activeRecording(p);
    if(recording!==this.activeRecord&&p>1.06&&p<1.78){this.activeRecord=recording;this.options.onRecording?.(recording);}
    this.coverMaterials.forEach((material,index)=>{
      const reveal=.9+Math.sin(this.timer*.15+index*.92)*.025;
      material.color.setScalar(this.hoveredRelease===index||this.activeRecord===index?1.05:reveal);
    });
    this.cinemaWash.intensity=930*(.8+breath*.2);
    this.screenGlow.intensity=125*(.93+Math.sin(this.timer*.91)*.05);
    const hovered=(this.filmHoverControl||this.filmHoverRay)&&p>1.85&&p<2.4;
    this.filmHover=THREE.MathUtils.lerp(this.filmHover,hovered?1:0,.09);
    const filmFrame=Math.floor(this.timer*18),flutter=Math.sin(filmFrame*7.19)*.04+Math.sin(this.timer*11.3)*.025;
    for(const screen of this.screens){
      screen.material.color.setScalar(1.05+this.filmHover*flutter);
      const texture=screen.material.map;
      if(texture){texture.repeat.set(1+.012*this.filmHover,1+.012*this.filmHover);texture.offset.set(this.filmHover*(-.006+Math.sin(filmFrame*3.7)*.002),this.filmHover*(-.006+Math.sin(filmFrame*5.3)*.002));}
    }
    this.setPresence(this.forest,presence.forest);
    // The planted forest floor continues through the whole recording gallery.
    this.setPresence(this.terrain,presence.forest);
    this.setPresence(this.ritual,presence.gallery);
    this.setPresence(this.cinema,presence.cinema);
    this.setPresence(this.live,presence.live);
    this.setPresence(this.liveDrums,presence.live*smooth(this.drumVisibility,0,1));
    if(p>2.6&&p<3.6){
      this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld();
      const topLeft=this.liveScreen.localToWorld(new THREE.Vector3(-5.8,3.2625,0)).project(this.camera);
      const bottomRight=this.liveScreen.localToWorld(new THREE.Vector3(5.8,-3.2625,0)).project(this.camera);
      this.options.onLiveScreen?.({x:(topLeft.x+1)*innerWidth/2,y:(1-topLeft.y)*innerHeight/2,width:(bottomRight.x-topLeft.x)*innerWidth/2,height:(topLeft.y-bottomRight.y)*innerHeight/2});
    }
    if(p>2.75&&p<3.4){
      const top=this.secretFigure.localToWorld(new THREE.Vector3(-.55,2.95,0)).project(this.camera);
      const bottom=this.secretFigure.localToWorld(new THREE.Vector3(.55,0,0)).project(this.camera);
      const bounds={x:(top.x+1)*innerWidth/2,y:(1-top.y)*innerHeight/2,width:(bottom.x-top.x)*innerWidth/2,height:(top.y-bottom.y)*innerHeight/2};
      this.options.onSecretFigure?.(bounds.x<innerWidth&&bounds.x+bounds.width>0&&bounds.height>0?bounds:null);
    }else this.options.onSecretFigure?.(null);
    this.setPresence(this.signal,presence.signal);
    this.setPresence(this.exitGate,presence.cinemaDoor);
    this.forestVeil.opacity=.84*(1-smooth(p,.68,.84))*presence.forest;
    this.signal.rotation.z=Math.sin(this.timer*.035)*.025;
    (this.beam.material as THREE.MeshBasicMaterial).opacity=(.012+breath*.006)*presence.cinema;
    const light=new THREE.Vector3(door.position[0],CAMERA_HEIGHT,door.position[2]);
    const galleryLight=new THREE.Vector3().fromArray(interiorPoint([layout.galleryCenterX,3,0],mobile));
    const cinemaLight=new THREE.Vector3().fromArray(interiorPoint([layout.cinemaX,CAMERA_HEIGHT,layout.cinemaZ],mobile));
    const signalLight=new THREE.Vector3().fromArray(interiorPoint([layout.cinemaX,CAMERA_HEIGHT,layout.signalZ-13],mobile));
    const liveLight=new THREE.Vector3().fromArray(interiorPoint([layout.cinemaX,5,layout.liveZ],mobile));
    light.lerp(galleryLight,smooth(p,.65,.88)).lerp(cinemaLight,smooth(p,1.68,1.96)).lerp(liveLight,smooth(p,2.55,2.95)).lerp(signalLight,smooth(p,3.5,3.85));
    this.portalGlows[0].presence=presence.forest;
    this.portalGlows[1].presence=presence.cinemaDoor;
    this.lens.render(this.scene,this.camera,this.timer,p,light,breath,this.portalGlows);
  }
  private render=(now: number)=>{
    if(this.stopped)return;
    this.frame=requestAnimationFrame(this.render);
    if(document.hidden)return;
    if(this.secretFading!==null&&now-this.secretFading>=1200){
      const done=this.secretFinished;
      this.setSecretPlaying(false);done?.();
    }
    if(this.secretReturn&&now-this.secretReturn.started>=2200){
      const done=this.secretReturn.done;
      this.secretReturn=undefined;done();
    }
    const elapsed=this.lastTime?(now-this.lastTime)/1000:1/60,delta=Math.min(elapsed,.1);this.lastTime=now;
    const settled=Math.abs(this.progress-this.targetProgress)<.0001&&Math.abs(this.progressVelocity)<.0001;
    const drumTarget=this.livePlaying?0:1,drumsSettled=this.drumVisibility===drumTarget;
    if(this.paused && settled && drumsSettled)return;
    const fadeStep=elapsed/.8;
    this.drumVisibility+=clamp(drumTarget-this.drumVisibility,-fadeStep,fadeStep);
    // A playback fade may render while paused, without moving the settled camera.
    if(!this.paused || !settled){
      // Critically damped scroll tracking preserves velocity when a wheel event changes the destination.
      const frequency=8,offset=this.progress-this.targetProgress,decay=Math.exp(-frequency*delta);
      const travel=(this.progressVelocity+frequency*offset)*delta;
      this.progress=this.targetProgress+(offset+travel)*decay;
      this.progressVelocity=(this.progressVelocity-frequency*travel)*decay;
      this.pointer.lerp(this.paused?new THREE.Vector2():this.pointerTarget,Math.min(delta*2,1));
    }
    if(!this.paused)this.timer+=delta;
    for(const material of this.timeMaterials)material.uniforms.uTime.value=this.timer;
    this.draw();
    document.body.classList.add('scene-ready');
    if(!this.capture && !this.paused && !this.hasMeasured && this.timer>2){
      this.performanceFrames++;this.performanceTime+=delta;
      if(this.performanceTime>3){
        this.hasMeasured=true;
        if(this.performanceFrames/this.performanceTime<28){this.lowQuality=true;this.resize();}
      }
    }
  };
  destroy() {
    if(this.stopped)return;this.stopped=true;cancelAnimationFrame(this.frame);
    removeEventListener('resize',this.resize);removeEventListener('pointermove',this.movePointer);
    removeEventListener('pointerdown',this.pointerDown);removeEventListener('pointerup',this.pickOffering);
    document.removeEventListener('visibilitychange',this.visibility);
    this.options.canvas.removeEventListener('webglcontextlost',this.contextLost);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    this.scene.traverse(object=>{
      if(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line){
        geometries.add(object.geometry);
        const list=Array.isArray(object.material)?object.material:[object.material];
        for(const material of list){materials.add(material);if('map' in material && material.map instanceof THREE.Texture)textures.add(material.map);}
      }
    });
    for(const texture of this.filmTextures.values())textures.add(texture);
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    this.lens.destroy();this.renderer.dispose();document.body.style.cursor='';
  }
}
