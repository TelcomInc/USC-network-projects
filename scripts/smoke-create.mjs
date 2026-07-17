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
    if(message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails?.text || "Browser exception");
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
      const required=["continueGuide","clientName","shellImage","authProvider","publishSite","publishPreflight","coachCard"];
      const missing=required.filter(id=>!document.getElementById(id));
      startCoach();
      await new Promise(resolve=>setTimeout(resolve,180));
      const coachActive=document.getElementById("coachCard").classList.contains("active");
      go("publish");
      await new Promise(resolve=>setTimeout(resolve,80));
      return {title:document.title,missing,coachActive,authProvider:document.getElementById("authProvider").value,preflightItems:document.querySelectorAll("#publishPreflight .preflight-item").length,publishDisabled:document.getElementById("publishSite").disabled};
    })()`
  });
  const value = result.result?.value;
  if(!value || value.missing.length || !value.coachActive || value.preflightItems < 7 || value.authProvider !== "cloudflare-access"){
    throw new Error(`Unexpected Create page state: ${JSON.stringify(value)}`);
  }
  if(exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join(" | ")}`);
  console.log(JSON.stringify({ok:true,...value}));
  socket.close();
}finally{
  child.kill();
}
