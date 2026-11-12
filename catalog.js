(() => {
  'use strict';

  const API =
    'https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';

  /*
   * v4:
   * Se incrementa la versión de caché porque el catálogo ahora
   * utiliza createdAt para ordenar correctamente los productos nuevos.
   */
  const CACHE = 'vferia_public_catalog_v4';
  const TTL = 10 * 60 * 1000;

  const $ = s => document.querySelector(s);

  const esc = v =>
    String(v ?? '').replace(
      /[&<>"']/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c]
    );

  const safe = v => {
    try {
      const u = new URL(String(v || ''));
      return u.protocol === 'https:' ? u.href : '';
    } catch {
      return '';
    }
  };

  const money = v =>
    Number(v || 0).toLocaleString('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0
    });

  /*
   * WhatsApp
   */
  function wa(p) {
    let n = String(
      p.businessWhatsapp ||
      p.businessPhone ||
      p.phone ||
      ''
    ).replace(/\D/g, '');

    if (n.length === 9 && n[0] === '9') {
      n = '56' + n;
    }

    const m = encodeURIComponent(
      `Hola, vi este ${p.type === 'servicio' ? 'servicio' : 'producto'} en VFeria y quisiera más información.\n\n` +
      `${p.name || 'Oferta'}\n` +
      `Emprendimiento: ${p.businessName || ''}`
    );

    return n
      ? `https://wa.me/${n}?text=${m}`
      : `https://wa.me/?text=${m}`;
  }

  /*
   * Convierte URL de YouTube a URL embebible.
   */
  function yt(u) {
    try {
      const x = new URL(u);

      if (x.hostname.includes('youtu.be')) {
        return (
          'https://www.youtube.com/embed/' +
          x.pathname.slice(1).split('/')[0]
        );
      }

      const id = x.searchParams.get('v');

      return id
        ? 'https://www.youtube.com/embed/' + id
        : '';
    } catch {
      return '';
    }
  }

  /*
   * Parámetros de URL.
   *
   * Se aceptan:
   * ?businessId=...
   * ?tienda=...
   */
  const params = new URLSearchParams(location.search);

  const requested =
    params.get('businessId') ||
    params.get('tienda') ||
    '';

  /*
   * Elementos principales del catálogo.
   */
  const search = $('#catalogSearch');
  const businessFilter = $('#businessFilter');
  const typeFilter = $('#typeFilter');
  const sortFilter = $('#sortFilter');
  const grid = $('#catalogGrid');
  const status = $('#catalogStatus');
  const empty = $('#catalogEmpty');

  let businesses = [];
  let products = [];
  let selected = requested;

  /*
   * ============================================================
   * CARGA DEL CATÁLOGO
   * ============================================================
   */
  async function load(force = false) {

    status.textContent = 'Cargando catálogo…';

    try {

      let d = null;

      /*
       * Intentar utilizar caché local.
       */
      if (!force) {

        try {

          const c = JSON.parse(
            localStorage.getItem(CACHE) || 'null'
          );

          if (
            c &&
            Date.now() - c.savedAt < TTL
          ) {
            d = c.data;
          }

        } catch {}

      }

      /*
       * Si no existe caché válida, consultar API.
       */
      if (!d) {

        d = await (
          await fetch(
            API + '?action=publicCatalog',
            {
              cache: 'no-store'
            }
          )
        ).json();

      }

      if (!d.ok) {
        throw Error(d.error || 'CATALOG');
      }

      /*
       * Guardar respuesta en caché.
       */
      try {

        localStorage.setItem(
          CACHE,
          JSON.stringify({
            savedAt: Date.now(),
            data: d
          })
        );

      } catch {}

      businesses = d.businesses || [];

      /*
       * Convertir estructura:
       *
       * businesses
       *   └── products[]
       *
       * en un único array products.
       */
      products = businesses.flatMap(
        b =>
          (b.products || []).map(p => ({
            ...p,

            businessId:
              p.businessId ||
              b.businessId,

            businessName:
              b.businessName ||
              'Emprendimiento',

            businessCategory:
              b.category ||
              '',

            businessCity:
              b.city ||
              '',

            businessLogo:
              b.logoUrl ||
              '',

            businessWhatsapp:
              b.phone ||
              '',

            businessWeb:
              b.businessWeb ||
              '',

            businessInstagram:
              b.businessInstagram ||
              '',

            businessFacebook:
              b.businessFacebook ||
              '',

            businessVideoUrl:
              b.businessVideoUrl ||
              ''
          }))
      );

      populate();

      /*
       * Validar emprendimiento solicitado.
       */
      if (
        requested &&
        businesses.some(
          b =>
            String(b.businessId) ===
            String(requested)
        )
      ) {
        selected = requested;

      } else if (requested) {

        selected = '';

      }

      businessFilter.value = selected;

      renderStoreBanner();
      render();

      /*
       * Registrar visita al emprendimiento.
       */
      if (
        selected &&
        window.VFeriaAnalytics
      ) {
        window.VFeriaAnalytics.trackBusiness(
          selected
        );
      }

    } catch (e) {

      console.error(e);

      status.textContent =
        'No se pudo cargar el catálogo.';

      grid.innerHTML = '';

      empty.hidden = false;
    }
  }

  /*
   * ============================================================
   * FILTRO DE EMPRENDIMIENTOS
   * ============================================================
   */
  function populate() {

    businessFilter.innerHTML =
      '<option value="">Todos los emprendimientos</option>';

    businesses.forEach(b => {

      const o =
        document.createElement('option');

      o.value = b.businessId;

      o.textContent =
        b.businessName ||
        'Emprendimiento';

      businessFilter.appendChild(o);

    });
  }

  /*
   * ============================================================
   * BANNER DE TIENDA
   * ============================================================
   */
  function renderStoreBanner() {

    const b = businesses.find(
      x =>
        String(x.businessId) ===
        String(selected)
    );

    const box = $('#storeFilterBanner');

    if (!b) {

      box.hidden = true;

      return;
    }

    box.hidden = false;

    $('#storeFilterTitle').textContent =
      b.businessName ||
      'Emprendimiento';

    $('#storeFilterDescription').textContent =
      [
        b.category,
        b.city,
        b.businessDescription
      ]
        .filter(Boolean)
        .join(' · ');

    /*
     * Logo.
     */
    const logo =
      $('#storeBusinessLogo');

    if (b.logoUrl) {

      logo.src = b.logoUrl;
      logo.hidden = false;

    } else {

      logo.hidden = true;

    }

    /*
     * Video.
     */
    const video =
      $('#storeBusinessVideo');

    const emb =
      yt(b.businessVideoUrl);

    if (emb) {

      video.hidden = false;

      video.innerHTML =
        `<iframe
          src="${esc(emb)}"
          title="Video de ${esc(b.businessName)}"
          loading="lazy"
          allowfullscreen>
        </iframe>`;

    } else {

      video.hidden = true;
      video.innerHTML = '';

    }

    /*
     * Links de contacto.
     */
    const links = [

      [
        'storeWhatsapp',
        wa({
          businessWhatsapp: b.phone,
          businessName: b.businessName,
          type: 'producto'
        }),
        true
      ],

      [
        'storeWeb',
        b.businessWeb,
        false
      ],

      [
        'storeInstagram',
        b.businessInstagram,
        false
      ],

      [
        'storeFacebook',
        b.businessFacebook,
        false
      ]

    ];

    links.forEach(
      ([id, url, always]) => {

        const a = $('#' + id);

        if (
          url &&
          (!always || url)
        ) {

          a.href = url;
          a.hidden = false;

        } else {

          a.hidden = true;

        }

      }
    );

    $('#storeProductCount').textContent =
      `${b.products.length} productos publicados`;
  }

  /*
   * ============================================================
   * URL DE TIENDA
   * ============================================================
   */
  function storeUrl(businessId) {

    return (
      `${location.origin}` +
      `${location.pathname.replace(
        /productos\.html$/,
        'productos.html'
      )}` +
      `?businessId=${encodeURIComponent(
        String(businessId || '')
      )}`
    );
  }

  /*
   * ============================================================
   * TEXTO PARA COMPARTIR
   * ============================================================
   */
  function productShareText(p) {

    return (
      `🛍️ ${p.name || 'Producto'}\n` +
      `💰 ${money(p.price)}\n` +
      `🏪 ${p.businessName || 'Emprendimiento'}\n\n` +
      `Conoce todos los productos de esta tienda en VFeria:\n` +
      `${storeUrl(p.businessId)}`
    );
  }

  /*
   * ============================================================
   * CARGAR IMAGEN
   * ============================================================
   */
  function loadImage(src) {

    return new Promise(
      (resolve, reject) => {

        const img =
          new Image();

        img.crossOrigin =
          'anonymous';

        img.onload = () =>
          resolve(img);

        img.onerror =
          reject;

        img.src = src;
      }
    );
  }

  /*
   * ============================================================
   * RECTÁNGULO REDONDEADO
   * ============================================================
   */
  function roundedRect(
    ctx,
    x,
    y,
    w,
    h,
    r
  ) {

    const rr =
      Math.min(
        r,
        w / 2,
        h / 2
      );

    ctx.beginPath();

    ctx.moveTo(
      x + rr,
      y
    );

    ctx.arcTo(
      x + w,
      y,
      x + w,
      y + h,
      rr
    );

    ctx.arcTo(
      x + w,
      y + h,
      x,
      y + h,
      rr
    );

    ctx.arcTo(
      x,
      y + h,
      x,
      y,
      rr
    );

    ctx.arcTo(
      x,
      y,
      x + w,
      y,
      rr
    );

    ctx.closePath();
  }

  /*
   * ============================================================
   * GENERAR IMAGEN PARA COMPARTIR
   * ============================================================
   */
  async function buildShareImage(
    p,
    format = 'post'
  ) {

    const W = 1080;

    const H =
      format === 'story'
        ? 1920
        : 1350;

    const c =
      document.createElement('canvas');

    c.width = W;
    c.height = H;

    const ctx =
      c.getContext('2d');

    /*
     * Fondo.
     */
    const grad =
      ctx.createLinearGradient(
        0,
        0,
        W,
        H
      );

    grad.addColorStop(
      0,
      '#0b1220'
    );

    grad.addColorStop(
      0.55,
      '#111e3a'
    );

    grad.addColorStop(
      1,
      '#17102f'
    );

    ctx.fillStyle = grad;

    ctx.fillRect(
      0,
      0,
      W,
      H
    );

    /*
     * Branding.
     */
    ctx.fillStyle =
      '#ffffff';

    ctx.font =
      '700 30px Arial';

    ctx.fillText(
      'VFeria',
      70,
      78
    );

    ctx.fillStyle =
      '#72e5ff';

    ctx.font =
      '600 22px Arial';

    ctx.fillText(
      'TU NEGOCIO MERECE UN ESPACIO EXTRAORDINARIO',
      70,
      116
    );

    /*
     * Logo del emprendimiento.
     */
    if (p.businessLogo) {

      try {

        const logo =
          await loadImage(
            p.businessLogo
          );

        const lw = 220;
        const lh = 110;

        const scale =
          Math.min(
            lw / logo.width,
            lh / logo.height
          );

        ctx.drawImage(
          logo,
          W - lw - 70,
          32,
          logo.width * scale,
          logo.height * scale
        );

      } catch (e) {}

    }

    /*
     * Imagen principal.
     */
    const imageBoxY = 150;

    const imageBoxH =
      format === 'story'
        ? 850
        : 620;

    ctx.fillStyle =
      '#0a1120';

    roundedRect(
      ctx,
      60,
      imageBoxY,
      W - 120,
      imageBoxH,
      28
    );

    ctx.fill();

    ctx.save();

    roundedRect(
      ctx,
      60,
      imageBoxY,
      W - 120,
      imageBoxH,
      28
    );

    ctx.clip();

    try {

      if (p.imageUrl) {

        const img =
          await loadImage(
            p.imageUrl
          );

        const scale =
          Math.min(
            (W - 120) / img.width,
            imageBoxH / img.height
          );

        const iw =
          img.width * scale;

        const ih =
          img.height * scale;

        ctx.drawImage(
          img,
          (W - iw) / 2,
          imageBoxY +
            (imageBoxH - ih) / 2,
          iw,
          ih
        );

      }

    } catch (e) {

      ctx.fillStyle =
        '#273553';

      ctx.font =
        '600 28px Arial';

      ctx.textAlign =
        'center';

      ctx.fillText(
        'Imagen no disponible',
        W / 2,
        imageBoxY +
          imageBoxH / 2
      );

      ctx.textAlign =
        'left';
    }

    ctx.restore();

    /*
     * Información del producto.
     */
    let y =
      imageBoxY +
      imageBoxH +
      62;

    ctx.fillStyle =
      '#72e5ff';

    ctx.font =
      '700 24px Arial';

    ctx.fillText(
      p.type === 'servicio'
        ? 'SERVICIO'
        : 'PRODUCTO',
      70,
      y
    );

    y += 52;

    ctx.fillStyle =
      '#ffffff';

    ctx.font =
      '700 48px Arial';

    const name =
      String(
        p.name || 'Sin nombre'
      );

    const words =
      name.split(' ');

    let line = '';

    for (const word of words) {

      const test =
        line
          ? line + ' ' + word
          : word;

      if (
        ctx.measureText(test)
          .width >
        W - 260
      ) {

        ctx.fillText(
          line,
          70,
          y
        );

        y += 58;

        line = word;

      } else {

        line = test;

      }
    }

    if (line) {

      ctx.fillText(
        line,
        70,
        y
      );

      y += 64;
    }

    /*
     * Precio.
     */
    ctx.fillStyle =
      '#bfefff';

    ctx.font =
      '700 42px Arial';

    ctx.fillText(
      money(p.price),
      70,
      y
    );

    y += 52;

    /*
     * Emprendimiento.
     */
    ctx.fillStyle =
      '#d7deed';

    ctx.font =
      '500 25px Arial';

    ctx.fillText(
      p.businessName ||
        'Emprendimiento',
      70,
      y
    );

    y += 42;

    /*
     * Stock.
     */
    if (
      Number(p.stock || 0) > 0
    ) {

      ctx.fillText(
        `Disponible: ${Number(
          p.stock
        ).toLocaleString('es-CL')}`,
        70,
        y
      );

    } else {

      ctx.fillStyle =
        '#ff9c9c';

      ctx.fillText(
        'Agotado',
        70,
        y
      );
    }

    y += 40;

    /*
     * Descripción.
     */
    ctx.fillStyle =
      '#b8c7e2';

    ctx.font =
      '500 22px Arial';

    const desc =
      String(
        p.description || ''
      )
        .replace(/\s+/g, ' ')
        .trim();

    if (desc) {

      const d =
        desc.length > 180
          ? desc.slice(0, 177) + '…'
          : desc;

      ctx.fillText(
        d,
        70,
        y
      );
    }

    y += 36;

    /*
     * Canales de contacto.
     */
    const channels = [
      p.businessWhatsapp
        ? 'WhatsApp'
        : null,

      p.businessWeb
        ? 'Web'
        : null,

      p.businessInstagram
        ? 'Instagram'
        : null,

      p.businessFacebook
        ? 'Facebook'
        : null,

      p.social
        ? 'Red social'
        : null

    ].filter(Boolean);

    if (channels.length) {

      ctx.fillStyle =
        '#72e5ff';

      ctx.font =
        '700 20px Arial';

      ctx.fillText(
        'Contacto: ' +
          channels.join(' · '),
        70,
        y
      );
    }

    /*
     * QR.
     */
    const qrData =
      storeUrl(
        p.businessId
      );

    try {

      const qr =
        await loadImage(
          'https://quickchart.io/qr?size=190&margin=1&text=' +
          encodeURIComponent(qrData)
        );

      ctx.drawImage(
        qr,
        W - 280,
        H - 310,
        190,
        190
      );

    } catch (e) {

      ctx.fillStyle =
        '#ffffff';

      ctx.font =
        '600 18px Arial';

      ctx.fillText(
        'QR disponible al compartir',
        W - 330,
        H - 210
      );
    }

    ctx.fillStyle =
      '#ffffff';

    ctx.font =
      '600 22px Arial';

    ctx.fillText(
      'Escanea para conocer la tienda',
      W - 360,
      H - 95
    );

    ctx.fillStyle =
      '#72e5ff';

    ctx.font =
      '700 26px Arial';

    ctx.fillText(
      'vferia.cl',
      70,
      H - 70
    );

    return c;
  }

  /*
   * ============================================================
   * ABRIR MODAL DE COMPARTIR
   * ============================================================
   */
  async function shareProduct(p) {

    const modal =
      $('#shareModal');

    const preview =
      $('#sharePreview');

    const statusEl =
      $('#shareStatus');

    modal.hidden = false;

    statusEl.textContent =
      'Generando imagen…';

    preview.innerHTML = '';

    try {

      const c =
        await buildShareImage(
          p,
          'post'
        );

      preview.appendChild(c);

      modal.dataset.productId =
        p.productId;

      modal.dataset.businessId =
        p.businessId;

      modal.dataset.shareFormat =
        'post';

      modal._product = p;

      statusEl.textContent =
        'Imagen lista para compartir.';

    } catch (e) {

      console.error(e);

      statusEl.textContent =
        'No se pudo generar la imagen. Verifica que las imágenes de R2 permitan CORS.';
    }
  }

  /*
   * ============================================================
   * GENERAR ARCHIVO
   * ============================================================
   */
  async function generateShareFile(
    format = 'post'
  ) {

    const p =
      $('#shareModal')._product;

    if (!p) {
      throw Error(
        'No hay producto seleccionado.'
      );
    }

    const c =
      await buildShareImage(
        p,
        format
      );

    const blob =
      await new Promise(
        (resolve, reject) =>
          c.toBlob(
            b =>
              b
                ? resolve(b)
                : reject(
                    Error(
                      'No se pudo generar PNG'
                    )
                  ),
            'image/png',
            0.95
          )
      );

    const safeName =
      String(
        p.name || 'producto'
      )
        .replace(
          /[^a-z0-9áéíóúñ -]/gi,
          ''
        )
        .trim()
        .replace(
          /\s+/g,
          '-'
        ) ||
      'producto';

    return {
      p,
      c,
      blob,
      file: new File(
        [blob],
        `VFeria-${safeName}-${format}.png`,
        {
          type: 'image/png'
        }
      )
    };
  }

  /*
   * ============================================================
   * COMPARTIR
   * ============================================================
   */
  async function shareGenerated(
    format
  ) {

    const statusEl =
      $('#shareStatus');

    try {

      statusEl.textContent =
        'Generando imagen…';

      const out =
        await generateShareFile(
          format
        );

      $('#sharePreview').innerHTML =
        '';

      $('#sharePreview')
        .appendChild(out.c);

      const text =
        productShareText(
          out.p
        );

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({
          files: [out.file]
        })
      ) {

        await navigator.share({
          title:
            out.p.name ||
            'Producto VFeria',
          text,
          files: [out.file]
        });

        statusEl.textContent =
          'Contenido compartido.';

      } else {

        const a =
          document.createElement(
            'a'
          );

        a.href =
          URL.createObjectURL(
            out.blob
          );

        a.download =
          out.file.name;

        a.click();

        setTimeout(
          () =>
            URL.revokeObjectURL(
              a.href
            ),
          1000
        );

        statusEl.textContent =
          'Imagen descargada. Usa Copiar enlace o Copiar texto para publicarla.';
      }

    } catch (e) {

      if (
        e.name !==
        'AbortError'
      ) {

        statusEl.textContent =
          'No se pudo compartir: ' +
          e.message;
      }
    }
  }

  /*
   * ============================================================
   * DESCARGAR IMAGEN
   * ============================================================
   */
  async function downloadShare() {

    try {

      const out =
        await generateShareFile(
          $('#shareModal')
            .dataset
            .shareFormat ||
          'post'
        );

      const a =
        document.createElement(
          'a'
        );

      a.href =
        URL.createObjectURL(
          out.blob
        );

      a.download =
        out.file.name;

      a.click();

      setTimeout(
        () =>
          URL.revokeObjectURL(
            a.href
          ),
        1000
      );

      $('#shareStatus')
        .textContent =
        'Imagen descargada.';

    } catch (e) {

      $('#shareStatus')
        .textContent =
        'No se pudo descargar la imagen.';
    }
  }

  /*
   * ============================================================
   * COPIAR ENLACE
   * ============================================================
   */
  async function copyShareLink() {

    try {

      const p =
        $('#shareModal')._product;

      await navigator.clipboard.writeText(
        storeUrl(
          p.businessId
        )
      );

      $('#shareStatus')
        .textContent =
        'Enlace de la tienda copiado.';

    } catch (e) {

      $('#shareStatus')
        .textContent =
        'No se pudo copiar el enlace.';
    }
  }

  /*
   * ============================================================
   * COPIAR TEXTO
   * ============================================================
   */
  async function copyShareText() {

    try {

      const p =
        $('#shareModal')._product;

      await navigator.clipboard.writeText(
        productShareText(p)
      );

      $('#shareStatus')
        .textContent =
        'Texto promocional copiado.';

    } catch (e) {

      $('#shareStatus')
        .textContent =
        'No se pudo copiar el texto.';
    }
  }

  /*
   * ============================================================
   * COMPARTIR NATIVO
   * ============================================================
   */
  async function nativeShare() {

    try {

      const out =
        await generateShareFile(
          $('#shareModal')
            .dataset
            .shareFormat ||
          'post'
        );

      const text =
        productShareText(
          out.p
        );

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({
          files: [out.file]
        })
      ) {

        await navigator.share({
          title:
            out.p.name ||
            'Producto VFeria',
          text,
          files: [out.file]
        });

        $('#shareStatus')
          .textContent =
          'Contenido compartido.';

      } else {

        await navigator.clipboard.writeText(
          text
        );

        $('#shareStatus')
          .textContent =
          'Tu dispositivo no permite compartir archivos desde el navegador. Texto copiado.';
      }

    } catch (e) {

      if (
        e.name !==
        'AbortError'
      ) {

        $('#shareStatus')
          .textContent =
          'No se pudo compartir: ' +
          e.message;
      }
    }
  }

  /*
   * ============================================================
   * CERRAR MODAL
   * ============================================================
   */
  function closeShare() {

    const m =
      $('#shareModal');

    if (m) {
      m.hidden = true;
    }
  }

  /*
   * ============================================================
   * FECHA DEL PRODUCTO
   * ============================================================
   *
   * Prioridad:
   *
   * 1. createdAt
   * 2. updatedAt
   * 3. 0
   *
   * Esto permite que "Producto nuevo" signifique
   * realmente producto creado recientemente.
   */
  function dateValue(product) {

    const created =
      Date.parse(
        String(
          product.createdAt || ''
        )
      );

    const updated =
      Date.parse(
        String(
          product.updatedAt || ''
        )
      );

    return Math.max(
      Number.isFinite(created)
        ? created
        : 0,
      Number.isFinite(updated)
        ? updated
        : 0
    );
  }

  /*
   * ============================================================
   * RENDER DEL CATÁLOGO
   * ============================================================
   */
  function render() {

    const q =
      (search.value || '')
        .trim()
        .toLowerCase();

    let f =
      products.filter(
        p => {

          const biz =
            !selected ||
            String(
              p.businessId
            ) ===
              String(
                selected
              );

          const type =
            !typeFilter.value ||
            p.type ===
              typeFilter.value;

          const text = [
            p.name,
            p.description,
            p.businessName,
            p.businessCategory,
            p.businessCity
          ]
            .join(' ')
            .toLowerCase();

          return (
            biz &&
            type &&
            text.includes(q)
          );
        }
      );

    const sort =
      sortFilter.value ||
      'newest';

    /*
     * ==========================================================
     * PRODUCTO NUEVO
     * ==========================================================
     *
     * Se ordena por createdAt.
     *
     * Si no existe createdAt:
     * se utiliza updatedAt como respaldo.
     */
    if (
      sort === 'newest'
    ) {

      f.sort(
        (a, b) =>
          dateValue(b) -
          dateValue(a)
      );

    /*
     * ==========================================================
     * RELEVANCIA
     * ==========================================================
     */
    } else if (
      sort === 'relevance'
    ) {

      const q =
        String(
          search.value || ''
        )
          .trim()
          .toLowerCase();

      if (q) {

        function relevance(p) {

          const name =
            String(
              p.name || ''
            )
              .toLowerCase();

          const business =
            String(
              p.businessName || ''
            )
              .toLowerCase();

          const description =
            String(
              p.description || ''
            )
              .toLowerCase();

          let score = 0;

          if (
            name === q
          ) {

            score += 100;

          } else if (
            name.startsWith(q)
          ) {

            score += 70;

          } else if (
            name.includes(q)
          ) {

            score += 50;
          }

          if (
            business.includes(q)
          ) {

            score += 25;
          }

          if (
            description.includes(q)
          ) {

            score += 10;
          }

          return score;
        }

        f.sort(
          (a, b) =>
            relevance(b) -
            relevance(a)
        );
      }

    /*
     * ==========================================================
     * NOMBRE
     * ==========================================================
     */
    } else if (
      sort === 'name'
    ) {

      f.sort(
        (a, b) =>
          String(
            a.name || ''
          ).localeCompare(
            String(
              b.name || ''
            ),
            'es'
          )
      );

    /*
     * ==========================================================
     * PRECIO ASCENDENTE
     * ==========================================================
     */
    } else if (
      sort === 'priceAsc'
    ) {

      f.sort(
        (a, b) =>
          Number(
            a.price || 0
          ) -
          Number(
            b.price || 0
          )
      );

    /*
     * ==========================================================
     * PRECIO DESCENDENTE
     * ==========================================================
     */
    } else if (
      sort === 'priceDesc'
    ) {

      f.sort(
        (a, b) =>
          Number(
            b.price || 0
          ) -
          Number(
            a.price || 0
          )
      );
    }

    /*
     * Estado del catálogo.
     */
    status.textContent =
      `${f.length} resultado${
        f.length === 1
          ? ''
          : 's'
      }`;

    empty.hidden =
      f.length > 0;

    /*
     * ============================================================
     * RENDER DE PRODUCTOS
     * ============================================================
     */
    grid.innerHTML =
      f
        .map(
          p => {

            const image =
              safe(
                p.imageUrl
              );

            const pay =
              safe(
                p.paymentLink
              );

            const link =
              safe(
                p.link
              );

            const social =
              safe(
                p.social
              );

            return `
              <article
                class="catalog-product"
                data-product-id="${esc(
                  p.productId
                )}"
              >

                <div
                  class="catalog-product-image-wrap"
                >

                  ${
                    image
                      ? `
                        <img
                          class="catalog-product-image"
                          src="${esc(image)}"
                          alt="${esc(p.name)}"
                          loading="lazy"
                        >
                      `
                      : `
                        <div
                          class="catalog-product-placeholder"
                        >
                          Imagen no disponible
                        </div>
                      `
                  }

                </div>

                <div
                  class="catalog-product-body"
                >

                  <div
                    class="catalog-business-chip"
                  >

                    ${
                      p.businessLogo
                        ? `
                          <img
                            src="${esc(
                              p.businessLogo
                            )}"
                            alt=""
                            class="catalog-business-logo"
                          >
                        `
                        : ''
                    }

                    <span>
                      ${esc(
                        p.businessName
                      )}
                    </span>

                  </div>

                  <h2>
                    ${esc(
                      p.name ||
                      'Sin nombre'
                    )}
                  </h2>

                  <span
                    class="catalog-type-badge"
                  >
                    ${
                      p.type ===
                      'servicio'
                        ? 'SERVICIO'
                        : 'PRODUCTO'
                    }
                  </span>

                  <strong
                    class="catalog-price"
                  >
                    ${money(
                      p.price
                    )}
                  </strong>

                  <p>
                    ${esc(
                      p.description ||
                      'Consulta los detalles de esta oferta.'
                    )}
                  </p>

                  <div
                    class="catalog-stock"
                  >

                    ${
                      Number(
                        p.stock || 0
                      ) > 0
                        ? `
                          Disponible:
                          <b>
                            ${Number(
                              p.stock
                            ).toLocaleString(
                              'es-CL'
                            )}
                          </b>
                        `
                        : `
                          <b>
                            Agotado
                          </b>
                        `
                    }

                  </div>

                  <div
                    class="catalog-product-actions"
                  >

                    ${
                      pay
                        ? `
                          <a
                            class="btn btn-primary"
                            href="${esc(pay)}"
                            target="_blank"
                            rel="noopener nofollow"
                          >
                            Pagar en línea ↗
                          </a>
                        `
                        : ''
                    }

                    <a
                      class="btn whatsapp-button"
                      href="${esc(
                        wa(p)
                      )}"
                      target="_blank"
                      rel="noopener"
                    >
                      WhatsApp ↗
                    </a>

                    ${
                      social
                        ? `
                          <a
                            class="btn social-button"
                            href="${esc(
                              social
                            )}"
                            target="_blank"
                            rel="noopener"
                          >
                            Red social ↗
                          </a>
                        `
                        : ''
                    }

                    ${
                      link
                        ? `
                          <a
                            class="btn btn-outline"
                            href="${esc(
                              link
                            )}"
                            target="_blank"
                            rel="noopener"
                          >
                            Ver enlace ↗
                          </a>
                        `
                        : ''
                    }

                    <button
                      class="btn share-product-button"
                      type="button"
                      data-share-product="${esc(
                        p.productId
                      )}"
                    >
                      📤 Compartir producto
                    </button>

                  </div>

                </div>

              </article>
            `;
          }
        )
        .join('');

    /*
     * ==========================================================
     * ANALYTICS DE PRODUCTOS
     * ==========================================================
     */
    f.forEach(
      p => {

        const card =
          document.querySelector(
            `[data-product-id="${CSS.escape(
              String(
                p.productId
              )
            )}"]`
          );

        if (
          card &&
          window.VFeriaAnalytics
        ) {

          card.addEventListener(
            'click',
            e => {

              if (
                !e.target.closest(
                  '[data-share-product]'
                )
              ) {

                window.VFeriaAnalytics.trackProduct(
                  p.businessId,
                  p.productId
                );
              }

            },
            {
              once: true
            }
          );
        }
      }
    );

    /*
     * ==========================================================
     * BOTONES DE COMPARTIR
     * ==========================================================
     */
    grid
      .querySelectorAll(
        '[data-share-product]'
      )
      .forEach(
        btn => {

          btn.onclick =
            () => {

              const product =
                f.find(
                  p =>
                    String(
                      p.productId
                    ) ===
                    String(
                      btn.dataset
                        .shareProduct
                    )
                );

              if (
                product
              ) {

                shareProduct(
                  product
                );
              }
            };
        }
      );
  }

  /*
   * ============================================================
   * LIMPIAR FILTROS
   * ============================================================
   */
  function clear() {

    search.value = '';

    typeFilter.value = '';

    sortFilter.value =
      'newest';

    selected =
      requested || '';

    businessFilter.value =
      selected;

    renderStoreBanner();

    render();
  }

  /*
   * ============================================================
   * EVENTOS
   * ============================================================
   */

  businessFilter.onchange =
    () => {

      selected =
        businessFilter.value;

      renderStoreBanner();

      render();

      if (
        selected &&
        window.VFeriaAnalytics
      ) {

        window.VFeriaAnalytics.trackBusiness(
          selected
        );
      }
    };

  typeFilter.onchange =
    render;

  sortFilter.onchange =
    render;

  search.oninput =
    render;

  $('#clearFilters').onclick =
    clear;

  $('#emptyClear').onclick =
    clear;

  $('#refreshCatalog').onclick =
    () => load(true);

  $('#shareClose').onclick =
    closeShare;

  $('#sharePost').onclick =
    () => {

      $('#shareModal')
        .dataset
        .shareFormat =
        'post';

      shareGenerated(
        'post'
      );
    };

  $('#shareStory').onclick =
    () => {

      $('#shareModal')
        .dataset
        .shareFormat =
        'story';

      shareGenerated(
        'story'
      );
    };

  $('#shareDownload').onclick =
    downloadShare;

  $('#shareCopyLink').onclick =
    copyShareLink;

  $('#shareCopyText').onclick =
    copyShareText;

  $('#shareNative').onclick =
    nativeShare;

  /*
   * Cerrar modal haciendo clic
   * fuera del contenido.
   */
  $('#shareModal')
    .addEventListener(
      'click',
      e => {

        if (
          e.target.id ===
          'shareModal'
        ) {
          closeShare();
        }

      }
    );

  /*
   * ============================================================
   * INICIO
   * ============================================================
   */
  load();

})();