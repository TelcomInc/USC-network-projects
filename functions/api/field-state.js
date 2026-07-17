const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const phases = [
  {key:"cablePulled", label:"Cable Pulled"},
  {key:"deviceInstalled", label:"Device Installed"},
  {key:"tested", label:"Tested"},
  {key:"asBuiltVerified", label:"As-Built Verified"}
];

function json(body, status = 200){
  return new Response(JSON.stringify(body), {status, headers:jsonHeaders});
}

function cleanKey(value){
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 96);
}

function cacheStorage(){
  return typeof caches !== "undefined" && caches.default ? caches.default : null;
}

function cacheRequest(kind, key){
  return new Request(`https://asbuilt.local/${kind}/${encodeURIComponent(key)}`);
}

async function loadCache(kind, key){
  const cache = cacheStorage();
  if(!cache) return null;
  const res = await cache.match(cacheRequest(kind, key));
  if(!res) return null;
  try{
    return await res.json();
  }catch(_error){
    return null;
  }
}

async function saveCache(kind, key, data){
  const cache = cacheStorage();
  if(!cache) throw new Error("No cache storage available.");
  await cache.put(cacheRequest(kind, key), new Response(JSON.stringify(data), {
    headers:{"content-type":"application/json; charset=utf-8", "cache-control":"public, max-age=31536000"}
  }));
  return "cache";
}
function splitList(value){
  return String(value || "")
    .split(/[,\n]/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function decodeJwtPayload(token){
  try{
    const payload = String(token || "").split(".")[1];
    if(!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  }catch(_error){
    return {};
  }
}

function accessEmail(request){
  const direct = request.headers.get("cf-access-authenticated-user-email");
  if(direct) return direct.trim().toLowerCase();
  const token = request.headers.get("cf-access-jwt-assertion");
  const payload = decodeJwtPayload(token);
  return String(payload.email || "").trim().toLowerCase();
}

function hasListMatch(email, env, emailsName, domainsName){
  if(!email) return false;
  const emails = splitList(env[emailsName]);
  const domains = splitList(env[domainsName]);
  const domain = email.includes("@") ? email.split("@").pop() : "";
  return emails.includes(email) || (domain && domains.includes(domain));
}

function roleFor(email, env){
  if(hasListMatch(email, env, "ASBUILT_ADMIN_EMAILS", "ASBUILT_ADMIN_DOMAINS")) return "admin";
  if(hasListMatch(email, env, "ASBUILT_PM_EMAILS", "ASBUILT_PM_DOMAINS")) return "projectManager";
  return email ? "field" : "viewer";
}

function blankState(key){
  return {
    key,
    phaseIndex:0,
    phases,
    config:{
      setupComplete:false,
      identifiedAt:null,
      setupCompletedAt:null,
      setupCompletedBy:null,
      cableTypes:["Cat6","Cat6A","Fiber","Composite Access Control","Speaker","Other"],
      defaultCableType:"Cat6",
      defaultDeviceType:"wirelessAp",
      deviceTypes:{
        wirelessAp:{
          key:"wirelessAp",
          label:"Wireless AP",
          symbol:"circle",
          fields:[
            {key:"make", label:"Device Make", required:true},
            {key:"model", label:"Model", required:true},
            {key:"serial", label:"Serial / Part Number", required:true},
            {key:"mac", label:"MAC Address", required:false},
            {key:"ip", label:"IP Address", required:false},
            {key:"port", label:"Port Number", required:false},
            {key:"closet", label:"Closet", required:false},
            {key:"patchPanel", label:"Patch Panel", required:false}
          ]
        }
      }
    },
    markers:{},
    phaseApprovals:{},
    finalSignoffs:{pm:[], admin:[]},
    handoffLinks:[],
    updatedAt:null
  };
}

function normalizeState(state, key){
  const base = blankState(key);
  const next = {...base, ...(state || {})};
  next.config = {...base.config, ...(state?.config || {})};
  next.config.deviceTypes = {...base.config.deviceTypes, ...(state?.config?.deviceTypes || {})};
  next.config.cableTypes = Array.isArray(next.config.cableTypes) && next.config.cableTypes.length ? next.config.cableTypes : base.config.cableTypes;
  next.config.defaultCableType = next.config.defaultCableType || next.config.cableTypes[0] || "Cat6";
  next.markers = next.markers || {};
  next.phaseApprovals = next.phaseApprovals || {};
  next.finalSignoffs = next.finalSignoffs || {pm:[], admin:[]};
  next.finalSignoffs.pm = Array.isArray(next.finalSignoffs.pm) ? next.finalSignoffs.pm : [];
  next.finalSignoffs.admin = Array.isArray(next.finalSignoffs.admin) ? next.finalSignoffs.admin : [];
  next.handoffLinks = Array.isArray(next.handoffLinks) ? next.handoffLinks : [];
  return next;
}

function currentPhase(state){
  return phases[Math.min(state.phaseIndex || 0, phases.length - 1)].key;
}

function markerKey(marker){
  return cleanKey(marker.id || marker.markerId || marker.ap_num || marker.label);
}

function ensureMarker(state, marker){
  const id = markerKey(marker);
  if(!id) return null;
  if(!state.markers[id]){
    state.markers[id] = {
      id,
      label:String(marker.label || marker.ap_num || id),
      ap_num:marker.ap_num ?? null,
      floor:String(marker.floor || ""),
      wing:String(marker.wing || ""),
      area:String(marker.area || ""),
      cableType:String(marker.cableType || state.config?.defaultCableType || "Cat6"),
      active:true,
      systemPlaced:Boolean(marker.systemPlaced),
      deviceType:cleanKey(marker.deviceType || state.config?.defaultDeviceType || "device"),
      deviceRecord:{},
      devices:[],
      phases:{}
    };
  }else{
    state.markers[id].active = true;
    state.markers[id].label = String(marker.label || state.markers[id].label || id);
    state.markers[id].ap_num = marker.ap_num ?? state.markers[id].ap_num ?? null;
    state.markers[id].floor = String(marker.floor || state.markers[id].floor || "");
    state.markers[id].wing = String(marker.wing || state.markers[id].wing || "");
    state.markers[id].area = String(marker.area || state.markers[id].area || "");
    state.markers[id].cableType = String(marker.cableType || state.markers[id].cableType || state.config?.defaultCableType || "Cat6");
    state.markers[id].systemPlaced = Boolean(marker.systemPlaced || state.markers[id].systemPlaced);
    state.markers[id].deviceType = cleanKey(marker.deviceType || state.markers[id].deviceType || state.config?.defaultDeviceType || "device");
    state.markers[id].deviceRecord = state.markers[id].deviceRecord && typeof state.markers[id].deviceRecord === "object" ? state.markers[id].deviceRecord : {};
    state.markers[id].devices = Array.isArray(state.markers[id].devices) ? state.markers[id].devices : [];
    state.markers[id].phases = state.markers[id].phases || {};
  }
  const phase = currentPhase(state);
  state.markers[id].phases[phase] = state.markers[id].phases[phase] || {};
  return state.markers[id];
}

function ensureMarkers(state, markers){
  if(!Array.isArray(markers)) return;
  Object.values(state.markers || {}).forEach(marker => { marker.active = false; });
  markers.forEach(marker => ensureMarker(state, marker));
}

function activeMarkers(state){
  return Object.values(state.markers || {}).filter(marker => marker.active !== false);
}

function handoffApproval(state = {}){
  const finalSignoffs = state.finalSignoffs || {};
  const admins = new Set(finalSignoffs.admin || []);
  const managers = new Set(finalSignoffs.pm || []);
  const distinctPeople = new Set([...admins, ...managers]);
  const pmAndAdmin = admins.size >= 1 && managers.size >= 1 && distinctPeople.size >= 2;
  const twoAdmins = admins.size >= 2;
  const finalPhase = phases[phases.length - 1].key;
  const finalAdminOverride = (state.adminOverrides || []).some(item => item && item.phase === finalPhase && item.by);
  return {
    ready:pmAndAdmin || twoAdmins || finalAdminOverride,
    mode:finalAdminOverride ? "admin-override" : (pmAndAdmin ? "pm-and-admin" : (twoAdmins ? "two-admins" : null)),
    adminCount:admins.size,
    pmCount:managers.size,
    distinctCount:distinctPeople.size
  };
}

function phaseRecord(marker, phase){
  marker.phases = marker.phases || {};
  marker.phases[phase] = marker.phases[phase] || {};
  return marker.phases[phase];
}

function selectedMarkers(state, scope = {}){
  const all = activeMarkers(state);
  const type = String(scope.type || "all");
  const value = String(scope.value || "").toLowerCase();
  if(type === "all") return all;
  if(type === "individual"){
    const wanted = cleanKey(scope.markerId || scope.value);
    return all.filter(marker => marker.id === wanted || cleanKey(marker.label) === wanted || cleanKey(marker.ap_num) === wanted);
  }
  return all.filter(marker => String(marker[type] || "").toLowerCase() === value);
}

function missingForPhase(markers, phase){
  return markers.filter(marker => {
    const record = phaseRecord(marker, phase);
    return !record.fieldComplete || !record.pmComplete;
  }).map(marker => marker.id);
}

function normalizeField(field){
  const key = cleanKey(field.key || field.label);
  if(!key) return null;
  return {
    key,
    label:String(field.label || field.key || key).trim(),
    required:Boolean(field.required)
  };
}

function normalizeDeviceType(input){
  const key = cleanKey(input.key || input.label);
  if(!key) return null;
  const fields = Array.isArray(input.fields) ? input.fields.map(normalizeField).filter(Boolean) : [];
  return {
    key,
    label:String(input.label || key).trim(),
    symbol:cleanKey(input.symbol || "circle"),
    fields
  };
}

function deviceTypeConfig(state, key){
  const fallbackKey = state.config?.defaultDeviceType || "wirelessAp";
  return state.config?.deviceTypes?.[key] || state.config?.deviceTypes?.[fallbackKey] || blankState(state.key).config.deviceTypes.wirelessAp;
}

function requiredMissing(config, data){
  return (config.fields || [])
    .filter(field => field.required && !String(data?.[field.key] || "").trim())
    .map(field => field.key);
}

function upsertDevice(marker, phase, data, email){
  const clean = {};
  Object.entries(data || {}).forEach(([key,value]) => {
    clean[cleanKey(key)] = String(value ?? "").trim();
  });
  marker.deviceRecord = {...(marker.deviceRecord || {}), ...clean};
  const device = {
    id:clean.deviceId || clean.serial || `${marker.id}-${phase}`,
    phase,
    deviceType:marker.deviceType,
    data:clean,
    updatedBy:email,
    updatedAt:new Date().toISOString()
  };
  marker.devices = Array.isArray(marker.devices) ? marker.devices : [];
  const index = marker.devices.findIndex(item => item.id === device.id || item.phase === phase);
  if(index >= 0) marker.devices[index] = {...marker.devices[index], ...device};
  else marker.devices.push(device);
  return device;
}

async function loadState(env, key){
  if(env.ASBUILT_DB){
    const row = await env.ASBUILT_DB
      .prepare("SELECT data, updated_at FROM field_states WHERE key = ?")
      .bind(key)
      .first();
    if(row){
      try{
        return normalizeState({...JSON.parse(row.data), updatedAt:row.updated_at}, key);
      }catch(_error){}
    }
  }
  if(env.ASBUILT_FIELDS){
    const stored = await env.ASBUILT_FIELDS.get(key, "json");
    if(stored) return normalizeState(stored, key);
  }
  const cached = await loadCache("field-state", key);
  if(cached) return normalizeState(cached, key);
  return normalizeState({}, key);
}

async function saveState(env, key, state){
  state.updatedAt = new Date().toISOString();
  if(env.ASBUILT_DB){
    await env.ASBUILT_DB
      .prepare("INSERT INTO field_states (key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .bind(key, JSON.stringify(state), state.updatedAt)
      .run();
    return "d1";
  }
  if(env.ASBUILT_FIELDS){
    await env.ASBUILT_FIELDS.put(key, JSON.stringify(state));
    return "kv";
  }
  return await saveCache("field-state", key, state);
}

export async function onRequest(context){
  const {request, env} = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const email = accessEmail(request);
  const role = roleFor(email, env);

  if(method === "GET"){
    const key = cleanKey(url.searchParams.get("key"));
    if(!key) return json({ok:false, error:"Missing field-state key."}, 400);
    const state = await loadState(env, key);
    return json({ok:true, key, role, email:email || null, state});
  }

  if(method !== "POST") return json({ok:false, error:"Method not allowed."}, 405);
  if(!email) return json({ok:false, error:"Cloudflare Access identity required."}, 401);

  let body;
  try{
    body = await request.json();
  }catch(_error){
    return json({ok:false, error:"Expected JSON body."}, 400);
  }

  const key = cleanKey(body.key);
  if(!key) return json({ok:false, error:"Missing field-state key."}, 400);

  const state = await loadState(env, key);
  state.config = normalizeState(state, key).config;
  ensureMarkers(state, body.markers);
  const phase = currentPhase(state);
  const action = String(body.action || "");

  if(action === "save-config"){
    if(role !== "admin" && role !== "projectManager"){
      return json({ok:false, error:"Project manager or admin access required."}, 403);
    }
    const deviceType = normalizeDeviceType(body.deviceType || {});
    if(!deviceType) return json({ok:false, error:"Missing device type."}, 400);
    state.config.deviceTypes[deviceType.key] = deviceType;
    if(Array.isArray(body.cableTypes) && body.cableTypes.length){
      state.config.cableTypes = body.cableTypes.map(item => String(item || "").trim()).filter(Boolean);
    }
    if(body.defaultCableType) state.config.defaultCableType = String(body.defaultCableType).trim() || state.config.defaultCableType;
    state.config.defaultDeviceType = cleanKey(body.defaultDeviceType || state.config.defaultDeviceType || deviceType.key);
    if(body.makeDefault) state.config.defaultDeviceType = deviceType.key;
    state.config.setupComplete = false;
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, deviceType, state});
  }

  if(action === "identify-legend"){
    if(role !== "admin" && role !== "projectManager"){
      return json({ok:false, error:"Project manager or admin access required."}, 403);
    }
    const deviceType = cleanKey(body.deviceType || state.config.defaultDeviceType);
    if(!state.config.deviceTypes[deviceType]) return json({ok:false, error:"Unknown device type."}, 400);
    const detected = Array.isArray(body.detectedMarkers) ? body.detectedMarkers : [];
    let nextNumber = Math.max(0, ...activeMarkers(state).map(marker => Number(marker.ap_num) || 0)) + 1;
    const placed = detected.map((marker,index) => {
      const seeded = {
        ...marker,
        id:marker.id || `sys-${Date.now()}-${index + 1}`,
        label:marker.label || `${state.config.deviceTypes[deviceType].label} ${nextNumber}`,
        ap_num:marker.ap_num || nextNumber++,
        cableType:marker.cableType || state.config.defaultCableType,
        deviceType,
        systemPlaced:true
      };
      const saved = ensureMarker(state, seeded);
      saved.deviceType = deviceType;
      saved.systemPlaced = true;
      return saved.id;
    });
    state.config.setupComplete = false;
    state.config.identifiedAt = new Date().toISOString();
    state.config.identifiedBy = email;
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, placedMarkerIds:placed, state});
  }

  if(action === "assign-device-type"){
    if(role !== "admin" && role !== "projectManager"){
      return json({ok:false, error:"Project manager or admin access required."}, 403);
    }
    const deviceType = cleanKey(body.deviceType);
    if(!state.config.deviceTypes[deviceType]) return json({ok:false, error:"Unknown device type."}, 400);
    const selected = selectedMarkers(state, body.scope || {});
    if(!selected.length) return json({ok:false, error:"No markers match that scope."}, 400);
    selected.forEach(marker => { marker.deviceType = deviceType; });
    if(body.cableType) selected.forEach(marker => { marker.cableType = String(body.cableType).trim() || marker.cableType; });
    state.config.setupComplete = false;
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, assignedMarkerIds:selected.map(marker => marker.id), state});
  }

  if(action === "ready-phase-one"){
    if(role !== "admin" && role !== "projectManager"){
      return json({ok:false, error:"Project manager or admin access required."}, 403);
    }
    const all = activeMarkers(state);
    if(!all.length){
      return json({ok:false, error:"Identify or add at least one plan icon before field phase one starts."}, 409);
    }
    const missingTypes = all.filter(marker => !marker.deviceType || !state.config.deviceTypes[marker.deviceType]).map(marker => marker.id);
    if(missingTypes.length){
      return json({ok:false, error:"Every icon needs a valid device type before field phase one starts.", missingMarkerIds:missingTypes, state}, 409);
    }
    state.config.setupComplete = true;
    state.config.setupCompletedAt = new Date().toISOString();
    state.config.setupCompletedBy = email;
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, state});
  }

  if(action === "mark-field"){
    if(!state.config.setupComplete){
      return json({ok:false, error:"Field phase one is not ready. Admin/PM must identify icons, correct the map, assign required fields, and mark setup complete first.", state}, 409);
    }
    const marker = ensureMarker(state, body.marker || {});
    if(!marker) return json({ok:false, error:"Missing marker."}, 400);
    if(body.marker?.deviceType) marker.deviceType = cleanKey(body.marker.deviceType);
    if(body.marker?.cableType) marker.cableType = String(body.marker.cableType).trim() || marker.cableType;
    const record = phaseRecord(marker, phase);
    if(phase === "cablePulled"){
      record.cableType = marker.cableType || state.config.defaultCableType;
    }
    if(phase === "deviceInstalled"){
      const config = deviceTypeConfig(state, marker.deviceType);
      const mergedData = {...(marker.deviceRecord || {}), ...(body.deviceData || {})};
      const missing = requiredMissing(config, mergedData);
      if(missing.length){
        return json({ok:false, error:"Required device information is missing.", missingFields:missing, deviceType:config, markerId:marker.id, state}, 409);
      }
      record.deviceData = mergedData;
      record.device = upsertDevice(marker, phase, mergedData, email);
    }
    if(!record.fieldComplete){
      record.fieldComplete = true;
      record.fieldBy = email;
      record.fieldAt = new Date().toISOString();
    }
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, phase, markerId:marker.id, state});
  }

  if(action === "save-device-record"){
    if(role !== "admin" && role !== "projectManager"){
      return json({ok:false, error:"Project manager or admin access required."}, 403);
    }
    const marker = ensureMarker(state, body.marker || {});
    if(!marker) return json({ok:false, error:"Missing marker."}, 400);
    const clean = {};
    Object.entries(body.deviceData || {}).forEach(([field,value]) => {
      clean[cleanKey(field)] = String(value ?? "").trim();
    });
    marker.deviceRecord = {...(marker.deviceRecord || {}), ...clean};
    marker.deviceRecordUpdatedBy = email;
    marker.deviceRecordUpdatedAt = new Date().toISOString();
    if(body.marker?.deviceType) marker.deviceType = cleanKey(body.marker.deviceType);
    if(body.marker?.cableType) marker.cableType = String(body.marker.cableType).trim() || marker.cableType;
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, markerId:marker.id, state});
  }

  if(action === "verify-scope"){
    if(role !== "admin" && role !== "projectManager"){
      return json({ok:false, error:"Project manager or admin access required."}, 403);
    }
    const selected = selectedMarkers(state, body.scope || {});
    if(!selected.length) return json({ok:false, error:"No markers match that scope."}, 400);
    const missingField = selected.filter(marker => !phaseRecord(marker, phase).fieldComplete).map(marker => marker.id);
    if(missingField.length && role !== "admin"){
      return json({ok:false, error:"Some locations have not been marked complete by field workers.", missingMarkerIds:missingField, phase, state}, 409);
    }
    const verifiedAt = new Date().toISOString();
    selected.forEach(marker => {
      const record = phaseRecord(marker, phase);
      if(!record.fieldComplete){
        record.fieldComplete = true;
        record.fieldBy = email;
        record.fieldAt = verifiedAt;
        record.fieldOverride = true;
      }
      record.pmComplete = true;
      record.pmBy = email;
      record.pmAt = verifiedAt;
      if(role === "admin") record.adminOverride = {by:email, at:verifiedAt};
    });
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, phase, verifiedMarkerIds:selected.map(marker => marker.id), fieldOverriddenMarkerIds:role === "admin" ? missingField : [], state});
  }

  if(action === "approve-phase"){
    if(role !== "admin"){
      return json({ok:false, error:"Admin access required for phase approval."}, 403);
    }
    const all = activeMarkers(state);
    const missing = missingForPhase(all, phase);
    if(missing.length){
      return json({ok:false, error:"Phase cannot advance until every location is field-marked and PM/admin verified.", missingMarkerIds:missing, phase, state}, 409);
    }
    const approvals = new Set(state.phaseApprovals[phase] || []);
    approvals.add(email);
    state.phaseApprovals[phase] = Array.from(approvals);
    let advanced = false;
    if(state.phaseApprovals[phase].length >= 2 && state.phaseIndex < phases.length - 1){
      state.phaseIndex += 1;
      advanced = true;
    }
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, phase, approvals:state.phaseApprovals[phase], advanced, state}, advanced ? 200 : 202);
  }

  if(action === "admin-advance-phase"){
    if(role !== "admin"){
      return json({ok:false, error:"Admin access required to override and advance a phase."}, 403);
    }
    const all = activeMarkers(state);
    if(!all.length){
      return json({ok:false, error:"Add or identify at least one location before advancing the workflow."}, 409);
    }
    const overriddenAt = new Date().toISOString();
    const phasesThroughCurrent = phases.slice(0, Math.min(state.phaseIndex || 0, phases.length - 1) + 1);
    all.forEach(marker => {
      phasesThroughCurrent.forEach(phaseDefinition => {
        const record = phaseRecord(marker, phaseDefinition.key);
        if(!record.fieldComplete){
          record.fieldComplete = true;
          record.fieldBy = email;
          record.fieldAt = overriddenAt;
          record.fieldOverride = true;
        }
        record.pmComplete = true;
        record.pmBy = email;
        record.pmAt = overriddenAt;
        record.pmOverride = true;
        record.adminOverride = {by:email, at:overriddenAt};
      });
    });
    state.phaseApprovals[phase] = Array.from(new Set([...(state.phaseApprovals[phase] || []), email]));
    state.adminOverrides = Array.isArray(state.adminOverrides) ? state.adminOverrides : [];
    const advanced = state.phaseIndex < phases.length - 1;
    state.adminOverrides.push({phase, by:email, at:overriddenAt, advanced});
    if(advanced) state.phaseIndex += 1;
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, phase, advanced, overriddenMarkerIds:all.map(marker => marker.id), state});
  }

  if(action === "final-signoff"){
    if(role !== "admin" && role !== "projectManager"){
      return json({ok:false, error:"PM or admin access required for final signoff."}, 403);
    }
    const all = activeMarkers(state);
    const finalPhase = phases[phases.length - 1].key;
    const missing = missingForPhase(all, finalPhase);
    if(missing.length){
      return json({ok:false, error:"Final signoff requires every location to be field-marked and PM/admin verified through As-Built Verified.", missingMarkerIds:missing, phase:finalPhase, state}, 409);
    }
    const bucket = role === "admin" ? "admin" : "pm";
    const existing = new Set(state.finalSignoffs?.[bucket] || []);
    existing.add(email);
    state.finalSignoffs = state.finalSignoffs || {pm:[], admin:[]};
    state.finalSignoffs[bucket] = Array.from(existing);
    const approval = handoffApproval(state);
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, finalSignoffs:state.finalSignoffs, approval, state});
  }

  if(action === "publish-handoff"){
    if(role !== "admin"){
      return json({ok:false, error:"Admin access required to publish client handoff."}, 403);
    }
    const approval = handoffApproval(state);
    if(!approval.ready){
      return json({ok:false, error:"Client handoff requires one PM plus one admin, two admins, or a logged final-stage admin override.", finalSignoffs:state.finalSignoffs, approval, state}, 409);
    }
    const link = {
      url:String(body.url || "").trim(),
      note:String(body.note || "").trim(),
      publishedBy:email,
      publishedAt:new Date().toISOString()
    };
    state.handoffLinks = [...(state.handoffLinks || []), link];
    const store = await saveState(env, key, state);
    return json({ok:true, key, role, store, link, approval, state});
  }

  return json({ok:false, error:"Unknown field-state action."}, 400);
}
