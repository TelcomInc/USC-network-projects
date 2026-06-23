const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(body, status = 200){
  return new Response(JSON.stringify(body), {status, headers:jsonHeaders});
}

function cleanKey(value){
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 96);
}

export async function onRequest(context){
  const {request, env} = context;
  if(!env.ASBUILT_DB){
    return json({ok:false, error:"D1 binding ASBUILT_DB is not configured."}, 503);
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if(method === "GET"){
    const key = cleanKey(url.searchParams.get("key"));
    if(!key) return json({ok:false, error:"Missing map state key."}, 400);

    const row = await env.ASBUILT_DB
      .prepare("SELECT data, updated_at FROM map_states WHERE key = ?")
      .bind(key)
      .first();

    if(!row) return json({ok:true, key, data:null, updatedAt:null}, 404);

    try{
      return json({ok:true, key, data:JSON.parse(row.data), updatedAt:row.updated_at});
    }catch(_error){
      return json({ok:false, error:"Stored map state is invalid JSON."}, 500);
    }
  }

  if(method === "PUT" || method === "POST"){
    let body;
    try{
      body = await request.json();
    }catch(_error){
      return json({ok:false, error:"Expected JSON body."}, 400);
    }

    const key = cleanKey(body.key);
    if(!key) return json({ok:false, error:"Missing map state key."}, 400);
    if(!body.data || typeof body.data !== "object"){
      return json({ok:false, error:"Missing map state data."}, 400);
    }

    const data = JSON.stringify(body.data);
    const updatedAt = new Date().toISOString();

    await env.ASBUILT_DB
      .prepare("INSERT INTO map_states (key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .bind(key, data, updatedAt)
      .run();

    return json({ok:true, key, updatedAt});
  }

  return json({ok:false, error:"Method not allowed."}, 405);
}
