import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../public/images/', import.meta.url);
const output = new URL('../test-results/visual/', import.meta.url);
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
for(const chapter of ['threshold','music','cinema','contact']){
  await page.evaluate(id=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo({top:document.getElementById(id).offsetTop,behavior:'instant'});},chapter);
  await page.waitForTimeout(1800);
  const png=await page.locator('#world-canvas').evaluate(canvas=>canvas.toDataURL('image/png'));
  images.push([chapter,await sharp(Buffer.from(png.split(',')[1],'base64')).resize(1600,1000).webp({quality:82}).toBuffer()]);
  await page.screenshot({path:fileURLToPath(new URL('desktop-'+chapter+'.png',output))});
}
await page.setViewportSize({width:390,height:844});
for(const chapter of ['threshold','music','cinema','contact']){
  await page.evaluate(id=>window.scrollTo({top:document.getElementById(id).offsetTop,behavior:'instant'}),chapter);
  await page.waitForTimeout(1300);
  await page.screenshot({path:fileURLToPath(new URL('mobile-'+chapter+'.png',output))});
}
await page.setViewportSize({width:1200,height:630});
await page.evaluate(()=>{window.scrollTo({top:0,behavior:'instant'});document.querySelectorAll('.masthead,.frame-footer,.hero-lower,.frame-mark').forEach(element=>element.style.display='none');});
await page.waitForTimeout(1300);
const socialCard=await page.screenshot({type:'jpeg',quality:90});
console.log('Browser errors:',JSON.stringify(errors));
await browser.close();
for(const [name,buffer] of images)await writeFile(new URL(name+'.webp',root),buffer);
await writeFile(new URL('social-card.jpg',root),socialCard);
console.log('Captured four scene stills, desktop/mobile previews and the social card.');
