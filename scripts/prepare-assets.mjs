import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../public/images/', import.meta.url);
await mkdir(root, { recursive: true });
const covers = { 'demo':'a1817659416', 'the-aristocrats':'a1723015191', 'mir':'a3618906946', 'jism':'a3437704500', 'social-media-girls':'a2244619912' };
for (const [slug, id] of Object.entries(covers)) {
  const response = await fetch(`https://f4.bcbits.com/img/${id}_5.jpg`);
  if (!response.ok) throw new Error(`Cover ${slug}: ${response.status}`);
  await sharp(Buffer.from(await response.arrayBuffer())).resize(700,700,{fit:'inside'}).webp({quality:83}).toFile(fileURLToPath(new URL(`cover-${slug}.webp`,root)));
  console.log(`Prepared cover: ${slug}`);
}
for (const id of ['y5Bw0fB5nU8','KlZBHri5y1Q','p68ABWJqxCI','Fu1c32l8bqk','KYkbLPMH7xA']) {
  const response = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  if (!response.ok) throw new Error(`Film thumbnail ${id}: ${response.status}`);
  await sharp(Buffer.from(await response.arrayBuffer())).extract({left:0,top:45,width:480,height:270}).resize(960,540).webp({quality:82}).toFile(fileURLToPath(new URL(`film-${id}.webp`,root)));
  console.log(`Prepared film: ${id}`);
}
await writeFile(new URL('asset-sources.json',root),JSON.stringify({covers,films:'Official Godbite YouTube thumbnails',liveConcert:'https://www.youtube.com/watch?v=KYkbLPMH7xA',source:'https://linktr.ee/godbite'},null,2));
