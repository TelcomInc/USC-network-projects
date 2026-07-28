import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {kvStore} from "./_supabase.js";

const CREATE_HOSTS = new Set(["create.asbuilt.thnikers.com","create2.asbuilt.thnikers.com"]);
const RESERVED = new Set(["www","asbuilt","create","create2"]);

function host(req){ return String(req.query?.requestedHost || req.headers.host || req.headers["x-forwarded-host"] || "").split(",")[0].split(":")[0].toLowerCase(); }

export default async function handler(req,res){
  if(req.method !== "GET" && req.method !== "HEAD"){ res.status(405).end("Method not allowed"); return; }
  const hostname = host(req);
  let filename = CREATE_HOSTS.has(hostname) ? "template.html" : "index.html";
  let manifest = null;
  const suffix = ".asbuilt.thnikers.com";
  if(hostname.endsWith(suffix)){
    const slug = hostname.slice(0,-suffix.length);
    if(slug && !RESERVED.has(slug)){
      const record = await kvStore("maps").get(`tenant-template:${slug}`,"json");
      if(record?.manifest) manifest = record.manifest;
      else { res.status(404).end("This As-Built workspace has not been published."); return; }
    }
  }
  let html = await readFile(join(process.cwd(),filename),"utf8");
  if(manifest){
    const safeJson = JSON.stringify(manifest).replace(/</g,"\\u003c");
    html = html.replace("</head>",`<script>window.__ASBUILT_TENANT_MANIFEST__=${safeJson};</script></head>`);
    const client = String(manifest.template?.client || "Customer");
    html = html.replace("<title>UofSC As-Built Workspace - Telcom Inc</title>",`<title>${client.replace(/[&<>]/g,"")} As-Built Workspace - Telcom Inc</title>`);
    html = html.replace("UofSC As-Built Workspace <small>Telcom Inc project closeout portal</small>",`${client.replace(/[&<>]/g,"")} As-Built Workspace <small>Telcom Inc project closeout portal</small>`);
  }
  res.statusCode = 200;
  res.setHeader("content-type","text/html; charset=utf-8");
  res.setHeader("cache-control","no-cache");
  if(req.method === "HEAD") res.end(); else res.end(html);
}
