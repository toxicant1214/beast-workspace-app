import {
  useEffect,
  useState,
} from "react";

const INITIAL_FORM = {
  name: "",
  campType: "SUMMER",
  startDate: "",
  endDate: "",
  notes: "",
};

function CampFormModal({
  isOpen,
  onClose,
  onSubmit,
}) {
  const [formData, setFormData] = useState(
    INITIAL_FORM
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormData(INITIAL_FORM);
    setErrorMessage("");
    setIsSaving(false);
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.name.trim()) {
      setErrorMessage("請輸入營隊名稱。");
      return;
    }

    if (!formData.startDate || !formData.endDate) {
      setErrorMessage(
        "請選擇營隊開始與結束日期。"
      );
      return;
    }

    if (formData.endDate < formData.startDate) {
      setErrorMessage(
        "結束日期不能早於開始日期。"
      );
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");
      await onSubmit(formData);
    } catch (error) {
      console.error("建立營隊失敗：", error);

      setErrorMessage(
        `建立營隊失敗：${error.message}`
      );
      setIsSaving(false);
    }
  }

  return (
    <div
      className="campModalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="campModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camp-form-title"
      >
        <div className="campModal__header">
          <div>
            <p className="campEyebrow">NEW CAMP</p>
            <h2 id="camp-form-title">
              建立營隊資料夾
            </h2>
          </div>

          <button
            type="button"
            className="campModal__close"
            onClick={onClose}
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <form
          className="campForm"
          onSubmit={handleSubmit}
        >
          <label className="campForm__field">
            <span>營隊名稱</span>

            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="例如：2027 暑假營隊"
              autoFocus
            />
          </label>

          <label className="campForm__field">
            <span>營隊類型</span>

            <select
              name="campType"
              value={formData.campType}
              onChange={handleChange}
            >
              <option value="SUMMER">暑假營隊</option>
              <option value="WINTER">寒假營隊</option>
              <option value="OTHER">其他</option>
            </select>
          </label>

          <div className="campForm__dateGrid">
            <label className="campForm__field">
              <span>開始日期</span>

              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
              />
            </label>

            <label className="campForm__field">
              <span>結束日期</span>

              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                min={formData.startDate || undefined}
                onChange={handleChange}
              />
            </label>
          </div>

          <label className="campForm__field">
            <span>備註</span>

            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="4"
              placeholder="可留空"
            />
          </label>

          {errorMessage && (
            <div className="campMessage campMessage--error">
              {errorMessage}
            </div>
          )}

          <div className="campModal__actions">
            <button
              type="button"
              className="campSecondaryButton"
              onClick={onClose}
              disabled={isSaving}
            >
              取消
            </button>

            <button
              type="submit"
              className="campPrimaryButton"
              disabled={isSaving}
            >
              {isSaving ? "建立中…" : "建立營隊"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CampFormModal;