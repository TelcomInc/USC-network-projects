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
      const expectedPath = new URL(createUrl).pathname;
      const page = list.find(item => item.type === "page" && (item.url.startsWith(createUrl) || (expectedPath && item.url.includes(expectedPath))));
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
    expression:`(()=>{
      const visibleTabs=[...document.querySelectorAll(".tabs .tab")].filter(tab=>getComputedStyle(tab).display!=="none").map(tab=>tab.dataset.page);
      const activePage=document.querySelector(".page.active")?.id;
      const hiddenProjectPages=["dashboard","devices","docs","fields","map","layouts"].every(page=>getComputedStyle(document.getElementById("page-"+page)).display==="none");
      go("publish");
      return {title:document.title,visibleTabs,activePage,hiddenProjectPages,authProvider:document.getElementById("authProvider").value,preflightItems:document.querySelectorAll("#publishPreflight .preflight-item").length,hasBranding:Boolean(document.getElementById("clientName")&&document.getElementById("logoFile")&&document.getElementById("accentColor")),hasPublish:Boolean(document.getElementById("publishSite")&&document.getElementById("publishSlug"))};
    })()`
  });
  const value = result.result?.value;
  if(!value || value.visibleTabs.join(",") !== "brand,publish" || value.activePage !== "page-brand" || !value.hiddenProjectPages || !value.hasBranding || !value.hasPublish || value.preflightItems !== 5 || value.authProvider !== "clerk"){
    throw new Error(`Unexpected Create page state: ${JSON.stringify(value)}`);
  }
  if(exceptions.length) throw new Error(`Browser exceptions: ${exceptions.join(" | ")}`);
  console.log(JSON.stringify({ok:true,...value}));
  socket.close();
}finally{
  child.kill();
}
