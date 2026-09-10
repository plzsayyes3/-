// Browser-side access to the user's private staff repository.
// SECURITY: token is intentionally kept only in this tab's JavaScript memory.

let staffRepoToken='';
let staffRepoDefaultBranch='';
const DEFAULT_STAFF_REPO='plzsayyes3/childacare-staff';

function staffRepoName(){return String($('#staffRepoName')?.value||DEFAULT_STAFF_REPO).trim()}
function setPrivateRepoStatus(message,type='ok'){
  const el=$('#privateRepoStatus');if(!el)return;el.innerHTML=`<div class="${type}">${esc(message)}</div>`;
}
function captureToken(){staffRepoToken=String($('#staffRepoToken')?.value||'').trim();if($('#staffRepoToken'))$('#staffRepoToken').value='';return staffRepoToken}
function requireToken(){const typed=String($('#staffRepoToken')?.value||'').trim();if(typed){captureToken();staffRepoDefaultBranch=''}if(!staffRepoToken)throw new Error('トークンを入力してください。');return staffRepoToken}
function repoApiUrl(path=''){
  const repo=staffRepoName();if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw new Error('リポジトリ名は owner/repo 形式で入力してください。');
  return `https://api.github.com/repos/${repo}${path}`;
}
function githubHeaders(){return {'Accept':'application/vnd.github+json','Authorization':`Bearer ${requireToken()}`,'X-GitHub-Api-Version':'2022-11-28'}}
function decodeBase64Utf8(s){const bin=atob(String(s||'').replace(/\n/g,''));const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)}
function encodeBase64Utf8(s){const bytes=new TextEncoder().encode(String(s));let bin='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(bin)}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

class GitHubApiError extends Error{
  constructor(status,statusText,body){
    super(`GitHub API ${status}: ${body?.message||statusText||'request failed'}`);
    this.name='GitHubApiError';this.status=status;this.body=body;
  }
}

async function ghFetch(url,opts={}){
  const res=await fetch(url,{cache:'no-store',...opts,headers:{...githubHeaders(),...(opts.headers||{})}});
  let body=null;try{body=await res.json()}catch{}
  if(!res.ok)throw new GitHubApiError(res.status,res.statusText,body);
  return body;
}
async function ensureRepoMeta(){
  if(staffRepoDefaultBranch)return staffRepoDefaultBranch;
  const meta=await ghFetch(repoApiUrl());
  staffRepoDefaultBranch=meta.default_branch||'main';
  return staffRepoDefaultBranch;
}
async function ghReadJson(path){
  const data=await ghFetch(repoApiUrl(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`));
  return {sha:data.sha,json:JSON.parse(decodeBase64Utf8(data.content))};
}
async function ghWriteJson(path,obj,message,retry=true){
  await ensureRepoMeta();
  let sha=null;
  try{sha=(await ghReadJson(path)).sha}catch(e){if(!(e instanceof GitHubApiError&&e.status===404))throw e}
  const payload={message,content:encodeBase64Utf8(JSON.stringify(obj,null,2)),branch:staffRepoDefaultBranch};
  if(sha)payload.sha=sha;
  try{
    return await ghFetch(repoApiUrl(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  }catch(e){
    if(e instanceof GitHubApiError&&e.status===409&&retry){
      setPrivateRepoStatus(`${path} の保存競合を検出しました。最新状態を取り直して再試行します。`,'warn');
      staffRepoDefaultBranch='';
      await sleep(350);
      return ghWriteJson(path,obj,message,false);
    }
    if(e instanceof GitHubApiError&&e.status===409){
      throw new Error(`保存競合が解消できませんでした: ${path}。ページを再読込して、Private職員DBを読み直してから保存してください。`);
    }
    throw e;
  }
}

async function checkPrivateRepo(){
  requireToken();
  const meta=await ghFetch(repoApiUrl());staffRepoDefaultBranch=meta.default_branch||'main';
  setPrivateRepoStatus(`接続OK: ${staffRepoName()} / ${staffRepoDefaultBranch}。トークンはこのタブのメモリ上だけに保持しています。`);
}
async function loadPrivateMasters(){
  await ensureRepoMeta();
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
  await ensureRepoMeta();
  const key=monthInfo().key;const file=await ghReadJson(`data/months/${key}.json`);const src=file.json.monthly||file.json.data||file.json;
  db.monthly[key]=src;loadMonthState();save();renderAll();setPrivateRepoStatus(`${key} の月次データをPrivateリポジトリから読み込みました。`);
}
async function savePrivateMonth(){
  save();const key=monthInfo().key;const payload={schemaVersion:SCHEMA_VERSION,month:key,updatedAt:new Date().toISOString(),monthly:db.monthly[key]||currentMonthData()};
  await ghWriteJson(`data/months/${key}.json`,payload,`Update monthly shift data ${key}`);setPrivateRepoStatus(`${key} の月次データを ${staffRepoName()} に保存しました。`);
}
function clearPrivateToken(){staffRepoToken='';staffRepoDefaultBranch='';if($('#staffRepoToken'))$('#staffRepoToken').value='';setPrivateRepoStatus('トークンをこのタブのメモリから消去しました。','warn')}

function bindPrivateRepo(){
  const map=[['checkPrivateRepo',checkPrivateRepo],['loadPrivateMasters',loadPrivateMasters],['savePrivateMasters',savePrivateMasters],['loadPrivateMonth',loadPrivateMonth],['savePrivateMonth',savePrivateMonth]];
  map.forEach(([id,fn])=>$('#'+id)?.addEventListener('click',async()=>{try{await fn()}catch(e){setPrivateRepoStatus(e.message||String(e),'error')}}));
  $('#clearPrivateToken')?.addEventListener('click',clearPrivateToken);
  $('#staffRepoName')?.addEventListener('change',()=>{staffRepoDefaultBranch=''});
}

bindPrivateRepo();
