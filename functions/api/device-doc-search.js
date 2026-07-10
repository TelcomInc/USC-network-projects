const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const DOC_TYPES = ["Data Sheet", "Warranty", "Installation Manual", "O&M Manual", "Support Page"];

function json(body, status = 200){
  return new Response(JSON.stringify(body), {status, headers:jsonHeaders});
}

function clean(value){
  return String(value || "").trim().slice(0, 160);
}

function searchUrl(input, docType){
  const terms = [input.manufacturer, input.model, input.part, input.deviceName, docType, "pdf"]
    .filter(Boolean)
    .join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(terms)}`;
}

function fallbackDocs(input, source = "Search candidate"){
  const baseConfidence = input.model ? 86 : input.part ? 80 : input.manufacturer ? 70 : 58;
  return DOC_TYPES.map((docType, index) => ({
    docType,
    title:[input.manufacturer, input.model || input.part || input.deviceName, docType].filter(Boolean).join(" "),
    url:searchUrl(input, docType),
    confidence:Math.max(52, baseConfidence - index * 4),
    source,
    notes:"Review source before attaching to packet."
  }));
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

function parseDocs(text, input){
  try{
    const parsed = JSON.parse(text);
    const docs = Array.isArray(parsed) ? parsed : parsed.docs;
    if(!Array.isArray(docs)) return [];
    return docs.slice(0, 8).map((doc, index) => ({
      docType:clean(doc.docType || doc.type || DOC_TYPES[index % DOC_TYPES.length]),
      title:clean(doc.title),
      url:clean(doc.url) || searchUrl(input, doc.docType || doc.type || DOC_TYPES[index % DOC_TYPES.length]),
      confidence:Math.max(1, Math.min(100, Number(doc.confidence) || 70)),
      source:clean(doc.source || "AI web lookup"),
      notes:clean(doc.notes || "Review source before attaching to packet.")
    }));
  }catch(_error){
    return [];
  }
}

async function aiDocs(input, env){
  if(!env.OPENAI_API_KEY) return null;
  const prompt = [
    "Find likely manufacturer documentation for this low-voltage device.",
    "Return only JSON with a docs array.",
    "Each doc needs docType, title, url, confidence, source, and notes.",
    "Prefer official manufacturer PDFs or support pages. Do not invent URLs.",
    `Manufacturer: ${input.manufacturer || "unknown"}`,
    `Model: ${input.model || "unknown"}`,
    `Part: ${input.part || "unknown"}`,
    `Device: ${input.deviceName || "unknown"}`,
    `Notes: ${input.notes || ""}`
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method:"POST",
    headers:{
      "authorization":`Bearer ${env.OPENAI_API_KEY}`,
      "content-type":"application/json"
    },
    body:JSON.stringify({
      model:env.OPENAI_DOC_MODEL || "gpt-4.1-mini",
      tools:[{type:"web_search_preview"}],
      input:prompt
    })
  });
  if(!res.ok) return null;
  const body = await res.json();
  const docs = parseDocs(outputText(body), input);
  return docs.length ? docs : null;
}

export async function onRequest(context){
  const {request, env} = context;
  if(request.method === "OPTIONS") return new Response(null, {status:204, headers:jsonHeaders});
  if(request.method !== "POST") return json({ok:false, error:"Method not allowed."}, 405);

  let body;
  try{
    body = await request.json();
  }catch(_error){
    return json({ok:false, error:"Expected JSON body."}, 400);
  }

  const input = {
    manufacturer:clean(body.manufacturer),
    model:clean(body.model),
    part:clean(body.part),
    deviceName:clean(body.deviceName),
    notes:clean(body.notes)
  };

  if(!input.manufacturer && !input.model && !input.part && !input.deviceName){
    return json({ok:false, error:"Enter at least one device identifier."}, 400);
  }

  try{
    const docs = await aiDocs(input, env);
    if(docs) return json({ok:true, mode:"ai", docs});
  }catch(_error){}

  return json({ok:true, mode:"fallback", docs:fallbackDocs(input)});
}
