import {onRequest as uploadDocument} from "../functions/api/device-doc-upload.js";
import {onRequest as readDocument} from "../functions/api/device-doc-file/[id].js";

const objects = new Map();
const env = {
  ASBUILT_DOCS:{
    async put(key,body,options){
      objects.set(key,{body:new Uint8Array(body),options});
    },
    async getWithMetadata(key){
      const saved = objects.get(key);
      if(!saved) return null;
      return {value:saved.body.buffer,metadata:saved.options.metadata};
    }
  }
};
const auth = {auth:{authenticated:true,email:"admin@example.com",userId:"user-smoke"}};
const pdf = new TextEncoder().encode("%PDF-1.7\nsmoke-test\n%%EOF");
const upload = await uploadDocument({
  request:new Request("https://create.asbuilt.thnikers.com/api/device-doc-upload?templateId=tpl-smoke&filename=product-sheet.pdf&docType=Data%20Sheet",{method:"POST",headers:{"content-type":"application/pdf"},body:pdf}),
  env,
  data:auth
});
const uploadBody = await upload.json();
if(upload.status !== 201 || !uploadBody.ok || !uploadBody.url) throw new Error(`PDF upload failed: ${JSON.stringify(uploadBody)}`);

const id = uploadBody.url.split("/").pop();
const read = await readDocument({request:new Request(`https://create.asbuilt.thnikers.com${uploadBody.url}`),env,data:auth,params:{id}});
if(!read.ok || read.headers.get("content-type") !== "application/pdf") throw new Error("Uploaded PDF could not be read back.");
const readBytes = new Uint8Array(await read.arrayBuffer());
if(readBytes.length !== pdf.length) throw new Error("Stored PDF byte count changed.");

const rejected = await uploadDocument({
  request:new Request("https://create.asbuilt.thnikers.com/api/device-doc-upload?filename=fake.pdf",{method:"POST",headers:{"content-type":"application/pdf"},body:"not-a-pdf"}),
  env,
  data:auth
});
if(rejected.status !== 415) throw new Error(`Expected invalid PDF rejection, received ${rejected.status}.`);

console.log(JSON.stringify({ok:true,uploadStatus:upload.status,readStatus:read.status,invalidStatus:rejected.status}));
