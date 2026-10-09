import { test, expect } from '@playwright/test';

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
