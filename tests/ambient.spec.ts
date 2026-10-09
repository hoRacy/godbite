import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const synthesis=ts.transpileModule(readFileSync(new URL('../src/ambient.ts',import.meta.url),'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText.replace(/\bexport /g,'');

test('the real ambient waveform swells, pulses and has stereo movement without clipping',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  test.skip(!await page.evaluate(()=>Boolean(window.OfflineAudioContext)),'This browser build has no offline audio engine.');
  await page.addScriptTag({content:synthesis+'\nwindow.renderGodbiteAtmosphere=createAtmosphere;'});
  const result=await page.evaluate(async()=>{
    const rate=24000,duration=36;
    const context=new OfflineAudioContext(2,rate*duration,rate);
    const output=context.createGain();output.gain.value=.32;output.connect(context.destination);
    (window as unknown as {renderGodbiteAtmosphere:(context:BaseAudioContext,output:AudioNode)=>void}).renderGodbiteAtmosphere(context,output);
    const buffer=await context.startRendering(),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
    const rms:number[]=[];let peak=0,difference=0;
    for(let second=0;second<duration;second++){
      let energy=0;
      for(let sample=second*rate;sample<(second+1)*rate;sample++){
        energy+=(left[sample]*left[sample]+right[sample]*right[sample])*.5;
        peak=Math.max(peak,Math.abs(left[sample]),Math.abs(right[sample]));
        difference+=Math.pow(left[sample]-right[sample],2);
      }
      rms.push(Math.sqrt(energy/rate));
    }
    return {rms,peak,stereoDifference:Math.sqrt(difference/left.length),dynamicRatio:Math.max(...rms)/Math.min(...rms)};
  });
  expect(result.dynamicRatio).toBeGreaterThan(1.3);
  expect(result.dynamicRatio).toBeLessThan(2.8);
  expect(Math.min(...result.rms)).toBeGreaterThan(.008);
  expect(result.peak).toBeLessThan(.35);
  expect(result.stereoDifference).toBeGreaterThan(.001);
  await test.info().attach('ambient-dynamics',{body:JSON.stringify(result,null,2),contentType:'application/json'});
});
