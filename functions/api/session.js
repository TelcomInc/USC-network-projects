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

export async function onRequestGet({env, data}){
  const email = String(data?.auth?.email || "").trim().toLowerCase();
  const role = isAdminEmail(email, env) ? "admin" : (isProjectManagerEmail(email, env) ? "projectManager" : (email ? "field" : "viewer"));
  return json({
    ok:true,
    authenticated:Boolean(data?.auth?.authenticated),
    email:email || null,
    role,
    provider:data?.auth?.provider || "clerk"
  });
}
