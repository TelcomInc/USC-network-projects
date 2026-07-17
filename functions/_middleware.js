const PRIMARY_HOSTS = new Set([
  "uofsc.asbuilt.thnikers.com",
  "usc.asbuilt.thnikers.com",
  "usc.asbuilts.thnikers.com"
]);

function tenantSlug(hostname){
  const host = String(hostname || "").toLowerCase();
  if(!host.endsWith(".asbuilt.thnikers.com")) return "";
  return host.split(".")[0].replace(/[^a-z0-9-]/g,"").slice(0,48);
}

function cssUrl(value){
  return String(value || "").replace(/["\\\r\n]/g,character => encodeURIComponent(character));
}

export async function onRequest(context){
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();
  if(url.pathname.startsWith("/api/") || host === "create.asbuilt.thnikers.com" || PRIMARY_HOSTS.has(host) || !host.endsWith(".asbuilt.thnikers.com")){
    return context.next();
  }

  const slug = tenantSlug(host);
  const record = context.env.ASBUILT_MAPS ? await context.env.ASBUILT_MAPS.get(`tenant-template:${slug}`,"json") : null;
  if(!record?.manifest){
    return new Response("This As-Built workspace has not been published.",{status:404,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
  }
  if(record.accessProtected !== true){
    return new Response("This As-Built workspace is configured but is waiting for secure login activation.",{status:503,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store","retry-after":"300"}});
  }
  if(url.pathname === "/template.html" || url.pathname === "/strom_thurmond_map.html"){
    return Response.redirect(`${url.origin}/`,302);
  }

  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if(!contentType.includes("text/html")) return response;

  const manifest = record.manifest;
  const template = manifest.template || {};
  const images = template.themeImages || {};
  const opacity = Math.max(.6,Math.min(.95,Number(images.opacity || 88) / 100));
  const accent = /^#[0-9a-f]{6}$/i.test(template.accent || "") ? template.accent : "#2f2a24";
  const secondary = /^#[0-9a-f]{6}$/i.test(template.secondary || "") ? template.secondary : "#facc15";
  const client = String(template.client || "Customer");
  const injectedManifest = JSON.stringify(manifest).replace(/</g,"\\u003c");
  const style = `<style>:root{--garnet:${accent};--garnet-2:${secondary}}${images.shell ? `.shell{background-image:linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity})),url("${cssUrl(images.shell)}")!important;background-size:cover!important;background-position:center!important;background-attachment:fixed!important}` : ""}${images.header ? `.topbar{background-image:linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity})),url("${cssUrl(images.header)}")!important;background-size:cover!important;background-position:center!important}` : ""}${images.body ? `.content{background-image:linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity})),url("${cssUrl(images.body)}")!important;background-size:cover!important;background-position:center!important;background-attachment:fixed!important}` : ""}${images.footer ? `.footer{background-image:linear-gradient(rgba(0,0,0,${opacity}),rgba(0,0,0,${opacity})),url("${cssUrl(images.footer)}")!important;background-size:cover!important;background-position:center!important}` : ""}</style>`;

  return new HTMLRewriter()
    .on("head",{element(element){
      element.prepend(`<script>window.__ASBUILT_TENANT_MANIFEST__=${injectedManifest};<\/script>${style}`,{html:true});
    }})
    .on("title",{element(element){ element.setInnerContent(`${client} As-Built Workspace - Telcom Inc`); }})
    .on(".topbar .brand",{element(element){ element.setInnerContent(`${client} As-Built Workspace <small>Telcom Inc project closeout portal</small>`,{html:true}); }})
    .on(".footer",{element(element){ element.setInnerContent(`${client} - As-Built Portal - Telcom Inc - Confidential`); }})
    .transform(response);
}
