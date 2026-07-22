import {onRequestGet} from "../functions/api/session.js";
import {context,send} from "./_runtime.js";
export default async function handler(req,res){
  if(req.method !== "GET") return send(res,new Response(JSON.stringify({ok:false,error:"Method not allowed."}),{status:405,headers:{"content-type":"application/json"}}));
  return send(res,await onRequestGet(await context(req)));
}
