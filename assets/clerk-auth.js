(function(){
  "use strict";

  var PUBLISHABLE_KEY = "pk_live_Y2xlcmsudGhuaWtlcnMuY29tJA";
  var FRONTEND_API = "https://clerk.thnikers.com";
  var authResolve;
  var authReady = new Promise(function(resolve){ authResolve=resolve; });
  var settled = false;

  document.documentElement.classList.add("asbuilt-auth-pending");
  window.asbuiltAuthReady = authReady;

  function loadScript(src, attributes){
    return new Promise(function(resolve,reject){
      var existing = document.querySelector('script[src="'+src+'"]');
      if(existing){
        if(existing.dataset.loaded === "true") return resolve();
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",reject,{once:true});
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.crossOrigin = "anonymous";
      Object.keys(attributes || {}).forEach(function(name){ script.setAttribute(name,attributes[name]); });
      script.addEventListener("load",function(){ script.dataset.loaded="true"; resolve(); },{once:true});
      script.addEventListener("error",function(){ reject(new Error("The secure sign-in service could not be loaded.")); },{once:true});
      document.head.appendChild(script);
    });
  }

  function ensureGate(){
    var root = document.getElementById("asbuiltAuthRoot");
    if(root) return root;
    root = document.createElement("div");
    root.id = "asbuiltAuthRoot";
    root.className = "asbuilt-auth-root";
    root.innerHTML = '<div class="asbuilt-auth-shell"><section class="asbuilt-auth-brand"><div><div class="asbuilt-auth-logo">AB</div><h1>As-Built Workspace</h1><p>Secure project closeout, marked plans, device records, warranties, and handoff documents in one place.</p></div><div class="asbuilt-auth-proof">TELCOM INC<br>Protected access for approved project teams and customers.</div></section><section class="asbuilt-auth-panel"><div class="asbuilt-auth-heading"><strong>Welcome back</strong><span>Sign in with your approved email address to continue.</span></div><div class="asbuilt-auth-clerk" id="asbuiltClerkMount"></div></section></div>';
    document.body.appendChild(root);
    applyTenantBrand(root);
    return root;
  }

  function applyTenantBrand(root){
    var manifest = window.__ASBUILT_TENANT_MANIFEST__ || {};
    var template = manifest.template || {};
    var client = String(template.client || "").trim();
    var title = String(template.loginTitle || "").trim();
    var message = String(template.loginMessage || "").trim();
    var brandTitle = root.querySelector(".asbuilt-auth-brand h1");
    var brandCopy = root.querySelector(".asbuilt-auth-brand p");
    var heading = root.querySelector(".asbuilt-auth-heading strong");
    var subheading = root.querySelector(".asbuilt-auth-heading span");
    var brandPanel = root.querySelector(".asbuilt-auth-brand");
    if(client && brandTitle) brandTitle.textContent = client+" As-Built Workspace";
    if(title && heading) heading.textContent = title;
    if(message && subheading) subheading.textContent = message;
    if(template.name && brandCopy) brandCopy.textContent = String(template.name)+" — secure project closeout, marked plans, device records, warranties, and handoff documents.";
    if(brandPanel && /^#[0-9a-f]{6}$/i.test(template.loginBackground || "")){
      brandPanel.style.background = `linear-gradient(160deg, ${template.loginBackground}, ${/^#[0-9a-f]{6}$/i.test(template.secondary || "") ? template.secondary : "#0f5f67"})`;
    }
  }

  function safeReturnUrl(){
    var value = new URLSearchParams(window.location.search).get("return") || "/";
    return value.startsWith("/") && !value.startsWith("//") ? value : "/";
  }

  function signedInEmail(){
    return window.Clerk && Clerk.user && Clerk.user.primaryEmailAddress ? Clerk.user.primaryEmailAddress.emailAddress : "";
  }

  function finishSignedIn(){
    if(window.__ASBUILT_LOGIN_ONLY__){
      window.location.replace(safeReturnUrl());
      return;
    }
    var root = document.getElementById("asbuiltAuthRoot");
    if(root) root.hidden = true;
    document.documentElement.classList.remove("asbuilt-auth-pending");
    document.documentElement.classList.add("asbuilt-authenticated");
    var identity = document.getElementById("accessIdentity");
    var email = signedInEmail();
    if(identity) identity.textContent = email ? "Signed in: "+email : "Signed in securely";
    var logout = document.getElementById("accessLogout");
    if(logout){
      logout.classList.remove("auth-hidden");
      logout.removeAttribute("href");
      logout.addEventListener("click",function(event){
        event.preventDefault();
        Clerk.signOut().then(function(){ window.location.reload(); });
      },{once:true});
    }
    if(!settled){ settled=true; authResolve(Clerk); }
  }

  function showError(error){
    var root = ensureGate();
    var panel = root.querySelector(".asbuilt-auth-panel");
    panel.innerHTML = '<div class="asbuilt-auth-error"><strong>Secure sign-in is temporarily unavailable.</strong><div>'+(error && error.message ? error.message : "Please try again.")+'</div><button class="asbuilt-auth-retry" type="button">Retry</button></div>';
    panel.querySelector("button").addEventListener("click",function(){ window.location.reload(); });
    if(!settled){ settled=true; authResolve(null); }
  }

  async function start(){
    var gate = ensureGate();
    applyTenantBrand(gate);
    try{
      await loadScript(FRONTEND_API+"/npm/@clerk/ui@1/dist/ui.browser.js");
      await loadScript(FRONTEND_API+"/npm/@clerk/clerk-js@6/dist/clerk.browser.js",{"data-clerk-publishable-key":PUBLISHABLE_KEY});
      await Clerk.load({
        ui:{ClerkUI:window.__internal_ClerkUICtor},
        appearance:{
          variables:{colorPrimary:"#2563eb",colorText:"#172033",colorBackground:"#f8fafc",colorInputBackground:"#ffffff",borderRadius:"0.65rem",fontFamily:'"Segoe UI", Arial, sans-serif'},
          elements:{cardBox:"shadow-none",card:"shadow-none border border-slate-200",headerTitle:"text-slate-900",headerSubtitle:"text-slate-600",footer:"bg-transparent"}
        }
      });
      if(Clerk.isSignedIn){
        finishSignedIn();
        return;
      }
      Clerk.mountSignIn(document.getElementById("asbuiltClerkMount"),{routing:"hash"});
      Clerk.addListener(function(state){ if(state && state.user) window.location.reload(); });
    }catch(error){
      showError(error);
    }
  }

  window.asbuiltApiFetch = async function(input, init){
    var clerk = await authReady;
    if(!clerk || !window.Clerk || !Clerk.session) throw new Error("Secure sign-in is unavailable. Retry sign-in before continuing.");
    var options = Object.assign({}, init || {});
    var headers = new Headers(options.headers || {});
    var token = Clerk.session ? await Clerk.session.getToken() : "";
    if(token) headers.set("authorization","Bearer "+token);
    options.headers = headers;
    return window.fetch(input,options);
  };

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
