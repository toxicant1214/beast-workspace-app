import {
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import "./LoginPage.css";


function LoginPage({
  mode = "login",
  onPasswordSet,
}) {
  const isPasswordSetup =
    mode === "set-password";


  const [loginId, setLoginId] =
    useState("");


  const [password, setPassword] =
    useState("");


  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");


  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);


  const [
    isPreparingSession,
    setIsPreparingSession,
  ] = useState(
    isPasswordSetup
  );


  const [
    passwordSessionReady,
    setPasswordSessionReady,
  ] = useState(
    !isPasswordSetup
  );


  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");


  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");



  useEffect(() => {
    if (!isPasswordSetup) {
      return;
    }


    preparePasswordSession();
  }, [isPasswordSetup]);



  async function preparePasswordSession() {
    try {
      setIsPreparingSession(true);
      setPasswordSessionReady(false);
      setErrorMessage("");


      /*
       * 先確認 Supabase 是否已經自動
       * 從邀請網址建立 session。
       */
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();


      if (sessionError) {
        throw sessionError;
      }


      if (sessionData?.session) {
        setPasswordSessionReady(true);
        return;
      }


      /*
       * 如果目前沒有 session，
       * 再檢查邀請網址是否帶有
       * PKCE auth code。
       */
      const url =
        new URL(
          window.location.href
        );


      const code =
        url.searchParams.get("code");


      if (code) {
        const {
          data,
          error,
        } =
          await supabase.auth
            .exchangeCodeForSession(
              code
            );


        if (error) {
          throw error;
        }


        if (!data?.session) {
          throw new Error(
            "邀請連結無法建立登入狀態。"
          );
        }


        /*
         * code 只能使用一次。
         * 成功交換後把網址中的 code 清掉，
         * 避免重新整理時再次交換。
         */
        url.searchParams.delete("code");


        window.history.replaceState(
          {},
          document.title,
          `${url.pathname}${url.search}${url.hash}`
        );


        setPasswordSessionReady(true);
        return;
      }


      /*
       * 如果是舊式 implicit flow，
       * Supabase 通常會自己從網址 hash
       * 恢復 session。
       * 稍等一下再確認一次。
       */
      await new Promise(
        (resolve) =>
          window.setTimeout(
            resolve,
            300
          )
      );


      const {
        data: retryData,
        error: retryError,
      } =
        await supabase.auth.getSession();


      if (retryError) {
        throw retryError;
      }


      if (retryData?.session) {
        setPasswordSessionReady(true);
        return;
      }


      throw new Error(
        "找不到有效的邀請登入狀態。"
      );
    } catch (error) {
      console.error(
        "建立邀請登入狀態失敗：",
        error
      );


      setPasswordSessionReady(false);


      setErrorMessage(
        "邀請連結已失效，或登入狀態沒有正確建立。請重新開啟最新的邀請信；如果仍然出現這個訊息，請聯絡管理員重新寄送邀請。"
      );
    } finally {
      setIsPreparingSession(false);
    }
  }



  async function handleLogin(
    event
  ) {
    event.preventDefault();


    if (
      !loginId.trim() ||
      !password
    ) {
      setErrorMessage(
        "請輸入登入帳號或 Email 與密碼。"
      );

      return;
    }


    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");


      const cleanLoginId =
        loginId.trim();

      /*
       * 老師維持原本 Email 登入。
       * Viewer 則輸入管理員建立的 username，
       * 前端只在登入時轉成系統內部 Email。
       */
      const loginEmail =
        cleanLoginId.includes("@")
          ? cleanLoginId
          : `${cleanLoginId.toLowerCase()}@viewer.beast.local`;

      const { error } =
        await supabase.auth
          .signInWithPassword({
            email: loginEmail,
            password,
          });


      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(
        "登入失敗：",
        error
      );


      if (
        error?.message ===
        "Invalid login credentials"
      ) {
        setErrorMessage(
          "登入帳號／Email 或密碼不正確。"
        );
      } else {
        setErrorMessage(
          error?.message ||
            "登入失敗，請稍後再試。"
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }



  async function handlePasswordSetup(
    event
  ) {
    event.preventDefault();


    if (!passwordSessionReady) {
      setErrorMessage(
        "邀請登入狀態尚未建立，請重新開啟邀請信後再試一次。"
      );

      return;
    }


    if (password.length < 8) {
      setErrorMessage(
        "密碼至少需要 8 個字元。"
      );

      return;
    }


    if (
      password !==
      confirmPassword
    ) {
      setErrorMessage(
        "兩次輸入的密碼不一致。"
      );

      return;
    }


    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");


      const { error } =
        await supabase.auth.updateUser({
          password,
        });


      if (error) {
        throw error;
      }


      setSuccessMessage(
        "密碼設定完成，正在進入 Workspace…"
      );


      window.setTimeout(() => {
        onPasswordSet?.();
      }, 500);
    } catch (error) {
      console.error(
        "設定密碼失敗：",
        error
      );


      if (
        error?.message ===
        "Auth session missing!"
      ) {
        setErrorMessage(
          "邀請登入狀態已失效，請重新開啟最新的邀請信再試一次。"
        );
      } else {
        setErrorMessage(
          error?.message ||
            "設定密碼失敗，請重新開啟邀請信再試一次。"
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }



  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-card__brand">
          <p>
            BEAST WORKSPACE
          </p>


          <h1>
            {isPasswordSetup
              ? "設定登入密碼"
              : "歡迎回來"}
          </h1>


          <span>
            {isPasswordSetup
              ? "請設定之後登入 Workspace 使用的密碼"
              : "登入後進入你的工作空間"}
          </span>
        </div>


        <form
          className="login-form"
          onSubmit={
            isPasswordSetup
              ? handlePasswordSetup
              : handleLogin
          }
        >
          {!isPasswordSetup && (
            <label className="login-form__field">
              <span>
                登入帳號 / Email
              </span>


              <input
                type="text"
                value={loginId}
                onChange={(
                  event
                ) =>
                  setLoginId(
                    event.target.value
                  )
                }
                placeholder="老師輸入 Email；檢視帳號輸入帳號"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                autoFocus
              />
            </label>
          )}


          {isPasswordSetup &&
            isPreparingSession && (
              <div className="login-form__success">
                正在確認邀請連結……
              </div>
            )}


          <label className="login-form__field">
            <span>
              {isPasswordSetup
                ? "設定密碼"
                : "密碼"}
            </span>


            <input
              type="password"
              value={password}
              onChange={(
                event
              ) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder={
                isPasswordSetup
                  ? "請輸入至少 8 個字元"
                  : "請輸入密碼"
              }
              autoComplete={
                isPasswordSetup
                  ? "new-password"
                  : "current-password"
              }
              autoFocus={
                isPasswordSetup
              }
              disabled={
                isPasswordSetup &&
                (
                  isPreparingSession ||
                  !passwordSessionReady
                )
              }
            />
          </label>


          {isPasswordSetup && (
            <label className="login-form__field">
              <span>
                再次輸入密碼
              </span>


              <input
                type="password"
                value={
                  confirmPassword
                }
                onChange={(
                  event
                ) =>
                  setConfirmPassword(
                    event.target.value
                  )
                }
                placeholder="請再次輸入相同密碼"
                autoComplete="new-password"
                disabled={
                  isPreparingSession ||
                  !passwordSessionReady
                }
              />
            </label>
          )}


          {errorMessage && (
            <div className="login-form__error">
              {errorMessage}
            </div>
          )}


          {successMessage && (
            <div className="login-form__success">
              {successMessage}
            </div>
          )}


          <button
            type="submit"
            className="login-form__submit"
            disabled={
              isSubmitting ||
              (
                isPasswordSetup &&
                (
                  isPreparingSession ||
                  !passwordSessionReady
                )
              )
            }
          >
            {isSubmitting
              ? isPasswordSetup
                ? "設定中…"
                : "登入中…"
              : isPasswordSetup
                ? isPreparingSession
                  ? "確認邀請中…"
                  : "完成密碼設定"
                : "登入"}
          </button>
        </form>
      </section>
    </main>
  );
}


export default LoginPage;