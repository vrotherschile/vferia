
(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';
  const CACHE_KEY = 'vferia_public_catalog_v2';
  const CACHE_TTL = 10 * 60 * 1000;

  const $ = (selector, root = document) => root.querySelector(selector);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);

  const safeUrl = value => {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const money = value => Number(value || 0).toLocaleString('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  });

  const params = new URLSearchParams(location.search);
  const requestedBusinessId = params.get('tienda') || '';

  const searchInput = $('#catalogSearch');
  const businessFilter = $('#businessFilter');
  const sortFilter = $('#sortFilter');
  const grid = $('#catalogGrid');
  const status = $('#catalogStatus');
  const empty = $('#catalogEmpty');
  const clearButton = $('#clearFilters');
  const emptyClearButton = $('#emptyClear');
  const refreshButton = $('#refreshCatalog');

  let businesses = [];
  let allProducts = [];
  let selectedBusinessId = requestedBusinessId;

  async function loadCatalog(forceRefresh = false) {
    status.textContent = 'Cargando catálogo…';

    try {
      let data = null;

      if (!forceRefresh) {
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');

          if (cached && Date.now() - cached.savedAt < CACHE_TTL) {
            data = cached.data;
          }
        } catch {
          // Si la caché no es válida, se consulta la API.
        }
      }

      if (!data) {
        const response = await fetch(`${API_URL}?action=publicCatalog`, {
          method: 'GET',
          cache: 'no-store'
        });

        if (!response.ok) throw new Error('HTTP_' + response.status);

        data = await response.json();

        if (!data?.ok || !Array.isArray(data.businesses)) {
          throw new Error(data?.error || 'CATALOG_UNAVAILABLE');
        }

        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            data
          }));
        } catch {
          // El catálogo sigue funcionando si el navegador no permite caché.
        }
      }

      businesses = data.businesses || [];
      allProducts = businesses.flatMap(business =>
        (business.products || []).map(product => ({
          ...product,
          businessId: product.businessId || business.businessId,
          businessName: business.businessName || 'Emprendimiento',
          businessCategory: business.category || '',
          businessCity: business.city || '',
          businessLogo: business.logoUrl || ''
        }))
      );

      populateBusinessFilter();
      applyInitialBusinessFilter();
      render();

    } catch (error) {
      console.error('Error al cargar catálogo VFeria:', error);
      status.textContent = 'No se pudo cargar el catálogo. Intenta actualizarlo.';
      grid.innerHTML = '';
      empty.hidden = false;
    }
  }

  function populateBusinessFilter() {
    if (!businessFilter) return;

    businessFilter.innerHTML =
      '<option value="">Todos los emprendimientos</option>';

    businesses.forEach(business => {
      const option = document.createElement('option');
      option.value = business.businessId;
      option.textContent = business.businessName || 'Emprendimiento';
      businessFilter.appendChild(option);
    });
  }

  function applyInitialBusinessFilter() {
    if (!businessFilter || !requestedBusinessId) return;

    const exists = businesses.some(
      business => String(business.businessId) === String(requestedBusinessId)
    );

    if (exists) {
      selectedBusinessId = requestedBusinessId;
      businessFilter.value = requestedBusinessId;
    } else {
      selectedBusinessId = '';
      businessFilter.value = '';
      status.textContent = 'La tienda solicitada no está publicada o no existe.';
    }
  }

  function render() {
    const query = String(searchInput?.value || '').trim().toLowerCase();

    let filtered = allProducts.filter(product => {
      const matchesBusiness = !selectedBusinessId ||
        String(product.businessId) === String(selectedBusinessId);

      const searchable = [
        product.name,
        product.description,
        product.businessName,
        product.businessCategory,
        product.businessCity
      ].join(' ').toLowerCase();

      return matchesBusiness && searchable.includes(query);
    });

    const sort = sortFilter?.value || 'relevance';

    if (sort === 'name') {
      filtered.sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'es')
      );
    } else if (sort === 'priceAsc') {
      filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sort === 'priceDesc') {
      filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }

    grid.innerHTML = filtered.map(product => {
      const image = safeUrl(product.imageUrl);
      const paymentUrl = safeUrl(product.paymentLink);
      const saleUrl = safeUrl(product.link);
      const socialUrl = safeUrl(product.social);

      const contactUrl = saleUrl || socialUrl;

      return `
        <article class="catalog-product">
          <div class="catalog-product-image-wrap">
            ${image
              ? `<img class="catalog-product-image"
                     src="${esc(image)}"
                     alt="${esc(product.name || 'Producto')}"
                     loading="lazy">`
              : '<div class="catalog-product-placeholder">Imagen del producto</div>'}
          </div>

          <div class="catalog-product-body">
            <span class="catalog-business-name">${esc(product.businessName)}</span>
            <h2>${esc(product.name || 'Producto')}</h2>
            <strong class="catalog-price">${money(product.price)}</strong>
            <p>${esc(product.description || 'Consulta los detalles de este producto.')}</p>

            <div class="catalog-product-actions">
              ${paymentUrl
                ? `<a class="btn btn-primary"
                      href="${esc(paymentUrl)}"
                      target="_blank"
                      rel="noopener noreferrer nofollow">
                     Pagar en línea ↗
                   </a>`
                : ''}

              ${contactUrl
                ? `<a class="btn btn-outline"
                      href="${esc(contactUrl)}"
                      target="_blank"
                      rel="noopener noreferrer">
                     Consultar producto ↗
                   </a>`
                : ''}
            </div>
          </div>
        </article>`;
    }).join('');

    if (empty) empty.hidden = filtered.length > 0;

    if (status) {
      status.textContent = `${filtered.length} producto(s) encontrado(s)`;
    }
  }

  function clearFilters() {
    if (searchInput) searchInput.value = '';
    if (sortFilter) sortFilter.value = 'relevance';

    selectedBusinessId = '';
    if (businessFilter) businessFilter.value = '';

    render();

    const url = new URL(location.href);
    url.searchParams.delete('tienda');
    history.replaceState({}, '', url);
  }

  searchInput?.addEventListener('input', render);

  businessFilter?.addEventListener('change', () => {
    selectedBusinessId = businessFilter.value;

    const url = new URL(location.href);

    if (selectedBusinessId) {
      url.searchParams.set('tienda', selectedBusinessId);
    } else {
      url.searchParams.delete('tienda');
    }

    history.replaceState({}, '', url);
    render();
  });

  sortFilter?.addEventListener('change', render);
  clearButton?.addEventListener('click', clearFilters);
  emptyClearButton?.addEventListener('click', clearFilters);
  refreshButton?.addEventListener('click', () => loadCatalog(true));

  loadCatalog();
})();
