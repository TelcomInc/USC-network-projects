import {context} from "../_runtime.js";
import {downloadPdf,kvStore} from "../_supabase.js";

export default async function handler(req,res){
  if(req.method !== "GET"){ res.status(405).json({ok:false,error:"Method not allowed."}); return; }
  const runtime = await context(req,{id:req.query.id});
  if(!runtime.data.auth.authenticated){ res.status(401).json({ok:false,error:"Sign in is required."}); return; }
  const id = String(req.query.id||"").replace(/[^a-f0-9-]/gi,"");
  if(!id){ res.status(404).json({ok:false,error:"Workbook not found."}); return; }
  try{
    const metadata = await kvStore("docs").get(`unit-lock-workbook:${id}`,"json");
    if(!metadata){ res.status(404).json({ok:false,error:"Workbook not found."}); return; }
    const stored = await downloadPdf(`unit-lock-workbooks/${id}.${metadata.extension}`);
    if(!stored){ res.status(404).json({ok:false,error:"Workbook not found."}); return; }
    const filename = String(metadata.filename||"Unit Locks.xlsx").replace(/["\r\n]/g,"");
    res.statusCode = 200;
    res.setHeader("content-type",metadata.contentType||"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("content-disposition",`attachment; filename="${filename}"`);
    res.setHeader("cache-control","private, no-store");
    res.setHeader("x-content-type-options","nosniff");
    if(metadata.sha256) res.setHeader("x-asbuilt-sha256",metadata.sha256);
    res.end(Buffer.from(await stored.arrayBuffer()));
  }catch(error){ res.status(502).json({ok:false,error:error.message||"Workbook could not be loaded."}); }
}
