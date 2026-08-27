import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./ViewerManagementPage.css";

const VIEWER_PAGE_OPTIONS = [
  {
    key: "dashboard",
    label: "首頁",
    description: "查看經營與統計資訊；viewer 端隱藏今日概況。",
  },
  {
    key: "classes",
    label: "班級管理",
    description: "可查看、點開明細與下載；不顯示任何編輯入口。",
  },
  {
    key: "calendar",
    label: "行事曆",
    description: "可查看、切換與點開內容；不顯示任何編輯入口。",
  },
  {
    key: "pickup",
    label: "接送管理",
    description: "可查看與展開接送資料；不顯示任何編輯入口。",
  },
  {
    key: "snack_management",
    label: "點心管理",
    description: "可查看明細、統計與 PDF；不顯示任何設定或編輯入口。",
  },
];

function ViewerManagementPage() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPages, setSelectedPages] = useState(["dashboard"]);

  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCount = useMemo(
    () => selectedPages.length,
    [selectedPages],
  );

  function togglePage(pageKey) {
    setSelectedPages((current) => {
      if (current.includes(pageKey)) {
        return current.filter((key) => key !== pageKey);
      }

      return [...current, pageKey];
    });
  }

  async function handleCreateViewer(event) {
    event.preventDefault();

    const cleanDisplayName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanDisplayName) {
      setErrorMessage("請輸入顯示名稱。");
      return;
    }

    if (!cleanUsername) {
      setErrorMessage("請輸入登入帳號。");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setErrorMessage("登入帳號只能使用英文字母、數字與底線。");
      return;
    }

    if (cleanUsername.length < 3) {
      setErrorMessage("登入帳號至少需要 3 個字元。");
      return;
    }

    if (!password) {
      setErrorMessage("請輸入初始密碼。");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("初始密碼至少需要 8 個字元。");
      return;
    }

    if (selectedPages.length === 0) {
      setErrorMessage("請至少選擇一個可查看頁面。");
      return;
    }

    try {
      setIsCreating(true);
      setMessage("");
      setErrorMessage("");

      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "create-viewer",
        {
          body: {
            displayName: cleanDisplayName,
            username: cleanUsername,
            password,
            permissions: selectedPages,
          },
        },
      );

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setMessage("檢視帳號建立成功。");
      setDisplayName("");
      setUsername("");
      setPassword("");
      setSelectedPages(["dashboard"]);
    } catch (error) {
      console.error(
        "建立檢視帳號失敗：",
        error,
      );

      setErrorMessage(
        error?.message ||
          "建立檢視帳號失敗，請稍後再試。",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="viewer-management-page">
      <div className="viewer-management-page__header">
        <div>
          <p className="viewer-management-page__eyebrow">
            VIEWER ACCESS
          </p>
          <h1>檢視帳號管理</h1>
          <p>
            建立僅供查看 Workspace 資料的登入帳號，
            並設定每一個帳號可查看的頁面。
          </p>
        </div>

        <div className="viewer-management-page__summary">
          <span>目前選擇</span>
          <strong>{selectedCount}</strong>
          <span>個可查看頁面</span>
        </div>
      </div>

      <form
        onSubmit={handleCreateViewer}
        className="viewer-management-form"
      >
        <div className="viewer-management-grid">
          <section className="viewer-card">
            <div className="viewer-card__heading">
              <div>
                <span className="viewer-card__step">01</span>
                <h2>帳號資料</h2>
              </div>
              <p>
                由管理員直接建立帳號與初始密碼。
              </p>
            </div>

            <div className="viewer-field-grid">
              <label className="viewer-field">
                <span>顯示名稱</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) =>
                    setDisplayName(
                      event.target.value,
                    )
                  }
                  placeholder="例如：王董事長"
                  disabled={isCreating}
                />
              </label>

              <label className="viewer-field">
                <span>登入帳號</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target.value,
                    )
                  }
                  placeholder="例如：boss"
                  disabled={isCreating}
                  autoCapitalize="none"
                  spellCheck="false"
                />
                <small>
                  僅限英文、數字、底線，至少 3 個字元。
                </small>
              </label>

              <label className="viewer-field">
                <span>初始密碼</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                  placeholder="至少 8 個字元"
                  disabled={isCreating}
                />
                <small>
                  建立後可直接使用這組帳號密碼登入。
                </small>
              </label>
            </div>
          </section>

          <section className="viewer-card viewer-card--permissions">
            <div className="viewer-card__heading">
              <div>
                <span className="viewer-card__step">02</span>
                <h2>可查看頁面</h2>
              </div>
              <p>
                僅列出可授權的業務資料頁，不包含後台設定。
              </p>
            </div>

            <div className="viewer-permission-list">
              {VIEWER_PAGE_OPTIONS.map(
                (page) => {
                  const checked =
                    selectedPages.includes(
                      page.key,
                    );

                  return (
                    <button
                      key={page.key}
                      type="button"
                      className={
                        checked
                          ? "viewer-permission-card viewer-permission-card--active"
                          : "viewer-permission-card"
                      }
                      onClick={() =>
                        togglePage(
                          page.key,
                        )
                      }
                      disabled={
                        isCreating
                      }
                    >
                      <span className="viewer-permission-card__check">
                        {checked ? "✓" : ""}
                      </span>

                      <span className="viewer-permission-card__text">
                        <strong>
                          {page.label}
                        </strong>
                        <small>
                          {
                            page.description
                          }
                        </small>
                      </span>
                    </button>
                  );
                },
              )}
            </div>
          </section>
        </div>

        <div className="viewer-management-actions">
          <div>
            {message && (
              <p className="viewer-message viewer-message--success">
                {message}
              </p>
            )}

            {errorMessage && (
              <p className="viewer-message viewer-message--error">
                {errorMessage}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="viewer-create-button"
            disabled={isCreating}
          >
            {isCreating
              ? "建立中…"
              : "建立檢視帳號"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default ViewerManagementPage;