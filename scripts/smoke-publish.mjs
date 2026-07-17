import {onRequest as publish} from "../functions/api/template-publish.js";
import {onRequest as middleware} from "../functions/_middleware.js";

const values = new Map();
const env = {
  ASBUILT_ADMIN_EMAILS:"admin@example.com",
  ASBUILT_MAPS:{
    async get(key,type){
      const value = values.get(key);
      return type === "json" && value ? JSON.parse(value) : value || null;
    },
    async put(key,value){ values.set(key,value); }
  }
};
const manifest = {
  urlReservation:{slug:"acme"},
  sourceApplication:{codeGeneration:false},
  authentication:{provider:"cloudflare-access",methods:["email-code"],allowedDomains:"example.com"},
  selectedHeaders:[1,2,3,4,5].map(index => ({label:`Field ${index}`,key:`field${index}`})),
  template:{templateId:"tpl-smoke",client:"Acme",logo:"data:image/png;base64,AA==",devices:[{id:"ap"}],authentication:{provider:"cloudflare-access",methods:["email-code"]}}
};

const denied = await publish({request:new Request("https://create.asbuilt.thnikers.com/api/template-publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug:"acme",manifest})}),env});
if(denied.status !== 401) throw new Error(`Expected anonymous publish to return 401, received ${denied.status}.`);

const saved = await publish({request:new Request("https://create.asbuilt.thnikers.com/api/template-publish",{method:"POST",headers:{"content-type":"application/json","cf-access-authenticated-user-email":"admin@example.com"},body:JSON.stringify({slug:"acme",manifest})}),env});
const savedBody = await saved.json();
if(!saved.ok || !savedBody.ok || savedBody.accessProtected !== false) throw new Error(`Unexpected publish response: ${JSON.stringify(savedBody)}`);

const fetched = await publish({request:new Request("https://acme.asbuilt.thnikers.com/api/template-publish"),env});
const fetchedBody = await fetched.json();
if(!fetched.ok || fetchedBody.manifest?.template?.client !== "Acme") throw new Error("Published tenant could not be read back.");

const held = await middleware({request:new Request("https://acme.asbuilt.thnikers.com/"),env,next:async()=>new Response("unsafe")});
if(held.status !== 503) throw new Error(`Expected an unprotected tenant to stay offline, received ${held.status}.`);

console.log(JSON.stringify({ok:true,anonymousStatus:denied.status,publishStatus:saved.status,readStatus:fetched.status,unprotectedTenantStatus:held.status}));
