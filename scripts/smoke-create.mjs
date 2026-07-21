import {spawn} from "node:child_process";

const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9333;
const profile = `C:\\Users\\Ryan\\AppData\\Local\\Temp\\asbuilt-create-smoke-${Date.now()}`;
const child = spawn(chrome,[
  "--headless=new",
  "--disable-gpu",
  "--disable-background-mode",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "http://127.0.0.1:4174/template.html"
],{stdio:"ignore"});

const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function targets(){
  for(let attempt = 0; attempt < 30; attempt += 1){
    try{
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await response.json();
      const page = list.find(item => item.type === "page" && item.url.includes("template.html"));
      if(page) return page;
    }catch(_error){}
    await delay(250);
  }
  throw new Error("Chrome DevTools did not expose the Create page.");
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
      const required=["continueGuide","clientName","shellImage","authProvider","publishSite","publishPreflight","coachCard","addDeviceFromCatalog","manualDocFile","uploadManualPdf","runAuto"];
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
      sourceCanvas.width=1120;
      sourceCanvas.height=720;
      const sourceContext=sourceCanvas.getContext("2d");
      sourceContext.fillStyle="#fff";
      sourceContext.fillRect(0,0,sourceCanvas.width,sourceCanvas.height);
      const expectedSymbols=[[122,122],[242,122],[362,122],[482,122],[602,122],[722,122]];
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
      state.plan=sourceCanvas.toDataURL("image/png");
      state.planName="symbol-detection-test.png";
      state.planKind="image";
      state.legendName="symbol-legend-test.png";
      state.legendKind="image";
      state.iconSamples=expectedSymbols.slice(0,3).map(([x,y],index)=>({deviceId:state.devices[0].id,x,y,sheet:1,createdAt:"test-"+index}));
      state.markers=[];
      renderAll();
      const planImage=document.querySelector("#planCanvas .plan-img");
      if(planImage && !planImage.complete) await new Promise((resolve,reject)=>{planImage.addEventListener("load",resolve,{once:true});planImage.addEventListener("error",reject,{once:true});});
      const detectedMarkers=detectSymbolMatches();
      const autoDetected=expectedSymbols.slice(3).filter(([x,y])=>detectedMarkers.some(marker=>marker.pending&&Math.hypot(marker.x-x,marker.y-y)<=6)).length;
      go("publish");
      await new Promise(resolve=>setTimeout(resolve,80));
      return {title:document.title,missing,coachActive,deviceCheckboxes,deviceRemoveButtons,deviceRemovalWorked,deviceReselectionWorked,autoDetected,detectedMarkers:detectedMarkers.length,authProvider:document.getElementById("authProvider").value,preflightItems:document.querySelectorAll("#publishPreflight .preflight-item").length,publishDisabled:document.getElementById("publishSite").disabled};
    })()`
  });
  const value = result.result?.value;
  if(!value || value.missing.length || !value.coachActive || value.deviceCheckboxes < 10 || value.deviceRemoveButtons < 10 || !value.deviceRemovalWorked || !value.deviceReselectionWorked || value.autoDetected !== 3 || value.preflightItems < 7 || value.authProvider !== "clerk"){
    throw new Error(`Unexpected Create page state: ${JSON.stringify(value)}`);
  }
  if(exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join(" | ")}`);
  console.log(JSON.stringify({ok:true,...value}));
  socket.close();
}finally{
  child.kill();
}
