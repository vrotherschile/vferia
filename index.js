(() => {
  'use strict';

  const API =
    'https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';

  const $ =
    s => document.querySelector(s);

  const esc =
    v =>
      String(v ?? '')
        .replace(
          /[&<>"']/g,
          c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          })[c]
        );

  function embed(u) {
    try {

      const x =
        new URL(u);

      if (
        x.hostname.includes(
          'youtu.be'
        )
      ) {
        return (
          'https://www.youtube.com/embed/' +
          x.pathname
            .slice(1)
            .split('/')[0]
        );
      }

      const id =
        x.searchParams.get('v');

      return id
        ? 'https://www.youtube.com/embed/' +
            id
        : '';

    } catch {
      return '';
    }
  }

  function money(value) {
    return Number(
      value || 0
    ).toLocaleString(
      'es-CL',
      {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0
      }
    );
  }

  async function load() {

    try {

      /*
       * CONFIGURACIÓN DEL SITIO
       */
      const configResponse =
        await fetch(
          API +
          '?action=getSiteConfig',
          {
            cache: 'no-store'
          }
        );

      const c =
        await configResponse.json();

      if (c.ok) {

        renderPromoBanners(
          c.config.banners || []
        );

        const src =
          embed(
            c.config.introVideoUrl
          );

        const videoWrap =
          $('#vfIntroVideoWrap');

        if (src) {

          videoWrap.innerHTML = `
            <iframe
              src="${esc(src)}"
              title="${esc(
                c.config.introVideoTitle ||
                'Presentación VFeria'
              )}"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen>
            </iframe>
          `;

        } else {

          videoWrap.innerHTML =
            '<div class="vf-video-placeholder">Próximamente presentación VFeria.</div>';
        }

        $('#vfIntroVideoTitle')
          .textContent =
            c.config.introVideoTitle ||
            '';

        $('#vfIntroVideoLegend')
          .textContent =
            c.config.introVideoLegend ||
            '';
      }

      /*
       * DESTACADOS
       */
      const featuredResponse =
        await fetch(
          API +
          '?action=getFeaturedContent',
          {
            cache: 'no-store'
          }
        );

      const f =
        await featuredResponse.json();

      if (f.ok) {
        renderFeatured(
          f.items || []
        );
      }

      /*
       * ESTADÍSTICAS PÚBLICAS
       */
      const statsResponse =
        await fetch(
          API +
          '?action=getPublicAnalytics',
          {
            cache: 'no-store'
          }
        );

      const stats =
        await statsResponse.json();

      if (stats.ok) {

        const fmt =
          n =>
            Number(
              n || 0
            ).toLocaleString(
              'es-CL'
            );

        $('#vfStatTotal')
          .textContent =
            fmt(stats.total);

        $('#vfStatToday')
          .textContent =
            fmt(stats.today);

        $('#vfStatBusinesses')
          .textContent =
            fmt(stats.businesses);
      }

    } catch (e) {

      console.warn(
        'VFeria index:',
        e
      );
    }
  }

  function renderPromoBanners(items) {

    const valid =
      (items || [])
        .filter(
          x =>
            x &&
            x.imageUrl &&
            x.active !== false
        )
        .sort(
          (a, b) =>
            Number(a.order || 0) -
            Number(b.order || 0)
        );

    const wrap =
      $('#vfPromoBanner');

    if (!wrap) return;

    if (!valid.length) {

      wrap.hidden = true;

      return;
    }

    wrap.hidden = false;

    const img =
      $('#vfPromoBannerImage');

    const link =
      $('#vfPromoBannerLink');

    const dots =
      $('#vfPromoDots');

    let i = 0;

    dots.innerHTML =
      valid
        .map(
          (_, n) =>
            `<span class="${
              n === 0
                ? 'active'
                : ''
            }"></span>`
        )
        .join('');

    function show(n) {

      i =
        (n + valid.length) %
        valid.length;

      img.src =
        valid[i].imageUrl;

      img.alt =
        valid[i].alt ||
        'Promoción VFeria';

      if (valid[i].link) {

        link.href =
          valid[i].link;

        link.style.pointerEvents =
          'auto';

      } else {

        link.removeAttribute(
          'href'
        );

        link.style.pointerEvents =
          'none';
      }

      dots
        .querySelectorAll(
          'span'
        )
        .forEach(
          (d, k) =>
            d.classList.toggle(
              'active',
              k === i
            )
        );
    }

    show(0);

    if (valid.length > 1) {

      setInterval(
        () =>
          show(i + 1),
        5000
      );
    }
  }

  function renderFeatured(items) {

    const track =
      $('#vfFeaturedTrack');

    if (!track) return;

    if (!items.length) {

      track.innerHTML = `
        <div class="vf-featured-empty">
          Próximamente encontrarás productos estrella y cupones destacados.
        </div>
      `;

      return;
    }

    track.innerHTML =
      items
        .map(x => {

          const isCoupon =
            x.type === 'coupon';

          const typeLabel =
            isCoupon
              ? 'CUPÓN DE DESCUENTO'
              : (
                  x.productType ===
                  'servicio'
                    ? '⭐ SERVICIO DESTACADO'
                    : '⭐ PRODUCTO ESTRELLA'
                );

          const name =
            x.name ||
            (
              isCoupon
                ? 'Cupón de ' +
                  x.businessName
                : x.businessName
            );

          const price =
            !isCoupon &&
            Number.isFinite(
              Number(x.price)
            )
              ? `
                <strong class="vf-featured-price">
                  ${money(x.price)}
                </strong>
              `
              : '';

          return `
            <a
              class="vf-featured-card"
              href="productos.html?tienda=${encodeURIComponent(
                x.businessId
              )}"
              aria-label="${esc(
                typeLabel +
                ' de ' +
                x.businessName
              )}"
            >

              <div class="vf-featured-image">

                <img
                  src="${esc(
                    x.imageUrl || ''
                  )}"
                  alt="${esc(name)}"
                  loading="lazy">

              </div>

              <div class="vf-featured-copy">

                <small>
                  ${esc(typeLabel)}
                </small>

                <strong>
                  ${esc(name)}
                </strong>

                ${price}

                <span>
                  ${esc(
                    x.businessName
                  )}
                </span>

              </div>

            </a>
          `;
        })
        .join('');

    let offset = 0;

    const tick = () => {

      const max =
        Math.max(
          0,
          track.scrollWidth -
          track.parentElement.clientWidth
        );

      if (max <= 0) {

        track.style.transform =
          'translateX(0)';

        requestAnimationFrame(
          tick
        );

        return;
      }

      offset += 0.25;

      if (offset >= max) {
        offset = 0;
      }

      track.style.transform =
        `translateX(-${offset}px)`;

      requestAnimationFrame(
        tick
      );
    };

    requestAnimationFrame(
      tick
    );
  }

  document.addEventListener(
    'DOMContentLoaded',
    load
  );

})();