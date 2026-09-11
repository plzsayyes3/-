// Private repository workflow and recovery UI.
// Low-level GitHub transport lives in github-client.js.

let lastPrivateAction=null;
let lastPrivateActionLabel='';
let lastPrivateActionKind='';

function setPrivateRepoStatus(message,type='ok'){
  const el=$('#privateRepoStatus');if(!el)return;el.innerHTML=`<div class="repo-status ${type}">${esc(message)}</div>`;
}

function recoveryInfo(error,actionLabel,actionKind){
  const status=error?.status||null,code=error?.code||'',message=String(error?.message||error||'不明なエラー');
  const isSave=/保存/.test(actionLabel||'');
  if(code==='TOKEN_MISSING')return {title:'トークンが未入力です',summary:'上部のGitHubトークン欄にトークンを貼り付ければ続行できます。',steps:['GitHubトークン欄にトークンを貼り付ける','「接続を再試行」を押す','接続OKになったら元の操作をもう一度行う'],focusToken:true,retryConnection:true};
  if(code==='REPO_FORMAT')return {title:'リポジトリ名の形式が違います',summary:`現在の入力: ${staffRepoName()}`,steps:['Private職員DBを owner/repo 形式にする','通常は plzsayyes3/childacare-staff を使用する','「接続を再試行」を押す'],retryConnection:true};
  if(code==='LOCAL_VALIDATION')return {title:'保存前の入力チェックで止まりました',summary:'不正な状態をPrivateリポジトリへ保存しないため停止しています。',steps:['画面上部の「入力エラー」を確認する','該当項目を修正する','整合性チェックを実行する','エラーが0件になったら保存を再試行する'],retryLast:true};
  if(status===401)return {title:'トークンを認証できません',summary:'トークンが無効・期限切れ・入力違いの可能性があります。',steps:['GitHubでトークンが有効か確認する','必要なら新しいFine-grained tokenを作る','上部のトークン欄へ貼り直す','「接続を再試行」を押す'],focusToken:true,retryConnection:true,showTokenSettings:true};
  if(status===403)return {title:'トークンの権限が足りません',summary:isSave?'保存には childacare-staff への Contents: Read and write が必要です。':'読込には childacare-staff への Contents: Read が必要です。',steps:[`Fine-grained token の対象に ${staffRepoName()} が含まれているか確認する`,isSave?'Repository permissions → Contents を Read and write にする':'Repository permissions → Contents を Read-only 以上にする','トークンを上部へ貼り直す','「接続を再試行」を押す'],focusToken:true,retryConnection:true,showTokenSettings:true};
  if(status===404&&actionKind==='month-load')return {title:'この月のファイルはまだありません',summary:'初回の月なら正常です。月次入力後に「この月をPrivateへ保存」を押すと新規作成されます。',steps:['対象月が正しいか確認する','月次入力・休日生成を進める','「この月をPrivateへ保存」で新規作成する']};
  if(status===404)return {title:'Privateリポジトリまたは必要ファイルが見つかりません',summary:'リポジトリ名、トークン対象、必要JSONのいずれかを確認します。',steps:[`Private職員DBが ${staffRepoName()} になっているか確認する`,`トークンの対象に ${staffRepoName()} が含まれているか確認する`,'接続確認を行う','接続OKなら data/staff.json と data/patterns.json の存在を確認する'],retryConnection:true,showTokenSettings:true};
  if(status===409)return {title:'別の更新を検出したため保存を停止しました',summary:'GitHub上の変更を自動上書きしない安全側の動作です。ブラウザ上の編集内容は残っています。',steps:['「JSONバックアップ」を押して現在の作業内容を保存する',actionKind==='month-save'?'「この月をPrivateから再読込」で最新状態を確認する':'「職員・勤務パターンをPrivateから再読込」で最新状態を確認する','必要な変更だけもう一度反映する','保存を実行する'],backup:true,reloadKind:actionKind==='month-save'?'month':'masters'};
  if(status===422)return {title:'GitHubが保存内容を受け付けませんでした',summary:'保存先ブランチ、SHA、送信内容のいずれかに問題がある可能性があります。',steps:['接続確認を実行する','整合性チェックを実行する','問題がなければ同じ保存を再試行する'],retryConnection:true,retryLast:true};
  if(message.includes('JSON')||error instanceof SyntaxError)return {title:'Private側のJSONを読み取れません',summary:'対象JSONの形式が壊れている可能性があります。',steps:['Privateリポジトリの対象JSONを確認する','括弧抜け・末尾カンマ等を修正する','同じ読込操作を再試行する'],retryLast:true};
  return {title:'操作を完了できませんでした',summary:'下の順番で切り分けます。解決しなければ技術情報をそのまま共有してください。',steps:['接続確認を行う','同じ操作を1回だけ再試行する','改善しなければ「技術情報」をコピーする'],retryConnection:true,retryLast:true};
}

function renderPrivateError(error,actionLabel='操作',actionKind=''){
  const el=$('#privateRepoStatus');if(!el)return;const info=recoveryInfo(error,actionLabel,actionKind);
  const tech=`${actionLabel} / ${error?.status?`HTTP ${error.status} / `:''}${String(error?.message||error||'不明なエラー')}`;
  const actions=[];
  if(info.focusToken)actions.push('<button type="button" data-recovery="token">トークンを入力する</button>');
  if(info.retryConnection)actions.push('<button type="button" data-recovery="connect" class="primary">接続を再試行</button>');
  if(info.backup)actions.push('<button type="button" data-recovery="backup">JSONバックアップ</button>');
  if(info.reloadKind==='masters')actions.push('<button type="button" data-recovery="reload-masters" class="primary">職員・勤務パターンを再読込</button>');
  if(info.reloadKind==='month')actions.push('<button type="button" data-recovery="reload-month" class="primary">この月を再読込</button>');
  if(info.retryLast&&lastPrivateAction)actions.push(`<button type="button" data-recovery="retry" class="primary">${esc(lastPrivateActionLabel||'同じ操作')}を再試行</button>`);
  if(info.showTokenSettings)actions.push(`<a class="link-button" href="${TOKEN_SETTINGS_URL}" target="_blank" rel="noopener">GitHubのトークン設定を開く</a>`);
  el.innerHTML=`<section class="recovery-card" role="alert"><div class="recovery-head"><span class="recovery-badge">要対応</span><div><strong>${esc(info.title)}</strong><p>${esc(info.summary)}</p></div></div><ol class="recovery-steps">${info.steps.map((s,i)=>`<li><span>${i+1}</span><div>${esc(s)}</div></li>`).join('')}</ol><div class="recovery-actions">${actions.join('')}</div><details class="recovery-tech"><summary>技術情報</summary><code>${esc(tech)}</code></details></section>`;
  el.querySelector('[data-recovery="token"]')?.addEventListener('click',()=>$('#staffRepoToken')?.focus());
  el.querySelector('[data-recovery="connect"]')?.addEventListener('click',()=>runPrivateAction('接続確認','connect',checkPrivateRepo,false));
  el.querySelector('[data-recovery="backup"]')?.addEventListener('click',exportJson);
  el.querySelector('[data-recovery="reload-masters"]')?.addEventListener('click',()=>runPrivateAction('職員・勤務パターンの読込','masters-load',loadPrivateMasters));
  el.querySelector('[data-recovery="reload-month"]')?.addEventListener('click',()=>runPrivateAction('この月の読込','month-load',loadPrivateMonth));
  el.querySelector('[data-recovery="retry"]')?.addEventListener('click',()=>lastPrivateAction&&runPrivateAction(lastPrivateActionLabel,lastPrivateActionKind,lastPrivateAction,false));
}
function setPrivateBusy(label){const el=$('#privateRepoStatus');if(el)el.innerHTML=`<div class="repo-status busy"><strong>${esc(label)}</strong><span>処理中…</span></div>`}

function assertLocalSaveValid(){const v=validation();if(v.errors.length){renderValidation();const e=new Error(`入力エラーが${v.errors.length}件あります。`);e.code='LOCAL_VALIDATION';throw e}}

async function checkPrivateRepo(){requireToken();const meta=await ghFetch(repoApiUrl());staffRepoDefaultBranch=meta.default_branch||'main';setPrivateRepoStatus(`接続OK: ${staffRepoName()} / ${staffRepoDefaultBranch}。各タブ上部から読込・保存できます。`)}
async function loadPrivateMasters(){
  await ensureRepoMeta();
  const [staffFile,patternFile]=await Promise.all([ghReadJson('data/staff.json',{trackBaseline:true}),ghReadJson('data/patterns.json',{trackBaseline:true})]);
  if(!Array.isArray(staffFile.json.staff))throw new Error('data/staff.json に staff 配列がありません。');
  if(!Array.isArray(patternFile.json.patterns))throw new Error('data/patterns.json に patterns 配列がありません。');
  const normalized=migrateLoaded({patterns:patternFile.json.patterns,staff:staffFile.json.staff,monthly:db.monthly});
  db.patterns=normalized.patterns;db.staff=normalized.staff;save();renderAll();
  setPrivateRepoStatus(`読込完了: 職員${db.staff.length}名・勤務パターン${db.patterns.length}件。ブラウザの作業コピーを更新しました。`);
}
async function savePrivateMasters(){
  assertLocalSaveValid();
  await ghAssertUnchanged(['data/staff.json','data/patterns.json']);
  const staffPayload={schemaVersion:SCHEMA_VERSION,updatedAt:new Date().toISOString(),staff:db.staff.map(normalizeStaff)};
  const patternPayload={schemaVersion:SCHEMA_VERSION,updatedAt:new Date().toISOString(),patterns:db.patterns.map(normalizePattern)};
  const saved=[];
  try{await ghWriteJson('data/staff.json',staffPayload,'Update staff master from childcare-shift page');saved.push('staff.json');await ghWriteJson('data/patterns.json',patternPayload,'Update pattern master from childcare-shift page');saved.push('patterns.json')}
  catch(e){if(saved.length)e.message+=`（${saved.join(', ')} は保存済み）`;throw e}
  setPrivateRepoStatus(`保存完了: 職員DB・勤務パターンDBを ${staffRepoName()} に書き込みました。`);
}
async function loadPrivateMonth(){
  await ensureRepoMeta();const key=monthInfo().key;
  const file=await ghReadJson(`data/months/${key}.json`,{trackBaseline:true});const src=file.json.monthly||file.json.data||file.json;
  db.monthly[key]=normalizeMonth(src);loadMonthState();save();renderAll();setPrivateRepoStatus(`読込完了: ${key} の月次データをブラウザへ反映しました。`);
}
async function savePrivateMonth(){
  assertLocalSaveValid();save();const key=monthInfo().key,path=`data/months/${key}.json`;
  await ghAssertUnchanged([path]);const payload={schemaVersion:SCHEMA_VERSION,month:key,updatedAt:new Date().toISOString(),monthly:normalizeMonth(db.monthly[key]||currentMonthData())};
  await ghWriteJson(path,payload,`Update monthly shift data ${key}`);setPrivateRepoStatus(`保存完了: ${key} の月次データを ${staffRepoName()} に書き込みました。`);
}
function clearPrivateToken(){clearPrivateConnection();setPrivateRepoStatus('トークンをこのタブのメモリから消去しました。再接続する場合は新しいトークンを入力してください。','warn')}

async function runPrivateAction(label,kind,fn,remember=true){
  if(remember){lastPrivateAction=fn;lastPrivateActionLabel=label;lastPrivateActionKind=kind}setPrivateBusy(label);
  try{return await fn()}catch(e){renderPrivateError(e,label,kind);throw e}
}
function bindRepoButton(id,label,kind,fn){$('#'+id)?.addEventListener('click',async()=>{try{await runPrivateAction(label,kind,fn)}catch{}})}
function bindPrivateRepo(){
  bindRepoButton('checkPrivateRepo','接続確認','connect',checkPrivateRepo);
  bindRepoButton('loadPrivateMasters','職員・勤務パターンの読込','masters-load',loadPrivateMasters);
  bindRepoButton('loadMastersFromPatterns','職員・勤務パターンの読込','masters-load',loadPrivateMasters);
  bindRepoButton('savePrivateMasters','職員・勤務パターンの保存','masters-save',savePrivateMasters);
  bindRepoButton('saveMastersFromPatterns','職員・勤務パターンの保存','masters-save',savePrivateMasters);
  bindRepoButton('loadPrivateMonth','この月の読込','month-load',loadPrivateMonth);
  bindRepoButton('savePrivateMonth','この月の保存','month-save',savePrivateMonth);
  $('#clearPrivateToken')?.addEventListener('click',clearPrivateToken);
  $('#staffRepoName')?.addEventListener('change',resetPrivateRepoMetadata);
}
