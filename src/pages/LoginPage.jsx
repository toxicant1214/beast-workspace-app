import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./LoginPage.css";

function LoginPage({ mode = "login", onPasswordSet }) {
  const isPasswordSetup = mode === "set-password";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleLogin(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage("請輸入 Email 與密碼。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("登入失敗：", error);

      if (error?.message === "Invalid login credentials") {
        setErrorMessage("Email 或密碼不正確。");
      } else {
        setErrorMessage(error?.message || "登入失敗，請稍後再試。");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordSetup(event) {
    event.preventDefault();

    if (password.length < 8) {
      setErrorMessage("密碼至少需要 8 個字元。");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("兩次輸入的密碼不一致。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setSuccessMessage("密碼設定完成，正在進入 Workspace…");

      window.setTimeout(() => {
        onPasswordSet?.();
      }, 500);
    } catch (error) {
      console.error("設定密碼失敗：", error);
      setErrorMessage(error?.message || "設定密碼失敗，請重新開啟邀請信再試一次。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-card__brand">
          <p>BEAST WORKSPACE</p>
          <h1>{isPasswordSetup ? "設定登入密碼" : "歡迎回來"}</h1>
          <span>
            {isPasswordSetup
              ? "請設定之後登入 Workspace 使用的密碼"
              : "登入後進入你的工作空間"}
          </span>
        </div>

        <form
          className="login-form"
          onSubmit={isPasswordSetup ? handlePasswordSetup : handleLogin}
        >
          {!isPasswordSetup && (
            <label className="login-form__field">
              <span>Email</span>

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="請輸入登入信箱"
                autoComplete="email"
                autoFocus
              />
            </label>
          )}

          <label className="login-form__field">
            <span>{isPasswordSetup ? "設定密碼" : "密碼"}</span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                isPasswordSetup ? "請輸入至少 8 個字元" : "請輸入密碼"
              }
              autoComplete={
                isPasswordSetup ? "new-password" : "current-password"
              }
              autoFocus={isPasswordSetup}
            />
          </label>

          {isPasswordSetup && (
            <label className="login-form__field">
              <span>再次輸入密碼</span>

              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="請再次輸入相同密碼"
                autoComplete="new-password"
              />
            </label>
          )}

          {errorMessage && (
            <div className="login-form__error">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="login-form__success">{successMessage}</div>
          )}

          <button
            type="submit"
            className="login-form__submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isPasswordSetup
                ? "設定中…"
                : "登入中…"
              : isPasswordSetup
              ? "完成密碼設定"
              : "登入"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;
