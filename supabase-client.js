const SUPABASE_URL = "https://krpibyzyrxvppkxetsul.supabase.co";
const SUPABASE_KEY = "sb_publishable_e94wFEishOZxkBVOd5BAow_F8ffHEBs";
const AUTH_REDIRECT_URL = "https://quterman.github.io/quiet-todo/login.html";

window.quietTodoConfig = {
  authRedirectUrl: AUTH_REDIRECT_URL,
  appUrl: "./index.html",
  loginUrl: "./login.html",
};

window.quietTodoSupabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
