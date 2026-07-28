import {authenticateRequest} from "../functions/_lib/auth.js";
import {docsStore,kvStore} from "./_supabase.js";

export function environment(){
  return {
    ...process.env,
    ASBUILT_MAPS:kvStore("maps"),
    ASBUILT_FIELDS:kvStore("fields"),
    ASBUILT_DOCS:docsStore()
  };
}

function splitList(value){
  return String(value || "").split(/[,\n]/).map(item => item.trim().toLowerCase()).filter(Boolean);
}

function globalRole(email,env){
  const domain = email.includes("@") ? email.split("@").pop() : "";
  if(splitList(env.ASBUILT_ADMIN_EMAILS || env.ADMIN_EMAILS).includes(email) || splitList(env.ASBUILT_ADMIN_DOMAINS || env.ADMIN_DOMAINS).includes(domain)) return "admin";
  if(splitList(env.ASBUILT_PM_EMAILS || env.PM_EMAILS).includes(email) || splitList(env.ASBUILT_PM_DOMAINS || env.PM_DOMAINS).includes(domain)) return "projectManager";
  return "viewer";
}

export async function applyTenantAccess(request,env,auth){
  const hostname = new URL(request.url).hostname.toLowerCase();
  const suffix = ".asbuilt.thnikers.com";
  const primary = new Set(["create","create2","uofsc","usc"]);
  if(!hostname.endsWith(suffix)) return auth;
  const slug = hostname.slice(0,-suffix.length);
  if(!slug || primary.has(slug)) return {...auth,role:globalRole(auth.email || "",env),tenantAuthorized:true};
  const record = await env.ASBUILT_MAPS.get(`tenant-template:${slug}`,"json");
  if(!record?.manifest) return {...auth,tenantSlug:slug,tenantAuthorized:false,error:"This tenant has not been published."};
  const role = globalRole(auth.email || "",env);
  if(role === "admin" || role === "projectManager") return {...auth,role,tenantSlug:slug,tenantAuthorized:true};
  const workspace = await env.ASBUILT_MAPS.get(`tenant-workspace-${slug}`,"json");
  const access = workspace?.data?.access || workspace?.access || {};
  const domains = [...splitList(record.manifest?.authentication?.allowedDomains),...(Array.isArray(access.domains) ? access.domains : [])].map(String).map(value=>value.toLowerCase().replace(/^@/,""));
  const people = (Array.isArray(access.people) ? access.people : []).map(value=>String(value).trim().toLowerCase());
  const email = String(auth.email || "").toLowerCase();
  const domain = email.includes("@") ? email.split("@").pop() : "";
  const authorized = people.includes(email) || domains.includes(domain);
  return {...auth,role:"viewer",tenantSlug:slug,tenantAuthorized:authorized,error:authorized ? auth.error : "Your account is not approved for this tenant."};
}

function requestUrl(req){
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = String(req.headers.host || req.headers["x-forwarded-host"] || "localhost").split(",")[0];
  return `${protocol}://${host}${req.url}`;
}

async function bodyFor(req){
  if(req.method === "GET" || req.method === "HEAD") return undefined;
  if(req.body === undefined || req.body === null) return undefined;
  if(Buffer.isBuffer(req.body) || typeof req.body === "string") return req.body;
  return JSON.stringify(req.body);
}

export async function webRequest(req){
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key,value]) => {
    if(Array.isArray(value)) value.forEach(item => headers.append(key,item));
    else if(value !== undefined) headers.set(key,String(value));
  });
  return new Request(requestUrl(req),{method:req.method,headers,body:await bodyFor(req)});
}

export async function context(req,params = {}){
  const request = await webRequest(req);
  const env = environment();
  const auth = await applyTenantAccess(request,env,await authenticateRequest(request,env));
  return {request,env,data:{auth},params};
}

export async function send(res,response){
  res.statusCode = response.status;
  response.headers.forEach((value,key) => res.setHeader(key,value));
  const bytes = Buffer.from(await response.arrayBuffer());
  res.end(bytes);
}

export function wrap(onRequest,params){
  return async (req,res) => {
    try{
      const ctx = await context(req,typeof params === "function" ? params(req) : params);
      if(!ctx.data.auth.authenticated) return send(res,new Response(JSON.stringify({ok:false,error:ctx.data.auth.error || "Sign in is required."}),{status:401,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}));
      if(ctx.data.auth.tenantSlug && !ctx.data.auth.tenantAuthorized) return send(res,new Response(JSON.stringify({ok:false,error:ctx.data.auth.error || "Tenant access is not approved."}),{status:403,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}));
      await send(res,await onRequest(ctx));
    }
    catch(error){
      res.statusCode = 500;
      res.setHeader("content-type","application/json; charset=utf-8");
      res.end(JSON.stringify({ok:false,error:error?.message || "Server error."}));
    }
  };
}
