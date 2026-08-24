import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const ALL_SCHOOLS_VALUE = "__ALL_SCHOOLS__";

const CATEGORY_OPTIONS = [
  { value: "SCHOOL", label: "學校重要事務" },
  { value: "ADMIN", label: "行政表單與固定事務" },
  { value: "ACADEMIC", label: "學科事務安排" },
  { value: "CLASSROOM", label: "教室活動安排" },
  { value: "SOCIAL", label: "臉書發文排程" },
];

const EVENT_TYPE_OPTIONS_BY_CATEGORY = {
  SCHOOL: [
    { value: "OPENING_DAY", label: "開學日" },
    { value: "MIDTERM_EXAM", label: "期中考" },
    { value: "FINAL_EXAM", label: "期末考" },
    { value: "SPORTS_DAY", label: "運動會" },
    { value: "SCHOOL_ANNIVERSARY", label: "校慶" },
    { value: "PARENT_MEETING", label: "親師活動" },
    { value: "GRADUATION", label: "畢業活動" },
    { value: "OTHER", label: "其他" },
  ],
  ADMIN: [{ value: "OTHER", label: "自訂行政事項" }],
  ACADEMIC: [
    { value: "MOCK_EXAM", label: "模擬考" },
    { value: "EXAM_REVIEW", label: "考前複習" },
    { value: "REVIEW_WEEK", label: "複習週" },
    { value: "OTHER", label: "其他" },
  ],
  CLASSROOM: [{ value: "OTHER", label: "自訂教室活動" }],
  SOCIAL: [{ value: "OTHER", label: "自訂發文項目" }],
};

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map((option) => [option.value, option.label])
);

const EVENT_TYPE_LABELS = Object.fromEntries(
  Object.values(EVENT_TYPE_OPTIONS_BY_CATEGORY)
    .flat()
    .map((option) => [option.value, option.label])
);

// 舊資料相容：先前的 EXAM 仍能正常顯示。
EVENT_TYPE_LABELS.EXAM = "考試";

const EMPTY_FORM = {
  category: "SCHOOL",
  schoolId: "",
  startDate: "",
  endDate: "",
  eventType: "MIDTERM_EXAM",
  customTitle: "",
  notes: "",
  affectsPickup: false,

  morningBriefEnabled: false,
  reminderType: "NOTICE",
  reminderDaysBefore: 0,
  reminderAudience: "ALL",
  reminderTeacherIds: [],
};

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

function getEventDisplayTitle(eventItem) {
  if (!eventItem) {
    return "";
  }

  if (eventItem.event_type === "OTHER") {
    return eventItem.title || "其他行事";
  }

  return (
    EVENT_TYPE_LABELS[eventItem.event_type] ||
    eventItem.title ||
    "學校行事"
  );
}

function SchoolEventPanel({
  semesterId,
  semesterStartDate,
  semesterEndDate,
}) {
  const [schools, setSchools] = useState([]);
  const [schoolEvents, setSchoolEvents] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  const currentEventTypeOptions =
    EVENT_TYPE_OPTIONS_BY_CATEGORY[form.category] ||
    EVENT_TYPE_OPTIONS_BY_CATEGORY.SCHOOL;

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

      if (
        a.applies_to_all_schools &&
        !b.applies_to_all_schools
      ) {
        return -1;
      }

      if (
        !a.applies_to_all_schools &&
        b.applies_to_all_schools
      ) {
        return 1;
      }

      const schoolA = a.applies_to_all_schools
        ? "全部學校"
        : schoolMap[a.school_id] || "";

      const schoolB = b.applies_to_all_schools
        ? "全部學校"
        : schoolMap[b.school_id] || "";

      return schoolA.localeCompare(schoolB, "zh-TW");
    });
  }, [schoolEvents, schoolMap]);

  useEffect(() => {
    if (!semesterId) {
      setSchools([]);
      setSchoolEvents([]);
      setTeachers([]);
      return;
    }

    loadPanelData();
  }, [semesterId]);

  async function loadPanelData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [schoolResult, eventResult, teacherResult] =
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
                applies_to_all_schools,
                start_date,
                end_date,
                title,
                event_type,
                category,
                display_order,
                notes,
                affects_pickup,
                morning_brief_enabled,
                reminder_type,
                reminder_days_before,
                reminder_audience,
                reminder_teacher_ids,
                created_at,
                updated_at
              `
            )
            .eq("semester_id", semesterId)
            .order("start_date", { ascending: true }),

          supabase
            .from("teachers")
            .select("id, chinese_name, english_name, status")
            .eq("status", "active")
            .order("chinese_name", { ascending: true }),
        ]);

      if (schoolResult.error) {
        throw schoolResult.error;
      }

      if (eventResult.error) {
        throw eventResult.error;
      }

      if (teacherResult.error) {
        throw teacherResult.error;
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
      setTeachers(teacherResult.data || []);
    } catch (error) {
      console.error("讀取行事項目失敗：", error);

      setErrorMessage(
        error?.message
          ? `讀取行事項目失敗：${error.message}`
          : "讀取行事項目失敗，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingId("");

    setForm({
      ...EMPTY_FORM,
      schoolId:
        schools.length > 1
          ? ALL_SCHOOLS_VALUE
          : schools[0]?.id || "",
      startDate: semesterStartDate || "",
    });

    setErrorMessage("");
    setSuccessMessage("");
    setShowForm(true);
  }

  function openEditForm(eventItem) {
    setEditingId(eventItem.id);

    setForm({
      category: eventItem.category || "SCHOOL",
      schoolId: eventItem.applies_to_all_schools
        ? ALL_SCHOOLS_VALUE
        : eventItem.school_id || "",
      startDate: eventItem.start_date || "",
      endDate: eventItem.end_date || "",
      eventType: eventItem.event_type || "OTHER",
      customTitle:
        eventItem.event_type === "OTHER"
          ? eventItem.title || ""
          : "",
      notes: eventItem.notes || "",
      affectsPickup:
        eventItem.affects_pickup === true,

      morningBriefEnabled:
        eventItem.morning_brief_enabled === true,
      reminderType:
        eventItem.reminder_type || "NOTICE",
      reminderDaysBefore:
        Number(eventItem.reminder_days_before || 0),
      reminderAudience:
        eventItem.reminder_audience || "ALL",
      reminderTeacherIds:
        Array.isArray(eventItem.reminder_teacher_ids)
          ? eventItem.reminder_teacher_ids
          : [],
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

    setForm((current) => {
      const nextForm = {
        ...current,
        [name]: type === "checkbox" ? checked : value,
      };

      if (name === "category") {
        const nextOptions =
          EVENT_TYPE_OPTIONS_BY_CATEGORY[value] ||
          EVENT_TYPE_OPTIONS_BY_CATEGORY.SCHOOL;

        nextForm.eventType = nextOptions[0].value;
        nextForm.customTitle = "";

        if (value !== "SCHOOL") {
          nextForm.schoolId = "";
          nextForm.affectsPickup = false;
        } else {
          nextForm.schoolId =
            schools.length > 1
              ? ALL_SCHOOLS_VALUE
              : schools[0]?.id || "";
        }
      }

      if (
        name === "eventType" &&
        value !== "OTHER"
      ) {
        nextForm.customTitle = "";
      }

      if (
        name === "morningBriefEnabled" &&
        !checked
      ) {
        nextForm.reminderType = "NOTICE";
        nextForm.reminderDaysBefore = 0;
        nextForm.reminderAudience = "ALL";
        nextForm.reminderTeacherIds = [];
      }

      if (
        name === "reminderAudience" &&
        value === "ALL"
      ) {
        nextForm.reminderTeacherIds = [];
      }

      return nextForm;
    });
  }

  function toggleReminderTeacher(teacherId) {
    setForm((current) => {
      const selected = new Set(
        current.reminderTeacherIds || []
      );

      if (selected.has(teacherId)) {
        selected.delete(teacherId);
      } else {
        selected.add(teacherId);
      }

      return {
        ...current,
        reminderTeacherIds: Array.from(selected),
      };
    });
  }

  function validateForm() {
    if (form.category === "SCHOOL" && !form.schoolId) {
      return "請選擇適用學校。";
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

    if (!form.eventType) {
      return "請選擇行事類型。";
    }

    if (
      form.eventType === "OTHER" &&
      !form.customTitle.trim()
    ) {
      return "選擇其他時，請輸入自訂名稱。";
    }

    if (
      form.morningBriefEnabled &&
      Number(form.reminderDaysBefore) < 0
    ) {
      return "提前提醒天數不可小於 0。";
    }

    if (
      form.morningBriefEnabled &&
      form.reminderAudience === "SELECTED" &&
      (form.reminderTeacherIds || []).length === 0
    ) {
      return "請至少選擇一位提醒老師。";
    }

    return "";
  }

  function getPayloadTitle() {
    if (form.eventType === "OTHER") {
      return form.customTitle.trim();
    }

    return (
      EVENT_TYPE_LABELS[form.eventType] ||
      "學校行事"
    );
  }

  function createPayload() {
    const isSchoolCategory = form.category === "SCHOOL";
    const appliesToAllSchools =
      isSchoolCategory &&
      form.schoolId === ALL_SCHOOLS_VALUE;

    return {
      semester_id: semesterId,
      category: form.category,
      display_order: 0,
      school_id:
        isSchoolCategory && !appliesToAllSchools
          ? form.schoolId
          : null,
      applies_to_all_schools: appliesToAllSchools,
      start_date: form.startDate,
      end_date: form.endDate || null,
      title: getPayloadTitle(),
      event_type: form.eventType,
      notes: form.notes.trim() || null,
      affects_pickup: form.affectsPickup,

      morning_brief_enabled:
        form.morningBriefEnabled,
      reminder_type:
        form.morningBriefEnabled
          ? form.reminderType
          : "NOTICE",
      reminder_days_before:
        form.morningBriefEnabled
          ? Number(form.reminderDaysBefore || 0)
          : 0,
      reminder_audience:
        form.morningBriefEnabled
          ? form.reminderAudience
          : "ALL",
      reminder_teacher_ids:
        form.morningBriefEnabled &&
        form.reminderAudience === "SELECTED"
          ? form.reminderTeacherIds
          : [],

      updated_at: new Date().toISOString(),
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationMessage = validateForm();

    if (validationMessage) {
      setErrorMessage(validationMessage);
      setSuccessMessage("");
      return;
    }

    const payload = createPayload();

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

        const scopeLabel =
          payload.category === "SCHOOL"
            ? payload.applies_to_all_schools
              ? "全部學校"
              : schoolMap[payload.school_id] || "指定學校"
            : CATEGORY_LABELS[payload.category] || "行事規劃";

        setSuccessMessage(
          `已新增「${scopeLabel}－${payload.title}」。`
        );
      }

      setEditingId("");
      setForm(EMPTY_FORM);
      setShowForm(false);

      await loadPanelData();
    } catch (error) {
      console.error("儲存行事項目失敗：", error);

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
    const eventTitle =
      getEventDisplayTitle(eventItem);

    const schoolLabel =
      (eventItem.category || "SCHOOL") === "SCHOOL"
        ? eventItem.applies_to_all_schools
          ? "全部學校"
          : schoolMap[eventItem.school_id] ||
            "指定學校"
        : CATEGORY_LABELS[eventItem.category] ||
          "行事規劃";

    const confirmed = window.confirm(
      `確定要刪除「${schoolLabel}－${eventTitle}」嗎？`
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
        `已刪除「${schoolLabel}－${eventTitle}」。`
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
              CALENDAR EVENTS
            </p>

            <h3>學期行事規劃</h3>

            <span>
              統整學校日程、學科安排、教室活動與行政工作。
            </span>
          </div>

          <button
            type="button"
            className="calendar-primary-button"
            onClick={openCreateForm}
            disabled={loading || schools.length === 0}
          >
            ＋新增行事項目
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
            正在讀取行事項目…
          </p>
        ) : sortedEvents.length === 0 ? (
          <div className="calendar-empty-state calendar-empty-state--small">
            <p>目前還沒有行事項目。</p>

            <span>
              可依學校公告與倍思內部規劃逐步新增。
            </span>
          </div>
        ) : (
          <div className="school-event-list">
            {sortedEvents.map((eventItem) => {
              const eventCategory =
                eventItem.category || "SCHOOL";

              const schoolLabel =
                eventCategory === "SCHOOL"
                  ? eventItem.applies_to_all_schools
                    ? "全部學校"
                    : schoolMap[eventItem.school_id] ||
                      "未知學校"
                  : "";

              const eventTitle =
                getEventDisplayTitle(eventItem);

              return (
                <article
                  key={eventItem.id}
                  className="school-event-item"
                >
                  <div className="school-event-item__date">
                    <strong>
                      {formatDate(
                        eventItem.start_date
                      )}
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
                        {CATEGORY_LABELS[eventCategory] ||
                          "學校重要事務"}
                      </span>

                      {schoolLabel && (
                        <span className="school-event-school">
                          {schoolLabel}
                        </span>
                      )}

                      <span className="school-event-type">
                        {eventTitle}
                      </span>

                      {eventItem.affects_pickup && (
                        <span className="school-event-pickup">
                          影響接送
                        </span>
                      )}

                      {eventItem.morning_brief_enabled && (
                        <span className="school-event-pickup">
                          晨報
                        </span>
                      )}

                      {eventItem.morning_brief_enabled &&
                        eventItem.reminder_type === "TASK" && (
                          <span className="school-event-type">
                            需完成
                          </span>
                        )}
                    </div>

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
              );
            })}
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
                  CALENDAR EVENT
                </p>

                <h2 id="school-event-form-title">
                  {editingId
                    ? "修改行事項目"
                    : "新增行事項目"}
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
                <span>規劃分類</span>

                <select
                  name="category"
                  value={form.category}
                  onChange={handleFormChange}
                  disabled={saving}
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {form.category === "SCHOOL" && (
                <label className="calendar-field">
                  <span>適用學校</span>

                <select
                  name="schoolId"
                  value={form.schoolId}
                  onChange={handleFormChange}
                  disabled={saving}
                >
                  <option value="">
                    請選擇適用學校
                  </option>

                  {schools.length > 1 && (
                    <option value={ALL_SCHOOLS_VALUE}>
                      全部學校
                    </option>
                  )}

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
              )}

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
                  {currentEventTypeOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {form.eventType === "OTHER" && (
                <label className="calendar-field">
                  <span>事項名稱</span>

                  <input
                    type="text"
                    name="customTitle"
                    value={form.customTitle}
                    onChange={handleFormChange}
                    placeholder="請輸入事項名稱"
                    disabled={saving}
                  />
                </label>
              )}

              <label className="calendar-field">
                <span>備註（選填）</span>

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  placeholder="可補充放學時間或其他特殊安排。"
                  rows="4"
                  disabled={saving}
                />
              </label>

              {form.category === "SCHOOL" && (
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
              )}

              <section
                style={{
                  marginTop: "4px",
                  padding: "16px",
                  border: "1px solid #e3e6df",
                  borderRadius: "12px",
                  background: "#fafbf8",
                  display: "grid",
                  gap: "14px",
                }}
              >
                <div>
                  <strong
                    style={{
                      display: "block",
                      fontSize: "14px",
                      color: "#39443d",
                    }}
                  >
                    晨報與任務
                  </strong>

                  <span
                    style={{
                      display: "block",
                      marginTop: "4px",
                      fontSize: "12px",
                      color: "#7c857e",
                      lineHeight: 1.6,
                    }}
                  >
                    行事曆日期就是任務基準日；若為區間事項，
                    會以開始日期往前計算提醒日。
                  </span>
                </div>

                <label className="school-event-checkbox">
                  <input
                    type="checkbox"
                    name="morningBriefEnabled"
                    checked={form.morningBriefEnabled}
                    onChange={handleFormChange}
                    disabled={saving}
                  />

                  <span>加入晨報提醒</span>
                </label>

                {form.morningBriefEnabled && (
                  <>
                    <label className="calendar-field">
                      <span>提醒類型</span>

                      <select
                        name="reminderType"
                        value={form.reminderType}
                        onChange={handleFormChange}
                        disabled={saving}
                      >
                        <option value="NOTICE">
                          通知－只需知道
                        </option>
                        <option value="TASK">
                          任務－需要完成
                        </option>
                      </select>
                    </label>

                    <label className="calendar-field">
                      <span>提前幾天開始提醒</span>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        name="reminderDaysBefore"
                        value={form.reminderDaysBefore}
                        onChange={handleFormChange}
                        disabled={saving}
                      />
                    </label>

                    <label className="calendar-field">
                      <span>提醒對象</span>

                      <select
                        name="reminderAudience"
                        value={form.reminderAudience}
                        onChange={handleFormChange}
                        disabled={saving}
                      >
                        <option value="ALL">
                          全部在職老師
                        </option>
                        <option value="SELECTED">
                          指定老師
                        </option>
                      </select>
                    </label>

                    {form.reminderAudience === "SELECTED" && (
                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#707970",
                          }}
                        >
                          指定老師
                        </span>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: "8px",
                          }}
                        >
                          {teachers.map((teacher) => {
                            const checked =
                              form.reminderTeacherIds.includes(
                                teacher.id
                              );

                            const displayName =
                              teacher.chinese_name ||
                              teacher.english_name ||
                              "未命名老師";

                            return (
                              <label
                                key={teacher.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  minHeight: "38px",
                                  padding: "8px 10px",
                                  border:
                                    "1px solid #dfe4dc",
                                  borderRadius: "9px",
                                  background: checked
                                    ? "#eef5ef"
                                    : "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleReminderTeacher(
                                      teacher.id
                                    )
                                  }
                                  disabled={saving}
                                />

                                <span>{displayName}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {form.reminderType === "TASK" && (
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "9px",
                          background: "#f2f6f1",
                          fontSize: "12px",
                          lineHeight: 1.7,
                          color: "#647067",
                        }}
                      >
                        任務型事項會從提醒日起持續出現在晨報，
                        完成後才停止；超過行事曆日期仍未完成時，
                        後續會標記為逾期。
                      </div>
                    )}
                  </>
                )}
              </section>

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