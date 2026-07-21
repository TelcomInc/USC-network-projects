function json(body,status = 200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}

export async function onRequest(context){
  const {request,env,data,params} = context;
  if(request.method !== "GET") return json({ok:false,error:"Method not allowed."},405);
  if(!data?.auth?.authenticated) return json({ok:false,error:"Sign in is required."},401);
  if(!env.ASBUILT_DOCS) return json({ok:false,error:"PDF storage is not configured."},503);
  const id = String(params?.id || "").replace(/[^a-f0-9-]/gi,"");
  if(!id) return json({ok:false,error:"Document not found."},404);
  const headers = new Headers();
  let body;
  if(typeof env.ASBUILT_DOCS.getWithMetadata === "function"){
    const stored = await env.ASBUILT_DOCS.getWithMetadata(`device-docs/${id}.pdf`,{type:"arrayBuffer"});
    if(!stored?.value) return json({ok:false,error:"Document not found."},404);
    body = stored.value;
    const filename = String(stored.metadata?.filename || "product-document.pdf").replace(/["\r\n]/g,"");
    headers.set("content-disposition",`inline; filename="${filename}"`);
  }else{
    const object = await env.ASBUILT_DOCS.get(`device-docs/${id}.pdf`);
    if(!object) return json({ok:false,error:"Document not found."},404);
    object.writeHttpMetadata(headers);
    if(object.httpEtag) headers.set("etag",object.httpEtag);
    body = object.body;
  }
  headers.set("content-type","application/pdf");
  headers.set("cache-control","private, no-store");
  headers.set("x-content-type-options","nosniff");
  headers.set("content-security-policy","default-src 'none'; frame-ancestors 'self'");
  return new Response(body,{status:200,headers});
}
