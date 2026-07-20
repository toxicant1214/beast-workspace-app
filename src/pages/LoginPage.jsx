import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./LoginPage.css";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage("請輸入 Email 與密碼。");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

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

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-card__brand">
          <p>BEAST WORKSPACE</p>
          <h1>歡迎回來</h1>
          <span>登入後進入你的工作空間</span>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
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

          <label className="login-form__field">
            <span>密碼</span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="請輸入密碼"
              autoComplete="current-password"
            />
          </label>

          {errorMessage && (
            <div className="login-form__error">{errorMessage}</div>
          )}

          <button
            type="submit"
            className="login-form__submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "登入中…" : "登入"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;