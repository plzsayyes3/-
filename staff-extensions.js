// Staff schema / scheduling extensions for PoC v0.4
// Keeps personal data out of this repository; this file only defines generic behavior.

const EXTRA_EMPLOYMENT_TYPES=['正規看護師','非正規看護師','非正規事務員'];
EXTRA_EMPLOYMENT_TYPES.forEach(t=>{if(!EMPLOYMENT_TYPES.includes(t))EMPLOYMENT_TYPES.push(t)});

function isRegularChildcareQualified(s){
  return s?.employmentType==='正規保育士' && ((s.qualifications||[]).includes('保育士') || s.qualified===true);
}

const _baseMigrateLoaded=migrateLoaded;
migrateLoaded=function(x){
  const out=_baseMigrateLoaded(x);
  out.staff=(out.staff||[]).map(s=>{
    s.role=s.role||(
      String(s.employmentType||'').includes('看護師')?'看護師':
      String(s.employmentType||'').includes('事務')?'事務員':'保育士'
    );
    if(!Array.isArray(s.qualifications)){
      s.qualifications=s.qualified&&s.role==='保育士'?['保育士']:[];
    }
    // legacy `qualified` now means childcare qualification for staffing rules.
    s.qualified=s.qualifications.includes('保育士');
    if(!Array.isArray(s.preferredPatternIds))s.preferredPatternIds=[];
    if(!s.shiftPolicy)s.shiftPolicy='flexible';
    if(s.weeklyWorkDays!=null && s.weeklyDaysOff==null){
      s.weeklyDaysOff=Math.max(0,7-Number(s.weeklyWorkDays));
    }
    if(s.weeklyWorkDays==null && s.weeklyDaysOff!=null && s.employmentType!=='正規保育士'){
      s.weeklyWorkDays=Math.max(0,7-Number(s.weeklyDaysOff));
    }
    if(s.requestedOffLimit===undefined)s.requestedOffLimit=null;
    return s;
  });
  return out;
};

defaultStaff=function(){
  return {
    id:uid('S'),name:'',employmentType:'正規保育士',role:'保育士',
    qualifications:['保育士'],qualified:true,
    weeklyDaysOff:null,weeklyWorkDays:null,fixedOffWeekdays:[],
    allowedPatternIds:activePatterns().map(p=>p.id),preferredPatternIds:[],
    defaultPatternId:null,shiftPolicy:'flexible',requestedOffLimit:null,
    active:true,notes:''
  };
};

const _baseValidation=validation;
validation=function(){
  const base=_baseValidation();
  const errors=[...base.errors],warnings=[...base.warnings];
  activeStaff().forEach(s=>{
    const name=s.name||s.id;
    if(s.shiftPolicy==='fixed'&&!s.defaultPatternId)errors.push(`${name}: 固定勤務なのに基本勤務が未設定です。`);
    if(s.defaultPatternId&&!(s.allowedPatternIds||[]).includes(s.defaultPatternId))errors.push(`${name}: 基本勤務が勤務可能パターンに含まれていません。`);
    (s.preferredPatternIds||[]).filter(id=>!(s.allowedPatternIds||[]).includes(id)).forEach(id=>warnings.push(`${name}: 優先勤務 ${id} は勤務可能パターン外です。`));
    if(s.weeklyWorkDays!=null&&(Number(s.weeklyWorkDays)<0||Number(s.weeklyWorkDays)>7))errors.push(`${name}: 週勤務日数が不正です。`);
  });
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
};

renderStaff=function(){
  const root=$('#staffCards');
  if(!db.staff.length){root.innerHTML='<div class="note">まだスタッフが登録されていません。</div>';return}
  const qOptions=['保育士','看護師'];
  root.innerHTML=db.staff.map(s=>`<article class="staff-card" data-id="${esc(s.id)}">
    <div class="staff-card-head"><strong>${esc(s.name||'名称未設定')} <span class="small">${esc(s.id)}</span></strong><button class="danger" data-del-staff>削除</button></div>
    <div class="staff-card-grid">
      <label class="field">氏名<input data-k="name" value="${esc(s.name||'')}"></label>
      <label class="field">雇用区分<select data-k="employmentType">${EMPLOYMENT_TYPES.map(t=>`<option ${s.employmentType===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="field">職種<input data-k="role" value="${esc(s.role||'')}"></label>
      <div class="field"><span>資格</span><div class="check-grid">${qOptions.map(q=>`<label class="check-chip"><input type="checkbox" data-qualification="${q}" ${(s.qualifications||[]).includes(q)?'checked':''}>${q}</label>`).join('')}</div></div>
      <label class="field">週勤務日数<input type="number" min="0" max="7" data-k="weeklyWorkDays" value="${s.weeklyWorkDays??''}" placeholder="例: 4"></label>
      <label class="field">固定休曜日<input data-k="fixedOffWeekdays" value="${esc((s.fixedOffWeekdays||[]).join(','))}" placeholder="水"></label>
      <label class="field">基本勤務<select data-k="defaultPatternId"><option value="">指定なし</option>${activePatterns().map(p=>`<option value="${p.id}" ${s.defaultPatternId===p.id?'selected':''}>${esc(p.name)} (${p.start}-${p.end})</option>`).join('')}</select></label>
      <label class="field">基本勤務の扱い<select data-k="shiftPolicy"><option value="flexible" ${s.shiftPolicy==='flexible'?'selected':''}>可変</option><option value="prefer-fixed" ${s.shiftPolicy==='prefer-fixed'?'selected':''}>原則固定</option><option value="fixed" ${s.shiftPolicy==='fixed'?'selected':''}>固定</option></select></label>
      <div class="field wide"><span>勤務可能パターン</span><div class="check-grid">${activePatterns().map(p=>`<label class="check-chip"><input type="checkbox" data-pattern="${p.id}" ${(s.allowedPatternIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</div></div>
      <div class="field wide"><span>優先パターン</span><div class="check-grid">${activePatterns().map(p=>`<label class="check-chip"><input type="checkbox" data-preferred-pattern="${p.id}" ${(s.preferredPatternIds||[]).includes(p.id)?'checked':''}>${esc(p.name)}</label>`).join('')}</div></div>
      <label class="field">希望休上限<input type="number" min="0" data-k="requestedOffLimit" value="${s.requestedOffLimit??''}" placeholder="空欄=制限なし"></label>
      <label class="field wide">メモ<textarea rows="2" data-k="notes">${esc(s.notes||'')}</textarea></label>
    </div>
  </article>`).join('');

  root.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const k=e.target.dataset.k;let v=e.target.value;
    if(['weeklyWorkDays','requestedOffLimit'].includes(k))v=v===''?null:Number(v);
    if(k==='weeklyWorkDays')s.weeklyDaysOff=v==null?null:Math.max(0,7-v);
    if(k==='fixedOffWeekdays')v=parseWeekdays(v);
    if(k==='defaultPatternId')v=v||null;
    s[k]=v;save();renderAll();
  }));
  root.querySelectorAll('[data-qualification]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const set=new Set(s.qualifications||[]);e.target.checked?set.add(e.target.dataset.qualification):set.delete(e.target.dataset.qualification);s.qualifications=[...set];s.qualified=s.qualifications.includes('保育士');save();renderAll();
  }));
  root.querySelectorAll('[data-pattern]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const set=new Set(s.allowedPatternIds||[]);e.target.checked?set.add(e.target.dataset.pattern):set.delete(e.target.dataset.pattern);s.allowedPatternIds=[...set];s.preferredPatternIds=(s.preferredPatternIds||[]).filter(id=>set.has(id));save();renderAll();
  }));
  root.querySelectorAll('[data-preferred-pattern]').forEach(el=>el.addEventListener('change',e=>{
    const s=db.staff.find(x=>x.id===e.target.closest('.staff-card').dataset.id);const id=e.target.dataset.preferredPattern;if(!(s.allowedPatternIds||[]).includes(id)&&e.target.checked){alert('先に勤務可能パターンへ追加してください。');e.target.checked=false;return}const set=new Set(s.preferredPatternIds||[]);e.target.checked?set.add(id):set.delete(id);s.preferredPatternIds=[...set];save();renderAll();
  }));
  root.querySelectorAll('[data-del-staff]').forEach(b=>b.addEventListener('click',e=>{const id=e.target.closest('.staff-card').dataset.id;db.staff=db.staff.filter(s=>s.id!==id);Object.values(db.monthly).forEach(m=>{delete m.requestedOff?.[id];delete m.fixedOff?.[id];delete m.dayState?.[id];delete m.shiftState?.[id]});save();loadMonthState();renderAll()}));
};

chooseCandidate=function(candidates,p,counts,edgeMax){
  return [...candidates]
    .filter(s=>!(p.id==='P01'||p.id==='P07')||(counts[s.id]?.edge||0)<edgeMax)
    .sort((a,b)=>{
      const prefA=(a.preferredPatternIds||[]).includes(p.id)||((a.shiftPolicy==='prefer-fixed')&&a.defaultPatternId===p.id)?0:1;
      const prefB=(b.preferredPatternIds||[]).includes(p.id)||((b.shiftPolicy==='prefer-fixed')&&b.defaultPatternId===p.id)?0:1;
      return prefA-prefB||((counts[a.id]?.total[p.id]||0)-(counts[b.id]?.total[p.id]||0))||((counts[a.id]?.edge||0)-(counts[b.id]?.edge||0))||String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')||a.id.localeCompare(b.id);
    })[0]||null;
};

generateShifts=function(){
  const v=validation();if(v.errors.length){renderValidation();alert('入力エラーを解消してください。');return}
  const m=currentMonthData();if(!m.locked){alert('先に休日を調整して「休日を確定」してください。');return}if(!Object.keys(dayState).length){alert('休日表がありません。');return}
  shiftState={};activeStaff().forEach(s=>shiftState[s.id]={});
  const patterns=activePatterns().slice().sort((a,b)=>timeMin(a.start)-timeMin(b.start)||a.id.localeCompare(b.id));
  const counts=shiftCountsByStaff(),edgeMax=m.edgeShiftMax;
  for(let d=1;d<=daysInMonth();d++){
    if(isClosed(d))continue;
    const workers=activeStaff().filter(s=>dayState[s.id]?.[d]==='work'),assigned=new Set(),dayPatternCounts={};
    const assign=(s,p)=>{shiftState[s.id][d]=p.id;assigned.add(s.id);dayPatternCounts[p.id]=(dayPatternCounts[p.id]||0)+1;counts[s.id].total[p.id]=(counts[s.id].total[p.id]||0)+1;if(['P01','P07'].includes(p.id))counts[s.id].edge++};

    // Hard-fixed staff are placed first. Prefer-fixed staff remain movable.
    workers.filter(s=>s.shiftPolicy==='fixed'&&s.defaultPatternId).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')).forEach(s=>{const p=patterns.find(x=>x.id===s.defaultPatternId);if(p&&eligible(s,p))assign(s,p)});

    for(const p of patterns){
      let qualifiedNeeded=Math.max(0,Number(p.regularQualifiedRequired||0)-workers.filter(s=>assigned.has(s.id)&&shiftState[s.id][d]===p.id&&isRegularChildcareQualified(s)).length);
      while(qualifiedNeeded>0){const c=workers.filter(s=>!assigned.has(s.id)&&eligible(s,p)&&isRegularChildcareQualified(s));const pick=chooseCandidate(c,p,counts,edgeMax);if(!pick)break;assign(pick,p);qualifiedNeeded--}
      while((dayPatternCounts[p.id]||0)<Number(p.requiredCount||0)){const c=workers.filter(s=>!assigned.has(s.id)&&eligible(s,p));const pick=chooseCandidate(c,p,counts,edgeMax);if(!pick)break;assign(pick,p)}
    }

    workers.filter(s=>!assigned.has(s.id)).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')).forEach(s=>{
      const choices=patterns.filter(p=>eligible(s,p)&&(!['P01','P07'].includes(p.id)||(counts[s.id].edge||0)<edgeMax)).sort((a,b)=>{
        const pa=(s.preferredPatternIds||[]).includes(a.id)||(s.shiftPolicy==='prefer-fixed'&&s.defaultPatternId===a.id)?0:1;
        const pb=(s.preferredPatternIds||[]).includes(b.id)||(s.shiftPolicy==='prefer-fixed'&&s.defaultPatternId===b.id)?0:1;
        return pa-pb||((dayPatternCounts[a.id]||0)/Math.max(1,a.requiredCount||1))-((dayPatternCounts[b.id]||0)/Math.max(1,b.requiredCount||1))||timeMin(a.start)-timeMin(b.start)||a.id.localeCompare(b.id);
      });if(choices[0])assign(s,choices[0]);
    });
  }
  save();renderShift();
};

shiftWarnings=function(){
  const m=currentMonthData(),warnings=[];if(!m.locked)return ['休日が未確定です。'];const patterns=activePatterns();
  for(let d=1;d<=daysInMonth();d++){
    if(isClosed(d))continue;
    const workers=activeStaff().filter(s=>dayState[s.id]?.[d]==='work');const assigned=workers.filter(s=>shiftState[s.id]?.[d]);
    if(assigned.length<workers.length)warnings.push(`${d}日: ${workers.length-assigned.length}名に勤務パターンを割り当てられません。`);
    for(const p of patterns){const members=assigned.filter(s=>shiftState[s.id][d]===p.id);if(members.length<Number(p.requiredCount||0))warnings.push(`${d}日 ${p.name}: ${Number(p.requiredCount||0)-members.length}名不足。`);const rq=members.filter(isRegularChildcareQualified).length;if(rq<Number(p.regularQualifiedRequired||0))warnings.push(`${d}日 ${p.name}: 正規保育士資格者が${Number(p.regularQualifiedRequired||0)-rq}名不足。`)}
    const at830=assigned.filter(s=>{const p=db.patterns.find(x=>x.id===shiftState[s.id][d]);return p&&timeMin(p.start)<=510&&timeMin(p.end)>510}).length;if(at830<8)warnings.push(`${d}日 8:30時点: ${8-at830}名不足（現在${at830}名）。`)
  }
  return warnings;
};

// Re-normalize current local working copy and repaint with the extended schema.
db=migrateLoaded({db});
syncStaffPatternRefs();save();renderAll();
