const STORAGE_KEY='childcareShiftPocV3';
const SCHEMA_VERSION=3;
const WEEKDAYS=['日','月','火','水','木','金','土'];
const EMPLOYMENT_TYPES=['正規保育士','非正規保育士','派遣保育士','非正規保育補助'];

const DEFAULT_PATTERNS=[
  {id:'P01',name:'6:45',start:'06:45',end:'15:30',workMinutes:480,breakMinutes:45,requiredCount:2,regularQualifiedRequired:2,active:true},
  {id:'P02',name:'7:30',start:'07:30',end:'16:15',workMinutes:480,breakMinutes:45,requiredCount:1,regularQualifiedRequired:0,active:true},
  {id:'P03',name:'8:00',start:'08:00',end:'16:45',workMinutes:480,breakMinutes:45,requiredCount:2,regularQualifiedRequired:0,active:true},
  {id:'P04',name:'8:30',start:'08:30',end:'17:15',workMinutes:480,breakMinutes:45,requiredCount:3,regularQualifiedRequired:0,active:true},
  {id:'P05',name:'9:00',start:'09:00',end:'17:45',workMinutes:480,breakMinutes:45,requiredCount:2,regularQualifiedRequired:0,active:true},
  {id:'P06',name:'9:45',start:'09:45',end:'18:30',workMinutes:480,breakMinutes:45,requiredCount:5,regularQualifiedRequired:0,active:true},
  {id:'P07',name:'11:30',start:'11:30',end:'20:15',workMinutes:480,breakMinutes:45,requiredCount:2,regularQualifiedRequired:2,active:true}
];

let db={schemaVersion:SCHEMA_VERSION,patterns:structuredClone(DEFAULT_PATTERNS),staff:[],monthly:{}};
let dayState={};
let shiftState={};

const $=q=>document.querySelector(q);
const $$=q=>[...document.querySelectorAll(q)];
function uid(prefix='X'){return prefix+Math.random().toString(36).slice(2,8).toUpperCase()}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function parseNums(s){return [...new Set(String(s||'').split(/[、,\s]+/).map(Number).filter(n=>Number.isInteger(n)&&n>0))].sort((a,b)=>a-b)}
function parseWeekdays(s){return [...new Set(String(s||'').split(/[、,\s]+/).map(x=>x.trim()).filter(x=>WEEKDAYS.includes(x)))]}
function timeMin(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;const h=Number(m[1]),min=Number(m[2]);return h>=0&&h<24&&min>=0&&min<60?h*60+min:null}
function monthInfo(){const v=$('#month').value;if(!v){const d=new Date();return {year:d.getFullYear(),month:d.getMonth()+1,key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}}const [year,month]=v.split('-').map(Number);return {year,month,key:v}}
function daysInMonth(){const {year,month}=monthInfo();return new Date(year,month,0).getDate()}
function dateFor(day){const {year,month}=monthInfo();return new Date(year,month-1,day)}
function activeStaff(){return db.staff.filter(s=>s.active!==false)}
function activePatterns(){return db.patterns.filter(p=>p.active!==false)}

function defaultStaff(){return {id:uid('S'),name:'',employmentType:'正規保育士',qualified:true,weeklyDaysOff:null,fixedOffWeekdays:[],allowedPatternIds:activePatterns().map(p=>p.id),defaultPatternId:null,active:true,notes:''}}
function currentMonthData(){
  const key=monthInfo().key;
  if(!db.monthly[key])db.monthly[key]={requestedOff:{},fixedOff:{},locked:false,regularMonthlyOff:9,holidays:[],edgeShiftMax:3,dayState:{},shiftState:{}};
  const m=db.monthly[key];
  m.requestedOff||={};m.fixedOff||={};m.dayState||={};m.shiftState||={};
  if(typeof m.locked!=='boolean')m.locked=false;
  if(m.regularMonthlyOff==null)m.regularMonthlyOff=9;
  if(!Array.isArray(m.holidays))m.holidays=[];
  if(m.edgeShiftMax==null)m.edgeShiftMax=3;
  return m;
}
function isClosed(day){const m=currentMonthData();return dateFor(day).getDay()===0||m.holidays.includes(day)}
function loadMonthState(){const m=currentMonthData();dayState=structuredClone(m.dayState||{});shiftState=structuredClone(m.shiftState||{});$('#regularMonthlyOff').value=m.regularMonthlyOff;$('#holidays').value=(m.holidays||[]).join(',');$('#edgeShiftMax').value=m.edgeShiftMax;updateLockUi()}
function persistMonthState(){const m=currentMonthData();m.dayState=structuredClone(dayState);m.shiftState=structuredClone(shiftState);m.regularMonthlyOff=Number($('#regularMonthlyOff').value)||0;m.holidays=parseNums($('#holidays').value).filter(d=>d<=daysInMonth());m.edgeShiftMax=Math.max(1,Number($('#edgeShiftMax').value)||3)}
function save(){db.schemaVersion=SCHEMA_VERSION;persistMonthState();localStorage.setItem(STORAGE_KEY,JSON.stringify({schemaVersion:SCHEMA_VERSION,db}))}

function migrateLoaded(x){
  const source=x?.db?x.db:x;
  if(!source||typeof source!=='object')throw new Error('JSON形式を認識できません。');
  const out={schemaVersion:SCHEMA_VERSION,patterns:Array.isArray(source.patterns)?source.patterns:structuredClone(DEFAULT_PATTERNS),staff:Array.isArray(source.staff)?source.staff:[],monthly:source.monthly&&typeof source.monthly==='object'?source.monthly:{}};
  if(source.settings){
    const key=source.settings.month;
    if(key){
      out.monthly[key]||={requestedOff:{},fixedOff:{}};
      Object.assign(out.monthly[key],{regularMonthlyOff:Number(source.settings.regularMonthlyOff)||9,holidays:parseNums(source.settings.holidays||''),edgeShiftMax:Number(source.settings.edgeShiftMax)||3});
    }
  }
  if(x?.dayState||x?.shiftState){
    const key=source.settings?.month;
    if(key){out.monthly[key]||={requestedOff:{},fixedOff:{}};out.monthly[key].dayState=x.dayState||{};out.monthly[key].shiftState=x.shiftState||{}}
  }
  Object.values(out.monthly).forEach(m=>{m.requestedOff||={};m.fixedOff||={};m.dayState||={};m.shiftState||={};if(typeof m.locked!=='boolean')m.locked=false;if(m.regularMonthlyOff==null)m.regularMonthlyOff=9;if(!Array.isArray(m.holidays))m.holidays=parseNums(m.holidays||'');if(m.edgeShiftMax==null)m.edgeShiftMax=3});
  return out;
}
function load(){
  const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem('childcareShiftPocV2');
  if(raw){try{const x=JSON.parse(raw);db=migrateLoaded(x)}catch(e){console.warn(e)}}
  if(!db.patterns.length)db.patterns=structuredClone(DEFAULT_PATTERNS);
  const d=new Date();$('#month').value=Object.keys(db.monthly)[0]||`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  syncStaffPatternRefs();loadMonthState();save();
}

function validation(){
  const errors=[],warnings=[];
  const ids=db.patterns.map(p=>String(p.id||'').trim());
  const duplicates=[...new Set(ids.filter((id,i)=>id&&ids.indexOf(id)!==i))];
  duplicates.forEach(id=>errors.push(`勤務パターンID「${id}」が重複しています。`));
  db.patterns.forEach((p,i)=>{
    const label=p.id||`#${i+1}`;const start=timeMin(p.start),end=timeMin(p.end);
    if(!p.id)errors.push(`勤務パターン${i+1}にIDがありません。`);
    if(start==null||end==null||end<=start)errors.push(`${label}: 開始・終了時刻が不正です。`);
    if(Number(p.requiredCount)<0||!Number.isFinite(Number(p.requiredCount)))errors.push(`${label}: 必要人数が不正です。`);
    if(Number(p.regularQualifiedRequired)<0||Number(p.regularQualifiedRequired)>Number(p.requiredCount))errors.push(`${label}: 正規有資格必須人数が必要人数を超えています。`);
    if(Number(p.workMinutes)<=0)warnings.push(`${label}: 実働分が0以下です。`);
  });
  const validIds=new Set(db.patterns.map(p=>p.id));
  activeStaff().forEach(s=>{
    const name=s.name||s.id;
    if(!String(s.name||'').trim())warnings.push(`${name}: 氏名が未入力です。`);
    if(s.defaultPatternId&&!validIds.has(s.defaultPatternId))errors.push(`${name}: 基本勤務 ${s.defaultPatternId} が存在しません。`);
    (s.allowedPatternIds||[]).filter(id=>!validIds.has(id)).forEach(id=>errors.push(`${name}: 勤務可能パターン ${id} が存在しません。`));
    if(s.employmentType==='正規保育士'&&!(s.allowedPatternIds||[]).length)errors.push(`${name}: 正規保育士なのに勤務可能パターンがありません。`);
    if(s.employmentType!=='正規保育士'&&s.weeklyDaysOff==null)warnings.push(`${name}: 週休数が未設定です。`);
    if(s.defaultPatternId){const p=db.patterns.find(x=>x.id===s.defaultPatternId);if(p?.regularQualifiedRequired>0&&!(s.employmentType==='正規保育士'&&s.qualified))errors.push(`${name}: 基本勤務 ${p.name} は正規有資格者条件と矛盾します。`)}
  });
  const m=currentMonthData(),max=daysInMonth();
  [...Object.entries(m.requestedOff),...Object.entries(m.fixedOff)].forEach(([id,days])=>{if(!db.staff.some(s=>s.id===id))warnings.push(`月次データに削除済みスタッフ ${id} の情報が残っています。`);(days||[]).filter(d=>d>max).forEach(d=>warnings.push(`${id}: ${d}日は対象月に存在しません。`))});
  return {errors,warnings};
}
function renderValidation(){
  const v=validation();
  const box=(items,cls,title)=>items.length?`<div class="${cls}"><strong>${title}</strong><ul class="validation-list">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';
  $('#globalValidation').innerHTML=box(v.errors,'error','入力エラー')+box(v.warnings,'warn','確認事項');
  $('#patternValidation').innerHTML='';$('#staffValidation').innerHTML='';$('#monthlyValidation').innerHTML='';
  return v;
}

function setupTabs(){$$('.tab').forEach(b=>b.addEventListener('click',()=>{$$('.tab').forEach(x=>x.classList.toggle('active',x===b));$$('.tab-panel').forEach(p=>p.classList.remove('active'));$('#tab-'+b.dataset.tab).classList.add('active')}))}
function syncStaffPatternRefs(){const ids=new Set(db.patterns.map(p=>p.id));db.staff.forEach(s=>{s.allowedPatternIds=(s.allowedPatternIds||[]).filter(id=>ids.has(id));if(s.defaultPatternId&&!ids.has(s.defaultPatternId))s.defaultPatternId=null})}

function renderPatterns(){
  const root=$('#patternTable');
  root.innerHTML=`<table><thead><tr><th>ID</th><th>名称</th><th>開始</th><th>終了</th><th>実働分</th><th>休憩分</th><th>必要人数</th><th>正規有資格必須</th><th>有効</th><th></th></tr></thead><tbody>${db.patterns.map(p=>`<tr data-id="${esc(p.id)}"><td>${esc(p.id)}</td><td><input class="pattern-name" data-k="name" value="${esc(p.name)}"></td><td><input class="pattern-input" type="time" data-k="start" value="${esc(p.start)}"></td><td><input class="pattern-input" type="time" data-k="end" value="${esc(p.end)}"></td><td><input class="pattern-number" type="number" data-k="workMinutes" value="${p.workMinutes??0}"></td><td><input class="pattern-number" type="number" data-k="breakMinutes" value="${p.breakMinutes??0}"></td><td><input class="pattern-number" type="number" min="0" data-k="requiredCount" value="${p.requiredCount??0}"></td><td><input class="pattern-number" type="number" min="0" data-k="regularQualifiedRequired" value="${p.regularQualifiedRequired??0}"></td><td><input type="checkbox" data-k="active" ${p.active?'checked':''}></td><td><button class="danger" data-del-pattern>削除</button></td></tr>`).join('')}</tbody></table>`;
  root.querySelectorAll('input').forEach(el=>el.addEventListener('change',e=>{const p=db.patterns.find(x=>x.id===e.target.closest('tr').dataset.id);if(!p)return;const k=e.target.dataset.k;p[k]=e.target.type==='checkbox'?e.target.checked:(e.target.type==='number'?Number(e.target.value):e.target.value);save();renderAll()}));
  root.querySelectorAll('[data-del-pattern]').forEach(b=>b.addEventListener('click',e=>{const id=e.target.closest('tr').dataset.id;if(db.staff.some(s=>s.defaultPatternId===id||s.allowedPatternIds?.includes(id))){alert('このパターンを参照しているスタッフがいるため削除できません。');return}db.patterns=db.patterns.filter(p=>p.id!==id);save();renderAll()}));
}
function renderStaff(){
  const root=$('#staffCards');if(!db.staff.length){root.innerHTML='<div class="note">まだスタッフが登録されていません。</div>';return}
  root.innerHTML=db.staff.map(s=>`<article class="staff-card" data-id="${s.id}"><div class="staff-card-head"><strong>${esc(s.name||'名称未設定')} <span class="small">${esc(s.id)}</span></strong><button class="danger" data-del-staff>削除</button></div><div class="staff-card-grid"><label class="field">氏名<input data-k="name" value="${esc(s.name)}"></label><label class="field">区分<select data-k="employmentType">${EMPLOYMENT_TYPES.map(t=>`<option ${s.employmentType===t?'selected':''}>${t}</option>`).join('')}</select></label><label class="field">資格<select data-k="qualified"><option value="true" ${s.qualified?'selected':''}>有資格</option><option value="false" ${!s.qualified?'selected':''}>無資格</option></select></label><label class="field">週休数（主に非正規）<input type="number" min="0" max="7" data-k="weeklyDaysOff" value="${s.weeklyDaysOff??''}"></label><label class="field">固定休曜日<input data-k="fixedOffWeekdays" value="${esc((s.fixedOffWeekdays||[]).join(','))}" placeholder="水,日"></label><label class="field">基本勤務<select data-k="defaultPatternId"><option value="">指定なし</option>${activePatterns().map(p=>`<option value="${p.id}" ${s.defaultPatternId===p.id?'selected':''}>${esc(p.name)} (${p.start}-${p.end})</option>`).join('')}</select></label><div class="field wide"><span>勤務可能パターン</span><div class="check-grid">${activePatterns().map(p=>`<label class="check-chip"><input type="checkbox" data-pattern="${p.id}" ${(s.allowedPatternIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</div></div><label class="field wide">メモ<textarea rows="2" data-k="notes">${esc(s.notes||'')}</textarea></label></div></article>`).join('');
  root.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('change',e=>{const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const k=e.target.dataset.k;let v=e.target.value;if(k==='qualified')v=v==='true';if(k==='weeklyDaysOff')v=v===''?null:Number(v);if(k==='fixedOffWeekdays')v=parseWeekdays(v);if(k==='defaultPatternId')v=v||null;s[k]=v;save();renderAll()}));
  root.querySelectorAll('[data-pattern]').forEach(el=>el.addEventListener('change',e=>{const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const set=new Set(s.allowedPatternIds||[]);e.target.checked?set.add(e.target.dataset.pattern):set.delete(e.target.dataset.pattern);s.allowedPatternIds=[...set];save();renderAll()}));
  root.querySelectorAll('[data-del-staff]').forEach(b=>b.addEventListener('click',e=>{const id=e.target.closest('.staff-card').dataset.id;db.staff=db.staff.filter(s=>s.id!==id);Object.values(db.monthly).forEach(m=>{delete m.requestedOff?.[id];delete m.fixedOff?.[id];delete m.dayState?.[id];delete m.shiftState?.[id]});save();loadMonthState();renderAll()}));
}
function renderMonthlyInputs(){
  const root=$('#monthlyInputs'),m=currentMonthData();if(!activeStaff().length){root.innerHTML='<div class="note">スタッフを登録すると月次入力欄が表示されます。</div>';return}
  root.classList.toggle('locked-ui',m.locked);
  root.innerHTML=`<table><thead><tr><th class="name">職員</th><th>区分</th><th>希望休</th><th>今月だけの固定休</th></tr></thead><tbody>${activeStaff().map(s=>`<tr data-id="${s.id}"><td class="name">${esc(s.name||s.id)}</td><td>${esc(s.employmentType)}</td><td><input data-k="requestedOff" value="${esc((m.requestedOff[s.id]||[]).join(','))}" placeholder="3,12,25" ${m.locked?'disabled':''}></td><td><input data-k="fixedOff" value="${esc((m.fixedOff[s.id]||[]).join(','))}" placeholder="5,18" ${m.locked?'disabled':''}></td></tr>`).join('')}</tbody></table>`;
  root.querySelectorAll('input').forEach(el=>el.addEventListener('change',e=>{if(m.locked)return;const id=e.target.closest('tr').dataset.id;const nums=parseNums(e.target.value).filter(d=>d<=daysInMonth());if(e.target.dataset.k==='requestedOff')m.requestedOff[id]=nums;else m.fixedOff[id]=nums;save();renderValidation()}));
}

function offPriority(day,s,dailyOff,requested){const adjacent=((dayState[s.id]?.[day-1]&&dayState[s.id][day-1]!=='work')?4:0)+((dayState[s.id]?.[day+1]&&dayState[s.id][day+1]!=='work')?4:0);return (requested.has(day)?-10000:0)+(dailyOff[day]||0)*20+adjacent*5+day/1000}
function generateOff(){
  const v=validation();if(v.errors.length){renderValidation();alert('入力エラーを解消してから生成してください。');return}
  const m=currentMonthData();if(m.locked){alert('休日確定中です。解除してから再生成してください。');return}
  const n=daysInMonth();dayState={};shiftState={};const dailyOff=Object.fromEntries(Array.from({length:n},(_,i)=>[i+1,0]));
  activeStaff().forEach(s=>{dayState[s.id]={};const fixedWd=new Set(s.fixedOffWeekdays||[]),fixed=new Set(m.fixedOff[s.id]||[]);for(let d=1;d<=n;d++){const wd=WEEKDAYS[dateFor(d).getDay()];let st='work';if(isClosed(d))st='closed';else if(fixedWd.has(wd)||fixed.has(d))st='off';dayState[s.id][d]=st;if(st!=='work')dailyOff[d]++}});
  activeStaff().filter(s=>s.employmentType==='正規保育士').forEach(s=>{const target=m.regularMonthlyOff;let count=Object.values(dayState[s.id]).filter(x=>x!=='work').length;const req=new Set(m.requestedOff[s.id]||[]);const candidates=[];for(let d=1;d<=n;d++)if(dayState[s.id][d]==='work')candidates.push(d);while(count<target&&candidates.length){candidates.sort((a,b)=>offPriority(a,s,dailyOff,req)-offPriority(b,s,dailyOff,req)||a-b);const d=candidates.shift();dayState[s.id][d]='off';dailyOff[d]++;count++}});
  activeStaff().filter(s=>s.employmentType!=='正規保育士'&&s.weeklyDaysOff!=null).forEach(s=>{const target=Math.max(0,Number(s.weeklyDaysOff)||0),req=new Set(m.requestedOff[s.id]||[]);for(let start=1;start<=n;start+=7){const end=Math.min(n,start+6);let count=0,cands=[];for(let d=start;d<=end;d++){if(dayState[s.id][d]!=='work')count++;else cands.push(d)}while(count<target&&cands.length){cands.sort((a,b)=>offPriority(a,s,dailyOff,req)-offPriority(b,s,dailyOff,req)||a-b);const d=cands.shift();dayState[s.id][d]='off';dailyOff[d]++;count++}}});
  save();renderAll();
}
function missedRequests(){const m=currentMonthData(),out=[];activeStaff().forEach(s=>(m.requestedOff[s.id]||[]).forEach(d=>{if(dayState[s.id]?.[d]==='work')out.push(`${s.name||s.id} ${d}日`)}));return out}
function renderOff(){
  const root=$('#offTable'),m=currentMonthData(),n=daysInMonth();const miss=missedRequests();$('#offWarnings').innerHTML=miss.length?`<div class="warn">希望休で勤務になった日: ${esc(miss.join(' / '))}</div>`:(Object.keys(dayState).length?'<div class="ok">休日表を生成済みです。</div>':'');
  if(!activeStaff().length){root.innerHTML='';return}
  root.innerHTML=`<table><thead><tr><th class="name">職員</th>${Array.from({length:n},(_,i)=>`<th>${i+1}<br><span class="small">${WEEKDAYS[dateFor(i+1).getDay()]}</span></th>`).join('')}</tr></thead><tbody>${activeStaff().map(s=>`<tr><td class="name">${esc(s.name||s.id)}</td>${Array.from({length:n},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d]||'';const req=(m.requestedOff[s.id]||[]).includes(d);const text=st==='closed'?'休園':st==='off'?'休':'○';return `<td data-staff="${s.id}" data-day="${d}" class="${st} ${req?'requested':''} ${m.locked?'locked-cell':''}">${text}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  if(!m.locked)root.querySelectorAll('td[data-staff]').forEach(td=>td.addEventListener('click',()=>{const id=td.dataset.staff,d=Number(td.dataset.day);if(isClosed(d))return;dayState[id]||={};dayState[id][d]=dayState[id][d]==='off'?'work':'off';shiftState={};save();renderOff();renderShift()}));
}
function lockOff(){const m=currentMonthData();if(!Object.keys(dayState).length){alert('先に休日を生成してください。');return}m.locked=true;shiftState={};save();renderAll()}
function unlockOff(){const m=currentMonthData();m.locked=false;shiftState={};save();renderAll()}
function updateLockUi(){const m=currentMonthData();$('#lockBadge').textContent=m.locked?'休日確定済み':'編集中';$('#lockBadge').classList.toggle('locked',m.locked);$('#lockOff').classList.toggle('hidden',m.locked);$('#unlockOff').classList.toggle('hidden',!m.locked);['regularMonthlyOff','holidays','edgeShiftMax'].forEach(id=>{$('#'+id).disabled=m.locked})}

function eligible(s,p){return s.active!==false&&(s.allowedPatternIds||[]).includes(p.id)}
function shiftCountsByStaff(){const counts={};activeStaff().forEach(s=>counts[s.id]={total:{},edge:0});Object.values(shiftState).forEach(days=>Object.values(days||{}).forEach(()=>{}));for(const [sid,days] of Object.entries(shiftState)){for(const pid of Object.values(days||{})){if(!counts[sid])continue;counts[sid].total[pid]=(counts[sid].total[pid]||0)+1;if(['P01','P07'].includes(pid))counts[sid].edge++}}return counts}
function chooseCandidate(candidates,p,counts,edgeMax){return [...candidates].filter(s=>!(p.id==='P01'||p.id==='P07')||(counts[s.id]?.edge||0)<edgeMax).sort((a,b)=>((counts[a.id]?.total[p.id]||0)-(counts[b.id]?.total[p.id]||0))||((counts[a.id]?.edge||0)-(counts[b.id]?.edge||0))||String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')||a.id.localeCompare(b.id))[0]||null}
function generateShifts(){
  const v=validation();if(v.errors.length){renderValidation();alert('入力エラーを解消してください。');return}
  const m=currentMonthData();if(!m.locked){alert('先に休日を調整して「休日を確定」してください。');return}if(!Object.keys(dayState).length){alert('休日表がありません。');return}
  shiftState={};activeStaff().forEach(s=>shiftState[s.id]={});const patterns=activePatterns().slice().sort((a,b)=>timeMin(a.start)-timeMin(b.start)||a.id.localeCompare(b.id));const counts=shiftCountsByStaff();const edgeMax=m.edgeShiftMax;
  for(let d=1;d<=daysInMonth();d++){
    if(isClosed(d))continue;const workers=activeStaff().filter(s=>dayState[s.id]?.[d]==='work');const assigned=new Set();const dayPatternCounts={};
    const assign=(s,p)=>{shiftState[s.id][d]=p.id;assigned.add(s.id);dayPatternCounts[p.id]=(dayPatternCounts[p.id]||0)+1;counts[s.id].total[p.id]=(counts[s.id].total[p.id]||0)+1;if(p.id==='P01'||p.id==='P07')counts[s.id].edge++};
    workers.filter(s=>s.defaultPatternId).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')).forEach(s=>{const p=patterns.find(x=>x.id===s.defaultPatternId);if(p&&eligible(s,p))assign(s,p)});
    for(const p of patterns){
      let qualifiedNeeded=Math.max(0,(p.regularQualifiedRequired||0)-(workers.filter(s=>assigned.has(s.id)&&shiftState[s.id][d]===p.id&&s.employmentType==='正規保育士'&&s.qualified).length));
      while(qualifiedNeeded>0){const c=workers.filter(s=>!assigned.has(s.id)&&eligible(s,p)&&s.employmentType==='正規保育士'&&s.qualified);const pick=chooseCandidate(c,p,counts,edgeMax);if(!pick)break;assign(pick,p);qualifiedNeeded--}
      while((dayPatternCounts[p.id]||0)<Number(p.requiredCount||0)){const c=workers.filter(s=>!assigned.has(s.id)&&eligible(s,p));const pick=chooseCandidate(c,p,counts,edgeMax);if(!pick)break;assign(pick,p)}
    }
    workers.filter(s=>!assigned.has(s.id)).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')).forEach(s=>{const choices=patterns.filter(p=>eligible(s,p)&&(!['P01','P07'].includes(p.id)||(counts[s.id].edge||0)<edgeMax)).sort((a,b)=>((dayPatternCounts[a.id]||0)/Math.max(1,a.requiredCount||1))-((dayPatternCounts[b.id]||0)/Math.max(1,b.requiredCount||1))||timeMin(a.start)-timeMin(b.start)||a.id.localeCompare(b.id));if(choices[0])assign(s,choices[0])});
  }
  save();renderShift();
}
function shiftWarnings(){
  const m=currentMonthData(),warnings=[];if(!m.locked)return ['休日が未確定です。'];const patterns=activePatterns();for(let d=1;d<=daysInMonth();d++){if(isClosed(d))continue;const workers=activeStaff().filter(s=>dayState[s.id]?.[d]==='work');const assigned=workers.filter(s=>shiftState[s.id]?.[d]);if(assigned.length<workers.length)warnings.push(`${d}日: ${workers.length-assigned.length}名に勤務パターンを割り当てられません。`);for(const p of patterns){const members=assigned.filter(s=>shiftState[s.id][d]===p.id);if(members.length<Number(p.requiredCount||0))warnings.push(`${d}日 ${p.name}: ${Number(p.requiredCount||0)-members.length}名不足。`);const rq=members.filter(s=>s.employmentType==='正規保育士'&&s.qualified).length;if(rq<Number(p.regularQualifiedRequired||0))warnings.push(`${d}日 ${p.name}: 正規有資格者が${Number(p.regularQualifiedRequired||0)-rq}名不足。`)}const at830=assigned.filter(s=>{const p=db.patterns.find(x=>x.id===shiftState[s.id][d]);return p&&timeMin(p.start)<=510&&timeMin(p.end)>510}).length;if(at830<8)warnings.push(`${d}日 8:30時点: ${8-at830}名不足（現在${at830}名）。`)}return warnings}
function renderShift(){
  const root=$('#shiftTable'),warnings=shiftWarnings();$('#shiftWarnings').innerHTML=warnings.length?`<div class="warn"><strong>確認事項</strong><ul class="validation-list">${warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:(Object.keys(shiftState).length?'<div class="ok">現在の登録条件では大きな不足を検出していません。</div>':'');if(!activeStaff().length){root.innerHTML='';return}const n=daysInMonth();root.innerHTML=`<table><thead><tr><th class="name">職員</th>${Array.from({length:n},(_,i)=>`<th>${i+1}</th>`).join('')}</tr></thead><tbody>${activeStaff().map(s=>`<tr><td class="name">${esc(s.name||s.id)}</td>${Array.from({length:n},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d];if(st==='closed')return '<td class="closed">休園</td>';if(st==='off')return '<td class="off">休</td>';const pid=shiftState[s.id]?.[d],p=db.patterns.find(x=>x.id===pid);return `<td class="work ${pid==='P01'||pid==='P07'?'shift-edge':''}">${p?esc(p.name):'未'}</td>`}).join('')}</tr>`).join('')}</tbody></table>`}

function exportJson(){save();const payload={schemaVersion:SCHEMA_VERSION,exportedAt:new Date().toISOString(),app:'childcare-shift-poc',db};download(`childcare-shift-${monthInfo().key}.json`,JSON.stringify(payload,null,2),'application/json')}
function importJson(file){const r=new FileReader();r.onload=()=>{try{db=migrateLoaded(JSON.parse(r.result));syncStaffPatternRefs();const keys=Object.keys(db.monthly);if(keys.length)$('#month').value=keys[0];loadMonthState();save();renderAll();alert(`JSONを読み込みました（schema v${SCHEMA_VERSION}へ正規化）。`)}catch(e){alert('JSON読込エラー: '+e.message)}};r.readAsText(file)}
function exportCsv(){const rows=[['職員','区分',...Array.from({length:daysInMonth()},(_,i)=>String(i+1))]];activeStaff().forEach(s=>rows.push([s.name,s.employmentType,...Array.from({length:daysInMonth()},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d];if(st==='closed')return '休園';if(st==='off')return '休';const p=db.patterns.find(x=>x.id===shiftState[s.id]?.[d]);return p?.name||''})]));download(`shift-${monthInfo().key}.csv`,rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n'),'text/csv;charset=utf-8')}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function clearSchedule(){if(currentMonthData().locked){alert('休日確定を解除してから初期化してください。');return}dayState={};shiftState={};save();renderAll()}

function renderAll(){renderPatterns();renderStaff();renderMonthlyInputs();renderOff();renderShift();updateLockUi();renderValidation()}
function bind(){
  setupTabs();
  $('#addPattern').addEventListener('click',()=>{let n=1;const ids=new Set(db.patterns.map(p=>p.id));while(ids.has('P'+String(n).padStart(2,'0')))n++;db.patterns.push({id:'P'+String(n).padStart(2,'0'),name:'新規',start:'09:00',end:'17:00',workMinutes:420,breakMinutes:60,requiredCount:0,regularQualifiedRequired:0,active:true});save();renderAll()});
  $('#addStaff').addEventListener('click',()=>{db.staff.push(defaultStaff());save();renderAll()});
  $('#month').addEventListener('change',()=>{loadMonthState();save();renderAll()});
  ['regularMonthlyOff','holidays','edgeShiftMax'].forEach(id=>$('#'+id).addEventListener('change',()=>{if(currentMonthData().locked)return;persistMonthState();shiftState={};save();renderAll()}));
  $('#generateOff').addEventListener('click',generateOff);$('#lockOff').addEventListener('click',lockOff);$('#unlockOff').addEventListener('click',unlockOff);$('#generateShifts').addEventListener('click',generateShifts);$('#clearSchedule').addEventListener('click',clearSchedule);$('#exportData').addEventListener('click',exportJson);$('#exportCsv').addEventListener('click',exportCsv);$('#validateAll').addEventListener('click',()=>{renderValidation();window.scrollTo({top:0,behavior:'smooth'})});$('#importData').addEventListener('change',e=>{if(e.target.files[0])importJson(e.target.files[0]);e.target.value=''})
}

load();bind();renderAll();
