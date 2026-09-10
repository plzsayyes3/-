// CSV import helpers for childcare-shift
// CSV values that contain multiple items use | as the separator.

function parseCsvText(text){
  const src=String(text||'').replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(quoted){
      if(c==='"'){
        if(src[i+1]==='"'){field+='"';i++;}else quoted=false;
      }else field+=c;
    }else{
      if(c==='"')quoted=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
      else if(c==='\r'){}
      else field+=c;
    }
  }
  row.push(field);if(row.some(v=>String(v).trim()!==''))rows.push(row);
  if(!rows.length)return [];
  const headers=rows.shift().map(h=>String(h).trim());
  return rows.filter(r=>r.some(v=>String(v).trim()!=='')).map((r,idx)=>{
    const obj={_row:idx+2};headers.forEach((h,i)=>obj[h]=r[i]??'');return obj;
  });
}

function splitList(v){return String(v||'').split(/[|｜;]/).map(x=>x.trim()).filter(Boolean)}
function nullableNumber(v){return String(v??'').trim()===''?null:Number(v)}
function parseBool(v,defaultValue=true){
  const s=String(v??'').trim().toLowerCase();if(!s)return defaultValue;
  if(['true','1','yes','y','on','有効','あり'].includes(s))return true;
  if(['false','0','no','n','off','無効','なし'].includes(s))return false;
  return defaultValue;
}
function csvMessage(kind,count){const el=$('#csvImportStatus');if(el)el.innerHTML=`<div class="ok">${esc(kind)}: ${count}件を読み込みました。</div>`}
function csvError(e){const el=$('#csvImportStatus');if(el)el.innerHTML=`<div class="error">${esc(e.message||e)}</div>`;else alert(e.message||e)}

async function importStaffCsv(file){
  const rows=parseCsvText(await file.text());if(!rows.length)throw new Error('職員CSVにデータ行がありません。');
  const next=[];const errors=[];
  rows.forEach(r=>{
    const id=String(r.id||'').trim();const name=String(r.name||'').trim();
    if(!id)errors.push(`${r._row}行目: id が必要です。`);if(!name)errors.push(`${r._row}行目: name が必要です。`);
    const employmentType=String(r.employmentType||'正規保育士').trim();
    const role=String(r.role||'').trim()||(employmentType.includes('看護師')?'看護師':employmentType.includes('事務')?'事務員':'保育士');
    const qualifications=splitList(r.qualifications);
    const weeklyWorkDays=nullableNumber(r.weeklyWorkDays);const weeklyDaysOff=nullableNumber(r.weeklyDaysOff);
    if(weeklyWorkDays!=null&&(weeklyWorkDays<0||weeklyWorkDays>7))errors.push(`${r._row}行目: weeklyWorkDays は0〜7です。`);
    if(weeklyDaysOff!=null&&(weeklyDaysOff<0||weeklyDaysOff>7))errors.push(`${r._row}行目: weeklyDaysOff は0〜7です。`);
    const shiftPolicy=String(r.shiftPolicy||'flexible').trim();
    if(!['flexible','prefer-fixed','fixed'].includes(shiftPolicy))errors.push(`${r._row}行目: shiftPolicy が不正です。`);
    next.push({
      id,name,employmentType,role,qualifications,qualified:qualifications.includes('保育士'),
      weeklyWorkDays,weeklyDaysOff:weeklyDaysOff!=null?weeklyDaysOff:(weeklyWorkDays!=null?Math.max(0,7-weeklyWorkDays):null),
      fixedOffWeekdays:splitList(r.fixedOffWeekdays),allowedPatternIds:splitList(r.allowedPatternIds),
      preferredPatternIds:splitList(r.preferredPatternIds),defaultPatternId:String(r.defaultPatternId||'').trim()||null,
      shiftPolicy,requestedOffLimit:nullableNumber(r.requestedOffLimit),active:parseBool(r.active,true),notes:String(r.notes||'')
    });
  });
  const ids=next.map(x=>x.id);const dup=[...new Set(ids.filter((id,i)=>id&&ids.indexOf(id)!==i))];dup.forEach(id=>errors.push(`CSV内で職員ID ${id} が重複しています。`));
  if(errors.length)throw new Error(errors.join('\n'));
  next.forEach(s=>{if(!EMPLOYMENT_TYPES.includes(s.employmentType))EMPLOYMENT_TYPES.push(s.employmentType);const i=db.staff.findIndex(x=>x.id===s.id);if(i>=0)db.staff[i]=s;else db.staff.push(s)});
  save();renderAll();csvMessage('職員マスタ',next.length);
}

async function importPatternCsv(file){
  const rows=parseCsvText(await file.text());if(!rows.length)throw new Error('勤務パターンCSVにデータ行がありません。');
  const next=[];const errors=[];
  rows.forEach(r=>{
    const id=String(r.id||'').trim();if(!id)errors.push(`${r._row}行目: id が必要です。`);
    const start=String(r.start||'').trim(),end=String(r.end||'').trim();
    if(timeMin(start)==null||timeMin(end)==null||timeMin(end)<=timeMin(start))errors.push(`${r._row}行目: start/end が不正です。`);
    const requiredCount=Number(r.requiredCount||0),regularQualifiedRequired=Number(r.regularQualifiedRequired||0);
    if(requiredCount<0||regularQualifiedRequired<0||regularQualifiedRequired>requiredCount)errors.push(`${r._row}行目: 必要人数の設定が不正です。`);
    next.push({id,name:String(r.name||id),start,end,workMinutes:Number(r.workMinutes||0),breakMinutes:Number(r.breakMinutes||0),requiredCount,regularQualifiedRequired,active:parseBool(r.active,true),category:String(r.category||'').trim()||undefined});
  });
  const ids=next.map(x=>x.id);[...new Set(ids.filter((id,i)=>id&&ids.indexOf(id)!==i))].forEach(id=>errors.push(`CSV内で勤務パターンID ${id} が重複しています。`));
  if(errors.length)throw new Error(errors.join('\n'));
  next.forEach(p=>{const i=db.patterns.findIndex(x=>x.id===p.id);if(i>=0)db.patterns[i]=p;else db.patterns.push(p)});
  save();renderAll();csvMessage('勤務パターン',next.length);
}

function resolveStaffFromCsvRow(r){
  const id=String(r.staffId||'').trim();if(id)return db.staff.find(s=>s.id===id)||null;
  const name=String(r.staffName||'').trim();if(!name)return null;const hits=db.staff.filter(s=>s.name===name);return hits.length===1?hits[0]:null;
}

async function importMonthlyStaffCsv(file){
  const rows=parseCsvText(await file.text());if(!rows.length)throw new Error('月次・職員別CSVにデータ行がありません。');
  const updates=[];const errors=[];
  rows.forEach(r=>{
    const month=String(r.month||'').trim();if(!/^\d{4}-\d{2}$/.test(month)){errors.push(`${r._row}行目: month は YYYY-MM 形式です。`);return}
    const s=resolveStaffFromCsvRow(r);if(!s){errors.push(`${r._row}行目: staffId / staffName に一致する職員が見つかりません。`);return}
    if(db.monthly[month]?.locked){errors.push(`${r._row}行目: ${month} は休日確定済みです。確定解除後に読み込んでください。`);return}
    updates.push({month,staffId:s.id,requestedOff:splitList(r.requestedOff).map(Number).filter(Number.isInteger),fixedOff:splitList(r.fixedOff).map(Number).filter(Number.isInteger)});
  });
  if(errors.length)throw new Error(errors.join('\n'));
  updates.forEach(u=>{db.monthly[u.month]||={requestedOff:{},fixedOff:{},locked:false,regularMonthlyOff:9,holidays:[],edgeShiftMax:3,dayState:{},shiftState:{}};const m=db.monthly[u.month];m.requestedOff||={};m.fixedOff||={};m.requestedOff[u.staffId]=u.requestedOff;m.fixedOff[u.staffId]=u.fixedOff;m.dayState={};m.shiftState={}});
  loadMonthState();save();renderAll();csvMessage('月次・職員別条件',updates.length);
}

async function importMonthlySettingsCsv(file){
  const rows=parseCsvText(await file.text());if(!rows.length)throw new Error('月次・全体設定CSVにデータ行がありません。');
  const updates=[];const errors=[];
  rows.forEach(r=>{
    const month=String(r.month||'').trim();if(!/^\d{4}-\d{2}$/.test(month)){errors.push(`${r._row}行目: month は YYYY-MM 形式です。`);return}
    if(db.monthly[month]?.locked){errors.push(`${r._row}行目: ${month} は休日確定済みです。確定解除後に読み込んでください。`);return}
    updates.push({month,regularMonthlyOff:Number(r.regularMonthlyOff||0),holidays:splitList(r.holidays).map(Number).filter(Number.isInteger),edgeShiftMax:Number(r.edgeShiftMax||3)});
  });
  if(errors.length)throw new Error(errors.join('\n'));
  updates.forEach(u=>{db.monthly[u.month]||={requestedOff:{},fixedOff:{},locked:false,dayState:{},shiftState:{}};Object.assign(db.monthly[u.month],u,{dayState:{},shiftState:{}})});
  loadMonthState();save();renderAll();csvMessage('月次・全体設定',updates.length);
}

function bindCsvImports(){
  const bindings=[['importStaffCsv',importStaffCsv],['importPatternCsv',importPatternCsv],['importMonthlyStaffCsv',importMonthlyStaffCsv],['importMonthlySettingsCsv',importMonthlySettingsCsv]];
  bindings.forEach(([id,fn])=>{const el=$('#'+id);if(!el)return;el.addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await fn(f)}catch(err){csvError(err)}})});
}

bindCsvImports();
