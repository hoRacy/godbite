export type SoundState = 'waiting' | 'playing' | 'off' | 'unavailable' | 'film';

function modulation(context: BaseAudioContext, frequency: number, depth: number, target: AudioParam) {
  const wave=context.createOscillator(),level=context.createGain();
  wave.frequency.value=frequency;level.gain.value=depth;
  wave.connect(level).connect(target);wave.start();
  return wave;
}

/** The same synthesis graph can be rendered offline to check its dynamics without an audio device. */
export function createAtmosphere(context: BaseAudioContext, output: AudioNode) {
  const pressure=context.createGain();pressure.gain.value=.82;pressure.connect(output);
  modulation(context,.035,.09,pressure.gain);
  modulation(context,.116,.065,pressure.gain);

  const pulse=context.createOscillator();pulse.frequency.value=.48;
  modulation(context,.023,.047,pulse.frequency);
  const shape=context.createWaveShaper();
  const curve=new Float32Array(2048);
  for(let i=0;i<curve.length;i++)curve[i]=Math.pow(Math.max(0,i/(curve.length-1)*2-1),9);
  shape.curve=curve;
  const heartbeat=context.createGain();heartbeat.gain.value=.24;
  const echo=context.createDelay(.5);echo.delayTime.value=.18;
  const secondBeat=context.createGain();secondBeat.gain.value=.13;
  pulse.connect(shape);shape.connect(heartbeat).connect(pressure.gain);
  shape.connect(echo).connect(secondBeat).connect(pressure.gain);
  pulse.start();

  for(const [frequency,amplitude,pan] of [[43.65,.15,-.2],[61.73,.09,.2],[123.17,.028,-.08]]){
    const tone=context.createOscillator(),level=context.createGain(),space=context.createStereoPanner();
    tone.type=frequency>100?'triangle':'sine';tone.frequency.value=frequency;
    modulation(context,.019+frequency*.00006,8,tone.detune);
    level.gain.value=amplitude;space.pan.value=pan;
    tone.connect(level).connect(space).connect(pressure);tone.start();
  }

  const buffer=context.createBuffer(1,Math.floor(context.sampleRate*13),context.sampleRate);
  const data=buffer.getChannelData(0);
  let previous=0,seed=23;
  for(let i=0;i<data.length;i++){
    seed=(seed*16807)%2147483647;
    previous=(previous+((seed-1)/2147483646*2-1)*.023)/1.012;
    data[i]=previous*2.4;
  }
  const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
  const wind=context.createBiquadFilter();wind.type='lowpass';wind.frequency.value=330;wind.Q.value=.65;
  modulation(context,.042,90,wind.frequency);
  const windLevel=context.createGain();windLevel.gain.value=.48;
  modulation(context,.078,.10,windLevel.gain);
  const movement=context.createStereoPanner();modulation(context,.027,.72,movement.pan);
  noise.connect(wind).connect(windLevel).connect(movement).connect(pressure);

  const distant=context.createBiquadFilter();distant.type='bandpass';distant.frequency.value=740;distant.Q.value=3.4;
  modulation(context,.018,310,distant.frequency);
  const veil=context.createGain();veil.gain.value=.035;
  modulation(context,.051,.025,veil.gain);
  noise.connect(distant).connect(veil);

  const impulse=context.createBuffer(2,Math.floor(context.sampleRate*5),context.sampleRate);
  for(let channel=0;channel<2;channel++){
    const values=impulse.getChannelData(channel);
    for(let i=0;i<values.length;i++){
      seed=(seed*16807)%2147483647;
      values[i]=((seed-1)/2147483646*2-1)*Math.pow(1-i/values.length,3.2)*.5;
    }
  }
  const room=context.createConvolver();room.buffer=impulse;
  const wet=context.createGain();wet.gain.value=.28;
  movement.connect(room);veil.connect(room);room.connect(wet).connect(pressure);
  const delay=context.createDelay(2);delay.delayTime.value=.83;
  const feedback=context.createGain();feedback.gain.value=.32;
  veil.connect(delay);delay.connect(feedback).connect(delay);
  const echoLevel=context.createGain();echoLevel.gain.value=.2;
  delay.connect(echoLevel).connect(pressure);
  // A continuous bed bypasses the pulse so its valleys never become silence.
  const floorFilter=context.createBiquadFilter(),floorLevel=context.createGain();
  floorFilter.type='lowpass';floorFilter.frequency.value=680;floorFilter.Q.value=.5;
  floorLevel.gain.value=.14;noise.connect(floorFilter).connect(floorLevel).connect(output);
  const foundation=context.createOscillator(),foundationLevel=context.createGain();
  foundation.frequency.value=96;foundationLevel.gain.value=.035;
  foundation.connect(foundationLevel).connect(output);foundation.start();
  noise.start();
  return {wind,pressure};
}

export class Ambient {
  private context?: AudioContext;
  private gain?: GainNode;
  private graph?: ReturnType<typeof createAtmosphere>;
  private enabled=true;
  private unavailable=false;
  private blocked=false;
  private resuming=false;
  private lastResume=0;
  private progress=0;
  private sample?: AudioBuffer;
  private sampleLoading?: Promise<void>;
  private sampleGain?: GainNode;
  private sampleSource?: AudioBufferSourceNode;
  private samplePending=false;
  private sampleCallbacks?: {start:()=>void;end:()=>void};
  constructor(private changed: () => void) {
    try{this.enabled=sessionStorage.getItem('godbite-sound')!=='off';}catch{}
    document.addEventListener('visibilitychange',()=>this.update());
  }
  get requested(){return this.enabled;}
  get state(): SoundState {
    if(this.unavailable)return 'unavailable';
    if(!this.enabled)return 'off';
    if(this.context?.state!=='running')return 'waiting';
    return this.blocked?'film':'playing';
  }
  boot(){
    if(!this.enabled){this.changed();return;}
    try{this.create();this.update();}
    catch{this.fail();}
  }
  async toggle(){
    if(this.unavailable)return;
    this.enabled=!this.enabled;
    try{sessionStorage.setItem('godbite-sound',this.enabled?'on':'off');}catch{}
    this.update();
    if(this.enabled)await this.unlock();
  }
  async unlock(){
    if(!this.enabled||this.unavailable||this.context?.state==='running')return;
    if(this.resuming){
      // Retry from every kind of interaction, even while an earlier resume waits.
      if(navigator.userActivation?.isActive||performance.now()-this.lastResume>150){
        this.lastResume=performance.now();
        void this.context?.resume().then(()=>this.update()).catch(()=>{});
      }
      return;
    }
    this.resuming=true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try{
      if(!this.context)this.create();
      const context=this.context!;
      this.lastResume=performance.now();
      await Promise.race([
        context.resume(),
        new Promise<void>((resolve,reject)=>{timeout=setTimeout(()=>{
          if(context.state==='running')resolve();
          else if(context.state==='suspended'){
            reject(new DOMException('Audio is waiting for browser activation','NotAllowedError'));
          }else reject(new Error('Audio output unavailable'));
        },4000);}),
      ]);
      if((context.state as AudioContextState)==='suspended')throw new DOMException('Audio is waiting for browser activation','NotAllowedError');
      if((context.state as AudioContextState)!=='running')throw new Error('Audio output unavailable');
      this.update();
    }catch(error){
      if(error instanceof DOMException && error.name==='NotAllowedError')this.update();
      else this.fail();
    }finally{
      if(timeout)clearTimeout(timeout);
      this.resuming=false;
    }
  }
  setBlocked(blocked: boolean){this.blocked=blocked;this.update();}
  prepareSample(url: string){
    if(this.sampleLoading)return this.sampleLoading;
    this.sampleLoading=(async()=>{
      try{
        if(!this.context)this.create();
        const response=await fetch(url);
        if(!response.ok)throw new Error('Sample unavailable');
        this.sample=await this.context!.decodeAudioData(await response.arrayBuffer());
        this.update();
      }catch{this.sampleLoading=undefined;this.samplePending=false;}
    })();
    return this.sampleLoading;
  }
  playSample(callbacks?: {start:()=>void;end:()=>void}){
    if(!this.enabled||this.unavailable||this.blocked||document.hidden)return false;
    this.samplePending=true;
    this.sampleCallbacks=callbacks;
    void this.unlock();this.update();
    return true;
  }
  cancelSample(){
    this.samplePending=false;
    const source=this.sampleSource,callbacks=this.sampleCallbacks;
    this.sampleSource=undefined;this.sampleCallbacks=undefined;
    source?.stop();
    if(source)callbacks?.end();
  }
  setProgress(progress: number){
    this.progress=progress;
    this.graph?.wind.frequency.setTargetAtTime(330-45*Math.min(progress,4)/4,this.context!.currentTime,2);
  }
  private create(){
    if(this.context)return;
    const Factory=window.AudioContext || (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if(!Factory)throw new Error('Web Audio unavailable');
    const context=new Factory();this.context=context;
    this.gain=context.createGain();this.gain.gain.value=0;
    const limiter=context.createDynamicsCompressor();
    limiter.threshold.value=-18;limiter.ratio.value=8;limiter.attack.value=.02;limiter.release.value=.8;
    this.gain.connect(limiter).connect(context.destination);
    this.sampleGain=context.createGain();this.sampleGain.gain.value=.7;
    this.sampleGain.connect(context.destination);
    this.graph=createAtmosphere(context,this.gain);
    context.addEventListener('statechange',()=>this.update());
    this.setProgress(this.progress);
  }
  private fail(){
    this.unavailable=true;this.enabled=false;
    if(this.context)void this.context.close().catch(()=>{});
    this.changed();
  }
  private update(){
    if(this.context && this.gain){
      const audible=this.enabled&&!this.blocked&&!document.hidden&&this.context.state==='running';
      if(!this.enabled||this.blocked||document.hidden)this.cancelSample();
      this.sampleGain?.gain.setTargetAtTime(audible?.7:0,this.context.currentTime,.025);
      if(audible&&this.samplePending&&this.sample&&this.sampleGain){
        this.samplePending=false;
        const source=this.context.createBufferSource();source.buffer=this.sample;
        source.connect(this.sampleGain);this.sampleSource=source;
        source.onended=()=>{
          source.disconnect();
          if(this.sampleSource!==source)return;
          this.sampleSource=undefined;
          const callbacks=this.sampleCallbacks;this.sampleCallbacks=undefined;
          callbacks?.end();
        };
        source.start();
        this.sampleCallbacks?.start();
      }
      this.gain.gain.setTargetAtTime(audible?.32:0,this.context.currentTime,audible?.65:.055);
    }
    this.changed();
  }
}
