import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[2],'utf8');
function extract(prefix){let start=source.indexOf(prefix);assert(start>=0,prefix);let i=source.indexOf('{',start)+1,depth=1;for(;depth;i++){if(source[i]==='{')depth++;if(source[i]==='}')depth--;}return source.slice(start,i);}
const match=source.match(/function ([\w$]+)\(e,t,r\)\{if\(!t\|\|!e\)return!1;/);assert(match);
const name=match[1],fn=extract('function '+name+'(');const active=vm.runInNewContext('('+fn+')');
const live=(process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')).find(e=>e.entity_id==='media_player.house'):{entity_id:'media_player.house',state:'playing',attributes:{app_id:'spotify_connect://audio_source/test',active_queue:null,media_content_id:'spotify_connect://audio_source/test',media_title:'Track',media_artist:'Artist',media_position:12,media_duration:300}});live.last_updated=new Date().toISOString();let h={connected:true,states:{[live.entity_id]:live}};
assert.equal(active(h,live,{}),true,'Actual external Spotify Connect must display as active');
assert.equal(active({...h,connected:false},live,{}),false);assert.equal(active(h,{...live,state:'unavailable'},{}),false);assert.equal(active(h,{...live,state:'idle'},{inactive_when_idle:true}),false);
const native={...live,attributes:{...live.attributes,app_id:'music_assistant',active_queue:'house'}};assert.equal(active(h,native,{}),true);
const method1=extract('async getPlayerProgress(){'),method2=extract('async getPlayerActiveItemDuration(){');let calls=0;
const C=vm.runInNewContext('class C{'+method1+method2+'};C',{[name]:active});const c=new C();c.hass=h;c.activeMediaPlayer=live;c.activeEntityConfig={};c.actionGetCurrentQueue=async()=>{calls++;throw Error('Queue must not be requested');};
assert.equal(await c.getPlayerProgress(),live.attributes.media_position??0);assert.equal(await c.getPlayerActiveItemDuration(),live.attributes.media_duration);assert.equal(calls,0);
c.activeMediaPlayer=native;c.actionGetCurrentQueue=async()=>{calls++;return {elapsed_time:42,current_item:{duration:300}}};assert.equal(await c.getPlayerProgress(),42);assert.equal(await c.getPlayerActiveItemDuration(),300);assert.equal(calls,2);
console.log('PASS external active metadata/progress/no queue, native queue, disconnected/unavailable/idle controls');
