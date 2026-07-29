import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const EMPTY_FORM = {
  overrideDate: "",
  overrideType: "HOLIDAY",
  title: "",
  notes: "",
};

const OVERRIDE_TYPE_OPTIONS = [
  {
    value: "HOLIDAY",
    label: "國定假日",
    description: "國定假日或全國統一放假日",
  },
  {
    value: "CLASSROOM_CLOSED",
    label: "教室休假",
    description: "倍思教室自行安排的休假日",
  },
  {
    value: "SPECIAL_WORKDAY",
    label: "特殊上班日",
    description: "原本休假，但教室需要上班或上課",
  },
];

const OVERRIDE_TYPE_LABELS = {
  HOLIDAY: "國定假日",
  CLASSROOM_CLOSED: "教室休假",
  SPECIAL_WORKDAY: "特殊上班日",
};

function formatDate(dateValue) {
  if (!dateValue) return "未設定";

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(`${dateValue}T00:00:00`));
}

function DayOverridePanel({
  semesterId,
  semesterStartDate,
  semesterEndDate,
}) {
  const [dayOverrides, setDayOverrides] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const sortedDayOverrides = useMemo(() => {
    return [...dayOverrides].sort((a, b) =>
      a.override_date.localeCompare(b.override_date)
    );
  }, [dayOverrides]);

  useEffect(() => {
    if (!semesterId) {
      setDayOverrides([]);
      return;
    }

    loadDayOverrides();
  }, [semesterId]);

  async function loadDayOverrides() {
    if (!semesterId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("calendar_day_overrides")
        .select(
          "id, semester_id, override_date, override_type, title, notes, created_at, updated_at"
        )
        .eq("semester_id", semesterId)
        .order("override_date", { ascending: true });

      if (error) {
        throw error;
      }

      setDayOverrides(data || []);
    } catch (error) {
      console.error("讀取學期重要日期失敗：", error);

      setDayOverrides([]);

      setErrorMessage(
        error?.message
          ? `讀取學期重要日期失敗：${error.message}`
          : "讀取學期重要日期失敗，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingId("");
    setForm(EMPTY_FORM);
    setErrorMessage("");
    setSuccessMessage("");
    setShowForm(true);
  }

  function openEditForm(dayOverride) {
    setEditingId(dayOverride.id);

    setForm({
      overrideDate: dayOverride.override_date || "",
      overrideType: dayOverride.override_type || "HOLIDAY",
      title: dayOverride.title || "",
      notes: dayOverride.notes || "",
    });

    setErrorMessage("");
    setSuccessMessage("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setEditingId("");
    setForm(EMPTY_FORM);
    setShowForm(false);
    setErrorMessage("");
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function validateForm() {
    const title = form.title.trim();

    if (!form.overrideDate) {
      return "請選擇日期。";
    }

    if (
      semesterStartDate &&
      form.overrideDate < semesterStartDate
    ) {
      return "日期不能早於學期開始日。";
    }

    if (
      semesterEndDate &&
      form.overrideDate > semesterEndDate
    ) {
      return "日期不能晚於學期結束日。";
    }

    if (!form.overrideType) {
      return "請選擇日期類型。";
    }

    if (!title) {
      return "請輸入日期名稱。";
    }

    const duplicatedDate = dayOverrides.some(
      (item) =>
        item.override_date === form.overrideDate &&
        item.id !== editingId
    );

    if (duplicatedDate) {
      return "這一天已經設定過重要日期。";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationMessage = validateForm();

    if (validationMessage) {
      setErrorMessage(validationMessage);
      setSuccessMessage("");
      return;
    }

    const payload = {
      semester_id: semesterId,
      override_date: form.overrideDate,
      override_type: form.overrideType,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (editingId) {
        const { error } = await supabase
          .from("calendar_day_overrides")
          .update(payload)
          .eq("id", editingId)
          .eq("semester_id", semesterId);

        if (error) {
          throw error;
        }

        setSuccessMessage(`已更新「${payload.title}」。`);
      } else {
        const { error } = await supabase
          .from("calendar_day_overrides")
          .insert(payload);

        if (error) {
          throw error;
        }

        setSuccessMessage(`已新增「${payload.title}」。`);
      }

      setEditingId("");
      setForm(EMPTY_FORM);
      setShowForm(false);

      await loadDayOverrides();
    } catch (error) {
      console.error("儲存學期重要日期失敗：", error);

      setErrorMessage(
        error?.message
          ? `儲存失敗：${error.message}`
          : "儲存失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dayOverride) {
    const confirmed = window.confirm(
      `確定要刪除「${dayOverride.title}」嗎？`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(dayOverride.id);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("calendar_day_overrides")
        .delete()
        .eq("id", dayOverride.id)
        .eq("semester_id", semesterId);

      if (error) {
        throw error;
      }

      setSuccessMessage(`已刪除「${dayOverride.title}」。`);

      await loadDayOverrides();
    } catch (error) {
      console.error("刪除學期重要日期失敗：", error);

      setErrorMessage(
        error?.message
          ? `刪除失敗：${error.message}`
          : "刪除失敗，請稍後再試。"
      );
    } finally {
      setDeletingId("");
    }
  }

  if (!semesterId) {
    return null;
  }

  return (
    <>
      <section className="day-override-section">
        <div className="day-override-heading">
          <div>
            <p className="semester-card-kicker">
              IMPORTANT DATES
            </p>

            <h3>學期重要日期</h3>

            <span>
              設定國定假日、教室休假日與特殊上班日。
            </span>
          </div>

          <button
            type="button"
            className="calendar-primary-button"
            onClick={openCreateForm}
          >
            ＋新增日期
          </button>
        </div>

        {errorMessage && !showForm && (
          <div className="calendar-message calendar-message--error">
            {errorMessage}
          </div>
        )}

        {successMessage && !showForm && (
          <div className="calendar-message calendar-message--success">
            {successMessage}
          </div>
        )}

        {loading ? (
          <p className="calendar-muted">
            正在讀取學期重要日期…
          </p>
        ) : sortedDayOverrides.length === 0 ? (
          <div className="calendar-empty-state calendar-empty-state--small">
            <p>目前還沒有設定重要日期。</p>
            <span>
              可先加入國定假日、教室休假日或特殊上班日。
            </span>
          </div>
        ) : (
          <div className="day-override-list">
            {sortedDayOverrides.map((dayOverride) => (
              <article
                key={dayOverride.id}
                className="day-override-item"
              >
                <div className="day-override-item__date">
                  <strong>
                    {formatDate(dayOverride.override_date)}
                  </strong>

                  <span
                    className={`day-override-type day-override-type--${dayOverride.override_type.toLowerCase()}`}
                  >
                    {OVERRIDE_TYPE_LABELS[
                      dayOverride.override_type
                    ] || dayOverride.override_type}
                  </span>
                </div>

                <div className="day-override-item__content">
                  <strong>{dayOverride.title}</strong>

                  {dayOverride.notes && (
                    <p>{dayOverride.notes}</p>
                  )}
                </div>

                <div className="day-override-item__actions">
                  <button
                    type="button"
                    className="calendar-text-button"
                    onClick={() => openEditForm(dayOverride)}
                    disabled={Boolean(deletingId)}
                  >
                    修改
                  </button>

                  <button
                    type="button"
                    className="calendar-danger-text-button"
                    onClick={() => handleDelete(dayOverride)}
                    disabled={Boolean(deletingId)}
                  >
                    {deletingId === dayOverride.id
                      ? "刪除中…"
                      : "刪除"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div
          className="calendar-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !saving
            ) {
              closeForm();
            }
          }}
        >
          <section
            className="calendar-modal calendar-modal--small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-override-form-title"
          >
            <header className="calendar-modal__header">
              <div>
                <p className="semester-card-kicker">
                  IMPORTANT DATE
                </p>

                <h2 id="day-override-form-title">
                  {editingId
                    ? "修改學期重要日期"
                    : "新增學期重要日期"}
                </h2>
              </div>

              <button
                type="button"
                className="calendar-modal__close"
                onClick={closeForm}
                disabled={saving}
                aria-label="關閉"
              >
                ×
              </button>
            </header>

            {errorMessage && (
              <div className="calendar-message calendar-message--error">
                {errorMessage}
              </div>
            )}

            <form
              className="day-override-form"
              onSubmit={handleSubmit}
            >
              <label className="calendar-field">
                <span>日期</span>

                <input
                  type="date"
                  name="overrideDate"
                  value={form.overrideDate}
                  min={semesterStartDate || undefined}
                  max={semesterEndDate || undefined}
                  onChange={handleFormChange}
                  disabled={saving}
                />
              </label>

              <label className="calendar-field">
                <span>日期類型</span>

                <select
                  name="overrideType"
                  value={form.overrideType}
                  onChange={handleFormChange}
                  disabled={saving}
                >
                  {OVERRIDE_TYPE_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="day-override-type-description">
                {
                  OVERRIDE_TYPE_OPTIONS.find(
                    (option) =>
                      option.value === form.overrideType
                  )?.description
                }
              </div>

              <label className="calendar-field">
                <span>名稱</span>

                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="例如：中秋節"
                  disabled={saving}
                  autoFocus
                />
              </label>

              <label className="calendar-field">
                <span>備註（選填）</span>

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  placeholder="可補充排課、接送或值班安排。"
                  rows="4"
                  disabled={saving}
                />
              </label>

              <footer className="calendar-modal__actions">
                <button
                  type="button"
                  className="calendar-secondary-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="calendar-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "儲存中…"
                    : editingId
                      ? "儲存修改"
                      : "新增日期"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export default DayOverridePanel;