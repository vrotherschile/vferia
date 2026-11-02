
(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';

  const TOKEN_KEY = 'vferia_api_token';
  const USER_KEY = 'vferia_api_user';

  const form = document.querySelector('#adminCreateForm');
  const status = document.querySelector('#status');
  const button = document.querySelector('#createButton');
  const checking = document.querySelector('#checkingMessage');
  const pageError = document.querySelector('#pageError');
  const analyticsPanel = document.querySelector('#analyticsPanel');
  const analyticsStatus = document.querySelector('#analyticsStatus');

  if (!form || !status || !button || !checking || !pageError) {
    console.error(
      'VFeria admin: faltan elementos HTML. Comprueba admin.html.'
    );
    return;
  }

  async function api(action, payload = {}) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        ...payload
      }),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error('HTTP_' + response.status);
    }

    return response.json();
  }

  function showStatus(message, type = '') {
    status.textContent = message;
    status.className = type;
  }

  function showPageError(message) {
    pageError.textContent = message;
    pageError.hidden = false;
  }

  function formatNumber(value){return Number(value||0).toLocaleString('es-CL');}
  function fillRanking(id,items){const el=document.getElementById(id);if(!el)return;el.innerHTML='';(items||[]).forEach(item=>{const li=document.createElement('li');li.textContent=(item.name||item.id)+' — '+formatNumber(item.views);el.appendChild(li);});if(!el.children.length){const li=document.createElement('li');li.textContent='Todavía no hay visitas registradas.';el.appendChild(li);}}
  async function loadAnalytics(token){if(analyticsStatus)analyticsStatus.textContent='Actualizando estadísticas…';try{const data=await api('getAdminAnalytics',{token});if(!data||!data.ok)throw new Error(data?.error||'ANALYTICS_UNAVAILABLE');document.getElementById('adminStatTotal').textContent=formatNumber(data.total);document.getElementById('adminStatToday').textContent=formatNumber(data.today);document.getElementById('adminStatMonth').textContent=formatNumber(data.monthly);fillRanking('businessRanking',data.businesses);fillRanking('productRanking',data.products);if(analyticsStatus)analyticsStatus.textContent='Datos actualizados: '+new Date(data.updatedAt).toLocaleString('es-CL');}catch(error){console.error('VFeria analytics:',error);if(analyticsStatus)analyticsStatus.textContent='No se pudieron cargar las estadísticas. Verifica que hayas actualizado Code.gs y desplegado una nueva versión del API.';}}

  async function init() {
    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
      location.replace('login.html');
      return;
    }

    try {
      const result = await api('me', { token });

      if (!result || !result.ok || !result.user) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        location.replace('login.html');
        return;
      }

      if (
        String(result.user.role || '').toLowerCase() !== 'admin'
      ) {
        checking.hidden = true;

        showPageError(
          'Acceso denegado. Esta página es exclusiva para administradores.'
        );

        return;
      }

      sessionStorage.setItem(
        USER_KEY,
        JSON.stringify(result.user)
      );

      checking.hidden = true;
      form.hidden = false;
      if (analyticsPanel) { analyticsPanel.hidden = false; loadAnalytics(token); }
      document.querySelector('#refreshAnalytics')?.addEventListener('click', () => loadAnalytics(token));

    } catch (error) {
      console.error(
        'VFeria admin: error verificando sesión',
        error
      );

      checking.textContent =
        'No se pudo verificar la sesión con la API.';

      showPageError(
        'Comprueba tu conexión. Si el problema continúa, vuelve al inicio de sesión e inténtalo nuevamente.'
      );
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
      location.replace('login.html');
      return;
    }

    const username = form.elements
      .namedItem('username').value.trim();

    const password = form.elements
      .namedItem('password').value;

    const businessName = form.elements
      .namedItem('businessName').value.trim();

    const email = form.elements
      .namedItem('email').value.trim();

    const phone = form.elements
      .namedItem('phone').value.trim();

    const city = form.elements
      .namedItem('city').value.trim();

    if (username.length < 3) {
      showStatus(
        'El nombre de usuario debe tener al menos 3 caracteres.',
        'error'
      );
      return;
    }

    if (password.length < 14) {
      showStatus(
        'La contraseña debe tener al menos 14 caracteres.',
        'error'
      );
      return;
    }

    if (!businessName) {
      showStatus(
        'Ingresa el nombre del emprendimiento.',
        'error'
      );
      return;
    }

    button.disabled = true;
    button.textContent = 'Creando cuenta…';

    showStatus('Enviando solicitud al servidor…');

    try {
      const result = await api('adminCreateEntrepreneur', {
        token,
        username,
        password,
        businessName,
        email,
        phone,
        city
      });

      if (!result || !result.ok) {
        const errors = {
          SESSION_EXPIRED:
            'La sesión expiró. Inicia sesión nuevamente.',
          UNAUTHORIZED:
            'La sesión no está autorizada. Inicia sesión nuevamente.',
          FORBIDDEN:
            'Tu cuenta no tiene permisos de administrador.',
          INVALID_USERNAME:
            'El nombre de usuario no es válido.',
          PASSWORD_TOO_SHORT:
            'La contraseña debe tener al menos 14 caracteres.',
          INVALID_BUSINESS_NAME:
            'Ingresa un nombre de emprendimiento válido.',
          USERNAME_EXISTS:
            'Ese nombre de usuario ya existe.',
          SHEETS_NOT_CONFIGURED:
            'La base de datos no está configurada correctamente.',
          UNKNOWN_ACTION:
            'La API publicada no reconoce esta acción. Revisa la versión de Code.gs.'
        };

        const code = result && result.error;

        showStatus(
          errors[code] ||
          ('No se pudo crear la cuenta. Código: ' +
            (code || 'respuesta inválida')),
          'error'
        );

        return;
      }

      const createdUsername =
        result.user && result.user.username
          ? result.user.username
          : username;

      form.reset();

      showStatus(
        'Cuenta creada correctamente para "' +
          createdUsername +
          '".',
        'success'
      );

    } catch (error) {
      console.error(
        'VFeria admin: error creando cuenta',
        error
      );

      showStatus(
        'No se pudo confirmar la creación por un error de conexión. Antes de volver a intentarlo, revisa la hoja Users para comprobar si la cuenta se alcanzó a crear.',
        'error'
      );

    } finally {
      button.disabled = false;
      button.textContent = 'Crear cuenta';
    }
  });

  init();
})();
