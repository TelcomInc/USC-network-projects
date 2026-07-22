const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

function configured(){
  return Boolean(baseUrl && serviceKey);
}

function headers(extra = {}){
  return {apikey:serviceKey, authorization:`Bearer ${serviceKey}`, ...extra};
}

async function checked(response){
  if(response.ok) return response;
  const message = await response.text().catch(() => "");
  throw new Error(`Supabase returned ${response.status}${message ? `: ${message.slice(0,300)}` : "."}`);
}

export function kvStore(namespace){
  return {
    async get(key,type){
      if(!configured()) return null;
      const storageKey = `${namespace}:${key}`;
      const response = await checked(await fetch(`${baseUrl}/rest/v1/app_kv?select=value&key=eq.${encodeURIComponent(storageKey)}&limit=1`,{headers:headers()}));
      const rows = await response.json();
      const value = rows?.[0]?.value ?? null;
      if(value === null) return null;
      if(type === "json") return typeof value === "string" ? JSON.parse(value) : value;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    async put(key,value){
      if(!configured()) throw new Error("Supabase storage is not configured.");
      const storageKey = `${namespace}:${key}`;
      let parsed = value;
      if(typeof value === "string"){
        try{ parsed = JSON.parse(value); }catch(_error){}
      }
      await checked(await fetch(`${baseUrl}/rest/v1/app_kv`,{
        method:"POST",
        headers:headers({"content-type":"application/json","prefer":"resolution=merge-duplicates,return=minimal"}),
        body:JSON.stringify({key:storageKey,value:parsed,updated_at:new Date().toISOString()})
      }));
    }
  };
}

export async function uploadPdf(path,bytes,metadata = {}){
  if(!configured()) throw new Error("Supabase PDF storage is not configured.");
  await checked(await fetch(`${baseUrl}/storage/v1/object/device-documents/${path.split("/").map(encodeURIComponent).join("/")}`,{
    method:"POST",
    headers:headers({"content-type":"application/pdf","x-upsert":"true"}),
    body:bytes
  }));
  const id = path.split("/").pop().replace(/\.pdf$/i,"");
  await kvStore("docs").put(`meta:${id}`,metadata);
}

export async function createSignedPdfUpload(path){
  if(!configured()) throw new Error("Supabase PDF storage is not configured.");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await checked(await fetch(`${baseUrl}/storage/v1/object/upload/sign/device-documents/${encoded}`,{
    method:"POST",
    headers:headers({"content-type":"application/json"}),
    body:JSON.stringify({upsert:true})
  }));
  const result = await response.json();
  const relative = result.url || result.signedURL || result.signedUrl;
  if(!relative) throw new Error("Supabase did not return a signed upload URL.");
  return relative.startsWith("http") ? relative : `${baseUrl}/storage/v1${relative.startsWith("/") ? "" : "/"}${relative}`;
}

export async function downloadPdf(path){
  if(!configured()) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${baseUrl}/storage/v1/object/device-documents/${encoded}`,{headers:headers()});
  if(response.status === 404) return null;
  return checked(response);
}

export function docsStore(){
  return {
    async put(key,bytes,options = {}){
      await uploadPdf(key,bytes,options.metadata || options.customMetadata || {});
    }
  };
}

export function supabaseConfigured(){ return configured(); }
