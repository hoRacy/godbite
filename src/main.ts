import '@fontsource/bodoni-moda/latin-500.css';
import '@fontsource/bodoni-moda/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import './style.css';
import { asset, copy, films, releases, socials } from './content';
import type { Chapter, Language } from './content';
import { Ambient } from './ambient';
import { SCENE_ANCHORS, chapterPresentation } from './journey';
import type { World } from './world';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const chapters: Chapter[] = ['threshold', 'music', 'cinema', 'contact'];
const sections = chapters.map(id => $('#'+id));
const stages = sections.map(section => section.querySelector<HTMLElement>('.chapter-stage')!);
const chapterKeys = ['threshold', 'music', 'cinema', 'signal'] as const;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let language: Language = 'en';
try { if (localStorage.getItem('godbite-language') === 'pl') language = 'pl'; } catch { /* Storage can be unavailable in private browser contexts. */ }
let selectedRelease = 0;
let selectedFilm = films[0];

let lastInvoker: HTMLElement | null = null;
const invokers = new WeakMap<HTMLDialogElement, HTMLElement>();
document.addEventListener('click',event=>{
  if(event.target instanceof Element)lastInvoker=event.target.closest<HTMLElement>('a,button');
},true);
let currentChapter = 0;
let userPaused = false;
let stillMode = false;
let world: World | undefined;
let worldGeneration = 0;
const ambient = new Ambient(()=>updateControls());
const releaseDialog = $<HTMLDialogElement>('#release-dialog');
const filmDialog = $<HTMLDialogElement>('#film-dialog');
const creditsDialog = $<HTMLDialogElement>('#credits-dialog');
const dialogs = [releaseDialog, filmDialog, creditsDialog];
const releaseList = $('#release-list');
const filmList = $('#film-list');
const still = $('#still-world');

function link(label: string, href: string) {
  const element = document.createElement('a');
  element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer';
  element.textContent = label;
  const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
  element.append(arrow); return element;
}
for (const [name, url] of socials) {
  const element = document.createElement('a'); element.href=url; element.target='_blank';
  element.rel='noopener noreferrer'; element.textContent=name; $('#social-links').append(element);
}
releases.forEach((release,index)=>{
  const item=document.createElement('li'),button=document.createElement('button');
  const number=document.createElement('span'),title=document.createElement('span'),year=document.createElement('span');
  number.className='release-list-no';number.textContent=String(index+1).padStart(2,'0');
  title.className='release-list-title';title.textContent=release.title;
  year.className='release-list-year';year.textContent=String(release.year)+' ↗';
  button.dataset.release=release.id;button.append(number,title,year);
  button.addEventListener('click',()=>openRelease(index));item.append(button);releaseList.append(item);
});
films.forEach((film,index)=>{
  const button=document.createElement('button'),title=document.createElement('span'),number=document.createElement('span');
  button.dataset.film=film.id;button.setAttribute('aria-pressed',String(index===0));
  title.textContent=film.title;number.textContent=String(index+1).padStart(2,'0');
  button.append(title,number);button.addEventListener('click',()=>selectFilm(film.id));filmList.append(button);
});

function updateRelease() {
  const release=releases[selectedRelease],text=copy[language];
  const cover=$<HTMLImageElement>('#release-cover');
  cover.src=asset('images/cover-'+release.cover+'.webp');cover.alt=release.title;
  $('#release-title').textContent=release.title;
  $('#release-meta').textContent=text[release.kind]+' / '+release.year;
  $('#art-credit').textContent=release.artwork?text.artwork+' / '+release.artwork:'';
  const container=$('#release-links');container.replaceChildren();
  if(release.spotify)container.append(link('Spotify',release.spotify));
  container.append(link('Bandcamp',release.bandcamp));
  $('#release-position').textContent=String(selectedRelease+1).padStart(2,'0')+' / 05';
}
function syncModalState() {
  const open=dialogs.some(dialog=>dialog.open);
  document.body.classList.toggle('modal-open',open);
  ambient.setBlocked(filmDialog.open);
  world?.setPaused(open||userPaused);
}
function openDialog(dialog: HTMLDialogElement) {
  const invoker=lastInvoker ?? (document.activeElement instanceof HTMLElement?document.activeElement:null);
  if(invoker)invokers.set(dialog,invoker);
  for(const existing of dialogs)if(existing.open && existing!==dialog)existing.close();
  if(!dialog.open)dialog.showModal();
  syncModalState();
}
function openRelease(index: number) {
  selectedRelease=(index+releases.length)%releases.length;
  updateRelease();openDialog(releaseDialog);
}
function selectFilm(id: string) {
  selectedFilm=films.find(film=>film.id===id) ?? films[0];
  $('#cinema-title').textContent=selectedFilm.title;
  $('#film-kind').textContent=copy[language][selectedFilm.kind==='video'?'film':'visualiser'];
  filmList.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.film===id)));
  world?.selectFilm(id);
}
function openFilm(id: string) {
  selectFilm(id);
  $('#projection-title').textContent=selectedFilm.title;
  $<HTMLAnchorElement>('#external-film').href='https://www.youtube.com/watch?v='+selectedFilm.youtubeId;
  const frame=document.createElement('iframe');
  frame.title=selectedFilm.title+' — Godbite';
  frame.src='https://www.youtube-nocookie.com/embed/'+selectedFilm.youtubeId+'?autoplay=1&rel=0&playsinline=1';
  frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
  frame.referrerPolicy='strict-origin-when-cross-origin';
  $('#film-player').replaceChildren(frame);openDialog(filmDialog);
}
dialogs.forEach(dialog=>{
  dialog.querySelector<HTMLButtonElement>('[data-close]')!.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const bounds=dialog.getBoundingClientRect();
    if(event.clientX<bounds.left || event.clientX>bounds.right || event.clientY<bounds.top || event.clientY>bounds.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{
    if(dialog===filmDialog)$('#film-player').replaceChildren();
    syncModalState();
    if(!dialogs.some(item=>item.open)){
      const trigger=invokers.get(dialog);
      if(trigger?.isConnected)trigger.focus({preventScroll:true});
    }
  });
});
$('#previous-release').addEventListener('click',()=>{selectedRelease=(selectedRelease+4)%5;updateRelease();});
$('#next-release').addEventListener('click',()=>{selectedRelease=(selectedRelease+1)%5;updateRelease();});
$('#credits-button').addEventListener('click',()=>openDialog(creditsDialog));
$('#cinema-play').addEventListener('click',()=>openFilm(selectedFilm.id));
document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(button=>button.addEventListener('click',()=>openFilm(button.dataset.play!)));
$('#sound-toggle').addEventListener('click',()=>{void ambient.toggle();});
function awakenSound(event: Event){
  if(event.target instanceof Element && event.target.closest('#sound-toggle') &&
    ['pointerdown','pointerup','touchstart','touchend','click','keydown'].includes(event.type))return;
  void ambient.unlock();
}
for(const type of ['pointermove','pointerdown','pointerup','wheel','scroll','touchstart','touchmove','touchend','click','keydown']){
  document.addEventListener(type,awakenSound,{passive:true,capture:true});
}
function updateControls() {
  const text=copy[language],state=ambient.state;
  const unavailable=state==='unavailable';
  document.body.dataset.sound=state;
  $('#sound-state').textContent=unavailable?text.unavailableState:text[ambient.requested?'on':'off'];
  const toggle=$<HTMLButtonElement>('#sound-toggle');
  toggle.setAttribute('aria-pressed',String(ambient.requested));
  toggle.setAttribute('aria-label',unavailable?text.unavailable:text[ambient.requested?'mute':'unmute']);
  toggle.disabled=unavailable;toggle.setAttribute('aria-disabled',String(unavailable));
  const hint=$('#sound-hint');hint.hidden=state!=='waiting';hint.textContent=text.soundHint;
  $('#motion-toggle').setAttribute('aria-label',text[userPaused?'resume':'pause']);
  $('#motion-toggle').setAttribute('aria-pressed',String(userPaused));
  $('#motion-toggle').querySelector('span')!.textContent=userPaused?'▷':'Ⅱ';
}
function translate() {
  const text=copy[language];document.documentElement.lang=language;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element=>{
    const key=element.dataset.i18n as keyof typeof text;
    if(key in text)element.textContent=text[key];
  });
  document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===language)));
  document.querySelector('.language-switch')!.setAttribute('aria-label',text.language);
  releaseList.setAttribute('aria-label',text.selectRelease);filmList.setAttribute('aria-label',text.chooseFilm);
  document.querySelectorAll('[data-close]').forEach(button=>button.setAttribute('aria-label',text.close));
  $('#previous-release').setAttribute('aria-label',text.previous);$('#next-release').setAttribute('aria-label',text.next);
  $('#chapter-name').textContent=text[chapterKeys[currentChapter]];
  updateControls();selectFilm(selectedFilm.id);
  if(releaseDialog.open)updateRelease();
  document.title=language==='pl'?'GODBITE — Muzyka zależna / Brak alternatywy':'GODBITE — Dependent music / No alternative';
}
document.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(button=>button.addEventListener('click',()=>{
  language=button.dataset.lang as Language;
  try{localStorage.setItem('godbite-language',language);}catch{}
  translate();
}));

function progress(){
  const y=Math.max(0,scrollY);
  for(let index=0;index<sections.length-1;index++){
    const start=sections[index].offsetTop,end=sections[index+1].offsetTop;
    if(y<end)return SCENE_ANCHORS[index]+(SCENE_ANCHORS[index+1]-SCENE_ANCHORS[index])*Math.max(0,(y-start)/(end-start));
  }
  return 3;
}
let scrollPending=false;
function updateJourney() {
  scrollPending=false;
  const p=progress(),{index,opacity}=chapterPresentation(p);
  stages.forEach((stage,i)=>{
    const hidden=i!==index||opacity<.001;
    stage.hidden=hidden;stage.inert=hidden;
    stage.style.opacity=String(i===index?opacity:0);
    sections[i].setAttribute('aria-hidden',String(hidden));
  });
  currentChapter=index;
  document.body.dataset.chapter=chapters[index];
  if(index!==2)world?.setFilmHovered(false);
  $('#chapter-name').textContent=copy[language][chapterKeys[index]];
  $('#chapter-number').textContent=String(index+1).padStart(2,'0');
  $('#position-fill').style.width=(p/3*100)+'%';
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(anchor=>{
    if(anchor.dataset.nav===chapters[index])anchor.setAttribute('aria-current','location');
    else anchor.removeAttribute('aria-current');
  });
  if(stillMode)still.style.backgroundImage='url("'+asset('images/'+chapters[index]+'.webp')+'")';
  world?.setProgress(p);ambient.setProgress(p);
}
function requestJourney() { if(!scrollPending){scrollPending=true;requestAnimationFrame(updateJourney);} }
addEventListener('scroll',requestJourney,{passive:true});
addEventListener('resize',requestJourney,{passive:true});

function navigate(chapter: Chapter, instant=false) {
  const section=$('#'+chapter);
  history.replaceState(null,'','#'+chapter);
  window.scrollTo({top:section.offsetTop,behavior:instant||reducedMotion.matches?'instant':'smooth'});
  if(instant)updateJourney();
}
document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(anchor=>anchor.addEventListener('click',event=>{
  event.preventDefault();const chapter=anchor.dataset.nav as Chapter;
  navigate(chapter,true);
  if(chapter==='music')openRelease(0);
}));
document.querySelectorAll<HTMLAnchorElement>('[data-journey]').forEach(anchor=>anchor.addEventListener('click',event=>{
  event.preventDefault();navigate(anchor.dataset.journey as Chapter);
}));
$('.brand').addEventListener('click',event=>{event.preventDefault();navigate('threshold');});
$('.skip-link').addEventListener('click',event=>{
  event.preventDefault();navigate('contact',true);$<HTMLAnchorElement>('.contact-address>a').focus({preventScroll:true});
});
function onHash() {
  const hash=location.hash.slice(1) as Chapter;
  if(chapters.includes(hash))navigate(hash,true);
}
addEventListener('hashchange',onHash);
$('#motion-toggle').addEventListener('click',()=>{
  userPaused=!userPaused;document.body.classList.toggle('motion-paused',userPaused);
  syncModalState();updateControls();
});

const projection=$('#cinema-play');
projection.addEventListener('pointerenter',()=>world?.setFilmHovered(true));
projection.addEventListener('pointerleave',()=>world?.setFilmHovered(false));
projection.addEventListener('focus',()=>world?.setFilmHovered(true));
projection.addEventListener('blur',()=>world?.setFilmHovered(false));

function useStills() {
  stillMode=true;document.body.classList.add('still-mode');document.body.classList.remove('scene-ready');
  world?.destroy();world=undefined;
  updateJourney();
}
async function startWorld() {
  const generation=++worldGeneration;
  if(reducedMotion.matches){useStills();return;}
  try {
    const {World}=await import('./world');
    if(generation!==worldGeneration || reducedMotion.matches)return;
    world=new World({canvas:$<HTMLCanvasElement>('#world-canvas'),onFailure:useStills,onRelease:openRelease,onFilm:()=>openFilm(selectedFilm.id),onRecording:index=>{
      document.body.dataset.currentRecording=releases[index].id;
      releaseList.querySelectorAll('button').forEach((button,item)=>button.classList.toggle('is-current',item===index));
    }});
    stillMode=false;document.body.classList.remove('still-mode');
    world.setProgress(progress());world.setPaused(userPaused);
    if(selectedFilm.id!==films[0].id)world.selectFilm(selectedFilm.id);
  } catch {useStills();}
}
reducedMotion.addEventListener('change',()=>{
  ++worldGeneration;
  if(reducedMotion.matches)useStills();else void startWorld();
});
translate();updateJourney();onHash();ambient.boot();void startWorld();
