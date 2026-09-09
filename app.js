const STORAGE_KEY='childcareShiftPocV2';
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

let db={patterns:structuredClone(DEFAULT_PATTERNS),staff:[],monthly:{}};
let dayState={};
let shiftState={};

function uid(prefix='X'){return prefix+Math.random().toString(36).slice(2,8).toUpperCase()}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function parseNums(s){return [...new Set(String(s||'').split(/[、,\s]+/).map(Number).filter(n=>Number.isInteger(n)&&n>0))]}
function parseWeekdays(s){return [...new Set(String(s||'').split(/[、,\s]+/).map(x=>x.trim()).filter(x=>WEEKDAYS.includes(x)))]}
function timeMin(t){const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function monthInfo(){const v=$('#month').value;if(!v){const d=new Date();return {year:d.getFullYear(),month:d.getMonth()+1,key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}}const [year,month]=v.split('-').map(Number);return {year,month,key:v}}
function daysInMonth(){const {year,month}=monthInfo();return new Date(year,month,0).getDate()}
function dateFor(day){const {year,month}=monthInfo();return new Date(year,month-1,day)}
function isClosed(day){return dateFor(day).getDay()===0||parseNums($('#holidays').value).includes(day)}
function $(q){return document.querySelector(q)}
function $$(q){return [...document.querySelectorAll(q)]}

function defaultStaff(){return {id:uid('S'),name:'',employmentType:'正規保育士',qualified:true,weeklyDaysOff:null,fixedOffWeekdays:[],allowedPatternIds:db.patterns.filter(p=>p.active).map(p=>p.id),defaultPatternId:null,active:true,notes:''}}
function currentMonthData(){const key=monthInfo().key;if(!db.monthly[key])db.monthly[key]={requestedOff:{},fixedOff:{}};return db.monthly[key]}

function save(){
  db.settings={month:$('#month').value,regularMonthlyOff:$('#regularMonthlyOff').value,holidays:$('#holidays').value,edgeShiftMax:$('#edgeShiftMax').value};
  localStorage.setItem(STORAGE_KEY,JSON.stringify({db,dayState,shiftState}));
}
function load(){
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw){try{const x=JSON.parse(raw);db=x.db||db;dayState=x.dayState||{};shiftState=x.shiftState||{}}catch(e){console.warn(e)}}
  if(!Array.isArray(db.patterns)||!db.patterns.length)db.patterns=structuredClone(DEFAULT_PATTERNS);
  if(!Array.isArray(db.staff))db.staff=[];
  if(!db.monthly)db.monthly={};
  const s=db.settings||{};
  const d=new Date();
  $('#month').value=s.month||`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  $('#regularMonthlyOff').value=s.regularMonthlyOff||9;
  $('#holidays').value=s.holidays||'';
  $('#edgeShiftMax').value=s.edgeShiftMax||3;
}

function setupTabs(){
  $$('.tab').forEach(b=>b.addEventListener('click',()=>{
    $$('.tab').forEach(x=>x.classList.toggle('active',x===b));
    $$('.tab-panel').forEach(p=>p.classList.remove('active'));
    $('#tab-'+b.dataset.tab).classList.add('active');
  }));
}

function renderPatterns(){
  const root=$('#patternTable');
  root.innerHTML=`<table><thead><tr><th>ID</th><th>名称</th><th>開始</th><th>終了</th><th>実働分</th><th>休憩分</th><th>必要人数</th><th>正規有資格必須</th><th>有効</th><th></th></tr></thead><tbody>${db.patterns.map(p=>`<tr data-id="${p.id}">
    <td>${esc(p.id)}</td>
    <td><input class="pattern-name" data-k="name" value="${esc(p.name)}"></td>
    <td><input class="pattern-input" type="time" data-k="start" value="${esc(p.start)}"></td>
    <td><input class="pattern-input" type="time" data-k="end" value="${esc(p.end)}"></td>
    <td><input class="pattern-number" type="number" data-k="workMinutes" value="${p.workMinutes??0}"></td>
    <td><input class="pattern-number" type="number" data-k="breakMinutes" value="${p.breakMinutes??0}"></td>
    <td><input class="pattern-number" type="number" min="0" data-k="requiredCount" value="${p.requiredCount??0}"></td>
    <td><input class="pattern-number" type="number" min="0" data-k="regularQualifiedRequired" value="${p.regularQualifiedRequired??0}"></td>
    <td><input type="checkbox" data-k="active" ${p.active?'checked':''}></td>
    <td><button class="danger" data-del-pattern>削除</button></td>
  </tr>`).join('')}</tbody></table>`;
  root.querySelectorAll('input').forEach(el=>el.addEventListener('change',e=>{
    const p=db.patterns.find(x=>x.id===e.target.closest('tr').dataset.id); const k=e.target.dataset.k;
    p[k]=e.target.type==='checkbox'?e.target.checked:(e.target.type==='number'?Number(e.target.value):e.target.value);
    syncStaffPatternRefs();save();renderStaff();renderMonthlyInputs();
  }));
  root.querySelectorAll('[data-del-pattern]').forEach(b=>b.addEventListener('click',e=>{
    const id=e.target.closest('tr').dataset.id;
    if(db.staff.some(s=>s.defaultPatternId===id||s.allowedPatternIds?.includes(id))){alert('このパターンを参照しているスタッフがいるため削除できません。先にスタッフ側の参照を外してください。');return}
    db.patterns=db.patterns.filter(p=>p.id!==id);save();renderPatterns();
  }));
}
function syncStaffPatternRefs(){const ids=new Set(db.patterns.map(p=>p.id));db.staff.forEach(s=>{s.allowedPatternIds=(s.allowedPatternIds||[]).filter(id=>ids.has(id));if(!ids.has(s.defaultPatternId))s.defaultPatternId=null})}

function renderStaff(){
  const root=$('#staffCards');
  if(!db.staff.length){root.innerHTML='<div class="note">まだスタッフが登録されていません。「＋ スタッフ追加」から登録してください。</div>';return}
  root.innerHTML=db.staff.map(s=>`<article class="staff-card" data-id="${s.id}">
    <div class="staff-card-head"><strong>${esc(s.name||'名称未設定')} <span class="small">${esc(s.id)}</span></strong><button class="danger" data-del-staff>削除</button></div>
    <div class="staff-card-grid">
      <label class="field">氏名<input data-k="name" value="${esc(s.name)}"></label>
      <label class="field">区分<select data-k="employmentType">${EMPLOYMENT_TYPES.map(t=>`<option ${s.employmentType===t?'selected':''}>${t}</option>`).join('')}</select></label>
      <label class="field">資格<select data-k="qualified"><option value="true" ${s.qualified?'selected':''}>有資格</option><option value="false" ${!s.qualified?'selected':''}>無資格</option></select></label>
      <label class="field">週休数（主に非正規）<input type="number" min="0" max="7" data-k="weeklyDaysOff" value="${s.weeklyDaysOff??''}" placeholder="例: 2"></label>
      <label class="field">固定休曜日<input data-k="fixedOffWeekdays" value="${esc((s.fixedOffWeekdays||[]).join(','))}" placeholder="水,日"></label>
      <label class="field">基本勤務<select data-k="defaultPatternId"><option value="">指定なし</option>${db.patterns.filter(p=>p.active).map(p=>`<option value="${p.id}" ${s.defaultPatternId===p.id?'selected':''}>${esc(p.name)} (${p.start}-${p.end})</option>`).join('')}</select></label>
      <div class="field wide"><span>勤務可能パターン</span><div class="check-grid">${db.patterns.filter(p=>p.active).map(p=>`<label class="check-chip"><input type="checkbox" data-pattern="${p.id}" ${(s.allowedPatternIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</div></div>
      <label class="field wide">メモ<textarea rows="2" data-k="notes" placeholder="恒常的な勤務条件のみ">${esc(s.notes||'')}</textarea></label>
    </div>
  </article>`).join('');
  root.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const k=e.target.dataset.k;let v=e.target.value;
    if(k==='qualified')v=v==='true';if(k==='weeklyDaysOff')v=v===''?null:Number(v);if(k==='fixedOffWeekdays')v=parseWeekdays(v);if(k==='defaultPatternId')v=v||null;s[k]=v;save();renderStaff();renderMonthlyInputs();
  }));
  root.querySelectorAll('[data-pattern]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const id=e.target.dataset.pattern;const set=new Set(s.allowedPatternIds||[]);e.target.checked?set.add(id):set.delete(id);s.allowedPatternIds=[...set];save();
  }));
  root.querySelectorAll('[data-del-staff]').forEach(b=>b.addEventListener('click',e=>{const id=e.target.closest('.staff-card').dataset.id;db.staff=db.staff.filter(s=>s.id!==id);delete dayState[id];delete shiftState[id];Object.values(db.monthly).forEach(m=>{delete m.requestedOff?.[id];delete m.fixedOff?.[id]});save();renderStaff();renderMonthlyInputs();renderOff();renderShift()}));
}

function renderMonthlyInputs(){
  const root=$('#monthlyInputs');const m=currentMonthData();
  if(!db.staff.length){root.innerHTML='<div class="note">スタッフを登録すると、ここに月次入力欄が表示されます。</div>';return}
  root.innerHTML=`<table><thead><tr><th class="name">職員</th><th>区分</th><th>希望休</th><th>今月だけの固定休</th></tr></thead><tbody>${db.staff.filter(s=>s.active!==false).map(s=>`<tr data-id="${s.id}"><td class="name">${esc(s.name||s.id)}</td><td>${esc(s.employmentType)}</td><td><input data-k="requestedOff" value="${esc((m.requestedOff[s.id]||[]).join(','))}" placeholder="3,12,25"></td><td><input data-k="fixedOff" value="${esc((m.fixedOff[s.id]||[]).join(','))}" placeholder="5,18"></td></tr>`).join('')}</tbody></table>`;
  root.querySelectorAll('input').forEach(el=>el.addEventListener('change',e=>{const id=e.target.closest('tr').dataset.id;const nums=parseNums(e.target.value);if(e.target.dataset.k==='requestedOff')m.requestedOff[id]=nums;else m.fixedOff[id]=nums;save()}));
}

function generateOff(){
  const n=daysInMonth(),m=currentMonthData();dayState={};shiftState={};
  const dailyOff=Object.fromEntries(Array.from({length:n},(_,i)=>[i+1,0]));
  db.staff.filter(s=>s.active!==false).forEach(s=>{
    dayState[s.id]={};const fixedWd=new Set(s.fixedOffWeekdays||[]),req=new Set(m.requestedOff[s.id]||[]),fixed=new Set(m.fixedOff[s.id]||[]);
    for(let d=1;d<=n;d++){const wd=WEEKDAYS[dateFor(d).getDay()];let st='work';if(isClosed(d))st='closed';else if(fixedWd.has(wd)||fixed.has(d)||req.has(d))st='off';dayState[s.id][d]=st;if(st!=='work')dailyOff[d]++}
  });
  const regularTarget=Number($('#regularMonthlyOff').value)||0;
  db.staff.filter(s=>s.active!==false&&s.employmentType==='正規保育士').forEach(s=>fillRegularDaysOff(s,regularTarget,dailyOff,n));
  db.staff.filter(s=>s.active!==false&&s.employmentType!=='正規保育士'&&Number.isFinite(s.weeklyDaysOff)&&s.weeklyDaysOff!==null).forEach(s=>fillWeeklyDaysOff(s,dailyOff,n));
  save();renderOff();renderShift();
}
function fillRegularDaysOff(s,target,dailyOff,n){
  let count=Object.values(dayState[s.id]).filter(x=>x!=='work').length;const candidates=[];
  for(let d=1;d<=n;d++)if(dayState[s.id][d]==='work')candidates.push(d);
  while(count<target&&candidates.length){candidates.sort((a,b)=>scoreOffDay(a,s,dailyOff)-scoreOffDay(b,s,dailyOff));const d=candidates.shift();dayState[s.id][d]='off';dailyOff[d]++;count++}
}
function fillWeeklyDaysOff(s,dailyOff,n){
  const targetPerWeek=Math.max(0,Number(s.weeklyDaysOff)||0);if(!targetPerWeek)return;
  for(let start=1;start<=n;start+=7){const end=Math.min(n,start+6);let off=0,cands=[];for(let d=start;d<=end;d++){if(dayState[s.id][d]!=='work')off++;else cands.push(d)}while(off<targetPerWeek&&cands.length){cands.sort((a,b)=>scoreOffDay(a,s,dailyOff)-scoreOffDay(b,s,dailyOff));const d=cands.shift();dayState[s.id][d]='off';dailyOff[d]++;off++}}
}
function scoreOffDay(d,s,dailyOff){
  const prev=dayState[s.id]?.[d-1],next=dayState[s.id]?.[d+1];let score=dailyOff[d]*5+Math.random();if(prev==='off'||next==='off')score-=1;return score;
}

function renderOff(){
  const root=$('#offTable');const warn=$('#offWarnings');warn.innerHTML='';
  if(!Object.keys(dayState).length){root.innerHTML='<div class="note">「休みを自動配置」を押すと表が作成されます。</div>';return}
  const n=daysInMonth();const staff=db.staff.filter(s=>s.active!==false);
  root.innerHTML=`<table><thead><tr><th class="name">職員</th>${Array.from({length:n},(_,i)=>`<th>${i+1}<br>${WEEKDAYS[dateFor(i+1).getDay()]}</th>`).join('')}</tr></thead><tbody>${staff.map(s=>`<tr><td class="name">${esc(s.name||s.id)}</td>${Array.from({length:n},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d]||'work',req=(currentMonthData().requestedOff[s.id]||[]).includes(d);return `<td class="${st} ${req?'requested':''}" data-off-cell data-id="${s.id}" data-day="${d}">${st==='closed'?'休園':st==='off'?'休':'勤'}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  root.querySelectorAll('[data-off-cell]').forEach(td=>td.addEventListener('click',()=>{const id=td.dataset.id,d=Number(td.dataset.day);if(isClosed(d))return;dayState[id][d]=dayState[id][d]==='off'?'work':'off';delete shiftState[id]?.[d];save();renderOff();renderShift()}));
  const unmet=db.staff.filter(s=>s.employmentType==='正規保育士').map(s=>{const c=Object.values(dayState[s.id]||{}).filter(x=>x!=='work').length;return c===Number($('#regularMonthlyOff').value)?null:`${s.name||s.id}: 休日${c}日`}).filter(Boolean);
  warn.innerHTML=unmet.length?`<div class="warn">正規職員の休日数確認: ${unmet.map(esc).join(' / ')}</div>`:'<div class="ok">休日生成済み。必要ならセルを手修正してください。</div>';
}

function generateShifts(){
  if(!Object.keys(dayState).length){alert('先に休日を生成してください。');return}
  shiftState={};db.staff.filter(s=>s.active!==false).forEach(s=>shiftState[s.id]={});
  const n=daysInMonth();const maxEdge=Number($('#edgeShiftMax').value)||3;const edgeCounts={};db.staff.forEach(s=>edgeCounts[s.id]={});
  for(let d=1;d<=n;d++){
    if(isClosed(d))continue;
    const working=db.staff.filter(s=>s.active!==false&&dayState[s.id]?.[d]==='work');
    const unassigned=new Set(working.map(s=>s.id));
    working.filter(s=>s.defaultPatternId).forEach(s=>{const p=db.patterns.find(p=>p.id===s.defaultPatternId&&p.active);if(p){shiftState[s.id][d]=p.id;unassigned.delete(s.id)}});
    for(const p of db.patterns.filter(p=>p.active&&p.requiredCount>0)){
      let current=working.filter(s=>shiftState[s.id]?.[d]===p.id).length;
      while(current<p.requiredCount){
        const candidates=working.filter(s=>unassigned.has(s.id)&&eligibleForPattern(s,p,edgeCounts,maxEdge));
        candidates.sort((a,b)=>candidateScore(a,p,edgeCounts)-candidateScore(b,p,edgeCounts));
        const s=candidates[0];if(!s)break;shiftState[s.id][d]=p.id;unassigned.delete(s.id);edgeCounts[s.id][p.id]=(edgeCounts[s.id][p.id]||0)+1;current++;
      }
    }
  }
  save();renderShift();
}
function eligibleForPattern(s,p,edgeCounts,maxEdge){
  if(!(s.allowedPatternIds||[]).includes(p.id))return false;
  if(p.regularQualifiedRequired>0&&!(s.employmentType==='正規保育士'&&s.qualified))return false;
  if(['P01','P07'].includes(p.id)&&(edgeCounts[s.id]?.[p.id]||0)>=maxEdge)return false;
  return true;
}
function candidateScore(s,p,edgeCounts){
  let score=(edgeCounts[s.id]?.[p.id]||0)*20+Math.random();
  if(s.employmentType!=='正規保育士')score+=2;
  return score;
}

function renderShift(){
  const root=$('#shiftTable'),warn=$('#shiftWarnings');warn.innerHTML='';
  if(!Object.keys(shiftState).length){root.innerHTML='<div class="note">休日調整後に「当番を自動配置」を押してください。</div>';return}
  const n=daysInMonth(),staff=db.staff.filter(s=>s.active!==false);const problems=[];
  for(let d=1;d<=n;d++){
    if(isClosed(d))continue;
    for(const p of db.patterns.filter(p=>p.active&&p.requiredCount>0)){
      const assigned=staff.filter(s=>shiftState[s.id]?.[d]===p.id);if(assigned.length<p.requiredCount)problems.push(`${d}日 ${p.name}: ${p.requiredCount-assigned.length}名不足`);
      if(p.regularQualifiedRequired>0){const rq=assigned.filter(s=>s.employmentType==='正規保育士'&&s.qualified).length;if(rq<p.regularQualifiedRequired)problems.push(`${d}日 ${p.name}: 正規有資格者${p.regularQualifiedRequired-rq}名不足`)}
    }
    const at830=staff.filter(s=>{if(dayState[s.id]?.[d]!=='work')return false;const pid=shiftState[s.id]?.[d]||s.defaultPatternId;const p=db.patterns.find(x=>x.id===pid);return p&&timeMin(p.start)<=510&&timeMin(p.end)>510}).length;
    if(at830<8)problems.push(`${d}日 8:30時点: ${8-at830}名不足`);
  }
  warn.innerHTML=problems.length?`<div class="warn">${problems.slice(0,30).map(esc).join('<br>')}${problems.length>30?`<br>…ほか${problems.length-30}件`:''}</div>`:'<div class="ok">現在の登録条件では必要人数チェックを通過しています。</div>';
  root.innerHTML=`<table><thead><tr><th class="name">職員</th>${Array.from({length:n},(_,i)=>`<th>${i+1}<br>${WEEKDAYS[dateFor(i+1).getDay()]}</th>`).join('')}</tr></thead><tbody>${staff.map(s=>`<tr><td class="name">${esc(s.name||s.id)}</td>${Array.from({length:n},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d];if(st==='closed')return '<td class="closed">休園</td>';if(st==='off')return '<td class="off">休</td>';const pid=shiftState[s.id]?.[d],p=db.patterns.find(x=>x.id===pid);return `<td class="work ${['P01','P07'].includes(pid)?'shift-edge':''}">${p?esc(p.name):'未割当'}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
}

function exportData(){
  save();const payload={schemaVersion:2,exportedAt:new Date().toISOString(),patterns:db.patterns,staff:db.staff,monthly:db.monthly};downloadBlob(JSON.stringify(payload,null,2),'childcare-shift-data.json','application/json');
}
function importData(file){
  const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!Array.isArray(x.patterns)||!Array.isArray(x.staff))throw new Error('patterns / staff がありません');db.patterns=x.patterns;db.staff=x.staff;db.monthly=x.monthly||{};dayState={};shiftState={};save();renderAll();alert('JSONを読み込みました。')}catch(e){alert('読み込み失敗: '+e.message)}};r.readAsText(file);
}
function exportCsv(){
  if(!Object.keys(dayState).length)return;const n=daysInMonth(),rows=[['職員',...Array.from({length:n},(_,i)=>String(i+1))]];db.staff.filter(s=>s.active!==false).forEach(s=>rows.push([s.name||s.id,...Array.from({length:n},(_,i)=>{const d=i+1,st=dayState[s.id]?.[d];if(st==='closed')return '休園';if(st==='off')return '休';const p=db.patterns.find(x=>x.id===shiftState[s.id]?.[d]);return p?.name||'未割当'})]));const csv='\uFEFF'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');downloadBlob(csv,`${monthInfo().key}-shift.csv`,'text/csv;charset=utf-8');
}
function downloadBlob(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

function renderAll(){renderPatterns();renderStaff();renderMonthlyInputs();renderOff();renderShift()}

function bind(){
  setupTabs();
  $('#addPattern').addEventListener('click',()=>{const next=String(Math.max(0,...db.patterns.map(p=>Number(String(p.id).replace(/\D/g,''))||0))+1).padStart(2,'0');db.patterns.push({id:'P'+next,name:'新規',start:'09:00',end:'17:00',workMinutes:420,breakMinutes:60,requiredCount:0,regularQualifiedRequired:0,active:true});save();renderPatterns();renderStaff()});
  $('#addStaff').addEventListener('click',()=>{db.staff.push(defaultStaff());save();renderStaff();renderMonthlyInputs()});
  ['month','regularMonthlyOff','holidays','edgeShiftMax'].forEach(id=>$('#'+id).addEventListener('change',()=>{save();renderMonthlyInputs();renderOff();renderShift()}));
  $('#generateOff').addEventListener('click',generateOff);$('#generateShifts').addEventListener('click',generateShifts);$('#clearSchedule').addEventListener('click',()=>{dayState={};shiftState={};save();renderOff();renderShift()});
  $('#exportData').addEventListener('click',exportData);$('#importData').addEventListener('change',e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value=''});$('#exportCsv').addEventListener('click',exportCsv);
}

load();bind();renderAll();
