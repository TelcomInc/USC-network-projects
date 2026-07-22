import {context} from "./_runtime.js";
import {createSignedPdfUpload,kvStore,supabaseConfigured} from "./_supabase.js";

function clean(value,max = 160){ return String(value || "").trim().replace(/[\r\n]/g," ").slice(0,max); }
function safePdfName(value){ return (clean(value,180).replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ") || "product-document.pdf").replace(/\.pdf$/i,"")+".pdf"; }

export default async function handler(req,res){
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control","no-store");
  if(req.method !== "POST"){ res.status(405).json({ok:false,error:"Method not allowed."}); return; }
  const runtime = await context(req);
  if(!runtime.data.auth.authenticated){ res.status(401).json({ok:false,error:"Sign in is required."}); return; }
  if(!supabaseConfigured()){ res.status(503).json({ok:false,error:"PDF storage is not configured."}); return; }
  const url = new URL(runtime.request.url);
  const filename = safePdfName(url.searchParams.get("filename"));
  const id = crypto.randomUUID();
  const path = `device-docs/${id}.pdf`;
  const metadata = {
    filename,
    templateId:clean(url.searchParams.get("templateId"),100),
    projectId:clean(url.searchParams.get("projectId"),100),
    docType:clean(url.searchParams.get("docType"),80),
    uploadedBy:clean(runtime.data.auth.email || runtime.data.auth.userId,160),
    uploadedAt:new Date().toISOString()
  };
  try{
    const uploadUrl = await createSignedPdfUpload(path);
    await kvStore("docs").put(`meta:${id}`,metadata);
    res.status(201).json({ok:true,id,url:`/api/device-doc-file/${id}`,uploadUrl,filename});
  }catch(error){ res.status(502).json({ok:false,error:error.message || "Upload could not be prepared."}); }
}
