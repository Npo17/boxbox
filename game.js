// ---------- Datos y motor ----------
// Las temporadas y el motor de carrera son los mismos archivos que usa el servidor (una sola fuente de verdad).
let DATA={}, E=null;
// BUILD: versión de los archivos (la fija scripts/sellar.mjs en la dirección de este script). Evita mezclar archivos viejos del caché con los nuevos.
const BUILD=(document.currentScript&&new URL(document.currentScript.src).searchParams.get('v'))||'0';
const DATA_READY=fetch('supabase/functions/_shared/temporadas.json?v='+BUILD).then(r=>r.json()).then(j=>{DATA=j});
const ENGINE_READY=import('./supabase/functions/_shared/engine.js?v='+BUILD).then(m=>{E=m});
const READY=Promise.all([DATA_READY,ENGINE_READY]);
const SLOTS=[["piloto","Piloto"],["coche","Coche"],["motor","Motor"],["jefe","Jefe de equipo"],["estratega","Estratega"]];
let TRACK=null, BLIND=false;   // BLIND: desafío del día, las medias están ocultas
const PTS=[25,18,15,12,10,8,6,4,2,1];
let LAPS=+(new URLSearchParams(location.search).get('laps')||20);   // ?laps=N solo para pruebas; en salas y desafío siempre 20

// ---------- Estado ----------
let year=null, cat=null, rerolls=2, picks={}, offer={}, FIELD=[], GRID=[], MODE='solo';
const $=id=>document.getElementById(id);
const rc=r=>r>=95?'r95':r>=90?'r90':r>=80?'r80':'r0';
const FACES=['⚀','⚁','⚂','⚃','⚄','⚅'];   // caras de dado
const fmt=t=>{const m=Math.floor(t/60), s=(t-m*60).toFixed(3).padStart(6,'0'); return `${m}:${s}`};

function carSVG(color){ // auto de fórmula visto desde arriba, dibujo propio
  const c=color||'#3d4050', f=Object.keys(picks).length;
  return `<svg width="250" height="120" viewBox="0 0 250 120">
   <rect x="18" y="8" width="34" height="26" rx="5" fill="#111"/><rect x="18" y="86" width="34" height="26" rx="5" fill="#111"/>
   <rect x="172" y="4" width="40" height="30" rx="6" fill="#111"/><rect x="172" y="86" width="40" height="30" rx="6" fill="#111"/>
   <rect x="2" y="22" width="12" height="76" rx="3" fill="${c}"/>
   <rect x="228" y="18" width="18" height="84" rx="3" fill="${c}"/>
   <path d="M10 52 L70 44 L120 38 L190 40 L232 48 L232 72 L190 80 L120 82 L70 76 L10 68 Z" fill="${c}"/>
   <path d="M95 46 L150 42 L175 50 L175 70 L150 78 L95 74 Z" fill="#000" opacity=".25"/>
   <ellipse cx="130" cy="60" rx="18" ry="11" fill="#0d0d12"/><circle cx="132" cy="60" r="7" fill="${f>=1?'#ffd23f':'#555'}"/>
   <text x="70" y="64" fill="#fff" font-family="Titillium Web" font-weight="900" font-style="italic" font-size="14">${f>=1?'01':''}</text>
  </svg>`;
}
function renderSlots(){
  const filled=Object.keys(picks).length;
  $('carsvg').innerHTML=carSVG(filled?'#ff3b30':null);
  $('slots').innerHTML=SLOTS.map(([k,l])=>{
    const p=picks[k];
    return `<div class="slot ${p?'filled':''}"><span class="k">${l}</span>${p?`<span class="v">${p.n} <small style="color:var(--muted)">${p.y}</small> <span class="rt ${BLIND?'r0':rc(p.r)}" style="font-size:14px;padding:2px 6px;margin-left:6px">${BLIND?'?':p.r}</span></span>`:'<span style="color:#555">—</span>'}</div>`}).join('');
  const vals=Object.values(picks).map(p=>p.r);
  $('avg').textContent=vals.length&&!BLIND?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):'—';
  $('toRace').disabled=filled<5;
  $('toRace').style.display=MODE==='room'?'none':'';
  $('rollBtn').disabled=filled>=5;
}

// Cada tirada muestra solo parte de la temporada: las piezas top aparecen menos (lo decide el motor).
const freeSlots=()=>SLOTS.map(([k])=>k).filter(k=>!picks[k]);
const firstCat=()=>(SLOTS.find(([k])=>!picks[k]&&offer[k]&&offer[k].shown.length)||SLOTS.find(([k])=>!picks[k]))[0];
const makeOffer=y=>E.makeOffer(DATA,Math.random,y);
function renderTabs(){
  const none=k=>offer[k]&&!offer[k].shown.length;   // ese año no tiene piezas para esa casilla
  $('tabs').innerHTML=SLOTS.map(([k,l])=>`<div class="tab ${picks[k]||none(k)?'done':''} ${cat===k?'on':''}" data-k="${k}" title="${none(k)&&!picks[k]?'No hay '+l.toLowerCase()+' de '+year:''}">${l}</div>`).join('');
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{ if(picks[t.dataset.k]||none(t.dataset.k)) return; cat=t.dataset.k; renderTabs(); renderList(); });
}
function renderList(){
  if(!year) return;
  const {shown,total}=offer[cat];
  $('list').innerHTML=`<div class="note" style="margin:0 0 4px">${shown.length} de ${total} disponibles en esta tirada</div>`+
    shown.map((it,i)=>`<div class="pick" data-i="${i}"><div class="who"><b>${it[0]}</b><small>${it[1]||year}</small></div><div class="rt ${BLIND?'r0':rc(it[2])}">${BLIND?'?':it[2]}</div></div>`).join('');
  document.querySelectorAll('.pick').forEach(el=>el.onclick=()=>{
    if(MODE==='room'){roomPick(cat,+el.dataset.i,shown[+el.dataset.i]);return}
    if(MODE==='daily'){dailyPick(cat,+el.dataset.i,shown[+el.dataset.i]);return}
    const it=shown[+el.dataset.i]; picks[cat]={n:it[0],y:year,r:it[2]};
    const y=year; year=null; cat=null;
    $('year').innerHTML='?<small>Elegiste. Tira de nuevo</small>'; $('rollBtn').querySelector('span').textContent='Tirar';
    $('list').innerHTML=`<div class="empty">✅ ${it[0]} (${y}) a tu auto. ${Object.keys(picks).length<5?'Tira otra vez.':'¡Auto completo!'}</div>`;
    $('tabs').innerHTML=''; renderSlots();
  });
}
$('rollBtn').onclick=async()=>{
  if(MODE==='room'){roomRoll();return}
  if(MODE==='daily'){dailyRoll();return}
  await READY;
  if(year && rerolls<=0) return;
  if(year) rerolls--;
  if(MODE==='friendly'){friendlyRoll();return}
  const ys=E.yearsFor(DATA,freeSlots()), y=ys[Math.floor(Math.random()*ys.length)];
  showRoll({year:y,offer:makeOffer(y)});
};
renderSlots();

function go(screen,step){if(screen!=='s-home')document.documentElement.classList.add('ready');document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));$(screen).classList.add('on');
  ['st1','st2','st3','st4'].forEach((s,i)=>$(s).classList.toggle('on',i+1===step));window.scrollTo(0,0)}

// ---------- Carrera: el motor (supabase/functions/_shared/engine.js) la calcula y acá se anima ----------
let RACE=null, MEKEY='h:me', SEED='', HUMANS=[], DECISIONS={}, PIT=null;
const carByKey=k=>RACE.cars.find(c=>c.key===k);
// Opciones según el modo: en el modo carrera el circuito y la sprint vienen del calendario. El aviso de tormenta con decisión
// solo existe en solo, amistoso y carrera (en salas y desafío del día la lluvia, si sale, es la de toda la carrera).
const REAL_LAPS=!new URLSearchParams(location.search).get('laps');   // vueltas reales de cada GP (el desafío del día y el amistoso siguen con 20)
const raceOpts=()=>({...(REAL_LAPS&&/^(solo|career|room)$/.test(MODE)?{real:true}:{}),...raceOpts0()});
const raceOpts0=()=>MODE==='room'&&RS&&RS.room.evento?{trackIdx:RS.room.evento.t,sprint:RS.room.evento.k==='sprint',storm:false}:MODE==='career'&&CAR_EVT?{trackIdx:CAR_EVT.trackIdx,sprint:CAR_EVT.kind==='sprint',storm:CAR_EVT.kind!=='sprint'}:{storm:MODE==='solo'||MODE==='friendly'};
const newRace=(decisions)=>E.runRace({DATA,tracks:TRACKS,seed:SEED,humans:HUMANS,laps:LAPS,decisions,...raceOpts()});
const GPN=()=>MODE==='career'&&CAR_EVT?CAR_EVT.gp:MODE==='room'&&RS&&RS.room.evento?RS.room.evento.gp:TRACK.gp;
const ptsTable=()=>RACE&&RACE.sprint?E.SPRINT_PTS:PTS;

// Solo, amistoso y desafío del día: carrera nueva con el auto que armaste
function prepareRace(seed){
  SEED=seed||('s'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));
  HUMANS=[E.humanFromPicks('me','#ff3b30',picks)]; MEKEY='h:me'; DECISIONS={};
  RACE=newRace({}); setTrack();
}
// Fondo de la pista: el usuario elige entre 5 (se recuerda). Se dibuja debajo (bgl) y encima (bgfx) del trazado.
const FONDOS=['cl','a','b','c','d'];
let FONDO=(()=>{ try{ const v=localStorage.getItem('boxbox_fondo'); return FONDOS.includes(v)?v:'a' }catch(e){ return 'a' } })();
function paintFondo(){
  document.querySelectorAll('#fondoSw [data-f]').forEach(b=>b.classList.toggle('on',b.dataset.f===FONDO));
  if(typeof TRACK==='undefined'||!TRACK) return;
  const d=TRACK.d, R='<rect width="800" height="460" rx="14"', gp=esc(TRACK.gp.split('(')[0].trim().toUpperCase());
  $('track').setAttribute('class','track th-'+FONDO);
  $('bgrect').setAttribute('fill',{cl:'#173320',a:'url(#carbon)',b:'url(#grass)',c:'#0b1426',d:'#0a0c11'}[FONDO]);
  let low='', top='';
  if(FONDO==='a'){ low=`${R} fill="url(#grid)"/>`; top=`${R} fill="url(#vig)"/>` }
  else if(FONDO==='b'){ low=`${R} fill="url(#mow)"/><path d="${d}" fill="none" stroke="#c9b27a" stroke-opacity=".35" stroke-width="52" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#11251a" stroke-opacity=".5" stroke-width="40" stroke-linejoin="round" filter="url(#blurbg)"/>`; top=`${R} fill="url(#vig)"/>` }
  else if(FONDO==='c'){ low=`${R} fill="url(#grid)"/>` }
  else if(FONDO==='d'){ const fs=Math.min(120,Math.round(720/(gp.length*0.56))); low=`<ellipse cx="400" cy="230" rx="330" ry="210" fill="url(#glow)"/><text x="400" y="${230+Math.round(fs*0.33)}" text-anchor="middle" fill="#fff" fill-opacity=".05" font-family="Titillium Web" font-weight="900" font-style="italic" font-size="${fs}" letter-spacing="-3">${gp}</text><path d="${d}" fill="none" stroke="#ff3b30" stroke-opacity=".55" stroke-width="40" stroke-linejoin="round" filter="url(#blurbg)"/>`; top=`${R} fill="url(#vig)"/>` }
  $('bgl').innerHTML=low; $('bgfx').innerHTML=top;
}
$('fondoSw').onclick=e=>{ const b=e.target.closest('[data-f]'); if(!b) return; FONDO=b.dataset.f; ev('fondo',{f:FONDO}); try{ localStorage.setItem('boxbox_fondo',FONDO) }catch(err){} paintFondo() };
paintFondo();
function setTrack(){
  TRACK=TRACKS[RACE.trackIdx];
  const s=TRACK.d.match(/M([0-9.]+),([0-9.]+)/), layers=(id)=>`<path ${id} class="pk" d="${TRACK.d}" fill="none" stroke="url(#kerbp)" stroke-width="34" stroke-linejoin="round"/>
   <path class="pa" d="${TRACK.d}" fill="none" stroke="#3a3c44" stroke-width="26" stroke-linejoin="round"/>
   <path class="pd" d="${TRACK.d}" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.5" stroke-dasharray="10 12"/>
   <circle class="ps" cx="${s[1]}" cy="${s[2]}" r="7" fill="#fff"/>`;
  $('trackg').innerHTML=layers('id="tp"')+`<text x="${+s[1]+12}" y="${+s[2]+24}" fill="#fff" fill-opacity=".5" font-size="13" font-family="Titillium Web" font-weight="700">LARGADA / META</text>`;
  paintFondo();
  // calle de boxes: paralela a la recta de meta, del lado con más espacio
  const pth=$('tp'), PL=pth.getTotalLength(), a=pth.getPointAtLength(0), b=pth.getPointAtLength(Math.min(PL*0.01,12));
  let tx=b.x-a.x, ty=b.y-a.y; const nn=Math.hypot(tx,ty)||1; tx/=nn; ty/=nn;
  let nx=-ty, ny=tx; const inside=(x,y)=>x>16&&x<784&&y>16&&y<444;
  if(!inside(a.x+nx*40,a.y+ny*40)){nx=-nx;ny=-ny}
  PIT={x:a.x+nx*34,y:a.y+ny*34,tx,ty};
  $('trackg').insertAdjacentHTML('beforeend',`<line x1="${PIT.x-tx*40}" y1="${PIT.y-ty*40}" x2="${PIT.x+tx*40}" y2="${PIT.y+ty*40}" stroke="#555a66" stroke-width="13" stroke-linecap="round"/>
   <text x="${PIT.x+nx*16}" y="${PIT.y+ny*16+4}" text-anchor="middle" fill="#fff" fill-opacity=".6" font-size="11" font-family="Titillium Web" font-weight="700">BOX</text>`);
  $('qtrack').innerHTML='<defs><pattern id="kerbq" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="16" fill="#ff3b30"/><rect x="8" width="8" height="16" fill="#fff"/></pattern></defs>'+layers('').replace('url(#kerbp)','url(#kerbq)');
  $('qcircuit').textContent=`${RACE.sprint?'Sprint · ':''}Ronda ${MODE==='career'&&CAR_EVT?CAR_EVT.i+1:TRACK.round} · ${TRACK.circuit} · ${TRACK.km.replace('.',',')} km`;
  $('raceTitle').innerHTML=`${RACE.sprint?'Sprint':'Gran Premio'} <em>de ${GPN()}</em>${RACE.rain?' 🌧️':''}`;
  $('raceSub').textContent=`Ronda ${MODE==='career'&&CAR_EVT?CAR_EVT.i+1:TRACK.round} · ${TRACK.circuit} · ${TRACK.km.replace('.',',')} km · 22 autos · ${RACE.laps} vueltas · ${RACE.rain?'¡lluvia! todos con neumáticos de lluvia, sin paradas':RACE.sprint?'sprint: sin paradas, puntos 8 a 1':'una parada obligatoria'}`;
  $('qsub').textContent=`${RACE.sprint?'Sprint':'Gran Premio'} de ${GPN()}, ${MODE==='career'?'fecha '+(CAR_EVT.i+1)+' del calendario 2026':'sorteado del calendario 2026'}.${RACE.rain?' 🌧️ ¡Pista mojada!':''} Una vuelta lanzada por auto: tu piloto y tu auto marcan el ritmo; el dado pone la suerte (o el error).`;
}

// ---------- QUALY ----------
// El orden en que aparecen los tiempos es solo visual (Math.random): el resultado ya viene del motor.
function runQualy(animate,onDone){
  const cars=RACE.cars; cars.forEach(c=>{c.me=c.key===MEKEY});
  const grid=RACE.grid.map(carByKey);
  const order=[...cars]; for(let k=order.length-1;k>0;k--){const j=Math.floor(Math.random()*(k+1));[order[k],order[j]]=[order[j],order[k]]}
  let i=animate?0:order.length, done=animate?[]:[...order];
  const paint=()=>{done.sort((a,b)=>a.q-b.q); const best=done[0].q;
    $('qtower').innerHTML=done.map((c,k)=>`<div class="trow ${c.me?'me':''}"><span class="p">${k+1}</span><span class="c" style="background:${c.color}"></span><span>${c.name}${c.qErr?` <small style="color:var(--red)">· error en ${c.qErr}</small>`:''}</span><span class="g">${k?'+'+(c.q-best).toFixed(3):fmt(c.q)}</span></div>`).join('')};
  const end=()=>{ const m=carByKey(MEKEY), me=grid.indexOf(m)+1;
    $('qtime').textContent=fmt(m.q);
    $('qdie').textContent=FACES[m.luck-1];
    const lk=m.luck<=2?'vuelta mala':m.luck<=4?'vuelta normal':'¡vuelta redonda!';
    $('qpos').innerHTML=`Largas <b style="color:var(--red)">P${me}</b>${m.qErr?`<br><small style="color:var(--muted)">Error en ${m.qErr}: perdiste tiempo</small>`:me===1?'<br><small style="color:var(--yellow)">¡POLE POSITION!</small>':''}<br><small style="color:var(--muted)">Dado de suerte: ${m.luck}/6 · ${lk}</small>`;
    $('qBtn').style.display='none'; onDone&&onDone(); };
  if(!animate){paint();end();return}
  $('qdie').classList.add('spin');
  const t=setInterval(()=>{ done.push(order[i++]); paint(); $('qdie').textContent=FACES[Math.floor(Math.random()*6)]; if(i>=order.length){clearInterval(t);end()} },110);
}
$('qBtn').onclick=()=>{ $('qBtn').disabled=true; runQualy(true,()=>{$('toRace2').style.display='block'}); };
$('toRace2').onclick=()=>{go('s-race',3);startRace(0,MODE==='solo'||MODE==='friendly'||MODE==='daily'||MODE==='career')};
$('toRace').onclick=()=>{
  if(MODE==='daily'){dailyToRace();return}
  prepareRace(MODE==='friendly'?FRIENDLY.seed:null); go('s-quali',2);
};

// ---------- ANIMACIÓN DE LA CARRERA ----------
// syncAt (salas): hora local en que arranca el reloj de carrera para todos; si llegas tarde, se adelanta.
// interactive: se puede decidir qué hacer con el safety car.
// Lluvia: gotas animadas sobre la pista y un tinte oscuro
function paintRain(on){
  $('wetTint').setAttribute('opacity',on?.28:0);
  let h=''; if(on) for(let i=0;i<110;i++){ const x=Math.random()*830, y=Math.random()*460; h+=`<line class="drop" x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x-3).toFixed(0)}" y2="${(y+13).toFixed(0)}" style="animation-delay:-${(Math.random()*.5).toFixed(2)}s"/>`; }
  $('rainfx').innerHTML=h;
}
function startRace(syncAt,interactive){
  const tp=$('tp'), L=tp.getTotalLength(), els={};
  paintRain(!!RACE.rain);
  $('cars').innerHTML=''; $('radio').innerHTML=''; $('scBanner').style.display='none'; $('toResult').style.display='none';
  RACE.cars.forEach(c=>{c.me=c.key===MEKEY});
  RACE.cars.forEach(c=>{const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.innerHTML=`<circle r="${c.me?8:6}" fill="${c.color}" stroke="${c.me?'#fff':'#000'}" stroke-width="2"/>`;$('cars').appendChild(g);els[c.key]=g});
  const scEl=document.createElementNS('http://www.w3.org/2000/svg','g');
  scEl.innerHTML='<rect x="-13" y="-8" width="26" height="16" rx="4" fill="#ffd23f" stroke="#000" stroke-width="2"/><text y="4" text-anchor="middle" font-size="10" font-weight="900" font-family="Titillium Web" fill="#000">SC</text>';
  scEl.style.display='none'; $('cars').appendChild(scEl);
  let cars=RACE.cars, events=RACE.events;
  const winnerEnd=()=>Math.min(...cars.filter(c=>!c.dnf).map(c=>c.cum[RACE.laps]));
  let endT=winnerEnd()+6; const scale=endT/32;               // toda la carrera en ~32 segundos
  const hashKey=k=>[...k].reduce((a,ch)=>a+ch.charCodeAt(0),0);
  let evI=0, playT=0, last=0, paused=false, decided=!interactive||!RACE.sc||!!RACE.nopit, wetOn=!!RACE.rain, rainAsked=!interactive||!RACE.storm;   // con lluvia o en sprint nadie entra a boxes: no hay nada que decidir con el safety car

  const draw=T=>{
    cars.forEach(c=>{const st=E.stateAt(c,T); c.p=Math.min(st.p,RACE.laps); c.out=st.out; c.inPit=st.inPit;
      let x,y;
      if(st.inPit){const along=((hashKey(c.key)%5)-2)*9; x=PIT.x+PIT.tx*along; y=PIT.y+PIT.ty*along}
      else {const pt=tp.getPointAtLength(((c.p*L)%L+L)%L); x=pt.x; y=pt.y}
      els[c.key].setAttribute('transform',`translate(${x},${y})`); els[c.key].style.opacity=c.out?.3:1;
      const dot=els[c.key].firstChild; dot.setAttribute('r',st.inPit?10:(c.me?8:6)); dot.setAttribute('stroke',st.inPit?'#ffd23f':(c.me?'#fff':'#000'));});   // en boxes: más grande y con borde amarillo
    const o=[...cars].sort((a,b)=>(!!a.out-!!b.out)||b.p-a.p||a.pos-b.pos);   // los que ya cruzaron la meta empatan en vueltas: desempata la posición final
    const wn=!!RACE.rain||(!!RACE.storm&&RACE.storm.arrives&&T>=RACE.storm.TR); if(wn!==wetOn){ wetOn=wn; paintRain(wn) }
    const sc=RACE.sc, scOn=!!sc&&T>=sc.T&&T<sc.endT;
    if(scOn){ const pt=tp.getPointAtLength((((o[0].p+0.025)*L)%L+L)%L); scEl.setAttribute('transform',`translate(${pt.x},${pt.y})`); }
    scEl.style.display=scOn?'':'none';
    $('scBanner').style.display=scOn?'block':'none';
    $('lights').className=scOn?'lights sc':'lights go';
    tower(o);
    $('lap').textContent=`VUELTA ${Math.min(RACE.laps,Math.floor(o[0].p)+1)}/${RACE.laps}`;
  };
  draw(0);

  const li=$('lights').children; let k=0;
  const lights=()=>{const t=setInterval(()=>{ if(k<5){li[k].style.background='#ff3b30';li[k].style.boxShadow='0 0 10px #ff3b30';k++} else {clearInterval(t);$('lights').className='lights go';[...li].forEach(x=>x.style.cssText='');run(syncAt?Math.max(0,Date.now()-syncAt):0)} },400)};
  $('lights').className='lights'; [...li].forEach(x=>x.style.cssText='');
  if(!syncAt) lights();
  else { const wait=syncAt-2000-Date.now();
    if(wait>=0) setTimeout(lights,wait); else { $('lights').className='lights go'; run(Math.max(0,Date.now()-syncAt)); } }

  // el jugador decide qué hacer con el safety car: la carrera se detiene hasta que elija
  // En una sala: se decide en el momento en que sale el safety car, con un plazo común para todos (lo fija el servidor).
  // Al cerrarse el plazo se piden las decisiones de todos y se vuelve a calcular la carrera con ellas (lo anterior no cambia).
  async function askSCRoom(){
    const me=carByKey(MEKEY), sc=RACE.sc, dl=RS&&RS.room.deadline?srvToLocal(RS.room.deadline):0;
    const apply=async()=>{
      $('mSC').classList.remove('open');
      try{ const s2=await api('state'), d={}; (s2.players||[]).forEach(p=>{ if(p.sc) d[p.pid]=p.sc });
        DECISIONS=d; RACE=newRace(d); RACE.cars.forEach(c=>{c.me=c.key===MEKEY}); cars=RACE.cars; events=RACE.events;
        evI=events.filter(e=>e.T<=playT).length; endT=winnerEnd()+6;
      }catch(e){}
      paused=false; last=performance.now();
    };
    if(!dl||Date.now()>=dl){ await apply(); return }                    // sin plazo abierto (llegaste tarde o no hay nada que decidir)
    if(me.dnf&&me.dnf<=sc.lap){ setTimeout(apply,Math.max(0,dl-Date.now())+300+Math.random()*600); return }       // abandonaste antes: no decidís, pero seguís la carrera con las decisiones de los demás
    const stops=me.ev.filter(e=>e.k==='pit'&&e.lap<=sc.lap), lastStop=stops.length?stops[stops.length-1].lap:0;
    $('scTxt').textContent=`${sc.by} ${sc.why==='choque'?'chocó':'rompió el motor'} y salió el safety car. Con el pelotón lento, entrar a boxes cuesta mucho menos.`;
    $('scInfo').innerHTML=lastStop?`Ya hiciste tu parada en la vuelta ${lastStop}. Tus gomas tienen <b>${sc.lap-lastStop}</b> vueltas: otra parada es opcional.`
      :`Todavía no hiciste tu parada obligatoria. Tus gomas tienen <b>${sc.lap}</b> vueltas.`;
    window.__resolveSC=(dec)=>{ $('mSC').classList.remove('open'); api('decide',{choice:dec}).then(()=>toast('Decisión enviada: '+(dec==='pit'?'entras a boxes':'sigues en pista'))).catch(e=>toast(e.message)) };
    openM('mSC');
    setTimeout(apply,Math.max(0,dl-Date.now())+300+Math.random()*600);   // al cerrarse el plazo, con las decisiones de todos
  }
  function askSC(){
    if(interactive==='room'){ askSCRoom(); return }
    const me=carByKey(MEKEY), sc=RACE.sc;
    const stops=me.ev.filter(e=>e.k==='pit'&&e.lap<=sc.lap), lastStop=stops.length?stops[stops.length-1].lap:0;
    $('scTxt').textContent=`${sc.by} ${sc.why==='choque'?'chocó':'rompió el motor'} y salió el safety car. Con el pelotón lento, entrar a boxes cuesta mucho menos.`;
    $('scInfo').innerHTML=lastStop?`Ya hiciste tu parada en la vuelta ${lastStop}. Tus gomas tienen <b>${sc.lap-lastStop}</b> vueltas: otra parada es opcional.`
      :`Todavía no hiciste tu parada obligatoria. Tus gomas tienen <b>${sc.lap}</b> vueltas.`;
    openM('mSC');
  }
  // pronóstico de tormenta: entrar por gomas de lluvia o seguir con slicks (la lluvia puede no llegar)
  function askRain(){
    const st=RACE.storm;
    $('rainTxt').textContent=`Se anuncian lluvias o tormentas en las próximas vueltas: hay un ${st.p}% de probabilidad de que llegue de verdad.`;
    $('rainInfo').innerHTML=`Si entrás ahora cambiás a gomas de lluvia (cuenta como tu parada obligatoria). Si llueve, ganás muchísimo; si la lluvia no llega, perdés tiempo con gomas de lluvia en pista seca y tenés que volver a boxes. Si te quedás con slicks y llueve, perdés muchísimo hasta que cambies.`;
    openM('mRAIN');
  }
  window.__resolveRain=(dec)=>{
    $('mRAIN').classList.remove('open');
    DECISIONS={...DECISIONS,'r:me':dec}; RACE=newRace(DECISIONS);
    RACE.cars.forEach(c=>{c.me=c.key===MEKEY}); cars=RACE.cars; events=RACE.events;
    evI=events.filter(e=>e.T<=playT).length; endT=winnerEnd()+6;
    paused=false; last=performance.now();
  };
  window.__resolveSC=(dec)=>{
    $('mSC').classList.remove('open');
    DECISIONS={...DECISIONS,me:dec}; RACE=newRace(DECISIONS);               // lo que pasó antes del safety car es idéntico
    RACE.cars.forEach(c=>{c.me=c.key===MEKEY}); cars=RACE.cars; events=RACE.events;
    evI=events.filter(e=>e.T<=playT).length; endT=winnerEnd()+6;
    paused=false; last=performance.now();
  };

  function run(lateMs){
    playT=lateMs/1000*scale; last=performance.now();
    const tick=()=>{
      if(paused){setTimeout(tick,100);return}
      const now=performance.now(), sc0=RACE.sc, slow=sc0&&playT>=sc0.T&&playT<sc0.endT?0.5:1;   // con safety car, cámara lenta para ver las paradas
      playT=Math.min(endT,playT+(now-last)/1000*scale*slow); last=now;
      while(evI<events.length && events[evI].T<=playT) msg(events[evI++]);
      draw(playT);
      if(!rainAsked && RACE.storm && playT>=RACE.storm.T){ rainAsked=true; const me=carByKey(MEKEY); if(me&&(!me.dnf||me.dnf>RACE.storm.ann)){ paused=true; askRain(); setTimeout(tick,100); return } }
      if(!decided && RACE.sc && playT>=RACE.sc.T){ decided=true; const me=carByKey(MEKEY); if(me&&(interactive==='room'||!me.dnf||me.dnf>RACE.sc.lap)){ paused=true; askSC(); setTimeout(tick,100); return } }
      if(playT<endT) setTimeout(tick,33); else finish();
    }; tick();
  }
}
// Diferencias de la tabla: "Líder" (a cuánto del primero) o "Intervalo" (a cuánto del auto de adelante, como en la TV de la F1). Se recuerda la elección.
let GAP=(()=>{ try{ return localStorage.getItem('boxbox_gap')==='int'?'int':'lider' }catch(e){ return 'lider' } })(), TOW=null;
function gapOf(o,i){
  const c=o[i], ref=GAP==='int'?o[i-1]:o[0];
  const fin=c.p>=RACE.laps&&ref.p>=RACE.laps;
  return Math.max(0,fin?c.cum[RACE.laps]-ref.cum[RACE.laps]:(ref.p-c.p)*TRACK.lap);
}
function paintGapSw(){ document.querySelectorAll('#gapSw [data-gap]').forEach(b=>b.classList.toggle('on',b.dataset.gap===GAP)) }
$('gapSw').onclick=e=>{ const b=e.target.closest('[data-gap]'); if(!b) return; GAP=b.dataset.gap; ev('intervalo',{g:GAP}); try{ localStorage.setItem('boxbox_gap',GAP) }catch(err){} paintGapSw(); if(TOW) tower(TOW) };
paintGapSw();
function tower(o){
  TOW=o;
  $('tower').innerHTML=o.map((c,i)=>`<div class="trow ${c.me?'me':''}" style="${c.out?'opacity:.4':''}"><span class="p">${i+1}</span><span class="c" style="background:${c.color}"></span><span>${c.name}</span><span class="g">${c.out?'OUT':c.inPit?'<b style="color:var(--yellow)">BOX</b>':i?'+'+gapOf(o,i).toFixed(1)+'s':'LÍDER'}</span></div>`).join('');
}
function msg(e){
  const mine=e.carKey===MEKEY;
  if(e.k==='pit'&&!mine) return;                          // las paradas de rivales no ensucian la radio
  if(e.k==='radio'&&!mine) return;
  let cls='',who,txt=e.txt;
  if(e.k==='sc'){cls='sc';who='🚨 Safety car'}
  else if(e.k==='green'){cls='ok';who='🟢 Dirección de carrera'}
  else if(e.k==='rain'){cls='inc';who='🌧️ Dirección de carrera'}
  else if(e.k==='forecast'){cls='sc';who='⛈️ Pronóstico'}
  else if(e.k==='radio'){who=e.who==='eng'?`📻 Ingeniero → ${picks.piloto.n}`:`📻 ${picks.piloto.n}`;txt=`"${e.txt}"`}
  else if(e.k==='pit'){who=`📻 Estratega → ${picks.piloto.n}`}
  else {cls='inc';who='⚠ Dirección de carrera'}
  $('radio').insertAdjacentHTML('afterbegin',`<div class="msg ${cls}"><b>${who} · V${e.lap}</b>${esc(txt)}</div>`);
  while($('radio').children.length>5)$('radio').lastChild.remove();
}
let RESULT=null;
function finish(){
  const cls=RACE.classification.map(carByKey), me=carByKey(MEKEY);
  RESULT={pos:me.pos,dnf:me.dnf,grid:me.grid,stops:me.stops,cls};
  $('radio').insertAdjacentHTML('afterbegin',`<div class="msg" style="border-color:#fff"><b>🏁 Bandera a cuadros</b>${me.dnf?'Abandonaste en la vuelta '+me.dnf:'Terminaste P'+me.pos}.</div>`);
  $('toResult').style.display='block';
  if(MODE==='career') careerRecord(me);
  else if(MODE==='friendly'||MODE==='daily'){ /* no suma al campeonato: el amistoso no cuenta y el diario se registra en el servidor */ if(MODE==='daily') dailyFinish(); }
  else { saveRace(me); saveStats(me.pos,me.dnf); }
  // La carrera de la sala terminó: no volver a ella al recargar (el resultado sigue en pantalla).
  if(MODE==='room'&&!(RS&&RS.room.modo==='carrera')){ try{localStorage.removeItem(ROOM_KEY)}catch(e){} }    // en modo carrera la sala sigue
}

// ---------- Por qué terminaste así ----------
// Explica el resultado con las piezas del jugador: ritmo, errores, paradas y safety car.
function raceStory(c){
  const L=[], laps=RACE.laps, OPT=Math.round(laps/2), K=RACE.sprint?1:laps/20, add=(t,k)=>L.push({t,k});
  const pace=[...RACE.cars].sort((a,b)=>E.paceOf(b)-E.paceOf(a)), rank=pace.indexOf(c)+1;
  add(`🏎️ Ritmo: tu auto fue el <b>${rank}.º más rápido</b> de la parrilla (coche ${c.c}, piloto ${c.d}, motor ${c.m}).`, rank<=5?'good':rank>=15?'bad':'');
  add(`⏱️ Largaste en el puesto <b>${c.grid}</b>${c.qErr?`, con un error en ${c.qErr}`:''}.`, c.grid<=5?'good':c.grid>=15?'bad':'');
  const offs=c.ev.filter(e=>e.k==='off').length;
  if(offs) add(`⚠️ Tu piloto (${c.d}) se salió de pista <b>${offs} ${offs===1?'vez':'veces'}</b> y perdió tiempo: con menos de 90 de media pasa seguido.`,'bad');
  const crash=c.ev.find(e=>e.k==='crash'), eng=c.ev.find(e=>e.k==='engine');
  if(crash&&/también/.test(crash.txt)) add(`💥 Otro piloto te llevó por delante en la vuelta ${crash.lap}: abandonaste sin culpa.`,'bad');
  else if(crash) add(`💥 Tu piloto (${c.d}) <b>chocó</b> en la vuelta ${crash.lap}. Con menos de 75 de media es lo más riesgoso.`,'bad');
  if(eng) add(`🔧 Tu motor (${c.m}) <b>se rompió</b> en la vuelta ${eng.lap}: con menos de 80 puede pasar.`,'bad');
  for(const e of c.ev.filter(e=>e.k==='pit')){
    if(e.why==='sc') add(`🚨 Aprovechaste el <b>safety car</b> para parar en la vuelta ${e.lap}.`,'good');
    else if(e.why==='extra') add(`🧠 Tu estratega (${c.s}) mandó una <b>parada de más</b> en la vuelta ${e.lap}.`,'bad');
    else { const d=Math.abs(e.lap-OPT)/K;
      add(d>=3?`🧠 Tu estratega (${c.s}) te hizo parar en la vuelta ${e.lap}, lejos de lo ideal (hacia la ${OPT}): <b>${e.lap>OPT?'gomas gastadas':'demasiado pronto'}</b>.`:`🧠 Tu estratega (${c.s}) te hizo parar en la vuelta ${e.lap}, a buen tiempo.`, d>=3?'bad':'good'); }
  }
  if(c.stops) add(c.stat>=3.4?`🔧 Tus mecánicos (jefe ${c.j}) <b>tardaron ${c.stat} s</b> en cada parada: son lentos.`:`🔧 Tus mecánicos (jefe ${c.j}) pararon el auto en <b>${c.stat} s</b>.`, c.stat>=3.4?'bad':c.stat<=2.6?'good':'');
  return L;
}
function paintStory(){
  const me=carByKey(MEKEY); if(!me){ $('story').style.display='none'; return }
  $('story').innerHTML='<h3 style="margin:0 0 4px;font-size:13px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase">Por qué terminaste así</h3><ul>'+raceStory(me).map(x=>`<li class="${x.k}">${x.t}</li>`).join('')+'</ul>';
  $('story').style.display='block';
}

// ---------- Campeonato real (en el boceto: localStorage) ----------
// Cada carrera suma puntos solo al piloto que elegiste (no a los rivales), según donde terminaste.
// Las filas nuevas llevan u:1; las del formato anterior (que cargaba a los 22 pilotos) quedan guardadas pero no se muestran.
const KEY='boxbox_campeonato_v2'; let LAST={};
function loadRaw(){try{return JSON.parse(localStorage.getItem(KEY))||{}}catch(e){return {}}}
function loadChamp(){const o={};for(const [n,r] of Object.entries(loadRaw())) if(r&&r.u) o[n]=r; return o}
function saveRace(me){const c=loadRaw(); LAST={};
  const n=picks.piloto.n, r=c[n]&&c[n].u?c[n]:{pts:0,races:0,wins:0,u:1}, pts=me.dnf?0:(PTS[me.pos-1]||0);
  r.pts+=pts; r.races++; if(!me.dnf&&me.pos===1) r.wins++; c[n]=r; LAST[n]=me.dnf?'DNF':pts?'+'+pts:'—';
  try{localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}}

$('toResult').onclick=()=>{
  if(BLIND){BLIND=false;renderSlots()}   // ahora sí se ven las medias
  const {pos,dnf,grid,stops}=RESULT, pts=dnf?0:(ptsTable()[pos-1]||0), p=picks.piloto, career=MODE==='career', special=MODE==='daily'||MODE==='friendly'||career;
  ev('carrera_fin',{modo:MODE,pos:dnf?0:pos,dnf:!!dnf}); $('pos').textContent=dnf?'DNF':'P'+pos; $('pos').className='pos'+(!dnf&&pos===1?' p1':'');
  $('resmsg').textContent=career?`${dnf?'Abandono: sin puntos':'+'+pts+' punto'+(pts===1?'':'s')} · tu temporada 2026 va por ${carPts()} puntos`:special?(MODE==='daily'?'Desafío del día: no suma a tu campeonato de pilotos':'Amistoso: no cuenta para el ranking ni para la racha'):pts?`+${pts} puntos para ${p.n} en tu campeonato`:dnf?'Abandono: sin puntos':'Sin puntos esta vez';
  SHARE=buildShare(RESULT); $('share').innerHTML=esc(SHARE.text).replace(/\n/g,'<br>');
  if(MODE==='room'){
    const rows=RESULT.cls.map((c,i)=>({c,i})).filter(x=>x.c.human);
    $('roomRes').innerHTML=`<h3 style="margin:0 0 8px;font-size:13px;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase">Resultado de la sala ${esc(ROOM.code)}</h3>`+
      rows.map(({c,i})=>`<div class="trow ${c.me?'me':''}" style="margin-bottom:4px"><span class="p">${c.dnf?'—':i+1}</span><span class="c" style="background:${c.color}"></span><span>${c.name}</span><span class="g">${c.dnf?'DNF':(ptsTable()[i]?'+'+ptsTable()[i]+' pts':'')}</span></div>`).join('');
    $('roomRes').style.display='block'; $('again').querySelector('span').textContent='Volver al inicio';
  }
  $('roomRes').style.display=MODE==='room'?'block':'none'; $('dailyRes').style.display='none';
  $('again').querySelector('span').textContent=career?'Volver al calendario':special?'Volver al desafío':MODE==='room'?(RS&&RS.room.modo==='carrera'?'Volver a la sala':'Volver al inicio'):'Otra tirada';
  $('toChamp').style.display=special?'none':'';
  paintStory();
  go('s-result',4);
  if(MODE==='daily') paintDailyResult();
};
$('toChamp').onclick=()=>{
  const rows=Object.entries(loadChamp()).sort((a,b)=>b[1].pts-a[1].pts);
  $('champBody').innerHTML=rows.length?rows.map(([n,r],i)=>`<tr class="${n===picks.piloto.n?'hl':''}"><td class="n">${i+1}</td><td><b>${n}</b></td><td>${r.races}</td><td>${r.wins}</td><td style="color:var(--muted)">${LAST[n]||''}</td><td class="pts">${r.pts}</td></tr>`).join('')
    :'<tr><td colspan="6" class="empty">Todavía sin puntos. ¡Corre tu primera carrera!</td></tr>';
  $('champ').style.display='block'; $('champ').scrollIntoView({behavior:'smooth'});
};
$('again').onclick=()=>{ if(MODE==='career'){showCareer();return}
  if(MODE==='room'&&RS&&RS.room.modo==='carrera'){ location.href=location.pathname+'?sala='+encodeURIComponent(ROOM.code); return }   // vuelve a la sala (la sesión de la sala queda guardada)
  if(MODE==='room'){forgetRoom();location.href=location.pathname;return}
  if(MODE==='daily'||MODE==='friendly'){location.href=location.pathname+'?desafio';return}
  try{sessionStorage.setItem('boxbox_auto',MODE)}catch(e){};location.reload()};
// ---------- MODO CARRERA 2026 ----------
// Calendario de la F1 2026 (t = circuito en circuitos.json). El GP de Arabia Saudí figura como cancelado y se saltea.
// "Bahrein en Malasia" se corre en el trazado de Baréin: no tengo el de Malasia.
let CAL=[];   // = E.CAL_2026 (supabase/functions/_shared/engine.js), se carga con el motor
const CKEY='boxbox_carrera_2026';
let CAR=null, CAR_EVT=null;
function carLoad(){try{return JSON.parse(localStorage.getItem(CKEY))}catch(e){return null}}
function carSave(){try{localStorage.setItem(CKEY,JSON.stringify(CAR))}catch(e){}}
const carPts=()=>CAR.log.reduce((t,l)=>t+(l.pts||0),0);
// Fechas de la temporada: la completa (con el GP cancelado) o el calendario a medida [[lugar en CAL, 1 si lleva sprint], …]. CAR.i es el lugar en esta lista.
const carList=()=>CAR.cal?CAR.cal.map(([i,s])=>({idx:i,sprint:!!s})):CAL.map((c,i)=>({idx:i,sprint:!!c.sprint,cancel:!!c.cancel}));
function carNext(){
  const L=carList();
  while(L[CAR.i]&&L[CAR.i].cancel){ CAR.log.push({i:CAR.i,kind:'cancel'}); CAR.i++ }   // el GP cancelado se saltea solo
  const it=L[CAR.i]; if(!it) return null;
  return {ev:CAL[it.idx],it,kind:it.sprint&&!CAR.log.some(l=>l.i===CAR.i&&l.kind==='sprint')?'sprint':'gp'};
}
async function showCareer(){
  await READY; CAL=E.CAL_2026;
  CAR=carLoad()||{i:0,log:[],picks:null}; MODE='solo'; BLIND=false; CAR_EVT=null;
  $('st0').style.display='none'; renderCareer(); go('s-career',0);
}
function renderCareer(){
  const nx=carNext(); carSave();
  const gps=CAR.log.filter(l=>l.kind==='gp'), wins=gps.filter(l=>!l.dnf&&l.pos===1).length, pods=gps.filter(l=>!l.dnf&&l.pos<=3).length;
  $('carSub').textContent=CAR.log.some(l=>l.kind!=='cancel')?`${carPts()} puntos · GP corridos: ${gps.length}${CAR.cal?' de '+CAR.cal.length:''} · Victorias: ${wins} · Podios: ${pods}`:CAR.cal?`Temporada a medida: ${CAR.cal.length} fechas, un fin de semana a la vez.`:'Una temporada completa, un fin de semana a la vez.';
  $('carCal').style.display=CAR.log.some(l=>l.kind!=='cancel')?'none':'';
  const res=l=>!l?'':l.dnf?'DNF':`P${l.pos}`;
  $('carBody').innerHTML=carList().map((it,k)=>{
    const c=CAL[it.idx], s=CAR.log.find(l=>l.i===k&&l.kind==='sprint'), g=CAR.log.find(l=>l.i===k&&l.kind==='gp'), isNx=nx&&k===CAR.i;
    if(c.cancel) return `<tr class="cx"><td class="n">${k+1}</td><td>${c.gp}</td><td>${c.date}</td><td colspan="2">❌ Cancelado (situación en Medio Oriente)</td></tr>`;
    const r=[s?`🏃 ${res(s)}`:'',g?`${res(g)}${g.rain?' 🌧️':''}`:isNx?'▶ Siguiente':''].filter(Boolean).join(' · ');
    return `<tr class="${isNx?'nx':''}"><td class="n">${k+1}</td><td><b>${c.gp}</b>${it.sprint?'<span class="sprb">SPRINT</span>':''}</td><td>${c.date}</td><td>${r}</td><td class="pts">${(s?s.pts:0)+(g?g.pts:0)||(s||g?0:'')}</td></tr>`;
  }).join('');
  const tp={}, tc={};
  CAR.log.filter(l=>l.kind!=='cancel'&&l.pilot).forEach(l=>{ const w=!l.dnf&&l.pos===1&&l.kind==='gp';
    [[tp,l.pilot],[tc,l.car]].forEach(([m,k])=>{ if(!k) return; const r=m[k]||(m[k]={pts:0,races:0,wins:0}); r.pts+=l.pts||0; r.races++; if(w) r.wins++ }) });
  $('carTables').innerHTML=champBlock('Campeonato de pilotos','Piloto',tp)+champBlock('Campeonato de constructores','Constructor',tc)
    +'<div class="note">Suma puntos el piloto y el coche que elegiste en cada carrera (los de tus rivales no cuentan).</div>';
  $('carGo').querySelector('span').textContent=!nx?'Nueva temporada':!CAR.log.some(l=>l.kind!=='cancel')?'Empezar la temporada':nx.kind==='sprint'?`Correr la sprint de ${nx.ev.gp}`:`Correr el GP de ${nx.ev.gp}`;
}
// Tabla de campeonato (pilotos o constructores) a partir de {nombre:{pts,races,wins}}
function champBlock(title,col,map){
  const rows=Object.entries(map).sort((a,b)=>b[1].pts-a[1].pts||b[1].wins-a[1].wins);
  return `<h3 style="margin:16px 0 6px">${title}</h3><table class="cal"><thead><tr><th>#</th><th>${col}</th><th>Carreras</th><th>Victorias</th><th style="text-align:right">Pts</th></tr></thead><tbody>`
    +(rows.length?rows.map(([n,r],i)=>`<tr><td class="n">${i+1}</td><td><b>${esc(n)}</b></td><td>${r.races}</td><td>${r.wins}</td><td class="pts">${r.pts}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Todavía sin puntos. ¡Corre tu primera carrera!</td></tr>')+'</tbody></table>';
}
$('carGo').onclick=async()=>{
  await READY; const nx=carNext();
  if(!nx){ CAR={i:0,log:[],picks:null,cal:null}; renderCareer(); return }
  MODE='career'; BLIND=false;
  CAR_EVT={i:CAR.i,kind:nx.kind,trackIdx:nx.ev.t,gp:nx.ev.gp};
  LAPS=nx.kind==='sprint'?E.SPRINT_LAPS:20;
  $('st0').style.display='';
  if(nx.kind==='gp'&&CAR.picks){ picks=CAR.picks; prepareRace(null); go('s-quali',2); return }    // GP de un fin de semana de sprint: mismo auto
  resetBuild(2); go('s-build',1);
  $('buildTitle').innerHTML=`${nx.kind==='sprint'?'Sprint':'GP'} <em>de ${nx.ev.gp}</em>`;
  $('buildSub').textContent=`Fecha ${CAR.i+1} del calendario${CAR.cal?' a medida':' 2026'}. Tira el dado y arma tu auto${nx.it.sprint?': lo usás en la sprint y en el GP':''}.`;
};
$('carReset').onclick=()=>{ if(!confirm('¿Reiniciar la temporada? Se borra tu progreso del modo carrera.')) return; CAR={i:0,log:[],picks:null,cal:CAR&&CAR.cal||null}; renderCareer() };
function careerRecord(me){
  const kind=CAR_EVT.kind, pts=me.dnf?0:((kind==='sprint'?E.SPRINT_PTS:PTS)[me.pos-1]||0);
  CAR.log.push({i:CAR_EVT.i,kind,pos:me.pos,dnf:me.dnf?1:0,pts,rain:RACE.rain?1:0,pilot:picks.piloto.n,car:picks.coche.n});
  if(kind==='sprint') CAR.picks=picks; else { CAR.picks=null; CAR.i=CAR_EVT.i+1 }
  carSave();
}
$('hCareer').onclick=()=>showCareer();
// ---------- CALENDARIO A MEDIDA ----------
// Lista de [lugar en CAL_2026, 1 si lleva sprint]. null = temporada completa. Se elige al empezar y no se cambia (solo, o el anfitrión al crear la sala).
const CAL_PRESETS=[['Temporada completa',null],['Corta · 8',[[0,1],[6,1],[9,1],[10,1],[13,1],[17,1],[19,1],[23,1]]],['Clásicas · 5',[[2,1],[6,1],[9,1],[10,1],[13,1]]],
  ['Europa · 9',[[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1]]],['Solo sprints · 6',[[1,1],[4,1],[5,1],[9,1],[12,1],[17,1]]],['Mini · 3',[[6,1],[10,1],[13,1]]]];
let CALB=null, CUSTOM_CAL=null, LCALOPEN=false;
const calFull=()=>CAL.map((c,i)=>c.cancel?null:[i,c.sprint?1:0]).filter(Boolean);
async function openCalBuilder(initial,done){
  await READY; CAL=E.CAL_2026; CALB={list:(initial||calFull()).map(x=>[...x]),done};
  $('calPresets').innerHTML=CAL_PRESETS.map(([n],k)=>`<button class="btn ghost" data-cp="${k}" style="padding:4px 10px;font-size:13px"><span>${n}</span></button>`).join('');
  calRender(); openM('mCal');
}
function calRender(){
  const L=CALB.list, used=new Set(L.map(x=>x[0])), btn=(a,v,l,dis)=>`<button class="btn ghost" data-${a}="${v}" style="padding:2px 9px;font-size:14px" ${dis?'disabled':''}><span>${l}</span></button>`;
  $('calN').textContent=L.length;
  $('calSel').innerHTML=L.map(([i,s],k)=>{ const c=CAL[i];
    return `<div class="opt" style="align-items:center;gap:6px"><span><b>${k+1}.</b> ${esc(c.gp)} <small class="note">${E.lapsFor(c.t)} vueltas</small>${c.sprint?` <label class="note" style="display:inline-flex;gap:4px;align-items:center;margin-left:6px"><input type="checkbox" data-cs="${k}" ${s?'checked':''} style="width:auto;margin:0">🏃 sprint</label>`:''}</span><span style="display:flex;gap:4px">${btn('cu',k,'↑',k===0)}${btn('cd',k,'↓',k===L.length-1)}${btn('cx',k,'✕')}</span></div>`; }).join('')||'<div class="note">Todavía no elegiste ninguna pista.</div>';
  $('calAvail').innerHTML=CAL.map((c,i)=>c.cancel||used.has(i)?'':`<button class="btn ghost" data-ca="${i}" style="padding:4px 10px;font-size:13px;margin:0 6px 6px 0"><span>+ ${esc(c.gp)}${c.sprint?' 🏃':''}</span></button>`).join('')||'<div class="note">Ya agregaste todas las pistas.</div>';
  $('calErr').textContent=L.length<E.CAL_MIN?`Elegí al menos ${E.CAL_MIN} fechas.`:'';
  $('calOk').disabled=L.length<E.CAL_MIN;
}
$('mCal').addEventListener('click',e=>{ if(!CALB) return; const L=CALB.list, t=e.target.closest('button,input'); if(!t) return;
  const d=t.dataset, num=v=>+v;
  if(d.cp!==undefined){ const p=CAL_PRESETS[num(d.cp)][1]; CALB.list=(p||calFull()).map(x=>[...x]) }
  else if(d.cu!==undefined){ const k=num(d.cu); if(k>0) [L[k-1],L[k]]=[L[k],L[k-1]] }
  else if(d.cd!==undefined){ const k=num(d.cd); if(k<L.length-1) [L[k+1],L[k]]=[L[k],L[k+1]] }
  else if(d.cx!==undefined) L.splice(num(d.cx),1);
  else if(d.ca!==undefined) L.push([num(d.ca),CAL[num(d.ca)].sprint?1:0]);
  else if(d.cs!==undefined) L[num(d.cs)][1]=t.checked?1:0;
  else return;
  calRender() });
$('calOk').onclick=()=>{ const L=CALB.list; if(L.length<E.CAL_MIN) return;
  const full=calFull(), same=L.length===full.length&&L.every((x,k)=>x[0]===full[k][0]&&x[1]===full[k][1]);   // igual a la temporada completa: se guarda como "completa"
  const done=CALB.done; $('mCal').classList.remove('open'); CALB=null; done(same?null:L.map(x=>[...x])) };
$('carCal').onclick=()=>openCalBuilder(CAR&&CAR.cal,cal=>{ CAR.cal=cal; CAR.i=0; CAR.log=[]; CAR.picks=null; renderCareer() });
$('fCareer').onchange=()=>{ $('fCalRow').style.display=$('fCareer').checked?'flex':'none' };
const calTxt=cal=>cal?`Calendario a medida (${cal.length} fechas)`:'Temporada completa (23 fechas)';
$('fCalBtn').onclick=()=>openCalBuilder(CUSTOM_CAL,cal=>{ CUSTOM_CAL=cal; $('fCalTxt').textContent=calTxt(cal) });
$('carFriends').onclick=()=>{ $('fCareer').checked=true; $('fCalRow').style.display='flex'; $('fErr').textContent=''; openM('mFriends') };   // sala de carrera con amigos (o unirse con un código)

// ---------- IDIOMA ----------
// El juego está escrito en español (idioma por defecto). Cada idioma es un diccionario en lang/xx.js:
// s = textos exactos, p = textos con partes variables ({0}, {1}…), w = palabras sueltas (países, meses).
// Los textos de la página se traducen en el navegador, incluidos los que el juego genera después (un observador los ve aparecer).
const LANGS=[['pt','PT'],['en','EN'],['es','ES'],['fr','FR'],['pl','PL'],['it','IT'],['de','DE'],['tr','TR']], LOCALES={es:'es',en:'en-US',pt:'pt-BR',fr:'fr-FR',pl:'pl-PL',it:'it-IT',de:'de-DE',tr:'tr-TR'};
let LANG='es', TR=null;
const T_ORIG=new WeakMap(), T_LAST=new WeakMap(), A_ORIG=new WeakMap(), ATTRS=['placeholder','title','aria-label'];
function trCompile(d){
  const pats=Object.entries(d.p||{}).map(([k,v])=>{ const idx={}; let g=0;
    const src=k.replace(/[.*+?^$|()[\]\\]/g,'\\$&').replace(/\{(\d+)\}/g,(_,i)=>{ g++; if(idx[i]===undefined) idx[i]=g; return '(.+?)' });
    return [new RegExp('^'+src+'$'),v,idx] });
  return {s:d.s||{},pats,w:Object.entries(d.w||{}).sort((a,b)=>b[0].length-a[0].length)};
}
function trText(t){
  const q=/^"(.*)"$/.exec(t); if(q) return '"'+trText(q[1])+'"';
  let out=TR.s[t];
  if(out===undefined) for(const [re,v,idx] of TR.pats){ const m=re.exec(t); if(m){ out=v.replace(/\{(\d+)\}/g,(_,i)=>m[idx[i]]); break } }
  if(out===undefined) out=t;
  for(const [k,v] of TR.w) if(out.includes(k)) out=out.split(k).join(v);
  return out;
}
function xlateText(n){
  if(n.parentNode&&/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) return;
  const cur=n.nodeValue;
  if(!(T_LAST.has(n)&&T_LAST.get(n)===cur)) T_ORIG.set(n,cur);                 // texto nuevo puesto por el juego
  const o=T_ORIG.get(n); if(o===undefined) return;
  let nv=o;
  if(LANG!=='es'&&/[A-Za-zÀ-ÿ]/.test(o)){
    const lead=o.match(/^\s*/)[0], trail=o.match(/\s*$/)[0], core=o.trim().replace(/\s+/g,' ');
    nv=lead+trText(core)+trail;
  }
  if(nv!==cur){ T_LAST.set(n,nv); n.nodeValue=nv } else if(nv===o) T_LAST.delete(n);
}
function xlateAttr(el,a){
  const m=A_ORIG.get(el)||{}, cur=el.getAttribute(a); if(cur==null) return;
  if(!(m[a]&&m[a].last===cur)) m[a]={orig:cur,last:cur}; A_ORIG.set(el,m);
  const nv=LANG==='es'?m[a].orig:trText(m[a].orig.trim());
  if(nv!==cur){ m[a].last=nv; el.setAttribute(a,nv) }
}
function xlateTree(root){
  if(root.nodeType===3){ xlateText(root); return }
  if(root.nodeType!==1) return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let n; while((n=w.nextNode())) xlateText(n);
  const els=[root,...root.querySelectorAll('[placeholder],[title],[aria-label]')];
  els.forEach(el=>{ if(el.getAttribute) ATTRS.forEach(a=>{ if(el.hasAttribute(a)) xlateAttr(el,a) }) });
}
let xlateBusy=false;
new MutationObserver(ms=>{
  if(LANG==='es'||xlateBusy) return; xlateBusy=true;
  try{ for(const m of ms){
    if(m.type==='childList') m.addedNodes.forEach(xlateTree);
    else if(m.type==='characterData') xlateText(m.target);
    else if(m.type==='attributes') xlateAttr(m.target,m.attributeName);
  } }finally{ xlateBusy=false }
}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
async function setLang(code){
  ev('idioma',{l:code});
  if(!LANGS.some(l=>l[0]===code)) code='es';
  if(code!=='es'){ try{ TR=trCompile((await import('./lang/'+code+'.js?v='+BUILD)).default) }catch(e){ console.warn(e); toast('No se pudo cargar el idioma.'); return } }
  LANG=code; document.documentElement.lang=code;
  try{ localStorage.setItem('boxbox_idioma',code) }catch(e){}
  xlateBusy=true; try{ xlateTree(document.body) }finally{ xlateBusy=false }
  document.querySelectorAll('#langBtns button').forEach(b=>b.classList.toggle('on',b.dataset.lang===code));
}
$('langBtns').innerHTML=LANGS.map(([c,l])=>`<button data-lang="${c}">${l}</button>`).join('');
$('langBtns').onclick=e=>{ const b=e.target.closest('button'); if(b) setLang(b.dataset.lang) };
$('langBtns').querySelector('[data-lang="es"]').classList.add('on');
try{ const sv=localStorage.getItem('boxbox_idioma'); if(sv&&sv!=='es') setLang(sv) }catch(e){}     // siempre arranca en español salvo que ya hayas elegido otro

// ---------- Inicio, navegación, ajustes, perfil, modales ----------
// MODE se declara arriba, junto al estado del juego
const today=new Date(), DAYKEY=today.getFullYear()*10000+(today.getMonth()+1)*100+today.getDate();
$('hPlay').onclick=()=>startGame('solo');
$('hDaily').onclick=$('nDaily').onclick=()=>showDaily();
$('hFriends').onclick=()=>{ $('fCareer').checked=false; openM('mFriends') };
$('hChamp').onclick=$('nChamp').onclick=()=>showChampPage();
$('nProfile').onclick=()=>showProfile();
$('logo').onclick=()=>{location.href=location.pathname};   // al inicio, sin ?sala ni otros parámetros
$('homeCar').innerHTML=carSVG('#ff3b30');
// Ajustes: tema claro / oscuro
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('boxbox_tema',t)}catch(e){}}
try{setTheme(localStorage.getItem('boxbox_tema')||'dark')}catch(e){setTheme('dark')}
$('nSettings').onclick=e=>{e.stopPropagation();$('ddm').classList.toggle('open')};
document.addEventListener('click',()=>$('ddm').classList.remove('open'));
$('tDark').onclick=()=>setTheme('dark'); $('tLight').onclick=()=>setTheme('light');
$('dReset').onclick=()=>resetChamp(false); $('dNew').onclick=()=>resetChamp(true);
// Modales
function openM(id){$(id).classList.add('open')}
document.querySelectorAll('.modal').forEach(m=>{ if(m.id==='mSC'||m.id==='mRAIN') return; m.onclick=e=>{if(e.target===m||e.target.closest('[data-close]'))m.classList.remove('open')}});
// Donaciones
const CAFECITO_USER='boxf1box';   // → https://cafecito.app/boxf1box
if(CAFECITO_USER){$('cafLink').href='https://cafecito.app/'+encodeURIComponent(CAFECITO_USER);$('cafOpt').style.display=''}
$('mpCopy').onclick=async()=>{const a=$('mpAlias').textContent;
  try{await navigator.clipboard.writeText(a)}catch(e){const r=document.createRange();r.selectNodeContents($('mpAlias'));const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy')}
  $('mpCopy').textContent='¡Copiado!';setTimeout(()=>$('mpCopy').textContent='Copiar alias',1800)};
$('fDonate').onclick=()=>{ ev('apoyo_abre'); openM('mDonate') };
$('fSuggest').onclick=()=>{$('sType').selectedIndex=0;openM('mSuggest')};
$('fRating').onclick=()=>{$('sType').selectedIndex=1;openM('mSuggest')};
$('pLogin').onclick=()=>openM('mLogin');
$('sSend').onclick=async()=>{ if(!$('sText').value.trim()){$('sOk').textContent='Escribe tu idea primero.';return}
  const btn=$('sSend'); if(btn.disabled) return; btn.disabled=true; $('sOk').textContent='Enviando…';
  try{
    const h={'Content-Type':'application/json'};
    try{ const s=sb&&(await sb.auth.getSession()).data.session; if(s) h.Authorization='Bearer '+s.access_token }catch(e){}
    const d={tipo:$('sType').value,texto:$('sText').value,email:$('sMail').value};
    // Se guarda en Supabase y, en paralelo, se avisa por mail (Web3Forms, plan gratis: solo envía desde el navegador). Alcanza con que una de las dos salga bien.
    const [g,m]=await Promise.allSettled([
      fetch('https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sugerencias',{method:'POST',headers:h,body:JSON.stringify(d)}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'No se pudo enviar.');return j}),
      fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({access_key:'5db1e9e5-c583-4ee4-b99f-14237e699a3d',subject:'BoxBox · '+d.tipo,from_name:'BoxBox',botcheck:'',message:d.texto,email:d.email||undefined,tipo:d.tipo})}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok||!j.success)throw new Error('mail');return j})
    ]);
    if(g.status==='rejected'&&m.status==='rejected') throw g.reason;
    $('sText').value='';$('sOk').textContent='¡Gracias! Tu sugerencia llegó y la voy a leer.';
  }catch(e){ $('sOk').textContent=(e&&e.message&&!/fetch|Failed|Network/i.test(e.message))?e.message:'No se pudo enviar. Revisa tu internet e inténtalo de nuevo.' }
  btn.disabled=false};
// Estadísticas del jugador
function loadStats(){try{return JSON.parse(localStorage.getItem('boxbox_stats'))||{races:0,wins:0,podiums:0,best:null}}catch(e){return {races:0,wins:0,podiums:0,best:null}}}
function saveStats(pos,dnf){const s=loadStats();s.races++;if(!dnf){if(pos===1)s.wins++;if(pos<=3)s.podiums++;s.best=s.best?Math.min(s.best,pos):pos}try{localStorage.setItem('boxbox_stats',JSON.stringify(s))}catch(e){}}
function loadHist(){try{return JSON.parse(localStorage.getItem('boxbox_historial'))||[]}catch(e){return []}}
function resetChamp(archive){
  const rows=Object.entries(loadChamp()).sort((a,b)=>b[1].pts-a[1].pts);
  if(!rows.length){alert('Tu campeonato ya está en 0.');return}
  if(!confirm(archive?'¿Arrancar un nuevo campeonato? El actual se guarda en "campeonatos anteriores".':'¿Resetear el campeonato? Se borran los puntos de todos los pilotos.'))return;
  if(archive){const h=loadHist();h.unshift({fecha:new Date().toLocaleDateString('es'),carreras:Math.max(...rows.map(r=>r[1].races)),podio:rows.slice(0,3).map(([n,r])=>`${n} (${r.pts})`)});try{localStorage.setItem('boxbox_historial',JSON.stringify(h))}catch(e){}}
  try{localStorage.removeItem(KEY);localStorage.removeItem('boxbox_stats')}catch(e){}
  LAST={};
  if($('s-profile').classList.contains('on'))showProfile(); if($('s-champpage').classList.contains('on'))showChampPage();
}
$('pReset').onclick=()=>resetChamp(false); $('pNew').onclick=()=>resetChamp(true);
const champRaces=()=>Object.values(loadChamp()).reduce((t,r)=>t+r.races,0);
function champRows(hl){const rows=Object.entries(loadChamp()).sort((a,b)=>b[1].pts-a[1].pts);
  return rows.length?rows.map(([n,r],i)=>`<tr class="${n===hl?'hl':''}"><td class="n">${i+1}</td><td><b>${n}</b></td><td>${r.races}</td><td>${r.wins}</td><td style="color:var(--muted)">${LAST[n]||''}</td><td class="pts">${r.pts}</td></tr>`).join('')
  :'<tr><td colspan="6" class="empty">Todavía sin puntos. ¡Corre tu primera carrera!</td></tr>'}
function showChampPage(){$('st0').style.display='none';$('cpBody').innerHTML=champRows(picks.piloto&&picks.piloto.n);
  const n=champRaces();$('cpSub').textContent=`Carreras en este campeonato: ${n}`;go('s-champpage',0)}
function showProfile(){$('st0').style.display='none';const s=loadStats();
  $('pStats').innerHTML=`<div><b>${s.races}</b>Carreras</div><div><b>${s.wins}</b>Victorias</div><div><b>${s.podiums}</b>Podios</div><div><b>${s.best?'P'+s.best:'—'}</b>Mejor</div>`;
  const h=loadHist();$('pHist').innerHTML=h.length?h.map((x,i)=>`<div class="opt"><span><b>Campeonato ${h.length-i}</b><br><small>${x.fecha} · ${x.carreras} carreras</small></span><small style="text-align:right">${x.podio.join('<br>')}</small></div>`).join(''):'Todavía no cerraste ningún campeonato.';
  const tr=loadTrofeos();
  $('pTrof').innerHTML=tr.length?tr.map(x=>`<div class="opt"><span><b>🏆 Campeón de pilotos ${x.anio}</b><br><small>${x.fecha} · sala ${esc(x.sala)}</small></span><small style="text-align:right">${x.pts} pts · ${x.fechas||23} fechas${x.final?'':' (campeón matemático)'}</small></div>`).join(''):'Todavía no ganaste ningún trofeo. Ganá el campeonato de pilotos en una sala de carrera con amigos.';
  go('s-profile',0)}
(function(){const n=champRaces();$('hCount').textContent=n?`Carreras en tu campeonato actual: ${n}`:'Tu campeonato arranca en 0'})();
// "Otra tirada": vuelve a jugar el mismo modo sin pasar por el inicio
try{const m=sessionStorage.getItem('boxbox_auto');if(m){sessionStorage.removeItem('boxbox_auto');startGame(m)}}catch(e){}



// ---------- SALAS CON AMIGOS ----------
// El servidor (Edge Function "sala" en Supabase) guarda las salas, revela los dados de a uno
// y valida cada elección. Al cerrar el armado revela la semilla de carrera: cada navegador
// simula la misma carrera con esa semilla y los autos ya validados.
const SALA_URL='https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/sala';
const ROOM_KEY='boxbox_sala';
let ROOM=null, RS=null, OFF=0, pollT=null, tickT=null, raceShown=false;
// Aviso en vivo (Supabase Realtime, canal de difusión): cuando alguien hace algo en la sala avisa a los demás y consultan al instante.
// Si el canal no conecta, vuelve a consultar cada 3 s como antes.
let RT=null, RT_OK=false, rtT=null, pollN=0, LTAB='j', PRE=null;   // PRE: tirada siguiente que el servidor entregó junto con la elección
function rtClose(){ clearTimeout(rtT); RT_OK=false; try{ if(RT&&sb) sb.removeChannel(RT) }catch(e){} RT=null }
function rtOpen(){
  rtClose(); if(!sb||!ROOM) return;
  try{
    RT=sb.channel('sala-'+ROOM.code,{config:{broadcast:{self:false}}});
    RT.on('broadcast',{event:'ch'},()=>{ clearTimeout(rtT); rtT=setTimeout(()=>{ if(!document.hidden) poll() },Math.random()*1200) });   // repartido en 1,2 s para no juntar las consultas de todos
    RT.subscribe(s=>{ RT_OK=(s==='SUBSCRIBED'); if(RT_OK) rtPing() });
  }catch(e){ RT=null }
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&ROOM&&MODE==='room') poll() });   // al volver a la pestaña se actualiza al instante
function rtPing(){ try{ if(RT&&RT_OK) RT.send({type:'broadcast',event:'ch',payload:{}}) }catch(e){} }
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t){const e=$('toast');e.textContent=t;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',3500)}
async function api(action,extra={}){
  const body={action,...(ROOM?{code:ROOM.code,pid:ROOM.pid,secret:ROOM.secret}:{}),...extra};
  let r,j;
  try{ r=await fetch(SALA_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); j=await r.json(); }
  catch(e){ throw new Error('Sin conexión con el servidor. Revisa tu internet.'); }
  if(!r.ok) throw Object.assign(new Error(j.error||'Error del servidor'),{status:r.status});
  if(j.now) OFF=j.now-Date.now();
  if(ROOM&&(/^(start|leave|next)$/.test(action)||(action==='pick'&&j.done))) rtPing();   // avisar a la sala solo cuando algo cambia para todos (no por cada tirada o elección)
  return j;
}
const srvToLocal=t=>Date.parse(t)-OFF;
function rememberRoom(){try{localStorage.setItem(ROOM_KEY,JSON.stringify(ROOM))}catch(e){}}
function forgetRoom(){rtClose();chatClose();ROOM=null;clearInterval(pollT);clearInterval(tickT);try{localStorage.removeItem(ROOM_KEY)}catch(e){}}
function myName(){const n=$('fName').value.trim();try{localStorage.setItem('boxbox_nombre',n)}catch(e){};return n}
try{$('fName').value=localStorage.getItem('boxbox_nombre')||''}catch(e){}

async function frToken(){ try{ const {data}=await sb.auth.getSession(); return data&&data.session?data.session.access_token:undefined }catch(e){ return undefined } }
async function createRoom(){
  const name=myName(); if(!name){$('fErr').textContent='Escribe tu nombre.';return}
  $('fCreate').disabled=true; $('fErr').textContent='';
  try{ const j=await api('create',{name,modo:$('fCareer').checked?'carrera':'normal',...($('fCareer').checked&&CUSTOM_CAL?{calendario:CUSTOM_CAL}:{}),token:await frToken()}); CUSTOM_CAL=null; $('fCalTxt').textContent=calTxt(null); ROOM={code:j.room.code,pid:j.pid,secret:j.secret}; ev('sala_creada',{carrera:j.room.modo==='carrera'}); enterRoom(j); }
  catch(e){ $('fErr').textContent=e.message } finally{ $('fCreate').disabled=false }
}
async function joinRoom(){
  const name=myName(), code=$('fCode').value.trim().toUpperCase();
  if(!name){$('fErr').textContent='Escribe tu nombre.';return}
  if(!code){$('fErr').textContent='Escribe el código de la sala.';return}
  $('fJoin').disabled=true; $('fErr').textContent='';
  try{ const j=await api('join',{code,name,token:await frToken()}); ROOM={code:j.room.code,pid:j.pid,secret:j.secret}; ev('sala_unida'); enterRoom(j); }
  catch(e){ $('fErr').textContent=e.message } finally{ $('fJoin').disabled=false }
}
$('fCreate').onclick=createRoom; $('fJoin').onclick=joinRoom;
$('fCode').onkeydown=e=>{if(e.key==='Enter')joinRoom()};

function enterRoom(state){
  MODE='room'; BLIND=false; rememberRoom();
  document.querySelectorAll('.modal').forEach(m=>m.classList.remove('open'));
  history.replaceState(null,'',location.pathname+'?sala='+encodeURIComponent(ROOM.code));
  rtOpen(); chatOpen(); pollN=0;
  clearInterval(pollT); pollT=setInterval(()=>{ if(document.hidden) return; if(!RT_OK||++pollN%3===0) poll() },3000);   // sin canal en vivo: cada 3 s; con canal solo cada 9 s de respaldo (y solo con la pestaña a la vista)
  clearInterval(tickT); tickT=setInterval(paintTimer,500);
  onState(state);
}
let PICKING=false, MUT=0;        // PICKING: hay una elección en camino; MUT cambia con cada elección (para descartar respuestas viejas)
async function poll(){
  try{ const m0=MUT, s=await api('state'); if(PICKING||MUT!==m0) return; onState(s) }      // una consulta que salió antes de tu elección no puede borrarla
  catch(e){ if(e.status===403||e.status===404||e.status===410){forgetRoom();toast(e.message);location.href=location.pathname} }
}
function onState(s){
  RS=s; const st=s.room.status; chatDiff(s);
  if(st==='lobby') return renderLobby(s);
  if(st==='building') return renderRoomBuild(s);
  if(st==='racing' && s.room.modo==='carrera' && !raceShown){
    // modo carrera: si esta carrera ya se corrió (o ya se contaron los puntos) se muestra la sala con la tabla, sin repetirla
    let seen=false; try{ seen=localStorage.getItem('boxbox_raced')===ROOM.code+':'+s.room.ronda }catch(e){}
    if(seen||s.room.cerrada) return renderLobby(s);
  }
  if(st==='racing' && !raceShown){ raceShown=true; clearInterval(pollT); rtClose(); READY.then(()=>startRoomRace(s)); }
}

// --- chat de la sala ---
// Va por su propio canal en vivo (Supabase Realtime, solo difusión): no se guarda nada; al salir de la sala desaparece.
let CH=null, CH_OK=false, CH_MSGS=[], CH_UNREAD=0, CH_OPEN=false, CH_MUTE=new Map(), CH_LAST=0, CH_RATE={}, CH_KNOWN=null;
const CH_REACT=['🔥','😂','👏','😭','🏆'];
function chatOpen(){
  chatClose(); if(!sb||!ROOM) return;
  try{
    CH=sb.channel('chat-'+ROOM.code,{config:{broadcast:{self:false}}});
    CH.on('broadcast',{event:'msg'},({payload})=>chatRecv(payload));
    CH.subscribe(s=>{ CH_OK=(s==='SUBSCRIBED') });
  }catch(e){ CH=null }
  chatPaint();
}
function chatClose(){
  try{ if(CH&&sb) sb.removeChannel(CH) }catch(e){}
  CH=null; CH_OK=false; CH_MSGS=[]; CH_UNREAD=0; CH_OPEN=false; CH_KNOWN=null; CH_RATE={};
  if($('chBtn')){ $('chBtn').style.display='none'; $('chBox').style.display='none' }
}
function chatPush(m){ CH_MSGS.push(m); if(CH_MSGS.length>100) CH_MSGS.shift(); if(!CH_OPEN&&!m.sys&&!m.mine) CH_UNREAD++; chatPaint() }
function chatRecv(p){
  if(!p||typeof p.t!=='string'||!p.pid||!ROOM||p.pid===ROOM.pid||CH_MUTE.has(p.pid)) return;
  const pl=RS&&RS.players.find(x=>x.pid===p.pid); if(!pl) return;      // solo gente que está en la sala; el nombre sale de la sala, no del mensaje
  const now=Date.now(), r=(CH_RATE[p.pid]||[]).filter(x=>now-x<5000); r.push(now); CH_RATE[p.pid]=r; if(r.length>5) return;
  const t=p.t.slice(0,200).trim(); if(!t) return;
  chatPush({pid:p.pid,name:pl.name,color:pl.color,t,react:!!p.r});
}
function chatSend(t,react){
  t=String(t||'').trim().slice(0,200); if(!t||!CH) return false;
  if(!CH_OK){ toast('Conectando el chat…'); return false }
  const now=Date.now(); if(now-CH_LAST<1200){ toast('Más despacio…'); return false } CH_LAST=now;
  CH.send({type:'broadcast',event:'msg',payload:{pid:ROOM.pid,t,r:react?1:0}}).catch(()=>{});
  const me=RS&&RS.players.find(x=>x.pid===ROOM.pid);
  chatPush({pid:ROOM.pid,name:me?me.name:'Yo',color:me&&me.color,t,mine:true,react:!!react}); return true;
}
function chatDiff(s){      // avisos de quién entra o sale
  if(!CH) return; const ids=new Map(s.players.map(p=>[p.pid,p.name]));
  if(CH_KNOWN){ for(const [id,n] of ids) if(!CH_KNOWN.has(id)) chatPush({sys:1,t:n+' entró a la sala'}); for(const [id,n] of CH_KNOWN) if(!ids.has(id)) chatPush({sys:1,t:n+' salió de la sala'}) }
  CH_KNOWN=ids;
}
function chatPaint(){
  const show=!!(ROOM&&CH); $('chBtn').style.display=show?'flex':'none';
  $('chBadge').style.display=CH_UNREAD?'':'none'; $('chBadge').textContent=CH_UNREAD>9?'9+':CH_UNREAD;
  if(!show){ $('chBox').style.display='none'; return }
  $('chBox').style.display=CH_OPEN?'flex':'none'; if(!CH_OPEN) return;
  const box=$('chMsgs'), atEnd=box.scrollTop+box.clientHeight>=box.scrollHeight-40;
  box.innerHTML=CH_MSGS.length?CH_MSGS.map(m=>m.sys?`<div class="note" style="text-align:center;margin:0">${esc(m.t)}</div>`
    :m.react?`<div><b style="color:${esc(m.color||'#fff')}">${esc(m.name)}</b> <span style="font-size:26px">${esc(m.t)}</span></div>`
    :`<div><b style="color:${esc(m.color||'#fff')};${m.mine?'':'cursor:pointer'}" ${m.mine?'':`data-chmute="${esc(m.pid)}" title="Tocá para silenciar"`}>${esc(m.name)}</b> ${esc(m.t)}</div>`).join(''):'<div class="note" style="margin:0">Todavía no hay mensajes. Tocá un nombre para silenciar a alguien.</div>';
  if(atEnd) box.scrollTop=box.scrollHeight;
  const mu=$('chMuted'); mu.style.display=CH_MUTE.size?'':'none';
  mu.innerHTML=[...CH_MUTE].map(([id,n])=>`Silenciado: <b>${esc(n)}</b> <button class="link" data-chun="${esc(id)}">dejar de silenciar</button>`).join('<br>');
}
function chatToggle(open){
  CH_OPEN=open; if(open){ CH_UNREAD=0; $('chReact').innerHTML=CH_REACT.map(e=>`<button class="btn ghost" data-chr="${e}" style="padding:2px 10px;font-size:18px"><span>${e}</span></button>`).join('') }
  chatPaint(); if(open){ $('chMsgs').scrollTop=$('chMsgs').scrollHeight; if(!matchMedia('(pointer:coarse)').matches) $('chIn').focus() }
}
$('chBtn').onclick=()=>chatToggle(!CH_OPEN);
$('chClose').onclick=()=>chatToggle(false);
$('chSend').onclick=()=>{ if(chatSend($('chIn').value)) $('chIn').value='' };
$('chIn').onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); $('chSend').click() } };
$('chReact').onclick=e=>{ const b=e.target.closest('[data-chr]'); if(b) chatSend(b.dataset.chr,true) };
$('chMsgs').onclick=e=>{ const b=e.target.closest('[data-chmute]'); if(!b) return; CH_MUTE.set(b.dataset.chmute,b.textContent); CH_MSGS=CH_MSGS.filter(m=>m.pid!==b.dataset.chmute); chatPaint(); toast('Silenciaste a '+b.textContent) };
$('chMuted').onclick=e=>{ const b=e.target.closest('[data-chun]'); if(b){ CH_MUTE.delete(b.dataset.chun); chatPaint() } };

// --- sala de espera ---
function renderLobby(s){
  $('st0').style.display='none';
  if(!$('s-lobby').classList.contains('on')) go('s-lobby',0);
  $('lCode').textContent=s.room.code; $('lCode2').textContent=s.room.code; $('lCount').textContent=s.players.length;
  $('lPlayers').innerHTML=s.players.map((p,i)=>`<div class="trow ${p.pid===ROOM.pid?'me':''}"><span class="p">${i+1}</span><span class="c" style="background:${p.color}"></span><span>${esc(p.name)}</span><span class="g">${p.uid&&USER&&p.uid!==USER.id?`<button class="btn ghost" data-uid="${p.uid}" title="Ver perfil" style="padding:2px 8px;font-size:12px"><span>👤</span></button> `:''}${p.pid===s.room.host?'anfitrión':''}</span></div>`).join('');
  renderLobbyInv();
  const host=s.room.host===ROOM.pid, r=s.room, post=r.status==='racing';     // post: modo carrera, la carrera ya se corrió y se espera la siguiente fecha
  renderRoomCareer(s);
  const last=r.modo==='carrera'&&r.ronda>=r.total-1;
  $('lStart').style.display=host&&(!post||(r.cerrada&&!last))?'':'none';
  if(post){
    const nx=(typeof E!=='undefined'&&E)?E.eventosDe(r.calendario)[r.ronda+1]:null;
    $('lStart').querySelector('span').textContent=nx?`Siguiente: ${nx.k==='sprint'?'sprint':'GP'} de ${nx.gp} →`:'Siguiente';
    $('lWait').textContent=!r.cerrada?'Contando los puntos de la carrera…':last?'🏆 ¡Temporada terminada! Esta es la tabla final.':host?'':'Esperando a que el anfitrión pase a la siguiente fecha…';
  } else {
    $('lStart').querySelector('span').textContent='Largar: a armar los autos →';
    $('lWait').textContent=host?(s.players.length<2?'Puedes largar solo o esperar a tus amigos.':''):'Esperando a que el anfitrión largue…';
  }
}
// Modo carrera: fecha actual y tabla de puntos de la sala
// Trofeos: se guardan en este navegador (los del campeonato de pilotos de las salas de carrera)
function loadTrofeos(){ try{ return JSON.parse(localStorage.getItem('boxbox_trofeos'))||[] }catch(e){ return [] } }
function celebrarCampeon(s){
  const c=s.room.campeon; if(!c) return;
  const mine=c.pid===ROOM.pid, key=ROOM.code+':'+c.pid+':'+(c.final?'f':'m');
  let seen=''; try{ seen=localStorage.getItem('boxbox_trofeo_visto')||'' }catch(e){}
  if(seen===key) return;
  try{ localStorage.setItem('boxbox_trofeo_visto',key) }catch(e){}
  chatPush({sys:1,t:`🏆 ${c.name} es campeón de pilotos 2026`});
  if(mine){ const t=loadTrofeos().filter(x=>x.sala!==ROOM.code); t.unshift({anio:2026,sala:ROOM.code,pts:c.pts,fecha:new Date().toLocaleDateString(LOCALES[LANG]||'es'),final:c.final,fechas:s.room.fechas||23});
    try{ localStorage.setItem('boxbox_trofeos',JSON.stringify(t.slice(0,50))) }catch(e){} if(USER) syncUp() }
  $('trEmoji').textContent=mine?'🏆':'🥇';
  $('trTitle').textContent=mine?'¡Sos el campeón de pilotos 2026!':`🏆 ¡${c.name} es campeón de pilotos 2026!`;
  $('trTxt').textContent=(c.final?'Terminó la temporada con ':'Campeón matemático: nadie lo puede alcanzar con ')+(c.final?`${c.pts} puntos.`:`los puntos que quedan. Tiene ${c.pts} puntos.`)+` Temporada de ${s.room.fechas||23} fechas.`;
  openM('mTrophy');
}
function renderRoomCareer(s){
  clearTimeout(window.__pc); if(s.room.modo==='carrera'&&s.room.status==='racing'&&!s.room.cerrada) window.__pc=setTimeout(()=>{ if(!document.hidden) poll() },1500);   // todavía contando: volver a mirar enseguida
  const r=s.room, box=$('lCareer');
  if(r.modo!=='carrera'){ box.style.display='none'; return }
  const ev=r.evento, rows=s.players.map(p=>({p,pts:+(r.puntos||{})[p.pid]||0,u:(r.ultimo||{})[p.pid]})).sort((a,b)=>b.pts-a.pts);
  box.style.display='';
  celebrarCampeon(s);
  const camp=r.campeon;
  const banner=camp?`<div style="background:rgba(255,210,63,.14);border:1px solid var(--yellow);border-radius:10px;padding:10px 14px;margin:0 0 10px;font-weight:900">🏆 ${camp.pid===ROOM.pid?'Sos el campeón de pilotos 2026':'Campeón de pilotos 2026: '+esc(camp.name)} · ${camp.pts} puntos${camp.final?'':' (campeón matemático)'}</div>`:'';
  const tab=LTAB, T=(r.puntos&&r.puntos._t)||{p:{},c:{}};
  const tabs=`<div style="display:flex;gap:6px;margin:0 0 8px">${[['j','Jugadores'],['p','Pilotos'],['c','Constructores']].map(([k,l])=>`<button class="btn ghost" data-tab="${k}" style="padding:6px 12px;font-size:13px;${k===tab?'border-color:var(--yellow);color:var(--yellow)':''}"><span>${l}</span></button>`).join('')}</div>`;
  box.onclick=e=>{ const b=e.target.closest('[data-tab]'); if(b){ LTAB=b.dataset.tab; renderRoomCareer(RS) } else if(e.target.closest('[data-calt]')){ LCALOPEN=!LCALOPEN; renderRoomCareer(RS) } };
  const evs=E.eventosDe(r.calendario), calBox=`<div style="margin:0 0 10px"><button class="link" data-calt="1">📅 ${r.calendario?'Calendario a medida':'Calendario'}: ${r.fechas||23} fechas ${LCALOPEN?'▲':'▼'}</button>${LCALOPEN?`<div class="note" style="margin:6px 0 0">${evs.map((e,k)=>`${k+1}. ${e.k==='sprint'?'🏃 Sprint':'GP'} de ${esc(e.gp)}${e.k==='sprint'?' · '+E.SPRINT_LAPS+' vueltas':' · '+E.lapsFor(e.t)+' vueltas'}`).join('<br>')}</div>`:''}</div>`;
  if(tab!=='j'){
    box.innerHTML=`<h3>🏁 Modo carrera 2026 · evento ${Math.min(r.ronda+1,r.total)} de ${r.total}</h3><div style="font-size:22px;font-weight:900;font-style:italic;margin:2px 0 10px">${ev?(ev.k==='sprint'?'Sprint':'GP')+' de '+esc(ev.gp):'Temporada terminada'}<small class="note"> ${ev?'· '+esc(ev.date):''}</small></div>${calBox}${banner}${tabs}`
      +champBlock(tab==='p'?'Campeonato de pilotos':'Campeonato de constructores',tab==='p'?'Piloto':'Constructor',tab==='p'?T.p:T.c);
    return;
  }
  box.innerHTML=`<h3>🏁 Modo carrera 2026 · evento ${Math.min(r.ronda+1,r.total)} de ${r.total}</h3>
    <div style="font-size:22px;font-weight:900;font-style:italic;margin:2px 0 10px">${ev?(ev.k==='sprint'?'Sprint':'GP')+' de '+esc(ev.gp):'Temporada terminada'}<small class="note"> ${ev?'· '+esc(ev.date):''}</small></div>${calBox}${banner}${tabs}
    <table class="cal"><thead><tr><th>#</th><th>Piloto</th><th>Última carrera</th><th style="text-align:right">Pts</th></tr></thead><tbody>${rows.map((x,i)=>`<tr class="${x.p.pid===ROOM.pid?'nx':''}"><td class="n">${i+1}</td><td><span class="c" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${x.p.color};margin-right:6px"></span>${camp&&camp.pid===x.p.pid?'🏆 ':''}${esc(x.p.name)}</td><td>${x.u?(x.u.dnf?'DNF':`P${x.u.pos} (+${x.u.pts})`):''}</td><td class="pts">${x.pts}</td></tr>`).join('')}</tbody></table>`;
}
$('lCopy').onclick=async()=>{const url=`${location.origin}${location.pathname}?sala=${ROOM.code}`;
  try{await navigator.clipboard.writeText(url);toast('Link copiado: '+url)}catch(e){prompt('Copia este link:',url)}};
$('lStart').onclick=async()=>{$('lStart').disabled=true;try{onState(await api(RS&&RS.room.status==='racing'?'next':'start'))}catch(e){toast(e.message)}finally{$('lStart').disabled=false}};
$('lLeave').onclick=async()=>{try{await api('leave')}catch(e){};forgetRoom();location.href=location.pathname};

// --- armado con el servidor ---
function renderRoomBuild(s){
  const first=!$('s-build').classList.contains('on');
  if(first){ resetBuild(2); PRE=null }                       // arranque limpio en cada fecha del modo carrera
  if(!PICKING){ picks={...s.me.picks}; rerolls=2-s.me.rerolls }
  if(first){
    $('st0').style.display=''; go('s-build',1);
    $('buildTitle').innerHTML=s.room.evento?`${s.room.evento.k==='sprint'?'Sprint':'GP'} <em>de ${esc(s.room.evento.gp)}</em>`:`Sala <em>${esc(s.room.code)}</em>`;
    $('roomBar').style.display='flex';
    if(s.me.current && !year) showRoll(s.me.current);
  }
  renderSlots(); paintTimer();
  const ready=s.players.filter(p=>p.done).length;
  $('rbReady').textContent=`${ready} de ${s.players.length} jugador${s.players.length===1?'':'es'} con el auto listo`;
  const mine=Object.keys(picks).length;
  $('rbMine').textContent=mine>=5?'✅ Tu auto está listo. Esperando a los demás…':`Tu auto: ${mine}/5`;
}
function paintTimer(){
  if(!RS||RS.room.status!=='building'||!RS.room.deadline) return;
  const ms=Math.max(0,srvToLocal(RS.room.deadline)-Date.now()), s=Math.ceil(ms/1000);
  $('rbTimer').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  $('rbTimer').style.color=s<=30?'var(--red)':'';
}
function showRoll(roll){
  year=roll.year; offer=roll.offer;
  $('die').classList.remove('spin'); void $('die').offsetWidth; $('die').classList.add('spin');
  setTimeout(()=>{$('die').textContent=FACES[Math.floor(Math.random()*6)]},600);
  $('year').innerHTML=`${year}<small>Temporada sorteada</small>`;
  $('rerolls').textContent=BLIND?'Sin re-sorteos: la mano es la misma para todos':`Re-sortear: ${rerolls} restantes`;
  $('rollBtn').querySelector('span').textContent=BLIND?'Tirar':'Re-sortear';
  $('rollBtn').disabled=rerolls<=0;
  cat=firstCat(); renderTabs(); renderList();
}
async function roomRoll(){
  const reroll=!!year; if(reroll&&rerolls<=0) return;
  if(!reroll&&PRE){ const r=PRE; PRE=null; showRoll(r); return }          // ya la tenemos (vino con la elección): sin esperar al servidor
  $('rollBtn').disabled=true;
  try{ const j=await api('roll',{reroll}); rerolls=2-j.rerolls; showRoll(j.roll); }
  catch(e){ toast(e.message); $('rollBtn').disabled=false; }
}
async function roomPick(slot,idx,it){
  if(PICKING||picks[slot]) return;                               // ya hay una elección en camino (o esa casilla ya está ocupada): un segundo toque no hace nada
  PICKING=true; MUT++;
  document.querySelectorAll('.pick').forEach(el=>el.style.pointerEvents='none');
  // Optimista: la pieza entra al auto al instante; si el servidor la rechaza, se deshace.
  const prev={picks:{...picks},year,offer,cat}, y=year;
  picks[slot]={n:it[0],y,r:it[2]}; year=null; cat=null; renderSlots();
  $('year').innerHTML='?<small>Elegiste. Tira de nuevo</small>'; $('rollBtn').querySelector('span').textContent='Tirar'; $('rollBtn').disabled=false;
  $('list').innerHTML=`<div class="empty">✅ ${esc(it[0])} (${y}) a tu auto. ${Object.keys(picks).length<5?'Tira otra vez.':'¡Auto completo! Esperando a los demás…'}</div>`;
  $('tabs').innerHTML=''; $('rbMine').textContent=Object.keys(picks).length>=5?'✅ Tu auto está listo. Esperando a los demás…':`Tu auto: ${Object.keys(picks).length}/5`;
  try{
    const s=await api('pick',{slot,idx});
    if(s.players){ picks={...s.me.picks}; PICKING=false; onState(s) }      // auto completo: estado completo de la sala
    else { picks={...s.me.picks}; PRE=s.next||null; renderSlots() }        // respuesta liviana: trae ya la tirada siguiente
  }catch(e){
    toast(e.message); PRE=null; picks=prev.picks; year=prev.year; offer=prev.offer; cat=prev.cat;
    renderSlots(); if(year){ renderTabs(); renderList() }
    PICKING=false; MUT++;
    if(e.status===409){ try{ const st=await api('state'); picks={...st.me.picks}; renderSlots(); if(Object.keys(picks).length<5){ const j=await api('roll',{reroll:false}); showRoll(j.roll) } }catch(e2){ poll() } }    // otro jugador se llevó esa pieza o tu elección anterior se estaba guardando: se muestra tu auto y tu tirada al día
  }finally{ PICKING=false; MUT++ }
}

// --- carrera sincronizada ---
// Todos los navegadores corren el mismo motor con la misma semilla y los autos que validó el servidor.
function startRoomRace(s){
  clearInterval(tickT);
  LAPS=s.room.evento&&s.room.evento.k==='sprint'?E.SPRINT_LAPS:20;   // en salas todos corren las mismas vueltas
  try{ localStorage.setItem('boxbox_raced',ROOM.code+':'+s.room.ronda) }catch(e){}
  picks={...s.players.find(p=>p.pid===ROOM.pid).picks};
  HUMANS=s.players.map(p=>E.humanFromPicks(p.pid,p.color,p.picks,`${esc(p.name)} · ${p.picks.piloto.n} '${String(p.picks.piloto.y).slice(2)}`));
  MEKEY='h:'+ROOM.pid; SEED=String(s.room.race_seed); DECISIONS={};
  RACE=newRace({}); setTrack();
  const raceAt=srvToLocal(s.room.race_start), syncAt=raceAt+2000, late=Date.now()>=raceAt;
  $('qBtn').style.display='none'; $('toRace2').style.display='none';
  go('s-quali',2);
  // El safety car se decide cuando sale en la carrera (ver askSCRoom): acá solo se larga.
  const toRace=()=>{ $('mSC').classList.remove('open'); go('s-race',3); startRace(syncAt,'room') };
  if(late){ runQualy(false); toRace(); return; }
  runQualy(true,()=>{
    $('qWait').style.display='block';
    const t=setInterval(()=>{ const left=Math.ceil((raceAt-Date.now())/1000);
      if(left<=0){clearInterval(t);toRace()} else $('qWait').textContent=`La carrera larga en ${left}s…`; },250);
  });
}

// --- volver a la sala al recargar, o entrar por link ---
(async function(){
  const q=new URLSearchParams(location.search).get('sala');
  let saved=null; try{saved=JSON.parse(localStorage.getItem(ROOM_KEY))}catch(e){}
  if(saved && (!q || q.toUpperCase()===saved.code)){
    ROOM=saved;
    try{ enterRoom(await api('state')); return }catch(e){ forgetRoom() }
  }
  if(q){ $('fCode').value=q.toUpperCase(); openM('mFriends'); $('fErr').textContent='Te invitaron a esta sala: escribe tu nombre y toca "Unirme". Si ya estabas en ella, escribe el mismo nombre para volver a tu lugar.'; }
})();

// ---------- MEDICIÓN ANÓNIMA DEL RECORRIDO (versión de prueba) ----------
// Cuenta pasos del juego (visita, empieza partida, termina carrera, comparte…) sin datos personales: solo un id al azar por navegador.
// Por ahora NO se envía nada a ningún servidor: queda en este navegador y se ve abriendo la página con ?metricas.
const MET={max:400}, SESION=Math.random().toString(36).slice(2,10);
function aid(){ try{ let a=localStorage.getItem('boxbox_aid'); if(!a){ a=Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); localStorage.setItem('boxbox_aid',a); localStorage.setItem('boxbox_aid_t',String(Date.now())) } return a }catch(e){ return 'anon' } }
function ev(nombre,datos){ try{ const q=JSON.parse(localStorage.getItem('boxbox_ev')||'[]'); q.push({t:Date.now(),e:nombre,d:datos||{},a:aid(),s:SESION}); localStorage.setItem('boxbox_ev',JSON.stringify(q.slice(-MET.max))) }catch(e){} }
(function(){
  const u=new URLSearchParams(location.search); let ref=''; try{ ref=document.referrer?new URL(document.referrer).hostname:'' }catch(e){}
  const primera=(()=>{ try{ return !localStorage.getItem('boxbox_aid') }catch(e){ return false } })();   // primera visita de este navegador
  ev('visita',{ref,utm:u.get('utm_source')||'',nueva:primera,movil:matchMedia('(pointer:coarse)').matches});
  if(u.has('metricas')){
    const p=document.createElement('div'); p.style.cssText='position:fixed;left:8px;bottom:8px;z-index:90;background:#0b0c10;color:#f2f2f5;border:1px solid #ffd23f;border-radius:10px;padding:10px 12px;font:12px/1.4 monospace;max-width:92vw;max-height:70vh;overflow:auto';
    const pinta=()=>{ let q=[]; try{ q=JSON.parse(localStorage.getItem('boxbox_ev')||'[]') }catch(e){}
      const c={}; q.forEach(x=>c[x.e]=(c[x.e]||0)+1); const ses=new Set(q.map(x=>x.s)).size;
      p.innerHTML='<b>Métricas (solo en este navegador, no se envían)</b><br>eventos: '+q.length+' · sesiones: '+ses+'<br>'+Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+': '+v).join('<br>')+'<hr style="border-color:#333">últimos:<br>'+q.slice(-8).reverse().map(x=>new Date(x.t).toLocaleTimeString()+' '+x.e+' '+JSON.stringify(x.d)).join('<br>')+'<br><button id="metBorrar" style="margin-top:6px">Borrar</button> <button id="metCerrar">Cerrar</button>';
      p.querySelector('#metBorrar').onclick=()=>{ try{ localStorage.removeItem('boxbox_ev') }catch(e){} pinta() }; p.querySelector('#metCerrar').onclick=()=>p.remove() };
    document.body.appendChild(p); pinta(); setInterval(()=>{ if(document.body.contains(p)) pinta() },2000);
  }
})();
// ---------- COMPARTIR RESULTADO ----------
// Tarjeta de texto tipo Wordle. El desafío del día comparte un link que abre ese mismo desafío.
const SITE='https://boxf1box.com';
let SHARE=null;
function buildShare(R,D){
  const avg=$('avg').textContent;
  const sq=r=>r>=95?'🟪':r>=90?'🟩':r>=80?'🟨':'⬛';
  const team=SLOTS.map(([k,l])=>{const x=picks[k];return `${sq(x.r)} ${l}: ${x.n} '${String(x.y).slice(2)} · ${x.r}`}).join('\n');
  const medal=R.pos===1?'🏆':R.pos<=3?'🍾':R.pos<=10?'✅':'😬';
  const url=MODE==='daily'||MODE==='friendly'?SITE+'/?desafio':SITE;
  const head=MODE==='career'?`🏁 BoxBox · Modo carrera 2026${RACE&&RACE.sprint?' · Sprint':''}`:MODE==='daily'?`🏁 BoxBox · Desafío del día ${today.toLocaleDateString('es')}`:MODE==='friendly'?'🏁 BoxBox · Desafío amistoso':MODE==='room'?'🏁 BoxBox · Carrera con amigos':'🏁 BoxBox';
  const line=R.dnf?`💥 Abandoné en la vuelta ${R.dnf} (largué P${R.grid})`:`${medal} P${R.pos}/22 (largué P${R.grid})`;
  const text=`${head}\n${RACE&&RACE.sprint?'Sprint':'GP'} de ${GPN()}${RACE&&RACE.rain?' 🌧️ (con lluvia)':''}\n${line}\n${team}\n📊 Media total ${avg}\n${D&&!D.error?`#${D.rank} de ${D.total} hoy${D.streak>1?` · 🔥 ${D.streak} días`:''}\n`:''}¿Me ganás? 👉 ${url}`;
  $('shWa').href='https://wa.me/?text='+encodeURIComponent(text);
  $('shX').href='https://x.com/intent/tweet?text='+encodeURIComponent(text);
  const heads={career:'Modo carrera 2026'+(RACE&&RACE.sprint?' · Sprint':''),daily:'Desafío del día',friendly:'Desafío amistoso',room:'Carrera con amigos'};
  const data={head:heads[MODE]||'Carrera',gp:GPN(),sprint:!!(RACE&&RACE.sprint),rain:!!(RACE&&RACE.rain),pos:R.pos,dnf:R.dnf,grid:R.grid,avg,
    team:SLOTS.map(([k,l])=>({l,n:picks[k].n,y:picks[k].y,r:picks[k].r})),daily:D&&!D.error?{rank:D.rank,total:D.total,streak:D.streak}:null,url};
  return {text,url,data};
}
async function copyShare(){
  try{await navigator.clipboard.writeText(SHARE.text);toast('¡Resultado copiado! Pégalo donde quieras.')}
  catch(e){prompt('Copia tu resultado:',SHARE.text)}
}
$('shCopy').onclick=()=>{ ev('compartir',{via:'copiar'}); copyShare() };
['shWa','shX'].forEach(k=>$(k).addEventListener('click',()=>ev('compartir',{via:k==='shWa'?'whatsapp':'x'})));
// Tarjeta en imagen (1080x1350) para compartir el resultado: se dibuja en el navegador, no se sube a ningún lado.
let SHIMG=null;
async function shareImageBuild(){
  const D=SHARE&&SHARE.data; if(!D) return null;
  try{ await Promise.all([document.fonts.load('900 80px "Titillium Web"'),document.fonts.load('700 30px "Titillium Web"')]) }catch(e){}
  const T=s=>(typeof LANG!=='undefined'&&LANG!=='es'&&TR)?trText(s):s, F='"Titillium Web",Arial,sans-serif';
  const W=1080,H=1350,c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  const bg=x.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#1d1f28'); bg.addColorStop(1,'#0c0d12'); x.fillStyle=bg; x.fillRect(0,0,W,H);
  const rg=x.createRadialGradient(W*.88,40,0,W*.88,40,760); rg.addColorStop(0,'rgba(255,59,48,.30)'); rg.addColorStop(1,'rgba(255,59,48,0)'); x.fillStyle=rg; x.fillRect(0,0,W,H);
  for(let i=0;i<W/60+1;i++){ x.fillStyle=i%2?'#fff':'#ff3b30'; x.fillRect(i*60,0,60,20); x.fillRect(i*60,H-20,60,20) }
  const txt=(s,px,py,o={})=>{ x.font=`${o.it?'italic ':''}${o.w||700} ${o.s||36}px ${F}`; x.fillStyle=o.c||'#f2f2f5'; x.textAlign=o.a||'left'; x.textBaseline=o.b||'alphabetic'; if(o.sp) x.letterSpacing=o.sp+'px'; else x.letterSpacing='0px'; x.fillText(s,px,py) };
  // logo
  txt('BOX',70,130,{w:900,s:92,it:1,c:'#ffd23f',sp:-3}); const bw=x.measureText('BOX').width; txt('BOX',70+bw+4,130,{w:900,s:92,it:1,c:'#ff3b30',sp:-3});
  txt(T(D.head).toUpperCase(),W-70,112,{w:700,s:30,c:'#9a9db0',a:'right',sp:3});
  // circuito
  txt((D.sprint?T('Sprint'):T('Gran Premio')).toUpperCase(),70,230,{w:700,s:30,c:'#9a9db0',sp:4});
  let gs=82; x.font=`italic 900 ${gs}px ${F}`; while(x.measureText(D.gp).width>W-140&&gs>40){ gs-=4; x.font=`italic 900 ${gs}px ${F}` }
  txt(D.gp,70,230+gs+4,{w:900,s:gs,it:1,c:'#fff'});
  if(D.rain) txt('🌧️ '+T('con lluvia'),70,230+gs+60,{w:700,s:32,c:'#4fc3f7'});
  // posición
  const py=620, big=D.dnf?'DNF':'P'+D.pos, col=D.dnf?'#ff3b30':D.pos===1?'#ffd23f':D.pos<=3?'#fff':'#f2f2f5';
  txt(big,70,py,{w:900,s:300,it:1,c:col,sp:-8}); const pw=x.measureText(big).width;
  if(!D.dnf) txt('/ 22',70+pw+24,py-6,{w:700,s:64,c:'#9a9db0'});
  txt(D.dnf?T('Abandoné'):T('Largué')+' P'+D.grid,70,py+64,{w:700,s:38,c:'#9a9db0'});
  if(!D.dnf&&D.pos===1) txt('🏆',W-170,py-70,{s:150,a:'left'});
  // auto
  let y=py+150; txt(T('MI AUTO').toUpperCase(),70,y,{w:700,s:26,c:'#9a9db0',sp:4}); y+=26;
  for(const p of D.team){ y+=58; const cc=p.r>=95?'#b26bff':p.r>=90?'#2fd27a':p.r>=80?'#ffd23f':'#6b6f80';
    x.fillStyle=cc; x.beginPath(); x.roundRect(70,y-30,30,30,6); x.fill();
    txt(T(p.l),116,y-2,{w:700,s:32,c:'#9a9db0'}); txt(p.n+" '"+String(p.y).slice(2),380,y-2,{w:700,s:32}); txt(String(p.r),W-70,y-2,{w:900,s:36,c:cc,a:'right'}) }
  y+=78; txt(T('Media total')+' '+D.avg,70,y,{w:900,s:40,c:'#ffd23f'});
  if(D.daily){ txt('#'+D.daily.rank+' '+T('de')+' '+D.daily.total+' '+T('hoy')+(D.daily.streak>1?'  ·  🔥 '+D.daily.streak+' '+T('días'):''),W-70,y,{w:700,s:34,a:'right'}) }
  // pie
  x.fillStyle='#ffd23f'; x.beginPath(); x.roundRect(70,H-176,520,78,39); x.fill(); txt('boxf1box.com',330,H-122,{w:900,s:44,c:'#1a1300',a:'center'});
  txt(T('¿Me ganás?'),620,H-122,{w:900,s:44,it:1});
  txt(T('Proyecto de fans · sin afiliación con la F1, equipos ni pilotos'),W/2,H-52,{w:700,s:22,c:'#6b6f80',a:'center'});
  return new Promise(res=>c.toBlob(b=>res(b),'image/png'));
}
async function shareImageOpen(){
  ev('compartir',{via:'imagen'});
  $('shImg').disabled=true;
  try{ const b=await shareImageBuild(); if(!b) return; SHIMG=new File([b],'boxbox-resultado.png',{type:'image/png'});
    if($('shImgPrev').src) URL.revokeObjectURL($('shImgPrev').src); $('shImgPrev').src=URL.createObjectURL(b); openM('mShareImg') }
  catch(e){ console.warn(e); toast('No se pudo armar la imagen.') } finally{ $('shImg').disabled=false }
}
$('shImg').onclick=shareImageOpen;
$('shImgDl').onclick=()=>{ if(!SHIMG) return; const a=document.createElement('a'); a.href=URL.createObjectURL(SHIMG); a.download='boxbox-resultado.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); ev('compartir',{via:'descarga'}) };
$('shImgShare').onclick=async()=>{ if(!SHIMG) return;
  if(navigator.canShare&&navigator.canShare({files:[SHIMG]})){ try{ await navigator.share({files:[SHIMG],title:'BoxBox',text:SHARE.text}); ev('compartir',{via:'imagen-nativo'}); return }catch(e){ if(e.name==='AbortError') return } }
  $('shImgDl').click() };

$('shNative').onclick=async()=>{
  ev('compartir',{via:'nativo'});
  if(navigator.share){ try{await navigator.share({title:'BoxBox',text:SHARE.text});return}catch(e){ if(e.name==='AbortError') return } }
  copyShare();
};

// ---------- DESAFÍO DEL DÍA ----------
// Una partida por día (se registra con tu cuenta de Google), la misma mano para todos y sin ver las medias.
// Después podés jugar "amistoso": la misma mano, pero no cuenta para el ranking ni la racha.
// El servidor (Edge Function "diario") reparte las tiradas, valida cada elección y calcula el resultado oficial.
const DIARIO_URL='https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/diario';
let DST=null, DAILY=null, DRES=null, DOFF=0, dTimerT=null, dRankDay='hoy', FRIENDLY={seed:null,rolls:null};
async function dApi(action,extra={}){
  const headers={'Content-Type':'application/json'};
  try{ const {data}=await sb.auth.getSession(); if(data&&data.session) headers.Authorization='Bearer '+data.session.access_token }catch(e){}
  let r,j;
  try{ r=await fetch(DIARIO_URL,{method:'POST',headers,body:JSON.stringify({action,...extra})}); j=await r.json() }
  catch(e){ throw new Error('Sin conexión con el servidor. Revisa tu internet.') }
  if(!r.ok) throw Object.assign(new Error(j.error||'Error del servidor'),{status:r.status,code:j.code});
  if(j.now) DOFF=j.now-Date.now();
  return j;
}
const fmtRace=t=>{ if(t==null) return '—'; const h=Math.floor(t/3600), m=Math.floor((t%3600)/60), s=(t%60).toFixed(1).padStart(4,'0'); return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`};
const fmtPos=r=>r.dnf?`DNF · V${r.laps}`:`P${r.pos}`;

function resetBuild(rr){
  year=null; cat=null; offer={}; picks={}; rerolls=rr; FIELD=[]; GRID=[];
  $('year').innerHTML='?<small id="yearsub">Tira para sortear una temporada</small>';
  $('list').innerHTML='<div class="empty">🏁 Tira el dado para ver la parrilla de ese año</div>';
  $('tabs').innerHTML=''; $('rerolls').textContent=''; $('rollBtn').querySelector('span').textContent='Tirar';
  $('roomBar').style.display='none'; renderSlots();
}
function startGame(mode){
  ev('inicio',{modo:mode}); MODE=mode; BLIND=(mode==='daily'||mode==='friendly'); if(BLIND) LAPS=20;
  resetBuild(BLIND?0:2);
  $('st0').style.display=''; go('s-build',1);
  $('buildTitle').innerHTML=mode==='daily'?'Desafío <em>del día</em>':mode==='friendly'?'Desafío <em>amistoso</em>':'Tira el dado. <em>Arma tu auto.</em>';
  $('buildSub').textContent=BLIND?'Sin medias a la vista y sin re-sorteos: la mano es la misma para todos. Elige con el olfato.':'Sale un año. Elige una pieza de esa temporada para una casilla libre. 5 tiradas, un auto de leyenda.';
}

// --- pantalla del desafío ---
async function showDaily(){
  MODE='solo'; BLIND=false; $('st0').style.display='none'; go('s-daily',0);
  $('dActions').innerHTML='<div class="note" style="text-align:center">Cargando…</div>';
  loadRank(dRankDay);                                         // el ranking no depende de tu estado: se pide a la vez
  try{ DST=await dApi('estado'); }catch(e){ DST=null; toast(e.message); }   // sin esperar a que cargue el motor de carrera
  renderDaily(); startDTimer();
}
function renderDaily(){
  const d=new Date(Date.now()+DOFF), st=DST;
  $('dDate').textContent='Desafío del día · '+d.toLocaleDateString(LOCALES[LANG]||'es',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Argentina/Buenos_Aires'});
  const E0=st&&st.entry, played=E0&&E0.status==='listo';
  $('dStreak').textContent=st?st.streak:0;
  $('dStreakTxt').textContent=(st&&st.streak===1)?'1 día seguido':`${st?st.streak:0} días seguidos`;
  $('dStreakSub').textContent=played?'Jugaste hoy':(st&&st.streak?'Juega hoy para mantener tu racha':'Juega hoy para empezar tu racha');
  let h='';
  if(!st) h='<div class="note" style="text-align:center">No se pudo cargar el desafío. Revisa tu conexión.</div><button class="btn cta" id="dRetry"><span>Reintentar</span></button>';
  else if(!st.logged) h='<button class="btn cta" id="dLogin"><span>Entrar con Google para jugar</span></button><button class="btn ghost cta" id="dFriend"><span>Jugar amistoso →</span></button><div class="note" style="text-align:center">Con tu cuenta se registra tu resultado, tu racha y tu lugar en el ranking.</div>';
  else if(!st.nickname) h='<div class="note" style="text-align:center">Elige tu nombre para el ranking (3 a 16 letras, números, punto, guion o _).</div><input id="dNick" maxlength="16" placeholder="Tu nombre de piloto" autocomplete="off"><button class="btn cta" id="dNickSave"><span>Guardar nombre</span></button><div class="note" id="dNickErr" style="color:var(--red);text-align:center;min-height:18px"></div>';
  else if(played) h=`<button class="btn cta" disabled><span>Ya jugaste hoy</span></button><div class="dres">Tu resultado: <b>${fmtPos(E0.result)}</b> · ${E0.result.dnf?'':fmtRace(E0.result.tiempo)+' · '}<b>#${E0.rank}</b> de ${st.total}</div><button class="btn ghost cta" id="dFriend"><span>Jugar amistoso →</span></button><div class="note" style="text-align:center">no cuenta para el ranking ni para la racha</div>`;
  else h=`<button class="btn cta" id="dPlay"><span>${E0&&E0.nPicks?'Continuar el desafío →':'Jugar el desafío →'}</span></button><div class="note" style="text-align:center">Tienes una sola partida por día.</div>`;
  $('dActions').innerHTML=h;
  const on=(id,fn)=>{const e=$(id); if(e) e.onclick=fn};
  on('dRetry',showDaily); on('dLogin',()=>signIn('?desafio')); on('dFriend',startFriendly); on('dPlay',startDaily); on('dNickSave',saveNick);
  $('dShare').style.display=played?'block':'none';
}
function startDTimer(){
  clearInterval(dTimerT);
  const tick=()=>{ if(!DST) return; const ms=Math.max(0,DST.nextAt-(Date.now()+DOFF)), s=Math.floor(ms/1000);
    $('dTimer').textContent=[Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(x=>String(x).padStart(2,'0')).join(':');
    if(ms<=0){clearInterval(dTimerT); if($('s-daily').classList.contains('on')) showDaily();} };
  tick(); dTimerT=setInterval(tick,1000);
}
async function saveNick(){
  const v=$('dNick').value.trim(); $('dNickErr').textContent=''; $('dNickSave').disabled=true;
  try{ await dApi('apodo',{nickname:v}); await showDaily(); }
  catch(e){ $('dNickErr').textContent=e.message; $('dNickSave').disabled=false; }
}
document.querySelectorAll('.dtab').forEach(b=>b.onclick=()=>{ dRankDay=b.dataset.d; document.querySelectorAll('.dtab').forEach(x=>x.classList.toggle('on',x===b)); loadRank(dRankDay); });
async function loadRank(dia){
  let cached=null; try{ cached=localStorage.getItem('boxbox_rank_'+dia) }catch(e){}
  $('dRank').innerHTML=cached||'<div class="note" style="text-align:center">Cargando…</div>'; $('dRankMe').textContent='';
  try{
    const j=await dApi('ranking',{dia}), row=r=>`<div class="rk ${r.mine?'me':''}"><span class="n">${r.rank<=3?['🥇','🥈','🥉'][r.rank-1]:'#'+r.rank}</span><span class="nm">${esc(r.nickname)}</span><span class="pt">${r.dnf?'DNF':'P'+r.pos}</span><span class="tm">${r.dnf?'V'+r.laps:fmtRace(r.tiempo)}</span></div>`;
    let h=j.list.map(row).join('');
    if(j.mine&&!j.list.some(r=>r.mine)) h+='<div class="note" style="text-align:center;margin:4px 0">· · ·</div>'+row(j.mine);
    $('dRank').innerHTML=h||`<div class="empty" style="padding:22px 10px">${dia==='hoy'?'Todavía no jugó nadie hoy. ¡Sé el primero!':'Ayer no jugó nadie.'}</div>`;
    try{ localStorage.setItem('boxbox_rank_'+dia,$('dRank').innerHTML) }catch(e){}   // lo último visto, para mostrarlo al instante la próxima vez
    $('dRankMe').textContent=j.mine?`Estás en el #${j.mine.rank} de ${j.total} ${dia==='hoy'?'hoy':'ayer'}.`:(j.total?`${j.total} jugaron ${dia==='hoy'?'hoy':'ayer'}.`:'');
  }catch(e){ $('dRank').innerHTML=`<div class="note" style="text-align:center">${esc(e.message)}</div>` }
}
$('dShare').onclick=()=>{ const e=DST&&DST.entry; if(!e||!e.result) return;
  const d=new Date(Date.now()+DOFF).toLocaleDateString('es',{day:'numeric',month:'numeric',timeZone:'America/Argentina/Buenos_Aires'});
  shareText(`🏁 BoxBox · Desafío del día ${d}\n#${e.rank} de ${DST.total} · ${fmtPos(e.result)}${e.result.dnf?'':' ('+fmtRace(e.result.tiempo)+')'}\n${DST.streak>1?'🔥 '+DST.streak+' días seguidos\n':''}¿Me ganás? 👉 ${SITE}/?desafio`); };

// --- jugar el desafío registrado ---
function startDaily(){
  const e=DST.entry; startGame('daily');
  if(e&&e.nPicks){ for(const [k,v] of Object.entries(e.picks)) picks[k]={n:v.n,y:v.y,r:0}; renderSlots(); }
}
async function dailyRoll(){
  $('rollBtn').disabled=true;
  try{ const j=await dApi('roll'); showRoll({year:j.roll.year,offer:j.roll.offer}); }
  catch(e){ toast(e.message); $('rollBtn').disabled=false; if(['jugado','login','nick'].includes(e.code)) showDaily(); }
}
async function dailyPick(slot,idx,it){
  document.querySelectorAll('.pick').forEach(el=>el.style.pointerEvents='none');
  try{
    const j=await dApi('pick',{slot,idx}), y=year; year=null; cat=null;
    if(j.done){ DAILY={raceSeed:j.raceSeed,picks:j.picks}; picks={...j.picks}; }
    else { picks={}; for(const [k,v] of Object.entries(j.picks)) picks[k]={n:v.n,y:v.y,r:0}; }
    $('year').innerHTML='?<small>Elegiste. Tira de nuevo</small>'; $('rollBtn').querySelector('span').textContent='Tirar';
    $('list').innerHTML=`<div class="empty">✅ ${esc(it[0])} (${y}) a tu auto. ${Object.keys(picks).length<5?'Tira otra vez.':'¡Auto completo!'}</div>`;
    $('tabs').innerHTML=''; renderSlots();
  }catch(e){ toast(e.message); document.querySelectorAll('.pick').forEach(el=>el.style.pointerEvents=''); }
}
function dailyToRace(){ LAPS=20; picks=DAILY.picks; DRES=null; prepareRace(DAILY.raceSeed); go('s-quali',2); }
// el servidor calcula el resultado oficial (con tu decisión del safety car) y devuelve tu puesto
async function dailyFinish(){
  try{
    const j=await dApi('cerrar',{decision:DECISIONS.me}); DRES=j;
    if(j.result.pos!==RESULT.pos||!!j.result.dnf!==!!RESULT.dnf) console.warn('El resultado del servidor difiere del local',j.result,RESULT);
  }catch(e){ DRES={error:e.message}; }
  paintDailyResult();
}
function paintDailyResult(){
  if(MODE!=='daily'||!$('s-result').classList.contains('on')) return;
  const r=DRES, box=$('dailyRes'); box.style.display='block';
  if(!r) box.innerHTML='<div class="note" style="text-align:center">Registrando tu resultado…</div>';
  else if(r.error) box.innerHTML=`<div class="note" style="text-align:center;color:var(--red)">No se pudo registrar tu resultado: ${esc(r.error)}</div><button class="btn ghost" id="dRetryFin"><span>Reintentar</span></button>`;
  else {
    box.innerHTML=`<div class="dres">Puesto <b>#${r.rank}</b> de ${r.total} hoy${r.streak?` · 🔥 <b>${r.streak}</b> ${r.streak===1?'día seguido':'días seguidos'}`:''}</div>
      <div class="row-actions" style="margin-top:8px"><button class="btn ghost" id="dSeeRank"><span>Ver el ranking</span></button></div>`;
    SHARE=buildShare(RESULT,r); $('share').innerHTML=esc(SHARE.text).replace(/\n/g,'<br>');
  }
  const a=$('dRetryFin'); if(a) a.onclick=()=>{DRES=null;paintDailyResult();dailyFinish()};
  const b=$('dSeeRank'); if(b) b.onclick=()=>{BLIND=false;showDaily()};
}

// --- amistoso: la misma mano, sin registrar nada ---
async function startFriendly(){
  await READY;
  const mano=DST&&DST.entry&&DST.entry.mano;
  FRIENDLY=mano?{rolls:mano.rolls,seed:mano.raceSeed}:{rolls:null,seed:'amistoso-'+E.dayKey(Date.now()+DOFF)};
  startGame('friendly');
}
function friendlyRoll(){
  const i=Object.keys(picks).length, r=FRIENDLY.rolls?FRIENDLY.rolls.find(x=>x.i===i):E.dailyRoll(DATA,FRIENDLY.seed,i);
  showRoll({year:r.year,offer:r.offer});
}

// ---------- SALIR DE UNA SALA DESDE EL MENÚ ----------
// Estando en una sala, el logo y el menú preguntan antes de salir. Si no, la sala
// (que sigue consultando al servidor) te devolvía a ella.
function leaveRoomAndGo(url){
  const st=RS&&RS.room.status;
  const txt=st==='lobby'?'¿Salir de la sala? Vas a dejar de estar en ella.'
    :st==='building'?'¿Salir de la sala? Tu auto lo completa el servidor y la carrera sigue sin ti.'
    :'¿Salir de la sala?';
  if(!confirm(txt)) return;
  clearInterval(pollT);
  api('leave').catch(()=>{}).finally(()=>{ setTimeout(()=>{ forgetRoom(); location.href=url },200) });   // un respiro para que salga el aviso a los demás
}
const inRoom=()=>MODE==='room'&&!!ROOM&&!(RESULT&&RS&&RS.room.status==='racing');
[['logo',''],['nDaily','?desafio'],['hDaily','?desafio'],['nChamp','?ver=campeonato'],['hChamp','?ver=campeonato'],['nProfile','?ver=perfil'],['hCareer','?ver=carrera']].forEach(([id,q])=>{
  const orig=$(id).onclick;
  $(id).onclick=e=>{ if(inRoom()) leaveRoomAndGo(location.pathname+q); else if(MODE==='room') location.href=location.pathname+q; else orig(e); };
});

// ---------- CUENTA: login con Google y campeonato guardado ----------
// Supabase Auth (Google). La clave "publishable" es pública por diseño; los datos los protege
// la tabla campeonatos con RLS (cada usuario solo lee y escribe su fila).
const SB_URL='https://vljuhibzzwtcswirunfr.supabase.co', SB_KEY='sb_publishable_-eWaOokr2vEuoRXXklXGLA_7L7u9fgz';
let sb=null, USER=null;
try{ if(window.supabase) sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,detectSessionInUrl:true,flowType:'pkce'}}); }catch(e){ console.warn(e) }
function paintUser(){
  const m=USER&&USER.user_metadata||{}, name=USER?(m.full_name||m.name||USER.email):'Invitado';
  $('pName').textContent=name;
  $('pName').nextElementSibling.textContent=USER?`Conectado con Google (${USER.email}). Tu campeonato se guarda en tu cuenta.`:'Sin sesión: tu campeonato se guarda solo en este navegador.';
  $('pLogin').lastChild.textContent=USER?'Cerrar sesión':(GOOGLE_ON?'Continuar con Google':'Continuar con Google (próximamente)');
  $('pLogin').disabled=!USER&&!GOOGLE_ON; $('pLogin').style.opacity=$('pLogin').disabled?.5:1;
  $('nProfile').textContent=USER?('Perfil · '+String(m.full_name||m.name||USER.email).split(/[ @]/)[0]):'Perfil';
}
function cloudRow(){ return {user_id:USER.id,campeonato:loadRaw(),stats:loadStats(),historial:loadHist(),trofeos:loadTrofeos(),updated_at:new Date().toISOString()} }
async function syncUp(){
  if(!sb||!USER) return;
  // Los trofeos nunca se pisan: antes de guardar se suman los que ya tiene la cuenta.
  try{ const {data}=await sb.from('campeonatos').select('trofeos').eq('user_id',USER.id).maybeSingle();
    const t=[...loadTrofeos()]; for(const x of (data&&data.trofeos)||[]) if(!t.some(y=>y.sala===x.sala)) t.push(x);
    if(t.length) localStorage.setItem('boxbox_trofeos',JSON.stringify(t.slice(0,50))) }catch(e){}
  const {error}=await sb.from('campeonatos').upsert(cloudRow());
  if(error){ console.warn(error); toast('No se pudo guardar en tu cuenta. Se guardó en este navegador.'); }
}
async function syncDown(){
  const {data,error}=await sb.from('campeonatos').select('*').eq('user_id',USER.id).maybeSingle();
  if(error){ console.warn(error); return toast('No se pudo leer tu campeonato de la cuenta.'); }
  const localHas=Object.keys(loadChamp()).length>0||loadStats().races>0;
  const cloudHas=data&&(Object.keys(data.campeonato||{}).length>0||(data.stats&&data.stats.races>0));
  if(!cloudHas){ if(localHas){ await syncUp(); toast('Listo: tu campeonato quedó guardado en tu cuenta.'); } else await syncUp(); }
  else {
    // La cuenta manda: es lo que se ve en todos tus dispositivos.
    try{ localStorage.setItem(KEY,JSON.stringify(data.campeonato||{})); localStorage.setItem('boxbox_stats',JSON.stringify(data.stats||{races:0,wins:0,podiums:0,best:null})); localStorage.setItem('boxbox_historial',JSON.stringify(data.historial||[])); }catch(e){}
    let faltan=false;
    try{ const t=[...(data.trofeos||[])]; for(const x of loadTrofeos()) if(!t.some(y=>y.sala===x.sala)){ t.push(x); faltan=true } localStorage.setItem('boxbox_trofeos',JSON.stringify(t.slice(0,50))) }catch(e){}
    if(faltan) await syncUp();   // trofeos que este navegador tenía y la cuenta no: subirlos para que los vean tus amigos
    toast('Campeonato cargado desde tu cuenta.');
  }
  if($('s-profile').classList.contains('on')) showProfile();
  if($('s-champpage').classList.contains('on')) showChampPage();
}
async function signIn(q){
  if(!sb) return toast('No se pudo cargar el login. Revisa tu conexión y recarga.');
  const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname+(typeof q==='string'?q:'?ver=perfil')}});
  if(error) toast('No se pudo iniciar sesión: '+error.message);
}
async function signOut(){
  await sb.auth.signOut(); USER=null; paintUser();
  toast('Sesión cerrada. Tu campeonato sigue guardado en tu cuenta.');
}
$('pLogin').onclick=()=>USER?signOut():signIn();
// Si Google todavía no está activado en Supabase, el botón avisa en vez de dar error.
let GOOGLE_ON=false;
fetch(SB_URL+'/auth/v1/settings',{headers:{apikey:SB_KEY}}).then(r=>r.json()).then(j=>{
  GOOGLE_ON=!!(j.external&&j.external.google);
  paintUser();
}).catch(()=>{});
// Cada vez que cambia el campeonato, se guarda también en la cuenta.
{ const _s=saveStats; saveStats=function(...a){ _s(...a); syncUp(); };
  const _r=resetChamp; resetChamp=function(...a){ _r(...a); syncUp(); }; }

// ---------- AMIGOS ----------
// Hace falta iniciar sesión con Google y tener apodo. Los pedidos y la lista viven en el servidor (función "amigos");
// quién está conectado y las invitaciones viajan por Supabase Realtime (un canal por persona: "p-<id>").
const FR_URL='https://vljuhibzzwtcswirunfr.supabase.co/functions/v1/amigos';
let FR=null, FR_ON={}, FR_CH={}, FR_ME=null, FR_EDIT=false;
async function frApi(action,extra={}){
  const headers={'Content-Type':'application/json'};
  try{ const {data}=await sb.auth.getSession(); if(data&&data.session) headers.Authorization='Bearer '+data.session.access_token }catch(e){}
  let r,j;
  try{ r=await fetch(FR_URL,{method:'POST',headers,body:JSON.stringify({action,...extra})}); j=await r.json() }
  catch(e){ throw new Error('Sin conexión con el servidor. Revisa tu internet.') }
  if(!r.ok) throw Object.assign(new Error(j.error||'Error del servidor'),{status:r.status,code:j.code});
  return j;
}
function frClose(){ try{ Object.values(FR_CH).forEach(c=>sb.removeChannel(c)); if(FR_ME) sb.removeChannel(FR_ME) }catch(e){} FR_CH={}; FR_ME=null; FR_ON={} }
// Conexión: yo aparezco "en línea" en mi canal y miro el canal de cada amigo
function frPresence(){
  if(!sb||!USER||!FR||!FR.nick) return;
  const ids=new Set(FR.amigos.map(a=>a.uid));
  if(!FR_ME){
    FR_ME=sb.channel('p-'+USER.id,{config:{presence:{key:USER.id}}});
    FR_ME.on('broadcast',{event:'invite'},({payload})=>frInvitacion(payload));
    FR_ME.subscribe(st=>{ if(st==='SUBSCRIBED') FR_ME.track({nick:FR.nick}) });
  }
  for(const [uid,ch] of Object.entries(FR_CH)) if(!ids.has(uid)){ try{ sb.removeChannel(ch) }catch(e){} delete FR_CH[uid]; delete FR_ON[uid] }
  for(const uid of ids) if(!FR_CH[uid]){
    // Un canal que solo mira no recibe la presencia: tiene que anunciarse también (con otra clave: "o-<yo>"). El amigo está en línea si en su canal figura su propia clave.
    const ch=sb.channel('p-'+uid,{config:{presence:{key:'o-'+USER.id}}});
    ch.on('presence',{event:'sync'},()=>{ const on=!!ch.presenceState()[uid]; if(FR_ON[uid]!==on){ FR_ON[uid]=on; if($('s-friends').classList.contains('on')) renderFriends(); if($('s-lobby').classList.contains('on')) renderLobbyInv(); if($('mFriend').classList.contains('open')&&FRP&&FRP.uid===uid) paintFriend() } });
    ch.subscribe(st=>{ if(st==='SUBSCRIBED') ch.track({o:1}) }); FR_CH[uid]=ch;
  }
}
async function frLoad(){
  if(!sb||!USER){ FR=null; frClose(); renderFrBadge(); return }
  try{ FR=await frApi('yo') }catch(e){ FR=null; if(e.code!=='login') console.warn(e) }
  frPresence(); renderFrBadge(); if($('s-friends').classList.contains('on')) renderFriends();
}
function renderFrBadge(){ const n=FR?FR.recibidas.length:0; $('nFriends').textContent=n?`👥 Amigos (${n})`:'👥 Amigos' }
async function showFriends(){
  $('st0').style.display='none'; go('s-friends',0);
  if(USER&&!FR) await frLoad();
  renderFriends();
}
function frDot(uid){ return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;background:${FR_ON[uid]?'var(--green)':'#555a66'}" title="${FR_ON[uid]?'En línea':'Desconectado'}"></span>` }
function renderFriends(){
  const box=$('frBody'); $('frSub').textContent='Agregá amigos para invitarlos rápido a tu sala y ver su perfil.';
  if(!USER){ box.innerHTML=`<div class="note">Iniciá sesión con Google para usar amigos.</div><div class="cta-row" style="margin-top:12px"><button class="btn" id="frLogin"><span>Continuar con Google</span></button></div>`;
    $('frLogin').onclick=()=>signIn('?ver=amigos'); return }
  if(!FR){ box.innerHTML='<div class="note">Cargando…</div>'; return }
  if(!FR.nick||FR_EDIT){ box.innerHTML=`<div class="note">${FR.nick?'Cambiá tu apodo (es como te ven tus amigos y el ranking del desafío del día):':'Elegí tu apodo (es como te ven tus amigos y el ranking del desafío del día):'}</div>
    <input id="frNick" maxlength="16" placeholder="Tu apodo" value="${esc(FR.nick||'')}" style="margin:10px 0" autocomplete="off"><div class="note" id="frErr" style="color:var(--red);min-height:18px"></div>
    <div class="cta-row"><button class="btn" id="frNickGo"><span>Guardar</span></button>${FR.nick?'<button class="btn ghost" id="frNickNo"><span>Cancelar</span></button>':''}</div>`;
    $('frNickGo').onclick=async()=>{ try{ FR=await frApi('nick',{nickname:$('frNick').value}); FR_EDIT=false; frPresence(); renderFriends(); toast('Apodo guardado') }catch(e){ $('frErr').textContent=e.message } };
    if($('frNickNo')) $('frNickNo').onclick=()=>{ FR_EDIT=false; renderFriends() }; return }
  const inRoomNow=!!(ROOM&&RS&&RS.room&&RS.room.status==='lobby');
  const sec=(t,h)=>h?`<h3 style="margin:16px 0 6px">${t}</h3>${h}`:'';
  const row=(a,btns)=>`<div class="opt" style="align-items:center"><span>${frDot(a.uid)}<b>${esc(a.nick)}</b>${FR_ON[a.uid]?' <small style="color:var(--green)">En línea</small>':''}</span><span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${btns}</span></div>`;
  const btn=(k,uid,l,ex='')=>`<button class="btn ghost" data-fr="${k}" data-uid="${uid}" style="padding:6px 12px;font-size:13px" ${ex}><span>${l}</span></button>`;
  box.innerHTML=`<div class="note" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">Tu apodo: <b>${esc(FR.nick)}</b>${btn('apodo','','Cambiar apodo')}</div>`
    +sec('Pedidos recibidos',FR.recibidas.map(a=>row(a,btn('si',a.uid,'Aceptar')+btn('no',a.uid,'Rechazar'))).join(''))
    +`<h3 style="margin:16px 0 6px">Mis amigos</h3>`+(FR.amigos.length?FR.amigos.map(a=>row(a,btn('perfil',a.uid,'Ver perfil')+btn('inv',a.uid,'Invitar a la sala',FR_ON[a.uid]&&inRoomNow?'':'disabled'))).join(''):'<div class="note">Todavía no tenés amigos. Agregalos desde una sala o por apodo.</div>')
    +sec('Pedidos enviados',FR.enviadas.map(a=>row(a,btn('quitar',a.uid,'Cancelar'))).join(''))
    +`<h3 style="margin:16px 0 6px">Agregar por apodo</h3><div style="display:flex;gap:8px"><input id="frAdd" maxlength="16" placeholder="Apodo de tu amigo" style="flex:1"><button class="btn" id="frAddGo"><span>Enviar pedido</span></button></div><div class="note" id="frErr" style="color:var(--red);min-height:18px"></div>`
    +(inRoomNow?'':'<div class="note">Para invitar a un amigo, primero creá o entrá a una sala y esperá en la sala de espera.</div>');
  $('frAddGo').onclick=()=>frAccion('solicitar',{nick:$('frAdd').value},'frErr');
}
async function frAccion(action,extra,errId){
  try{ FR=await frApi(action,extra); frPresence(); renderFrBadge(); renderFriends(); if($('mFriend').classList.contains('open')) await showFriendProfile(FRP.uid); if(action==='solicitar'){ ev('amigo_pedido'); toast('Pedido enviado') } }
  catch(e){ if(errId&&$(errId)) $(errId).textContent=e.message; else toast(e.message); if(e.code==='nick'&&!FR) showFriends() }
}
$('frBody').onclick=e=>{ const b=e.target.closest('[data-fr]'); if(!b||b.disabled) return; const uid=b.dataset.uid, k=b.dataset.fr;
  if(k==='apodo'){ FR_EDIT=true; renderFriends(); return }
  if(k==='si') frAccion('responder',{uid,aceptar:true}); else if(k==='no') frAccion('responder',{uid,aceptar:false});
  else if(k==='quitar') frAccion('quitar',{uid}); else if(k==='perfil') showFriendProfile(uid); else if(k==='inv') frInvitar(uid) };
// Perfil de otra persona (amigo: completo; si no, solo el apodo y el botón de agregar)
let FRP=null;
async function showFriendProfile(uid){
  if(!USER){ toast('Iniciá sesión con Google para usar amigos.'); return }
  if(!FR) await frLoad();
  if(!FR||!FR.nick){ showFriends(); toast('Primero elegí tu apodo.'); return }
  $('mfBody').innerHTML='<div class="note">Cargando…</div>'; openM('mFriend');
  try{ FRP=await frApi('perfil',{uid}); paintFriend() }catch(e){ $('mfBody').innerHTML=`<div class="note">${esc(e.message)}</div>` }
}
function paintFriend(){
  const p=FRP; if(!p) return;
  const st=p.stats, inRoomNow=!!(ROOM&&RS&&RS.room&&RS.room.status==='lobby');
  let h=`<h2 style="margin:0 0 4px">${esc(p.nick)}</h2><div class="note" style="margin:0 0 10px">${FR_ON[p.uid]?'<span style="color:var(--green)">● En línea</span>':'Desconectado'}</div>`;
  if(p.relacion==='amigo'){
    h+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">${[['Carreras',st.races],['Victorias',st.wins],['Podios',st.podiums],['Mejor',st.best?'P'+st.best:'—']].map(([l,v])=>`<div><b style="display:block;font-size:24px">${v}</b><small>${l}</small></div>`).join('')}</div>`
      +`<h3 style="margin:14px 0 6px">Trofeos</h3>`+(p.trofeos.length?p.trofeos.map(x=>`<div class="opt"><span><b>🏆 Campeón de pilotos ${x.anio}</b><br><small>${esc(x.fecha)} · sala ${esc(x.sala)}</small></span><small style="text-align:right">${x.pts} pts · ${x.fechas||23} fechas${x.final?'':' (campeón matemático)'}</small></div>`).join(''):'<div class="note">Este jugador no tiene trofeos todavía.</div>')
      +`<div class="cta-row" style="margin-top:14px">${FR_ON[p.uid]&&inRoomNow?`<button class="btn" data-mf="inv"><span>Invitar a mi sala</span></button>`:''}<button class="btn ghost" data-mf="quitar"><span>Quitar amigo</span></button></div>`;
  } else if(p.relacion==='ninguna') h+=`<div class="note">Hacete amigo de ${esc(p.nick)} para ver su perfil y poder invitarlo a tu sala.</div><div class="cta-row" style="margin-top:12px"><button class="btn" data-mf="add"><span>Agregar como amigo</span></button></div>`;
  else if(p.relacion==='enviada') h+=`<div class="note">Pedido enviado. Cuando lo acepte vas a ver su perfil.</div><div class="cta-row" style="margin-top:12px"><button class="btn ghost" data-mf="quitar"><span>Cancelar</span></button></div>`;
  else if(p.relacion==='recibida') h+=`<div class="note">${esc(p.nick)} quiere ser tu amigo.</div><div class="cta-row" style="margin-top:12px"><button class="btn" data-mf="si"><span>Aceptar</span></button><button class="btn ghost" data-mf="no"><span>Rechazar</span></button></div>`;
  $('mfBody').innerHTML=h;
}
$('mfBody').onclick=e=>{ const b=e.target.closest('[data-mf]'); if(!b||!FRP) return; const k=b.dataset.mf, uid=FRP.uid;
  if(k==='add') frAccion('solicitar',{uid}); else if(k==='quitar') frAccion('quitar',{uid}); else if(k==='si') frAccion('responder',{uid,aceptar:true});
  else if(k==='no') frAccion('responder',{uid,aceptar:false}); else if(k==='inv') frInvitar(uid) };
// Invitaciones a una sala: aviso por el canal del amigo; solo se muestran si vienen de un amigo
// Botón de la sala: lista de amigos en línea (que todavía no están en la sala) con un toque para invitarlos
let LINV_OPEN=false;
function renderLobbyInv(){
  const btn=$('lInvBtn'), box=$('lInv'); if(!btn||!box) return;
  if(USER&&!FR&&sb) frLoad().then(()=>{ if($('s-lobby').classList.contains('on')) renderLobbyInv() });
  const inRoom=new Set(((RS&&RS.players)||[]).map(p=>p.uid).filter(Boolean));
  const on=FR&&FR.nick?FR.amigos.filter(a=>FR_ON[a.uid]&&!inRoom.has(a.uid)):[];
  btn.querySelector('span').textContent='👥 Invitar amigos en línea'+(on.length?` (${on.length})`:'');
  if(!LINV_OPEN){ box.style.display='none'; return }
  box.style.display='';
  if(!USER) box.innerHTML='<div class="note">Iniciá sesión con Google para invitar a tus amigos.</div>';
  else if(!FR) box.innerHTML='<div class="note">Cargando…</div>';
  else if(!FR.nick) box.innerHTML='<div class="note">Elegí tu apodo en la pantalla Amigos para poder invitar.</div>';
  else if(!FR.amigos.length) box.innerHTML='<div class="note">Todavía no tenés amigos agregados. Agregalos desde la pantalla Amigos.</div>';
  else if(!on.length) box.innerHTML='<div class="note">No hay amigos en línea ahora (o ya están en la sala).</div>';
  else box.innerHTML=on.map(a=>`<div class="opt" style="align-items:center"><span>${frDot(a.uid)}<b>${esc(a.nick)}</b></span><button class="btn" data-linv="${a.uid}" style="padding:6px 12px;font-size:13px"><span>Invitar</span></button></div>`).join('');
}
$('lInvBtn').onclick=()=>{ LINV_OPEN=!LINV_OPEN; renderLobbyInv() };
$('lInv').onclick=e=>{ const b=e.target.closest('[data-linv]'); if(!b) return; frInvitar(b.dataset.linv); b.disabled=true; b.querySelector('span').textContent='Invitado ✓' };
function frInvitar(uid){
  if(!(ROOM&&RS&&RS.room&&RS.room.status==='lobby')){ toast('Armá o entrá a una sala para invitar.'); return }
  const ch=FR_CH[uid]; const a=FR&&FR.amigos.find(x=>x.uid===uid); if(!ch||!a) return;
  ch.send({type:'broadcast',event:'invite',payload:{from:USER.id,nick:FR.nick,code:ROOM.code}}).then(()=>toast('Invitación enviada a '+a.nick)).catch(()=>toast('No se pudo enviar la invitación.'));
}
function frInvitacion(p){
  if(!p||!FR||!FR.amigos.some(a=>a.uid===p.from)||!/^[A-Z0-9-]{4,24}$/.test(String(p.code||''))) return;
  clearTimeout(frInvitacion.t);
  $('invBar').innerHTML=`<span><b>${esc(p.nick)}</b> te invita a su sala <b>${esc(p.code)}</b></span><span style="display:flex;gap:6px"><button class="btn" id="invYes" style="padding:6px 14px"><span>Unirme</span></button><button class="btn ghost" id="invNo" style="padding:6px 14px"><span>Ignorar</span></button></span>`;
  $('invBar').style.display='flex';
  $('invNo').onclick=()=>{ $('invBar').style.display='none' };
  $('invYes').onclick=()=>{ $('invBar').style.display='none';
    if(ROOM){ location.href=location.pathname+'?sala='+encodeURIComponent(p.code); return }
    $('fCode').value=p.code; if(!$('fName').value) $('fName').value=FR.nick; joinRoom() };
  frInvitacion.t=setTimeout(()=>{ $('invBar').style.display='none' },45000);
}
// Botón "perfil" de cada jugador de la sala de espera
$('lPlayers').onclick=e=>{ const b=e.target.closest('[data-uid]'); if(b) showFriendProfile(b.dataset.uid) };
$('nFriends').onclick=()=>showFriends();
if(sb){
  sb.auth.onAuthStateChange((ev,session)=>{
    const u=session&&session.user||null, changed=(u&&u.id)!==(USER&&USER.id);
    USER=u; paintUser();
    if(changed) setTimeout(frLoad,0);
    if(u&&changed) setTimeout(syncDown,0);
    if(changed&&$('s-daily').classList.contains('on')) setTimeout(showDaily,0);
  });
}

// ---------- ARRANQUE ----------
{ const g=$('guia'); try{ if(localStorage.getItem('boxbox_guia')!=='1') g.open=true }catch(e){ g.open=true }
  g.addEventListener('toggle',()=>{ if(!g.open) try{localStorage.setItem('boxbox_guia','1')}catch(e){} }); }
// boxf1box.com/?desafio abre el desafío del día; ?ver=campeonato y ?ver=perfil abren esas pantallas.
{ const q=new URLSearchParams(location.search), v=q.get('ver');
  if(MODE!=='room'){ if(q.has('desafio')) showDaily(); else if(v==='campeonato') showChampPage(); else if(v==='perfil') showProfile(); else if(v==='carrera') showCareer(); else if(v==='amigos') showFriends(); } }
