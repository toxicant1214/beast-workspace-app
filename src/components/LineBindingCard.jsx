import { useState } from "react";
import { generateTeacherLineBindingCode } from "../services/teacherService";

export default function LineBindingCard() {
  const [bindingCode, setBindingCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleGenerateCode() {
    try {
      setLoading(true);
      setErrorMessage("");

      const result = await generateTeacherLineBindingCode();

      setBindingCode(result.binding_code);
      setExpiresAt(result.expires_at);
    } catch (error) {
      console.error("產生 LINE 綁定碼失敗：", error);
      setErrorMessage(
        error?.message || "目前無法產生 LINE 綁定碼，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }

  function formatExpiresAt(value) {
    if (!value) return "";

    return new Date(value).toLocaleString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <section className="line-binding-card">
      <h3>LINE 任務提醒</h3>

      <p>
        綁定 LINE 後，即可接收老師任務、到期提醒與每日工作摘要。
      </p>

      {!bindingCode ? (
        <button
          type="button"
          onClick={handleGenerateCode}
          disabled={loading}
        >
          {loading ? "產生中……" : "產生 LINE 綁定碼"}
        </button>
      ) : (
        <div>
          <p>您的 LINE 綁定碼</p>

          <strong>{bindingCode}</strong>

          <p>
            此綁定碼將於 {formatExpiresAt(expiresAt)} 到期。
          </p>
        </div>
      )}

      {errorMessage && (
        <p role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}