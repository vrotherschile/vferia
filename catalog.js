(() => {
'use strict';
const API='https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';const CACHE='vferia_public_catalog_v3';const TTL=10*60*1000;const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);const safe=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'?u.href:''}catch{return ''}};const money=v=>Number(v||0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
function wa(p){let n=String(p.businessWhatsapp||p.businessPhone||p.phone||'').replace(/\D/g,'');if(n.length===9&&n[0]==='9')n='56'+n;const m=encodeURIComponent(`Hola, vi este ${p.type==='servicio'?'servicio':'producto'} en VFeria y quisiera más información.\n\n${p.name||'Oferta'}\nEmprendimiento: ${p.businessName||''}`);return n?`https://wa.me/${n}?text=${m}`:`https://wa.me/?text=${m}`}
function yt(u){try{const x=new URL(u);if(x.hostname.includes('youtu.be'))return 'https://www.youtube.com/embed/'+x.pathname.slice(1).split('/')[0];const id=x.searchParams.get('v');return id?'https://www.youtube.com/embed/'+id:''}catch{return ''}}
const params=new URLSearchParams(location.search),requested=params.get('tienda')||'';const search=$('#catalogSearch'),businessFilter=$('#businessFilter'),typeFilter=$('#typeFilter'),sortFilter=$('#sortFilter'),grid=$('#catalogGrid'),status=$('#catalogStatus'),empty=$('#catalogEmpty');let businesses=[],products=[],selected=requested;
async function load(force=false){
  status.textContent='Cargando catálogo…';
  try{
    let d=null;
    if(!force){
      try{
        const c=JSON.parse(localStorage.getItem(CACHE)||'null');
        if(c&&Date.now()-c.savedAt<TTL)d=c.data;
      }catch{}
    }
    if(!d)d=await (await fetch(API+'?action=publicCatalog',{cache:'no-store'})).json();
    if(!d.ok)throw Error(d.error||'CATALOG');
    try{localStorage.setItem(CACHE,JSON.stringify({savedAt:Date.now(),data:d}))}catch{}
    businesses=d.businesses||[];
    products=businesses.flatMap(b=>(b.products||[]).map(p=>({
      ...p,
      businessId:p.businessId||b.businessId,
      businessName:b.businessName||'Emprendimiento',
      businessCategory:b.category||'',
      businessCity:b.city||'',
      businessLogo:b.logoUrl||'',
      businessWhatsapp:b.phone||'',
      businessWeb:b.businessWeb||'',
      businessInstagram:b.businessInstagram||'',
      businessFacebook:b.businessFacebook||'',
      businessVideoUrl:b.businessVideoUrl||''
    })));
    populate();
    if(requested&&businesses.some(b=>String(b.businessId)===String(requested)))selected=requested;
    else if(requested)selected='';
    businessFilter.value=selected;
    renderStoreBanner();
    render();
    if(selected&&window.VFeriaAnalytics)window.VFeriaAnalytics.trackBusiness(selected);
  }catch(e){
    console.error(e);
    status.textContent='No se pudo cargar el catálogo.';
    grid.innerHTML='';
    empty.hidden=false;
  }
}
function populate(){businessFilter.innerHTML='<option value="">Todos los emprendimientos</option>';businesses.forEach(b=>{const o=document.createElement('option');o.value=b.businessId;o.textContent=b.businessName||'Emprendimiento';businessFilter.appendChild(o)})}
function renderStoreBanner(){const b=businesses.find(x=>String(x.businessId)===String(selected));const box=$('#storeFilterBanner');if(!b){box.hidden=true;return}box.hidden=false;$('#storeFilterTitle').textContent=b.businessName||'Emprendimiento';$('#storeFilterDescription').textContent=[b.category,b.city,b.businessDescription].filter(Boolean).join(' · ');const logo=$('#storeBusinessLogo');if(b.logoUrl){logo.src=b.logoUrl;logo.hidden=false}else logo.hidden=true;const video=$('#storeBusinessVideo');const emb=yt(b.businessVideoUrl);if(emb){video.hidden=false;video.innerHTML=`<iframe src="${esc(emb)}" title="Video de ${esc(b.businessName)}" loading="lazy" allowfullscreen></iframe>`}else{video.hidden=true;video.innerHTML=''};const links=[['storeWhatsapp',wa({businessWhatsapp:b.phone,businessName:b.businessName,type:'producto'}),true],['storeWeb',b.businessWeb,false],['storeInstagram',b.businessInstagram,false],['storeFacebook',b.businessFacebook,false]];links.forEach(([id,url,always])=>{const a=$('#'+id);if(url&&(!always||url)){a.href=url;a.hidden=false}else a.hidden=true});$('#storeProductCount').textContent=`${b.products.length} productos publicados`}
function render(){const q=(search.value||'').trim().toLowerCase();let f=products.filter(p=>{const biz=!selected||String(p.businessId)===String(selected);const type=!typeFilter.value||p.type===typeFilter.value;const text=[p.name,p.description,p.businessName,p.businessCategory,p.businessCity].join(' ').toLowerCase();return biz&&type&&text.includes(q)});const sort=sortFilter.value||'newest';if(sort==='newest')f.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));else if(sort==='name')f.sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));else if(sort==='priceAsc')f.sort((a,b)=>Number(a.price||0)-Number(b.price||0));else if(sort==='priceDesc')f.sort((a,b)=>Number(b.price||0)-Number(a.price||0));status.textContent=`${f.length} resultado${f.length===1?'':'s'}`;empty.hidden=f.length>0;grid.innerHTML=f.map(p=>{const image=safe(p.imageUrl),pay=safe(p.paymentLink),link=safe(p.link),social=safe(p.social);return `<article class="catalog-product" data-product-id="${esc(p.productId)}"><div class="catalog-product-image-wrap">${image?`<img class="catalog-product-image" src="${esc(image)}" alt="${esc(p.name)}" loading="lazy">`:'<div class="catalog-product-placeholder">Imagen no disponible</div>'}</div><div class="catalog-product-body"><div class="catalog-business-chip">${p.businessLogo?`<img src="${esc(p.businessLogo)}" alt="" class="catalog-business-logo">`:''}<span>${esc(p.businessName)}</span></div><h2>${esc(p.name||'Sin nombre')}</h2><span class="catalog-type-badge">${p.type==='servicio'?'SERVICIO':'PRODUCTO'}</span><strong class="catalog-price">${money(p.price)}</strong><p>${esc(p.description||'Consulta los detalles de esta oferta.')}</p><div class="catalog-stock">${Number(p.stock||0)>0?`Disponible: <b>${Number(p.stock).toLocaleString('es-CL')}</b>`:'<b>Agotado</b>'}</div><div class="catalog-product-actions">${pay?`<a class="btn btn-primary" href="${esc(pay)}" target="_blank" rel="noopener nofollow">Pagar en línea ↗</a>`:''}<a class="btn whatsapp-button" href="${esc(wa(p))}" target="_blank" rel="noopener">WhatsApp ↗</a>${social?`<a class="btn social-button" href="${esc(social)}" target="_blank" rel="noopener">Red social ↗</a>`:''}${link?`<a class="btn btn-outline" href="${esc(link)}" target="_blank" rel="noopener">Ver enlace ↗</a>`:''}</div></div></article>`}).join('');f.forEach(p=>{const card=document.querySelector(`[data-product-id="${CSS.escape(String(p.productId))}"]`);if(card&&window.VFeriaAnalytics){card.addEventListener('click',()=>window.VFeriaAnalytics.trackProduct(p.businessId,p.productId),{once:true})}})}
function clear(){search.value='';typeFilter.value='';sortFilter.value='newest';selected=requested||'';businessFilter.value=selected;renderStoreBanner();render()}
businessFilter.onchange=()=>{selected=businessFilter.value;renderStoreBanner();render();if(selected&&window.VFeriaAnalytics)window.VFeriaAnalytics.trackBusiness(selected)};typeFilter.onchange=render;sortFilter.onchange=render;search.oninput=render;$('#clearFilters').onclick=clear;$('#emptyClear').onclick=clear;$('#refreshCatalog').onclick=()=>load(true);load();
})();
