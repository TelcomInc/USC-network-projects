import {context} from "./_runtime.js";
import {createSignedPdfUpload,kvStore,supabaseConfigured} from "./_supabase.js";

function clean(value,max=180){ return String(value||"").trim().replace(/[\r\n]/g," ").slice(0,max); }

export default async function handler(req,res){
  res.setHeader("content-type","application/json; charset=utf-8");
  res.setHeader("cache-control","no-store");
  if(req.method !== "POST"){ res.status(405).json({ok:false,error:"Method not allowed."}); return; }
  const runtime = await context(req);
  if(!runtime.data.auth.authenticated || !["admin","projectManager"].includes(runtime.data.auth.role)){ res.status(403).json({ok:false,error:"Admin access is required."}); return; }
  if(!supabaseConfigured()){ res.status(503).json({ok:false,error:"Workbook storage is not configured."}); return; }
  const url = new URL(runtime.request.url);
  const filename = clean(url.searchParams.get("filename"));
  const extension = filename.toLowerCase().match(/\.(xlsx|xlsm|xls)$/)?.[1];
  if(!extension){ res.status(415).json({ok:false,error:"Choose an Excel workbook (.xlsx, .xlsm, or .xls)."}); return; }
  const id = crypto.randomUUID();
  const path = `unit-lock-workbooks/${id}.${extension}`;
  const metadata = {filename,extension,contentType:clean(url.searchParams.get("contentType"))||"application/octet-stream",sha256:clean(url.searchParams.get("sha256"),64),uploadedBy:clean(runtime.data.auth.email||runtime.data.auth.userId),uploadedAt:new Date().toISOString()};
  try{
    const uploadUrl = await createSignedPdfUpload(path);
    await kvStore("docs").put(`unit-lock-workbook:${id}`,metadata);
    res.status(201).json({ok:true,id,url:`/api/unit-lock-workbook-file/${id}`,uploadUrl,filename,sha256:metadata.sha256});
  }catch(error){ res.status(502).json({ok:false,error:error.message||"Workbook upload could not be prepared."}); }
}
