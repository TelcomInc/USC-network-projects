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

const held = await middleware({request:new Request("https://acme.asbuilt.thnikers.com/"),env,next:async()=>new Response("unsafe")});
if(held.status !== 302) throw new Error(`Expected an unsigned user to be redirected to the branded login, received ${held.status}.`);

console.log(JSON.stringify({ok:true,anonymousStatus:denied.status,publishStatus:saved.status,readStatus:fetched.status,anonymousTenantStatus:held.status}));
