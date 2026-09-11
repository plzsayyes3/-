// Pure scheduling core. No DOM, localStorage or GitHub API dependencies.
// Browser: window.ChildcareSchedulerCore
// Node: module.exports
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ChildcareSchedulerCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const WEEKDAYS=['日','月','火','水','木','金','土'];
  const EDGE_PATTERN_IDS=new Set(['P01','P07']);

  function timeMin(t){
    const m=String(t||'').match(/^(\d{1,2}):(\d{2})$/);if(!m)return null;
    const h=Number(m[1]),min=Number(m[2]);return h>=0&&h<24&&min>=0&&min<60?h*60+min:null;
  }
  function daysInMonth(year,month){return new Date(year,month,0).getDate()}
  function weekdayFor(year,month,day){return WEEKDAYS[new Date(year,month-1,day).getDay()]}
  function isClosedDay(year,month,day,holidays=[]){return new Date(year,month-1,day).getDay()===0||holidays.includes(day)}
  function isRegularStaff(s){return String(s?.employmentType||'').startsWith('正規')}
  function isRegularChildcareQualified(s){return s?.employmentType==='正規保育士'&&(s.qualifications||[]).includes('保育士')}
  function activeStaff(staff){return (staff||[]).filter(s=>s.active!==false)}
  function activePatterns(patterns){return (patterns||[]).filter(p=>p.active!==false)}
  function eligible(s,p){return s?.active!==false&&(s.allowedPatternIds||[]).includes(p.id)}
  function effectiveWeeklyDaysOff(s){
    if(s.weeklyDaysOff!=null)return Math.max(0,Number(s.weeklyDaysOff)||0);
    if(s.weeklyWorkDays!=null)return Math.max(0,7-(Number(s.weeklyWorkDays)||0));
    return null;
  }

  function offPriority(day,staffId,dayState,dailyOff,requested){
    const prev=dayState[staffId]?.[day-1];const next=dayState[staffId]?.[day+1];
    const adjacent=((prev&&prev!=='work')?4:0)+((next&&next!=='work')?4:0);
    return (requested.has(day)?-10000:0)+(dailyOff[day]||0)*20+adjacent*5+day/1000;
  }

  function generateOffSchedule({staff,monthly,year,month}){
    const people=activeStaff(staff);const n=daysInMonth(year,month);
    const requestedOff=monthly?.requestedOff||{},fixedOff=monthly?.fixedOff||{},holidays=monthly?.holidays||[];
    const dayState={};const dailyOff=Object.fromEntries(Array.from({length:n},(_,i)=>[i+1,0]));

    people.forEach(s=>{
      dayState[s.id]={};const fixedWd=new Set(s.fixedOffWeekdays||[]),fixed=new Set(fixedOff[s.id]||[]);
      for(let d=1;d<=n;d++){
        let state='work';
        if(isClosedDay(year,month,d,holidays))state='closed';
        else if(fixedWd.has(weekdayFor(year,month,d))||fixed.has(d))state='off';
        dayState[s.id][d]=state;if(state!=='work')dailyOff[d]++;
      }
    });

    // Preserve the existing rule: the monthly target counts every non-work day,
    // including closure days. This remains a business-rule decision to revisit.
    people.filter(isRegularStaff).forEach(s=>{
      const target=Math.max(0,Number(monthly?.regularMonthlyOff)||0);
      let count=Object.values(dayState[s.id]).filter(x=>x!=='work').length;
      const requested=new Set(requestedOff[s.id]||[]);const candidates=[];
      for(let d=1;d<=n;d++)if(dayState[s.id][d]==='work')candidates.push(d);
      while(count<target&&candidates.length){
        candidates.sort((a,b)=>offPriority(a,s.id,dayState,dailyOff,requested)-offPriority(b,s.id,dayState,dailyOff,requested)||a-b);
        const d=candidates.shift();dayState[s.id][d]='off';dailyOff[d]++;count++;
      }
    });

    // Compatibility rule: non-regular weekly constraints use 7-day blocks starting
    // at the first day of the month. Calendar-week semantics are intentionally not
    // changed here because that business rule is still unresolved.
    people.filter(s=>!isRegularStaff(s)&&effectiveWeeklyDaysOff(s)!=null).forEach(s=>{
      const target=effectiveWeeklyDaysOff(s);const requested=new Set(requestedOff[s.id]||[]);
      for(let start=1;start<=n;start+=7){
        const end=Math.min(n,start+6);let count=0;const candidates=[];
        for(let d=start;d<=end;d++){if(dayState[s.id][d]!=='work')count++;else candidates.push(d)}
        while(count<target&&candidates.length){
          candidates.sort((a,b)=>offPriority(a,s.id,dayState,dailyOff,requested)-offPriority(b,s.id,dayState,dailyOff,requested)||a-b);
          const d=candidates.shift();dayState[s.id][d]='off';dailyOff[d]++;count++;
        }
      }
    });
    return dayState;
  }

  function missedRequests({staff,monthly,dayState}){
    const out=[];activeStaff(staff).forEach(s=>(monthly?.requestedOff?.[s.id]||[]).forEach(d=>{
      if(dayState?.[s.id]?.[d]==='work')out.push({staffId:s.id,name:s.name||s.id,day:d});
    }));return out;
  }

  function initShiftCounts(people){
    const counts={};people.forEach(s=>counts[s.id]={total:{},edgeByPattern:{P01:0,P07:0}});return counts;
  }
  function edgeCount(counts,staffId,patternId){return counts[staffId]?.edgeByPattern?.[patternId]||0}
  function withinEdgeLimit(counts,staffId,patternId,edgeMax){return !EDGE_PATTERN_IDS.has(patternId)||edgeCount(counts,staffId,patternId)<edgeMax}
  function preferredRank(s,patternId){return (s.preferredPatternIds||[]).includes(patternId)||(s.shiftPolicy==='prefer-fixed'&&s.defaultPatternId===patternId)?0:1}
  function chooseCandidate(candidates,pattern,counts,edgeMax){
    return [...candidates]
      .filter(s=>withinEdgeLimit(counts,s.id,pattern.id,edgeMax))
      .sort((a,b)=>preferredRank(a,pattern.id)-preferredRank(b,pattern.id)
        ||((counts[a.id]?.total?.[pattern.id]||0)-(counts[b.id]?.total?.[pattern.id]||0))
        ||(edgeCount(counts,a.id,pattern.id)-edgeCount(counts,b.id,pattern.id))
        ||String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')
        ||String(a.id).localeCompare(String(b.id)))[0]||null;
  }

  function generateShiftSchedule({staff,patterns,monthly,dayState,year,month}){
    const people=activeStaff(staff);const pats=activePatterns(patterns).slice().sort((a,b)=>timeMin(a.start)-timeMin(b.start)||String(a.id).localeCompare(String(b.id)));
    const n=daysInMonth(year,month),edgeMax=Math.max(1,Number(monthly?.edgeShiftMax)||3),holidays=monthly?.holidays||[];
    const shiftState={};people.forEach(s=>shiftState[s.id]={});const counts=initShiftCounts(people);

    for(let d=1;d<=n;d++){
      if(isClosedDay(year,month,d,holidays))continue;
      const workers=people.filter(s=>dayState?.[s.id]?.[d]==='work');const assigned=new Set(),dayPatternCounts={};
      const assign=(s,p)=>{
        shiftState[s.id][d]=p.id;assigned.add(s.id);dayPatternCounts[p.id]=(dayPatternCounts[p.id]||0)+1;
        counts[s.id].total[p.id]=(counts[s.id].total[p.id]||0)+1;
        if(EDGE_PATTERN_IDS.has(p.id))counts[s.id].edgeByPattern[p.id]=(counts[s.id].edgeByPattern[p.id]||0)+1;
      };

      workers.filter(s=>s.shiftPolicy==='fixed'&&s.defaultPatternId)
        .sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')||String(a.id).localeCompare(String(b.id)))
        .forEach(s=>{const p=pats.find(x=>x.id===s.defaultPatternId);if(p&&eligible(s,p))assign(s,p)});

      for(const p of pats){
        let qualifiedNeeded=Math.max(0,Number(p.regularQualifiedRequired||0)-workers.filter(s=>assigned.has(s.id)&&shiftState[s.id][d]===p.id&&isRegularChildcareQualified(s)).length);
        while(qualifiedNeeded>0){
          const pick=chooseCandidate(workers.filter(s=>!assigned.has(s.id)&&eligible(s,p)&&isRegularChildcareQualified(s)),p,counts,edgeMax);
          if(!pick)break;assign(pick,p);qualifiedNeeded--;
        }
        while((dayPatternCounts[p.id]||0)<Number(p.requiredCount||0)){
          const pick=chooseCandidate(workers.filter(s=>!assigned.has(s.id)&&eligible(s,p)),p,counts,edgeMax);
          if(!pick)break;assign(pick,p);
        }
      }

      workers.filter(s=>!assigned.has(s.id))
        .sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ja')||String(a.id).localeCompare(String(b.id)))
        .forEach(s=>{
          const choices=pats.filter(p=>eligible(s,p)&&withinEdgeLimit(counts,s.id,p.id,edgeMax)).sort((a,b)=>
            preferredRank(s,a.id)-preferredRank(s,b.id)
            ||((dayPatternCounts[a.id]||0)/Math.max(1,Number(a.requiredCount)||1))-((dayPatternCounts[b.id]||0)/Math.max(1,Number(b.requiredCount)||1))
            ||timeMin(a.start)-timeMin(b.start)||String(a.id).localeCompare(String(b.id)));
          if(choices[0])assign(s,choices[0]);
        });
    }
    return shiftState;
  }

  function buildShiftWarnings({staff,patterns,monthly,dayState,shiftState,year,month}){
    const warnings=[];if(!monthly?.locked)return ['休日が未確定です。'];
    const people=activeStaff(staff),pats=activePatterns(patterns),n=daysInMonth(year,month),holidays=monthly?.holidays||[],edgeMax=Math.max(1,Number(monthly?.edgeShiftMax)||3);
    const edgeByStaff={};people.forEach(s=>edgeByStaff[s.id]={P01:0,P07:0});
    for(const s of people)for(const pid of Object.values(shiftState?.[s.id]||{}))if(EDGE_PATTERN_IDS.has(pid))edgeByStaff[s.id][pid]++;
    people.forEach(s=>['P01','P07'].forEach(pid=>{if(edgeByStaff[s.id][pid]>edgeMax)warnings.push(`${s.name||s.id}: ${pid==='P01'?'6:45':'11:30'} が上限${edgeMax}回を超えています（${edgeByStaff[s.id][pid]}回）。`)}));

    for(let d=1;d<=n;d++){
      if(isClosedDay(year,month,d,holidays))continue;
      const workers=people.filter(s=>dayState?.[s.id]?.[d]==='work');const assigned=workers.filter(s=>shiftState?.[s.id]?.[d]);
      if(assigned.length<workers.length)warnings.push(`${d}日: ${workers.length-assigned.length}名に勤務パターンを割り当てられません。`);
      for(const p of pats){
        const members=assigned.filter(s=>shiftState[s.id][d]===p.id);
        if(members.length<Number(p.requiredCount||0))warnings.push(`${d}日 ${p.name}: ${Number(p.requiredCount||0)-members.length}名不足。`);
        const qualified=members.filter(isRegularChildcareQualified).length;
        if(qualified<Number(p.regularQualifiedRequired||0))warnings.push(`${d}日 ${p.name}: 正規保育士資格者が${Number(p.regularQualifiedRequired||0)-qualified}名不足。`);
      }
      const at830=assigned.filter(s=>{const p=pats.find(x=>x.id===shiftState[s.id][d]);return p&&timeMin(p.start)<=510&&timeMin(p.end)>510}).length;
      if(at830<8)warnings.push(`${d}日 8:30時点: ${8-at830}名不足（現在${at830}名）。`);
    }
    return warnings;
  }

  return {timeMin,daysInMonth,weekdayFor,isClosedDay,isRegularStaff,isRegularChildcareQualified,effectiveWeeklyDaysOff,eligible,generateOffSchedule,missedRequests,chooseCandidate,generateShiftSchedule,buildShiftWarnings};
});
