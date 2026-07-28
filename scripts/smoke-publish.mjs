import {onRequest as publish} from "../functions/api/template-publish.js";
import {onRequest as middleware} from "../functions/_middleware.js";
import {applyTenantAccess} from "../api/_runtime.js";

const values = new Map();
const env = {
  ASBUILT_ADMIN_EMAILS:"admin@example.com",
  ASBUILT_MAPS:{
    async get(key,type){
      const value = values.get(key);
      return type === "json" && value ? JSON.parse(value) : value || null;
    },
    async put(key,value){ values.set(key,value); },
    async delete(key){ values.delete(key); }
  }
};
const manifest = {
  urlReservation:{slug:"acme"},
  sourceApplication:{codeGeneration:false},
  authentication:{provider:"clerk",methods:["email-code","password"],allowedDomains:"example.com"},
  selectedHeaders:[1,2,3,4,5].map(index => ({label:`Field ${index}`,key:`field${index}`})),
  template:{templateId:"tpl-smoke",client:"Acme",logo:"data:image/png;base64,AA==",devices:[{id:"ap"}],authentication:{provider:"clerk",methods:["email-code","password"]}}
};

const denied = await publish({request:new Request("https://create.asbuilt.thnikers.com/api/template-publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug:"acme",manifest})}),env,data:{auth:{authenticated:false}}});
if(denied.status !== 401) throw new Error(`Expected anonymous publish to return 401, received ${denied.status}.`);

const saved = await publish({request:new Request("https://create.asbuilt.thnikers.com/api/template-publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug:"acme",manifest})}),env,data:{auth:{authenticated:true,email:"admin@example.com",userId:"user-smoke"}}});
const savedBody = await saved.json();
if(!saved.ok || !savedBody.ok || savedBody.accessProtected !== true || savedBody.accessStatus !== "clerk-managed" || savedBody.url !== "https://acme.asbuilt.thnikers.com/") throw new Error(`Unexpected publish response: ${JSON.stringify(savedBody)}`);

const fetched = await publish({request:new Request("https://acme.asbuilt.thnikers.com/api/template-publish"),env});
const fetchedBody = await fetched.json();
if(!fetched.ok || fetchedBody.manifest?.template?.client !== "Acme") throw new Error("Published tenant could not be read back.");

await env.ASBUILT_MAPS.put("tenant-workspace-acme",JSON.stringify({data:{projects:[{id:"preserved-project",name:"Preserve Me"}],access:{domains:["owner.example"],people:["guest@outside.example"]}}}));

const moved = await publish({request:new Request("https://create.asbuilt.thnikers.com/api/template-publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug:"acme-west",manifest})}),env,data:{auth:{authenticated:true,email:"admin@example.com",userId:"user-smoke"}}});
const movedBody = await moved.json();
if(!moved.ok || movedBody.url !== "https://acme-west.asbuilt.thnikers.com/") throw new Error(`Slug route publish failed: ${JSON.stringify(movedBody)}`);
const movedFetched = await publish({request:new Request("https://acme-west.asbuilt.thnikers.com/api/template-publish"),env});
if(!movedFetched.ok || (await movedFetched.json()).slug !== "acme-west") throw new Error("Changed slug could not be routed and read back.");
if(values.has("tenant-template:acme")) throw new Error("Previous slug route was not released after the tenant moved.");
const migratedWorkspace = JSON.parse(values.get("tenant-workspace-acme-west"));
if(migratedWorkspace.data.projects[0].name !== "Preserve Me") throw new Error("Tenant workspace data was not preserved across slug changes.");

const viewerAccess = await applyTenantAccess(new Request("https://acme-west.asbuilt.thnikers.com/api/session"),env,{authenticated:true,email:"guest@outside.example"});
const deniedViewer = await applyTenantAccess(new Request("https://acme-west.asbuilt.thnikers.com/api/session"),env,{authenticated:true,email:"stranger@outside.example"});
const adminAccess = await applyTenantAccess(new Request("https://acme-west.asbuilt.thnikers.com/api/session"),env,{authenticated:true,email:"admin@example.com"});
if(!viewerAccess.tenantAuthorized || viewerAccess.role !== "viewer" || deniedViewer.tenantAuthorized || !adminAccess.tenantAuthorized || adminAccess.role !== "admin") throw new Error("Tenant admin/viewer authorization failed.");

const held = await middleware({request:new Request("https://acme.asbuilt.thnikers.com/"),env,next:async()=>new Response("unsafe")});
if(held.status !== 302) throw new Error(`Expected an unsigned user to be redirected to the branded login, received ${held.status}.`);

console.log(JSON.stringify({ok:true,anonymousStatus:denied.status,publishStatus:saved.status,readStatus:fetched.status,movedStatus:moved.status,workspacePreserved:true,viewerAuthorized:true,strangerDenied:true,adminAuthorized:true,anonymousTenantStatus:held.status}));
