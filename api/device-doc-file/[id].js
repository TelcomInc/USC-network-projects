import {context} from "../_runtime.js";
import {downloadPdf,kvStore} from "../_supabase.js";

export default async function handler(req,res){
  if(req.method !== "GET"){ res.status(405).json({ok:false,error:"Method not allowed."}); return; }
  const runtime = await context(req,{id:req.query.id});
  if(!runtime.data.auth.authenticated){ res.status(401).json({ok:false,error:"Sign in is required."}); return; }
  const id = String(req.query.id || "").replace(/[^a-f0-9-]/gi,"");
  if(!id){ res.status(404).json({ok:false,error:"Document not found."}); return; }
  try{
    const stored = await downloadPdf(`device-docs/${id}.pdf`);
    if(!stored){ res.status(404).json({ok:false,error:"Document not found."}); return; }
    const metadata = await kvStore("docs").get(`meta:${id}`,"json");
    const filename = String(metadata?.filename || "product-document.pdf").replace(/["\r\n]/g,"");
    res.statusCode = 200;
    res.setHeader("content-type","application/pdf");
    res.setHeader("content-disposition",`inline; filename="${filename}"`);
    res.setHeader("cache-control","private, no-store");
    res.setHeader("x-content-type-options","nosniff");
    res.end(Buffer.from(await stored.arrayBuffer()));
  }catch(error){ res.status(502).json({ok:false,error:error.message || "Document could not be loaded."}); }
}
