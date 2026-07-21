const DEFAULT_CLERK_ISSUER = "https://clerk.thnikers.com";
const CLOCK_SKEW_SECONDS = 5;
const JWKS_CACHE_MS = 5 * 60 * 1000;

let jwksCache = {url:"", fetchedAt:0, keys:[]};

function base64UrlBytes(value){
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonPart(value){
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

function bearerToken(request){
  const authorization = request.headers.get("authorization") || "";
  if(/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function allowedAuthorizedParty(request, azp){
  if(!azp) return true;
  let tokenOrigin;
  let requestOrigin;
  try{
    tokenOrigin = new URL(azp);
    requestOrigin = new URL(request.url);
  }catch(_error){
    return false;
  }
  if(tokenOrigin.origin !== requestOrigin.origin) return false;
  const hostname = requestOrigin.hostname.toLowerCase();
  return hostname === "asbuilt.thnikers.com" || hostname.endsWith(".asbuilt.thnikers.com") || hostname === "localhost" || hostname === "127.0.0.1";
}

async function jwks(url){
  if(jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_MS && jwksCache.keys.length){
    return jwksCache.keys;
  }
  const response = await fetch(url, {headers:{accept:"application/json"}});
  if(!response.ok) throw new Error(`Clerk JWKS returned ${response.status}.`);
  const body = await response.json();
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if(!keys.length) throw new Error("Clerk JWKS did not contain a signing key.");
  jwksCache = {url, fetchedAt:Date.now(), keys};
  return keys;
}

async function verifyClerkToken(token, request, env){
  const parts = String(token || "").split(".");
  if(parts.length !== 3) throw new Error("Malformed Clerk session token.");
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if(header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Clerk token signature.");

  const issuer = String(env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER).replace(/\/$/, "");
  const jwksUrl = String(env.CLERK_JWKS_URL || `${issuer}/.well-known/jwks.json`);
  const keys = await jwks(jwksUrl);
  const jwk = keys.find(key => key.kid === header.kid && (!key.alg || key.alg === "RS256"));
  if(!jwk) throw new Error("Clerk signing key was not found.");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {name:"RSASSA-PKCS1-v1_5", hash:"SHA-256"},
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify(
    {name:"RSASSA-PKCS1-v1_5"},
    publicKey,
    base64UrlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if(!verified) throw new Error("Clerk session signature is invalid.");

  const now = Math.floor(Date.now() / 1000);
  if(!claims.exp || claims.exp < now - CLOCK_SKEW_SECONDS) throw new Error("Clerk session has expired.");
  if(claims.nbf && claims.nbf > now + CLOCK_SKEW_SECONDS) throw new Error("Clerk session is not active yet.");
  if(String(claims.iss || "").replace(/\/$/, "") !== issuer) throw new Error("Clerk session issuer is invalid.");
  if(!allowedAuthorizedParty(request, claims.azp)) throw new Error("Clerk session origin is invalid.");
  if(claims.sts === "pending") throw new Error("Clerk organization membership is pending.");
  if(!claims.sub || !claims.sid) throw new Error("Clerk session identity is incomplete.");

  return claims;
}

export async function authenticateRequest(request, env){
  const token = bearerToken(request);
  if(!token) return {authenticated:false, provider:"clerk", error:"Sign in is required."};
  try{
    const claims = await verifyClerkToken(token, request, env);
    const email = String(claims.primaryEmail || claims.email || "").trim().toLowerCase();
    return {
      authenticated:true,
      provider:"clerk",
      userId:String(claims.sub),
      sessionId:String(claims.sid),
      email:email || null,
      claims
    };
  }catch(error){
    return {authenticated:false, provider:"clerk", error:error.message || "Clerk session could not be verified."};
  }
}
