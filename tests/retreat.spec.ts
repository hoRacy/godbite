import { test, expect } from '@playwright/test';

test('backwards wheel at the start plays the decoded Skyrim sample once and allows returning',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    (window as any).sampleStarts=0;
    (window as any).sampleEndedAt=0;
    (window as any).cameraFrames=[];
    for(const API of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
      const names=new WeakMap<WebGLUniformLocation,string>(),prototype=API.prototype;
      const location=prototype.getUniformLocation,matrix=prototype.uniformMatrix4fv;
      prototype.getUniformLocation=function(program,name){
        const result=location.call(this,program,name);if(result)names.set(result,name);return result;
      };
      prototype.uniformMatrix4fv=function(...args:any[]){
        if(args[0]&&names.get(args[0])==='uCameraWorld'){
          (window as any).cameraFrames.push({z:args[2][14],rotation:Array.from(args[2]).slice(0,12),phase:document.body.dataset.easterEgg});
        }
        return (matrix as any).apply(this,args);
      };
    }
    const start=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){
      if(this.buffer&&this.buffer.duration<5){
        (window as any).sampleStarts++;
        this.addEventListener('ended',()=>{(window as any).sampleEndedAt=performance.now();});
      }
      return start.apply(this,args);
    };
  });
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.mouse.click(20,300);
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraFrames.length)).toBeGreaterThan(0);
  const startZ=await page.evaluate(()=>(window as any).cameraFrames.at(-1).z);
  await page.mouse.move(20,300);
  await page.mouse.wheel(0,-1000);
  await page.waitForTimeout(900);
  expect(await page.evaluate(()=>(window as any).sampleStarts)).toBe(0);
  await page.mouse.wheel(0,-1600);
  await expect.poll(()=>page.evaluate(()=>(window as any).sampleStarts),{timeout:15000}).toBe(1);
  await expect(page.locator('body')).toHaveAttribute('data-easter-egg','playing');
  await page.mouse.wheel(0,-2600);
  await page.screenshot({path:'test-results/skyrim-playing.png'});
  await expect(page.locator('body')).toHaveAttribute('data-easter-egg','fading');
  await expect(page.locator('body')).toHaveAttribute('data-easter-egg','returning');
  await expect(page.locator('body')).not.toHaveAttribute('data-easter-egg',/playing|fading|returning/);
  expect(await page.evaluate(()=>performance.now()-(window as any).sampleEndedAt)).toBeGreaterThanOrEqual(3300);
  const frames=await page.evaluate(()=>(window as any).cameraFrames);
  const chaos=frames.filter((frame:any)=>frame.phase==='playing'||frame.phase==='fading');
  expect(Math.min(...chaos.map((frame:any)=>frame.z))).toBeGreaterThan(startZ+40);
  expect(chaos.at(-1).rotation).not.toEqual(chaos[0].rotation);
  const returning=frames.filter((frame:any)=>frame.phase==='returning');
  expect(returning[0].z).toBeGreaterThan(startZ+40);
  expect(returning.at(-1).z).toBeLessThan(startZ+.5);
  for(let i=1;i<returning.length;i++)expect(returning[i].z).toBeLessThanOrEqual(returning[i-1].z);
  expect(frames.at(-1).z).toBeCloseTo(startZ,3);
  await page.screenshot({path:'test-results/skyrim-returned.png'});
  expect(await page.evaluate(()=>(window as any).sampleStarts)).toBe(1);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
  // End of the sample resets retreat, so the very next forward scroll advances.
  await page.mouse.wheel(0,600);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  await page.locator('.brand').click();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  await page.locator('#sound-toggle').click();
  await page.mouse.move(20,300);
  await page.mouse.wheel(0,-2600);
  await page.waitForTimeout(1800);
  expect(await page.evaluate(()=>(window as any).sampleStarts)).toBe(1);
  expect(errors).toEqual([]);
});

for(const interaction of ['mousemove','wheel','touchmove','keydown']){
  test(`${interaction} retries audio while an earlier interaction is still pending`,async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(()=>{
      (window as any).allowSound=false;
      const Native=window.AudioContext;
      window.AudioContext=class extends Native {
        private playing=false;
        get state():AudioContextState{return this.playing?'running':'suspended';}
        resume():Promise<void>{
          if(!(window as any).allowSound)return new Promise(()=>{});
          this.playing=true;return Promise.resolve();
        }
      };
    });
    await page.goto('./');
    await page.mouse.move(40,100);
    await expect(page.locator('body')).toHaveAttribute('data-sound','waiting');
    await page.waitForTimeout(200);
    await page.evaluate(type=>{
      (window as any).allowSound=true;
      document.dispatchEvent(new Event(type,{bubbles:true}));
    },interaction);
    await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
    await expect(page.locator('#sound-hint')).toBeHidden();
  });
}

test('the red sound invitation sits below the forest text and unlocks audio with one click',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      private playing=false;
      get state():AudioContextState{return this.playing?'running':'suspended';}
      resume():Promise<void>{
        if(!navigator.userActivation.isActive)return new Promise(()=>{});
        this.playing=true;return Promise.resolve();
      }
    };
  });
  await page.goto('./');
  const hint=page.locator('#sound-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('Click once. Let the forest speak.');
  const poem=await page.locator('.hero-poem').boundingBox(),invitation=await hint.boundingBox();
  const logo=await page.locator('#hero-title').boundingBox();
  expect(invitation!.y).toBeGreaterThanOrEqual(poem!.y+poem!.height);
  expect(await hint.evaluate(element=>getComputedStyle(element).color)).toBe('rgb(204, 23, 62)');
  await page.screenshot({path:'test-results/sound-invitation.png'});
  await page.mouse.click(invitation!.x+invitation!.width/2,invitation!.y+invitation!.height/2);
  await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
  await expect(hint).toBeHidden();
  const after=await page.locator('#hero-title').boundingBox();
  expect(after!.y).toBeCloseTo(logo!.y,2);
  expect((await page.locator('.hero-poem').boundingBox())!.y).toBeCloseTo(poem!.y,2);
});

test('muted retreat enlarges the invitation and clicking it starts the secret without more scrolling',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('godbite-sound','off'));
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/scene-ready/);
  const hint=page.locator('#sound-hint'),font=()=>hint.evaluate(element=>parseFloat(getComputedStyle(element).fontSize));
  await expect(hint).toBeHidden();
  await page.mouse.move(20,300);await page.mouse.wheel(0,-1000);
  await expect(hint).toBeVisible();
  await expect.poll(font).toBeGreaterThan(9.05);
  const halfway=await font();
  for(let i=0;i<8;i++)await page.mouse.wheel(0,-1600);
  await expect.poll(font).toBeGreaterThan(halfway*2);
  await page.waitForTimeout(600);
  const bounds=await hint.boundingBox(),size=await font();
  await page.screenshot({path:'test-results/sound-demand.png'});
  await page.mouse.click(bounds!.x+bounds!.width/2,bounds!.y+size*.8);
  await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
  await expect(page.locator('body')).toHaveAttribute('data-easter-egg','playing');
});

test('reduced motion keeps the normal start without loading the secret audio',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/still-mode/);
  await page.mouse.wheel(0,-2600);
  await page.waitForTimeout(300);
  expect(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('never-should-have')))).toBe(false);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
});
