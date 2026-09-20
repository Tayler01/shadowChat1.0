import {chromium,webkit} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const route=JSON.parse(await readFile('output/shadow-circuit/original-review/lesson1-route.json','utf8'));
const out=process.env.SHADOW_CIRCUIT_ORIGINAL_DESKTOP==='true'?'output/playwright/shadow-circuit-original-desktop':'output/playwright/shadow-circuit-original';await mkdir(out,{recursive:true});const results=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.SHADOW_CIRCUIT_QA_BROWSER&&process.env.SHADOW_CIRCUIT_QA_BROWSER!==name)continue;
 let page;let moveIndex=-1;
 const browser=await type.launch({headless:true,...(process.env.SHADOW_CIRCUIT_QA_FULL_CHROMIUM==='true'&&name==='chromium'?{channel:'chromium'}:{}),...(name==='chromium'&&process.env.SHADOW_CIRCUIT_QA_HARDWARE!=='true'?{args:['--use-angle=swiftshader']}: {})});
 try {
 page=await browser.newPage({viewport:process.env.SHADOW_CIRCUIT_ORIGINAL_DESKTOP==='true'?{width:1280,height:800}:{width:844,height:390},hasTouch:true,isMobile:name==='webkit'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const fetch=window.fetch.bind(window);window.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);return u.hostname.endsWith('.supabase.co')?Promise.resolve(new Response(u.pathname.startsWith('/auth/')?'{}':'[]',{headers:{'content-type':'application/json'}})):fetch(input,init)}});
 await page.goto('http://127.0.0.1:4175/?view=games&localPreview=shadow-circuit&privateCampaign=mscc');
 await page.getByText('Your original 149-level campaign is loaded locally.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Levels',exact:true}).click();
 const count=await page.locator('.circuit-level-list>button').count();
 await page.getByRole('button',{name:/^01 LESSON 1 /}).click();await page.getByRole('button',{name:'Enter chamber',exact:true}).click();
 await page.waitForTimeout(500);await page.screenshot({path:out+'/'+name+'-lesson1.png'});
 for(let i=0;i<route.directions.length;i++){
   moveIndex=i;console.log(name,i,route.trace[i].cell);
   await page.getByRole('button',{name:'Move '+['up','right','down','left'][route.directions[i]],exact:true}).tap();
   await page.waitForFunction(cell=>document.querySelector('[data-testid="shadow-circuit"]')?.getAttribute('data-cell')===String(cell),route.trace[i].cell);
 }
 await page.getByText('Circuit complete',{exact:true}).waitFor();
 await page.getByTitle('Green keys: 1',{exact:true}).waitFor();
 await page.getByText('Result saved on this device',{exact:true}).waitFor();
 await page.screenshot({path:out+'/'+name+'-lesson1-cleared.png'});
 await page.getByRole('button',{name:'Return to menu',exact:true}).click();
 await page.getByRole('button',{name:'Levels',exact:true}).click();await page.getByRole('button',{name:'Unlock level 3: LESSON 3',exact:true}).click();await page.getByRole('textbox',{name:'Code or level password'}).fill('ECBQ');await page.getByRole('button',{name:'Apply',exact:true}).click();await page.getByRole('button',{name:/^03 LESSON 3 /}).click();await page.getByRole('button',{name:'Enter chamber',exact:true}).click();await page.waitForTimeout(300);await page.screenshot({path:out+'/'+name+'-lesson3.png'});
 results.push({browser:name,renderer:process.env.SHADOW_CIRCUIT_QA_HARDWARE==='true'?'default GPU':name==='chromium'?'SwiftShader':'WebKit default',count,lesson1InputOnlyClear:true,moves:route.directions.length,errors});
 }catch(error){const screen=await page?.getByTestId('shadow-circuit').getAttribute('data-screen').catch(()=>null);const body=await page?.locator('body').innerText().catch(()=>null);await page?.screenshot({path:out+'/'+name+'-failure.png'}).catch(()=>{});results.push({browser:name,moveIndex,screen,body,error:error.message});process.exitCode=1}finally{await browser.close()}
}await writeFile(out+'/report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
