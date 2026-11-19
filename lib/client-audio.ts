import type { DspSettings } from './types';

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array<number>(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

export function downloadBase64Audio(
  base64: string,
  mimeType: string,
  filename: string
): void {
  const blob = base64ToBlob(base64, mimeType);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface LiveDspChain {
  inputNode: AudioNode;
  outputNode: AudioNode;
  analyser: AnalyserNode;
  mediaDest: MediaStreamAudioDestinationNode;
  updateSettings: (settings: DspSettings) => void;
  setMonitorEnabled: (enabled: boolean) => void;
  destroy: () => void;
}

const PITCH_WORKLET_CODE = `
class VoxPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'semitones', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.ringSize = 8192;
    this.ringBuffer = new Float32Array(this.ringSize);
    this.writeIdx = 0;
    this.phaseA = 0;
    this.grainSize = 2048;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;
    const semitones = parameters.semitones[0] ?? 0;

    if (Math.abs(semitones) < 0.05) {
      output.set(input);
      for (let i = 0; i < input.length; i++) {
        this.ringBuffer[this.writeIdx] = input[i];
        this.writeIdx = (this.writeIdx + 1) & (this.ringSize - 1);
      }
      return true;
    }

    const pitchRatio = Math.pow(2, semitones / 12);
    const step = 1 - pitchRatio;
    for (let i = 0; i < input.length; i++) {
      this.ringBuffer[this.writeIdx] = input[i];
      const pA = this.phaseA;
      const pB = (this.phaseA + 0.5) % 1;
      const delayA = pA * this.grainSize;
      const delayB = pB * this.grainSize;
      const readA = (this.writeIdx - delayA + this.ringSize) % this.ringSize;
      const readB = (this.writeIdx - delayB + this.ringSize) % this.ringSize;

      const idxA0 = Math.floor(readA) & (this.ringSize - 1);
      const idxA1 = (idxA0 + 1) & (this.ringSize - 1);
      const fracA = readA - Math.floor(readA);
      const sampleA = this.ringBuffer[idxA0] * (1 - fracA) + this.ringBuffer[idxA1] * fracA;

      const idxB0 = Math.floor(readB) & (this.ringSize - 1);
      const idxB1 = (idxB0 + 1) & (this.ringSize - 1);
      const fracB = readB - Math.floor(readB);
      const sampleB = this.ringBuffer[idxB0] * (1 - fracB) + this.ringBuffer[idxB1] * fracB;

      const winA = 1 - Math.abs(2 * pA - 1);
      const winB = 1 - Math.abs(2 * pB - 1);
      output[i] = sampleA * winA + sampleB * winB;

      this.phaseA = (this.phaseA + step / this.grainSize) % 1;
      if (this.phaseA < 0) this.phaseA += 1;
      this.writeIdx = (this.writeIdx + 1) & (this.ringSize - 1);
    }
    return true;
  }
}
registerProcessor('vox-pitch-processor', VoxPitchProcessor);
`;

const registeredWorkletContexts = new WeakSet<AudioContext>();

/**
 * Builds a low-latency real-time Web Audio DSP graph using AudioWorkletNode
 * (zero deprecation warnings) with Gain pass-through fallback:
 * Input -> HighPass -> LowShelf (140Hz) -> MidPeak (2.4kHz) -> HighShelf (8kHz)
 * -> Pitch Shifter -> DynamicsCompressor -> MasterGain
 */
export async function createLiveDspChain(
  ctx: AudioContext,
  initial: DspSettings,
  monitorInitiallyEnabled: boolean
): Promise<LiveDspChain> {
  const inputGain = ctx.createGain();
  inputGain.gain.value = 1;

  const highPass = ctx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = initial.highPassHz;
  highPass.Q.value = 0.7;

  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 140;
  lowShelf.gain.value = initial.lowGainDb;

  const midPeak = ctx.createBiquadFilter();
  midPeak.type = 'peaking';
  midPeak.frequency.value = 2400;
  midPeak.Q.value = 1.1;
  midPeak.gain.value = initial.midGainDb;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 8000;
  highShelf.gain.value = initial.highGainDb;

  let pitchNode: AudioNode;
  let pitchParam: AudioParam | null = null;

  if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
    try {
      if (!registeredWorkletContexts.has(ctx)) {
        const blob = new Blob([PITCH_WORKLET_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        try {
          await ctx.audioWorklet.addModule(url);
          registeredWorkletContexts.add(ctx);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const worklet = new AudioWorkletNode(ctx, 'vox-pitch-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      pitchParam = worklet.parameters.get('semitones') ?? null;
      if (pitchParam) {
        pitchParam.setValueAtTime(initial.pitchSemitones, ctx.currentTime);
      }
      pitchNode = worklet;
    } catch {
      pitchNode = ctx.createGain();
    }
  } else {
    pitchNode = ctx.createGain();
  }

  const compressor = ctx.createDynamicsCompressor();
  applyCompression(compressor, initial.compression);

  const outputGain = ctx.createGain();
  outputGain.gain.value = initial.outputGain;

  const monitorGain = ctx.createGain();
  monitorGain.gain.value = monitorInitiallyEnabled ? 1 : 0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;

  const mediaDest = ctx.createMediaStreamDestination();

  inputGain.connect(highPass);
  highPass.connect(lowShelf);
  lowShelf.connect(midPeak);
  midPeak.connect(highShelf);
  highShelf.connect(pitchNode);
  pitchNode.connect(compressor);
  compressor.connect(outputGain);

  outputGain.connect(analyser);
  outputGain.connect(mediaDest);
  outputGain.connect(monitorGain);
  monitorGain.connect(ctx.destination);

  function applyCompression(comp: DynamicsCompressorNode, amountPct: number) {
    const t = Math.max(0, Math.min(100, amountPct)) / 100;
    comp.threshold.value = -6 - t * 30;
    comp.knee.value = 18;
    comp.ratio.value = 1 + t * 9;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
  }

  return {
    inputNode: inputGain,
    outputNode: outputGain,
    analyser,
    mediaDest,
    updateSettings: (next: DspSettings) => {
      if (pitchParam) {
        pitchParam.setTargetAtTime(next.pitchSemitones, ctx.currentTime, 0.02);
      }
      highPass.frequency.setTargetAtTime(next.highPassHz, ctx.currentTime, 0.02);
      lowShelf.gain.setTargetAtTime(next.lowGainDb, ctx.currentTime, 0.02);
      midPeak.gain.setTargetAtTime(next.midGainDb, ctx.currentTime, 0.02);
      highShelf.gain.setTargetAtTime(next.highGainDb, ctx.currentTime, 0.02);
      applyCompression(compressor, next.compression);
      outputGain.gain.setTargetAtTime(next.outputGain, ctx.currentTime, 0.02);
    },
    setMonitorEnabled: (enabled: boolean) => {
      monitorGain.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.02);
    },
    destroy: () => {
      try {
        inputGain.disconnect();
        highPass.disconnect();
        lowShelf.disconnect();
        midPeak.disconnect();
        highShelf.disconnect();
        pitchNode.disconnect();
        compressor.disconnect();
        outputGain.disconnect();
        monitorGain.disconnect();
        analyser.disconnect();
      } catch {
        // Ignore teardown errors
      }
    },
  };
}
