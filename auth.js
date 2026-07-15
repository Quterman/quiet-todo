const supabaseClient = window.quietTodoSupabase;
const authRedirectUrl = window.quietTodoConfig.authRedirectUrl;
const appUrl = window.quietTodoConfig.appUrl;

const pageTitle = document.querySelector("#auth-page-title");
const pageCopy = document.querySelector("#auth-page-copy");
const modeTabs = document.querySelector("#auth-mode-tabs");
const modeButtons = Array.from(document.querySelectorAll("[data-auth-mode]"));
const loginForm = document.querySelector("#login-form");
const emailField = document.querySelector("#auth-email-field");
const passwordField = document.querySelector("#auth-password-field");
const confirmField = document.querySelector("#auth-confirm-field");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const authPasswordConfirm = document.querySelector("#auth-password-confirm");
const authSubmit = document.querySelector("#auth-submit");
const authForgot = document.querySelector("#auth-forgot");
const authResend = document.querySelector("#auth-resend");
const authBack = document.querySelector("#auth-back");
const authStatus = document.querySelector("#auth-status");

let currentMode = "signin";

const modeContent = {
  signin: {
    title: "Войти в аккаунт",
    copy: "",
    submit: "Войти",
  },
  signup: {
    title: "Создать аккаунт",
    copy: "",
    submit: "Создать аккаунт",
  },
  forgot: {
    title: "Восстановить пароль",
    copy: "Отправим письмо со ссылкой для сброса пароля.",
    submit: "Отправить письмо",
  },
  update: {
    title: "Новый пароль",
    copy: "Придумай новый пароль для аккаунта.",
    submit: "Сохранить пароль",
  },
};

function setAuthStatus(text) {
  authStatus.textContent = text;
  authStatus.hidden = !text;
}

function setBusy(isBusy) {
  authSubmit.disabled = isBusy;
  authForgot.disabled = isBusy;
  authResend.disabled = isBusy;
  authBack.disabled = isBusy;

  for (const button of modeButtons) {
    button.disabled = isBusy;
  }
}

function setMode(mode, { keepStatus = false } = {}) {
  currentMode = modeContent[mode] ? mode : "signin";
  const content = modeContent[currentMode];
  const needsEmail = currentMode !== "update";
  const needsPassword = currentMode !== "forgot";
  const needsConfirm = currentMode === "signup" || currentMode === "update";
  const isAlternativeMode = currentMode === "forgot" || currentMode === "update";

  pageTitle.textContent = content.title;
  pageCopy.textContent = content.copy;
  pageCopy.hidden = !content.copy;
  authSubmit.textContent = content.submit;
  modeTabs.hidden = isAlternativeMode;
  emailField.hidden = !needsEmail;
  passwordField.hidden = !needsPassword;
  confirmField.hidden = !needsConfirm;
  authForgot.hidden = currentMode !== "signin";
  authResend.hidden = true;
  authBack.hidden = !isAlternativeMode;

  authEmail.required = needsEmail;
  authPassword.required = needsPassword;
  authPassword.autocomplete = currentMode === "signin" ? "current-password" : "new-password";
  authPasswordConfirm.required = needsConfirm;

  for (const button of modeButtons) {
    const isActive = button.dataset.authMode === currentMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  if (!keepStatus) {
    setAuthStatus("");
  }

}

function getEmail() {
  const email = authEmail.value.trim();

  if (!email) {
    setAuthStatus("Введи email");
    authEmail.focus();
    return null;
  }

  return email;
}

function getPasswordPair({ requireConfirm = false } = {}) {
  const password = authPassword.value;
  const passwordConfirm = authPasswordConfirm.value;

  if (!password) {
    setAuthStatus("Введи пароль");
    authPassword.focus();
    return null;
  }

  if (password.length < 6) {
    setAuthStatus("Пароль должен быть не короче 6 символов");
    authPassword.focus();
    return null;
  }

  if (requireConfirm && password !== passwordConfirm) {
    setAuthStatus("Пароли не совпадают");
    authPasswordConfirm.focus();
    return null;
  }

  return { password };
}

function getCredentials({ requireConfirm = false } = {}) {
  const email = getEmail();
  const passwordPair = getPasswordPair({ requireConfirm });

  if (!email || !passwordPair) {
    return null;
  }

  return { email, password: passwordPair.password };
}

function getUrlParams() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const searchParams = new URLSearchParams(window.location.search);

  return { hashParams, searchParams };
}

function getAuthErrorMessage(error) {
  if (!error) {
    return "";
  }

  const message = error.message || String(error);

  if (message.includes("Invalid login credentials")) {
    return "Неверный email или пароль";
  }

  if (message.includes("Email not confirmed")) {
    return "Почта ещё не подтверждена. Проверь письмо от Supabase";
  }

  if (message.includes("User already registered")) {
    return "Такой аккаунт уже есть. Попробуй войти";
  }

  if (message.includes("rate limit")) {
    return "Слишком много писем подряд. Подожди немного и попробуй снова";
  }

  return message;
}

function showUrlMessage() {
  const { hashParams, searchParams } = getUrlParams();
  const errorDescription =
    hashParams.get("error_description") || searchParams.get("error_description");
  const modeFromHash = hashParams.get("type") || searchParams.get("type");

  if (errorDescription) {
    setAuthStatus(errorDescription.replaceAll("+", " "));
    return false;
  }

  if (modeFromHash === "recovery") {
    setMode("update", { keepStatus: true });
    setAuthStatus("Ссылка подтверждена. Теперь можно задать новый пароль");
    return true;
  }

  return false;
}

async function initializeAuthPage() {
  if (!supabaseClient) {
    setAuthStatus("Supabase не загрузился. Обнови страницу");
    return;
  }

  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      setMode("update", { keepStatus: true });
      setAuthStatus("Ссылка подтверждена. Теперь можно задать новый пароль");
    }
  });

  const isRecoveryFlow = showUrlMessage();
  const { data } = await supabaseClient.auth.getSession();

  if (data.session && !isRecoveryFlow && currentMode !== "update") {
    window.location.href = appUrl;
  }
}

async function signIn() {
  const credentials = getCredentials();

  if (!credentials || !supabaseClient) {
    return;
  }

  setBusy(true);
  setAuthStatus("Вхожу...");
  const { error } = await supabaseClient.auth.signInWithPassword(credentials);
  setBusy(false);

  if (error) {
    setAuthStatus(`Не получилось войти: ${getAuthErrorMessage(error)}`);
    return;
  }

  window.location.href = appUrl;
}

async function signUp() {
  const credentials = getCredentials({ requireConfirm: true });

  if (!credentials || !supabaseClient) {
    return;
  }

  setBusy(true);
  setAuthStatus("Создаю аккаунт...");
  const { data, error } = await supabaseClient.auth.signUp({
    ...credentials,
    options: {
      emailRedirectTo: authRedirectUrl,
    },
  });
  setBusy(false);

  if (error) {
    setAuthStatus(`Не получилось создать аккаунт: ${getAuthErrorMessage(error)}`);
    return;
  }

  if (data.session) {
    window.location.href = appUrl;
    return;
  }

  authResend.hidden = false;
  setAuthStatus("Проверь почту и подтверди регистрацию");
}

async function sendPasswordReset() {
  const email = getEmail();

  if (!email || !supabaseClient) {
    return;
  }

  setBusy(true);
  setAuthStatus("Отправляю письмо...");
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl,
  });
  setBusy(false);

  if (error) {
    setAuthStatus(`Не получилось отправить письмо: ${getAuthErrorMessage(error)}`);
    return;
  }

  setAuthStatus("Письмо отправлено. Открой свежую ссылку из почты");
}

async function updatePassword() {
  const passwordPair = getPasswordPair({ requireConfirm: true });

  if (!passwordPair || !supabaseClient) {
    return;
  }

  setBusy(true);
  setAuthStatus("Сохраняю новый пароль...");
  const { error } = await supabaseClient.auth.updateUser({
    password: passwordPair.password,
  });
  setBusy(false);

  if (error) {
    setAuthStatus(`Не получилось сохранить пароль: ${getAuthErrorMessage(error)}`);
    return;
  }

  setAuthStatus("Пароль обновлён. Теперь можно войти с новым паролем");
}

async function resendConfirmation() {
  const email = getEmail();

  if (!email || !supabaseClient) {
    return;
  }

  setBusy(true);
  setAuthStatus("Отправляю письмо подтверждения...");
  const { error } = await supabaseClient.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: authRedirectUrl,
    },
  });
  setBusy(false);

  if (error) {
    setAuthStatus(`Не получилось отправить письмо: ${getAuthErrorMessage(error)}`);
    return;
  }

  setAuthStatus("Письмо отправлено. Используй самую свежую ссылку");
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (currentMode === "signup") {
    signUp();
    return;
  }

  if (currentMode === "forgot") {
    sendPasswordReset();
    return;
  }

  if (currentMode === "update") {
    updatePassword();
    return;
  }

  signIn();
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    setMode(button.dataset.authMode);
  });
}

authForgot.addEventListener("click", () => {
  setMode("forgot");
});

authBack.addEventListener("click", () => {
  setMode("signin");
});

authResend.addEventListener("click", () => {
  resendConfirmation();
});

setMode("signin");
initializeAuthPage();
