const supabaseClient = window.quietTodoSupabase;
const authRedirectUrl = window.quietTodoConfig.authRedirectUrl;
const appUrl = window.quietTodoConfig.appUrl;

const loginForm = document.querySelector("#login-form");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authSignup = document.querySelector("#auth-signup");
const authResend = document.querySelector("#auth-resend");
const authStatus = document.querySelector("#auth-status");

function setAuthStatus(text) {
  authStatus.textContent = text;
}

function getCredentials({ requirePassword = true } = {}) {
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email) {
    setAuthStatus("Введи email");
    authEmail.focus();
    return null;
  }

  if (requirePassword && !password) {
    setAuthStatus("Введи пароль");
    authPassword.focus();
    return null;
  }

  return { email, password };
}

function showUrlMessage() {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  const errorDescription = params.get("error_description");

  if (errorDescription) {
    setAuthStatus(errorDescription.replaceAll("+", " "));
    return;
  }

  if (params.has("access_token") || params.has("refresh_token")) {
    setAuthStatus("Почта подтверждена. Сейчас открою список.");
  }
}

async function initializeAuthPage() {
  if (!supabaseClient) {
    setAuthStatus("Supabase не загрузился. Обнови страницу");
    return;
  }

  showUrlMessage();
  const { data } = await supabaseClient.auth.getSession();

  if (data.session) {
    window.location.href = appUrl;
  }
}

async function signIn() {
  const credentials = getCredentials();

  if (!credentials || !supabaseClient) {
    return;
  }

  setAuthStatus("Вхожу...");
  const { error } = await supabaseClient.auth.signInWithPassword(credentials);

  if (error) {
    setAuthStatus(`Не получилось войти: ${error.message}`);
    return;
  }

  window.location.href = appUrl;
}

async function signUp() {
  const credentials = getCredentials();

  if (!credentials || !supabaseClient) {
    return;
  }

  setAuthStatus("Создаю аккаунт...");
  const { data, error } = await supabaseClient.auth.signUp({
    ...credentials,
    options: {
      emailRedirectTo: authRedirectUrl,
    },
  });

  if (error) {
    setAuthStatus(`Не получилось создать аккаунт: ${error.message}`);
    return;
  }

  if (data.session) {
    window.location.href = appUrl;
    return;
  }

  setAuthStatus("Проверь почту и подтверди регистрацию");
}

async function resendConfirmation() {
  const credentials = getCredentials({ requirePassword: false });

  if (!credentials || !supabaseClient) {
    return;
  }

  setAuthStatus("Отправляю письмо подтверждения...");
  const { error } = await supabaseClient.auth.resend({
    type: "signup",
    email: credentials.email,
    options: {
      emailRedirectTo: authRedirectUrl,
    },
  });

  if (error) {
    setAuthStatus(`Не получилось отправить письмо: ${error.message}`);
    return;
  }

  setAuthStatus("Письмо отправлено. Используй самую свежую ссылку");
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  signIn();
});

authSignup.addEventListener("click", () => {
  signUp();
});

authResend.addEventListener("click", () => {
  resendConfirmation();
});

initializeAuthPage();
