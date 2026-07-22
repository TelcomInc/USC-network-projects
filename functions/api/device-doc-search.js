const JSON_HEADERS = {
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store"
};
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const REQUIRED_DOC_TYPES = ["Warranty", "Manual", "Cut Sheet"];

function json(body,status = 200){
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
}

function clean(value,max = 160){
  return String(value || "").trim().replace(/[\r\n]/g," ").slice(0,max);
}

function safePdfName(value){
  const name = clean(value,180).replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ");
  return (name || "device-document.pdf").replace(/\.pdf$/i,"") + ".pdf";
}

function outputText(body){
  if(body && typeof body.output_text === "string") return body.output_text;
  const parts = [];
  for(const item of body?.output || []){
    for(const content of item.content || []){
      if(typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function canonicalDocType(value){
  const type = clean(value,80).toLowerCase();
  if(type.includes("warrant")) return "Warranty";
  if(type.includes("manual") || type.includes("install")) return "Manual";
  if(type.includes("cut") || type.includes("data") || type.includes("spec")) return "Cut Sheet";
  return "";
}

function isSafePublicHttpsUrl(value){
  try{
    const url = new URL(String(value || ""));
    if(url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if(host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if(/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    if(host === "[::1]" || host === "::1") return false;
    return true;
  }catch(_error){
    return false;
  }
}

function parseCandidates(text){
  try{
    const parsed = JSON.parse(text);
    const docs = Array.isArray(parsed) ? parsed : parsed.docs;
    if(!Array.isArray(docs)) return [];
    const found = new Map();
    for(const doc of docs){
      const docType = canonicalDocType(doc.docType || doc.type);
      const sourceUrl = String(doc.pdfUrl || doc.url || "").trim().slice(0,2000);
      if(docType && !found.has(docType) && isSafePublicHttpsUrl(sourceUrl)){
        found.set(docType,{
          docType,
          title:clean(doc.title) || docType,
          sourceUrl,
          source:clean(doc.source || "Manufacturer document"),
          confidence:Math.max(1,Math.min(100,Number(doc.confidence) || 70))
        });
      }
    }
    return REQUIRED_DOC_TYPES.map(type => found.get(type)).filter(Boolean);
  }catch(_error){
    return [];
  }
}

async function findCandidates(input,env){
  const prompt = [
    "Find exactly three official PDF files for this device: its Warranty, Manual, and Cut Sheet.",
    "A Cut Sheet may be called a data sheet, specification sheet, or product data sheet.",
    "Return only JSON with a docs array. Each item must contain docType, title, pdfUrl, source, and confidence.",
    "docType must be exactly Warranty, Manual, or Cut Sheet.",
    "pdfUrl must point directly to a real PDF file, preferably on the official manufacturer website.",
    "Do not return search pages, product pages, support pages, HTML pages, or invented URLs.",
    `Manufacturer: ${input.manufacturer || "unknown"}`,
    `Model: ${input.model || "unknown"}`,
    `Part: ${input.part || "unknown"}`,
    `Device: ${input.deviceName || "unknown"}`,
    `Notes: ${input.notes || ""}`
  ].join("\n");
  const response = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,"content-type":"application/json"},
    body:JSON.stringify({
      model:env.OPENAI_DOC_MODEL || "gpt-4.1-mini",
      tools:[{type:"web_search_preview"}],
      input:prompt
    })
  });
  if(!response.ok) throw new Error(`Document search service returned ${response.status}.`);
  return parseCandidates(outputText(await response.json()));
}

async function fetchPdf(sourceUrl){
  let currentUrl = sourceUrl;
  for(let redirects = 0; redirects <= 3; redirects += 1){
    if(!isSafePublicHttpsUrl(currentUrl)) throw new Error("The document source was not a safe public HTTPS address.");
    const response = await fetch(currentUrl,{headers:{accept:"application/pdf"},redirect:"manual"});
    if(response.status >= 300 && response.status < 400){
      const location = response.headers.get("location");
      if(!location) throw new Error("The document source redirected without a destination.");
      currentUrl = new URL(location,currentUrl).toString();
      continue;
    }
    if(!response.ok) throw new Error(`The document source returned ${response.status}.`);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if(declaredLength > MAX_PDF_BYTES) throw new Error("The PDF is larger than 20 MB.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if(!bytes.length || bytes.length > MAX_PDF_BYTES) throw new Error("The PDF is empty or larger than 20 MB.");
    if(String.fromCharCode(...bytes.slice(0,5)) !== "%PDF-") throw new Error("The result was not a PDF file.");
    return bytes;
  }
  throw new Error("The document source redirected too many times.");
}

async function storePdf(env,data,input,candidate,bytes){
  const id = crypto.randomUUID();
  const filename = safePdfName(candidate.title || `${input.manufacturer} ${input.model} ${candidate.docType}`);
  const metadata = {
    filename,
    templateId:clean(input.templateId,100),
    projectId:clean(input.projectId,100),
    docType:candidate.docType,
    uploadedBy:clean(data.auth.email || data.auth.userId,160),
    uploadedAt:new Date().toISOString(),
    source:candidate.source
  };
  await env.ASBUILT_DOCS.put(`device-docs/${id}.pdf`,bytes,{metadata});
  return {
    id,
    docType:candidate.docType,
    title:candidate.title,
    url:`/api/device-doc-file/${encodeURIComponent(id)}`,
    fileName:filename,
    fileSize:bytes.length,
    confidence:candidate.confidence,
    source:candidate.source,
    attached:true
  };
}

export async function onRequest(context){
  const {request,env,data} = context;
  if(request.method !== "POST") return json({ok:false,error:"Method not allowed."},405);
  if(!data?.auth?.authenticated) return json({ok:false,error:"Sign in is required."},401);
  if(!env.ASBUILT_DOCS) return json({ok:false,error:"PDF storage is not configured."},503);
  if(!env.OPENAI_API_KEY) return json({ok:false,error:"Document search is not configured. You can still upload the three PDFs manually."},503);

  let body;
  try{
    body = await request.json();
  }catch(_error){
    return json({ok:false,error:"Expected JSON body."},400);
  }
  const input = {
    manufacturer:clean(body.manufacturer),
    model:clean(body.model),
    part:clean(body.part),
    deviceName:clean(body.deviceName),
    notes:clean(body.notes),
    templateId:clean(body.templateId,100),
    projectId:clean(body.projectId,100)
  };
  if(!input.manufacturer && !input.model && !input.part && !input.deviceName){
    return json({ok:false,error:"Enter at least one device identifier."},400);
  }

  try{
    const candidates = await findCandidates(input,env);
    const docs = [];
    const failures = [];
    for(const docType of REQUIRED_DOC_TYPES){
      const candidate = candidates.find(item => item.docType === docType);
      if(!candidate){
        failures.push({docType,reason:"No direct manufacturer PDF was found."});
        continue;
      }
      try{
        docs.push(await storePdf(env,data,input,candidate,await fetchPdf(candidate.sourceUrl)));
      }catch(error){
        failures.push({docType,reason:error.message || "The PDF could not be downloaded."});
      }
    }
    if(!docs.length) return json({ok:false,error:"No valid PDFs could be found and attached.",missing:failures},422);
    return json({ok:failures.length === 0,complete:failures.length === 0,docs,missing:failures},failures.length ? 207 : 201);
  }catch(error){
    return json({ok:false,error:error.message || "Device documents could not be found."},502);
  }
}
