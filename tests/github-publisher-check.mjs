import assert from 'node:assert/strict';
import { build } from 'esbuild';
const stub = `
export class App {}
export class Notice { constructor(text) { globalThis.notices.push(text); } }
function el() { return { createEl(){return el()}, empty(){}, querySelector(){return null} }; }
export class Modal { constructor(app){this.app=app;this.contentEl=el()} open(){this.onOpen?.()} close(){this.onClose?.()} }
export class Setting {
 constructor(container){this.container=container;this.controlEl=el();this.name=''}
 setName(v){this.name=v;return this} setDesc(){return this}
 input(cb){const widget={ inputEl:{}, setValue(v){this.value=v;return this},setPlaceholder(){return this},addOption(){return this},onChange(fn){this.change=fn;return this} };cb(widget);globalThis.widgets.push({name:this.name,widget});return this}
 addText(cb){return this.input(cb)} addTextArea(cb){return this.input(cb)} addDropdown(cb){return this.input(cb)}
 addButton(cb){const b={setButtonText(v){this.text=v;return this},setCta(){return this},setDisabled(){return this},onClick(fn){this.click=fn;return this}};cb(b);globalThis.buttons.push(b);return this}
}
export class TFile {constructor(path){this.path=path;this.name=path.split('/').pop();this.extension=this.name.split('.').pop();this.basename=this.name.replace(/\\.[^.]+$/,'')}}
export class Plugin {constructor(){this.app=globalThis.fixtureApp;this.commands=[]}async loadData(){return globalThis.savedSettings}async saveData(data){globalThis.savedSettings=JSON.parse(JSON.stringify(data))}addCommand(cmd){this.commands.push(cmd)}addRibbonIcon(){}addSettingTab(){}registerObsidianProtocolHandler(name,fn){this.uriHandler=fn}registerEvent(){} }
export class PluginSettingTab {constructor(app,plugin){this.app=app;this.plugin=plugin;this.containerEl=el()}}
export const normalizePath=(p)=>p;
export const parseYaml=(s)=>Object.fromEntries(s.split('\\n').filter(l=>l.includes(':')).map(l=>{const [key,...rest]=l.split(':');let v=rest.join(':').trim();if(v==='true')v=true;if(v==='false')v=false;return [key,v]}));
export const requestUrl=(args)=>globalThis.transport(args);
`;
const compiled = await build({stdin:{contents:"export * from './github'; export {default as PublisherPlugin} from './main'; export {TFile} from 'obsidian';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2020',plugins:[{name:'obsidian-test',setup(b){b.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:stub,loader:'js'}));}}]});
globalThis.notices=[];globalThis.widgets=[];globalThis.buttons=[];globalThis.window={open:(url)=>globalThis.openedUrl=url,setTimeout};
const api = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const {publishGithub,sha256,createPkce,GithubConnector,PublisherPlugin}=api;
const pkce=await createPkce();
assert.equal(pkce.verifier.length,43);assert.equal(pkce.challenge.length,43);
assert.equal(Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pkce.verifier))).toString('base64url'),pkce.challenge);
const connection={grant:'TOMOS_PUBLISH_GRANT',repository:{id:42,full_name:'alice/blog',branch:'main',content_root:'content'}};
const previous={content_path:'content/old/entry.md',asset_paths:['content/old/files/article-123456789abc/tms-0123456789abcdef.png'],commit_sha:'old',date:'2026-10-05',published:'2026-10-05T16:30:00+00:00'};
let calls=[],mode='ok';
const reply=(json,status=200)=>({json,status});
globalThis.transport=async(args)=>{
 calls.push(args);assert(args.url.startsWith('https://tomoswords.org/publish-api/github/'));assert(!args.url.includes('proxy.php'));
 if(args.url.endsWith('connect/exchange.php'))return reply({ok:true,discovery_grant:'DISCOVERY'});
 if(args.url.endsWith('repositories.php'))return reply({repositories:[{id:42,full_name:'alice/blog',default_branch:'main'}]});
 if(args.url.endsWith('connect/bind.php'))return reply({ok:true,publish_grant:connection.grant,repository:connection.repository});
 if(args.url.endsWith('publish-image.php'))return mode==='chunk-error'?reply({ok:false,error:{code:'invalid_image',message:'Invalid image'}},400):reply({ok:true});
 const body=JSON.parse(args.body);
 if(body.action==='cancel')return reply({ok:true});
 if(mode==='conflict')return reply({ok:false,error:{code:'branch_conflict'}},409);
 if(body.action==='start')return reply({ok:true,upload_id:'upload'});
 return reply({ok:true,...previous,content_path:'content/news/entry.md',commit_sha:'new'});
};
const original='---\ntitle: Test\n---\nBody';
await publishGithub(connection,'entry.md','news',false,{content:original,images:[]},previous);
assert.equal(calls.length,1);const payload=JSON.parse(calls[0].body);assert.deepEqual(payload.previous,{content_path:previous.content_path,asset_paths:previous.asset_paths});assert.equal(payload.document.content,original);assert.equal(calls[0].headers.Authorization,'Bearer '+connection.grant);assert(!calls[0].url.includes(connection.grant));
const imageBytes=new Uint8Array(524300).buffer;const name='tms-'+(await sha256(imageBytes)).slice(0,16)+'.png';
const prepared={content:`---\nimage: images/${name}\n---\n![photo](images/${name})\n![external](https://example.com/images/${name})`,images:[{name,data:imageBytes,mimeType:'image/png'}]};
calls=[];await publishGithub(connection,'entry.md','news',false,prepared,previous);
assert.equal(calls.filter(c=>c.url.endsWith('publish-image.php')).length,2);const start=JSON.parse(calls[0].body);assert.match(start.document.content,/image: files\/article-[a-f0-9]{12}\//);assert(start.document.content.includes('https://example.com/images/'+name));assert(prepared.content.includes('image: images/'));assert.equal(JSON.parse(calls.at(-1).body).action,'finalize');
mode='chunk-error';calls=[];await assert.rejects(publishGithub(connection,'entry.md','news',false,prepared,previous),/Invalid image/);assert.equal(JSON.parse(calls.at(-1).body).action,'cancel');
mode='conflict';await assert.rejects(publishGithub(connection,'entry.md','news',false,{content:original,images:[]},previous),/Branch/);mode='ok';
let savedConnection=null;const connector=new GithubConnector({},async c=>savedConnection=c);
await connector.start();const url=new URL(globalThis.openedUrl);assert(url.searchParams.get('state'));assert(!url.searchParams.has('code_verifier'));assert(!url.searchParams.has('grant'));calls=[];
await connector.receive('CODE','wrong');assert.equal(calls.length,0);
await connector.receive('CODE',url.searchParams.get('state'));assert.equal(calls.length,2);assert.equal(JSON.parse(calls[0].body).state,url.searchParams.get('state'));assert.equal(calls[1].headers.Authorization,'Bearer DISCOVERY');
await globalThis.buttons.find(b=>b.text==='このRepositoryに接続').click();assert.deepEqual(savedConnection,connection);
connector.cancel();calls=[];await connector.receive('CODE',url.searchParams.get('state'));assert.equal(calls.length,0);
// Existing users retain Core settings and /post/inbox/api/ sending behavior.
globalThis.savedSettings={tomosUrl:'https://example.com/tomos',token:'CORE_TOKEN',articleFolder:'Tomos'};
const file=new api.TFile('article.md');
// Use the same bundled TFile constructor through an exported fixture helper below.
globalThis.fixtureApp={vault:{on:()=>({}),read:async()=>original},workspace:{getActiveFile:()=>file}};
const plugin=new PublisherPlugin();await plugin.onload();assert.equal(plugin.settings.target,'core');assert.equal(plugin.settings.token,'CORE_TOKEN');assert.equal(plugin.settings.tomosUrl,'https://example.com/tomos');
assert.equal(plugin.settings.github,null);
let vaultWrites=0;globalThis.fixtureApp.vault.modify=async()=>{vaultWrites++};
// Core helper remains unchanged; request path and auth remain the dedicated Core contract.
calls=[];globalThis.transport=async a=>{calls.push(a);return reply({state:'published'})};await plugin.testConnection();assert.equal(calls[0].url,'https://example.com/tomos/post/inbox/api/');assert.equal(calls[0].headers['X-Tomos-Token'],'CORE_TOKEN');
await plugin.commands.find(c=>c.id==='upload-current-markdown-to-tomos').callback();
assert(calls.some(c=>c.method==='POST'&&c.url==='https://example.com/tomos/post/inbox/api/'));
assert.equal(vaultWrites,0);
const oldHistory={...previous};plugin.settings.githubPublications['42:alice/blog:main:content\nfolder/entry.md']=oldHistory;
// A folder rename must move local publication tracking as well as a file rename.
let renameHandler;globalThis.fixtureApp.vault.on=(event,fn)=>{renameHandler=fn;return {}};
await plugin.onload();
plugin.settings.githubPublications['42:alice/blog:main:content\nfolder/entry.md']=oldHistory;
renameHandler({path:'renamed'},'folder');
assert.deepEqual(plugin.settings.githubPublications['42:alice/blog:main:content\nrenamed/entry.md'],oldHistory);
assert(!plugin.settings.githubPublications['42:alice/blog:main:content\nfolder/entry.md']);
console.log('Publisher GitHub: PKCE/handoff/bind, Markdown/previous, OGP/images/chunks/cancel, conflicts, source preservation, Core settings/connection: PASS');
