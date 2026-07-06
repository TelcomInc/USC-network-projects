const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(body, status = 200){
  return new Response(JSON.stringify(body), {status, headers:jsonHeaders});
}

function splitList(value){
  return String(value || "")
    .split(/[,\n]/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function decodeJwtPayload(token){
  try{
    const payload = String(token || "").split(".")[1];
    if(!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  }catch(_error){
    return {};
  }
}

function accessEmail(request){
  const direct = request.headers.get("cf-access-authenticated-user-email");
  if(direct) return direct.trim().toLowerCase();
  const token = request.headers.get("cf-access-jwt-assertion");
  const payload = decodeJwtPayload(token);
  return String(payload.email || "").trim().toLowerCase();
}

function isAdminEmail(email, env){
  if(!email) return false;
  const admins = splitList(env.ASBUILT_ADMIN_EMAILS || env.ADMIN_EMAILS);
  const adminDomains = splitList(env.ASBUILT_ADMIN_DOMAINS || env.ADMIN_DOMAINS);
  const domain = email.includes("@") ? email.split("@").pop() : "";
  return admins.includes(email) || (domain && adminDomains.includes(domain));
}

function isProjectManagerEmail(email, env){
  if(!email) return false;
  const managers = splitList(env.ASBUILT_PM_EMAILS || env.PM_EMAILS);
  const managerDomains = splitList(env.ASBUILT_PM_DOMAINS || env.PM_DOMAINS);
  const domain = email.includes("@") ? email.split("@").pop() : "";
  return managers.includes(email) || (domain && managerDomains.includes(domain));
}

export async function onRequestGet({request, env}){
  const email = accessEmail(request);
  const role = isAdminEmail(email, env) ? "admin" : (isProjectManagerEmail(email, env) ? "projectManager" : (email ? "field" : "viewer"));
  return json({
    ok:true,
    authenticated:Boolean(email),
    email:email || null,
    role
  });
}
