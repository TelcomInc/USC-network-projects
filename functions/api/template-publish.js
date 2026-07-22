const JSON_HEADERS = {
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};

function json(body,status = 200){
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}

function splitList(value){
  return String(value || "").split(/[,\n]/).map(item => item.trim().toLowerCase()).filter(Boolean);
}

function isAdmin(email,env){
  if(!email) return false;
  const admins = splitList(env.ASBUILT_ADMIN_EMAILS || env.ADMIN_EMAILS);
  const domains = splitList(env.ASBUILT_ADMIN_DOMAINS || env.ADMIN_DOMAINS);
  const domain = email.split("@").pop();
  return admins.includes(email) || domains.includes(domain);
}

function cleanSlug(value){
  return String(value || "").toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48);
}

const RESERVED = new Set(["admin","api","app","asbuilt","asbuilts","create","dashboard","help","login","mail","portal","support","template","templates","www","usc","uofsc","usdasbuilts","strom-thurmond"]);

function tenantKey(slug){ return `tenant-template:${slug}`; }

async function readTenant(env,slug){
  if(!env.ASBUILT_MAPS) return null;
  return env.ASBUILT_MAPS.get(tenantKey(slug),"json");
}

function validateManifest(slug,manifest){
  const failures = [];
  const template = manifest?.template || {};
  const auth = manifest?.authentication || template.authentication || {};
  if(slug.length < 3 || RESERVED.has(slug)) failures.push("Choose an available customer-specific URL.");
  if(!template.client || template.client === "Template Client") failures.push("Customer name is required.");
  if(!template.logo) failures.push("Customer logo is required.");
  if(!Array.isArray(template.devices) || !template.devices.length) failures.push("At least one device type is required.");
  if(!Array.isArray(manifest?.selectedHeaders) || manifest.selectedHeaders.length < 5) failures.push("At least five workbook fields are required.");
  if(!auth.provider || !Array.isArray(auth.methods) || !auth.methods.length) failures.push("Authentication provider and login method are required.");
  if(manifest?.sourceApplication?.codeGeneration !== false) failures.push("Publishing must reuse the shared application; code generation is not allowed.");
  return failures;
}

async function provisionDomain(env,domain){
  const project = String(env.VERCEL_PROJECT_ID || env.VERCEL_PROJECT_NAME || "").trim();
  const token = String(env.VERCEL_TOKEN || "").trim();
  const team = String(env.VERCEL_TEAM_ID || "").trim();
  if(!project || !token) return {provisioned:false,status:"vercel-domain-token-not-configured"};
  const query = team ? `?teamId=${encodeURIComponent(team)}` : "";
  const endpoint = `https://api.vercel.com/v10/projects/${encodeURIComponent(project)}/domains${query}`;
  const response = await fetch(endpoint,{
    method:"POST",
    headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
    body:JSON.stringify({name:domain,redirect:null,redirectStatusCode:null})
  });
  const result = await response.json().catch(() => ({}));
  if(response.ok || response.status === 409 || /already|exist/i.test(result?.error?.message || "")){
    return {provisioned:true,status:result?.verified ? "active" : "pending-dns"};
  }
  return {provisioned:false,status:"domain-provision-failed",error:result?.error?.message || `Vercel API returned ${response.status}.`};
}

async function accessStatus(_env,_domain,manifest){
  const auth = manifest?.authentication || manifest?.template?.authentication || {};
  if(auth.provider === "clerk") return {protected:true,status:"clerk-managed"};
  return {protected:false,status:"public"};
}

export async function onRequest({request,env,data}){
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if(method === "GET"){
    const hostnameSlug = url.hostname.toLowerCase().endsWith(".asbuilt.thnikers.com") ? url.hostname.split(".")[0] : "";
    const slug = cleanSlug(url.searchParams.get("slug") || hostnameSlug);
    if(!slug) return json({ok:false,error:"Missing tenant slug."},400);
    const record = await readTenant(env,slug);
    if(!record) return json({ok:false,error:"Tenant configuration was not found."},404);
    return json({ok:true,slug,version:record.version,publishedAt:record.publishedAt,manifest:record.manifest});
  }

  if(method !== "POST") return json({ok:false,error:"Method not allowed."},405);
  const email = String(data?.auth?.email || "").trim().toLowerCase();
  if(!isAdmin(email,env)) return json({ok:false,error:"An authenticated As-Built administrator is required to publish.",user:email || null},email ? 403 : 401);
  if(!env.ASBUILT_MAPS) return json({ok:false,error:"The shared tenant store is not configured."},503);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if(contentLength > 9 * 1024 * 1024) return json({ok:false,error:"The template is too large. Optimize or remove background pictures."},413);

  let body;
  try{ body = await request.json(); }catch(_error){ return json({ok:false,error:"Expected a JSON publish request."},400); }
  const slug = cleanSlug(body?.slug);
  const manifest = body?.manifest;
  const failures = validateManifest(slug,manifest);
  if(failures.length) return json({ok:false,error:"Publish preflight failed.",failures},422);

  const existing = await readTenant(env,slug);
  const incomingTemplateId = String(manifest?.template?.templateId || "");
  if(existing && existing.templateId && existing.templateId !== incomingTemplateId){
    return json({ok:false,error:"That URL is already owned by another tenant template."},409);
  }

  const publishedAt = new Date().toISOString();
  const version = `${publishedAt.replace(/[-:.TZ]/g,"").slice(0,14)}-${crypto.randomUUID().slice(0,8)}`;
  const record = {slug,domain:`${slug}.asbuilt.thnikers.com`,templateId:incomingTemplateId,version,publishedAt,publishedBy:email,manifest,accessProtected:false};
  await env.ASBUILT_MAPS.put(tenantKey(slug),JSON.stringify(record));
  const domain = await provisionDomain(env,record.domain);
  const access = await accessStatus(env,record.domain,manifest);
  record.accessProtected = access.protected;
  record.accessStatus = access.status;
  record.accessAppId = access.appId || null;
  await env.ASBUILT_MAPS.put(tenantKey(slug),JSON.stringify(record));
  return json({ok:true,slug,domain:record.domain,url:`https://${record.domain}/`,version,publishedAt,domainProvisioned:domain.provisioned,domainStatus:domain.status,domainError:domain.error || null,accessProtected:access.protected,accessStatus:access.status,accessError:access.error || null});
}
