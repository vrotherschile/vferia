(() => {
  'use strict';

  const API='https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';
  const TK='vferia_api_token', UK='vferia_api_user';

  const $=s=>document.querySelector(s);

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[c]);

  async function api(action,payload={}){
    const r=await fetch(API,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,...payload}),
      redirect:'follow'
    });

    if(!r.ok) throw Error('HTTP_'+r.status);
    return r.json();
  }

  const token=()=>sessionStorage.getItem(TK)||'';

  function logout(){
    sessionStorage.removeItem(TK);
    sessionStorage.removeItem(UK);
    location.replace('login.html');
  }

  if(!token()){
    location.replace('login.html');
    return;
  }

  let user={};

  try{
    user=JSON.parse(sessionStorage.getItem(UK)||'{}');
  }catch{}

  if(String(user.role).toLowerCase()==='admin'){
    $('#adminUsersLink').hidden=false;
  }

  $('#logoutBtn').onclick=async()=>{
    try{
      await api('logout',{token:token()});
    }catch{}
    logout();
  };

  const fields=[
    'fullName',
    'email',
    'phone',
    'city',
    'businessName',
    'category',
    'businessDescription',
    'businessWeb',
    'businessInstagram',
    'businessFacebook',
    'businessVideoUrl'
  ];

  const products=[];
  let current=0;

  let logoKey='';
  let logoUrl='';
  let couponImageKey='';
  let couponImageUrl='';

  function setStatus(m){
    $('#saveStatus').textContent=m;
  }

  function youtubeEmbed(url){
    try{
      const u=new URL(url);

      if(u.hostname.includes('youtu.be')){
        return 'https://www.youtube.com/embed/'+u.pathname.slice(1).split('/')[0];
      }

      const id=u.searchParams.get('v');

      return id
        ? 'https://www.youtube.com/embed/'+id
        : '';
    }catch{
      return '';
    }
  }

  function dataUrl(file,maxW,maxH){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();

      r.onload=()=>{
        const im=new Image();

        im.onload=()=>{
          const scale=Math.min(
            maxW/im.width,
            maxH/im.height,
            1
          );

          const c=document.createElement('canvas');

          c.width=Math.max(
            1,
            Math.round(im.width*scale)
          );

          c.height=Math.max(
            1,
            Math.round(im.height*scale)
          );

          const x=c.getContext('2d');

          x.drawImage(
            im,
            0,
            0,
            c.width,
            c.height
          );

          resolve(
            c.toDataURL(
              'image/jpeg',
              .88
            )
          );
        };

        im.onerror=reject;
        im.src=r.result;
      };

      r.onerror=reject;
      r.readAsDataURL(file);
    });
  }

  async function upload(file,kind){
    const data=await dataUrl(
      file,
      kind==='logo'
        ? 1080
        : kind==='coupon'
          ? 1400
          : 1000,

      kind==='logo'
        ? 540
        : kind==='coupon'
          ? 1000
          : 1000
    );

    const r=await api(
      'uploadImage',
      {
        token:token(),
        kind,
        base64:data
      }
    );

    if(!r.ok){
      throw Error(
        r.message ||
        r.error ||
        'UPLOAD_FAILED'
      );
    }

    return r;
  }

  function renderProduct(){

    const wrap=$('#productsList');

    wrap.innerHTML='';

    if(!products.length){
      $('#productPosition').textContent='Sin productos';
      $('#productCounter').textContent='0 / 30';
      return;
    }

    const p=products[current];

    $('#productPosition').textContent=
      `Producto ${current+1} de ${products.length}`;

    $('#productCounter').textContent=
      `${products.length} / 30`;

    wrap.innerHTML=`
      <article class="product-editor active">

        <div class="product-editor-head">

          <div class="product-thumb">
            ${
              p.imageUrl
                ? `<img src="${esc(p.imageUrl)}" alt="">`
                : '▧'
            }
          </div>

          <div>
            <b class="product-title">
              ${esc(p.name||'Nuevo producto')}
            </b>

            <small>
              ${p.published?'Publicado':'No publicado'}
              ·
              ${p.type==='servicio'?'Servicio':'Producto'}
            </small>
          </div>

          <button
            type="button"
            class="remove-product"
            id="deleteCurrent"
          >
            ×
          </button>

        </div>

        <div class="form-grid">

          <div>
            <label>Nombre</label>
            <input
              id="pName"
              value="${esc(p.name||'')}"
            >
          </div>

          <div>
            <label>Tipo</label>

            <select id="pType">
              <option
                value="producto"
                ${p.type!=='servicio'?'selected':''}
              >
                Producto
              </option>

              <option
                value="servicio"
                ${p.type==='servicio'?'selected':''}
              >
                Servicio
              </option>
            </select>
          </div>

          <div>
            <label>Precio (CLP)</label>

            <input
              id="pPrice"
              type="number"
              min="0"
              value="${esc(p.price??0)}"
            >
          </div>

          <div>
            <label>Costo (CLP) · PPV</label>

            <input
              id="pCost"
              type="number"
              min="0"
              value="${esc(p.cost??0)}"
            >
          </div>

          <div>
            <label>Stock / disponibilidad</label>

            <input
              id="pStock"
              type="number"
              min="0"
              value="${esc(p.stock??0)}"
            >
          </div>

          <div>

            <label>SKU · PPV</label>

            <div class="camera-field">

              <input
                id="pSku"
                maxlength="80"
                value="${esc(p.sku||'')}"
                placeholder="Ej.: POL-NEG-M"
              >

              <button
                type="button"
                class="camera-field-btn"
                id="scanSkuBtn"
                title="Escanear SKU con cámara"
                aria-label="Escanear SKU con cámara"
              >
                📷
              </button>

            </div>

          </div>

          <div>

            <label>Código de barras · PPV</label>

            <div class="camera-field">

              <input
                id="pBarcode"
                maxlength="80"
                value="${esc(p.barcode||'')}"
                placeholder="EAN / UPC / Code 128"
              >

              <button
                type="button"
                class="camera-field-btn"
                id="scanBarcodeBtn"
                title="Escanear código de barras con cámara"
                aria-label="Escanear código de barras con cámara"
              >
                📷
              </button>

            </div>

          </div>

          <div>

            <label>Categoría · PPV</label>

            <input
              id="pCategory"
              maxlength="100"
              value="${esc(p.category||'')}"
              placeholder="Ropa, alimentos, etc."
            >

          </div>

          <div class="span-2">

            <label>Imagen</label>

            <input
              id="pFile"
              type="file"
              accept="image/*"
            >

            <div class="preview-box">

              ${
                p.imageUrl
                  ? `<img id="pPreview" src="${esc(p.imageUrl)}" alt="">`
                  : '<span id="pPreviewNote" class="panel-section-note">Sin imagen</span>'
              }

            </div>

          </div>

          <div>

            <label>Enlace de información / venta</label>

            <input
              id="pLink"
              type="url"
              value="${esc(p.link||'')}"
              placeholder="https://..."
            >

          </div>

          <div>

            <label>Red social del producto</label>

            <input
              id="pSocial"
              type="url"
              value="${esc(p.social||'')}"
              placeholder="https://..."
            >

          </div>

          <div class="span-2">

            <label>Mercado Pago</label>

            <input
              id="pPayment"
              type="url"
              value="${esc(p.paymentLink||'')}"
              placeholder="https://link.mercadopago.com/..."
            >

          </div>

          <div class="span-2">

            <label>Descripción</label>

            <textarea
              id="pDescription"
              rows="4"
            >${esc(p.description||'')}</textarea>

          </div>

          <div class="span-2">

            <label class="feature-switch">

              <input
                id="pFeatured"
                type="checkbox"
                ${p.featured?'checked':''}
              >

              <span>
                ⭐ Definir como producto estrella
              </span>

            </label>

          </div>

        </div>

        <div class="save-row">

          <span class="panel-section-note">
            ${
              p.productId
                ? 'ID: '+esc(p.productId)
                : 'Producto nuevo'
            }
          </span>

          <button
            type="button"
            class="btn btn-primary"
            id="saveCurrent"
          >
            Guardar este producto ✓
          </button>

        </div>

      </article>
    `;

    $('#prevProduct').disabled=current<=0;
    $('#nextProduct').disabled=
      current>=products.length-1;

    $('#deleteCurrent').onclick=async()=>{

      if(!p.productId){
        products.splice(current,1);

        current=Math.max(
          0,
          current-1
        );

        renderProduct();

        return;
      }

      if(!confirm('¿Eliminar este producto?')){
        return;
      }

      setStatus('Eliminando producto…');

      const r=await api(
        'deleteProduct',
        {
          token:token(),
          productId:p.productId
        }
      );

      if(!r.ok){
        throw Error(
          r.error ||
          'DELETE_FAILED'
        );
      }

      products.splice(current,1);

      current=Math.min(
        current,
        Math.max(
          0,
          products.length-1
        )
      );

      renderProduct();

      setStatus('Producto eliminado.');
    };

    $('#pFile').onchange=async e=>{

      if(!e.target.files[0]){
        return;
      }

      try{

        setStatus('Subiendo imagen…');

        const r=await upload(
          e.target.files[0],
          'product'
        );

        p.imageKey=r.key;
        p.imageUrl=r.url;

        renderProduct();

        setStatus(
          'Imagen cargada. Guarda el producto.'
        );

      }catch(err){

        setStatus(
          'No se pudo subir la imagen: '+
          err.message
        );

      }

    };

    $('#saveCurrent').onclick=()=>saveCurrent();

    $('#scanSkuBtn').onclick=()=>{
      openCameraScanner(
        'sku',
        $('#pSku')
      );
    };

    $('#scanBarcodeBtn').onclick=()=>{
      openCameraScanner(
        'barcode',
        $('#pBarcode')
      );
    };

  }

  let cameraStream=null;
  let barcodeReader=null;
  let cameraModal=null;

  function ensureCameraModal(){

    if(cameraModal){
      return cameraModal;
    }

    const el=document.createElement('div');

    el.className='camera-modal';

    el.innerHTML=`

      <div class="camera-dialog">

        <div class="camera-head">

          <div>

            <b id="cameraTitle">
              Escanear
            </b>

            <small id="cameraHint">
              Apunta la cámara al dato.
            </small>

          </div>

          <button
            type="button"
            class="camera-close"
            id="cameraClose"
            aria-label="Cerrar cámara"
          >
            ×
          </button>

        </div>

        <div class="camera-stage">

          <video
            id="cameraVideo"
            autoplay
            muted
            playsinline
          ></video>

          <div class="camera-frame"></div>

        </div>

        <div
          id="cameraStatus"
          class="camera-status"
        >
          Iniciando cámara…
        </div>

        <div class="camera-actions">

          <button
            type="button"
            class="btn btn-outline"
            id="cameraCapture"
          >
            Tomar foto
          </button>

          <button
            type="button"
            class="btn btn-primary"
            id="cameraStop"
          >
            Cerrar
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(el);

    cameraModal=el;

    $('#cameraClose').onclick=
      closeCameraScanner;

    $('#cameraStop').onclick=
      closeCameraScanner;

    $('#cameraCapture').onclick=
      captureSkuPhoto;

    return el;
  }

  function setCameraStatus(m){

    const el=$('#cameraStatus');

    if(el){
      el.textContent=m;
    }

  }

  function closeCameraScanner(){

    if(barcodeReader){

      try{
        barcodeReader.stop?.();
      }catch{}

      try{
        barcodeReader.clear?.();
      }catch{}

      barcodeReader=null;

    }

    if(cameraStream){

      cameraStream
        .getTracks()
        .forEach(t=>t.stop());

      cameraStream=null;

    }

    const hiddenReader=
      document.getElementById(
        'barcodeReaderHidden'
      );

    if(hiddenReader){
      hiddenReader.remove();
    }

    const video=
      document.getElementById(
        'cameraVideo'
      );

    if(video){

      video.hidden=false;
      video.srcObject=null;

    }

    if(cameraModal){
      cameraModal.hidden=true;
    }

  }

  function loadScript(src,test){

    return new Promise(
      (resolve,reject)=>{

        if(test&&test()){
          return resolve();
        }

        const s=
          document.createElement('script');

        s.src=src;

        s.onload=()=>resolve();

        s.onerror=()=>reject(
          Error(
            'No se pudo cargar el lector de cámara.'
          )
        );

        document.head.appendChild(s);

      }
    );

  }

  async function openCameraScanner(
    mode,
    input
  ){

    const modal=
      ensureCameraModal();

    modal.hidden=false;

    $('#cameraTitle').textContent=
      mode==='barcode'
        ? 'Escanear código de barras'
        : 'Escanear SKU';

    $('#cameraHint').textContent=
      mode==='barcode'
        ? 'Enfoca el código de barras dentro del recuadro.'
        : 'Enfoca el texto del SKU y luego pulsa “Tomar foto”.';

    $('#cameraCapture').hidden=
      mode==='barcode';

    setCameraStatus(
      'Solicitando acceso a la cámara…'
    );

    try{

      const video=$('#cameraVideo');

      cameraStream=
        await navigator.mediaDevices.getUserMedia({
          video:{
            facingMode:{
              ideal:'environment'
            },
            width:{
              ideal:1280
            },
            height:{
              ideal:720
            }
          },
          audio:false
        });

      video.srcObject=cameraStream;

      await video.play();

      if(mode==='barcode'){

        if('BarcodeDetector' in window){

          const formats=
            await BarcodeDetector.getSupportedFormats();

          const wanted=[
            'ean_13',
            'ean_8',
            'upc_a',
            'upc_e',
            'code_128',
            'code_39',
            'code_93',
            'codabar',
            'itf',
            'qr_code'
          ];

          const supported=
            wanted.filter(
              x=>formats.includes(x)
            );

          if(!supported.length){

            cameraStream
              .getTracks()
              .forEach(t=>t.stop());

            cameraStream=null;

            video.srcObject=null;
            video.hidden=true;

            await loadScript(
              'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
              ()=>!!window.Html5Qrcode
            );

            const readerEl=
              document.createElement('div');

            readerEl.id=
              'barcodeReaderHidden';

            readerEl.style.position='absolute';
            readerEl.style.inset='0';
            readerEl.style.width='100%';
            readerEl.style.height='100%';
            readerEl.style.opacity='1';
            readerEl.style.pointerEvents='none';

            modal
              .querySelector('.camera-stage')
              .appendChild(readerEl);

            const reader=
              new Html5Qrcode(
                'barcodeReaderHidden'
              );

            barcodeReader=reader;

            setCameraStatus(
              'Buscando código de barras…'
            );

            await reader.start(
              {facingMode:'environment'},
              {
                fps:10,
                qrbox:{
                  width:260,
                  height:120
                }
              },

              decoded=>{

                input.value=decoded;

                input.dispatchEvent(
                  new Event(
                    'input',
                    {
                      bubbles:true
                    }
                  )
                );

                setCameraStatus(
                  'Código detectado: '+
                  decoded
                );

                setTimeout(
                  closeCameraScanner,
                  500
                );

              },

              ()=>{}
            );

            return;
          }

          const detector=
            new BarcodeDetector({
              formats:supported
            });

          setCameraStatus(
            'Buscando código de barras…'
          );

          const scan=async()=>{

            if(
              !cameraStream ||
              modal.hidden
            ){
              return;
            }

            try{

              const codes=
                await detector.detect(video);

              if(
                codes.length &&
                codes[0].rawValue
              ){

                input.value=
                  codes[0].rawValue;

                input.dispatchEvent(
                  new Event(
                    'input',
                    {
                      bubbles:true
                    }
                  )
                );

                setCameraStatus(
                  'Código detectado: '+
                  codes[0].rawValue
                );

                setTimeout(
                  closeCameraScanner,
                  500
                );

                return;
              }

            }catch{}

            requestAnimationFrame(scan);

          };

          scan();

        }else{

          cameraStream
            .getTracks()
            .forEach(t=>t.stop());

          cameraStream=null;

          video.srcObject=null;
          video.hidden=true;

          await loadScript(
            'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
            ()=>!!window.Html5Qrcode
          );

          const readerEl=
            document.createElement('div');

          readerEl.id=
            'barcodeReaderHidden';

          readerEl.style.position='absolute';
          readerEl.style.inset='0';
          readerEl.style.width='100%';
          readerEl.style.height='100%';
          readerEl.style.opacity='1';
          readerEl.style.pointerEvents='none';

          modal
            .querySelector('.camera-stage')
            .appendChild(readerEl);

          const reader=
            new Html5Qrcode(
              'barcodeReaderHidden'
            );

          barcodeReader=reader;

          setCameraStatus(
            'Buscando código de barras…'
          );

          await reader.start(
            {facingMode:'environment'},
            {
              fps:10,
              qrbox:{
                width:260,
                height:120
              }
            },

            decoded=>{

              input.value=decoded;

              input.dispatchEvent(
                new Event(
                  'input',
                  {
                    bubbles:true
                  }
                )
              );

              setCameraStatus(
                'Código detectado: '+
                decoded
              );

              setTimeout(
                closeCameraScanner,
                500
              );

            },

            ()=>{}
          );

        }

      }else{

        setCameraStatus(
          'Cámara lista. Enfoca el SKU y pulsa “Tomar foto”.'
        );

      }

    }catch(e){

      setCameraStatus(
        'No se pudo abrir la cámara. Revisa los permisos del navegador.'
      );

    }

  }

  async function captureSkuPhoto(){

    const video=$('#cameraVideo');
    const input=$('#pSku');

    if(!video?.videoWidth){
      return;
    }

    setCameraStatus(
      'Procesando texto del SKU…'
    );

    try{

      await loadScript(
        'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
        ()=>!!window.Tesseract
      );

      const c=
        document.createElement('canvas');

      c.width=video.videoWidth;
      c.height=video.videoHeight;

      const x=
        c.getContext('2d');

      x.drawImage(
        video,
        0,
        0,
        c.width,
        c.height
      );

      const result=
        await Tesseract.recognize(
          c.toDataURL(
            'image/jpeg',
            .92
          ),
          'eng',
          {
            logger:m=>{

              if(
                m.status==='recognizing text' &&
                m.progress
              ){

                setCameraStatus(
                  'Reconociendo SKU… '+
                  Math.round(
                    m.progress*100
                  )+
                  '%'
                );

              }

            }
          }
        );

      const text=
        result.data.text
          .replace(/\s+/g,' ')
          .trim();

      if(!text){

        setCameraStatus(
          'No se detectó texto. Intenta acercar la cámara.'
        );

        return;
      }

      input.value=text;

      input.dispatchEvent(
        new Event(
          'input',
          {
            bubbles:true
          }
        )
      );

      setCameraStatus(
        'SKU detectado: '+text
      );

      setTimeout(
        closeCameraScanner,
        700
      );

    }catch(e){

      setCameraStatus(
        'No se pudo reconocer el SKU automáticamente. Puedes escribirlo manualmente.'
      );

    }

  }

  async function saveCurrent(){

    if(!products.length){
      return;
    }

    const p=products[current];

    const updated={
      ...p,

      name:$('#pName').value.trim(),

      type:$('#pType').value,

      price:Number(
        $('#pPrice').value||0
      ),

      cost:Number(
        $('#pCost').value||0
      ),

      stock:Number(
        $('#pStock').value||0
      ),

      sku:$('#pSku').value.trim(),

      barcode:$('#pBarcode').value.trim(),

      category:$('#pCategory').value.trim(),

      ppvActive:
        p.ppvActive===undefined
          ? true
          : !!p.ppvActive,

      trackStock:
        p.trackStock===undefined
          ? true
          : !!p.trackStock,

      link:$('#pLink').value.trim(),

      social:$('#pSocial').value.trim(),

      paymentLink:
        $('#pPayment').value.trim(),

      description:
        $('#pDescription').value.trim(),

      featured:
        $('#pFeatured').checked
    };

    setStatus(
      'Guardando producto…'
    );

    const r=await api(
      'saveProduct',
      {
        token:token(),
        product:updated
      }
    );

    if(!r.ok){

      throw Error(
        r.message ||
        r.error ||
        'SAVE_PRODUCT_FAILED'
      );

    }

    products[current]=r.product;

    renderProduct();

    setStatus(
      'Producto guardado correctamente.'
    );

  }

  $('#prevProduct').onclick=()=>{

    if(current>0){

      current--;

      renderProduct();

    }

  };

  $('#nextProduct').onclick=()=>{

    if(
      current<products.length-1
    ){

      current++;

      renderProduct();

    }

  };

  $('#addProductBtn').onclick=()=>{

    if(products.length>=30){

      setStatus(
        'Has alcanzado el máximo de 30 productos.'
      );

      return;

    }

    products.push({
      name:'',
      price:0,
      stock:0,
      type:'producto',
      published:true,
      featured:false
    });

    current=
      products.length-1;

    renderProduct();

    setStatus(
      'Nuevo producto preparado.'
    );

  };

  $('#shareCatalogBtn').onclick=async()=>{

    const u=
      new URL(
        'productos.html',
        location.href
      );

    u.searchParams.set(
      'tienda',
      user.businessId||''
    );

    try{

      await navigator.clipboard.writeText(
        u.href
      );

      setStatus(
        'Enlace del catálogo copiado.'
      );

    }catch{

      prompt(
        'Copia este enlace:',
        u.href
      );

    }

  };

  async function saveProfile(){

    const profile={};

    fields.forEach(k=>{
      profile[k]=$('#'+k)?.value||'';
    });

    profile.logoKey=logoKey;
    profile.logoUrl=logoUrl;

    profile.couponImageKey=
      couponImageKey;

    profile.couponImageUrl=
      couponImageUrl;

    profile.couponEnabled=
      $('#couponEnabled').checked;

    const r=await api(
      'saveProfile',
      {
        token:token(),
        profile
      }
    );

    if(!r.ok){

      throw Error(
        r.message ||
        r.error ||
        'PROFILE_SAVE_FAILED'
      );

    }

  }

  $('#logoFile').onchange=async e=>{

    if(!e.target.files[0]){
      return;
    }

    try{

      setStatus(
        'Subiendo logo…'
      );

      const r=
        await upload(
          e.target.files[0],
          'logo'
        );

      logoKey=r.key;
      logoUrl=r.url;

      $('#logoPreview').src=
        logoUrl;

      $('#logoPreview').hidden=
        false;

      setStatus(
        'Logo cargado. Guarda los cambios.'
      );

    }catch(err){

      setStatus(
        'No se pudo subir el logo: '+
        err.message
      );

    }

  };

  $('#couponFile').onchange=async e=>{

    if(!e.target.files[0]){
      return;
    }

    try{

      setStatus(
        'Subiendo cupón…'
      );

      const r=
        await upload(
          e.target.files[0],
          'coupon'
        );

      couponImageKey=r.key;
      couponImageUrl=r.url;

      $('#couponPreview').src=
        couponImageUrl;

      $('#couponPreview').hidden=
        false;

      setStatus(
        'Cupón cargado. Actívalo y guarda los cambios.'
      );

    }catch(err){

      setStatus(
        'No se pudo subir el cupón: '+
        err.message
      );

    }

  };

  async function saveAll(){

    try{

      await saveProfile();

      if(
        products.length &&
        products[current]
      ){
        await saveCurrent();
      }

      setStatus(
        'Cambios guardados correctamente.'
      );

    }catch(e){

      console.error(e);

      if(
        String(e.message)
          .includes('SESSION_EXPIRED')
      ){

        logout();

      }else{

        setStatus(
          'No se pudo guardar: '+
          e.message
        );

      }

    }

  }

  $('#saveAllBtn').onclick=
    saveAll;

  $('#saveAllBtnBottom').onclick=
    saveAll;

  $('#changePasswordBtn').onclick=
    async()=>{

      const p=
        $('#newPassword').value;

      if(p.length<14){

        $('#securityStatus').textContent=
          'La contraseña debe tener al menos 14 caracteres.';

        return;

      }

      try{

        const r=
          await api(
            'changePassword',
            {
              token:token(),
              password:p
            }
          );

        if(!r.ok){

          throw Error(
            r.message ||
            r.error
          );

        }

        $('#newPassword').value='';

        $('#securityStatus').textContent=
          'Contraseña actualizada correctamente.';

      }catch(e){

        $('#securityStatus').textContent=
          'No se pudo cambiar la contraseña: '+
          e.message;

      }

    };

  async function load(){

    try{

      const me=
        await api(
          'me',
          {
            token:token()
          }
        );

      if(!me.ok){
        throw Error(
          'SESSION_EXPIRED'
        );
      }

      user=me.user;

      sessionStorage.setItem(
        UK,
        JSON.stringify(user)
      );

      const p=
        await api(
          'getProfile',
          {
            token:token()
          }
        );

      if(!p.ok){
        throw Error(p.error);
      }

      const x=p.profile||{};

      fields.forEach(k=>{

        if($('#'+k)){
          $('#'+k).value=
            x[k]||'';
        }

      });

      logoKey=
        x.logoKey||'';

      logoUrl=
        x.logoUrl||'';

      couponImageKey=
        x.couponImageKey||'';

      couponImageUrl=
        x.couponImageUrl||'';

      if(logoUrl){

        $('#logoPreview').src=
          logoUrl;

        $('#logoPreview').hidden=
          false;

      }

      if(couponImageUrl){

        $('#couponPreview').src=
          couponImageUrl;

        $('#couponPreview').hidden=
          false;

      }

      $('#couponEnabled').checked=
        !!x.couponEnabled;

      const pr=
        await api(
          'listProducts',
          {
            token:token()
          }
        );

      if(!pr.ok){
        throw Error(pr.error);
      }

      products.push(
        ...(pr.products||[])
          .slice(0,30)
      );

      if(!products.length){

        products.push({
          name:'',
          price:0,
          stock:0,
          type:'producto',
          featured:false,
          published:true
        });

      }

      renderProduct();

      setStatus(
        'Información cargada desde VFeria.'
      );

      $('#panelAlert').innerHTML=
        '<span>✓</span><p><b>Conectado a VFeria:</b> tus cambios se guardan en el servidor.</p>';

    }catch(e){

      console.error(e);

      if(
        String(e.message)
          .includes('SESSION_EXPIRED')
      ){

        logout();

      }else{

        setStatus(
          'No se pudieron cargar los datos: '+
          e.message
        );

      }

    }

  }

  load();

})();