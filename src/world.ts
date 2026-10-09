import * as THREE from 'three';
import { asset, films, releases } from './content';
import { CinematicLens } from './cinematic';

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;
let seed = 17;
function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const fogVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;
const fogFragment = /* glsl */ `
  uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
  void main(){
    vec2 p=vUv*vec2(5.,2.7)+vec2(uTime*.025,-uTime*.014);
    float n=noise(p)*.6+noise(p*2.1)*.25+noise(p*4.4)*.15;
    float edge=sin(vUv.x*3.14159)*sin(vUv.y*3.14159);
    gl_FragColor=vec4(uColor,pow(edge,1.6)*smoothstep(.22,.75,n)*uOpacity);
  }
`;
const waterFragment = /* glsl */ `
  uniform float uTime; varying vec2 vUv;
  void main(){
    vec2 p=vUv*45.; float ripples=sin(length(p-vec2(23.,17.))*5.-uTime*.45);
    float grain=sin(p.x*9.+sin(p.y*1.8+uTime*.13))*sin(p.y*11.+uTime*.12);
    float red=exp(-abs(p.x-22.5)*1.5)*(.28+.2*ripples);
    vec3 color=vec3(.018,.029,.027)+vec3(.12,.004,.012)*red+vec3(.014)*grain;
    gl_FragColor=vec4(color,.82);
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
  uniform vec3 uColor; uniform float uOpacity; varying float vPresence;
  void main(){gl_FragColor=vec4(uColor,uOpacity*vPresence);}
`;

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  onFailure: () => void;
  onRelease: (index: number) => void;
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
  private aperture = new THREE.Group();
  private ritual = new THREE.Group();
  private cinema = new THREE.Group();
  private signal = new THREE.Group();
  private fogMaterials: THREE.ShaderMaterial[] = [];
  private timeMaterials: THREE.ShaderMaterial[] = [];
  private screens: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private offerings: THREE.Mesh[] = [];
  private coverMaterials: THREE.MeshBasicMaterial[] = [];
  private reflections: THREE.MeshBasicMaterial[] = [];
  private filmTextures = new Map<string, THREE.Texture>();
  private coversLoaded = false;
  private targetProgress = 0;
  private progress = 0;
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
    this.scene.fog = new THREE.FogExp2('#10131b', .06);
    this.scene.add(new THREE.HemisphereLight('#a1acbf', '#030104', .14));
    this.whiteLight.position.set(-12, 20, 8);
    this.whiteLight.target.position.set(1, 2, -28);
    this.scene.add(this.whiteLight, this.whiteLight.target);
    this.redLight.position.set(0, 3, -24); this.scene.add(this.redLight);
    this.scene.add(this.forest, this.ritual, this.cinema, this.signal);
    this.makeForest();
    this.makeRitual();
    this.beam = this.makeCinema();
    this.makeSignal();
    this.makeDust();
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
      const z=14-random()*82;
      if (Math.abs(x)<4.3) x+=(x<0?-1:1)*(5+random()*5);
      if(z< -28 && Math.abs(x)<17) x+=(x<0?-1:1)*15;
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
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,110),new THREE.MeshStandardMaterial({color:'#020305',roughness:.75}));
    ground.rotation.x=-Math.PI/2;ground.position.set(0,-.06,26);this.forest.add(ground);
    const lineMaterial = new THREE.MeshBasicMaterial({color:'#a50c31',toneMapped:false,fog:false});
    const aperture = this.aperture;
    for(const x of [-1.25,1.25]){
      const side=new THREE.Mesh(new THREE.BoxGeometry(.065,7,.065),lineMaterial);
      side.position.set(x,3.5,-25);aperture.add(side);
    }
    const top=new THREE.Mesh(new THREE.BoxGeometry(2.55,.045,.07),lineMaterial);top.position.set(0,7,-25);aperture.add(top);
    const inside=new THREE.Mesh(new THREE.PlaneGeometry(2.4,6.9),new THREE.MeshBasicMaterial({color:'#130409',transparent:true,opacity:.84}));
    inside.position.set(0,3.45,-25.04);aperture.add(inside);
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(7,11),this.fogMaterial('#e10a28',.44));
    glow.position.set(0,4,-25.12);aperture.add(glow);
    this.forest.add(aperture);
    for(let i=0;i<7;i++){
      const mist=new THREE.Mesh(new THREE.PlaneGeometry(60,8),this.fogMaterial('#737d8a',.5));
      mist.position.set((random()-.5)*12,1.3+random()*2,4-i*11);this.forest.add(mist);
    }
    // Suspended shafts are lit geometry; no expensive full-screen volumetric ray march.
    for(let i=0;i<5;i++){
      const shaft=new THREE.Mesh(new THREE.PlaneGeometry(3,25),this.fogMaterial('#8e9aaf',.12));
      shaft.position.set(-23+i*12,9,-15-i*6);shaft.rotation.z=.18;this.forest.add(shaft);
    }
  }

  private fogMaterial(color: string, opacity: number) {
    const material=new THREE.ShaderMaterial({
      vertexShader:fogVertex, fragmentShader:fogFragment,
      uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(color)},uOpacity:{value:opacity}},
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
    });
    this.fogMaterials.push(material);return material;
  }

  private makeRitual() {
    this.ritual.position.z=-47;
    const water=new THREE.Mesh(new THREE.PlaneGeometry(85,44),new THREE.ShaderMaterial({
      vertexShader:fogVertex,fragmentShader:waterFragment,uniforms:{uTime:{value:0}},
      transparent:true,depthWrite:false,side:THREE.DoubleSide,
    }));
    water.rotation.x=-Math.PI/2;water.position.set(0,.02,0);
    this.ritual.add(water);this.timeMaterials.push(water.material);
    const stoneMaterial=new THREE.MeshStandardMaterial({color:'#030306',metalness:.1,roughness:.94});
    const edgeMaterial=new THREE.MeshBasicMaterial({color:'#38333e',transparent:true,opacity:.035});
    for(let i=0;i<5;i++){
      const group=new THREE.Group();
      group.position.set((i-2)*4.4,0,-(2-Math.abs(i-2))*1.8);
      const stone=new THREE.Mesh(new THREE.BoxGeometry(2.65,6.4,.7),stoneMaterial);
      stone.position.y=3.2;stone.userData.release=i;this.offerings.push(stone);group.add(stone);
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(stone.geometry),edgeMaterial);
      edges.position.copy(stone.position);group.add(edges);
      const coverMaterial=new THREE.MeshBasicMaterial({color:'#70656a'});
      this.coverMaterials.push(coverMaterial);
      const cover=new THREE.Mesh(new THREE.PlaneGeometry(2.3,2.3),coverMaterial);
      cover.position.set(0,4.48,.36);cover.userData.release=i;group.add(cover);
      const sigil=this.makeSigil(i);sigil.position.set(0,1.65,.38);group.add(sigil);
      const foot=new THREE.Mesh(new THREE.BoxGeometry(2.67,.035,.8),new THREE.MeshBasicMaterial({color:'#a52a3d'}));
      foot.position.set(0,.025,0);group.add(foot);
      this.ritual.add(group);
      const reflectedMaterial=coverMaterial.clone();
      reflectedMaterial.transparent=true;reflectedMaterial.opacity=.065;
      this.reflections.push(reflectedMaterial);
      const reflection=new THREE.Mesh(new THREE.PlaneGeometry(2.3,2.3),reflectedMaterial);
      reflection.position.set(group.position.x,-4.48,group.position.z+.36);
      reflection.scale.y=-1;this.ritual.add(reflection);
    }
    const glow=this.ritualGlow;glow.position.set(0,5,2);this.ritual.add(glow);
    const rim=new THREE.SpotLight('#a2aabb',290,50,.33,1,1.8);rim.position.set(-17,16,6);rim.target.position.set(0,3,-2);this.ritual.add(rim,rim.target);
    for(let i=0;i<3;i++){
      const mist=new THREE.Mesh(new THREE.PlaneGeometry(65,6),this.fogMaterial('#555e70',.38));
      mist.position.set(0,2,6-i*7);this.ritual.add(mist);
    }
  }

  private makeSigil(index: number) {
    const group=new THREE.Group();
    const material=new THREE.LineBasicMaterial({color:'#b1a6a6',transparent:true,opacity:.2});
    const circle=[];
    for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;circle.push(new THREE.Vector3(Math.cos(a)*.44,Math.sin(a)*.44,0));}
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circle),material));
    const points=[];
    const count=3+index;
    for(let i=0;i<count;i++){
      const a=i/count*Math.PI*2;
      points.push(new THREE.Vector3(Math.cos(a)*.62,Math.sin(a)*.62,0),new THREE.Vector3(-Math.cos(a)*.27,-Math.sin(a)*.27,0));
    }
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),material));return group;
  }

  private makeCinema() {
    this.cinema.position.z=-100;
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(46,42),new THREE.MeshStandardMaterial({color:'#090b0a',roughness:.6}));
    floor.rotation.x=-Math.PI/2;floor.position.z=13;this.cinema.add(floor);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(17.1,9.7,.35),new THREE.MeshStandardMaterial({color:'#201d19',roughness:.6}));
    frame.position.set(0,7,0);this.cinema.add(frame);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(16,9),new THREE.MeshBasicMaterial({color:'#6b717b'}));
    screen.position.set(0,7,.2);this.cinema.add(screen);this.screens.push(screen);
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
    for(let i=0;i<3;i++){
      const mist=new THREE.Mesh(new THREE.PlaneGeometry(33,10),this.fogMaterial('#667388',.10));
      mist.position.set(0,6,6+i*5);this.cinema.add(mist);
    }
    return beam;
  }

  private makeSignal() {
    this.signal.position.z=-151;
    for(let i=0;i<36;i++){
      const points=[];
      const phase=random()*Math.PI*2, radius=3+random()*13;
      for(let j=0;j<9;j++){
        const angle=phase+j*.65;
        points.push(new THREE.Vector3(Math.cos(angle)*radius+(random()-.5)*3,Math.sin(angle)*radius*.6+6,-random()*12));
      }
      const curve=new THREE.CatmullRomCurve3(points);
      const material=new THREE.ShaderMaterial({
        vertexShader:threadVertex,fragmentShader:threadFragment,transparent:true,depthWrite:false,
        uniforms:{
          uTime:{value:0},uPhase:{value:phase},uDrift:{value:.65+random()*.8},
          uColor:{value:new THREE.Color(i%4===0?'#c22f51':'#b3acb1')},uOpacity:{value:i%4===0?.48:.23},
        },
      });
      const thread=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(80)),material);
      thread.frustumCulled=false;
      this.timeMaterials.push(material);this.signal.add(thread);
    }
    const blade=new THREE.Mesh(new THREE.PlaneGeometry(.065,20),new THREE.MeshBasicMaterial({color:'#dc2442',toneMapped:false}));
    blade.position.set(0,8,-13);this.signal.add(blade);
    const mist=new THREE.Mesh(new THREE.PlaneGeometry(25,25),this.fogMaterial('#cb0730',.19));mist.position.set(0,8,-13.2);this.signal.add(mist);
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
        this.coverMaterials[index].map=texture;this.coverMaterials[index].needsUpdate=true;
        this.reflections[index].map=texture;this.reflections[index].needsUpdate=true;
      },undefined,()=>{/* The HTML recording selector remains available if an image fails. */});
    });
  }

  selectFilm(id: string) {
    const film=films.find(item=>item.id===id);if(!film)return;
    this.selectedFilm=id;
    const apply=(texture: THREE.Texture)=>{
      for(const screen of this.screens){screen.material.map=texture;screen.material.color.set('#73727d');screen.material.needsUpdate=true;}
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

  setProgress(progress: number) {
    this.targetProgress=clamp(progress,0,3);
    if(progress>.18)this.loadCovers();
    if(progress>1.25 && !this.filmTextures.size)this.selectFilm(this.selectedFilm);
    if(this.paused)this.draw();
  }
  setPaused(paused: boolean) { this.paused=paused; }
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
    if(this.progress>.7 && this.progress<1.4 && !interactive){
      this.raycaster.setFromCamera(new THREE.Vector2(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1),this.camera);
      const offering=this.raycaster.intersectObjects(this.offerings)[0];
      this.hoveredRelease=offering?offering.object.userData.release as number:-1;
      document.body.style.cursor=offering?'pointer':'';
    }else{document.body.style.cursor='';this.hoveredRelease=-1;}
  };
  private pointerDown=(event: PointerEvent)=>{this.lastPointerDown={x:event.clientX,y:event.clientY};};
  private pickOffering=(event: PointerEvent)=>{
    if(this.progress<.7 || this.progress>1.4)return;
    if(event.target instanceof Element && event.target.closest('a,button,dialog,header,footer'))return;
    if(Math.hypot(event.clientX-this.lastPointerDown.x,event.clientY-this.lastPointerDown.y)>8)return;
    this.raycaster.setFromCamera(new THREE.Vector2(event.clientX/innerWidth*2-1,-event.clientY/innerHeight*2+1),this.camera);
    const hit=this.raycaster.intersectObjects(this.offerings)[0];
    if(hit)this.options.onRelease(hit.object.userData.release as number);
  };
  private visibility=()=>{this.lastTime=0;};
  private contextLost=(event: Event)=>{event.preventDefault();this.destroy();this.options.onFailure();};

  private draw() {
    const p=this.progress,segment=Math.min(2,Math.floor(p)),fraction=smooth(p-segment,0,1);
    const mobile=innerWidth<800;
    const positions=[
      new THREE.Vector3(0,3.1,16),
      new THREE.Vector3(mobile?0:5.5,mobile?4.4:4.8,mobile?-23:-27),
      new THREE.Vector3(0,mobile?4.2:6.0,mobile?-72:-73),
      new THREE.Vector3(0,5,-125),
    ];
    const targets=[new THREE.Vector3(0,5,-18),new THREE.Vector3(0,3.4,-48),new THREE.Vector3(0,mobile?3.9:6,-100),new THREE.Vector3(0,6,-150)];
    this.camera.position.lerpVectors(positions[segment],positions[segment+1],fraction);
    const target=new THREE.Vector3().lerpVectors(targets[segment],targets[segment+1],fraction);
    target.x+=this.pointer.x*.85;target.y-=this.pointer.y*.45;
    this.camera.lookAt(target);
    const forestFade=1-smooth(p,.65,1.65);
    const breath=.68+Math.sin(this.timer*.22)*.17+Math.sin(this.timer*.73+.8)*.095
      +Math.pow(Math.max(0,Math.sin(this.timer*3.1)),8)*.15;
    const fog=this.scene.fog as THREE.FogExp2;
    fog.color.set('#10131b').lerp(new THREE.Color('#030207'),smooth(p,.45,1.75));
    fog.density=THREE.MathUtils.lerp(.061,.036,smooth(p,.65,1.8))*THREE.MathUtils.lerp(1,.5,smooth(p,1.55,1.98))*(1+Math.sin(this.timer*.12)*.07);
    this.whiteLight.intensity=620*forestFade*(.64+breath*.48);
    this.whiteLight.target.position.set(Math.sin(this.timer*.085)*12,3,-27+Math.sin(this.timer*.12)*4);
    this.redLight.intensity=150*forestFade*breath;
    this.ritualGlow.intensity=80*breath;
    this.coverMaterials.forEach((material,index)=>{
      const reveal=.28+Math.pow(Math.max(0,Math.sin(this.timer*.15+index*.92)),4)*.19;
      material.color.setScalar(this.hoveredRelease===index?.85:reveal);
    });
    this.cinemaWash.intensity=780*(.8+breath*.2);
    this.screenGlow.intensity=95*(.93+Math.sin(this.timer*.91)*.05);
    this.aperture.visible=p<.72;
    this.ritual.scale.setScalar(mobile?.58:1);
    this.cinema.scale.setScalar(mobile?.7:1);
    this.forest.visible=p<1.75;this.ritual.visible=p>.1 && p<1.9;this.cinema.visible=p>1.3 && p<2.65;this.signal.visible=p>2.25;
    this.signal.rotation.z=Math.sin(this.timer*.035)*.025;
    (this.beam.material as THREE.MeshBasicMaterial).opacity=.012+breath*.006;
    const light=p<.7?new THREE.Vector3(0,4,-25):p<1.6?new THREE.Vector3(0,3,-47)
      :p<2.45?new THREE.Vector3(0,mobile?4.9:7,-100):new THREE.Vector3(0,8,-164);
    this.lens.render(this.scene,this.camera,this.timer,p,light,breath);
  }
  private render=(now: number)=>{
    if(this.stopped)return;
    this.frame=requestAnimationFrame(this.render);
    if(document.hidden)return;
    const delta=this.lastTime?Math.min((now-this.lastTime)/1000,.1):1/60;this.lastTime=now;
    const settled=Math.abs(this.progress-this.targetProgress)<.0001;
    if(this.paused && settled)return;
    this.progress=THREE.MathUtils.damp(this.progress,this.targetProgress,5,delta);
    this.pointer.lerp(this.paused?new THREE.Vector2():this.pointerTarget,Math.min(delta*2,1));
    if(!this.paused)this.timer+=delta;
    for(const material of [...this.fogMaterials,...this.timeMaterials])material.uniforms.uTime.value=this.timer;
    this.draw();
    document.body.classList.add('scene-ready');
    if(!this.capture && !this.hasMeasured && this.timer>2){
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
