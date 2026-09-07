import {
  useEffect,
  useState,
} from "react";

import { supabase } from "../lib/supabase";


function AnnouncementPublicPage({
  token,
}) {
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    announcement,
    setAnnouncement,
  ] = useState(null);

  const [
    receipt,
    setReceipt,
  ] = useState(null);

  const [
    confirming,
    setConfirming,
  ] = useState(false);

  const [
    confirmed,
    setConfirmed,
  ] = useState(false);


  useEffect(() => {
    let isMounted = true;


    async function loadAnnouncement() {
      try {
        setLoading(true);
        setError("");


        if (!token) {
          throw new Error(
            "缺少公告連結識別碼。"
          );
        }


        /*
         * 這裡先保留。
         *
         * 下一步會接我們前面已經完成的
         * 公告 API / RPC。
         *
         * 不直接從瀏覽器查管理資料表，
         * 避免為了公開頁把 RLS 開太大。
         */

        if (isMounted) {
          setAnnouncement(null);
          setReceipt(null);
        }
      } catch (error) {
        console.error(
          "讀取公告失敗：",
          error
        );

        if (isMounted) {
          setError(
            error?.message ||
              "讀取公告失敗。"
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }


    loadAnnouncement();


    return () => {
      isMounted = false;
    };
  }, [token]);


  async function handleConfirm() {
    try {
      setConfirming(true);
      setError("");


      /*
       * 下一步接簽收 API。
       */


      setConfirmed(true);
    } catch (error) {
      console.error(
        "公告簽收失敗：",
        error
      );

      setError(
        error?.message ||
          "簽收失敗，請稍後再試。"
      );
    } finally {
      setConfirming(false);
    }
  }


  if (loading) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <p style={styles.muted}>
            正在讀取公告…
          </p>
        </section>
      </main>
    );
  }


  if (error) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.brand}>
            BEAST Workspace
          </div>

          <h1 style={styles.title}>
            無法開啟公告
          </h1>

          <p style={styles.error}>
            {error}
          </p>
        </section>
      </main>
    );
  }


  /*
   * API 尚未接上以前，
   * 先顯示測試畫面。
   */
  if (!announcement) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.brand}>
            BEAST Workspace
          </div>

          <h1 style={styles.title}>
            公告簽收
          </h1>

          <p style={styles.muted}>
            公告公開頁已成功載入。
          </p>

          <div style={styles.testBox}>
            <div>
              Token
            </div>

            <code style={styles.code}>
              {token}
            </code>
          </div>
        </section>
      </main>
    );
  }


  const isAlreadyConfirmed =
    confirmed ||
    Boolean(receipt?.confirmed_at);


  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}>
          BEAST Workspace
        </div>

        <h1 style={styles.title}>
          {announcement.title}
        </h1>


        {announcement.content && (
          <div style={styles.content}>
            {announcement.content}
          </div>
        )}


        {isAlreadyConfirmed ? (
          <div style={styles.success}>
            ✓ 已完成簽收
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              ...styles.button,
              opacity:
                confirming
                  ? 0.6
                  : 1,
            }}
          >
            {confirming
              ? "簽收中…"
              : "我已閱讀並確認"}
          </button>
        )}
      </section>
    </main>
  );
}


const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f5f1",
    padding: "32px 18px",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    fontFamily:
      '"Iansui", "Noto Sans TC", sans-serif',
  },

  card: {
    width: "100%",
    maxWidth: "640px",
    background: "#ffffff",
    borderRadius: "22px",
    padding: "32px",
    boxSizing: "border-box",
    boxShadow:
      "0 10px 35px rgba(0, 0, 0, 0.06)",
  },

  brand: {
    fontSize: "13px",
    letterSpacing: "0.08em",
    color: "#8b8176",
    marginBottom: "20px",
  },

  title: {
    margin: "0 0 20px",
    fontSize: "26px",
    lineHeight: 1.45,
    color: "#2f352f",
  },

  content: {
    whiteSpace: "pre-wrap",
    fontSize: "16px",
    lineHeight: 1.9,
    color: "#444",
    marginBottom: "28px",
  },

  muted: {
    margin: 0,
    color: "#777",
    lineHeight: 1.7,
  },

  error: {
    margin: 0,
    color: "#a34f47",
    lineHeight: 1.7,
  },

  success: {
    marginTop: "28px",
    padding: "16px",
    borderRadius: "14px",
    background: "#edf5ed",
    color: "#416546",
    textAlign: "center",
    fontWeight: 600,
  },

  button: {
    width: "100%",
    border: 0,
    borderRadius: "14px",
    padding: "16px 20px",
    fontSize: "16px",
    fontFamily: "inherit",
    cursor: "pointer",
    background: "#354438",
    color: "#fff",
  },

  testBox: {
    marginTop: "24px",
    padding: "16px",
    borderRadius: "14px",
    background: "#f5f3ef",
    color: "#777",
    fontSize: "13px",
  },

  code: {
    display: "block",
    marginTop: "8px",
    wordBreak: "break-all",
    color: "#444",
  },
};


export default AnnouncementPublicPage;