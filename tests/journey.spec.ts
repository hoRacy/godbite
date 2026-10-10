import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test.beforeEach(async ({page})=>{
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Test projection</body></html>'}));
});
test('first frame, working assets, default ambient and lazy film playback',async({page})=>{
  const errors:string[]=[],missing:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|ERROR: 0:/.test(message.text()))errors.push(message.text());});
  page.on('response',response=>{if(response.url().includes('/godbite/')&&response.status()>=400)missing.push(response.url());});
  await page.goto('./');
  await expect(page.locator('#hero-title')).toBeVisible();
  await expect(page.locator('.main-nav')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/scene-ready|still-mode/);
  await expect(page.locator('iframe')).toHaveCount(0);
  const audioAvailable=await page.evaluate(()=>Boolean(window.AudioContext || (window as any).webkitAudioContext));
  if(audioAvailable)await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true');
  else await expect(page.locator('#sound-toggle')).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);expect(missing).toEqual([]);
  const bytes=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((sum,entry)=>sum+(entry as PerformanceResourceTiming).encodedBodySize,0));
  expect(bytes).toBeLessThan(2.5*1024*1024);
});
test('five recordings, latest listening in two clicks and dialog keyboard behavior',async({page})=>{
  await page.goto('./');
  await page.locator('[data-nav=music]').click();
  await expect(page.locator('#release-dialog')).toBeVisible();
  await expect(page.locator('#release-title')).toHaveText('Social Media Girls');
  await expect(page.locator('#release-links a').first()).toHaveAttribute('href','https://open.spotify.com/album/4yji0Hoa0DhRDht4PMfB3z');
  for(const title of ['JISM','Mir','the Aristocrats','You can lead a horse EP']){
    await page.locator('#next-release').click();
    await expect(page.locator('#release-title')).toHaveText(title);
    if(title==='the Aristocrats')await expect(page.locator('#release-links a').first()).toHaveAttribute('href','https://open.spotify.com/album/2bHyQF36UreAU70VC7mx3l');
    if(title==='You can lead a horse EP')await expect(page.locator('#release-links a').first()).toHaveAttribute('href','https://open.spotify.com/album/2dEzIU90xRp9QfZoYCWYD2');
    await expect.poll(()=>page.locator('#release-cover').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    await expect(page.locator('#release-links a').last()).toHaveAttribute('href',/godbite.bandcamp.com/);
  }
  await page.keyboard.press('Escape');await expect(page.locator('#release-dialog')).not.toBeVisible();
  await expect(page.locator('[data-nav=music]')).toBeFocused();
  await expect(page.locator('#release-list button')).toHaveCount(5);
  await page.locator('[data-release=mir]').click();
  await expect(page.locator('#release-title')).toHaveText('Mir');
  await expect(page.locator('#art-credit')).toContainText('Artur Ciechorski');
});

for(const reducedMotion of ['no-preference','reduce'] as const){
 test(`tracklist unfolds beneath the current recording (${reducedMotion})`,async({page})=>{
  await page.emulateMedia({reducedMotion});await page.goto('./');
  await page.locator('[data-nav=music]').click();await page.keyboard.press('Escape');
  await expect(page.locator('.recording-panel')).toHaveCount(0);
  for(const [index,title,count,first,duration] of [
   [0,'Social Media Girls',1,'Social Media Girls','08:21'],[1,'JISM',3,'DICK PUMP','07:27'],
   [2,'Mir',9,"Walkin' Phoenix",'05:28'],[3,'the Aristocrats',9,'David Lynch','05:08'],[4,'You can lead a horse EP',3,'you can lead a horse',''],
  ] as const){
   await page.evaluate(index=>{const music=document.getElementById('music')!.offsetTop,cinema=document.getElementById('cinema')!.offsetTop;window.scrollTo({top:music+(cinema-music)*index*.13/.84,behavior:'instant'});},index);
   const current=page.locator('#release-list>li.is-current');
   await expect(current.locator('.release-list-title')).toHaveText(title);
   await expect(current.locator('.release-tracks li')).toHaveCount(count);
   await expect(current.locator('.track-title').first()).toHaveText(first);
   await expect(current.locator('.track-duration').first()).toHaveText(duration);
   await expect(current.locator('.release-track-drawer')).toHaveAttribute('aria-hidden','false');
   await expect(page.locator('.release-track-drawer[aria-hidden=false]')).toHaveCount(1);
   if(index===2){await page.waitForTimeout(500);await page.screenshot({path:`test-results/track-drawer-${page.viewportSize()!.width}-${reducedMotion}.png`});}
  }
 });
}
test('all four films use the right player and closing removes playback',async({page})=>{
  await page.goto('./');await page.locator('[data-nav=cinema]').click();
  await expect(page.locator('.cinema-stage')).toBeVisible();
  const films=[['social-media-girls','y5Bw0fB5nU8'],['walkin-phoenix','KlZBHri5y1Q'],['tarrare-52','p68ABWJqxCI'],['elbow-grease','Fu1c32l8bqk']];
  for(const [id,youtube] of films){
    await page.locator('[data-film='+id+']').click();await page.locator('#cinema-play').click();
    await expect(page.locator('#film-player iframe')).toHaveAttribute('src',new RegExp('/embed/'+youtube+'\\?'));
    await expect(page.locator('#external-film')).toHaveAttribute('href','https://www.youtube.com/watch?v='+youtube);
    await page.keyboard.press('Escape');await expect(page.locator('iframe')).toHaveCount(0);
  }
});

for(const reducedMotion of ['no-preference','reduce'] as const){
 test(`the hidden figure reveals Godrite and closes other playback (${reducedMotion})`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion});await page.goto('./');
  await expect(page.locator('#secret-figure')).not.toBeVisible();
  await page.locator('[data-nav=live]').click();await page.waitForTimeout(2000);
  const figure=page.locator('#secret-figure');await expect(figure).toBeVisible();
  const bounds=await figure.boundingBox(),viewport=page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThan(viewport.width*.7);
  expect(bounds!.x+bounds!.width/2).toBeLessThan(viewport.width);
  expect(bounds!.y+bounds!.height).toBeLessThan(viewport.height);
  await expect(page.locator('iframe')).toHaveCount(0);
  if(reducedMotion==='reduce'&&viewport.width<800){
    await expect(page.locator('#still-world')).toHaveCSS('background-image',/live-mobile\.webp/);
    expect((await page.request.get('images/live-mobile.webp')).ok()).toBe(true);
  }
  await page.locator('#live-play').click();await figure.click();
  await expect(page.locator('#film-dialog')).toBeVisible();
  await expect(page.locator('#projection-title')).toHaveText('Godrite — Secret live concert');
  await expect(page.locator('#projection-kind')).toHaveText('The club');
  await expect(page.locator('#film-player iframe')).toHaveAttribute('src',/embed\/ql6nWvkPoUI\?autoplay=1/);
  await expect(page.locator('#external-film')).toHaveAttribute('href','https://www.youtube.com/watch?v=ql6nWvkPoUI');
  await expect(page.locator('#live-screen-player iframe')).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(page.locator('iframe')).toHaveCount(0);await expect(figure).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('#film-dialog')).toBeVisible();
  await page.keyboard.press('Escape');await page.locator('[data-nav=cinema]').click();
  await expect(figure).not.toBeVisible();await page.locator('#cinema-play').click();
  await expect(page.locator('#projection-kind')).toHaveText('The cinema');
  await expect(page.locator('#film-player iframe')).toHaveAttribute('src',/embed\/y5Bw0fB5nU8\?/);
  expect(errors).toEqual([]);
 });
}

for(const reducedMotion of ['no-preference','reduce'] as const){
 test(`live club plays the concert on its screen and stops on departure (${reducedMotion})`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion});await page.goto('./');
  await page.locator('[data-nav=live]').click();
  await expect(page.locator('body')).toHaveAttribute('data-chapter','live');
  await expect(page.locator('#live-title')).toHaveText('Godbite @ Jambar');
  await expect(page.locator('#chapter-number')).toHaveText('04');
  await expect(page.locator('.total-chapters')).toHaveText('05');
  await page.waitForTimeout(2000);
  await page.screenshot({path:`test-results/live-${page.viewportSize()!.width}-${reducedMotion}.png`});
  await page.locator('#live-play').click();
  await expect(page.locator('body')).toHaveClass(/live-playing/);
  await expect(page.locator('#live-screen-player iframe')).toHaveAttribute('src',/embed\/KYkbLPMH7xA\?autoplay=1/);
  await expect(page.locator('#live-stop')).toBeVisible();await expect(page.locator('#live-stop')).toBeInViewport();
  if(reducedMotion==='reduce'){
    await expect(page.locator('#still-live-playing')).toHaveCSS('opacity','1');
    const name=page.viewportSize()!.width<800?'live-mobile-playing':'live-playing';
    await expect(page.locator('#still-live-playing')).toHaveCSS('background-image',new RegExp(name+'\\.webp'));
    expect((await page.request.get('images/'+name+'.webp')).ok()).toBe(true);
  }
  const bounds=await page.locator('#live-screen-player iframe').boundingBox();expect(bounds!.width).toBeGreaterThan(100);expect(bounds!.height).toBeGreaterThan(60);
  await page.locator('#live-stop').click();await expect(page.locator('#live-screen-player iframe')).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-chapter','live');
  await expect(page.locator('#live-stop')).not.toBeVisible();await expect(page.locator('#live-play')).toBeFocused();
  await expect(page.locator('body')).not.toHaveClass(/live-playing/);
  if(reducedMotion==='reduce')await expect(page.locator('#still-live-playing')).toHaveCSS('opacity','0');
  await page.locator('#live-play').click();await page.locator('[data-nav=contact]').click();
  await expect(page.locator('#live-screen-player iframe')).toHaveCount(0);
  await expect(page.locator('#chapter-number')).toHaveText('05');
  await expect(page.locator('.contact-address>a')).toBeVisible();
  expect(errors).toEqual([]);
 });
}

test('drums fade during screen playback and return even with world motion paused',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chrome','Compare the rendered drum kit in desktop Chromium.');
 await page.goto('./');await expect(page.locator('body')).toHaveClass(/scene-ready/);
 await page.locator('[data-nav=live]').click();await page.waitForTimeout(2000);
 await page.locator('#motion-toggle').click();await page.waitForTimeout(1000);
 const screen=await page.locator('#live-screen-player').boundingBox(),viewport=page.viewportSize()!;
 const clip={x:viewport.width*.44,y:Math.ceil(screen!.y+screen!.height)+2,width:viewport.width*.12,height:viewport.height*.045};
 const resolution=await page.locator('#world-canvas').evaluate((canvas:HTMLCanvasElement)=>[canvas.width,canvas.height]);
 const before=await page.screenshot({clip,path:testInfo.outputPath('drums-before.png')});
 await page.locator('#live-play').click();await page.waitForTimeout(1600);
 const playing=await page.screenshot({clip,path:testInfo.outputPath('drums-playing.png')});expect(playing.equals(before)).toBe(false);
 await page.waitForTimeout(300);expect((await page.screenshot({clip})).equals(playing)).toBe(true);
 await page.locator('#live-stop').click();await page.waitForTimeout(1600);
 expect(await page.locator('#world-canvas').evaluate((canvas:HTMLCanvasElement)=>[canvas.width,canvas.height])).toEqual(resolution);
 const restored=await page.screenshot({clip,path:testInfo.outputPath('drums-restored.png')});
 const [originalPixels,playingPixels,restoredPixels]=await Promise.all([before,playing,restored].map(image=>sharp(image).raw().toBuffer()));
 const difference=(pixels:Buffer)=>originalPixels.reduce((sum,value,index)=>sum+Math.abs(value-pixels[index]),0)/originalPixels.length;
 // Allow tiny changes in translucent chrome rendering while requiring the kit to return visibly.
 expect(difference(restoredPixels)).toBeLessThan(3);
 expect(difference(restoredPixels)).toBeLessThan(difference(playingPixels)*.35);
});

test('cinema screen changes for every film while motion is paused',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='chrome','Exercise the rendered screen in desktop Chromium.');
 await page.goto('./');await expect(page.locator('body')).toHaveClass(/scene-ready/);
 await page.locator('[data-nav=cinema]').click();
 await page.locator('#motion-toggle').click();await page.waitForTimeout(2000);
 const viewport=page.viewportSize()!;
 const clip={x:viewport.width*.4,y:viewport.height*.36,width:viewport.width*.2,height:viewport.height*.18};
 let previous=await page.screenshot({clip});
 for(const id of ['walkin-phoenix','tarrare-52','elbow-grease','social-media-girls','walkin-phoenix']){
  await page.locator('[data-film='+id+']').click();
  await expect.poll(async()=>!(await page.screenshot({clip})).equals(previous)).toBe(true);
  previous=await page.screenshot({clip});
 }
});

test('static cinema changes to the selected film',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');
 await page.locator('[data-nav=cinema]').click();
 for(const id of ['walkin-phoenix','tarrare-52','elbow-grease']){
  await page.locator('[data-film='+id+']').click();
  await expect(page.locator('#still-world')).toHaveCSS('background-image',new RegExp('cinema-'+id+'\\.webp'));
  const response=await page.request.get('images/cinema-'+id+'.webp');expect(response.ok()).toBe(true);
 }
});
test('Polish translation persists and booking stays directly available',async({page})=>{
  await page.goto('./');await page.locator('[data-lang=pl]').click();
  await expect(page.locator('html')).toHaveAttribute('lang','pl');
  await expect(page.locator('[data-nav=music]')).toHaveText('Słuchaj');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','pl');
  await page.locator('[data-nav=contact]').click();
  await expect(page.locator('#contact-title')).toHaveText('Wpuść nas.');
  await expect(page.locator('.contact-address>a')).toHaveAttribute('href','mailto:godbite@gmail.com');
  await expect(page.locator('#social-links a')).toHaveCount(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('[data-lang=en]').click();await expect(page.locator('#contact-title')).toHaveText('Let it in.');
});
test('ambient starts with interaction, stays muted by choice, and motion can pause',async({page})=>{
  await page.goto('./');
  const audioAvailable=await page.evaluate(()=>Boolean(window.AudioContext || (window as any).webkitAudioContext));
  if(audioAvailable){
    await page.locator('.brand').click();
    await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
    await expect(page.locator('#sound-hint')).not.toBeVisible();
    await page.locator('#sound-toggle').click();
    await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');
    await page.reload();await expect(page.locator('body')).toHaveAttribute('data-sound','off');
    await page.locator('.brand').click();await expect(page.locator('body')).toHaveAttribute('data-sound','off');
    await page.locator('#sound-toggle').click();
    await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
    await page.locator('[data-play=social-media-girls]').click();
    await expect(page.locator('body')).toHaveAttribute('data-sound','film');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
  }else await expect(page.locator('#sound-toggle')).toBeDisabled();
  if(await page.locator('body').evaluate(body=>body.classList.contains('still-mode'))){
    await expect(page.locator('#motion-toggle')).not.toBeVisible();
  }else{
    await page.locator('#motion-toggle').click();await expect(page.locator('#motion-toggle')).toHaveAttribute('aria-pressed','true');
  }
});
for(const interaction of ['pointermove','pointerdown','pointerup','wheel','scroll','touchstart','touchmove','touchend','click','keydown']){
  test(`ambient attempts to start on ${interaction}`,async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(()=>{
      const Native=window.AudioContext;
      window.AudioContext=class extends Native {
        private playing=false;
        get state(): AudioContextState {return this.playing?'running':'suspended';}
        async resume(){this.playing=true;}
      };
    });
    await page.goto('./');
    await expect(page.locator('body')).toHaveAttribute('data-sound','waiting');
    // This isolates event wiring from the browser's separate autoplay policy.
    await page.evaluate(type=>document.body.dispatchEvent(new Event(type,{bubbles:true})),interaction);
    await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
    await expect(page.locator('#sound-hint')).not.toBeVisible();
    await page.locator('#sound-toggle').click();
    await page.evaluate(type=>document.body.dispatchEvent(new Event(type,{bubbles:true})),interaction);
    await expect(page.locator('body')).toHaveAttribute('data-sound','off');
  });
}

test('mouse movement blocked by autoplay stays retryable after the timeout',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    let activated=false;
    document.addEventListener('pointerdown',()=>{activated=true;},true);
    Object.defineProperty(navigator,'userActivation',{value:{
      get isActive(){return activated;},get hasBeenActive(){return activated;},
    }});
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      private playing=false;
      get state(): AudioContextState {return this.playing?'running':'suspended';}
      resume(): Promise<void> {
        if(!navigator.userActivation.isActive)return new Promise(()=>{});
        this.playing=true;return Promise.resolve();
      }
    };
  });
  await page.goto('./');
  await page.mouse.move(40,100);
  await page.waitForTimeout(4500);
  await expect(page.locator('body')).toHaveAttribute('data-sound','waiting');
  await expect(page.locator('#sound-toggle')).toBeEnabled();
  await page.locator('.brand').click();
  await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
});

test('a click can unlock audio while a mouse-move resume is pending',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      private playing=false;
      get state(): AudioContextState {return this.playing?'running':'suspended';}
      resume(): Promise<void> {
        if(!navigator.userActivation.isActive)return new Promise(()=>{});
        this.playing=true;this.dispatchEvent(new Event('statechange'));return Promise.resolve();
      }
    };
  });
  await page.goto('./');
  await page.mouse.move(40,100);
  await page.locator('.brand').click();
  await expect(page.locator('body')).toHaveAttribute('data-sound','playing');
});

test('reduced motion uses actual scene stills with working recording links',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('./');
  await expect(page.locator('body')).toHaveClass(/still-mode/);
  expect(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>/world-.*\.js/.test(entry.name)))).toBe(false);
  await page.locator('[data-nav=music]').click();await page.keyboard.press('Escape');
  await expect(page.locator('#still-world')).toHaveCSS('background-image',/music.webp/);
  await page.locator('[data-release=horse]').click();await expect(page.locator('#release-title')).toHaveText('You can lead a horse EP');
});
test('WebGL denial leaves an accessible complete site',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type:any,...args:any[]){
      if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;
      return original.apply(this,[type,...args] as any);
    } as typeof original;
  });
  await page.goto('./');await expect(page.locator('body')).toHaveClass(/still-mode/);
  await page.locator('[data-nav=contact]').click();await expect(page.locator('.contact-address>a')).toBeVisible();
});
test('context loss switches to stills without losing navigation',async({page},testInfo)=>{
  test.skip(!testInfo.project.name.includes('chrome'),'GPU context is exercised in Chromium.');
  await page.goto('./');await expect(page.locator('body')).toHaveClass(/scene-ready/);
  await page.locator('#world-canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.locator('body')).toHaveClass(/still-mode/);
  await page.locator('[data-nav=music]').click();await expect(page.locator('#release-dialog')).toBeVisible();
});

test('missing audio output gives a clear fallback and keeps contact usable',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    const Native=window.AudioContext || (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if(Native)window.AudioContext=class extends Native {
      get state(): AudioContextState {return 'suspended';}
      resume(): Promise<void> {return new Promise(()=>{});}
    };
  });
  await page.goto('./');
  await page.locator('.brand').click();
  await expect(page.locator('#sound-toggle')).toBeDisabled();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-label','Sound unavailable');
  await page.locator('[data-nav=contact]').click();
  await expect(page.locator('.contact-address>a')).toBeVisible();
});
