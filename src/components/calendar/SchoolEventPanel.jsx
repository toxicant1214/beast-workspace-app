import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const EMPTY_FORM = {
  schoolId: "",
  startDate: "",
  endDate: "",
  title: "",
  eventType: "EXAM",
  notes: "",
  affectsPickup: false,
};

const EVENT_TYPE_OPTIONS = [
  { value: "OPENING_DAY", label: "開學日" },
  { value: "EXAM", label: "考試" },
  { value: "SPORTS_DAY", label: "運動會" },
  { value: "SCHOOL_ANNIVERSARY", label: "校慶" },
  { value: "PARENT_MEETING", label: "親師活動" },
  { value: "GRADUATION", label: "畢業活動" },
  { value: "OTHER", label: "其他" },
];

const EVENT_TYPE_LABELS = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((option) => [
    option.value,
    option.label,
  ])
);

function formatDate(dateValue) {
  if (!dateValue) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(`${dateValue}T00:00:00`));
}

function SchoolEventPanel({
  semesterId,
  semesterStartDate,
  semesterEndDate,
}) {
  const [schools, setSchools] = useState([]);
  const [schoolEvents, setSchoolEvents] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const schoolMap = useMemo(() => {
    return Object.fromEntries(
      schools.map((school) => [school.id, school.name])
    );
  }, [schools]);

  const sortedEvents = useMemo(() => {
    return [...schoolEvents].sort((a, b) => {
      const dateCompare = a.start_date.localeCompare(
        b.start_date
      );

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return (schoolMap[a.school_id] || "").localeCompare(
        schoolMap[b.school_id] || "",
        "zh-TW"
      );
    });
  }, [schoolEvents, schoolMap]);

  useEffect(() => {
    if (!semesterId) {
      setSchools([]);
      setSchoolEvents([]);
      return;
    }

    loadPanelData();
  }, [semesterId]);

  async function loadPanelData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [schoolResult, eventResult] =
        await Promise.all([
          supabase
            .from("calendar_semester_schools")
            .select(
              `
                school_id,
                calendar_schools (
                  id,
                  name
                )
              `
            )
            .eq("semester_id", semesterId),

          supabase
            .from("calendar_school_events")
            .select(
              `
                id,
                semester_id,
                school_id,
                start_date,
                end_date,
                title,
                event_type,
                notes,
                affects_pickup,
                created_at,
                updated_at
              `
            )
            .eq("semester_id", semesterId)
            .order("start_date", { ascending: true }),
        ]);

      if (schoolResult.error) {
        throw schoolResult.error;
      }

      if (eventResult.error) {
        throw eventResult.error;
      }

      const attachedSchools = (
        schoolResult.data || []
      )
        .map((item) => item.calendar_schools)
        .filter(Boolean)
        .sort((a, b) =>
          a.name.localeCompare(b.name, "zh-TW")
        );

      setSchools(attachedSchools);
      setSchoolEvents(eventResult.data || []);
    } catch (error) {
      console.error("讀取學校行事失敗：", error);

      setErrorMessage(
        error?.message
          ? `讀取學校行事失敗：${error.message}`
          : "讀取學校行事失敗，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingId("");

    setForm({
      ...EMPTY_FORM,
      schoolId: schools[0]?.id || "",
      startDate: semesterStartDate || "",
    });

    setErrorMessage("");
    setSuccessMessage("");
    setShowForm(true);
  }

  function openEditForm(eventItem) {
    setEditingId(eventItem.id);

    setForm({
      schoolId: eventItem.school_id || "",
      startDate: eventItem.start_date || "",
      endDate: eventItem.end_date || "",
      title: eventItem.title || "",
      eventType: eventItem.event_type || "OTHER",
      notes: eventItem.notes || "",
      affectsPickup:
        eventItem.affects_pickup === true,
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
    const { name, value, type, checked } =
      event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function validateForm() {
    if (!form.schoolId) {
      return "請選擇學校。";
    }

    if (!form.startDate) {
      return "請選擇開始日期。";
    }

    if (
      semesterStartDate &&
      form.startDate < semesterStartDate
    ) {
      return "開始日期不能早於學期開始日。";
    }

    if (
      semesterEndDate &&
      form.startDate > semesterEndDate
    ) {
      return "開始日期不能晚於學期結束日。";
    }

    if (
      form.endDate &&
      form.endDate < form.startDate
    ) {
      return "結束日期不能早於開始日期。";
    }

    if (
      form.endDate &&
      semesterEndDate &&
      form.endDate > semesterEndDate
    ) {
      return "結束日期不能晚於學期結束日。";
    }

    if (!form.title.trim()) {
      return "請輸入行事名稱。";
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
      school_id: form.schoolId,
      start_date: form.startDate,
      end_date: form.endDate || null,
      title: form.title.trim(),
      event_type: form.eventType,
      notes: form.notes.trim() || null,
      affects_pickup: form.affectsPickup,
      updated_at: new Date().toISOString(),
    };

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      if (editingId) {
        const { error } = await supabase
          .from("calendar_school_events")
          .update(payload)
          .eq("id", editingId)
          .eq("semester_id", semesterId);

        if (error) {
          throw error;
        }

        setSuccessMessage(
          `已更新「${payload.title}」。`
        );
      } else {
        const { error } = await supabase
          .from("calendar_school_events")
          .insert(payload);

        if (error) {
          throw error;
        }

        setSuccessMessage(
          `已新增「${payload.title}」。`
        );
      }

      setEditingId("");
      setForm(EMPTY_FORM);
      setShowForm(false);

      await loadPanelData();
    } catch (error) {
      console.error("儲存學校行事失敗：", error);

      setErrorMessage(
        error?.message
          ? `儲存失敗：${error.message}`
          : "儲存失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(eventItem) {
    const confirmed = window.confirm(
      `確定要刪除「${eventItem.title}」嗎？`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(eventItem.id);
      setErrorMessage("");
      setSuccessMessage("");

      const { error } = await supabase
        .from("calendar_school_events")
        .delete()
        .eq("id", eventItem.id)
        .eq("semester_id", semesterId);

      if (error) {
        throw error;
      }

      setSuccessMessage(
        `已刪除「${eventItem.title}」。`
      );

      await loadPanelData();
    } catch (error) {
      console.error("刪除學校行事失敗：", error);

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
      <section className="school-event-section">
        <div className="school-event-heading">
          <div>
            <p className="semester-card-kicker">
              SCHOOL EVENTS
            </p>

            <h3>學校行事</h3>

            <span>
              記錄各校考試、校慶、運動會與其他重要安排。
            </span>
          </div>

          <button
            type="button"
            className="calendar-primary-button"
            onClick={openCreateForm}
            disabled={loading || schools.length === 0}
          >
            ＋新增學校行事
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

        {schools.length === 0 && !loading ? (
          <div className="calendar-empty-state calendar-empty-state--small">
            <p>目前學期尚未加入學校。</p>
            <span>
              請先至上方「管理學校」加入學校。
            </span>
          </div>
        ) : loading ? (
          <p className="calendar-muted">
            正在讀取學校行事…
          </p>
        ) : sortedEvents.length === 0 ? (
          <div className="calendar-empty-state calendar-empty-state--small">
            <p>目前還沒有學校行事。</p>
            <span>
              收到學校公告後，再慢慢新增即可。
            </span>
          </div>
        ) : (
          <div className="school-event-list">
            {sortedEvents.map((eventItem) => (
              <article
                key={eventItem.id}
                className="school-event-item"
              >
                <div className="school-event-item__date">
                  <strong>
                    {formatDate(eventItem.start_date)}
                  </strong>

                  {eventItem.end_date &&
                    eventItem.end_date !==
                      eventItem.start_date && (
                      <span>
                        至{" "}
                        {formatDate(
                          eventItem.end_date
                        )}
                      </span>
                    )}
                </div>

                <div className="school-event-item__content">
                  <div className="school-event-item__badges">
                    <span className="school-event-school">
                      {schoolMap[eventItem.school_id] ||
                        "未知學校"}
                    </span>

                    <span className="school-event-type">
                      {EVENT_TYPE_LABELS[
                        eventItem.event_type
                      ] || eventItem.event_type}
                    </span>

                    {eventItem.affects_pickup && (
                      <span className="school-event-pickup">
                        影響接送
                      </span>
                    )}
                  </div>

                  <strong>{eventItem.title}</strong>

                  {eventItem.notes && (
                    <p>{eventItem.notes}</p>
                  )}
                </div>

                <div className="school-event-item__actions">
                  <button
                    type="button"
                    className="calendar-text-button"
                    onClick={() =>
                      openEditForm(eventItem)
                    }
                    disabled={Boolean(deletingId)}
                  >
                    修改
                  </button>

                  <button
                    type="button"
                    className="calendar-danger-text-button"
                    onClick={() =>
                      handleDelete(eventItem)
                    }
                    disabled={Boolean(deletingId)}
                  >
                    {deletingId === eventItem.id
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
            aria-labelledby="school-event-form-title"
          >
            <header className="calendar-modal__header">
              <div>
                <p className="semester-card-kicker">
                  SCHOOL EVENT
                </p>

                <h2 id="school-event-form-title">
                  {editingId
                    ? "修改學校行事"
                    : "新增學校行事"}
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
              className="school-event-form"
              onSubmit={handleSubmit}
            >
              <label className="calendar-field">
                <span>學校</span>

                <select
                  name="schoolId"
                  value={form.schoolId}
                  onChange={handleFormChange}
                  disabled={saving}
                >
                  <option value="">
                    請選擇學校
                  </option>

                  {schools.map((school) => (
                    <option
                      key={school.id}
                      value={school.id}
                    >
                      {school.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="school-event-date-grid">
                <label className="calendar-field">
                  <span>開始日期</span>

                  <input
                    type="date"
                    name="startDate"
                    value={form.startDate}
                    min={
                      semesterStartDate || undefined
                    }
                    max={semesterEndDate || undefined}
                    onChange={handleFormChange}
                    disabled={saving}
                  />
                </label>

                <label className="calendar-field">
                  <span>結束日期（選填）</span>

                  <input
                    type="date"
                    name="endDate"
                    value={form.endDate}
                    min={
                      form.startDate ||
                      semesterStartDate ||
                      undefined
                    }
                    max={semesterEndDate || undefined}
                    onChange={handleFormChange}
                    disabled={saving}
                  />
                </label>
              </div>

              <label className="calendar-field">
                <span>行事類型</span>

                <select
                  name="eventType"
                  value={form.eventType}
                  onChange={handleFormChange}
                  disabled={saving}
                >
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="calendar-field">
                <span>行事名稱</span>

                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="例如：第一次期中考"
                  disabled={saving}
                />
              </label>

              <label className="calendar-field">
                <span>備註（選填）</span>

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  placeholder="可補充放學時間、考試科目或其他安排。"
                  rows="4"
                  disabled={saving}
                />
              </label>

              <label className="school-event-checkbox">
                <input
                  type="checkbox"
                  name="affectsPickup"
                  checked={form.affectsPickup}
                  onChange={handleFormChange}
                  disabled={saving}
                />

                <span>
                  這項行事可能影響當天接送安排
                </span>
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
                      : "新增行事"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export default SchoolEventPanel;