
(() => {
  const API_URL =
    'https://script.google.com/macros/s/AKfycbzdKI-wK6Ao08bjpRhH_M_yDeFA7CgnMJuLtrUnIqiEGWYxnzhDWiqZtmYtvShytZE-lQ/exec';

  const TOKEN_KEY = 'vferia_api_token';
  const USER_KEY = 'vferia_api_user';

  const form = document.querySelector('#createUserForm');
  const message = document.querySelector('#adminMessage');
  const button = document.querySelector('#createButton');

  async function api(action, payload = {}) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error('HTTP_' + response.status);
    }

    return response.json();
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? '#b42318' : '';
  }

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

      if (String(result.user.role).toLowerCase() !== 'admin') {
        document.querySelector('main').textContent =
          'Acceso denegado. Esta página es exclusiva para administradores.';
        return;
      }

      form.hidden = false;
    } catch (error) {
      console.error(error);
      showMessage(
        'No se pudo verificar la sesión. Comprueba la conexión con la API.',
        true
      );
    }
  }

  form.hidden = true;

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      location.replace('login.html');
      return;
    }

    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    const businessName = form.elements.businessName.value.trim();

    button.disabled = true;
    showMessage('Creando cuenta…');

    try {
      const result = await api('adminCreateEntrepreneur', {
        token,
        username,
        password,
        businessName,
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        city: form.elements.city.value.trim()
      });

      if (!result || !result.ok) {
        const errors = {
          UNAUTHORIZED: 'Tu sesión ha expirado. Vuelve a iniciar sesión.',
          FORBIDDEN: 'No tienes permisos para crear cuentas.',
          INVALID_USERNAME: 'El nombre de usuario no es válido.',
          PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 14 caracteres.',
          INVALID_BUSINESS_NAME: 'El nombre del emprendimiento no es válido.',
          USERNAME_EXISTS: 'Ese nombre de usuario ya está registrado.'
        };

        showMessage(
          errors[result && result.error] ||
          'No se pudo crear la cuenta. Código: ' +
          (result && result.error || 'ERROR_DESCONOCIDO'),
          true
        );
        return;
      }

      showMessage(
        'Cuenta creada correctamente: ' + result.user.username
      );
      form.reset();
    } catch (error) {
      console.error(error);
      showMessage(
        'Error de conexión. No se pudo confirmar la creación de la cuenta.',
        true
      );
    } finally {
      button.disabled = false;
    }
  });

  init();
})();
