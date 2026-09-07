import {
  useEffect,
  useRef,
  useState,
} from "react";


function formatTaipeiDateTime(
  value
) {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "zh-TW",
      {
        timeZone:
          "Asia/Taipei",
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
        hour:
          "2-digit",
        minute:
          "2-digit",
        hour12:
          false,
      }
    ).format(
      new Date(value)
    );
  } catch {
    return String(value);
  }
}


async function readJsonResponse(
  response
) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}


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
    markingScrollComplete,
    setMarkingScrollComplete,
  ] = useState(false);

  const [
    confirmed,
    setConfirmed,
  ] = useState(false);

  const [
    readingComplete,
    setReadingComplete,
  ] = useState(false);

  const endMarkerRef =
    useRef(null);

  const scrollCompleteSentRef =
    useRef(false);

  const apiBaseUrl =
    import.meta.env
      .VITE_API_BASE_URL;


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


        if (!apiBaseUrl) {
          throw new Error(
            "系統尚未設定公告服務網址。"
          );
        }


        const response =
          await fetch(
            `${apiBaseUrl}/api/announcements/${encodeURIComponent(
              token
            )}`
          );


        const result =
          await readJsonResponse(
            response
          );


        if (
          !response.ok ||
          !result?.success
        ) {
          throw new Error(
            result?.message ||
              "讀取公告失敗。"
          );
        }


        if (!isMounted) {
          return;
        }


        setAnnouncement(
          result.announcement ||
            null
        );

        setReceipt(
          result.recipient ||
            null
        );

        const alreadyConfirmed =
          Boolean(
            result.recipient
              ?.confirmed_at
          );

        const alreadyCompleted =
          Boolean(
            result.recipient
              ?.scroll_completed_at
          );


        setConfirmed(
          alreadyConfirmed
        );

        setReadingComplete(
          alreadyCompleted ||
            alreadyConfirmed
        );

        scrollCompleteSentRef.current =
          alreadyCompleted ||
          alreadyConfirmed;
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
  }, [
    token,
    apiBaseUrl,
  ]);


  useEffect(() => {
    if (
      loading ||
      error ||
      !announcement ||
      confirmed ||
      readingComplete
    ) {
      return undefined;
    }


    const marker =
      endMarkerRef.current;


    if (!marker) {
      return undefined;
    }


    const observer =
      new IntersectionObserver(
        (entries) => {
          const visible =
            entries.some(
              (entry) =>
                entry.isIntersecting
            );

          if (
            visible &&
            !scrollCompleteSentRef
              .current
          ) {
            scrollCompleteSentRef.current =
              true;

            markReadingComplete();
          }
        },
        {
          root: null,
          threshold: 0.9,
        }
      );


    observer.observe(marker);


    return () => {
      observer.disconnect();
    };
  }, [
    loading,
    error,
    announcement,
    confirmed,
    readingComplete,
  ]);


  async function markReadingComplete() {
    if (
      !token ||
      !apiBaseUrl ||
      readingComplete ||
      markingScrollComplete
    ) {
      return;
    }


    try {
      setMarkingScrollComplete(
        true
      );

      const response =
        await fetch(
          `${apiBaseUrl}/api/announcements/${encodeURIComponent(
            token
          )}/scroll-complete`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );


      const result =
        await readJsonResponse(
          response
        );


      if (
        !response.ok ||
        !result?.success
      ) {
        scrollCompleteSentRef.current =
          false;

        throw new Error(
          result?.message ||
            "更新閱讀狀態失敗。"
        );
      }


      setReadingComplete(true);

      setReceipt(
        (current) => ({
          ...(current || {}),
          scroll_completed_at:
            result
              .scroll_completed_at ||
            new Date()
              .toISOString(),
        })
      );
    } catch (error) {
      console.error(
        "更新公告閱讀狀態失敗：",
        error
      );

      setError(
        error?.message ||
          "更新閱讀狀態失敗，請稍後再試。"
      );
    } finally {
      setMarkingScrollComplete(
        false
      );
    }
  }


  async function handleConfirm() {
    try {
      setConfirming(true);
      setError("");


      if (!readingComplete) {
        throw new Error(
          "請先完整查看公告內容後再確認。"
        );
      }


      const response =
        await fetch(
          `${apiBaseUrl}/api/announcements/${encodeURIComponent(
            token
          )}/confirm`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );


      const result =
        await readJsonResponse(
          response
        );


      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.message ||
            "簽收失敗，請稍後再試。"
        );
      }


      setConfirmed(true);

      setReceipt(
        (current) => ({
          ...(current || {}),
          confirmed_at:
            result.confirmed_at ||
            new Date()
              .toISOString(),
        })
      );
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
          <div style={styles.brand}>
            BEAST Workspace
          </div>

          <p style={styles.muted}>
            正在讀取公告…
          </p>
        </section>
      </main>
    );
  }


  if (
    error &&
    !announcement
  ) {
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


  if (!announcement) {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.brand}>
            BEAST Workspace
          </div>

          <h1 style={styles.title}>
            找不到公告
          </h1>

          <p style={styles.muted}>
            這個公告連結可能已失效，
            請聯絡教室主管。
          </p>
        </section>
      </main>
    );
  }


  const isAlreadyConfirmed =
    confirmed ||
    Boolean(
      receipt?.confirmed_at
    );

  const sentAtText =
    formatTaipeiDateTime(
      announcement.sent_at
    );

  const deadlineAtText =
    formatTaipeiDateTime(
      announcement.deadline_at
    );

  const confirmedAtText =
    formatTaipeiDateTime(
      receipt?.confirmed_at
    );


  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}>
          BEAST Workspace
        </div>


        <div style={styles.badge}>
          📢 工作公告
        </div>


        <h1 style={styles.title}>
          {announcement.title}
        </h1>


        {receipt?.teacher_name && (
          <p style={styles.teacher}>
            {receipt.teacher_name}
            老師您好，請完整閱讀以下公告。
          </p>
        )}


        <div style={styles.metaBox}>
          <div style={styles.metaRow}>
            <span style={styles.metaLabel}>
              發送時間
            </span>

            <span style={styles.metaValue}>
              {sentAtText}
            </span>
          </div>

          <div style={styles.metaRow}>
            <span style={styles.metaLabel}>
              簽收期限
            </span>

            <span style={styles.metaValue}>
              {deadlineAtText}
            </span>
          </div>
        </div>


        <div style={styles.divider} />


        {announcement.content && (
          <div style={styles.content}>
            {announcement.content}
          </div>
        )}


        <div
          ref={endMarkerRef}
          style={styles.endMarker}
          aria-hidden="true"
        />


        {!isAlreadyConfirmed &&
          !readingComplete && (
            <div style={styles.readHint}>
              請完整閱讀公告內容。
              看到內容最下方後，
              確認按鈕會自動開放。
            </div>
          )}


        {!isAlreadyConfirmed &&
          readingComplete && (
            <div style={styles.readyHint}>
              ✓ 已完整顯示公告內容，
              現在可以進行確認。
            </div>
          )}


        {error &&
          announcement && (
            <div style={styles.inlineError}>
              {error}
            </div>
          )}


        {isAlreadyConfirmed ? (
          <div style={styles.success}>
            <div style={styles.successIcon}>
              ✓
            </div>

            <div style={styles.successTitle}>
              已完成簽收
            </div>

            <div style={styles.successText}>
              確認時間：
              {confirmedAtText}
            </div>

            <div style={styles.successNote}>
              系統已留下本次公告確認紀錄。
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={
              handleConfirm
            }
            disabled={
              confirming ||
              !readingComplete
            }
            style={{
              ...styles.button,
              ...(
                readingComplete
                  ? styles.buttonEnabled
                  : styles.buttonDisabled
              ),
            }}
          >
            {confirming
              ? "確認中…"
              : readingComplete
                ? "✓ 我已閱讀並確認以上公告內容"
                : "請先完整閱讀公告"}
          </button>
        )}


        <p style={styles.footerNote}>
          按下確認後，
          系統將記錄本次簽收時間。
        </p>
      </section>
    </main>
  );
}


const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f5f1",
    padding: "28px 16px 48px",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    fontFamily:
      '"Iansui", "Noto Sans TC", sans-serif',
  },

  card: {
    width: "100%",
    maxWidth: "680px",
    background: "#ffffff",
    borderRadius: "22px",
    padding: "30px",
    boxSizing: "border-box",
    boxShadow:
      "0 10px 35px rgba(0, 0, 0, 0.06)",
  },

  brand: {
    fontSize: "12px",
    letterSpacing: "0.09em",
    color: "#8b8176",
    marginBottom: "18px",
  },

  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#f2f0eb",
    color: "#5f655f",
    fontSize: "13px",
    marginBottom: "14px",
  },

  title: {
    margin: "0 0 14px",
    fontSize: "27px",
    lineHeight: 1.4,
    color: "#2f352f",
  },

  teacher: {
    margin:
      "0 0 20px",
    color: "#697069",
    fontSize: "15px",
    lineHeight: 1.7,
  },

  metaBox: {
    padding: "14px 16px",
    borderRadius: "14px",
    background: "#f8f7f4",
    display: "grid",
    gap: "8px",
  },

  metaRow: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "16px",
    fontSize: "13px",
    lineHeight: 1.6,
  },

  metaLabel: {
    color: "#8a8f8a",
    flex: "0 0 auto",
  },

  metaValue: {
    color: "#4e554e",
    textAlign: "right",
  },

  divider: {
    height: "1px",
    background: "#ece9e3",
    margin: "24px 0",
  },

  content: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: "16px",
    lineHeight: 1.95,
    color: "#3f463f",
  },

  endMarker: {
    width: "100%",
    height: "2px",
    marginTop: "4px",
  },

  readHint: {
    marginTop: "24px",
    padding: "13px 15px",
    borderRadius: "12px",
    background: "#f7f3e8",
    color: "#7a6b42",
    fontSize: "13px",
    lineHeight: 1.7,
  },

  readyHint: {
    marginTop: "24px",
    padding: "13px 15px",
    borderRadius: "12px",
    background: "#eef5ee",
    color: "#4f6e55",
    fontSize: "13px",
    lineHeight: 1.7,
  },

  inlineError: {
    marginTop: "16px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#fff2f0",
    color: "#a34f47",
    fontSize: "13px",
    lineHeight: 1.6,
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
    marginTop: "24px",
    padding: "24px 18px",
    borderRadius: "16px",
    background: "#edf5ed",
    color: "#416546",
    textAlign: "center",
  },

  successIcon: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: "#416546",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 10px",
    fontSize: "20px",
    fontWeight: 700,
  },

  successTitle: {
    fontSize: "18px",
    fontWeight: 700,
  },

  successText: {
    marginTop: "8px",
    fontSize: "13px",
  },

  successNote: {
    marginTop: "5px",
    fontSize: "12px",
    opacity: 0.8,
  },

  button: {
    width: "100%",
    border: 0,
    borderRadius: "14px",
    padding: "16px 18px",
    marginTop: "24px",
    fontSize: "15px",
    fontWeight: 600,
    fontFamily: "inherit",
    transition:
      "opacity 0.15s ease",
  },

  buttonEnabled: {
    cursor: "pointer",
    background: "#354438",
    color: "#fff",
    opacity: 1,
  },

  buttonDisabled: {
    cursor: "not-allowed",
    background: "#e4e3df",
    color: "#999c99",
    opacity: 1,
  },

  footerNote: {
    margin:
      "12px 0 0",
    textAlign: "center",
    color: "#9a9d99",
    fontSize: "11px",
    lineHeight: 1.6,
  },
};


export default AnnouncementPublicPage;
