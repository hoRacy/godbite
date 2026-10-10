type Point=[number,number,number];
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const smooth=(value:number)=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
const mix=(a:Point,b:Point,t:number)=>a.map((value,index)=>value+(b[index]-value)*t) as Point;
const fade=(p:number,start:number,end:number)=>smooth((p-start)/(end-start));

export const RECORD_STOPS=[1.16,1.29,1.42,1.55,1.68] as const;
export const SCENE_ANCHORS=[0,RECORD_STOPS[0],2,3] as const;
export const DOOR_CROSSINGS=[.9,1.9] as const;
export const SCREEN_CROSSING=2.6;
export const CAMERA_HEIGHT=3.5;

export function forestDoor(mobile:boolean){
 const {position}=cameraRoute(DOOR_CROSSINGS[0],mobile);
 return {position:[0,0,position[2]] as Point,rotation:0};
}

/** Rooms follow two straight doorway axes, joined by the gallery's level arc. */
export function interiorLayout(mobile:boolean){
 const scale=mobile?.75:1;
 return {origin:[0,0,-48] as Point,rotation:0,scale,
  galleryCenterX:8.8*scale,cinemaX:22*scale,cinemaZ:-53,exitZ:-16,signalZ:-104};
}

export function interiorPoint(point:Point,mobile:boolean):Point{
 const {origin,rotation}=interiorLayout(mobile),c=Math.cos(rotation),s=Math.sin(rotation);
 return [origin[0]+point[0]*c+point[2]*s,point[1],origin[2]-point[0]*s+point[2]*c];
}

interface Stop { at:number; position:Point; target:Point }

function routeStops(mobile:boolean):Stop[]{
 const {scale,cinemaX,cinemaZ,exitZ,signalZ}=interiorLayout(mobile);
 return [
  {at:0,position:[0,CAMERA_HEIGHT,64],target:[0,CAMERA_HEIGHT,0]},
  {at:1,position:[0,CAMERA_HEIGHT,17],target:[0,CAMERA_HEIGHT,0]},
  ...RECORD_STOPS.map((at,index):Stop=>{
   const x=index*4.4*scale,z=-(2-Math.abs(index-2))*1.8*scale;
   return {at,position:[x,CAMERA_HEIGHT,z+(mobile?8.8:10.5)],target:[x,CAMERA_HEIGHT,z]};
  }),
  // A single level arc clears the last stone, then joins the cinema's straight aisle.
  {at:1.82,position:[cinemaX,CAMERA_HEIGHT,-8],target:[cinemaX,CAMERA_HEIGHT,-30]},
  {at:DOOR_CROSSINGS[1],position:[cinemaX,CAMERA_HEIGHT,exitZ],target:[cinemaX,CAMERA_HEIGHT,cinemaZ]},
  {at:2,position:[cinemaX,CAMERA_HEIGHT,cinemaZ+(mobile?20:18)],target:[cinemaX,CAMERA_HEIGHT,cinemaZ]},
  {at:2.5,position:[cinemaX,CAMERA_HEIGHT,cinemaZ+3],target:[cinemaX,CAMERA_HEIGHT,signalZ]},
  {at:SCREEN_CROSSING,position:[cinemaX,CAMERA_HEIGHT,cinemaZ],target:[cinemaX,CAMERA_HEIGHT,signalZ]},
  {at:3,position:[cinemaX,CAMERA_HEIGHT,cinemaZ-25],target:[cinemaX,CAMERA_HEIGHT,signalZ]},
 ];
}

/** Bounded tangents keep coordinates monotonic and prevent overshoot into scenery. */
function tangent(stops:Stop[],index:number,key:'position'|'target',axis:number){
 if(index===0||index===stops.length-1)return 0;
 const previous=stops[index-1],current=stops[index],next=stops[index+1];
 const a=(current[key][axis]-previous[key][axis])/(current.at-previous.at);
 const b=(next[key][axis]-current[key][axis])/(next.at-current.at);
 if(a*b<=0)return 0;
 return Math.sign(a)*Math.min(Math.abs(2*a*b/(a+b)),1.5*Math.min(Math.abs(a),Math.abs(b)));
}

// Shared endpoint velocities and zero endpoint acceleration make the entire dolly C2-continuous.
function interpolate(stops:Stop[],index:number,key:'position'|'target',t:number):Point{
 const start=stops[index],end=stops[index+1],duration=end.at-start.at;
 const t2=t*t,t3=t2*t,t4=t3*t,t5=t4*t;
 const blend=10*t3-15*t4+6*t5;
 const incoming=t-6*t3+8*t4-3*t5,outgoing=-4*t3+7*t4-3*t5;
 return mix(start[key],end[key],blend).map((value,axis)=>value+duration*(
  tangent(stops,index,key,axis)*incoming+tangent(stops,index+1,key,axis)*outgoing
 )) as Point;
}

const desktopStops=routeStops(false),mobileStops=routeStops(true);

export function cameraRoute(progress:number,mobile:boolean){
 const p=clamp(progress,0,3),stops=mobile?mobileStops:desktopStops;
 // Suppress pointer sway throughout the straight entrances, including their approaches.
 const lookAround=fade(p,1.04,1.16)*(1-fade(p,1.68,1.82));
 const next=stops.findIndex(stop=>stop.at>p);
 const index=next===-1?stops.length-2:Math.max(0,next-1);
 const start=stops[index],end=stops[index+1],t=(p-start.at)/(end.at-start.at);
 return {position:interiorPoint(interpolate(stops,index,'position',t),mobile),
  target:interiorPoint(interpolate(stops,index,'target',t),mobile),lookAround};
}

const cameraClearancePoints=[false,true].flatMap(mobile=>
 Array.from({length:401},(_,index)=>cameraRoute(index/200,mobile).position));

/** Keep trunks, leaning tops and branches outside both viewport routes. */
export function forestTreePosition(x:number,z:number,index:number):[number,number]{
 const clear=(a:number,b:number)=>cameraClearancePoints.every(point=>Math.hypot(a-point[0],b-point[2])>5.5);
 if(clear(x,z))return [x,z];
 const behindX=-3+(index%7)*3.4,behindZ=-58-(Math.floor(index/7)%4)*3;
 if(clear(behindX,behindZ))return [behindX,behindZ];
 return [-9-(index%5)*2,-55-(index%7)*3];
}

/** Fade both geometry and its lights; never replace a room or its mist in a single frame. */
export function scenePresence(progress:number){
 return {forest:1-fade(progress,1.76,1.94),gallery:fade(progress,.68,.88)*(1-fade(progress,1.88,2.1)),
  cinema:fade(progress,1.78,1.96)*(1-fade(progress,2.48,2.64)),signal:fade(progress,2.48,2.74),
  cinemaDoor:fade(progress,1.56,1.76)*(1-fade(progress,2.02,2.16))};
}

export function activeRecording(progress:number){
 return clamp(Math.round((progress-RECORD_STOPS[0])/(RECORD_STOPS[1]-RECORD_STOPS[0])),0,4);
}

/** Text has its own entrance and exit, independent of the physical portal crossing. */
export function chapterPresentation(progress:number){
 const index=progress<.94?0:progress<1.8?1:progress<2.65?2:3;
 const opacity=[
  1-fade(progress,.08,.42),
  fade(progress,.94,1.16)*(1-fade(progress,1.68,1.8)),
  fade(progress,1.8,2)*(1-fade(progress,2.4,2.65)),
  fade(progress,2.65,3),
 ][index];
 return {index,opacity};
}
