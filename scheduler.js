// Browser adapter between application state and the pure scheduler core.

function schedulerContext(){
  const {year,month}=monthInfo();
  return {staff:db.staff,patterns:db.patterns,monthly:currentMonthData(),dayState,shiftState,year,month};
}

function generateOff(){
  const v=validation();
  if(v.errors.length){renderValidation();alert('入力エラーを解消してから生成してください。');return}
  const m=currentMonthData();
  if(m.locked){alert('休日確定中です。解除してから再生成してください。');return}
  dayState=ChildcareSchedulerCore.generateOffSchedule(schedulerContext());
  shiftState={};
  save();renderAll();
}

function missedRequests(){
  return ChildcareSchedulerCore.missedRequests(schedulerContext()).map(x=>`${x.name} ${x.day}日`);
}

function generateShifts(){
  const v=validation();
  if(v.errors.length){renderValidation();alert('入力エラーを解消してください。');return}
  const m=currentMonthData();
  if(!m.locked){alert('先に休日を調整して「休日を確定」してください。');return}
  if(!Object.keys(dayState).length){alert('休日表がありません。');return}
  shiftState=ChildcareSchedulerCore.generateShiftSchedule(schedulerContext());
  save();renderShift();
}

function shiftWarnings(){return ChildcareSchedulerCore.buildShiftWarnings(schedulerContext())}
