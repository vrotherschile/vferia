(() => {
  'use strict';
  const API_URL='https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';
  const SESSION_KEY='vferia_analytics_session';
  function sessionId(){let id='';try{id=sessionStorage.getItem(SESSION_KEY)||'';if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id)){id=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)).replace(/-/g,'');sessionStorage.setItem(SESSION_KEY,id);}}catch(e){id='vf'+Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);}return id;}
  function send(eventType, businessId='', productId=''){
    const payload={action:'trackVisit',eventType,sessionId:sessionId(),businessId:String(businessId||''),productId:String(productId||'')};
    try{fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),mode:'cors',keepalive:true}).catch(()=>{});}catch(e){}
  }
  async function publicStats(){const r=await fetch(API_URL+'?action=getPublicAnalytics',{cache:'no-store'});if(!r.ok)throw new Error('HTTP_'+r.status);return r.json();}
  window.VFeriaAnalytics={trackPage:()=>send('page_view'),trackBusiness:id=>send('business_view',id),trackProduct:(businessId,productId)=>send('product_view',businessId,productId),getPublicStats:publicStats};
  const path=location.pathname.toLowerCase();
  if(path==='/'||path.endsWith('/index.html'))send('page_view');
})();
