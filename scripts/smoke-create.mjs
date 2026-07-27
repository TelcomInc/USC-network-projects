import {spawn} from "node:child_process";
import {createServer} from "node:net";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const createUrl = process.env.CREATE_SMOKE_URL || "http://127.0.0.1:4174/template.html";
const port = await new Promise((resolve,reject) => {
  const server = createServer();
  server.once("error",reject);
  server.listen(0,"127.0.0.1",() => {
    const address = server.address();
    server.close(error => error ? reject(error) : resolve(address.port));
  });
});
const profile = `C:\\Users\\Ryan\\AppData\\Local\\Temp\\asbuilt-create-smoke-${Date.now()}`;
const child = spawn(chrome,[
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-background-mode",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  createUrl
],{stdio:["ignore","ignore","pipe"]});
let chromeError = "";
child.stderr.on("data",chunk => { chromeError += chunk.toString(); });

const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function targets(){
  for(let attempt = 0; attempt < 30; attempt += 1){
    if(child.exitCode !== null) throw new Error(`Chrome exited before the Create page loaded (${child.exitCode}): ${chromeError.slice(-1200)}`);
    try{
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await response.json();
      const page = list.find(item => item.type === "page" && item.url.includes("template.html"));
      if(page) return page;
    }catch(_error){}
    await delay(250);
  }
  throw new Error(`Chrome DevTools did not expose the Create page. ${chromeError.slice(-1200)}`);
}

try{
  const target = await targets();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const exceptions = [];
  let id = 0;
  socket.addEventListener("message",event => {
    const message = JSON.parse(event.data);
    if(message.method === "Runtime.exceptionThrown"){
      const details=message.params.exceptionDetails || {};
      exceptions.push(details.exception?.description || `${details.text || "Browser exception"} at ${details.url || "page"}:${details.lineNumber ?? "?"}`);
    }
    if(message.id && pending.has(message.id)){
      const {resolve,reject} = pending.get(message.id);
      pending.delete(message.id);
      if(message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  });
  socket.addEventListener("close",() => {
    for(const {reject} of pending.values()) reject(new Error(`Chrome closed the page connection. ${chromeError.slice(-1200)}`));
    pending.clear();
  });
  await new Promise((resolve,reject) => {
    socket.addEventListener("open",resolve,{once:true});
    socket.addEventListener("error",reject,{once:true});
  });
  const send = (method,params = {}) => new Promise((resolve,reject) => {
    id += 1;
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
  await send("Runtime.enable");
  await delay(1800);
  const result = await send("Runtime.evaluate",{
    returnByValue:true,
    awaitPromise:true,
    expression:`(async()=>{
      const required=["continueGuide","clientName","shellImage","authProvider","publishSite","publishPreflight","coachCard","addDeviceFromCatalog","manualDocFile","uploadManualPdf","runAuto","numberExisting","markerInspector"];
      const missing=required.filter(id=>!document.getElementById(id));
      startCoach();
      await new Promise(resolve=>setTimeout(resolve,180));
      const coachActive=document.getElementById("coachCard").classList.contains("active");
      closeCoach();
      go("devices");
      await new Promise(resolve=>setTimeout(resolve,80));
      const deviceCheckboxes=document.querySelectorAll("#deviceCatalog [data-toggle-device]").length;
      const deviceRemoveButtons=document.querySelectorAll("#deviceCatalog [data-delete-device]").length;
      const beforeDevices=state.devices.length;
      const firstDevice=document.querySelector("#deviceCatalog [data-toggle-device]:checked");
      firstDevice.checked=false;
      firstDevice.dispatchEvent(new Event("change",{bubbles:true}));
      const deviceRemovalWorked=state.devices.length===beforeDevices-1;
      const removedDevice=document.querySelector("#deviceCatalog [data-toggle-device]:not(:checked)");
      removedDevice.checked=true;
      removedDevice.dispatchEvent(new Event("change",{bubbles:true}));
      const deviceReselectionWorked=state.devices.length===beforeDevices;
      go("map");
      const sourceCanvas=document.createElement("canvas");
      sourceCanvas.width=document.getElementById("planCanvas").clientWidth || 1120;
      sourceCanvas.height=document.getElementById("planCanvas").clientHeight || 720;
      const sourceContext=sourceCanvas.getContext("2d");
      sourceContext.fillStyle="#fff";
      sourceContext.fillRect(0,0,sourceCanvas.width,sourceCanvas.height);
      const symbolY=Math.max(80,Math.min(150,Math.round(sourceCanvas.height*.3)));
      const leftMargin=70;
      const symbolSpacing=(sourceCanvas.width-leftMargin*2)/5;
      const expectedSymbols=Array.from({length:6},(_item,index)=>[Math.round(leftMargin+symbolSpacing*index),symbolY]);
      sourceContext.strokeStyle="#000";
      sourceContext.fillStyle="#000";
      sourceContext.lineWidth=3;
      expectedSymbols.forEach(([x,y])=>{
        sourceContext.beginPath();
        sourceContext.arc(x,y,7,0,Math.PI*2);
        sourceContext.stroke();
        sourceContext.fillRect(x-2,y-9,4,18);
        sourceContext.fillRect(x-9,y-2,18,4);
      });
      sourceContext.strokeRect(55,symbolY+75,18,18);
      sourceContext.beginPath();
      sourceContext.moveTo(105,symbolY+75);
      sourceContext.lineTo(123,symbolY+93);
      sourceContext.moveTo(123,symbolY+75);
      sourceContext.lineTo(105,symbolY+93);
      sourceContext.stroke();
      state.plan=sourceCanvas.toDataURL("image/png");
      state.planName="symbol-detection-test.png";
      state.planKind="image";
      state.legendName="";
      state.legendKind="";
      state.iconSamples=expectedSymbols.slice(0,3).map(([x,y],index)=>({deviceId:state.devices[0].id,x,y,sheet:1,createdAt:"test-"+index}));
      state.markers=[];
      renderAll();
      const planImage=document.querySelector("#planCanvas .plan-img");
      if(planImage && !planImage.complete) await new Promise((resolve,reject)=>{planImage.addEventListener("load",resolve,{once:true});planImage.addEventListener("error",reject,{once:true});});
      const autoReady=document.getElementById("runAuto").textContent==="Start Auto Map";
      document.getElementById("runAuto").click();
      for(let attempt=0;attempt<40&&document.getElementById("autoMarkStatus").textContent.includes("Scanning");attempt+=1) await new Promise(resolve=>setTimeout(resolve,50));
      const detectedMarkers=[...state.markers];
      const autoDetected=expectedSymbols.slice(3).filter(([x,y])=>detectedMarkers.some(marker=>marker.pending&&Math.hypot(marker.x-x,marker.y-y)<=6)).length;
      state.markers=[];
      document.getElementById("numberExisting").click();
      const numberedExisting=state.markers.length;
      const existingInteractive=state.markers.every(marker=>marker.interactive&&marker.label);
      const inspectorActive=document.getElementById("markerInspector").classList.contains("active");
      go("publish");
      await new Promise(resolve=>setTimeout(resolve,80));
      return {title:document.title,missing,coachActive,deviceCheckboxes,deviceRemoveButtons,deviceRemovalWorked,deviceReselectionWorked,autoReady,autoDetected,detectedMarkers:detectedMarkers.length,numberedExisting,existingInteractive,inspectorActive,authProvider:document.getElementById("authProvider").value,preflightItems:document.querySelectorAll("#publishPreflight .preflight-item").length,publishDisabled:document.getElementById("publishSite").disabled};
    })()`
  });
  const value = result.result?.value;
  if(!value || value.missing.length || !value.coachActive || value.deviceCheckboxes < 10 || value.deviceRemoveButtons < 10 || !value.deviceRemovalWorked || !value.deviceReselectionWorked || !value.autoReady || value.autoDetected !== 3 || value.detectedMarkers !== 6 || value.numberedExisting !== 3 || !value.existingInteractive || !value.inspectorActive || value.preflightItems < 7 || value.authProvider !== "clerk"){
    throw new Error(`Unexpected Create page state: ${JSON.stringify(value)}`);
  }
  if(exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join(" | ")}`);
  console.log(JSON.stringify({ok:true,...value}));
  socket.close();
}finally{
  child.kill();
}
