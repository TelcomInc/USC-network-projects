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

function decodeJwtPayload(token){
  try{
    const payload = String(token || "").split(".")[1];
    if(!payload) return {};
    const normalized = payload.replace(/-/g,"+").replace(/_/g,"/");
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4,"=")));
  }catch(_error){
    return {};
  }
}

function accessEmail(request){
  const direct = request.headers.get("cf-access-authenticated-user-email");
  if(direct) return direct.trim().toLowerCase();
  return String(decodeJwtPayload(request.headers.get("cf-access-jwt-assertion")).email || "").trim().toLowerCase();
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

async function provisionPagesDomain(env,domain){
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const project = String(env.CLOUDFLARE_PAGES_PROJECT || "usc-network-projects").trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  if(!accountId || !project || !token) return {provisioned:false,status:"configuration-published-domain-token-not-configured"};
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(project)}/domains`;
  const response = await fetch(endpoint,{
    method:"POST",
    headers:{"authorization":`Bearer ${token}`,"content-type":"application/json"},
    body:JSON.stringify({name:domain})
  });
  const result = await response.json().catch(() => ({}));
  if(response.ok || result?.errors?.some(error => /already|exist/i.test(error.message || ""))){
    return {provisioned:true,status:result?.result?.status || "pending"};
  }
  return {provisioned:false,status:"domain-provision-failed",error:result?.errors?.[0]?.message || `Cloudflare API returned ${response.status}.`};
}

async function provisionAccessApplication(env,domain,manifest){
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  if(!accountId || !token) return {protected:false,status:"access-token-not-configured"};
  const auth = manifest?.authentication || manifest?.template?.authentication || {};
  if(auth.provider !== "cloudflare-access") return {protected:false,status:"selected-auth-provider-not-connected"};
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/access/apps`;
  const headers = {"authorization":`Bearer ${token}`,"content-type":"application/json"};
  const listResponse = await fetch(`${base}?per_page=100`,{headers});
  const list = await listResponse.json().catch(() => ({}));
  const existing = Array.isArray(list?.result) ? list.result.find(app => app.domain === domain) : null;
  if(existing) return {protected:true,status:"active",appId:existing.id};

  const emailRules = splitList(env.ASBUILT_ADMIN_EMAILS || env.ADMIN_EMAILS).map(email => ({email:{email}}));
  const domainRules = splitList(auth.allowedDomains).map(value => ({email_domain:{domain:value.replace(/^@/,"")}}));
  const include = [...emailRules,...domainRules];
  if(!include.length) return {protected:false,status:"no-approved-users-or-domains"};
  const response = await fetch(base,{
    method:"POST",
    headers,
    body:JSON.stringify({
      name:`${manifest?.template?.client || domain} As-Built`,
      type:"self_hosted",
      domain,
      session_duration:"24h",
      auto_redirect_to_identity:false,
      policies:[{
        name:"Approved As-Built users",
        decision:"allow",
        precedence:1,
        include,
        require:[],
        exclude:[]
      }]
    })
  });
  const result = await response.json().catch(() => ({}));
  if(response.ok) return {protected:true,status:"active",appId:result?.result?.id || null};
  return {protected:false,status:"access-provision-failed",error:result?.errors?.[0]?.message || `Cloudflare Access API returned ${response.status}.`};
}

export async function onRequest({request,env}){
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
  const email = accessEmail(request);
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
  const domain = await provisionPagesDomain(env,record.domain);
  const access = await provisionAccessApplication(env,record.domain,manifest);
  record.accessProtected = access.protected;
  record.accessStatus = access.status;
  record.accessAppId = access.appId || null;
  await env.ASBUILT_MAPS.put(tenantKey(slug),JSON.stringify(record));
  return json({ok:true,slug,domain:record.domain,version,publishedAt,domainProvisioned:domain.provisioned,domainStatus:domain.status,domainError:domain.error || null,accessProtected:access.protected,accessStatus:access.status,accessError:access.error || null});
}
