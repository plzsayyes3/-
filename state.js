// Canonical application state, schema migration and validation.
// Keep this file free of scheduling algorithms and GitHub API code.

const STORAGE_KEY='childcareShiftPocV4';
const LEGACY_STORAGE_KEYS=['childcareShiftPocV3','childcareShiftPocV2'];
const SCHEMA_VERSION=4;
const WEEKDAYS=['日','月','火','水','木','金','土'];
const EMPLOYMENT_TYPES=['正規保育士','非正規保育士','派遣保育士','非正規保育補助','正規看護師','非正規看護師','非正規事務員'];

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
function finiteOrNull(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function monthInfo(){const v=$('#month')?.value;if(!v){const d=new Date();return {year:d.getFullYear(),month:d.getMonth()+1,key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}}const [year,month]=v.split('-').map(Number);return {year,month,key:v}}
function daysInMonthFor(year,month){return new Date(year,month,0).getDate()}
function daysInMonth(){const {year,month}=monthInfo();return daysInMonthFor(year,month)}
function dateFor(day){const {year,month}=monthInfo();return new Date(year,month-1,day)}
function activeStaff(){return db.staff.filter(s=>s.active!==false)}
function activePatterns(){return db.patterns.filter(p=>p.active!==false)}
function isRegularStaff(s){return String(s?.employmentType||'').startsWith('正規')}
function isRegularChildcareQualified(s){return s?.employmentType==='正規保育士'&&(s.qualifications||[]).includes('保育士')}

function normalizePattern(source={}){
  return {
    ...source,
    id:String(source.id||'').trim(),
    name:String(source.name||source.id||'').trim(),
    start:String(source.start||''),
    end:String(source.end||''),
    workMinutes:Number(source.workMinutes||0),
    breakMinutes:Number(source.breakMinutes||0),
    requiredCount:Number(source.requiredCount||0),
    regularQualifiedRequired:Number(source.regularQualifiedRequired||0),
    active:source.active!==false,
    ...(source.category?{category:String(source.category)}:{})
  };
}

function inferRole(s){
  if(s.role)return String(s.role);
  const t=String(s.employmentType||'');
  if(t.includes('看護師'))return '看護師';
  if(t.includes('事務'))return '事務員';
  return '保育士';
}

function normalizeStaff(source={}){
  const role=inferRole(source);
  let qualifications;
  if(Array.isArray(source.qualifications))qualifications=[...new Set(source.qualifications.map(String).filter(Boolean))];
  else if(source.qualified===true&&role==='保育士')qualifications=['保育士'];
  else if(source.qualified===true&&role==='看護師')qualifications=['看護師'];
  else qualifications=[];
  return {
    ...source,
    id:String(source.id||uid('S')),
    name:String(source.name||''),
    employmentType:String(source.employmentType||'正規保育士'),
    role,
    qualifications,
    // legacy compatibility: `qualified` now means childcare qualification only.
    qualified:qualifications.includes('保育士'),
    weeklyDaysOff:finiteOrNull(source.weeklyDaysOff),
    weeklyWorkDays:finiteOrNull(source.weeklyWorkDays),
    fixedOffWeekdays:Array.isArray(source.fixedOffWeekdays)?source.fixedOffWeekdays.filter(x=>WEEKDAYS.includes(x)):parseWeekdays(source.fixedOffWeekdays||''),
    allowedPatternIds:Array.isArray(source.allowedPatternIds)?[...new Set(source.allowedPatternIds.map(String))]:[],
    preferredPatternIds:Array.isArray(source.preferredPatternIds)?[...new Set(source.preferredPatternIds.map(String))]:[],
    defaultPatternId:source.defaultPatternId?String(source.defaultPatternId):null,
    shiftPolicy:['flexible','prefer-fixed','fixed'].includes(source.shiftPolicy)?source.shiftPolicy:'flexible',
    requestedOffLimit:finiteOrNull(source.requestedOffLimit),
    active:source.active!==false,
    notes:String(source.notes||'')
  };
}

function defaultStaff(){
  return normalizeStaff({
    id:uid('S'),name:'',employmentType:'正規保育士',role:'保育士',qualifications:['保育士'],
    weeklyDaysOff:null,weeklyWorkDays:null,fixedOffWeekdays:[],
    allowedPatternIds:activePatterns().map(p=>p.id),preferredPatternIds:[],
    defaultPatternId:null,shiftPolicy:'flexible',requestedOffLimit:null,active:true,notes:''
  });
}

function defaultMonthData(){return {requestedOff:{},fixedOff:{},locked:false,regularMonthlyOff:9,holidays:[],edgeShiftMax:3,dayState:{},shiftState:{}}}
function normalizeMonth(source={}){
  return {
    ...source,
    requestedOff:source.requestedOff&&typeof source.requestedOff==='object'?source.requestedOff:{},
    fixedOff:source.fixedOff&&typeof source.fixedOff==='object'?source.fixedOff:{},
    locked:source.locked===true,
    regularMonthlyOff:finiteOrNull(source.regularMonthlyOff)??9,
    holidays:Array.isArray(source.holidays)?source.holidays.map(Number).filter(Number.isInteger):parseNums(source.holidays||''),
    edgeShiftMax:finiteOrNull(source.edgeShiftMax)??3,
    dayState:source.dayState&&typeof source.dayState==='object'?source.dayState:{},
    shiftState:source.shiftState&&typeof source.shiftState==='object'?source.shiftState:{}
  };
}

function currentMonthData(){
  const key=monthInfo().key;
  if(!db.monthly[key])db.monthly[key]=defaultMonthData();
  db.monthly[key]=normalizeMonth(db.monthly[key]);
  return db.monthly[key];
}
function isClosed(day){const m=currentMonthData();return dateFor(day).getDay()===0||m.holidays.includes(day)}
function loadMonthState(){
  const m=currentMonthData();dayState=structuredClone(m.dayState||{});shiftState=structuredClone(m.shiftState||{});
  if($('#regularMonthlyOff'))$('#regularMonthlyOff').value=m.regularMonthlyOff;
  if($('#holidays'))$('#holidays').value=(m.holidays||[]).join(',');
  if($('#edgeShiftMax'))$('#edgeShiftMax').value=m.edgeShiftMax;
  if(typeof updateLockUi==='function')updateLockUi();
}
function persistMonthState(){
  const m=currentMonthData();m.dayState=structuredClone(dayState);m.shiftState=structuredClone(shiftState);
  if($('#regularMonthlyOff'))m.regularMonthlyOff=Number($('#regularMonthlyOff').value)||0;
  if($('#holidays'))m.holidays=parseNums($('#holidays').value).filter(d=>d<=daysInMonth());
  if($('#edgeShiftMax'))m.edgeShiftMax=Math.max(1,Number($('#edgeShiftMax').value)||3);
}
function save(){db.schemaVersion=SCHEMA_VERSION;persistMonthState();localStorage.setItem(STORAGE_KEY,JSON.stringify({schemaVersion:SCHEMA_VERSION,db}))}

function migrateLoaded(x){
  const source=x?.db?x.db:x;
  if(!source||typeof source!=='object')throw new Error('JSON形式を認識できません。');
  const out={
    schemaVersion:SCHEMA_VERSION,
    patterns:(Array.isArray(source.patterns)?source.patterns:structuredClone(DEFAULT_PATTERNS)).map(normalizePattern),
    staff:(Array.isArray(source.staff)?source.staff:[]).map(normalizeStaff),
    monthly:{}
  };
  if(source.monthly&&typeof source.monthly==='object')Object.entries(source.monthly).forEach(([key,m])=>{out.monthly[key]=normalizeMonth(m)});
  // v2 compatibility.
  if(source.settings?.month){
    const key=source.settings.month;out.monthly[key]=normalizeMonth({...out.monthly[key],regularMonthlyOff:Number(source.settings.regularMonthlyOff)||9,holidays:parseNums(source.settings.holidays||''),edgeShiftMax:Number(source.settings.edgeShiftMax)||3});
    if(x?.dayState)out.monthly[key].dayState=x.dayState;
    if(x?.shiftState)out.monthly[key].shiftState=x.shiftState;
  }
  return out;
}
function load(){
  const keys=[STORAGE_KEY,...LEGACY_STORAGE_KEYS];
  const raw=keys.map(k=>localStorage.getItem(k)).find(Boolean);
  if(raw){try{db=migrateLoaded(JSON.parse(raw))}catch(e){console.warn('Local data migration failed',e)}}
  if(!db.patterns.length)db.patterns=structuredClone(DEFAULT_PATTERNS);
  const d=new Date();if($('#month'))$('#month').value=Object.keys(db.monthly)[0]||`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  loadMonthState();save();
}

function validation(){
  const errors=[],warnings=[];
  const patternIds=db.patterns.map(p=>String(p.id||'').trim());
  [...new Set(patternIds.filter((id,i)=>id&&patternIds.indexOf(id)!==i))].forEach(id=>errors.push(`勤務パターンID「${id}」が重複しています。`));
  db.patterns.forEach((p,i)=>{
    const label=p.id||`#${i+1}`;const start=timeMin(p.start),end=timeMin(p.end);
    if(!p.id)errors.push(`勤務パターン${i+1}にIDがありません。`);
    if(start==null||end==null||end<=start)errors.push(`${label}: 開始・終了時刻が不正です。`);
    if(!Number.isFinite(Number(p.requiredCount))||Number(p.requiredCount)<0)errors.push(`${label}: 必要人数が不正です。`);
    if(!Number.isFinite(Number(p.regularQualifiedRequired))||Number(p.regularQualifiedRequired)<0||Number(p.regularQualifiedRequired)>Number(p.requiredCount))errors.push(`${label}: 正規保育士資格者の必須人数が不正です。`);
    if(!Number.isFinite(Number(p.workMinutes))||Number(p.workMinutes)<=0)warnings.push(`${label}: 実働分が0以下または不正です。`);
    if(!Number.isFinite(Number(p.breakMinutes))||Number(p.breakMinutes)<0)errors.push(`${label}: 休憩分が不正です。`);
  });
  const validIds=new Set(db.patterns.map(p=>p.id));
  const staffIds=db.staff.map(s=>String(s.id||'').trim());
  [...new Set(staffIds.filter((id,i)=>id&&staffIds.indexOf(id)!==i))].forEach(id=>errors.push(`職員ID「${id}」が重複しています。`));
  activeStaff().forEach(s=>{
    const name=s.name||s.id;
    if(!String(s.id||'').trim())errors.push('職員IDが未入力です。');
    if(!String(s.name||'').trim())warnings.push(`${name}: 氏名が未入力です。`);
    if(!['flexible','prefer-fixed','fixed'].includes(s.shiftPolicy))errors.push(`${name}: 勤務ポリシーが不正です。`);
    if(s.shiftPolicy==='fixed'&&!s.defaultPatternId)errors.push(`${name}: 固定勤務なのに基本勤務が未設定です。`);
    if(s.defaultPatternId&&!validIds.has(s.defaultPatternId))errors.push(`${name}: 基本勤務 ${s.defaultPatternId} が存在しません。`);
    if(s.defaultPatternId&&!(s.allowedPatternIds||[]).includes(s.defaultPatternId))errors.push(`${name}: 基本勤務が勤務可能パターンに含まれていません。`);
    (s.allowedPatternIds||[]).filter(id=>!validIds.has(id)).forEach(id=>errors.push(`${name}: 勤務可能パターン ${id} が存在しません。`));
    (s.preferredPatternIds||[]).filter(id=>!(s.allowedPatternIds||[]).includes(id)).forEach(id=>warnings.push(`${name}: 優先勤務 ${id} は勤務可能パターン外です。`));
    if(!(s.allowedPatternIds||[]).length)warnings.push(`${name}: 勤務可能パターンがありません。`);
    if(s.weeklyWorkDays!=null&&(s.weeklyWorkDays<0||s.weeklyWorkDays>7))errors.push(`${name}: 週勤務日数は0〜7で設定してください。`);
    if(s.weeklyDaysOff!=null&&(s.weeklyDaysOff<0||s.weeklyDaysOff>7))errors.push(`${name}: 週休数は0〜7で設定してください。`);
    if(s.weeklyWorkDays!=null&&s.weeklyDaysOff!=null&&s.weeklyWorkDays+s.weeklyDaysOff!==7)warnings.push(`${name}: 週勤務日数と週休数の合計が7ではありません。両方設定する場合は意図を確認してください。`);
    if(s.requestedOffLimit!=null&&s.requestedOffLimit<0)errors.push(`${name}: 希望休上限は0以上で設定してください。`);
  });
  const m=currentMonthData(),max=daysInMonth();
  if(!Number.isFinite(Number(m.regularMonthlyOff))||m.regularMonthlyOff<0||m.regularMonthlyOff>max)errors.push(`正規職員の月休日日数は0〜${max}で設定してください。`);
  if(!Number.isFinite(Number(m.edgeShiftMax))||m.edgeShiftMax<1||m.edgeShiftMax>max)errors.push(`6:45 / 11:30 各上限は1〜${max}で設定してください。`);
  [...Object.entries(m.requestedOff),...Object.entries(m.fixedOff)].forEach(([id,days])=>{
    const s=db.staff.find(x=>x.id===id);if(!s)warnings.push(`月次データに削除済みスタッフ ${id} の情報が残っています。`);
    (days||[]).filter(d=>!Number.isInteger(Number(d))||Number(d)<1||Number(d)>max).forEach(d=>warnings.push(`${id}: ${d}日は対象月に存在しません。`));
    if(s?.requestedOffLimit!=null&&(m.requestedOff[id]||[]).length>s.requestedOffLimit)warnings.push(`${s.name||s.id}: 希望休が上限${s.requestedOffLimit}日を超えています。`);
  });
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}

function syncStaffPatternRefs(){
  const ids=new Set(db.patterns.map(p=>p.id));
  db.staff.forEach(s=>{
    s.preferredPatternIds=(s.preferredPatternIds||[]).filter(id=>(s.allowedPatternIds||[]).includes(id));
    if(s.defaultPatternId&&!ids.has(s.defaultPatternId))s.defaultPatternId=null;
  });
}
