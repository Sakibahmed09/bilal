import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const support=fileURLToPath(new URL('.',import.meta.url));
const root=path.resolve(process.env.SITE_ROOT||'display');
const {normalizeTimes,core,TIMES,distance}=await import(pathToFileURL(path.join(root,'near-data.mjs')));
const {dayKey,addDays,clock}=await import(pathToFileURL(path.join(root,'near-time.mjs')));
const origin='https://bilalathan.co.uk',today=dayKey(Date.now()),until=addDays(today,6);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}};
const slug=m=>`${m.n.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'mosque'}-${m.g.toLowerCase()}`;
const href=m=>`/mosques/${slug(m)}/`;
const keys=['fajr','dhuhr','asr','maghrib','isha'];
const names=['Fajr','Dhuhr','Asr','Maghrib','Isha'];
const dateLabel=d=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(d+'T12:00:00Z'));
const directory=JSON.parse(await fs.readFile(path.join(root,'mosques.json'),'utf8'));
const aliases=JSON.parse(await fs.readFile(path.join(support,'aliases.json'),'utf8'));
const sourceFor=m=>{
 const id=aliases[m.g]||m.g;
 if(id.startsWith('thm-'))return {name:'Tower Hamlets Mosques',url:'https://www.towerhamletsmosques.co.uk/jamaah-times/',thm:true};
 if(id.startsWith('dpt-'))return {name:'Mosque website timetable',url:safeURL(m.w)};
 if(/^mosque-\d+$/i.test(id))return {name:'Sirat',url:safeURL(m.w)||'https://sirat.uk/'};
 if(/^(?=.*[A-Z0-9])[A-Za-z0-9]{8}$/.test(id))return {name:'Masjidal',url:safeURL(m.w)||'https://masjidal.com/'};
 if(/^[a-f0-9-]{36}$/i.test(id))return {name:'MyMasjid',url:safeURL(m.w)||'https://my-masjid.com/'};
 return {name:'MasjidBox',url:'https://masjidbox.com/prayer-times/'+encodeURIComponent(id)};
};
const candidates=directory.filter(m=>m.c==='GB'&&m.a&&Number.isFinite(m.y)&&Number.isFinite(m.x)&&!aliases[m.g])
 .sort((a,b)=>(a.g.startsWith('thm-')?0:a.g.startsWith('dpt-')?1:2)-(b.g.startsWith('thm-')?0:b.g.startsWith('dpt-')?1:2)||a.n.localeCompare(b.n)).slice(0,Number(process.env.SEO_LIMIT||200));
let previous={};try{previous=JSON.parse(await fs.readFile(path.join(support,'state.json'),'utf8'))}catch{}
const state={...previous},audit=[];let requests=0,failures=0;
for(const m of candidates){
 if(process.env.SEO_OFFLINE==='1')continue;
 const source=sourceFor(m);let record;
 try{
  if(process.env.SEO_OFFLINE==='1'){if(previous[m.g])continue;throw Error('No saved listing')}
  const endpoint=`${TIMES}/times?id=${encodeURIComponent(m.g)}&from=${today}&to=${until}`;
  let res=await fetch(endpoint,{signal:AbortSignal.timeout(16000)});requests++;
  if(res.status===429){
    const wait=Math.min(120,Math.max(60,Number(res.headers.get('retry-after'))||60));
    await new Promise(r=>setTimeout(r,wait*1000));
    res=await fetch(endpoint,{signal:AbortSignal.timeout(16000)});
  }
  if(!res.ok)throw Error(`HTTP ${res.status}`);
  const rows=normalizeTimes(m.g,await res.json(),today,until);
  const verdict=core.judge(rows,new Date(),m),auditRows=core.auditRows(rows);
  if(!verdict.use) {audit.push({id:m.g,result:verdict.why});if(previous[m.g])state[m.g]={...previous[m.g],days:previous[m.g].days.map(d=>({...d,times:d.times.map(()=>null)}))};continue}
  const days=rows.filter(r=>r.date>=today&&r.date<=until).map(r=>({date:r.date,times:keys.map(k=>{
   const at=core.effectiveJamaah(r.begins?.[k],r.jamaah?.[k]);
   return at&&Number.isFinite(+at)&&!auditRows.bad[`${r.date}/${k}`]?clock(+at/60000):null;
  })}));
  if(!days.some(d=>d.date===today&&d.times.filter(Boolean).length>=3)){if(previous[m.g])state[m.g]={...previous[m.g],days:previous[m.g].days.map(d=>({...d,times:d.times.map(()=>null)}))};audit.push({id:m.g,result:'Insufficient current coverage'});continue}
  record={mosque:m,source,days,retrieved:new Date().toISOString()};state[m.g]=record;
  audit.push({id:m.g,result:'eligible'});
 }catch(e){failures++;audit.push({id:m.g,result:'fetch failed; preserve dated evidence',error:e.message})}
 if(process.env.SEO_OFFLINE!=='1')await new Promise(r=>setTimeout(r,1250));
}
if(requests&&failures/requests>.5)throw Error('Most providers failed. Refusing a partial rollout; previous dated pages remain.');
// A conservative duplicate pass uses both near-identical names and physical proximity.
const clean=s=>s.toLowerCase().replace(/\b(masjid|mosque|jamme|jame|jamia|the)\b/g,'').replace(/[^a-z0-9]/g,'');
const published=[];
for(const rec of Object.values(state).sort((a,b)=>a.mosque.n.localeCompare(b.mosque.n))){
 if(published.some(p=>clean(p.mosque.n)===clean(rec.mosque.n)&&distance({lat:p.mosque.y,lng:p.mosque.x},rec.mosque)<150)){audit.push({id:rec.mosque.g,result:'duplicate candidate excluded'});continue}
 published.push(rec);
}
const live=published.filter(r=>r.days.some(d=>d.date>=today&&d.times.filter(Boolean).length>=3));
if(!live.length)throw Error('No current eligible pages');
const write=async(rel,s)=>{const f=path.join(root,rel);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,s)};
const arrow='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L19 5M6 5h13v13"/></svg>';
function shell(title,description,url,body,{index=true,json=null}={}){
return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ede9df"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${index?'index,follow':'noindex,follow'}"><link rel="canonical" href="${origin+url}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${origin+url}"><meta property="og:type" content="website"><meta property="og:image" content="${origin}/bilal-social-v2.jpg"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/mosque-pages.css?v=1">${json?'<script type="application/ld+json">'+JSON.stringify(json).replace(/</g,'\\u003c')+'</script>':''}</head><body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/tv.html">bilal</a><nav aria-label="Main"><a href="/mosques/">Find a mosque</a><a href="/near">Open Near ${arrow}</a></nav></header><main id="main">${body}</main><footer><a class="brand" href="/tv.html">bilal</a><p>Bringing us together in the masjid.</p><nav aria-label="Support"><a href="/near?request=1">Add your mosque</a><a href="/help.html">Help</a><a href="/bug.html">Report a problem</a></nav><small>Independent prayer-time service. Times belong to the mosques and sources credited.</small></footer></body></html>`;
}
for(const rec of published){
 const {mosque:m,source,days,retrieved}=rec,url=href(m),current=live.includes(rec),initial=days.find(d=>d.date>=today)||days.at(-1);
 const near=live.filter(r=>r!==rec).map(r=>({...r,dist:distance({lat:m.y,lng:m.x},r.mosque)})).filter(r=>r.dist<10000).sort((a,b)=>a.dist-b.dist).slice(0,4);
 const rows=d=>d.times.map((v,i)=>`<tr><th scope="row">${names[i]}${source.thm&&i===3?'<small>Begins · jama’ah varies</small>':''}</th><td>${v?`<time>${esc(v)}</time>`:'<span class="muted">Not published</span>'}</td></tr>`).join('');
 const body=`<a class="back" href="/mosques/">All mosques</a><section class="intro"><div><h1>${esc(m.n)}</h1><p class="address">${esc(m.a)}</p><a class="action" href="/near?mosque=${encodeURIComponent(m.g)}">Open this mosque in Near ${arrow}</a></div><div class="sky" aria-hidden="true"></div></section><section class="timetable"><div class="explanation"><h2>Come for <br>the jama’ah.</h2><p>Published congregation times. All times are UK local time (GMT/BST).</p><p id="nextPrayer" aria-live="polite"></p><a class="text-link" href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(m.a+' '+m.n)}">Get directions ${arrow}</a></div><div><h2 class="date" id="dateLabel">${esc(dateLabel(initial.date))}</h2><p id="coverageNotice" ${current?'hidden':''}>Current jama’ah times couldn’t be confirmed. Check the source for the latest timetable.</p><table><caption>Jama’ah times for ${esc(m.n)}</caption><tbody id="prayerRows">${rows(initial)}</tbody></table><p class="source-note">${source.thm?'Maghrib is the beginning time, not a confirmed congregation time. During Ramadan, check the mosque’s own timetable.':'Jumu’ah services may differ from Dhuhr. Check the source for Friday arrangements.'}</p></div></section><details class="week"><summary>More dates ${arrow}</summary>${days.filter(d=>d!==initial).map(d=>`<h3>${esc(dateLabel(d.date))}</h3><table><caption>Jama’ah times for ${esc(d.date)}</caption><tbody>${rows(d)}</tbody></table>`).join('')}</details><section class="provenance"><h2>From the published timetable.</h2><p>Source: ${source.url?`<a href="${esc(source.url)}" rel="noopener">${esc(source.name)}</a>`:esc(source.name)}.</p><p>Retrieved by Bilal on ${esc(dateLabel(dayKey(retrieved)))}. Covers ${esc(days[0]?.date)} to ${esc(days.at(-1)?.date)}. Retrieval is not confirmation of a new update by the mosque.</p><a class="text-link" href="/bug.html?from=mosque-page&amp;kind=times&amp;mosque=${encodeURIComponent(m.g)}&amp;name=${encodeURIComponent(m.n)}">Something wrong? ${arrow}</a></section>${near.length?`<section class="nearby"><h2>Other mosques nearby.</h2>${near.map(r=>`<a href="${href(r.mosque)}"><span>${esc(r.mosque.n)}<small>${esc(r.mosque.a)}</small></span>${arrow}</a>`).join('')}</section>`:''}<script type="application/json" id="pageData">${JSON.stringify({days,thm:!!source.thm}).replace(/</g,'\\u003c')}</script><script type="module" src="/mosque-page.mjs"></script>`;
 await write(url.slice(1)+'index.html',shell(`${m.n} jama’ah & prayer times | Bilal`, `Published jama’ah times for ${m.n}, ${m.a}. See the timetable, get directions and find other mosques nearby.`,url,body,{index:current,json:{'@context':'https://schema.org','@type':'Mosque','@id':origin+url+'#mosque',name:m.n,url:origin+url,address:m.a,geo:{'@type':'GeoCoordinates',latitude:m.y,longitude:m.x}}}));
}
const groups=new Map();for(const r of live){const match=r.mosque.a.toUpperCase().match(/\b([A-Z]{1,2})\d{1,2}\s*\d[A-Z]{2}\b/);const k=match?.[1]||'OTHER';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
const links=rs=>rs.map(r=>`<a class="listing" href="${href(r.mosque)}"><span>${esc(r.mosque.n)}<small>${esc(r.mosque.a)}</small></span>${arrow}</a>`).join('');
const groupURL=k=>'/mosques/areas/'+k.toLowerCase()+'/';
await write('mosques/index.html',shell('UK mosque jama’ah times | Bilal','Find published jama’ah times for UK mosques, directions and nearby congregations.','/mosques/',`<section class="directory-head"><h1>A place for you<br>in the jama’ah.</h1><p>${live.length} mosques with dated prayer times. Find yours below.</p><label for="filter">Search by mosque or address</label><input type="search" id="filter" placeholder="Mosque name, town or postcode" autocomplete="off"><p id="searchCount" aria-live="polite"></p></section><nav class="areas" aria-label="Postcode areas">${[...groups.keys()].sort().map(k=>`<a href="${groupURL(k)}">${k==='OTHER'?'More locations':k+' postcode area'}</a>`).join('')}</nav><section id="listings">${links(live)}</section><p id="none" hidden>No matching mosque yet. <a href="/near?request=1">Add your mosque</a>.</p><script type="module">const input=document.querySelector('#filter');input.addEventListener('input',()=>{let count=0;for(const row of document.querySelectorAll('.listing')){row.hidden=!row.textContent.toLowerCase().includes(input.value.trim().toLowerCase());if(!row.hidden)count++}document.querySelector('#searchCount').textContent=count+' mosques';document.querySelector('#none').hidden=count>0});</script>`));
for(const [k,rs] of groups)await write(groupURL(k).slice(1)+'index.html',shell(`${k==='OTHER'?'More UK':k+' postcode area'} mosque jama’ah times | Bilal`,'Compare published mosque prayer timetables and find your next jama’ah.',groupURL(k),`<a class="back" href="/mosques/">All mosques</a><h1>${k==='OTHER'?'More UK mosques':esc(k)+' postcode area'}</h1><p>${rs.length} mosques with published timetables.</p>${links(rs)}`,{index:rs.length>=3}));
const urls=['/tv.html','/near','/mosques/',...live.map(r=>href(r.mosque)),...[...groups].filter(([k,r])=>r.length>=3).map(([k])=>groupURL(k))];
await write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>`<url><loc>${origin+esc(u)}</loc></url>`).join('')+'</urlset>');
await fs.writeFile(path.join(support,'state.json'),JSON.stringify(state));
if(process.env.SEO_OFFLINE!=='1')await fs.writeFile(path.join(support,'audit.json'),JSON.stringify({generated:new Date().toISOString(),candidates:candidates.length,published:live.length,results:audit},null,2));
console.log(JSON.stringify({candidates:candidates.length,published:live.length,requests,failures}));
