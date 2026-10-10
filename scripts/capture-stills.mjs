import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../public/images/', import.meta.url);
const output = new URL('../test-results/visual/', import.meta.url);
const liveOnly=process.argv.includes('--live-only');
const chapters=liveOnly?['live']:['threshold','music','cinema','live','contact'];
await mkdir(root,{recursive:true});await mkdir(output,{recursive:true});
const browser=await chromium.launch({
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-gpu-sandbox'],
});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.goto((process.argv[2]||'http://127.0.0.1:5173/godbite/')+'?capture=1');
await page.waitForSelector('body.scene-ready',{timeout:30000});
await page.evaluate(()=>document.fonts.ready);
const images=[];
await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body>Capture projection</body></html>'}));
async function capturePlaying(name){
  await page.locator('#live-play').click();await page.waitForTimeout(1800);
  const png=await page.locator('#world-canvas').evaluate(canvas=>canvas.toDataURL('image/png'));
  images.push([name,await sharp(Buffer.from(png.split(',')[1],'base64')).webp({quality:82}).toBuffer()]);
  await page.screenshot({path:fileURLToPath(new URL(name+'.png',output))});
  await page.locator('#live-stop').click();await page.waitForTimeout(1800);
  await page.locator('#motion-toggle').click();
}
for(const chapter of chapters){
  await page.evaluate(id=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:document.getElementById(id).offsetTop,behavior:'instant'});},chapter);
  await page.waitForTimeout(1800);
  if(chapter==='live')await page.locator('#motion-toggle').click();
  const png=await page.locator('#world-canvas').evaluate(canvas=>canvas.toDataURL('image/png'));
  images.push([chapter,await sharp(Buffer.from(png.split(',')[1],'base64')).resize(1600,1000).webp({quality:82}).toBuffer()]);
  await page.screenshot({path:fileURLToPath(new URL('desktop-'+chapter+'.png',output))});
  if(chapter==='live')await capturePlaying('live-playing');
}
if(!liveOnly){
await page.evaluate(()=>window.scrollTo({top:document.getElementById('cinema').offsetTop,behavior:'instant'}));
for(const film of ['walkin-phoenix','tarrare-52','elbow-grease']){
  await page.locator('[data-film='+film+']').click();
  await page.waitForTimeout(1800);
  const png=await page.locator('#world-canvas').evaluate(canvas=>canvas.toDataURL('image/png'));
  images.push(['cinema-'+film,await sharp(Buffer.from(png.split(',')[1],'base64')).resize(1600,1000).webp({quality:82}).toBuffer()]);
}
await page.locator('[data-film=social-media-girls]').click();
}
await page.setViewportSize({width:390,height:844});
for(const chapter of chapters){
  await page.evaluate(id=>window.scrollTo({top:document.getElementById(id).offsetTop,behavior:'instant'}),chapter);
  await page.waitForTimeout(1300);
  if(chapter==='live'){
    await page.locator('#motion-toggle').click();
    const png=await page.locator('#world-canvas').evaluate(canvas=>canvas.toDataURL('image/png'));
    images.push(['live-mobile',await sharp(Buffer.from(png.split(',')[1],'base64')).webp({quality:82}).toBuffer()]);
  }
  await page.screenshot({path:fileURLToPath(new URL('mobile-'+chapter+'.png',output))});
  if(chapter==='live')await capturePlaying('live-mobile-playing');
}
let socialCard;
if(!liveOnly){
await page.setViewportSize({width:1200,height:630});
await page.evaluate(()=>{window.scrollTo({top:0,behavior:'instant'});document.querySelectorAll('.masthead,.frame-footer,.hero-lower,.frame-mark').forEach(element=>element.style.display='none');});
await page.waitForTimeout(1300);
socialCard=await page.screenshot({type:'jpeg',quality:90});
}
console.log('Browser errors:',JSON.stringify(errors));
await browser.close();
for(const [name,buffer] of images)await writeFile(new URL(name+'.webp',root),buffer);
if(socialCard)await writeFile(new URL('social-card.jpg',root),socialCard);
console.log(liveOnly?'Captured the live club for desktop and mobile.':'Captured five scene stills, desktop/mobile previews and the social card.');
