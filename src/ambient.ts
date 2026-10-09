export class Ambient {
  private context?: AudioContext;
  private gain?: GainNode;
  private enabled = false;
  private blocked = false;
  constructor() { document.addEventListener('visibilitychange', () => this.update()); }
  async toggle() {
    if (!this.context) this.create();
    const context = this.context!;
    if (context.state !== 'running') {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          context.resume(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Audio output unavailable')), 4000);
          }),
        ]);
        if ((context.state as AudioContextState) !== 'running') throw new Error('Audio output unavailable');
      } catch (error) {
        void context.close().catch(() => {});
        this.context = undefined; this.gain = undefined;
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    this.enabled = !this.enabled; this.update(); return this.enabled;
  }
  setBlocked(blocked: boolean) { this.blocked = blocked; this.update(); }
  private create() {
    const Factory = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Factory) throw new Error('Web Audio unavailable');
    const context = new Factory(); this.context = context;
    this.gain = context.createGain(); this.gain.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -22; limiter.ratio.value = 10;
    this.gain.connect(limiter).connect(context.destination);
    const buffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
    const values = buffer.getChannelData(0); let previous = 0;
    for (let i = 0; i < values.length; i++) {
      previous = (previous + (Math.random() * 2 - 1) * .018) / 1.018;
      values[i] = previous * 3;
    }
    const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 430; filter.Q.value = .4;
    noise.connect(filter).connect(this.gain); noise.start();
    for (const frequency of [48, 72.08]) {
      const oscillator = context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const level = context.createGain(); level.gain.value = .055;
      oscillator.connect(level).connect(this.gain); oscillator.start();
    }
    const impulse = context.createBuffer(2, context.sampleRate * 3, context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }
    const reverb = context.createConvolver(); reverb.buffer = impulse;
    const wet = context.createGain(); wet.gain.value = .16;
    filter.connect(reverb).connect(wet).connect(this.gain);
  }
  private update() {
    if (!this.context || !this.gain) return;
    this.gain.gain.setTargetAtTime(this.enabled && !this.blocked && !document.hidden ? .24 : 0, this.context.currentTime, .25);
  }
}
