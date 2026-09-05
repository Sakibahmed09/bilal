(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width:639px)');
  const threshold = document.querySelector('.threshold');
  const stage = document.querySelector('.threshold-stage');
  const art = document.querySelector('.portal-art');
  const copy = document.querySelector('.hero-copy');
  const header = document.querySelector('.site-header');
  const invitation = document.querySelector('.scroll-invitation');
  const thought = document.querySelector('.threshold-thought');
  const shade = document.querySelector('.portal-shade');
  const video = document.getElementById('portalMotion');
  const pause = document.getElementById('pausePortal');
  const clamp = n => Math.max(0, Math.min(1, n));
  const smooth = (a,b,n) => {const t=clamp((n-a)/(b-a));return t*t*(3-2*t)};
  let raf=0, visible=false, userPaused=false;
  function paint() {
    raf=0;
    if(reduced.matches){[art,copy,header,invitation,thought,shade].forEach(e=>e.removeAttribute('style'));copy.inert=false;header.inert=false;invitation.inert=false;return;}
    const r=threshold.getBoundingClientRect(), height=stage.offsetHeight;
    if(r.bottom<0||r.top>innerHeight)return;
    const p=clamp(-r.top/Math.max(1,threshold.offsetHeight-height));
    const expand=smooth(.08,.86,p),exit=smooth(0,.35,p),arrive=smooth(.58,.93,p);
    const w=stage.clientWidth;
    const initial=compact.matches?{x:w*.52,y:height*.43,w:w*.44,h:height*.47}:{x:w*.54,y:105,w:w*.4,h:height-150};
    art.style.left=(initial.x*(1-expand)).toFixed(2)+'px';
    art.style.top=(initial.y*(1-expand)).toFixed(2)+'px';
    art.style.width=(initial.w+(w-initial.w)*expand).toFixed(2)+'px';
    art.style.height=(initial.h+(height-initial.h)*expand).toFixed(2)+'px';
    copy.style.opacity=(1-exit).toFixed(3);copy.style.transform=`translateY(${-exit*30}px)`;copy.inert=exit>.95;
    header.style.opacity=(1-exit).toFixed(3);header.inert=exit>.95;
    invitation.style.opacity=(1-exit).toFixed(3);invitation.inert=exit>.95;
    shade.style.opacity=(expand*.8).toFixed(3);
    thought.style.opacity=arrive.toFixed(3);thought.style.transform=`translateY(${(1-arrive)*25}px)`;
  }
  function schedule(){if(!raf)raf=requestAnimationFrame(paint)}
  function play(){if(!visible||userPaused||reduced.matches||document.hidden||navigator.connection?.saveData)return;video.muted=true;if(!video.src){video.src=compact.matches?video.dataset.mobileSrc:video.dataset.src;video.load()}video.play().catch(()=>{pause.textContent='Play motion →';pause.setAttribute('aria-label','Play ambient motion')})}
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){play();schedule()}else video.pause()},{threshold:.05}).observe(stage);
  pause.addEventListener('click',()=>{if(video.paused){userPaused=false;play()}else{userPaused=true;video.pause()}});
  video.addEventListener('playing',()=>{art.classList.add('playing');pause.textContent='Pause motion Ⅱ';pause.setAttribute('aria-label','Pause ambient motion')});
  video.addEventListener('pause',()=>{pause.textContent='Play motion →';pause.setAttribute('aria-label','Play ambient motion')});
  video.addEventListener('error',()=>{art.classList.remove('playing');pause.hidden=true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)video.pause();else play()});
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});
  reduced.addEventListener('change',()=>{if(reduced.matches)video.pause();else play();schedule()});schedule();

  const story=document.querySelector('.day-story'), dayStage=document.querySelector('.day-stage'), screens=[...document.querySelectorAll('[data-moment]')];
  const names=['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'], times=['05:25','08:00','13:10','17:45','19:30','21:00'];
  const colors=[[20,35,29],[45,54,43],[40,50,45],[53,43,32],[47,32,39],[16,25,39]];
  let dayFrame=0, dayVisible=false, activeDay=-1;
  let dayTop=0, dayDistance=1;
  function measureDay(){dayTop=story.getBoundingClientRect().top+scrollY;dayDistance=Math.max(1,story.offsetHeight-dayStage.offsetHeight);scheduleDay()}
  new ResizeObserver(measureDay).observe(dayStage);
  new ResizeObserver(measureDay).observe(story);
  const loaded=screens.map(()=>false);
  function paintDay(){
    dayFrame=0;
    if(reduced.matches){screens.forEach(s=>{s.style.opacity='1';s.setAttribute('aria-hidden','false')});story.style.removeProperty('background');return}
    if(!dayVisible)return;
    const progress=clamp((scrollY-dayTop)/dayDistance);
    // Each atmosphere has a still interval, followed by a scroll-scrubbed dissolve.
    const position=clamp((progress-.06)/.88)*5, base=Math.min(4,Math.floor(position));
    const blend=smooth(.48,.94,position-base), next=base+1;
    const safeBlend=loaded[next]?blend:0;
    const active=safeBlend>.5?next:base;
    screens.forEach((s,i)=>{const opacity=i===base?'1':i===next?safeBlend.toFixed(3):'0';if(s.style.opacity!==opacity)s.style.opacity=opacity;});
    if(active!==activeDay){activeDay=active;screens.forEach((s,i)=>{s.classList.toggle('active',i===active);s.setAttribute('aria-hidden',String(i!==active))});document.getElementById('dayName').textContent=names[active];document.getElementById('dayTime').textContent=times[active];}
    const rgb=colors[base].map((c,i)=>Math.round(c+(colors[next][i]-c)*safeBlend));
    story.style.background=`rgb(${rgb.join(',')})`;
    document.querySelector('.day-line i').style.transform=`scaleX(${progress})`;
  }
  function scheduleDay(){if(!dayFrame)dayFrame=requestAnimationFrame(paintDay)}
  const preloadDay=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)return;screens.forEach((s,i)=>{s.loading='eager';s.decode().then(()=>{loaded[i]=true;scheduleDay()}).catch(()=>{})});preloadDay.disconnect()},{rootMargin:'1000px'});preloadDay.observe(story);
  new IntersectionObserver(entries=>{dayVisible=entries[0].isIntersecting;scheduleDay()}).observe(story);
  window.addEventListener('scroll',scheduleDay,{passive:true});window.addEventListener('resize',measureDay,{passive:true});
  reduced.addEventListener('change',()=>{activeDay=-1;measureDay()});measureDay();

  const setup=document.querySelector('.home-setup'), summary=setup.querySelector('summary');
  let setupAnimation=null, setupOpen=setup.open;
  summary.addEventListener('click',e=>{
    if(reduced.matches)return;
    e.preventDefault();setupOpen=!setupOpen;
    const from=setup.getBoundingClientRect().height;
    setupAnimation?.cancel();setup.open=true;setup.style.height='auto';
    const to=setupOpen?setup.getBoundingClientRect().height:summary.getBoundingClientRect().height+2;
    setup.style.overflow='hidden';
    setupAnimation=setup.animate([{height:from+'px'},{height:to+'px'}],{duration:Math.min(480,220+Math.abs(to-from)*.2),easing:'cubic-bezier(.22,1,.36,1)'});
    setupAnimation.onfinish=()=>{setup.open=setupOpen;setup.style.removeProperty('height');setup.style.removeProperty('overflow');setupAnimation=null};
  });
  setup.addEventListener('toggle',()=>{if(!setupAnimation)setupOpen=setup.open});
  reduced.addEventListener('change',()=>{if(setupAnimation){setupAnimation.cancel();setupAnimation=null;setup.open=setupOpen;setup.style.removeProperty('height');setup.style.removeProperty('overflow')}});

})();
