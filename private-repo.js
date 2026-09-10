// Browser-side access to the user's private staff repository.
// SECURITY: token is intentionally kept only in this tab's JavaScript memory.

let staffRepoToken='';
let staffRepoDefaultBranch='';
let lastPrivateAction=null;
let lastPrivateActionLabel='';
const DEFAULT_STAFF_REPO='plzsayyes3/childacare-staff';
const TOKEN_SETTINGS_URL='https://github.com/settings/personal-access-tokens';

function staffRepoName(){return String($('#staffRepoName')?.value||DEFAULT_STAFF_REPO).trim()}
function setPrivateRepoStatus(message,type='ok'){
  const el=$('#privateRepoStatus');if(!el)return;
  el.innerHTML=`<div class="repo-status ${type}">${esc(message)}</div>`;
}
function captureToken(){staffRepoToken=String($('#staffRepoToken')?.value||'').trim();if($('#staffRepoToken'))$('#staffRepoToken').value='';return staffRepoToken}
function requireToken(){
  const typed=String($('#staffRepoToken')?.value||'').trim();
  if(typed){captureToken();staffRepoDefaultBranch=''}
  if(!staffRepoToken){const e=new Error('GitHubトークンが未入力です。');e.code='TOKEN_MISSING';throw e}
  return staffRepoToken;
}
function repoApiUrl(path=''){
  const repo=staffRepoName();
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)){const e=new Error('リポジトリ名は owner/repo 形式で入力してください。');e.code='REPO_FORMAT';throw e}
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
      setPrivateRepoStatus(`${path} で保存競合を検出。最新状態を取り直して自動再試行しています。`,'warn');
      staffRepoDefaultBranch='';
      await sleep(350);
      return ghWriteJson(path,obj,message,false);
    }
    throw e;
  }
}

function recoveryInfo(error,actionLabel){
  const status=error?.status||null;
  const code=error?.code||'';
  const message=String(error?.message||error||'不明なエラー');
  const isSave=/保存/.test(actionLabel||'');
  const isMonth=/月/.test(actionLabel||'');
  if(code==='TOKEN_MISSING')return {
    title:'トークンが未入力です',
    summary:'上部のGitHubトークン欄にトークンを貼り付ければ続行できます。',
    steps:['GitHubトークン欄にトークンを貼り付ける','「接続を再試行」を押す','接続OKになったら、元の読込・保存操作をもう一度行う'],
    focusToken:true,retryConnection:true,showTokenSettings:false
  };
  if(code==='REPO_FORMAT')return {
    title:'リポジトリ名の形式が違います',
    summary:`現在の入力: ${staffRepoName()}`,
    steps:['Private職員DBを owner/repo 形式にする','通常は plzsayyes3/childacare-staff を使用する','「接続を再試行」を押す'],
    retryConnection:true
  };
  if(status===401)return {
    title:'トークンを認証できません',
    summary:'トークンが無効・期限切れ・入力違いの可能性があります。',
    steps:['GitHubでトークンが有効か確認する','必要なら新しいFine-grained tokenを作る','上部のトークン欄へ貼り直す','「接続を再試行」を押す'],
    focusToken:true,retryConnection:true,showTokenSettings:true
  };
  if(status===403)return {
    title:'トークンの権限が足りません',
    summary:isSave?'保存には childacare-staff への Contents: Read and write が必要です。':'読込には childacare-staff への Contents: Read が必要です。',
    steps:[`Fine-grained token の対象リポジトリに ${staffRepoName()} が含まれているか確認する`,isSave?'Repository permissions → Contents を Read and write にする':'Repository permissions → Contents を Read-only 以上にする','変更後のトークンを上部へ貼り直す','「接続を再試行」を押す'],
    focusToken:true,retryConnection:true,showTokenSettings:true
  };
  if(status===404&&isMonth)return {
    title:'この月のファイルがまだありません',
    summary:'初めて使う月なら異常ではありません。ブラウザ上で月次データを作り、その月を保存するとファイルが新規作成されます。',
    steps:['対象月が正しいか確認する','初回の月なら月次入力を進める','「この月をPrivateへ保存」を押して新規作成する'],
    retryLast:false
  };
  if(status===404)return {
    title:'Privateリポジトリまたはファイルを見つけられません',
    summary:'リポジトリ名の違い、トークンの対象外、または必要ファイル不足の可能性があります。',
    steps:[`Private職員DBが ${staffRepoName()} になっているか確認する`,`トークンの対象リポジトリに ${staffRepoName()} が含まれているか確認する`,'接続確認が通るか試す','接続は通るのに読込だけ失敗する場合は data/staff.json と data/patterns.json の存在を確認する'],
    retryConnection:true,showTokenSettings:true
  };
  if(status===409)return {
    title:'GitHub上の更新とぶつかりました',
    summary:'ブラウザ上の編集内容は残っています。まず同じ操作を再試行してください。',
    steps:['ページを閉じずに「同じ操作を再試行」を押す','再び409ならJSON出力で現在の作業コピーをバックアップする','その後Privateから再読込して差分を確認する'],
    retryLast:true
  };
  if(status===422)return {
    title:'GitHubが保存内容を受け付けませんでした',
    summary:'保存先ブランチまたは送信内容の整合性に問題がある可能性があります。',
    steps:['「接続を再試行」でPrivateリポジトリを再確認する','整合性チェックを実行する','同じ保存操作を再試行する'],
    retryConnection:true,retryLast:true
  };
  if(message.includes('JSON'))return {
    title:'Private側のJSONを読み取れません',
    summary:'JSONファイルの形式が壊れている可能性があります。',
    steps:['Privateリポジトリの対象JSONを確認する','末尾カンマや括弧抜けがないか確認する','修正後に同じ読込操作を再試行する'],
    retryLast:true
  };
  return {
    title:'操作を完了できませんでした',
    summary:'画面内の手順で復旧できない場合は、下の詳細をそのまま共有してください。',
    steps:['接続状態を確認する','同じ操作を再試行する','改善しなければ「技術情報」をコピーして共有する'],
    retryConnection:true,retryLast:true
  };
}

function renderPrivateError(error,actionLabel='操作'){
  const el=$('#privateRepoStatus');if(!el)return;
  const info=recoveryInfo(error,actionLabel);
  const tech=`${actionLabel} / ${error?.status?`HTTP ${error.status} / `:''}${String(error?.message||error||'不明なエラー')}`;
  const steps=info.steps.map((s,i)=>`<li><span>${i+1}</span><div>${esc(s)}</div></li>`).join('');
  const actions=[];
  if(info.focusToken)actions.push('<button type="button" data-recovery="token">トークンを入力する</button>');
  if(info.retryConnection)actions.push('<button type="button" data-recovery="connect" class="primary">接続を再試行</button>');
  if(info.retryLast&&lastPrivateAction)actions.push(`<button type="button" data-recovery="retry" class="primary">${esc(lastPrivateActionLabel||'同じ操作')}を再試行</button>`);
  if(info.showTokenSettings)actions.push(`<a class="link-button" href="${TOKEN_SETTINGS_URL}" target="_blank" rel="noopener">GitHubのトークン設定を開く</a>`);
  el.innerHTML=`<section class="recovery-card" role="alert"><div class="recovery-head"><span class="recovery-badge">要対応</span><div><strong>${esc(info.title)}</strong><p>${esc(info.summary)}</p></div></div><ol class="recovery-steps">${steps}</ol><div class="recovery-actions">${actions.join('')}</div><details class="recovery-tech"><summary>技術情報</summary><code>${esc(tech)}</code></details></section>`;
  el.querySelector('[data-recovery="token"]')?.addEventListener('click',()=>{$('#staffRepoToken')?.focus()});
  el.querySelector('[data-recovery="connect"]')?.addEventListener('click',async()=>{try{await runPrivateAction('接続確認',checkPrivateRepo,false)}catch{}});
  el.querySelector('[data-recovery="retry"]')?.addEventListener('click',async()=>{if(!lastPrivateAction)return;try{await runPrivateAction(lastPrivateActionLabel,lastPrivateAction,false)}catch{}});
}

function setPrivateBusy(label){
  const el=$('#privateRepoStatus');if(!el)return;
  el.innerHTML=`<div class="repo-status busy"><strong>${esc(label)}</strong><span>処理中…</span></div>`;
}

async function checkPrivateRepo(){
  requireToken();
  const meta=await ghFetch(repoApiUrl());staffRepoDefaultBranch=meta.default_branch||'main';
  setPrivateRepoStatus(`接続OK: ${staffRepoName()} / ${staffRepoDefaultBranch}。各タブ上部の「Privateへ保存」から保存できます。`);
}
async function loadPrivateMasters(){
  await ensureRepoMeta();
  const [staffFile,patternFile]=await Promise.all([ghReadJson('data/staff.json'),ghReadJson('data/patterns.json')]);
  if(!Array.isArray(staffFile.json.staff))throw new Error('data/staff.json に staff 配列がありません。');
  if(!Array.isArray(patternFile.json.patterns))throw new Error('data/patterns.json に patterns 配列がありません。');
  const normalized=migrateLoaded({patterns:patternFile.json.patterns,staff:staffFile.json.staff,monthly:db.monthly});
  db.patterns=normalized.patterns;db.staff=normalized.staff;save();renderAll();
  setPrivateRepoStatus(`読込完了: 職員${db.staff.length}名・勤務パターン${db.patterns.length}件。ブラウザの作業コピーを更新しました。`);
}
async function savePrivateMasters(){
  const staffPayload={schemaVersion:SCHEMA_VERSION,updatedAt:new Date().toISOString(),staff:db.staff};
  const patternPayload={schemaVersion:SCHEMA_VERSION,updatedAt:new Date().toISOString(),patterns:db.patterns};
  await ghWriteJson('data/staff.json',staffPayload,'Update staff master from childcare-shift page');
  await ghWriteJson('data/patterns.json',patternPayload,'Update pattern master from childcare-shift page');
  setPrivateRepoStatus(`保存完了: 職員DB・勤務パターンDBを ${staffRepoName()} に書き込みました。`);
}
async function loadPrivateMonth(){
  await ensureRepoMeta();
  const key=monthInfo().key;const file=await ghReadJson(`data/months/${key}.json`);const src=file.json.monthly||file.json.data||file.json;
  db.monthly[key]=src;loadMonthState();save();renderAll();setPrivateRepoStatus(`読込完了: ${key} の月次データをブラウザへ反映しました。`);
}
async function savePrivateMonth(){
  save();const key=monthInfo().key;const payload={schemaVersion:SCHEMA_VERSION,month:key,updatedAt:new Date().toISOString(),monthly:db.monthly[key]||currentMonthData()};
  await ghWriteJson(`data/months/${key}.json`,payload,`Update monthly shift data ${key}`);setPrivateRepoStatus(`保存完了: ${key} の月次データを ${staffRepoName()} に書き込みました。`);
}
function clearPrivateToken(){staffRepoToken='';staffRepoDefaultBranch='';if($('#staffRepoToken'))$('#staffRepoToken').value='';setPrivateRepoStatus('トークンをこのタブのメモリから消去しました。再接続する場合は新しいトークンを入力してください。','warn')}

async function runPrivateAction(label,fn,remember=true){
  if(remember){lastPrivateAction=fn;lastPrivateActionLabel=label}
  setPrivateBusy(label);
  try{return await fn()}catch(e){renderPrivateError(e,label);throw e}
}
function bindRepoButton(id,label,fn){
  $('#'+id)?.addEventListener('click',async()=>{try{await runPrivateAction(label,fn)}catch{}});
}
function bindPrivateRepo(){
  bindRepoButton('checkPrivateRepo','接続確認',checkPrivateRepo);
  bindRepoButton('loadPrivateMasters','職員・勤務パターンの読込',loadPrivateMasters);
  bindRepoButton('loadMastersFromPatterns','職員・勤務パターンの読込',loadPrivateMasters);
  bindRepoButton('savePrivateMasters','職員・勤務パターンの保存',savePrivateMasters);
  bindRepoButton('saveMastersFromPatterns','職員・勤務パターンの保存',savePrivateMasters);
  bindRepoButton('loadPrivateMonth','この月の読込',loadPrivateMonth);
  bindRepoButton('savePrivateMonth','この月の保存',savePrivateMonth);
  $('#clearPrivateToken')?.addEventListener('click',clearPrivateToken);
  $('#staffRepoName')?.addEventListener('change',()=>{staffRepoDefaultBranch=''});
}

bindPrivateRepo();
