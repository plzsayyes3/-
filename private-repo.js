// Browser-side access to the user's private staff repository.
// SECURITY: token is intentionally kept only in this tab's JavaScript memory.

let staffRepoToken='';
const DEFAULT_STAFF_REPO='plzsayyes3/childacare-staff';

function staffRepoName(){return String($('#staffRepoName')?.value||DEFAULT_STAFF_REPO).trim()}
function setPrivateRepoStatus(message,type='ok'){
  const el=$('#privateRepoStatus');if(!el)return;el.innerHTML=`<div class="${type}">${esc(message)}</div>`;
}
function captureToken(){staffRepoToken=String($('#staffRepoToken')?.value||'').trim();if($('#staffRepoToken'))$('#staffRepoToken').value='';return staffRepoToken}
function requireToken(){if(!staffRepoToken)captureToken();if(!staffRepoToken)throw new Error('トークンを入力してください。');return staffRepoToken}
function repoApiUrl(path=''){
  const repo=staffRepoName();if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('リポジトリ名は owner/repo 形式で入力してください。');
  return `https://api.github.com/repos/${repo}${path}`;
}
function githubHeaders(){return {'Accept':'application/vnd.github+json','Authorization':`Bearer ${requireToken()}`,'X-GitHub-Api-Version':'2022-11-28'}}
function decodeBase64Utf8(s){const bin=atob(String(s||'').replace(/\n/g,''));const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)}
function encodeBase64Utf8(s){const bytes=new TextEncoder().encode(String(s));let bin='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(bin)}

async function ghFetch(url,opts={}){
  const res=await fetch(url,{...opts,headers:{...githubHeaders(),...(opts.headers||{})}});
  let body=null;try{body=await res.json()}catch{}
  if(!res.ok){const msg=body?.message||`${res.status} ${res.statusText}`;throw new Error(`GitHub API: ${msg}`)}
  return body;
}
async function ghReadJson(path){const data=await ghFetch(repoApiUrl(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`));return {sha:data.sha,json:JSON.parse(decodeBase64Utf8(data.content))}}
async function ghWriteJson(path,obj,message){
  let sha=null;try{sha=(await ghReadJson(path)).sha}catch(e){if(!String(e.message).includes('Not Found'))throw e}
  const payload={message,content:encodeBase64Utf8(JSON.stringify(obj,null,2)),branch:'main'};if(sha)payload.sha=sha;
  return ghFetch(repoApiUrl(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}

async function checkPrivateRepo(){captureToken();await ghFetch(repoApiUrl());setPrivateRepoStatus(`接続OK: ${staffRepoName()}。トークンはこのタブのメモリ上だけに保持しています。`)}
async function loadPrivateMasters(){
  const [staffFile,patternFile]=await Promise.all([ghReadJson('data/staff.json'),ghReadJson('data/patterns.json')]);
  if(!Array.isArray(staffFile.json.staff))throw new Error('data/staff.json に staff 配列がありません。');
  if(!Array.isArray(patternFile.json.patterns))throw new Error('data/patterns.json に patterns 配列がありません。');
  const normalized=migrateLoaded({patterns:patternFile.json.patterns,staff:staffFile.json.staff,monthly:db.monthly});
  db.patterns=normalized.patterns;db.staff=normalized.staff;save();renderAll();
  setPrivateRepoStatus(`職員${db.staff.length}名・勤務パターン${db.patterns.length}件をPrivateリポジトリから読み込みました。`);
}
async function savePrivateMasters(){
  const staffPayload={schemaVersion:SCHEMA_VERSION,updatedAt:new Date().toISOString(),staff:db.staff};
  const patternPayload={schemaVersion:SCHEMA_VERSION,updatedAt:new Date().toISOString(),patterns:db.patterns};
  await ghWriteJson('data/staff.json',staffPayload,'Update staff master from childcare-shift page');
  await ghWriteJson('data/patterns.json',patternPayload,'Update pattern master from childcare-shift page');
  setPrivateRepoStatus(`職員DB・勤務パターンDBを ${staffRepoName()} に保存しました。`);
}
async function loadPrivateMonth(){
  const key=monthInfo().key;const file=await ghReadJson(`data/months/${key}.json`);const src=file.json.monthly||file.json.data||file.json;
  db.monthly[key]=src;loadMonthState();save();renderAll();setPrivateRepoStatus(`${key} の月次データをPrivateリポジトリから読み込みました。`);
}
async function savePrivateMonth(){
  save();const key=monthInfo().key;const payload={schemaVersion:SCHEMA_VERSION,month:key,updatedAt:new Date().toISOString(),monthly:db.monthly[key]||currentMonthData()};
  await ghWriteJson(`data/months/${key}.json`,payload,`Update monthly shift data ${key}`);setPrivateRepoStatus(`${key} の月次データを ${staffRepoName()} に保存しました。`);
}
function clearPrivateToken(){staffRepoToken='';if($('#staffRepoToken'))$('#staffRepoToken').value='';setPrivateRepoStatus('トークンをこのタブのメモリから消去しました。','warn')}

function bindPrivateRepo(){
  const map=[['checkPrivateRepo',checkPrivateRepo],['loadPrivateMasters',loadPrivateMasters],['savePrivateMasters',savePrivateMasters],['loadPrivateMonth',loadPrivateMonth],['savePrivateMonth',savePrivateMonth]];
  map.forEach(([id,fn])=>$('#'+id)?.addEventListener('click',async()=>{try{await fn()}catch(e){setPrivateRepoStatus(e.message||String(e),'error')}}));
  $('#clearPrivateToken')?.addEventListener('click',clearPrivateToken);
}

bindPrivateRepo();
