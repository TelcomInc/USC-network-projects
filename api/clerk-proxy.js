export const config = {api:{bodyParser:false}};

const CLERK_FRONTEND_API = "https://frontend-api.clerk.dev";

function requestOrigin(req){
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "create.asbuilt.thnikers.com").split(",")[0].trim();
  return `${protocol}://${host}`;
}

async function requestBody(req){
  if(req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export default async function handler(req,res){
  const secretKey = String(process.env.CLERK_SECRET_KEY || "");
  if(!secretKey){ res.status(503).json({error:"Clerk proxy is not configured."}); return; }

  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : String(req.query.path || "");
  const incoming = new URL(req.url, requestOrigin(req));
  incoming.searchParams.delete("path");
  const target = new URL(`/${path.replace(/^\/+/,"")}`, CLERK_FRONTEND_API);
  incoming.searchParams.forEach((value,key) => target.searchParams.append(key,value));

  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key,value]) => {
    if(["host","connection","content-length"].includes(key.toLowerCase())) return;
    if(Array.isArray(value)) value.forEach(item => headers.append(key,item));
    else if(value !== undefined) headers.set(key,String(value));
  });
  headers.set("Clerk-Proxy-Url", `${requestOrigin(req)}/__clerk`);
  headers.set("Clerk-Secret-Key", secretKey);
  headers.set("X-Forwarded-For", String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim());

  try{
    const response = await fetch(target,{method:req.method,headers,body:await requestBody(req),redirect:"manual"});
    res.statusCode = response.status;
    response.headers.forEach((value,key) => {
      if(!["content-length","content-encoding","transfer-encoding","set-cookie"].includes(key.toLowerCase())) res.setHeader(key,value);
    });
    if(typeof response.headers.getSetCookie === "function"){
      const cookies = response.headers.getSetCookie();
      if(cookies.length) res.setHeader("set-cookie",cookies);
    }else if(response.headers.get("set-cookie")){
      res.setHeader("set-cookie",response.headers.get("set-cookie"));
    }
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){
    res.status(502).json({error:error?.message || "Clerk proxy request failed."});
  }
}
