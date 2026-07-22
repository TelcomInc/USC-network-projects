import {onRequest as searchDocuments} from "../functions/api/device-doc-search.js";

const requestBody = {
  manufacturer:"Axis",
  model:"P3265-LVE",
  part:"",
  deviceName:"Network camera",
  notes:"Outdoor vandal resistant",
  projectId:"project-smoke"
};
const auth = {auth:{authenticated:true,email:"admin@example.com",userId:"user-smoke"}};
const objects = new Map();
const storage = {
  async put(key,body,options){ objects.set(key,{body:new Uint8Array(body),options}); }
};

const unconfigured = await searchDocuments({
  request:new Request("https://create.asbuilt.thnikers.com/api/device-doc-search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(requestBody)}),
  env:{ASBUILT_DOCS:storage},
  data:auth
});
const unconfiguredBody = await unconfigured.json();
if(unconfigured.status !== 503 || unconfiguredBody.docs || /google|https?:\/\//i.test(unconfiguredBody.error || "")){
  throw new Error(`Unconfigured search exposed link-style results: ${JSON.stringify(unconfiguredBody)}`);
}

const candidates = [
  {docType:"Warranty",title:"Axis Warranty",pdfUrl:"https://www.axis.com/docs/warranty.pdf",source:"Axis",confidence:96},
  {docType:"Manual",title:"Axis P3265-LVE Manual",pdfUrl:"https://www.axis.com/docs/manual.pdf",source:"Axis",confidence:98},
  {docType:"Cut Sheet",title:"Axis P3265-LVE Cut Sheet",pdfUrl:"https://www.axis.com/docs/cut-sheet.pdf",source:"Axis",confidence:99}
];
const pdf = new TextEncoder().encode("%PDF-1.7\nsmoke-test\n%%EOF");
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if(String(url) === "https://api.openai.com/v1/responses"){
    return new Response(JSON.stringify({output_text:JSON.stringify({docs:candidates})}),{status:200,headers:{"content-type":"application/json"}});
  }
  if(candidates.some(candidate => candidate.pdfUrl === String(url))){
    return new Response(pdf,{status:200,headers:{"content-type":"application/pdf","content-length":String(pdf.length)}});
  }
  return new Response("not found",{status:404});
};

try{
  const live = await searchDocuments({
    request:new Request("https://create.asbuilt.thnikers.com/api/device-doc-search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(requestBody)}),
    env:{OPENAI_API_KEY:"smoke-key",ASBUILT_DOCS:storage},
    data:auth
  });
  const body = await live.json();
  if(live.status !== 201 || !body.complete || body.docs?.length !== 3 || objects.size !== 3){
    throw new Error(`Three PDFs were not stored and attached: ${JSON.stringify(body)}`);
  }
  if(body.docs.some(doc => !doc.attached || !/^\/api\/device-doc-file\//.test(doc.url) || "sourceUrl" in doc || /^https?:/.test(doc.url))){
    throw new Error(`Search returned external URL results: ${JSON.stringify(body.docs)}`);
  }
  console.log(JSON.stringify({ok:true,unconfiguredStatus:unconfigured.status,searchStatus:live.status,attachedPdfs:body.docs.length}));
}finally{
  globalThis.fetch = originalFetch;
}
