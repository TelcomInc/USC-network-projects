import {onRequest as searchDocuments} from "../functions/api/device-doc-search.js";

const requestBody = {
  manufacturer:"Axis",
  model:"P3265-LVE",
  part:"",
  deviceName:"Network camera",
  notes:"Outdoor vandal resistant"
};

const fallback = await searchDocuments({
  request:new Request("https://create.asbuilt.thnikers.com/api/device-doc-search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(requestBody)}),
  env:{}
});
const fallbackBody = await fallback.json();
if(!fallback.ok || fallbackBody.mode !== "fallback" || !fallbackBody.docs?.every(doc => doc.isSearchOnly && doc.searchUrl && !doc.url)){
  throw new Error(`Fallback search was not clearly identified: ${JSON.stringify(fallbackBody)}`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if(String(url) !== "https://api.openai.com/v1/responses") return originalFetch(url);
  return new Response(JSON.stringify({output_text:JSON.stringify({docs:[{
    docType:"Data Sheet",
    title:"Axis P3265-LVE Data Sheet",
    url:"https://www.axis.com/dam/public/example/P3265-LVE-datasheet.pdf",
    confidence:94,
    source:"Axis Communications",
    notes:"Official manufacturer PDF"
  }]})}),{status:200,headers:{"content-type":"application/json"}});
};
try{
  const live = await searchDocuments({
    request:new Request("https://create.asbuilt.thnikers.com/api/device-doc-search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(requestBody)}),
    env:{OPENAI_API_KEY:"smoke-key"}
  });
  const liveBody = await live.json();
  if(!live.ok || liveBody.mode !== "ai" || liveBody.docs?.[0]?.isSearchOnly || !liveBody.docs?.[0]?.url){
    throw new Error(`Live search response was not usable: ${JSON.stringify(liveBody)}`);
  }
  console.log(JSON.stringify({ok:true,fallbackMode:fallbackBody.mode,liveMode:liveBody.mode,liveDocuments:liveBody.docs.length}));
}finally{
  globalThis.fetch = originalFetch;
}
