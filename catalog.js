(() => {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';
  const CACHE_KEY = 'vferia_public_catalog_v1';
  const CACHE_TTL = 10 * 60 * 1000;
  const $ = (s) => document.querySelector(s);
  const search = $('#catalogSearch'), businessFilter = $('#businessFilter'), sortFilter = $('#sortFilter');
  const grid = $('#catalogGrid'), status = $('#catalogStatus'), empty = $('#catalogEmpty');
  let catalog = [], lastLoaded = 0;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = v => { try { const u = new URL(String(v || '')); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const money = v => Number(v || 0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
  function normalizePhone(v) { let n=String(v||'').replace(/\D/g,''); if(n.startsWith('00')) n=n.slice(2); if(n.startsWith('0')) n=n.slice(1); if(n.length===9 && n.startsWith('9')) n='56'+n; return n; }
  function contactHref(product) {
    const p=product.sellerPhone || '', email=product.sellerEmail || '';
    const phone=normalizePhone(p);
    if(phone.length>=8) return 'https://wa.me/'+phone+'?text='+encodeURIComponent('Hola, vi el producto "'+product.name+'" en VFeria y quisiera más información.');
    if(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'mailto:'+email+'?subject='+encodeURIComponent('Consulta por '+product.name+' en VFeria');
    return safeUrl(product.link) || safeUrl(product.social) || safeUrl(product.businessWeb) || '';
  }
  function flatten(data) {
    const result=[];
    (data.businesses || []).forEach(b => (b.products || []).forEach(p => result.push({...p,businessId:b.businessId,businessName:b.businessName||'Emprendimiento',businessCity:b.city||'',sellerPhone:b.phone||'',sellerEmail:b.email||'',businessWeb:b.businessWeb||'',businessLogo:b.logoUrl||''})));
    return result;
  }
  async function loadCatalog(force=false) {
    status.textContent='Cargando catálogo público…';
    if(!force) {
      try { const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null'); if(cached && Date.now()-cached.savedAt<CACHE_TTL && cached.data && Array.isArray(cached.data.businesses)) { catalog=flatten(cached.data); lastLoaded=cached.savedAt; populateBusinesses(cached.data.businesses); render(); status.textContent=`${catalog.length} productos · catálogo en caché`; return; } } catch {}
    }
    try {
      const response=await fetch(API_URL+'?action=publicCatalog', {method:'GET',cache:'no-store'});
      if(!response.ok) throw new Error('HTTP_'+response.status);
      const data=await response.json();
      if(!data || !data.ok || !Array.isArray(data.businesses)) throw new Error(data?.error||'CATALOG_RESPONSE_INVALID');
      catalog=flatten(data); lastLoaded=Date.now();
      try { localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:lastLoaded,data})); } catch(e) { console.warn('No se pudo guardar caché local',e); }
      populateBusinesses(data.businesses); render(); status.textContent=`${catalog.length} productos disponibles`;
    } catch(error) {
      console.error('VFeria catalog error',error);
      try { const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null'); if(cached?.data?.businesses) { catalog=flatten(cached.data); populateBusinesses(cached.data.businesses); render(); status.textContent='No se pudo actualizar. Mostrando la última copia guardada.'; return; } } catch {}
      status.textContent='No pudimos cargar el catálogo. Intenta actualizar en unos momentos.';
      grid.innerHTML='<div class="catalog-error">El catálogo no está disponible ahora. Si acabas de configurar VFeria, comprueba que la API incluya la acción <code>publicCatalog</code>.</div>';
    }
  }
  function populateBusinesses(businesses) {
    const old=businessFilter.value;
    const options=businesses.map(b=>`<option value="${esc(b.businessId)}">${esc(b.businessName||'Emprendimiento')}</option>`).join('');
    businessFilter.innerHTML='<option value="">Todos los emprendimientos</option>'+options;
    if([...businessFilter.options].some(o=>o.value===old)) businessFilter.value=old;
  }
  function render() {
    const q=search.value.trim().toLocaleLowerCase('es'); const business=businessFilter.value;
    let items=catalog.filter(p=>(!business||p.businessId===business) && (!q||[p.name,p.description,p.businessName,p.category,p.businessCity].join(' ').toLocaleLowerCase('es').includes(q)));
    switch(sortFilter.value) { case 'name': items.sort((a,b)=>a.name.localeCompare(b.name,'es')); break; case 'priceAsc': items.sort((a,b)=>Number(a.price||0)-Number(b.price||0)); break; case 'priceDesc': items.sort((a,b)=>Number(b.price||0)-Number(a.price||0)); break; }
    status.textContent=`${items.length} de ${catalog.length} productos`+(lastLoaded?' · actualizado '+new Date(lastLoaded).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):'');
    empty.hidden=items.length!==0; grid.innerHTML=items.map(p=>{
      const image=safeUrl(p.imageUrl), contact=contactHref(p), external=safeUrl(p.link)||safeUrl(p.social)||safeUrl(p.businessWeb);
      const price=Number(p.price)>0?money(p.price):'Consultar precio';
      return `<article class="catalog-product"><div class="catalog-image-wrap">${image?`<img class="catalog-image" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:'<div class="catalog-image-placeholder">VFeria</div>'}<span class="catalog-business-chip">${esc(p.businessName)}</span></div><div class="catalog-product-body"><div class="catalog-product-meta">${p.businessCity?`<span>${esc(p.businessCity)}</span>`:''}<span>Producto publicado</span></div><h2>${esc(p.name||'Producto')}</h2><strong class="catalog-price">${esc(price)}</strong><p class="catalog-description">${esc(p.description||'Consulta al vendedor para conocer más detalles de este producto.')}</p><div class="catalog-card-actions">${contact?`<a class="btn btn-primary" href="${esc(contact)}" target="_blank" rel="noopener">Contactar vendedor ↗</a>`:'<span class="catalog-no-contact">Contacto no informado</span>'}${external?`<a class="catalog-external" href="${esc(external)}" target="_blank" rel="noopener">Ver enlace externo</a>`:''}</div></div></article>`;
    }).join('');
  }
  [search,businessFilter,sortFilter].forEach(el=>el.addEventListener(el===search?'input':'change',render));
  function clear(){search.value='';businessFilter.value='';sortFilter.value='relevance';render();}
  $('#clearFilters').addEventListener('click',clear); $('#emptyClear').addEventListener('click',clear); $('#refreshCatalog').addEventListener('click',()=>loadCatalog(true));
  loadCatalog();
})();