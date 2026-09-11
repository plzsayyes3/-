// GitHub API client for the private staff repository.
// This module only handles authentication, HTTP, SHA baselines and JSON transport.

let staffRepoToken='';
let staffRepoDefaultBranch='';
let privateFileBaselines={};
const DEFAULT_STAFF_REPO='plzsayyes3/childacare-staff';
const TOKEN_SETTINGS_URL='https://github.com/settings/personal-access-tokens';

function staffRepoName(){return String($('#staffRepoName')?.value||DEFAULT_STAFF_REPO).trim()}
function captureToken(){staffRepoToken=String($('#staffRepoToken')?.value||'').trim();if($('#staffRepoToken'))$('#staffRepoToken').value='';return staffRepoToken}
function requireToken(){
  const typed=String($('#staffRepoToken')?.value||'').trim();
  if(typed){captureToken();staffRepoDefaultBranch='';privateFileBaselines={}}
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
function contentApiPath(path){return `/contents/${path.split('/').map(encodeURIComponent).join('/')}`}

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
  const meta=await ghFetch(repoApiUrl());staffRepoDefaultBranch=meta.default_branch||'main';return staffRepoDefaultBranch;
}
async function ghReadJson(path,{trackBaseline=false}={}){
  const data=await ghFetch(repoApiUrl(contentApiPath(path)));
  if(trackBaseline)privateFileBaselines[path]=data.sha;
  return {sha:data.sha,json:JSON.parse(decodeBase64Utf8(data.content))};
}
async function ghCurrentSha(path){
  try{return (await ghFetch(repoApiUrl(contentApiPath(path)))).sha}
  catch(e){if(e instanceof GitHubApiError&&e.status===404)return null;throw e}
}
async function ghAssertUnchanged(paths){
  for(const path of paths){
    if(!Object.prototype.hasOwnProperty.call(privateFileBaselines,path))continue;
    const current=await ghCurrentSha(path),baseline=privateFileBaselines[path];
    if(current!==baseline)throw new GitHubApiError(409,'Conflict',{message:`${path} は読み込み後にGitHub上で更新されています。上書きせず停止しました。`});
  }
}
async function ghWriteJson(path,obj,message){
  await ensureRepoMeta();
  let sha;
  if(Object.prototype.hasOwnProperty.call(privateFileBaselines,path))sha=privateFileBaselines[path];
  else sha=await ghCurrentSha(path);
  const payload={message,content:encodeBase64Utf8(JSON.stringify(obj,null,2)),branch:staffRepoDefaultBranch};
  if(sha)payload.sha=sha;
  const result=await ghFetch(repoApiUrl(contentApiPath(path)),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  privateFileBaselines[path]=result?.content?.sha||await ghCurrentSha(path);
  return result;
}
function clearPrivateConnection(){
  staffRepoToken='';staffRepoDefaultBranch='';privateFileBaselines={};if($('#staffRepoToken'))$('#staffRepoToken').value='';
}
function resetPrivateRepoMetadata(){staffRepoDefaultBranch='';privateFileBaselines={}}
