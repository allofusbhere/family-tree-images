/*! script.js — rc1b WORKING CORE + AUTOSTART + IMAGE PATH FIX
 *  - Loads existing app logic: script.v132.js (immediately, not after DOMContentLoaded)
 *  - iPad swipe fix: CSS + non-passive listeners
 *  - Auto-starts from URL id (#id=100000 or ?id=100000)
 *  - Fixes image 404s by redirecting to images repo and trying extension fallbacks
 *  - Cleans NBSP in name labels
 */
(function(){
  // ---------- CONFIG ----------
  var IMAGES_BASE = "https://allofusbhere.github.io/family-tree-images/";
  var EXT_ORDER = [".jpg",".JPG",".jpeg",".png"];

  // ---------- LOAD CORE EARLY ----------
  (function loadCore(){
    try{
      var s=document.createElement('script');
      s.src='script.v132.js';
      // don't wait for DOMContentLoaded; let core attach its own handlers
      s.defer=true;
      document.head.appendChild(s);
    }catch(e){ console.error("Failed to append core script", e); }
  })();

  // ---------- SAFARI TOUCH GUARDS ----------
  (function injectCSS(){
    try{
      var css="html,body{height:100%;} #stage,body{overscroll-behavior:none;touch-action:none;-webkit-user-select:none;user-select:none;}";
      var tag=document.createElement('style'); tag.appendChild(document.createTextNode(css)); document.head.appendChild(tag);
    }catch(e){}
  })();

  function bindSwipes(){
    var surface = document.getElementById('stage') ||
                  document.querySelector('.stage') ||
                  document.querySelector('#anchor') ||
                  document.body;
    if(!surface) return;

    var sx=0, sy=0, dx=0, dy=0, active=false;
    function on(el,ev,fn,opts){ el && el.addEventListener(ev,fn,opts||false); }

    on(surface,'touchstart',function(e){
      var t=e.changedTouches && e.changedTouches[0]; if(!t) return;
      sx=t.clientX; sy=t.clientY; dx=0; dy=0; active=true;
    },{passive:false});

    on(surface,'touchmove',function(e){
      if(!active) return;
      var t=e.changedTouches && e.changedTouches[0]; if(!t) return;
      dx=t.clientX - sx; dy=t.clientY - sy;
      e.preventDefault();
    },{passive:false});

    on(surface,'touchend',function(){
      if(!active) return; active=false;
      var TH=30;
      if(Math.abs(dx)>Math.abs(dy)){
        if(dx>TH  && typeof window.goRight==='function') window.goRight();
        if(dx<-TH && typeof window.goLeft ==='function') window.goLeft();
      }else{
        if(dy<-TH && typeof window.goUp   ==='function') window.goUp();
        if(dy>TH  && typeof window.goDown ==='function') window.goDown();
      }
    },{passive:false});

    on(surface,'touchcancel',function(){ active=false; },{passive:false});
  }

  function cleanName(){
    try{
      var el = document.getElementById('displayName') ||
               document.querySelector('[data-role="name"]') ||
               document.querySelector('.anchor-name');
      if(el){ el.textContent = (el.textContent||"").replace(/\u00A0/g,"").trim(); }
    }catch(e){}
  }

  // ---------- AUTOSTART FROM URL ----------
  function getIdFromURL(){
    try{
      var h=(location.hash||"").replace(/^#/,"");
      var q=(location.search||"").replace(/^\?/,"");
      var params = new URLSearchParams(h.includes("=")?h:q);
      var id = params.get("id");
      return id && id.trim() ? id.trim() : null;
    }catch(e){ return null; }
  }

  function autoStart(){
    var id=getIdFromURL();
    if(!id) return;
    try{
      var input=document.getElementById('idInput');
      if(input) input.value=id;
      if(typeof window.start==='function'){ window.start(); }
      else {
        var btn=document.getElementById('startBtn');
        if(btn) btn.click();
      }
    }catch(e){ console.warn("AutoStart failed", e); }
  }

  // ---------- IMAGE 404 REDIRECT & EXTENSION FALLBACK ----------
  function filenameFrom(src){
    try{ return src.split("/").pop().split("?")[0].split("#")[0]; }catch(e){ return src; }
  }
  function baseName(file){
    var i=file.lastIndexOf('.');
    return i>=0 ? file.slice(0,i) : file;
  }
  function nextExt(ext){
    var idx = EXT_ORDER.indexOf(ext);
    return (idx>=0 && idx<EXT_ORDER.length-1) ? EXT_ORDER[idx+1] : null;
  }
  function isFromAppRepo(src){
    return /\/Family-tree-app\//i.test(src);
  }

  document.addEventListener('error', function(e){
    var t=e.target;
    if(!(t && t.tagName==='IMG')) return;
    // Track current attempt via dataset
    var file = filenameFrom(t.src);
    var name = baseName(file);
    var ext  = file.slice(name.length); // includes the dot
    var current = ext || ".jpg";
    var next = nextExt(current);
    if(isFromAppRepo(t.src)){
      // First redirect to images repo with same extension
      t.src = IMAGES_BASE + file;
      return;
    }
    if(next){
      t.src = IMAGES_BASE + name + next;
      return;
    }
    // no more fallbacks; leave as-is
  }, true); // use capture to catch 404s

  // ---------- INIT AFTER PARSE ----------
  document.addEventListener('DOMContentLoaded', function(){
    // Bind swipes, clean name, and auto-start.
    bindSwipes();
    cleanName();
    autoStart();
  });
})();