const JSON_HEADERS = {
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store"
};
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function json(body,status = 200){
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}

function clean(value,max = 120){
  return String(value || "").trim().replace(/[\r\n]/g," ").slice(0,max);
}

function safePdfName(value){
  const name = clean(value,180).replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ");
  return (name || "product-document.pdf").replace(/\.pdf$/i,"") + ".pdf";
}

export async function onRequest(context){
  const {request,env,data} = context;
  if(request.method !== "POST") return json({ok:false,error:"Method not allowed."},405);
  if(!data?.auth?.authenticated) return json({ok:false,error:"Sign in is required."},401);
  if(!env.ASBUILT_DOCS) return json({ok:false,error:"PDF storage is not configured. Bind ASBUILT_DOCS in Cloudflare Pages."},503);

  const length = Number(request.headers.get("content-length") || 0);
  if(length > MAX_PDF_BYTES) return json({ok:false,error:"PDF files are limited to 20 MB."},413);
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if(!contentType.includes("application/pdf")) return json({ok:false,error:"Only PDF product documents are accepted."},415);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if(!bytes.length) return json({ok:false,error:"The uploaded PDF is empty."},400);
  if(bytes.length > MAX_PDF_BYTES) return json({ok:false,error:"PDF files are limited to 20 MB."},413);
  if(String.fromCharCode(...bytes.slice(0,5)) !== "%PDF-") return json({ok:false,error:"The uploaded file is not a valid PDF."},415);

  const url = new URL(request.url);
  const id = crypto.randomUUID();
  const key = `device-docs/${id}.pdf`;
  const filename = safePdfName(url.searchParams.get("filename"));
  const templateId = clean(url.searchParams.get("templateId"),100);
  const docType = clean(url.searchParams.get("docType"),80);
  const metadata = {filename,templateId,docType,uploadedBy:clean(data.auth.email || data.auth.userId,160),uploadedAt:new Date().toISOString()};
  if(typeof env.ASBUILT_DOCS.getWithMetadata === "function"){
    await env.ASBUILT_DOCS.put(key,bytes,{metadata});
  }else{
    await env.ASBUILT_DOCS.put(key,bytes,{
      httpMetadata:{contentType:"application/pdf",contentDisposition:`inline; filename="${filename.replace(/"/g,"")}"`},
      customMetadata:metadata
    });
  }
  return json({ok:true,id,url:`/api/device-doc-file/${encodeURIComponent(id)}`,filename,size:bytes.length},201);
}
