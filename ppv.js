(()=>{'use strict';

    const API='https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec',
    TK='vferia_api_token',
    token=()=>sessionStorage.getItem(TK)||'',
    $=s=>document.querySelector(s),
    esc=v=>String(v??'').replace(/[&<>"\']/g,c=>({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    })[c]),
    money=n=>'$'+Number(n||0).toLocaleString('es-CL'),
    
    api=async(action,p={})=>{
      const r=await fetch(API,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action,...p})
      });
    
      if(!r.ok)throw Error('HTTP_'+r.status);
      return r.json();
    };
    
    if(!token()){
      location.replace('login.html');
      return;
    }
    
    let products=[],
        cart=[],
        settings={
          ivaEnabled:false,
          ivaRate:19,
          pricesIncludeIva:true
        },
        lastSale=null;
    
    
    /* =========================================================
       CARGA PRINCIPAL
    ========================================================= */
    
    async function load(){
      try{
        const [i,k,s]=await Promise.all([
          api('listPPVInventory',{token:token()}),
          api('getPPVDashboard',{token:token()}),
          api('getPPVSettings',{token:token()})
        ]);
    
        if(!i.ok)throw Error(i.error);
    
        products=i.products||[];
        settings=s.settings||settings;
    
        $('#ivaEnabled').checked=!!settings.ivaEnabled;
        $('#ivaRate').value=settings.ivaRate??19;
        $('#pricesIncludeIva').checked=settings.pricesIncludeIva!==false;
    
        renderProducts();
        renderKpi(k.kpi||{});
        renderInventory();
    
        await loadSales();
    
      }catch(e){
    
        if(e.message==='SESSION_EXPIRED'){
          location.replace('login.html');
        }else{
          $('#saleStatus').textContent='No se pudo cargar PPV: '+e.message;
        }
      }
    }
    
    
    /* =========================================================
       KPI
    ========================================================= */
    
    function renderKpi(k){
      $('#kToday').textContent=money(k.todaySales);
      $('#kMonth').textContent=money(k.monthSales);
      $('#kTicket').textContent=money(k.averageTicket);
      $('#kOut').textContent=k.outOfStock||0;
    }
    
    
    /* =========================================================
       PRODUCTOS
    ========================================================= */
    
    function renderProducts(){
    
      const q=$('#barcode').value.trim().toLowerCase();
    
      const list=products
        .filter(p=>
          p.ppvActive!==false &&
          (
            !q ||
            [p.name,p.sku,p.barcode,p.category]
              .join(' ')
              .toLowerCase()
              .includes(q)
          )
        )
        .slice(0,30);
    
      $('#productList').innerHTML=list.map(p=>`
        <div class="ppv-item">
          <img src="${esc(p.imageUrl||'assets/VFeria-logo.png')}" alt="">
          <div>
            <b>${esc(p.name)}</b>
            <div class="muted2">
              ${esc(p.sku||p.barcode||'Sin código')}
              · ${money(p.price)}
              · Stock ${p.trackStock===false?'∞':p.stock}
            </div>
          </div>
    
          <button
            class="btn btn-outline btn-small"
            data-add="${esc(p.productId)}">
            Añadir
          </button>
        </div>
      `).join('')||'<div class="muted2">No hay productos para esta búsqueda.</div>';
    
      document.querySelectorAll('[data-add]')
        .forEach(b=>{
          b.onclick=()=>addToCart(b.dataset.add);
        });
    }
    
    
    /* =========================================================
       CARRITO
    ========================================================= */
    
    function addToCart(id){
    
      const p=products.find(
        x=>String(x.productId)===String(id)
      );
    
      if(!p)return;
    
      const x=cart.find(
        x=>String(x.productId)===String(id)
      );
    
      if(x){
        x.quantity++;
      }else{
        cart.push({
          productId:p.productId,
          quantity:1
        });
      }
    
      renderCart();
    }
    
    
    function renderCart(){
    
      const box=$('#cart');
    
      box.innerHTML=cart.map(x=>{
    
        const p=products.find(
          p=>String(p.productId)===String(x.productId)
        );
    
        return p?`
          <div class="cart-row">
    
            <div>
              <b>${esc(p.name)}</b>
    
              <div class="muted2">
                ${money(p.price)} c/u
              </div>
            </div>
    
            <input
              type="number"
              min="1"
              value="${x.quantity}"
              data-qty="${p.productId}">
    
            <strong>
              ${money(p.price*x.quantity)}
            </strong>
    
            <button
              class="btn btn-outline btn-small"
              data-del="${p.productId}">
              ×
            </button>
    
          </div>
        `:'';
    
      }).join('')||'<div class="muted2">Carrito vacío.</div>';
    
      document.querySelectorAll('[data-qty]')
        .forEach(i=>{
    
          i.onchange=()=>{
    
            const x=cart.find(
              x=>String(x.productId)===String(i.dataset.qty)
            );
    
            if(x){
              x.quantity=Math.max(
                1,
                Number(i.value||1)
              );
            }
    
            renderCart();
          };
    
        });
    
      document.querySelectorAll('[data-del]')
        .forEach(b=>{
    
          b.onclick=()=>{
    
            cart=cart.filter(
              x=>String(x.productId)!==String(b.dataset.del)
            );
    
            renderCart();
          };
    
        });
    
    
      let subtotal=cart.reduce((a,x)=>{
    
        const p=products.find(
          p=>String(p.productId)===String(x.productId)
        );
    
        return a+
          (p?
            Number(p.price||0)*x.quantity
            :0);
    
      },0);
    
    
      let iva=0,
          total=subtotal;
    
    
      if(settings.ivaEnabled){
    
        iva=settings.pricesIncludeIva
          ?Math.round(
            subtotal-
            (subtotal/(1+Number(settings.ivaRate)/100))
          )
          :Math.round(
            subtotal*Number(settings.ivaRate)/100
          );
    
        if(!settings.pricesIncludeIva){
          total=subtotal+iva;
        }
      }
    
      $('#cartTotal').textContent=money(total);
    }
    
    
    /* =========================================================
       BÚSQUEDA / CÓDIGO
    ========================================================= */
    
    $('#barcode').oninput=renderProducts;
    
    $('#barcode').onkeydown=e=>{
    
      if(e.key==='Enter'){
    
        const q=e.target.value.trim().toLowerCase();
    
        const p=products.find(
          p=>
            String(p.barcode||'').toLowerCase()===q ||
            String(p.sku||'').toLowerCase()===q
        );
    
        if(p){
    
          addToCart(p.productId);
    
          e.target.value='';
    
          renderProducts();
        }
      }
    };
    
    
    $('#clearBtn').onclick=()=>{
      cart=[];
      renderCart();
    };
    
    
    /* =========================================================
       CONFIGURACIÓN IVA
    ========================================================= */
    
    $('#saveSettings').onclick=async()=>{
    
      settings={
        ivaEnabled:$('#ivaEnabled').checked,
        ivaRate:Number($('#ivaRate').value||19),
        pricesIncludeIva:$('#pricesIncludeIva').checked
      };
    
      const r=await api('savePPVSettings',{
        token:token(),
        settings
      });
    
      $('#saleStatus').textContent=
        r.ok
          ?'Configuración PPV guardada.'
          :(r.message||r.error);
    
      renderCart();
    };
    
    
    /* =========================================================
       REGISTRAR VENTA
    ========================================================= */
    
    $('#sellBtn').onclick=async()=>{
    
      if(!cart.length){
        $('#saleStatus').textContent='Agrega al menos un producto.';
        return;
      }
    
      try{
    
        $('#sellBtn').disabled=true;
        $('#saleStatus').textContent='Registrando venta…';
    
        const r=await api('recordPPVSale',{
          token:token(),
    
          sale:{
            items:cart,
            paymentMethod:'efectivo',
            channel:'pos',
            customerPhone:$('#customerPhone').value.trim()
          }
        });
    
        if(!r.ok){
          throw Error(r.message||r.error);
        }
    
        /*
          IMPORTANTE:
    
          drawReceipt() se ejecuta ANTES de vaciar cart,
          porque el comprobante necesita utilizar el detalle
          de los productos vendidos.
        */
    
        lastSale=r.sale;
    
        $('#saleStatus').textContent=
          `Venta #${r.sale.saleNumber} registrada correctamente.`;
    
        drawReceipt(r.sale);
    
        /*
          NUEVO:
    
          Descarga automáticamente el comprobante PNG
          después de generarlo.
    
          Se utiliza setTimeout para permitir que el canvas
          termine de renderizar antes de iniciar la descarga.
        */
    
        setTimeout(()=>{
          autoDownloadReceipt();
        },150);
    
        /*
          Ahora sí podemos limpiar el carrito.
        */
    
        cart=[];
        renderCart();
    
        await load();
    
      }catch(e){
    
        $('#saleStatus').textContent=
          'No se pudo registrar: '+e.message;
    
      }finally{
    
        $('#sellBtn').disabled=false;
    
      }
    };
    
    
    /* =========================================================
       COMPROBANTE
    ========================================================= */
    
    function drawReceipt(sale){
    
      const c=$('#receiptCanvas');
    
      const ctx=c.getContext('2d');
    
      const w=800;
    
      const h=Math.max(
        560,
        300+cart.length*48
      );
    
      c.width=w;
      c.height=h;
    
    
      /* Fondo */
    
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,w,h);
    
    
      /* Encabezado */
    
      ctx.fillStyle='#111';
    
      ctx.textAlign='center';
    
      ctx.font='bold 34px Arial';
    
      ctx.fillText(
        'VFeria · PPV',
        w/2,
        55
      );
    
    
      ctx.font='20px Arial';
    
      ctx.fillText(
        'Comprobante de venta',
        w/2,
        90
      );
    
    
      /* Datos */
    
      ctx.textAlign='left';
    
      ctx.font='18px Arial';
    
      ctx.fillText(
        'Venta #'+sale.saleNumber,
        45,
        130
      );
    
      ctx.fillText(
        new Date(sale.createdAt).toLocaleString('es-CL'),
        45,
        160
      );
    
    
      /* Productos */
    
      let y=210;
    
      ctx.font='17px Arial';
    
    
      cart.forEach(item=>{
    
        const p=products.find(
          x=>String(x.productId)===String(item.productId)
        );
    
        if(!p)return;
    
        ctx.fillText(
          `${item.quantity} × ${p.name}`,
          45,
          y
        );
    
        ctx.textAlign='right';
    
        ctx.fillText(
          money(
            Number(p.price||0)*item.quantity
          ),
          755,
          y
        );
    
        ctx.textAlign='left';
    
        y+=40;
    
      });
    
    
      /* Total */
    
      ctx.font='bold 22px Arial';
    
      ctx.fillText(
        'TOTAL: '+money(sale.total),
        45,
        y+15
      );
    
    
      /* IVA */
    
      if(settings.ivaEnabled){
    
        ctx.font='17px Arial';
    
        ctx.fillText(
          'IVA: '+money(sale.iva),
          45,
          y+50
        );
      }
    
    
      /* Pie */
    
      ctx.font='16px Arial';
    
      ctx.fillText(
        'Gracias por su compra',
        45,
        y+100
      );
    
      ctx.fillText(
        'Este documento es un comprobante interno PPV.',
        45,
        y+140
      );
    
    
      $('#receiptBox').hidden=false;
    }
    
    
    /* =========================================================
       CREAR ARCHIVO DEL COMPROBANTE
    ========================================================= */
    
    function receiptFile(){
    
      if(!lastSale || !$('#receiptCanvas')){
        return null;
      }
    
      const canvas=$('#receiptCanvas');
    
      return new File(
        [
          dataURLToBlob(
            canvas.toDataURL('image/png')
          )
        ],
        `ppv-venta-${lastSale.saleNumber||'comprobante'}.png`,
        {
          type:'image/png'
        }
      );
    }
    
    
    function dataURLToBlob(dataURL){
    
      const parts=dataURL.split(',');
    
      const mime=parts[0]
        .match(/:(.*?);/)[1];
    
      const binary=atob(parts[1]);
    
      const len=binary.length;
    
      const array=new Uint8Array(len);
    
      for(let i=0;i<len;i++){
        array[i]=binary.charCodeAt(i);
      }
    
      return new Blob(
        [array],
        {type:mime}
      );
    }
    
    
    /* =========================================================
       DESCARGA AUTOMÁTICA
    ========================================================= */
    
    function autoDownloadReceipt(){
    
      if(!lastSale || !$('#receiptCanvas')){
        return;
      }
    
      try{
    
        const canvas=$('#receiptCanvas');
    
        const a=document.createElement('a');
    
        a.download=
          `ppv-venta-${lastSale.saleNumber||'comprobante'}.png`;
    
        a.href=canvas.toDataURL('image/png');
    
        /*
          Agregamos temporalmente el enlace al DOM.
          Esto mejora la compatibilidad con algunos navegadores.
        */
    
        document.body.appendChild(a);
    
        a.click();
    
        a.remove();
    
      }catch(e){
    
        console.warn(
          'No fue posible descargar automáticamente el comprobante:',
          e
        );
    
      }
    }
    
    
    /* =========================================================
       DESCARGA MANUAL
    ========================================================= */
    
    $('#downloadReceipt').onclick=()=>{
    
      if(!lastSale){
        return;
      }
    
      const a=document.createElement('a');
    
      a.download=
        `ppv-venta-${lastSale.saleNumber||'comprobante'}.png`;
    
      a.href=$('#receiptCanvas')
        .toDataURL('image/png');
    
      a.click();
    };
    
    
    /* =========================================================
       COMPARTIR COMPROBANTE
    ========================================================= */
    
    async function shareReceipt(){
    
      if(!lastSale){
        return;
      }
    
      try{
    
        const file=receiptFile();
    
        if(!file){
          throw Error('No se pudo generar el archivo.');
        }
    
    
        /*
          Web Share API con archivo.
    
          En Android/iOS modernos permite seleccionar
          WhatsApp u otra aplicación compatible.
        */
    
        if(
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({files:[file]})
        ){
    
          await navigator.share({
            title:`Comprobante VFeria #${lastSale.saleNumber}`,
            text:
              `Comprobante de venta VFeria #${lastSale.saleNumber}`,
            files:[file]
          });
    
          return;
        }
    
    
        /*
          Si el navegador no permite compartir archivos,
          hacemos descarga como alternativa.
        */
    
        autoDownloadReceipt();
    
        $('#saleStatus').textContent=
          'Comprobante descargado. Este navegador no permite compartir archivos directamente.';
    
      }catch(e){
    
        /*
          AbortError significa que el usuario cerró
          el menú de compartir. No debemos mostrarlo
          como un error.
        */
    
        if(e.name==='AbortError'){
          return;
        }
    
        console.warn(
          'No fue posible compartir el comprobante:',
          e
        );
    
        autoDownloadReceipt();
      }
    }
    
    
    /*
      Si el HTML ya posee un botón con id
      "shareReceiptBtn", lo conectamos.
    
      Si no existe, simplemente no hacemos nada.
      Por lo tanto, este código es compatible
      con tu HTML actual.
    */
    
    if($('#shareReceiptBtn')){
      $('#shareReceiptBtn').onclick=shareReceipt;
    }
    
    
    /* =========================================================
       WHATSAPP
    ========================================================= */
    
    $('#whatsappBtn').onclick=()=>{
    
      const phone=prompt(
        'Teléfono del cliente (ej. +56912345678):',
        ''
      );
    
      if(!phone || !lastSale)return;
    
      const clean=phone.replace(/\D/g,'');
    
      const msg=encodeURIComponent(
        `Hola, gracias por tu compra en VFeria. Venta #${lastSale.saleNumber}. Total: ${money(lastSale.total)}. Te enviamos el detalle de tu compra.`
      );
    
      window.open(
        `https://wa.me/${clean}?text=${msg}`,
        '_blank'
      );
    };
    
    
    /* =========================================================
       VENTAS
    ========================================================= */
    
    async function loadSales(){
    
      const r=await api(
        'listPPVSales',
        {token:token()}
      );
    
      if(!r.ok)return;
    
      $('#salesList').innerHTML=
        r.sales.length
          ?`
            <table class="sales-table">
    
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Total</th>
                  <th>Fecha</th>
                </tr>
              </thead>
    
              <tbody>
    
                ${r.sales
                  .slice(0,10)
                  .map(x=>`
                    <tr>
                      <td>#${esc(x.saleNumber)}</td>
    
                      <td>
                        ${money(x.total)}
                      </td>
    
                      <td>
                        ${new Date(x.createdAt)
                          .toLocaleString('es-CL')}
                      </td>
                    </tr>
                  `)
                  .join('')}
    
              </tbody>
    
            </table>
          `
          :'Sin ventas todavía.';
    }
    
    
    /* =========================================================
       INVENTARIO
    ========================================================= */
    
    function renderInventory(){
    
      const active=
        products.filter(
          p=>p.ppvActive!==false
        );
    
      $('#inventorySummary').textContent=
        `${active.length} productos activos · ${
          products.reduce(
            (a,p)=>a+Number(p.stock||0),
            0
          )
        } unidades en stock`;
    
      $('#inventoryList').innerHTML=
        active
          .slice(0,20)
          .map(p=>`
            <div class="ppv-item">
    
              <img
                src="${esc(
                  p.imageUrl||'assets/VFeria-logo.png'
                )}"
                alt="">
    
              <div>
    
                <b>${esc(p.name)}</b>
    
                <div class="muted2">
                  ${esc(
                    p.sku||p.barcode||'Sin código'
                  )}
                  · Stock ${p.stock}
                </div>
    
              </div>
    
              <strong>
                ${money(p.price)}
              </strong>
    
            </div>
          `)
          .join('');
    }
    
    
    /* =========================================================
       ESCÁNER DE CÓDIGO DE BARRAS
    ========================================================= */
    
    $('#scanBtn').onclick=async()=>{
    
      if(!('BarcodeDetector' in window)){
    
        $('#scanStatus').textContent=
          'Este navegador no expone BarcodeDetector. Usa el lector USB o escribe el código.';
    
        return;
      }
    
    
      try{
    
        const detector=new BarcodeDetector({
          formats:[
            'ean_13',
            'ean_8',
            'upc_a',
            'code_128',
            'qr_code'
          ]
        });
    
    
        const stream=
          await navigator.mediaDevices.getUserMedia({
            video:{
              facingMode:{
                ideal:'environment'
              }
            }
          });
    
    
        const v=document.createElement('video');
    
        v.srcObject=stream;
    
        v.setAttribute(
          'playsinline',
          ''
        );
    
        await v.play();
    
    
        const modal=document.createElement('div');
    
        modal.style=`
          position:fixed;
          inset:0;
          background:#000c;
          z-index:9999;
          display:grid;
          place-items:center;
          padding:20px
        `;
    
    
        modal.innerHTML=`
          <div style="
            background:#fff;
            padding:15px;
            border-radius:15px;
            max-width:520px;
            width:100%
          ">
    
            <video
              style="
                width:100%;
                border-radius:10px
              "
              autoplay
              playsinline>
            </video>
    
            <button
              class="btn btn-primary"
              style="
                margin-top:10px;
                width:100%
              ">
              Cerrar
            </button>
    
          </div>
        `;
    
    
        document.body.appendChild(modal);
    
    
        const mv=
          modal.querySelector('video');
    
        mv.srcObject=stream;
    
    
        const close=()=>{
    
          stream
            .getTracks()
            .forEach(t=>t.stop());
    
          modal.remove();
    
        };
    
    
        modal.querySelector('button')
          .onclick=close;
    
    
        const tick=async()=>{
    
          if(!modal.isConnected)return;
    
          try{
    
            const codes=
              await detector.detect(mv);
    
            if(codes[0]?.rawValue){
    
              $('#barcode').value=
                codes[0].rawValue;
    
              renderProducts();
    
    
              const p=products.find(
                p=>String(p.barcode)===
                   String(codes[0].rawValue)
              );
    
    
              if(p){
                addToCart(p.productId);
              }
    
    
              close();
    
              return;
            }
    
          }catch{}
    
    
          requestAnimationFrame(tick);
        };
    
    
        tick();
    
      }catch(e){
    
        $('#scanStatus').textContent=
          'No fue posible acceder a la cámara. Revisa los permisos del navegador.';
    
      }
    };
    
    
    /* =========================================================
       INICIO
    ========================================================= */
    
    load();
    
    })();