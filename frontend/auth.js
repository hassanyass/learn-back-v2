(function () {
  'use strict';

  // ── Constants ───────────────────────────────────────────────
  var API_BASE = (function () {
    try {
      return (window.localStorage.getItem('learnback_api_base_url') || 'http://127.0.0.1:8000').replace(/\/+$/, '');
    } catch (_) {
      return 'http://127.0.0.1:8000';
    }
  })();

  var TOKEN_KEY = 'learnback_token';
  var USER_KEY = 'learnback_user';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ── DOM References ──────────────────────────────────────────
  var loginView = document.getElementById('login-view');
  var registerView = document.getElementById('register-view');

  var loginForm = document.getElementById('login-form');
  var registerForm = document.getElementById('register-form');

  var loginSubmit = document.getElementById('login-submit');
  var registerSubmit = document.getElementById('register-submit');

  var loginError = document.getElementById('login-error');
  var loginErrorText = document.getElementById('login-error-text');
  var registerError = document.getElementById('register-error');
  var registerErrorText = document.getElementById('register-error-text');
  var registerSuccess = document.getElementById('register-success');

  var showRegisterLink = document.getElementById('show-register');
  var showLoginLink = document.getElementById('show-login');

  // ── View Toggle ─────────────────────────────────────────────
  function showView(view) {
    loginView.classList.toggle('is-active', view === 'login');
    registerView.classList.toggle('is-active', view === 'register');
    hideAllBanners();
    clearAllValidation();
  }

  showRegisterLink.addEventListener('click', function (e) {
    e.preventDefault();
    showView('register');
  });

  showLoginLink.addEventListener('click', function (e) {
    e.preventDefault();
    showView('login');
  });

  // ── Helpers ─────────────────────────────────────────────────
  function hideAllBanners() {
    loginError.classList.remove('visible');
    registerError.classList.remove('visible');
    registerSuccess.classList.remove('visible');
  }

  function clearAllValidation() {
    document.querySelectorAll('.auth-field__input').forEach(function (el) {
      el.classList.remove('is-invalid');
    });
    document.querySelectorAll('.auth-field__error').forEach(function (el) {
      el.classList.remove('visible');
      el.textContent = '';
    });
  }

  function showFieldError(inputId, errorId, message) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) input.classList.add('is-invalid');
    if (error) {
      error.textContent = message;
      error.classList.add('visible');
    }
  }

  function setLoading(button, loading) {
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
  }

  function storeAuth(token, user) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (_) { /* ignore */ }
  }

  // ── API Calls ───────────────────────────────────────────────
  async function apiPost(path, body) {
    var response = await fetch(API_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    var payload = null;
    var contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') !== -1) {
      payload = await response.json().catch(function () { return null; });
    }

    if (!response.ok) {
      var message = 'Something went wrong.';
      if (payload) {
        if (typeof payload.detail === 'string') {
          message = payload.detail;
        } else if (Array.isArray(payload.detail) && payload.detail.length > 0) {
          // Pydantic validation errors
          message = payload.detail.map(function (e) { return e.msg || e.message || JSON.stringify(e); }).join('; ');
        }
      }
      var err = new Error(message);
      err.status = response.status;
      throw err;
    }

    return payload;
  }

  // ── Login ───────────────────────────────────────────────────
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAllBanners();
    clearAllValidation();

    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var valid = true;

    if (!email || !EMAIL_RE.test(email)) {
      showFieldError('login-email', 'login-email-error', 'Please enter a valid email');
      valid = false;
    }
    if (!password) {
      showFieldError('login-password', 'login-password-error', 'Password is required');
      valid = false;
    }
    if (!valid) return;

    setLoading(loginSubmit, true);

    try {
      var data = await apiPost('/api/auth/login', { email: email, password: password });
      storeAuth(data.access_token, { user_id: data.user_id, username: data.username });
      window.location.href = 'dashboard.html';
    } catch (err) {
      loginErrorText.textContent = err.message;
      loginError.classList.add('visible');
    } finally {
      setLoading(loginSubmit, false);
    }
  });

  // ── Register ────────────────────────────────────────────────
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideAllBanners();
    clearAllValidation();

    var username = document.getElementById('register-username').value.trim();
    var email = document.getElementById('register-email').value.trim();
    var password = document.getElementById('register-password').value;
    var valid = true;

    if (!username) {
      showFieldError('register-username', 'register-username-error', 'Username is required');
      valid = false;
    }
    if (!email || !EMAIL_RE.test(email)) {
      showFieldError('register-email', 'register-email-error', 'Please enter a valid email');
      valid = false;
    }
    if (!password || password.length < 8) {
      showFieldError('register-password', 'register-password-error', 'Must be at least 8 characters');
      valid = false;
    }
    if (!valid) return;

    setLoading(registerSubmit, true);

    try {
      // 1. Register
      await apiPost('/api/auth/register', { email: email, username: username, password: password });

      // 2. Show success, then auto-login
      registerSuccess.classList.add('visible');

      var loginData = await apiPost('/api/auth/login', { email: email, password: password });
      storeAuth(loginData.access_token, { user_id: loginData.user_id, username: loginData.username });

      // Brief pause to show success message
      setTimeout(function () {
        window.location.href = 'dashboard.html';
      }, 800);
    } catch (err) {
      registerSuccess.classList.remove('visible');
      registerErrorText.textContent = err.message;
      registerError.classList.add('visible');
    } finally {
      setLoading(registerSubmit, false);
    }
  });

  // ── If already logged in, redirect ──────────────────────────
  try {
    if (window.localStorage.getItem(TOKEN_KEY)) {
      window.location.href = 'dashboard.html';
    }
  } catch (_) { /* ignore */ }
})();
