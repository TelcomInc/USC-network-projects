import {spawn} from "node:child_process";
import {createServer} from "node:net";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = await new Promise((resolve,reject) => {
  const server = createServer();
  server.once("error",reject);
  server.listen(0,"127.0.0.1",() => {
    const address = server.address();
    server.close(error => error ? reject(error) : resolve(address.port));
  });
});
const child = spawn(chrome,["--headless=new","--disable-gpu","--disable-dev-shm-usage","--no-sandbox","--disable-background-mode","--no-first-run",`--remote-debugging-port=${port}`,`--user-data-dir=C:\\Users\\Ryan\\AppData\\Local\\Temp\\asbuilt-tenant-smoke-${Date.now()}`,"about:blank"],{stdio:"ignore"});
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
  const evaluated=await send("Runtime.evaluate",{returnByValue:true,expression:`(()=>{
    state.currentRole="admin";
    const project=currentProject();
    project.devices=[{"Device Number":"CAM9","Device Type":"Camera","Location":"Lobby"},{"Device Number":"CAM1","Device Type":"Camera","Location":"Hall"}];
    project.markers=[{id:"m1",label:"CAM9",type:"Camera",sheet:1,x:10,y:10,approved:true},{id:"m2",label:"CAM1",type:"Camera",sheet:3,x:20,y:20,approved:true}];
    renderAll(); renderDeviceData(); renderPlans(); document.getElementById("renumberMapIcons").click();
    go("map2");
    const secondMapActive=document.getElementById("page-map2").classList.contains("active");
    const secondMapMarkers=document.querySelectorAll("#planStage2 .marker.interactive").length;
    go("plans");
    const firstMapActive=document.getElementById("page-plans").classList.contains("active");
    return {slug:TENANT_SLUG,storage:STORAGE_KEY,client:project.client,project:project.name,formClient:document.getElementById("clientName").value,uofscInProject:JSON.stringify(project).includes("University of South Carolina"),deviceDataTab:Boolean(document.querySelector('[data-page="device-data"]')),map2Tab:Boolean(document.querySelector('[data-page="map2"]')),firstMapActive,secondMapActive,protectedHeaders:document.querySelectorAll("#deviceSheet th").length,interactiveMarkers:document.querySelectorAll("#planStage .marker.interactive").length,secondMapMarkers,continuousLabels:project.markers.map(marker=>marker.label).join(","),requiredColumns:REQUIRED_DEVICE_COLUMNS.every(column=>project.columns.includes(column))};
  })()`});
  const value=evaluated.result?.value;
  if(!value || value.slug!=="acme" || !value.storage.endsWith(":acme") || value.client!=="Acme Facilities" || value.uofscInProject || !value.deviceDataTab || !value.map2Tab || !value.firstMapActive || !value.secondMapActive || value.protectedHeaders < 10 || value.interactiveMarkers !== 2 || value.secondMapMarkers !== 2 || value.continuousLabels !== "CAM1,CAM2" || !value.requiredColumns){
    throw new Error(`Tenant isolation failed: ${JSON.stringify(value)}`);
  }
  if(exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join(" | ")}`);
  console.log(JSON.stringify({ok:true,...value}));
  socket.close();
}finally{
  child.kill();
}
