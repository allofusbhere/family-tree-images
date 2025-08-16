// SwipeTree — swipe logic + dynamic relationship grids
(function(){
  'use strict';

  // --- Config ---
  const PLACEHOLDER = 'placeholder.jpg';  // shown if image missing
  const MAX_CANDIDATES = 9;               // grid max
  const IMG_EXT = '.jpg';                 // flat folder, no subfolders
  const SWIPE_THRESHOLD = 40;             // px
  const LONGPRESS_MS = 520;               // soft-edit trigger

  // --- State ---
  const state = {
    anchorId: null,           // string form (may include ".1")
    historyStack: [],
    gridOpen: false,
    gridType: null,           // 'children' | 'siblings' | 'parents' | 'spouse'
    touchStart: null,
    longPressTimer: null,
  };

  // --- DOM ---
  const anchorImg = document.getElementById('anchorImg');
  const anchorWrap = document.getElementById('anchorWrap');
  const anchorName = document.getElementById('anchorName');
  const gridOverlay = document.getElementById('gridOverlay');
  const grid = document.getElementById('grid');
  const gridTitle = document.getElementById('gridTitle');
  const backBtn = document.getElementById('backBtn');

  // --- Utilities ---
  function idToSrc(id){ return `${id}${IMG_EXT}`; }

  function exists(src){
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src + cacheBust();
    });
  }

  function cacheBust(){ return `?v=${Date.now() % 1e7}`; }

  function getSavedMeta(id){
    const key = `swipetree.meta.${id}`;
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  function saveMeta(id, meta){
    const key = `swipetree.meta.${id}`;
    localStorage.setItem(key, JSON.stringify(meta || {}));
  }

  function displayNameFor(id){
    const meta = getSavedMeta(id);
    return (meta && meta.name) ? meta.name : '';
  }

  function setURLHash(id){
    try { history.replaceState(null, '', `#${encodeURIComponent(id)}`); } catch {}
  }

  function getIdParts(idStr){
    // returns { baseId: '140000', isSpouse: false, partnerHint: null }
    const parts = idStr.split('.');
    let base = parts[0];
    let isSpouse = false;
    let partnerHint = null;
    if(parts.length >= 2 && parts[1] === '1'){ isSpouse = true; }
    if(parts.length >= 3){ partnerHint = parts[2]; }
    return { baseId: base, isSpouse, partnerHint };
  }

  function countTrailingZeros(numStr){
    // '140000' -> 4
    let c = 0;
    for(let i=numStr.length-1;i>=0;i--){
      if(numStr[i] !== '0') break;
      c++;
    }
    return c;
  }

  function toInt(s){ return parseInt(s, 10); }
  function toStr(n, digits){
    let s = String(n);
    // preserve digit count (no shortening)
    while(s.length < digits) s = '0' + s;
    return s;
  }

  // --- Relationship math (dynamic, no hardcoding) ---
  function parentOf(idStr){
    const { baseId } = getIdParts(idStr);
    const digits = baseId.length;
    const tz = countTrailingZeros(baseId);
    if(tz <= 0) return null; // top-level
    // zero out the rightmost non-zero digit (at position digits - tz - 1)
    const n = toInt(baseId);
    const step = Math.pow(10, tz);
    const parent = n - (n % (step*10));
    return toStr(parent, digits);
  }

  function childrenOf(idStr){
    const { baseId } = getIdParts(idStr);
    const digits = baseId.length;
    const tz = countTrailingZeros(baseId);
    // children increment the next lower place (tz-1)
    const childStep = Math.pow(10, Math.max(0, tz-1));
    const parentFloor = toInt(baseId) - (toInt(baseId) % (childStep*10));
    // candidates 1..9 at childStep
    const out = [];
    for(let k=1;k<=MAX_CANDIDATES;k++){
      const kid = parentFloor + k*childStep;
      out.push(toStr(kid, digits));
    }
    return out;
  }

  function siblingsOf(idStr){
    const { baseId } = getIdParts(idStr);
    const digits = baseId.length;
    const tz = countTrailingZeros(baseId);
    const sibStep = Math.pow(10, tz);   // siblings differ at current "child digit" place
    const parentFloor = toInt(baseId) - (toInt(baseId) % (sibStep*10));
    const out = [];
    for(let k=1;k<=MAX_CANDIDATES;k++){
      const sib = parentFloor + k*sibStep;
      const s = toStr(sib, digits);
      if(s !== baseId) out.push(s);
    }
    return out;
  }

  function spousesOf(idStr){
    // Primary spouse target is "<base>.1"
    const { baseId } = getIdParts(idStr);
    return [`${baseId}.1`];
  }

  // --- Rendering ---
  async function setAnchor(idStr, pushHistory=true){
    if(state.gridOpen){ closeGrid(); }

    if(state.anchorId && pushHistory){
      state.historyStack.push(state.anchorId);
    }

    state.anchorId = idStr;
    setURLHash(idStr);

    const src = idToSrc(idStr);
    const ok = await exists(src);
    anchorImg.src = ok ? (src + cacheBust()) : (PLACEHOLDER + cacheBust());
    anchorImg.classList.remove('highlight');

    const label = displayNameFor(idStr);
    anchorName.textContent = label ? label : '';

    // slight flash on new anchor
    requestAnimationFrame(()=>{
      anchorImg.classList.add('highlight');
      setTimeout(()=>anchorImg.classList.remove('highlight'), 350);
    });
  }

  function openGrid(title, cards){
    gridTitle.textContent = title;
    grid.innerHTML = '';
    cards.forEach(c => {
      const tile = document.createElement('div');
      tile.className = 'tile noselect';
      tile.dataset.id = c.id;
      tile.innerHTML = `
        <img alt="${c.id}" src="${c.src}${cacheBust()}">
        <div class="label">${c.name || ''}</div>
      `;
      tile.addEventListener('click', async () => {
        // navigate on tap
        closeGrid();
        await setAnchor(c.id);
      });
      grid.appendChild(tile);
    });
    gridOverlay.classList.remove('hidden');
    state.gridOpen = true;
  }

  function closeGrid(){
    gridOverlay.classList.add('hidden');
    state.gridOpen = false;
    state.gridType = null;
  }

  // --- Swipe detection ---
  function onTouchStart(e){
    if(state.longPressTimer){ clearTimeout(state.longPressTimer); }
    const t = e.touches ? e.touches[0] : e;
    state.touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    // SoftEdit: long-press (hidden)
    state.longPressTimer = setTimeout(()=>{
      maybeEditAnchor();
    }, LONGPRESS_MS);
  }

  function onTouchMove(e){
    if(!state.touchStart) return;
    // if movement is significant, cancel long-press
    const t = e.touches ? e.touches[0] : e;
    if(Math.abs(t.clientX - state.touchStart.x) > 10 || Math.abs(t.clientY - state.touchStart.y) > 10){
      clearTimeout(state.longPressTimer);
    }
  }

  function onTouchEnd(e){
    if(state.longPressTimer){ clearTimeout(state.longPressTimer); }
    if(!state.touchStart) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const dx = t.clientX - state.touchStart.x;
    const dy = t.clientY - state.touchStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    state.touchStart = null;

    if(adx < SWIPE_THRESHOLD && ady < SWIPE_THRESHOLD) return;

    if(adx > ady){
      // horizontal
      if(dx > 0){
        // right -> spouse toggle
        handleSpouseSwipe();
      }else{
        // left -> siblings grid
        handleSiblingsSwipe();
      }
    }else{
      // vertical
      if(dy > 0){
        // down -> children
        handleChildrenSwipe();
      }else{
        // up -> parents
        handleParentsSwipe();
      }
    }
  }

  // --- Actions ---
  async function handleChildrenSwipe(){
    const kids = childrenOf(state.anchorId);
    const cards = await existingCards(kids);
    openGrid('Children', cards);
    state.gridType = 'children';
  }

  async function handleSiblingsSwipe(){
    const sibs = siblingsOf(state.anchorId);
    const cards = await existingCards(sibs);
    openGrid('Siblings', cards);
    state.gridType = 'siblings';
  }

  async function handleParentsSwipe(){
    // Show up to 2 parents: known-parent + placeholder if 2nd unknown
    const p = parentOf(state.anchorId);
    const cards = [];
    if(p){
      const src = idToSrc(p);
      const ok = await exists(src);
      cards.push({ id: p, src: ok ? src : PLACEHOLDER, name: displayNameFor(p) });
      // Second parent heuristic: try spouse of that parent if it exists
      const maybeSp = `${p}.1`;
      const ok2 = await exists(idToSrc(maybeSp));
      if(ok2){
        cards.push({ id: maybeSp, src: idToSrc(maybeSp), name: displayNameFor(maybeSp) });
      }else{
        // If no second parent image, use placeholder tile (non-clickable)
        cards.push({ id: 'Parent2', src: PLACEHOLDER, name: '' });
      }
      openGrid('Parents', cards);
      state.gridType = 'parents';
    }else{
      // no parents (top)
      openGrid('Parents', []);
      state.gridType = 'parents';
    }
  }

  async function handleSpouseSwipe(){
    // Toggle between base and "<base>.1" when possible
    const { baseId, isSpouse } = getIdParts(state.anchorId);
    let target = isSpouse ? baseId : `${baseId}.1`;
    // Only navigate if image exists; otherwise, do nothing
    const ok = await exists(idToSrc(target));
    if(ok){
      await setAnchor(target);
    }else if(!isSpouse){
      // try extended spouse form "<base>.1.<partnerId>" by scanning a small set of hints:
      // we'll attempt to locate a "<base>.1" anyway (already failed), so stay put.
      // No-op if not present.
    }
  }

  async function existingCards(candidates){
    // Filter by existing images; map to {id, src, name}
    const checks = await Promise.all(candidates.map(id => exists(idToSrc(id))));
    const out = [];
    for(let i=0;i<candidates.length;i++){
      if(checks[i]){
        const id = candidates[i];
        out.push({ id, src: idToSrc(id), name: displayNameFor(id) });
      }
    }
    return out;
  }

  // --- Back logic ---
  backBtn.addEventListener('click', async () => {
    if(state.gridOpen){
      closeGrid();
      return;
    }
    const prev = state.historyStack.pop();
    if(prev){
      await setAnchor(prev, /*pushHistory=*/false);
    }
  });

  // --- SoftEdit (hidden) ---
  function maybeEditAnchor(){
    // long-press on anchor image to open an unobtrusive edit (no hints)
    const id = state.anchorId;
    const meta = getSavedMeta(id) || {};
    const name = prompt("Edit first name (optional):", meta.name || "") ?? meta.name || "";
    const dob = prompt("Edit DOB (optional):", meta.dob || "") ?? meta.dob || "";
    saveMeta(id, { name, dob });
    anchorName.textContent = name || '';
  }

  // Attach gestures to anchor image only (not grids)
  ['touchstart','mousedown'].forEach(ev=>anchorWrap.addEventListener(ev, onTouchStart, {passive:true}));
  ['touchmove','mousemove'].forEach(ev=>anchorWrap.addEventListener(ev, onTouchMove, {passive:true}));
  ['touchend','mouseup','mouseleave'].forEach(ev=>anchorWrap.addEventListener(ev, onTouchEnd, {passive:true}));

  // Prevent native scrolling/zoom from interfering
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('gestureend', e => e.preventDefault());
  document.addEventListener('touchmove', e => {
    if(state.gridOpen === false) e.preventDefault();
  }, { passive:false });

  // --- Boot ---
  (async function boot(){
    // Resolve start ID from hash or prompt, default to 100000
    let start = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
    if(!start){
      const typed = prompt("Start ID:", "100000");
      start = (typed && typed.trim()) ? typed.trim() : "100000";
    }
    await setAnchor(start, /*pushHistory=*/false);
  })();
})();