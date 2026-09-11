// CSV import helpers. Multi-value cells use | (full-width ｜ and ; are also accepted).

function parseCsvText(text){
  const src=String(text||'').replace(/^\uFEFF/,'');const matrix=[];let row=[],field='',quoted=false;
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(quoted){if(c==='"'){if(src[i+1]==='"'){field+='"';i++}else quoted=false}else field+=c}
    else if(c==='"')quoted=true;
    else if(c===','){row.push(field);field=''}
    else if(c==='\n'){row.push(field);matrix.push(row);row=[];field=''}
    else if(c!=='\r')field+=c;
  }
  if(quoted)throw new Error('CSVの引用符が閉じていません。');
  row.push(field);if(row.some(v=>String(v).trim()!==''))matrix.push(row);
  if(!matrix.length)return {headers:[],rows:[]};
  const headers=matrix.shift().map(h=>String(h).trim());
  const duplicates=[...new Set(headers.filter((h,i)=>h&&headers.indexOf(h)!==i))];
  if(duplicates.length)throw new Error(`CSVヘッダーが重複しています: ${duplicates.join(', ')}`);
  const rows=matrix.filter(r=>r.some(v=>String(v).trim()!=='')).map((r,idx)=>{const obj={_row:idx+2};headers.forEach((h,i)=>{if(h)obj[h]=r[i]??''});return obj});
  return {headers,rows};
}
function requireHeaders(doc,required){const missing=required.filter(h=>!doc.headers.includes(h));if(missing.length)throw new Error(`CSVに必要な列がありません: ${missing.join(', ')}`)}
function splitList(v){return String(v||'').split(/[|｜;]/).map(x=>x.trim()).filter(Boolean)}
function nullableNumber(v){if(String(v??'').trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:NaN}
function parseBool(v,defaultValue=true){const s=String(v??'').trim().toLowerCase();if(!s)return defaultValue;if(['true','1','yes','y','on','有効','あり'].includes(s))return true;if(['false','0','no','n','off','無効','なし'].includes(s))return false;throw new Error(`真偽値を認識できません: ${v}`)}
function parseMonthKey(v,row){const month=String(v||'').trim();if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error(`${row}行目: month は YYYY-MM 形式です。`);return month}
function monthMaxDay(month){const [y,m]=month.split('-').map(Number);return daysInMonthFor(y,m)}
function parseDayList(value,month,row,label){const max=monthMaxDay(month),values=splitList(value).map(Number);const invalid=values.filter(d=>!Number.isInteger(d)||d<1||d>max);if(invalid.length)throw new Error(`${row}行目: ${label} に対象月外の日付があります: ${invalid.join(', ')}`);return [...new Set(values)].sort((a,b)=>a-b)}
function csvMessage(kind,count,next){const el=$('#csvImportStatus');if(el)el.innerHTML=`<div class="ok"><strong>${esc(kind)}: ${count}件を読み込みました。</strong>${next?`<br>${esc(next)}`:''}</div>`}
function csvError(e){const el=$('#csvImportStatus');if(el)el.innerHTML=`<div class="error"><strong>CSVを読み込めませんでした。</strong><br>${esc(e.message||e)}</div>`;else alert(e.message||e)}

async function importStaffCsv(file){
  const doc=parseCsvText(await file.text());requireHeaders(doc,['id','name']);if(!doc.rows.length)throw new Error('職員CSVにデータ行がありません。');
  const next=[],errors=[];
  doc.rows.forEach(r=>{
    try{
      const id=String(r.id||'').trim(),name=String(r.name||'').trim();if(!id)throw new Error(`${r._row}行目: id が必要です。`);if(!name)throw new Error(`${r._row}行目: name が必要です。`);
      const employmentType=String(r.employmentType||'正規保育士').trim();const role=String(r.role||'').trim()||(employmentType.includes('看護師')?'看護師':employmentType.includes('事務')?'事務員':'保育士');
      const qualifications=splitList(r.qualifications);const weeklyWorkDays=nullableNumber(r.weeklyWorkDays),weeklyDaysOff=nullableNumber(r.weeklyDaysOff),requestedOffLimit=nullableNumber(r.requestedOffLimit);
      if(Number.isNaN(weeklyWorkDays)||weeklyWorkDays!=null&&(weeklyWorkDays<0||weeklyWorkDays>7))throw new Error(`${r._row}行目: weeklyWorkDays は0〜7の数値です。`);
      if(Number.isNaN(weeklyDaysOff)||weeklyDaysOff!=null&&(weeklyDaysOff<0||weeklyDaysOff>7))throw new Error(`${r._row}行目: weeklyDaysOff は0〜7の数値です。`);
      if(Number.isNaN(requestedOffLimit)||requestedOffLimit!=null&&requestedOffLimit<0)throw new Error(`${r._row}行目: requestedOffLimit は0以上の数値です。`);
      const fixedOffWeekdays=splitList(r.fixedOffWeekdays);const invalidWd=fixedOffWeekdays.filter(x=>!WEEKDAYS.includes(x));if(invalidWd.length)throw new Error(`${r._row}行目: fixedOffWeekdays が不正です: ${invalidWd.join(', ')}`);
      const shiftPolicy=String(r.shiftPolicy||'flexible').trim();if(!['flexible','prefer-fixed','fixed'].includes(shiftPolicy))throw new Error(`${r._row}行目: shiftPolicy が不正です。`);
      next.push(normalizeStaff({id,name,employmentType,role,qualifications,weeklyWorkDays,weeklyDaysOff,fixedOffWeekdays,allowedPatternIds:splitList(r.allowedPatternIds),preferredPatternIds:splitList(r.preferredPatternIds),defaultPatternId:String(r.defaultPatternId||'').trim()||null,shiftPolicy,requestedOffLimit,active:parseBool(r.active,true),notes:String(r.notes||'')}));
    }catch(e){errors.push(e.message)}
  });
  const ids=next.map(x=>x.id);[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))].forEach(id=>errors.push(`CSV内で職員ID ${id} が重複しています。`));
  if(errors.length)throw new Error(errors.join('\n'));
  next.forEach(s=>{if(!EMPLOYMENT_TYPES.includes(s.employmentType))EMPLOYMENT_TYPES.push(s.employmentType);const i=db.staff.findIndex(x=>x.id===s.id);if(i>=0)db.staff[i]=s;else db.staff.push(s)});
  save();renderAll();csvMessage('職員マスタ',next.length,'「スタッフ」タブで内容を確認し、Privateへ保存してください。');
}

async function importPatternCsv(file){
  const doc=parseCsvText(await file.text());requireHeaders(doc,['id','start','end']);if(!doc.rows.length)throw new Error('勤務パターンCSVにデータ行がありません。');
  const next=[],errors=[];
  doc.rows.forEach(r=>{
    try{
      const id=String(r.id||'').trim();if(!id)throw new Error(`${r._row}行目: id が必要です。`);
      const start=String(r.start||'').trim(),end=String(r.end||'').trim();if(timeMin(start)==null||timeMin(end)==null||timeMin(end)<=timeMin(start))throw new Error(`${r._row}行目: start/end が不正です。`);
      const workMinutes=Number(r.workMinutes||0),breakMinutes=Number(r.breakMinutes||0),requiredCount=Number(r.requiredCount||0),regularQualifiedRequired=Number(r.regularQualifiedRequired||0);
      if(!Number.isFinite(workMinutes)||workMinutes<=0)throw new Error(`${r._row}行目: workMinutes は1以上の数値です。`);
      if(!Number.isFinite(breakMinutes)||breakMinutes<0)throw new Error(`${r._row}行目: breakMinutes は0以上の数値です。`);
      if(!Number.isFinite(requiredCount)||requiredCount<0||!Number.isFinite(regularQualifiedRequired)||regularQualifiedRequired<0||regularQualifiedRequired>requiredCount)throw new Error(`${r._row}行目: 必要人数の設定が不正です。`);
      next.push(normalizePattern({id,name:String(r.name||id),start,end,workMinutes,breakMinutes,requiredCount,regularQualifiedRequired,active:parseBool(r.active,true),category:String(r.category||'').trim()||undefined}));
    }catch(e){errors.push(e.message)}
  });
  const ids=next.map(x=>x.id);[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))].forEach(id=>errors.push(`CSV内で勤務パターンID ${id} が重複しています。`));
  if(errors.length)throw new Error(errors.join('\n'));
  next.forEach(p=>{const i=db.patterns.findIndex(x=>x.id===p.id);if(i>=0)db.patterns[i]=p;else db.patterns.push(p)});
  save();renderAll();csvMessage('勤務パターン',next.length,'「勤務パターン」タブで内容を確認し、Privateへ保存してください。');
}

function resolveStaffFromCsvRow(r){
  const id=String(r.staffId||'').trim();if(id)return db.staff.find(s=>s.id===id)||null;
  const name=String(r.staffName||'').trim();if(!name)return null;const hits=db.staff.filter(s=>s.name===name);return hits.length===1?hits[0]:null;
}

async function importMonthlyStaffCsv(file){
  const doc=parseCsvText(await file.text());requireHeaders(doc,['month']);if(!doc.rows.length)throw new Error('月次・職員別CSVにデータ行がありません。');
  const updates=[],errors=[];
  doc.rows.forEach(r=>{
    try{
      const month=parseMonthKey(r.month,r._row),s=resolveStaffFromCsvRow(r);if(!s)throw new Error(`${r._row}行目: staffId / staffName に一致する職員を1名に特定できません。`);
      if(db.monthly[month]?.locked)throw new Error(`${r._row}行目: ${month} は休日確定済みです。確定解除後に読み込んでください。`);
      updates.push({month,staffId:s.id,requestedOff:parseDayList(r.requestedOff,month,r._row,'requestedOff'),fixedOff:parseDayList(r.fixedOff,month,r._row,'fixedOff')});
    }catch(e){errors.push(e.message)}
  });
  if(errors.length)throw new Error(errors.join('\n'));
  updates.forEach(u=>{db.monthly[u.month]=normalizeMonth(db.monthly[u.month]||defaultMonthData());const m=db.monthly[u.month];m.requestedOff[u.staffId]=u.requestedOff;m.fixedOff[u.staffId]=u.fixedOff;m.dayState={};m.shiftState={}});
  loadMonthState();save();renderAll();csvMessage('月次・職員別条件',updates.length,'「月次シフト」タブで内容を確認し、この月をPrivateへ保存してください。');
}

async function importMonthlySettingsCsv(file){
  const doc=parseCsvText(await file.text());requireHeaders(doc,['month']);if(!doc.rows.length)throw new Error('月次・全体設定CSVにデータ行がありません。');
  const updates=[],errors=[];
  doc.rows.forEach(r=>{
    try{
      const month=parseMonthKey(r.month,r._row),max=monthMaxDay(month);if(db.monthly[month]?.locked)throw new Error(`${r._row}行目: ${month} は休日確定済みです。確定解除後に読み込んでください。`);
      const regularMonthlyOff=Number(r.regularMonthlyOff??9),edgeShiftMax=Number(r.edgeShiftMax??3);
      if(!Number.isFinite(regularMonthlyOff)||regularMonthlyOff<0||regularMonthlyOff>max)throw new Error(`${r._row}行目: regularMonthlyOff は0〜${max}です。`);
      if(!Number.isFinite(edgeShiftMax)||edgeShiftMax<1||edgeShiftMax>max)throw new Error(`${r._row}行目: edgeShiftMax は1〜${max}です。`);
      updates.push({month,regularMonthlyOff,holidays:parseDayList(r.holidays,month,r._row,'holidays'),edgeShiftMax});
    }catch(e){errors.push(e.message)}
  });
  if(errors.length)throw new Error(errors.join('\n'));
  updates.forEach(u=>{db.monthly[u.month]=normalizeMonth({...db.monthly[u.month],...u,dayState:{},shiftState:{}})});
  loadMonthState();save();renderAll();csvMessage('月次・全体設定',updates.length,'「月次シフト」タブで内容を確認し、この月をPrivateへ保存してください。');
}

function bindCsvImports(){
  const bindings=[['importStaffCsv',importStaffCsv],['importPatternCsv',importPatternCsv],['importMonthlyStaffCsv',importMonthlyStaffCsv],['importMonthlySettingsCsv',importMonthlySettingsCsv]];
  bindings.forEach(([id,fn])=>{const el=$('#'+id);if(!el)return;el.addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{await fn(f)}catch(err){csvError(err)}})});
}
