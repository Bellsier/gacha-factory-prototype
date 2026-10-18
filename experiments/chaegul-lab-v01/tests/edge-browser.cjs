const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const url='http://127.0.0.1:43191/artifacts/chaegul-gongbang-lab-v0.1-single.html';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),report={checks:[],fileProtocol:null,errors:[]};
async function pageFor(init){const c=await browser.newContext({viewport:{width:1280,height:800}});if(init)await c.addInitScript(init);const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>window.chaegul);return {c,p};}
const check=n=>{report.checks.push(n);console.log('PASS',n);};
try{
 let {c,p}=await pageFor(()=>{if(!localStorage.getItem('gachaFactorySave'))localStorage.setItem('gachaFactorySave','ORIGINAL-UNCHANGED');if(!localStorage.getItem('gachaFactoryView'))localStorage.setItem('gachaFactoryView','classic');});
 await p.keyboard.press('p');await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>localStorage.getItem('gachaFactorySave')),'ORIGINAL-UNCHANGED');assert.equal(await p.evaluate(()=>localStorage.getItem('gachaFactoryView')),'classic');check('Existing save/view keys remain untouched');
 await p.keyboard.press('i');const dl=p.waitForEvent('download');await p.locator('#export-save').click();const download=await dl;await download.saveAs('evidence/exported-save.json');assert.equal(JSON.parse(fs.readFileSync('evidence/exported-save.json')).version,1);check('JSON export downloads valid save');await c.close();
 ({c,p}=await pageFor(()=>{localStorage.setItem('chaegulGongbang.experimental.v01','{"version":99,"keep":"original"}');}));await p.keyboard.press('p');await p.waitForTimeout(500);assert.equal(await p.evaluate(()=>localStorage.getItem('chaegulGongbang.experimental.v01')),'{"version":99,"keep":"original"}');check('Future save preserved on manual save');await c.close();
 ({c,p}=await pageFor(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};}));await p.keyboard.press('p');await p.waitForTimeout(200);assert.ok((await p.locator('#save-status').textContent()).includes('저장 실패'));assert.equal(await p.locator('#fatal').isVisible(),false);check('Storage failure displayed without crash');await c.close();
 ({c,p}=await pageFor());await p.setViewportSize({width:2560,height:600});await p.waitForTimeout(400);const corners=await p.locator('#world').evaluate(c=>[c.getContext('2d').getImageData(1,1,1,1).data[3],c.getContext('2d').getImageData(c.width-2,c.height-2,1,1).data[3]]);report.wideViewportAlpha=corners;assert.deepEqual(corners,[255,255]);check('Wide viewport stays inside rendered terrain');await c.close();
 report.passed=true;
}catch(e){report.failure=e.stack;report.passed=false;console.error(e.stack);process.exitCode=1;}
finally{
 const p=await browser.newPage();try{await p.goto('file:///workspace/work/chaegul-lab/artifacts/chaegul-gongbang-lab-v0.1-single.html');await p.waitForFunction(()=>window.chaegul);report.fileProtocol='passed';}catch(e){report.fileProtocol={status:'blocked',error:e.message};console.log('FILE protocol blocked:',e.message.split('\n')[0]);}await browser.close();fs.writeFileSync('evidence/edge-report.json',JSON.stringify(report,null,2));}
})();
