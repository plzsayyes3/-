// Rendering, user interaction and local import/export.
// Business scheduling logic lives in scheduler-core.js / scheduler.js.

function renderValidation(){
  const v=validation();
  const box=(items,cls,title)=>items.length?`<div class="${cls}"><strong>${title}</strong><ul class="validation-list">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';
  $('#globalValidation').innerHTML=box(v.errors,'error','入力エラー')+box(v.warnings,'warn','確認事項');
  $('#patternValidation').innerHTML='';$('#staffValidation').innerHTML='';$('#monthlyValidation').innerHTML='';
  return v;
}

function setupTabs(){
  $$('.tab').forEach(button=>button.addEventListener('click',()=>{
    $$('.tab').forEach(x=>x.classList.toggle('active',x===button));
    $$('.tab-panel').forEach(p=>p.classList.remove('active'));
    $('#tab-'+button.dataset.tab).classList.add('active');
  }));
}

function renderPatterns(){
  const root=$('#patternTable');
  root.innerHTML=`<table><thead><tr><th>ID</th><th>名称</th><th>開始</th><th>終了</th><th>実働分</th><th>休憩分</th><th>必要人数</th><th>正規保育士資格者必須</th><th>有効</th><th></th></tr></thead><tbody>${db.patterns.map(p=>`<tr data-id="${esc(p.id)}"><td>${esc(p.id)}</td><td><input class="pattern-name" data-k="name" value="${esc(p.name)}"></td><td><input class="pattern-input" type="time" data-k="start" value="${esc(p.start)}"></td><td><input class="pattern-input" type="time" data-k="end" value="${esc(p.end)}"></td><td><input class="pattern-number" type="number" data-k="workMinutes" value="${p.workMinutes??0}"></td><td><input class="pattern-number" type="number" min="0" data-k="breakMinutes" value="${p.breakMinutes??0}"></td><td><input class="pattern-number" type="number" min="0" data-k="requiredCount" value="${p.requiredCount??0}"></td><td><input class="pattern-number" type="number" min="0" data-k="regularQualifiedRequired" value="${p.regularQualifiedRequired??0}"></td><td><input type="checkbox" data-k="active" ${p.active!==false?'checked':''}></td><td><button class="danger" data-del-pattern>削除</button></td></tr>`).join('')}</tbody></table>`;
  root.querySelectorAll('input').forEach(el=>el.addEventListener('change',e=>{
    const p=db.patterns.find(x=>x.id===e.target.closest('tr').dataset.id);if(!p)return;
    const k=e.target.dataset.k;p[k]=e.target.type==='checkbox'?e.target.checked:(e.target.type==='number'?Number(e.target.value):e.target.value);
    save();renderAll();
  }));
  root.querySelectorAll('[data-del-pattern]').forEach(button=>button.addEventListener('click',e=>{
    const id=e.target.closest('tr').dataset.id;
    if(db.staff.some(s=>s.defaultPatternId===id||s.allowedPatternIds?.includes(id))){alert('このパターンを参照しているスタッフがいるため削除できません。');return}
    if(!confirm(`勤務パターン ${id} を削除しますか？`))return;
    db.patterns=db.patterns.filter(p=>p.id!==id);save();renderAll();
  }));
}

function renderStaff(){
  const root=$('#staffCards');
  if(!db.staff.length){root.innerHTML='<div class="note">まだスタッフが登録されていません。</div>';return}
  const qualificationOptions=[...new Set(['保育士','看護師',...db.staff.flatMap(s=>s.qualifications||[])])];
  const employmentOptions=[...new Set([...EMPLOYMENT_TYPES,...db.staff.map(s=>s.employmentType).filter(Boolean)])];
  root.innerHTML=db.staff.map(s=>`<article class="staff-card ${s.active===false?'inactive':''}" data-id="${esc(s.id)}">
    <div class="staff-card-head"><strong>${esc(s.name||'名称未設定')} <span class="small">${esc(s.id)}</span></strong><div class="actions"><label class="check-chip"><input type="checkbox" data-active ${s.active!==false?'checked':''}>有効</label><button class="danger" data-del-staff>削除</button></div></div>
    <div class="staff-card-grid">
      <label class="field">氏名<input data-k="name" value="${esc(s.name||'')}"></label>
      <label class="field">雇用区分<select data-k="employmentType">${employmentOptions.map(t=>`<option value="${esc(t)}" ${s.employmentType===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="field">職種<input data-k="role" value="${esc(s.role||'')}"></label>
      <div class="field"><span>資格</span><div class="check-grid">${qualificationOptions.map(q=>`<label class="check-chip"><input type="checkbox" data-qualification="${esc(q)}" ${(s.qualifications||[]).includes(q)?'checked':''}>${esc(q)}</label>`).join('')}</div></div>
      <label class="field">週勤務日数<input type="number" min="0" max="7" data-k="weeklyWorkDays" value="${s.weeklyWorkDays??''}" placeholder="例: 4"></label>
      <label class="field">週休数<input type="number" min="0" max="7" data-k="weeklyDaysOff" value="${s.weeklyDaysOff??''}" placeholder="例: 3"></label>
      <label class="field">固定休曜日<input data-k="fixedOffWeekdays" value="${esc((s.fixedOffWeekdays||[]).join(','))}" placeholder="水"></label>
      <label class="field">基本勤務<select data-k="defaultPatternId"><option value="">指定なし</option>${activePatterns().map(p=>`<option value="${esc(p.id)}" ${s.defaultPatternId===p.id?'selected':''}>${esc(p.name)} (${esc(p.start)}-${esc(p.end)})</option>`).join('')}</select></label>
      <label class="field">基本勤務の扱い<select data-k="shiftPolicy"><option value="flexible" ${s.shiftPolicy==='flexible'?'selected':''}>可変</option><option value="prefer-fixed" ${s.shiftPolicy==='prefer-fixed'?'selected':''}>原則固定</option><option value="fixed" ${s.shiftPolicy==='fixed'?'selected':''}>固定</option></select></label>
      <label class="field">希望休上限<input type="number" min="0" data-k="requestedOffLimit" value="${s.requestedOffLimit??''}" placeholder="空欄=制限なし"></label>
      <div class="field wide"><span>勤務可能パターン</span><div class="check-grid">${activePatterns().map(p=>`<label class="check-chip"><input type="checkbox" data-pattern="${esc(p.id)}" ${(s.allowedPatternIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</div></div>
      <div class="field wide"><span>優先パターン</span><div class="check-grid">${activePatterns().map(p=>`<label class="check-chip"><input type="checkbox" data-preferred-pattern="${esc(p.id)}" ${(s.preferredPatternIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</div></div>
      <label class="field wide">メモ<textarea rows="2" data-k="notes">${esc(s.notes||'')}</textarea></label>
    </div>
  </article>`).join('');

  root.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);if(!s)return;
    const k=e.target.dataset.k;let v=e.target.value;
    if(['weeklyWorkDays','weeklyDaysOff','requestedOffLimit'].includes(k))v=v===''?null:Number(v);
    if(k==='fixedOffWeekdays')v=parseWeekdays(v);
    if(k==='defaultPatternId')v=v||null;
    s[k]=v;save();renderAll();
  }));
  root.querySelectorAll('[data-active]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);if(!s)return;s.active=e.target.checked;save();renderAll();
  }));
  root.querySelectorAll('[data-qualification]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);if(!s)return;
    const set=new Set(s.qualifications||[]);e.target.checked?set.add(e.target.dataset.qualification):set.delete(e.target.dataset.qualification);
    s.qualifications=[...set];s.qualified=s.qualifications.includes('保育士');save();renderAll();
  }));
  root.querySelectorAll('[data-pattern]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);if(!s)return;
    const set=new Set(s.allowedPatternIds||[]);e.target.checked?set.add(e.target.dataset.pattern):set.delete(e.target.dataset.pattern);
    s.allowedPatternIds=[...set];s.preferredPatternIds=(s.preferredPatternIds||[]).filter(id=>set.has(id));save();renderAll();
  }));
  root.querySelectorAll('[data-preferred-pattern]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);if(!s)return;
    const id=e.target.dataset.preferredPattern;
    if(!(s.allowedPatternIds||[]).includes(id)&&e.target.checked){alert('先に勤務可能パターンへ追加してください。');e.target.checked=false;return}
    const set=new Set(s.preferredPatternIds||[]);e.target.checked?set.add(id):set.delete(id);s.preferredPatternIds=[...set];save();renderAll();
  }));
  root.querySelectorAll('[data-del-staff]').forEach(button=>button.addEventListener('click',e=>{
    const id=e.target.closest('.staff-card').dataset.id;const s=db.staff.find(x=>x.id===id);
    if(!confirm(`${s?.name||id} を削除しますか？\n月次データ内のこの職員の情報も削除します。`))return;
    db.staff=db.staff.filter(x=>x.id!==id);
    Object.values(db.monthly).forEach(m=>{delete m.requestedOff?.[id];delete m.fixedOff?.[id];delete m.dayState?.[id];delete m.shiftState?.[id]});
    save();loadMonthState();renderAll();
  }));
}

function renderMonthlyInputs(){
  const root=$('#monthlyInputs'),m=currentMonthData();
  if(!activeStaff().length){root.innerHTML='<div class="note">スタッフを登録すると月次入力欄が表示されます。</div>';return}
  root.classList.toggle('locked-ui',m.locked);
  root.innerHTML=`<table><thead><tr><th class="name">職員</th><th>区分</th><th>希望休</th><th>今月だけの固定休</th></tr></thead><tbody>${activeStaff().map(s=>`<tr data-id="${esc(s.id)}"><td class="name">${esc(s.name||s.id)}</td><td>${esc(s.employmentType)}</td><td><input data-k="requestedOff" value="${esc((m.requestedOff[s.id]||[]).join(','))}" placeholder="3,12,25" ${m.locked?'disabled':''}></td><td><input data-k="fixedOff" value="${esc((m.fixedOff[s.id]||[]).join(','))}" placeholder="5,18" ${m.locked?'disabled':''}></td></tr>`).join('')}</tbody></table>`;
  root.querySelectorAll('input').forEach(el=>el.addEventListener('change',e=>{
    if(m.locked)return;const id=e.target.closest('tr').dataset.id;const nums=parseNums(e.target.value).filter(d=>d<=daysInMonth());
    if(e.target.dataset.k==='requestedOff')m.requestedOff[id]=nums;else m.fixedOff[id]=nums;
    dayState={};shiftState={};save();renderAll();
  }));
}

function renderOff(){
  const root=$('#offTable'),m=currentMonthData(),n=daysInMonth(),miss=missedRequests();
  $('#offWarnings').innerHTML=miss.length?`<div class="warn">希望休で勤務になった日: ${esc(miss.join(' / '))}</div>`:(Object.keys(dayState).length?'<div class="ok">休日表を生成済みです。</div>':'');
  if(!activeStaff().length){root.innerHTML='';return}
  root.innerHTML=`<table><thead><tr><th class="name">職員</th>${Array.from({length:n},(_,i)=>`<th>${i+1}<br><span class="small">${WEEKDAYS[dateFor(i+1).getDay()]}</span></th>`).join('')}</tr></thead><tbody>${activeStaff().map(s=>`<tr><td class="name">${esc(s.name||s.id)}</td>${Array.from({length:n},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d]||'';const req=(m.requestedOff[s.id]||[]).includes(d);const text=st==='closed'?'休園':st==='off'?'休':'○';return `<td data-staff="${esc(s.id)}" data-day="${d}" class="${st} ${req?'requested':''} ${m.locked?'locked-cell':''}">${text}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  if(!m.locked)root.querySelectorAll('td[data-staff]').forEach(td=>td.addEventListener('click',()=>{
    const id=td.dataset.staff,d=Number(td.dataset.day);if(isClosed(d))return;dayState[id]||={};dayState[id][d]=dayState[id][d]==='off'?'work':'off';shiftState={};save();renderOff();renderShift();
  }));
}

function lockOff(){const m=currentMonthData();if(!Object.keys(dayState).length){alert('先に休日を生成してください。');return}m.locked=true;shiftState={};save();renderAll()}
function unlockOff(){const m=currentMonthData();m.locked=false;shiftState={};save();renderAll()}
function updateLockUi(){
  const m=currentMonthData();$('#lockBadge').textContent=m.locked?'休日確定済み':'編集中';$('#lockBadge').classList.toggle('locked',m.locked);
  $('#lockOff').classList.toggle('hidden',m.locked);$('#unlockOff').classList.toggle('hidden',!m.locked);
  ['regularMonthlyOff','holidays','edgeShiftMax'].forEach(id=>{$('#'+id).disabled=m.locked});
}

function renderShift(){
  const root=$('#shiftTable'),warnings=shiftWarnings();
  $('#shiftWarnings').innerHTML=warnings.length?`<div class="warn"><strong>確認事項</strong><ul class="validation-list">${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:(Object.keys(shiftState).length?'<div class="ok">現在の登録条件では大きな不足を検出していません。</div>':'');
  if(!activeStaff().length){root.innerHTML='';return}
  const n=daysInMonth();
  root.innerHTML=`<table><thead><tr><th class="name">職員</th>${Array.from({length:n},(_,i)=>`<th>${i+1}</th>`).join('')}</tr></thead><tbody>${activeStaff().map(s=>`<tr><td class="name">${esc(s.name||s.id)}</td>${Array.from({length:n},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d];if(st==='closed')return '<td class="closed">休園</td>';if(st==='off')return '<td class="off">休</td>';const pid=shiftState[s.id]?.[d],p=db.patterns.find(x=>x.id===pid);return `<td class="work ${pid==='P01'||pid==='P07'?'shift-edge':''}">${p?esc(p.name):'未'}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
}

function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportJson(){save();const payload={schemaVersion:SCHEMA_VERSION,exportedAt:new Date().toISOString(),app:'childcare-shift-poc',db};download(`childcare-shift-${monthInfo().key}.json`,JSON.stringify(payload,null,2),'application/json')}
function importJson(file){
  const r=new FileReader();r.onload=()=>{try{db=migrateLoaded(JSON.parse(r.result));const keys=Object.keys(db.monthly);if(keys.length)$('#month').value=keys[0];loadMonthState();save();renderAll();alert(`JSONを読み込みました（schema v${SCHEMA_VERSION}へ正規化）。`)}catch(e){alert('JSON読込エラー: '+e.message)}};r.readAsText(file);
}
function exportCsv(){
  const rows=[['職員','区分',...Array.from({length:daysInMonth()},(_,i)=>String(i+1))]];
  activeStaff().forEach(s=>rows.push([s.name,s.employmentType,...Array.from({length:daysInMonth()},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d];if(st==='closed')return '休園';if(st==='off')return '休';const p=db.patterns.find(x=>x.id===shiftState[s.id]?.[d]);return p?.name||''})]));
  download(`shift-${monthInfo().key}.csv`,rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n'),'text/csv;charset=utf-8');
}
function clearSchedule(){if(currentMonthData().locked){alert('休日確定を解除してから初期化してください。');return}dayState={};shiftState={};save();renderAll()}

function renderAll(){renderPatterns();renderStaff();renderMonthlyInputs();renderOff();renderShift();updateLockUi();renderValidation()}

function bind(){
  setupTabs();
  $('#addPattern').addEventListener('click',()=>{
    let n=1;const ids=new Set(db.patterns.map(p=>p.id));while(ids.has('P'+String(n).padStart(2,'0')))n++;
    db.patterns.push(normalizePattern({id:'P'+String(n).padStart(2,'0'),name:'新規',start:'09:00',end:'17:00',workMinutes:420,breakMinutes:60,requiredCount:0,regularQualifiedRequired:0,active:true}));save();renderAll();
  });
  $('#addStaff').addEventListener('click',()=>{db.staff.push(defaultStaff());save();renderAll()});
  $('#month').addEventListener('change',()=>{loadMonthState();save();renderAll()});
  ['regularMonthlyOff','holidays','edgeShiftMax'].forEach(id=>$('#'+id).addEventListener('change',()=>{if(currentMonthData().locked)return;persistMonthState();shiftState={};save();renderAll()}));
  $('#generateOff').addEventListener('click',generateOff);$('#lockOff').addEventListener('click',lockOff);$('#unlockOff').addEventListener('click',unlockOff);
  $('#generateShifts').addEventListener('click',generateShifts);$('#clearSchedule').addEventListener('click',clearSchedule);
  $('#exportData').addEventListener('click',exportJson);$('#exportCsv').addEventListener('click',exportCsv);
  $('#validateAll').addEventListener('click',()=>{renderValidation();window.scrollTo({top:0,behavior:'smooth'})});
  $('#importData').addEventListener('change',e=>{if(e.target.files[0])importJson(e.target.files[0]);e.target.value=''});
}
