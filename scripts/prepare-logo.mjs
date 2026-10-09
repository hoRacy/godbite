import sharp from 'sharp';
const source=process.argv[2];
if(!source)throw new Error('Pass the original transparent Godbite logo PNG.');
const {data,info}=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let left=info.width,top=info.height,right=0,bottom=0;
for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(Math.max(...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+3))*data[(y*info.width+x)*4+3]/255>1){
 left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
}
const rectangle={left,top,width:right-left+1,height:bottom-top+1};
await sharp(source).extract(rectangle).resize({width:1800,withoutEnlargement:true}).webp({lossless:true}).toFile('public/images/godbite-logo.webp');
console.log(JSON.stringify({sourceBounds:rectangle,output:await sharp('public/images/godbite-logo.webp').metadata()},null,2));
