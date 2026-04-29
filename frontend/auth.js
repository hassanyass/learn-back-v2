(function () {
  'use strict';
  console.warn("🚨 AUTH.JS HAS SUCCESSFULLY LOADED 🚨");

  // ── Constants ───────────────────────────────────────────────
  var API_BASE = (window.__LEARNBACK_CONFIG__ && window.__LEARNBACK_CONFIG__.API_BASE_URL)
    || 'http://127.0.0.1:8002';

  // Sanitize auth errors — strip technical internals from user-facing messages.
  function sanitizeAuthError(err) {
    var msg = (err.message || '').toLowerCase();
    if (msg.indexOf('email already') !== -1 || msg.indexOf('already registered') !== -1) {
      return 'This email is already registered. Try signing in instead.';
    }
    if (msg.indexOf('invalid credentials') !== -1 || msg.indexOf('incorrect') !== -1 || msg.indexOf('not found') !== -1) {
      return 'Incorrect email or password. Please try again.';
    }
    if (msg.indexOf('network') !== -1 || msg.indexOf('unable to reach') !== -1 || msg.indexOf('failed to fetch') !== -1) {
      return 'Connection problem. Check your internet and try again.';
    }
    if (err.status === 500 || msg.indexOf('internal') !== -1) {
      return 'Something went wrong on our side. Please try again shortly.';
    }
    // For Pydantic or other validation errors, keep the message but truncate if too technical
    if (msg.indexOf('value is not') !== -1 || msg.indexOf('field required') !== -1) {
      return 'Please check your details and try again.';
    }
    // Safe default — use message but cap length
    return err.message && err.message.length < 120 ? err.message : 'Something went wrong. Please try again.';
  }

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

  async function apiGet(path, token) {
    var headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var response = await fetch(API_BASE + path, { method: 'GET', headers: headers });
    if (!response.ok) return null;
    return response.json().catch(function () { return null; });
  }

  // ── Listeners wrapped in DOMContentLoaded ───────────────
  document.addEventListener("DOMContentLoaded", () => {
    console.warn("🟢 DOM fully loaded and parsed (auth)");
    
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');

    if (loginForm) {
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

        var loginSubmit = document.getElementById('login-submit');
        setLoading(loginSubmit, true);

        try {
          console.warn("🟢 Login Button Clicked! Sending request...");
          var data = await apiPost('/auth/login', { email: email, password: password });

          // Fetch real user profile using the freshly issued token
          var me = await apiGet('/auth/me', data.access_token);
          storeAuth(data.access_token, {
            user_id: me && me.user_id ? me.user_id : null,
            username: me && me.username ? me.username : null
          });
          window.location.href = 'dashboard';
        } catch (err) {
          console.error("Login fetch error:", err);
          var loginErrorText = document.getElementById('login-error-text');
          var loginError = document.getElementById('login-error');
          if (loginErrorText) loginErrorText.textContent = sanitizeAuthError(err);
          if (loginError) loginError.classList.add('visible');
        } finally {
          setLoading(loginSubmit, false);
        }
      });
    }

    if (registerForm) {
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

        var registerSubmit = document.getElementById('register-submit');
        setLoading(registerSubmit, true);

        try {
          console.warn("🟢 Register Button Clicked! Sending request...");
          await apiPost('/auth/register', { email: email, username: username, password: password });

          var registerSuccess = document.getElementById('register-success');
          if (registerSuccess) registerSuccess.classList.add('visible');

          var loginData = await apiPost('/auth/login', { email: email, password: password });

          // Fetch real user profile using the freshly issued token
          var me = await apiGet('/auth/me', loginData.access_token);
          storeAuth(loginData.access_token, {
            user_id: me && me.user_id ? me.user_id : null,
            username: me && me.username ? me.username : null
          });

          setTimeout(function () {
            window.location.href = 'dashboard';
          }, 800);
        } catch (err) {
          console.error("Register fetch error:", err);
          var registerSuccess = document.getElementById('register-success');
          var registerErrorText = document.getElementById('register-error-text');
          var registerError = document.getElementById('register-error');
          if (registerSuccess) registerSuccess.classList.remove('visible');
          if (registerErrorText) registerErrorText.textContent = sanitizeAuthError(err);
          if (registerError) registerError.classList.add('visible');
        } finally {
          setLoading(registerSubmit, false);
        }
      });
    }
  });

  // ── If already logged in, redirect to dashboard ──────────────
  // Guard: if we just came back from a failed dashboard redirect (e.g. expired
  // token caused a 401 → back to auth), clear the stale token instead of
  // looping. sessionStorage 'lb_auth_bounce' is set by the 401 redirect path.
  try {
    var hadBounce = window.sessionStorage.getItem('lb_auth_bounce');
    if (hadBounce) {
      window.sessionStorage.removeItem('lb_auth_bounce');
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    } else if (window.localStorage.getItem(TOKEN_KEY)) {
      window.location.href = 'dashboard';
    }
  } catch (_) { /* ignore */ }
})();
