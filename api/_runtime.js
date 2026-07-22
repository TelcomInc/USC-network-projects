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

function requestUrl(req){
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0];
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
  const auth = await authenticateRequest(request,env);
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
    try{ await send(res,await onRequest(await context(req,typeof params === "function" ? params(req) : params))); }
    catch(error){
      res.statusCode = 500;
      res.setHeader("content-type","application/json; charset=utf-8");
      res.end(JSON.stringify({ok:false,error:error?.message || "Server error."}));
    }
  };
}
