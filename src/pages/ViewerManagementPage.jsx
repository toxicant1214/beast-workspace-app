import { useState } from "react";
import { supabase } from "../lib/supabase";

function ViewerManagementPage() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
          },
        }
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
    } catch (error) {
      console.error(
        "建立檢視帳號失敗：",
        error
      );

      setErrorMessage(
        error?.message ||
          "建立檢視帳號失敗，請稍後再試。"
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section>
      <div>
        <h1>檢視帳號管理</h1>

        <p>
          建立僅供查看 Workspace
          資料的登入帳號。
        </p>
      </div>

      <form
        onSubmit={handleCreateViewer}
        style={{
          maxWidth: "520px",
          display: "grid",
          gap: "16px",
          marginTop: "24px",
        }}
      >
        <label>
          <div>顯示名稱</div>

          <input
            type="text"
            value={displayName}
            onChange={(event) =>
              setDisplayName(
                event.target.value
              )
            }
            placeholder="例如：王董事長"
            disabled={isCreating}
          />
        </label>

        <label>
          <div>登入帳號</div>

          <input
            type="text"
            value={username}
            onChange={(event) =>
              setUsername(
                event.target.value
              )
            }
            placeholder="例如：boss"
            disabled={isCreating}
          />
        </label>

        <label>
          <div>初始密碼</div>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value
              )
            }
            placeholder="至少 8 個字元"
            disabled={isCreating}
          />
        </label>

        <button
          type="submit"
          disabled={isCreating}
        >
          {isCreating
            ? "建立中…"
            : "建立檢視帳號"}
        </button>

        {message && (
          <p>{message}</p>
        )}

        {errorMessage && (
          <p>{errorMessage}</p>
        )}
      </form>
    </section>
  );
}

export default ViewerManagementPage;