import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const route=ts.transpileModule(readFileSync(new URL('../src/journey.ts',import.meta.url),'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText.replace(/\bexport /g,'');

test('trees on the gallery exit arc move behind the records and clear both camera routes',async({page})=>{
 await page.addScriptTag({content:route+'\nwindow.godbiteRoute={forestTreePosition,cameraRoute};'});
 const trees=await page.evaluate(()=>{
  const {forestTreePosition,cameraRoute}=(window as any).godbiteRoute;
  return [[18,-43],[20,-48],[22,-56],[16.5,-60],[22,-64]].map(([x,z],index)=>{
   const relocated=forestTreePosition(x,z,index);
   const distance=Math.min(...[false,true].flatMap(mobile=>Array.from({length:2001},(_,i)=>{
    const point=cameraRoute(i/1000,mobile).position;
    return Math.hypot(relocated[0]-point[0],relocated[1]-point[2]);
   })));
   return {relocated,distance};
  });
 });
 for(const tree of trees){expect(tree.relocated[1]).toBeLessThan(-48);expect(tree.distance).toBeGreaterThan(5.4);}
});

test('the forest door and first stone stay on the central forward axis',async({page})=>{
 await page.addScriptTag({content:route+'\nwindow.godbiteRoute={cameraRoute,forestDoor};'});
 const result=await page.evaluate(()=>{
  const {cameraRoute,forestDoor}=(window as any).godbiteRoute;
  return [false,true].map(mobile=>({mobile,door:forestDoor(mobile),
   frames:[0,.25,.5,.75,.9,1,1.16].map(p=>({p,...cameraRoute(p,mobile)}))}));
 });
 for(const {door,frames} of result){
  for(const frame of frames){
   expect(frame.position[0]).toBe(0);expect(frame.target[0]).toBe(0);
   expect(frame.position[1]).toBe(3.5);expect(frame.target[1]).toBe(3.5);
   expect(frame.target[2]).toBeLessThan(frame.position[2]);
  }
  const crossing=frames.find(frame=>frame.p===.9)!;
  expect(door.position[0]).toBeCloseTo(crossing.position[0],8);
  expect(door.position[2]).toBeCloseTo(crossing.position[2],8);
  expect(crossing.lookAround).toBeLessThan(.001);
  expect(door.rotation).toBe(0);
  expect(frames.at(-1)!.target).toEqual([0,3.5,-48]);
 }
});

test('every recording and the cinema are centred along a continuous viewing axis',async({page})=>{
 await page.addScriptTag({content:route+'\nwindow.godbiteRoute={cameraRoute,RECORD_STOPS,DOOR_CROSSINGS,SCREEN_CROSSING,interiorLayout};'});
 const result=await page.evaluate(()=>{
  const {cameraRoute,RECORD_STOPS,DOOR_CROSSINGS,SCREEN_CROSSING,interiorLayout}=(window as any).godbiteRoute;
  return [false,true].map(mobile=>({mobile,
   records:RECORD_STOPS.map((stop:number)=>cameraRoute(stop,mobile)),
   entrance:cameraRoute(1.9,mobile),cinema:cameraRoute(2,mobile),layout:interiorLayout(mobile),
   doors:DOOR_CROSSINGS.map((p:number)=>cameraRoute(p,mobile)),
   screenCrossing:cameraRoute(SCREEN_CROSSING,mobile),
   headings:Array.from({length:201},(_,i)=>{
    const view=cameraRoute(1+i/100,mobile);
    return Math.atan2(view.target[0]-view.position[0],view.position[2]-view.target[2]);
   })}));
 });
 for(const item of result){
  const scale=item.mobile?.75:1;
  const toWorld=(x:number,z:number)=>[x,-48+z];
  for(let index=0;index<5;index++){
   const target=toWorld(index*4.4*scale,-[0,1.8,3.6,1.8,0][index]*scale);
   expect(item.records[index].target[0]).toBeCloseTo(target[0],8);
   expect(item.records[index].target[2]).toBeCloseTo(target[1],8);
  }
  // The doorway and default cinema view share the same centreline, with no sideways correction after entry.
  const door=toWorld(22*scale,-16);
  expect(item.entrance.position[0]).toBeCloseTo(door[0],8);
  expect(item.entrance.position[2]).toBeCloseTo(door[1],8);
  expect(item.entrance.lookAround).toBeLessThan(.001);
  const distance=Math.hypot(item.cinema.target[0]-item.cinema.position[0],item.cinema.target[2]-item.cinema.position[2]);
  expect(distance).toBeCloseTo(item.mobile?20:18,8);
  for(const heading of item.headings)expect(heading).toBeCloseTo(0,8);
  for(const view of item.doors){
   expect(view.position[0]).toBeCloseTo(view.target[0],8);
   expect(view.position[1]).toBeCloseTo(view.target[1],8);
   expect(view.lookAround).toBe(0);
  }
  expect(item.doors).toHaveLength(2);
  expect(item.screenCrossing.position[2]).toBe(item.layout.origin[2]+item.layout.cinemaZ);
  expect(item.screenCrossing.position[0]).toBe(item.screenCrossing.target[0]);
 }
});

test('camera velocity and acceleration join smoothly and the exit arc clears the final stone',async({page})=>{
 await page.addScriptTag({content:route+'\nwindow.godbiteRoute={cameraRoute,RECORD_STOPS};'});
 const results=await page.evaluate(()=>{
  const {cameraRoute,RECORD_STOPS}=(window as any).godbiteRoute,epsilon=1e-6;
  return [false,true].map(mobile=>({mobile,
   joins:[1,...RECORD_STOPS,1.82,1.9,2,2.5,2.6,3,3.5,3.65].map(p=>{
    const before=cameraRoute(p-epsilon,mobile),at=cameraRoute(p,mobile),after=cameraRoute(p+epsilon,mobile);
    return (['position','target'] as const).map(key=>at[key].map((value:number,axis:number)=>({
     left:(value-before[key][axis])/epsilon,right:(after[key][axis]-value)/epsilon,
     acceleration:(after[key][axis]-2*value+before[key][axis])/(epsilon*epsilon),
    })));
   }),
   arc:Array.from({length:141},(_,i)=>cameraRoute(1.68+i*.001,mobile).position),
  }));
 });
 for(const item of results){
  for(const join of item.joins)for(const key of join)for(const axis of key){
   expect(Math.abs(axis.left-axis.right)).toBeLessThan(.001);
   expect(Math.abs(axis.acceleration)).toBeLessThan(2);
  }
  const scale=item.mobile?.75:1;
  for(const position of item.arc){
   expect(position[1]).toBe(3.5);
   if(Math.abs(position[2]+48)<.8*scale)expect(position[0]).toBeGreaterThan((17.6+1.5)*scale);
  }
 }
});

test('mist and rooms fade continuously without revealing the cinema during the record visits',async({page})=>{
 await page.addScriptTag({content:route+'\nwindow.godbiteRoute={scenePresence,RECORD_STOPS};'});
 const result=await page.evaluate(()=>{
  const {scenePresence,RECORD_STOPS}=(window as any).godbiteRoute;
  return {records:RECORD_STOPS.map((p:number)=>scenePresence(p)),
   samples:Array.from({length:4001},(_,i)=>scenePresence(i*.001))};
 });
 for(const stop of result.records){expect(stop.forest).toBe(1);expect(stop.gallery).toBe(1);expect(stop.cinema).toBe(0);}
 for(let i=1;i<result.samples.length;i++){
  for(const key of Object.keys(result.samples[i])){
    expect(Math.abs(result.samples[i][key]-result.samples[i-1][key])).toBeLessThan(.012);
  }
 }
 expect(result.samples[1100].forest).toBeGreaterThan(.8);
 expect(result.samples[1900].cinema).toBeGreaterThan(0);
 expect(result.samples[1900].cinema).toBeLessThan(1);
 expect(result.samples[2500].cinema).toBeGreaterThan(.9);
 expect(result.samples[2640].cinema).toBe(0);
 expect(result.samples[3000].live).toBe(1);
 expect(result.samples[3000].signal).toBe(0);
 expect(result.samples[3860].signal).toBe(1);
});

test('all opening text disappears before halfway through the forest, ahead of the door',async({page})=>{
 await page.goto('./');
 await page.evaluate(()=>{
  document.documentElement.style.scrollBehavior='auto';
  const end=document.getElementById('music')!.offsetTop;
  window.scrollTo({top:end*.5/1.16,behavior:'instant'});
 });
 await expect(page.locator('.hero-stage')).toBeHidden();
 await expect(page.locator('#hero-title')).toBeHidden();
 await expect(page.locator('.hero-poem')).toBeHidden();
 await expect(page.locator('body')).toHaveAttribute('data-chapter','threshold');
});
