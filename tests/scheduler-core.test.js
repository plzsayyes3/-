const assert=require('node:assert/strict');
const S=require('../scheduler-core.js');

function staff(id,overrides={}){
  return {id,name:id,employmentType:'正規保育士',role:'保育士',qualifications:['保育士'],qualified:true,weeklyDaysOff:null,weeklyWorkDays:null,fixedOffWeekdays:[],allowedPatternIds:[],preferredPatternIds:[],defaultPatternId:null,shiftPolicy:'flexible',active:true,...overrides};
}
function pattern(id,start,requiredCount=0,qualified=0){return {id,name:id,start,end:'23:00',requiredCount,regularQualifiedRequired:qualified,active:true}}
function workState(ids,days){const out={};ids.forEach(id=>{out[id]={};for(let d=1;d<=days;d++)out[id][d]='work'});return out}

(function qualificationRule(){
  assert.equal(S.isRegularChildcareQualified(staff('C')),true);
  assert.equal(S.isRegularChildcareQualified(staff('N',{employmentType:'正規看護師',role:'看護師',qualifications:['看護師'],qualified:false})),false);
})();

(function regularNurseGetsRegularMonthlyOffTarget(){
  const nurse=staff('N',{employmentType:'正規看護師',role:'看護師',qualifications:['看護師'],qualified:false});
  const state=S.generateOffSchedule({staff:[nurse],monthly:{requestedOff:{},fixedOff:{},holidays:[],regularMonthlyOff:5},year:2026,month:2});
  const nonWork=Object.values(state.N).filter(x=>x!=='work').length;
  assert.equal(nonWork,5,'regular nurse must use the shared regular monthly off target');
})();

(function edgeLimitIsPerPatternNotCombined(){
  const p1=pattern('P01','06:45',1,0),p7=pattern('P07','11:30',1,0);
  const person=staff('A',{allowedPatternIds:['P01','P07']});
  const shifts=S.generateShiftSchedule({staff:[person],patterns:[p1,p7],monthly:{edgeShiftMax:2,holidays:[]},dayState:workState(['A'],4),year:2026,month:9});
  const values=Object.values(shifts.A).slice(0,4);
  assert.deepEqual(values,['P01','P01','P07','P07']);
})();

(function fixedAndPreferFixedAreDifferent(){
  const p1=pattern('P01','06:45',1,1),p4=pattern('P04','08:30',0,0);
  const fixed=staff('FIX',{allowedPatternIds:['P04'],defaultPatternId:'P04',shiftPolicy:'fixed'});
  const movable=staff('MOVE',{allowedPatternIds:['P01','P04'],defaultPatternId:'P04',shiftPolicy:'prefer-fixed'});
  const shifts=S.generateShiftSchedule({staff:[fixed,movable],patterns:[p1,p4],monthly:{edgeShiftMax:3,holidays:[]},dayState:workState(['FIX','MOVE'],1),year:2026,month:9});
  assert.equal(shifts.FIX[1],'P04');
  assert.equal(shifts.MOVE[1],'P01','prefer-fixed staff must remain movable for required coverage');
})();

(function preferredPatternIsUsedForSurplusWorker(){
  const p3=pattern('P03','08:00',0,0),p6=pattern('P06','09:45',0,0);
  const person=staff('P',{allowedPatternIds:['P03','P06'],preferredPatternIds:['P06']});
  const shifts=S.generateShiftSchedule({staff:[person],patterns:[p3,p6],monthly:{edgeShiftMax:3,holidays:[]},dayState:workState(['P'],1),year:2026,month:9});
  assert.equal(shifts.P[1],'P06');
})();

(function nurseDoesNotSatisfyChildcareQualificationWarning(){
  const p1=pattern('P01','06:45',1,1);
  const nurse=staff('N',{employmentType:'正規看護師',role:'看護師',qualifications:['看護師'],qualified:false,allowedPatternIds:['P01']});
  const dayState=workState(['N'],1);const shiftState={N:{1:'P01'}};
  const warnings=S.buildShiftWarnings({staff:[nurse],patterns:[p1],monthly:{locked:true,edgeShiftMax:3,holidays:[]},dayState,shiftState,year:2026,month:9});
  assert.ok(warnings.some(x=>x.includes('正規保育士資格者')));
})();

(function deterministicGeneration(){
  const pats=[pattern('P01','06:45',1,1),pattern('P04','08:30',1,0)];
  const people=[staff('A',{allowedPatternIds:['P01','P04']}),staff('B',{allowedPatternIds:['P01','P04']})];
  const args={staff:people,patterns:pats,monthly:{edgeShiftMax:3,holidays:[]},dayState:workState(['A','B'],3),year:2026,month:9};
  assert.deepEqual(S.generateShiftSchedule(args),S.generateShiftSchedule(args));
})();

console.log('scheduler-core tests passed');
