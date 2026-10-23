(() => {
  const DATA_URL = 'https://raw.githubusercontent.com/open-admin-data/venezuela-administrative-divisions/master/data/hierarchy.json';
  const CACHE_KEY = 'directo_ve_location_hierarchy_v1';
  let hierarchyPromise;

  const style = document.createElement('style');
  style.textContent = `
    .location-section { width:min(520px,100%); margin:14px auto 18px; }
    .location-intro { margin:0 0 10px 5px; color:var(--text-2,#718096); font-size:12px; line-height:1.4; }
    .location-form { display:grid!important; grid-template-columns:1fr!important; gap:8px!important; width:100%; }
    .location-field { position:relative; min-width:0; display:grid; gap:4px; padding:9px 13px 8px; border:1px solid var(--group-line,rgba(0,0,0,.12)); border-radius:13px; background:var(--field-bg,#fff); box-shadow:0 1px 2px rgba(20,30,50,.04); transition:.15s ease; }
    .location-field:focus-within { border-color:color-mix(in srgb,var(--accent,#1f7aec) 52%,transparent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#1f7aec) 10%,transparent); }
    .location-field.is-disabled { opacity:.55; }
    .location-field>span { color:var(--text-2,#718096); font-size:10.5px; line-height:1.1; font-weight:700; }
    .location-field select { width:100%; min-width:0; min-height:23px; padding:0 28px 0 0; border:0; outline:0; appearance:none; -webkit-appearance:none; color:var(--text,#172033); background:transparent; font:inherit; font-size:15.5px; line-height:23px; cursor:pointer; }
    .location-field::after { content:''; position:absolute; right:14px; bottom:15px; width:7px; height:7px; border-right:1.8px solid var(--text-2,#718096); border-bottom:1.8px solid var(--text-2,#718096); transform:rotate(45deg); pointer-events:none; }
    .location-save { width:100%; min-height:44px; margin-top:1px; border:0; border-radius:13px; color:#fff; background:var(--accent-solid,var(--brand,#2747d6)); box-shadow:0 5px 14px color-mix(in srgb,var(--accent-solid,#2747d6) 22%,transparent); font-size:14px; font-weight:700; cursor:pointer; }
    .location-save:disabled { opacity:.42; cursor:default; box-shadow:none; }
    .location-chosen { width:100%; min-height:44px; margin:0!important; padding:10px 12px; border:1px solid var(--group-line,rgba(0,0,0,.12)); border-radius:13px; background:var(--field-bg,#fff); color:var(--text,#172033)!important; font-size:13px!important; }
    .location-chosen .location-change { margin-left:auto; padding:2px 0; border:0; background:transparent; color:var(--accent,#1f7aec); font-size:12px; font-weight:700; cursor:pointer; }
    @media (min-width:681px) { .location-form { grid-template-columns:repeat(2,minmax(0,1fr))!important; } .location-field:first-child,.location-save { grid-column:1/-1; } }
    @media (prefers-color-scheme:dark) { .privacy-notice { background:#302914!important; border:1px solid rgba(245,196,81,.22)!important; color:#f6df9b!important; box-shadow:0 1px 2px rgba(0,0,0,.22); } .privacy-notice svg { color:#f3c64e!important; opacity:1!important; } }
    @media (prefers-color-scheme:light) { .privacy-notice { background:#fff5d8!important; border:1px solid rgba(184,133,0,.16)!important; color:#5d4908!important; } .privacy-notice svg { color:#9b7300!important; } }
  `;
  document.head.appendChild(style);

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function normalize(data) {
    return (data?.data || []).map(s => ({
      name: String(s?.name?.local || '').trim(),
      municipalities: (s?.municipality || []).map(m => ({
        id:m.id,
        name:String(m?.name?.local || '').replace(/^Autónomo\s+/i,'').trim(),
        parishes:(m?.parish || []).map(p => ({id:p.id,name:String(p?.name?.local || '').trim()})).filter(p=>p.name)
      })).filter(m=>m.name)
    })).filter(s=>s.name && s.municipalities.length);
  }

  async function loadHierarchy() {
    if (hierarchyPromise) return hierarchyPromise;
    hierarchyPromise = (async () => {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) { const parsed=normalize(JSON.parse(cached)); if(parsed.length>=20) return parsed; }
      } catch {}
      const r=await fetch(DATA_URL,{cache:'force-cache'});
      if(!r.ok) throw new Error('No se pudo cargar la división territorial.');
      const data=await r.json(); const parsed=normalize(data);
      if(parsed.length<20) throw new Error('Datos territoriales incompletos.');
      try { sessionStorage.setItem(CACHE_KEY,JSON.stringify(data)); } catch {}
      return parsed;
    })().catch(e => { hierarchyPromise=null; throw e; });
    return hierarchyPromise;
  }

  function options(select, placeholder, items, selected='') {
    select.innerHTML=`<option value="">${esc(placeholder)}</option>${items.map(x=>`<option value="${esc(x.id||x.name)}">${esc(x.name)}</option>`).join('')}`;
    if(selected) select.value=selected;
  }

  function initialChoice(hierarchy) {
    if(typeof chosenLocation==='undefined' || !chosenLocation?.state) return null;
    const state=hierarchy.find(s=>s.name===chosenLocation.state); if(!state) return null;
    const parts=String(chosenLocation.localityText||'').split(/\s*[·|/]\s*/).map(x=>x.trim()).filter(Boolean);
    const municipality=state.municipalities.find(m=>m.name===chosenLocation.municipality||m.name===parts[0]);
    const parish=municipality?.parishes.find(p=>p.name===chosenLocation.parish||p.name===parts[1]);
    return {state,municipality,parish};
  }

  async function mount() {
    const form=document.getElementById('location-form'); const section=document.getElementById('location-section');
    if(!form||!section||form.dataset.cascadeReady) return;
    form.dataset.cascadeReady='loading';
    let hierarchy;
    try { hierarchy=await loadHierarchy(); } catch(e) { console.warn('Selector territorial:',e); form.dataset.cascadeReady=''; return; }

    form.innerHTML=`
      <label class="location-field"><span>Estado</span><select id="location-state-cascade"><option value="">Selecciona tu estado</option></select></label>
      <label class="location-field is-disabled"><span>Municipio</span><select id="location-municipality" disabled><option value="">Selecciona tu municipio</option></select></label>
      <label class="location-field is-disabled"><span>Parroquia</span><select id="location-parish" disabled><option value="">Selecciona tu parroquia</option></select></label>
      <button type="submit" class="location-save" disabled>Listo</button>`;

    const intro=document.createElement('p'); intro.className='location-intro'; intro.textContent='Selecciona tu estado y luego tu municipio y parroquia.';
    section.querySelector('.quick-label')?.insertAdjacentElement('afterend',intro);

    const state=document.getElementById('location-state-cascade'); const municipality=document.getElementById('location-municipality'); const parish=document.getElementById('location-parish'); const save=form.querySelector('.location-save');
    const municipalityField=municipality.closest('.location-field'); const parishField=parish.closest('.location-field');
    options(state,'Selecciona tu estado',hierarchy.map(s=>({id:s.name,name:s.name})));

    const initial=initialChoice(hierarchy);
    if(initial?.state) state.value=initial.state.name;

    function refreshMunicipalities(selected='') {
      const s=hierarchy.find(x=>x.name===state.value); options(municipality,'Selecciona tu municipio',s?.municipalities||[],selected);
      municipality.disabled=!s; municipalityField.classList.toggle('is-disabled',!s); refreshParishes('');
    }
    function refreshParishes(selected='') {
      const s=hierarchy.find(x=>x.name===state.value); const m=s?.municipalities.find(x=>x.id===municipality.value);
      options(parish,'Selecciona tu parroquia',m?.parishes||[],selected); parish.disabled=!m; parishField.classList.toggle('is-disabled',!m); save.disabled=!m||!parish.value;
    }
    state.addEventListener('change',()=>refreshMunicipalities()); municipality.addEventListener('change',()=>refreshParishes()); parish.addEventListener('change',()=>{save.disabled=!parish.value;});
    if(initial?.state){ refreshMunicipalities(initial.municipality?.id||''); if(initial.municipality) refreshParishes(initial.parish?.id||''); }

    form.addEventListener('submit',async e=>{
      e.preventDefault(); const s=hierarchy.find(x=>x.name===state.value); const m=s?.municipalities.find(x=>x.id===municipality.value); const p=m?.parishes.find(x=>x.id===parish.value); if(!s||!m||!p) return;
      save.disabled=true; save.textContent='Guardando…';
      try {
        const localityText=`${m.name} · ${p.name}`;
        const r=await fetch('/api/chat/session',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({state:s.name,zoneId:null,localityText})});
        const data=await r.json(); if(!r.ok||!data.success) throw new Error(data.message||'No se pudo guardar.');
        chosenLocation={state:s.name,municipality:m.name,parish:p.name,localityText,zoneId:null,label:`${m.name} · ${p.name}, ${s.name}`}; showChosenLocation();
      } catch(e) { console.error('Localidad:',e); } finally { save.disabled=false; save.textContent='Listo'; }
    });
    form.dataset.cascadeReady='1';
  }

  let attempts=0;
  function wait(){ const form=document.getElementById('location-form'); if(form&&!form.dataset.cascadeReady){ mount(); return; } if(attempts++<60) setTimeout(wait,100); }
  wait();
})();
