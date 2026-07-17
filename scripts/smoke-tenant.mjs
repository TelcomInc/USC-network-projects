import {spawn} from "node:child_process";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9334;
const child = spawn(chrome,["--headless=new","--disable-gpu","--disable-background-mode","--no-first-run",`--remote-debugging-port=${port}`,`--user-data-dir=C:\\Users\\Ryan\\AppData\\Local\\Temp\\asbuilt-tenant-smoke-${Date.now()}`,"about:blank"],{stdio:"ignore"});
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));

async function target(){
  for(let attempt=0;attempt<30;attempt+=1){
    try{
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(item => item.type === "page");
      if(page) return page;
    }catch(_error){}
    await delay(250);
  }
  throw new Error("Chrome DevTools did not start.");
}

try{
  const page = await target();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const exceptions = [];
  let id=0;
  socket.addEventListener("message",event=>{
    const message=JSON.parse(event.data);
    if(message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails?.text || "Browser exception");
    if(message.id && pending.has(message.id)){
      const task=pending.get(message.id);pending.delete(message.id);
      if(message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
    }
  });
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  const send=(method,params={})=>new Promise((resolve,reject)=>{id+=1;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  await send("Runtime.enable");
  await send("Page.enable");
  const manifest={urlReservation:{slug:"acme"},authentication:{allowedDomains:"acme.com"},selectedHeaders:[{label:"Device Number",key:"deviceNumber"},{label:"Device Type",key:"deviceType"},{label:"Location",key:"location"},{label:"Port",key:"port"},{label:"Notes",key:"notes"}],attachedDocs:[],template:{client:"Acme Facilities",devices:[{id:"ap",label:"Access Point",abbr:"AP",shape:"circle"}],markers:[],sections:["Cover Page"]}};
  await send("Page.addScriptToEvaluateOnNewDocument",{source:`window.__ASBUILT_TENANT_MANIFEST__=${JSON.stringify(manifest)}`});
  await send("Page.navigate",{url:"http://127.0.0.1:4174/index.html"});
  await delay(1800);
  const evaluated=await send("Runtime.evaluate",{returnByValue:true,expression:`({slug:TENANT_SLUG,storage:STORAGE_KEY,client:currentProject().client,project:currentProject().name,formClient:document.getElementById("clientName").value,uofscInProject:JSON.stringify(currentProject()).includes("University of South Carolina")})`});
  const value=evaluated.result?.value;
  if(!value || value.slug!=="acme" || !value.storage.endsWith(":acme") || value.client!=="Acme Facilities" || value.uofscInProject){
    throw new Error(`Tenant isolation failed: ${JSON.stringify(value)}`);
  }
  if(exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join(" | ")}`);
  console.log(JSON.stringify({ok:true,...value}));
  socket.close();
}finally{
  child.kill();
}
