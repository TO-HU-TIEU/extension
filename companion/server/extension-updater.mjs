import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const repository = 'TO-HU-TIEU/extension';
const compare = (a,b) => {
  if (![a,b].every(v=>/^\d+(?:\.\d+){0,3}$/.test(v))) throw new Error('Phiên bản không hợp lệ.');
  const x=a.split('.').map(Number),y=b.split('.').map(Number);
  for(let i=0;i<4;i++)if((x[i]||0)!==(y[i]||0))return (x[i]||0)-(y[i]||0);
  return 0;
};
export function publicAsset(release) {
  const version=String(release.tag_name||'').replace(/^v/,'');compare(version,version);
  const url=`https://github.com/${repository}/releases/download/v${version}/assistant-update-${version}.zip`;
  const asset=release.assets?.find(a=>a.browser_download_url===url);
  if(release.draft||release.prerelease||!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||''))throw new Error('Gói cập nhật chưa được xác thực.');
  return {version,url,digest:asset.digest.slice(7)};
}
export function createExtensionUpdater(config) {
  let busy=false;
  async function target() {
    if(!config.extensionPath)throw new Error('Cài trình cập nhật một lần để liên kết thư mục extension.');
    const path=await realpath(config.extensionPath);
    const manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8'));
    if(manifest.name!=='Assistant'||manifest.manifest_version!==3)throw new Error('Thư mục cài đặt không phải Assistant.');
    return {path,manifest};
  }
  return {
    async status(){try{await target();return{supported:true,busy}}catch{return{supported:false,busy}}},
    async install(){
      if(busy)throw new Error('Đang cập nhật. Hãy chờ hoàn tất.');
      busy=true;let folder;
      try {
        const {path,manifest}=await target();
        const response=await fetch(`https://api.github.com/repos/${repository}/releases/latest`,{headers:{'User-Agent':'Assistant-Updater',Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw new Error('Không tải được thông tin bản cập nhật.');
        const asset=publicAsset(await response.json());
        if(compare(asset.version,manifest.version)<=0)return{updated:false,version:manifest.version};
        const download=await fetch(asset.url,{signal:AbortSignal.timeout(60000)});
        if(!download.ok)throw new Error('Không tải được gói cập nhật.');
        const chunks=[];let size=0;
        for await(const chunk of download.body){size+=chunk.length;if(size>8*1024*1024)throw new Error('Gói cập nhật vượt giới hạn.');chunks.push(chunk)}
        const data=Buffer.concat(chunks);
        if(createHash('sha256').update(data).digest('hex')!==asset.digest)throw new Error('Gói cập nhật sai mã kiểm tra.');
        folder=await mkdtemp(join(tmpdir(),'assistant-update-'));
        const zip=join(folder,'update.zip');await writeFile(zip,data);
        await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(dirname(fileURLToPath(import.meta.url)),'install-extension-update.ps1'),'-Archive',zip,'-Target',path,'-Version',asset.version],{windowsHide:true,timeout:60000});
        return{updated:true,version:asset.version};
      } finally {busy=false;if(folder)await rm(folder,{recursive:true,force:true})}
    }
  };
}
