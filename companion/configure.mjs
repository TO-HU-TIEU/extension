import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Cần Node.js 22 trở lên.');
const root=resolve(process.argv[2]),extensionPath=resolve(process.argv[3]);
const manifest=JSON.parse(await readFile(join(extensionPath,'manifest.json'),'utf8'));
if(manifest.name!=='Assistant')throw new Error('Thư mục đã chọn không phải Assistant.');
const configFile=join(root,'server','config.local.mjs');
let config={port:8792,localToken:randomBytes(32).toString('hex'),openaiApiKey:'',apiModel:'gpt-4.1-mini',timeoutMs:60000};
try{await access(configFile);config=(await import(pathToFileURL(configFile))).default}catch(error){if(error.code!=='ENOENT')throw error}
config.port=8792;
config.extensionPath=extensionPath;
let existing='';try{existing=await readFile(join(extensionPath,'config.local.js'),'utf8')}catch(error){if(error.code!=='ENOENT')throw error}
const pairing=existing.match(/["']?localToken["']?\s*:\s*["']([A-Za-z0-9_-]{32,256})["']/)?.[1];
if(pairing&&pairing!=='UNCONFIGURED_RUN_COMPANION_INSTALLER')config.localToken=pairing;
await writeFile(configFile,`export default ${JSON.stringify(config)};\n`,{mode:0o600});
if(!pairing||pairing==='UNCONFIGURED_RUN_COMPANION_INSTALLER')await writeFile(join(extensionPath,'config.local.js'),`globalThis.X_REPLY_CONFIG = Object.freeze(${JSON.stringify({serverUrl:'http://127.0.0.1:8791',localToken:config.localToken})});\n`);
console.log('Đã liên kết trình cập nhật với Assistant.');
