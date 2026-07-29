import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const EMPTY_FORM = {
  name: "",
  startDate: "",
  endDate: "",
  notes: "",
};

const STATUS_LABELS = {
  DRAFT: "草稿",
  CONFIRMED: "已確認",
  NEEDS_RECONFIRMATION: "待重新確認",
  ARCHIVED: "已封存",
};

function formatDate(dateValue) {
  if (!dateValue) return "未設定";

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${dateValue}T00:00:00`));
}

function SemesterSetupPanel() {
  const [semesters, setSemesters] = useState([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [semesterSchools, setSemesterSchools] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [loadingSemesters, setLoadingSemesters] = useState(true);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [saving, setSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedSemester = useMemo(
    () =>
      semesters.find((semester) => semester.id === selectedSemesterId) || null,
    [semesters, selectedSemesterId]
  );

  useEffect(() => {
    loadSemesters();
  }, []);

  useEffect(() => {
    if (!selectedSemesterId) {
      setSemesterSchools([]);
      return;
    }

    loadSemesterSchools(selectedSemesterId);
  }, [selectedSemesterId]);

  async function loadSemesters(preferredSemesterId = "") {
    try {
      setLoadingSemesters(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("calendar_semesters")
        .select(
          "id, name, start_date, end_date, status, notes, confirmed_at, created_at"
        )
        .order("start_date", { ascending: false });

      if (error) {
        throw error;
      }

      const nextSemesters = data || [];
      setSemesters(nextSemesters);

      const semesterStillExists = nextSemesters.some(
        (semester) => semester.id === selectedSemesterId
      );

      if (preferredSemesterId) {
        setSelectedSemesterId(preferredSemesterId);
      } else if (!semesterStillExists && nextSemesters.length > 0) {
        setSelectedSemesterId(nextSemesters[0].id);
      } else if (nextSemesters.length === 0) {
        setSelectedSemesterId("");
      }
    } catch (error) {
      console.error("讀取學期失敗：", error);
      setErrorMessage(
        error?.message
          ? `讀取學期失敗：${error.message}`
          : "讀取學期失敗，請稍後再試。"
      );
    } finally {
      setLoadingSemesters(false);
    }
  }

  async function loadSemesterSchools(semesterId) {
    try {
      setLoadingSchools(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("calendar_semester_schools")
        .select(
          `
            id,
            is_included,
            school_id,
            calendar_schools (
              id,
              name,
              is_active,
              sort_order
            )
          `
        )
        .eq("semester_id", semesterId)
        .eq("is_included", true);

      if (error) {
        throw error;
      }

      const schools = (data || [])
        .map((item) => ({
          relationId: item.id,
          id: item.calendar_schools?.id,
          name: item.calendar_schools?.name,
          sortOrder: item.calendar_schools?.sort_order ?? 999,
        }))
        .filter((school) => school.id && school.name)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      setSemesterSchools(schools);
    } catch (error) {
      console.error("讀取學期學校失敗：", error);
      setSemesterSchools([]);
      setErrorMessage(
        error?.message
          ? `讀取學校資料失敗：${error.message}`
          : "讀取學校資料失敗。"
      );
    } finally {
      setLoadingSchools(false);
    }
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setShowCreateForm(false);
  }

  async function handleCreateSemester(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    const semesterName = form.name.trim();

    if (!semesterName) {
      setErrorMessage("請輸入學期名稱。");
      return;
    }

    if (!form.startDate || !form.endDate) {
      setErrorMessage("請完整選擇學期開始日與結束日。");
      return;
    }

    if (form.endDate < form.startDate) {
      setErrorMessage("學期結束日不能早於開始日。");
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("calendar_semesters")
        .insert({
          name: semesterName,
          start_date: form.startDate,
          end_date: form.endDate,
          notes: form.notes.trim() || null,
          status: "DRAFT",
        })
        .select(
          "id, name, start_date, end_date, status, notes, confirmed_at, created_at"
        )
        .single();

      if (error) {
        throw error;
      }

      setSuccessMessage(`已建立「${data.name}」，並載入預設學校。`);
      setForm(EMPTY_FORM);
      setShowCreateForm(false);

      await loadSemesters(data.id);
    } catch (error) {
      console.error("建立學期失敗：", error);
      setErrorMessage(
        error?.message
          ? `建立學期失敗：${error.message}`
          : "建立學期失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="semester-layout">
      <aside className="semester-list-card">
        <div className="semester-card-heading">
          <div>
            <p className="semester-card-kicker">SEMESTERS</p>
            <h2>學期清單</h2>
          </div>

          <button
            type="button"
            className="calendar-primary-button"
            onClick={() => {
              setShowCreateForm(true);
              setErrorMessage("");
              setSuccessMessage("");
            }}
          >
            ＋新增學期
          </button>
        </div>

        {loadingSemesters ? (
          <p className="calendar-muted">正在讀取學期資料…</p>
        ) : semesters.length === 0 ? (
          <div className="calendar-empty-state">
            <p>目前還沒有建立學期。</p>
            <span>先新增第一個學期，系統會自動帶入預設學校。</span>
          </div>
        ) : (
          <div className="semester-list">
            {semesters.map((semester) => (
              <button
                key={semester.id}
                type="button"
                className={`semester-list-item ${
                  selectedSemesterId === semester.id ? "is-active" : ""
                }`}
                onClick={() => {
                  setSelectedSemesterId(semester.id);
                  setSuccessMessage("");
                  setErrorMessage("");
                }}
              >
                <div className="semester-list-item__top">
                  <strong>{semester.name}</strong>

                  <span
                    className={`semester-status semester-status--${semester.status.toLowerCase()}`}
                  >
                    {STATUS_LABELS[semester.status] || semester.status}
                  </span>
                </div>

                <span className="semester-list-item__date">
                  {formatDate(semester.start_date)}－
                  {formatDate(semester.end_date)}
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="semester-detail-card">
        {errorMessage && (
          <div className="calendar-message calendar-message--error">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="calendar-message calendar-message--success">
            {successMessage}
          </div>
        )}

        {showCreateForm ? (
          <form className="semester-form" onSubmit={handleCreateSemester}>
            <div className="semester-card-heading">
              <div>
                <p className="semester-card-kicker">NEW SEMESTER</p>
                <h2>建立新學期</h2>
              </div>
            </div>

            <div className="semester-form-grid">
              <label className="calendar-field calendar-field--full">
                <span>學期名稱</span>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleFormChange}
                  placeholder="例如：115學年度上學期"
                  autoFocus
                />
              </label>

              <label className="calendar-field">
                <span>學期開始日</span>
                <input
                  type="date"
                  name="startDate"
                  value={form.startDate}
                  onChange={handleFormChange}
                />
              </label>

              <label className="calendar-field">
                <span>學期結束日</span>
                <input
                  type="date"
                  name="endDate"
                  value={form.endDate}
                  onChange={handleFormChange}
                />
              </label>

              <label className="calendar-field calendar-field--full">
                <span>備註（選填）</span>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  placeholder="可先留白，之後仍可補充。"
                  rows="4"
                />
              </label>
            </div>

            <div className="semester-form-note">
              建立後會先標記為「草稿」，並自動載入林口、新林、麗園、麗林、路亞、康橋、東湖、頭湖及南勢。
            </div>

            <div className="semester-form-actions">
              <button
                type="button"
                className="calendar-secondary-button"
                onClick={resetForm}
                disabled={saving}
              >
                取消
              </button>

              <button
                type="submit"
                className="calendar-primary-button"
                disabled={saving}
              >
                {saving ? "建立中…" : "建立學期"}
              </button>
            </div>
          </form>
        ) : selectedSemester ? (
          <div className="semester-overview">
            <div className="semester-overview__header">
              <div>
                <p className="semester-card-kicker">CURRENT SEMESTER</p>
                <h2>{selectedSemester.name}</h2>
              </div>

              <span
                className={`semester-status semester-status--${selectedSemester.status.toLowerCase()}`}
              >
                {STATUS_LABELS[selectedSemester.status] ||
                  selectedSemester.status}
              </span>
            </div>

            <div className="semester-summary-grid">
              <div className="semester-summary-item">
                <span>開始日期</span>
                <strong>{formatDate(selectedSemester.start_date)}</strong>
              </div>

              <div className="semester-summary-item">
                <span>結束日期</span>
                <strong>{formatDate(selectedSemester.end_date)}</strong>
              </div>

              <div className="semester-summary-item">
                <span>目前狀態</span>
                <strong>
                  {STATUS_LABELS[selectedSemester.status] ||
                    selectedSemester.status}
                </strong>
              </div>
            </div>

            {selectedSemester.notes && (
              <div className="semester-notes">
                <span>備註</span>
                <p>{selectedSemester.notes}</p>
              </div>
            )}

            <div className="semester-school-section">
              <div className="semester-section-title">
                <div>
                  <p className="semester-card-kicker">SCHOOLS</p>
                  <h3>本學期學校</h3>
                </div>

                <span>{semesterSchools.length} 所</span>
              </div>

              {loadingSchools ? (
                <p className="calendar-muted">正在讀取學校資料…</p>
              ) : semesterSchools.length === 0 ? (
                <div className="calendar-empty-state calendar-empty-state--small">
                  <p>目前沒有載入學校。</p>
                  <span>請確認預設學校資料與資料庫權限。</span>
                </div>
              ) : (
                <div className="semester-school-tags">
                  {semesterSchools.map((school) => (
                    <span key={school.id}>{school.name}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="semester-next-step">
              <span>下一步</span>
              <p>
                建立這個學期的國定假日、教室休假日與特殊上班日。
              </p>
            </div>
          </div>
        ) : (
          <div className="calendar-empty-state calendar-empty-state--large">
            <p>請先選擇或新增一個學期。</p>
            <span>建立完成後，才能繼續設定學校與學期日程。</span>
          </div>
        )}
      </section>
    </div>
  );
}

export default SemesterSetupPanel;