import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import DayOverridePanel from "./DayOverridePanel";
import CalendarDayTester from "./CalendarDayTester";

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
  const [allSchools, setAllSchools] = useState([]);

  const [showSchoolManager, setShowSchoolManager] = useState(false);
  const [schoolSelections, setSchoolSelections] = useState({});
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSchoolIsDefault, setNewSchoolIsDefault] = useState(false);
  const [savingSchools, setSavingSchools] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [loadingSemesters, setLoadingSemesters] = useState(true);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [saving, setSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedSemester = useMemo(() => {
    return (
      semesters.find(
        (semester) => semester.id === selectedSemesterId
      ) || null
    );
  }, [semesters, selectedSemesterId]);

  useEffect(() => {
    loadSemesters();
    loadAllSchools();
  }, []);

  useEffect(() => {
    if (!selectedSemesterId) {
      setSemesterSchools([]);
      return;
    }

    loadSemesterSchools(selectedSemesterId);
  }, [selectedSemesterId]);

  async function loadAllSchools() {
    try {
      const { data, error } = await supabase
        .from("calendar_schools")
        .select("id, name, is_active, is_default, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      setAllSchools(data || []);
    } catch (error) {
      console.error("讀取學校主檔失敗：", error);

      setErrorMessage(
        error?.message
          ? `讀取學校主檔失敗：${error.message}`
          : "讀取學校主檔失敗。"
      );
    }
  }

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
              is_default,
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
          isDefault: item.calendar_schools?.is_default ?? false,
          sortOrder: item.calendar_schools?.sort_order ?? 999,
        }))
        .filter((school) => school.id && school.name)
        .sort((a, b) => {
          const sortDifference = a.sortOrder - b.sortOrder;

          if (sortDifference !== 0) {
            return sortDifference;
          }

          return a.name.localeCompare(b.name, "zh-Hant");
        });

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

  function openSchoolManager() {
    const includedSchoolIds = new Set(
      semesterSchools.map((school) => school.id)
    );

    const selections = {};

    allSchools.forEach((school) => {
      selections[school.id] = includedSchoolIds.has(school.id);
    });

    setSchoolSelections(selections);
    setNewSchoolName("");
    setNewSchoolIsDefault(false);
    setErrorMessage("");
    setSuccessMessage("");
    setShowSchoolManager(true);
  }

  function closeSchoolManager() {
    if (savingSchools) {
      return;
    }

    setShowSchoolManager(false);
    setNewSchoolName("");
    setNewSchoolIsDefault(false);
  }

  function handleSchoolSelectionChange(schoolId) {
    setSchoolSelections((current) => ({
      ...current,
      [schoolId]: !current[schoolId],
    }));
  }

  async function handleSaveSchoolSelections() {
    if (!selectedSemesterId) {
      setErrorMessage("請先選擇學期。");
      return;
    }

    if (allSchools.length === 0) {
      setErrorMessage("目前沒有可設定的學校。");
      return;
    }

    try {
      setSavingSchools(true);
      setErrorMessage("");
      setSuccessMessage("");

      const relationRows = allSchools.map((school) => ({
        semester_id: selectedSemesterId,
        school_id: school.id,
        is_included: Boolean(schoolSelections[school.id]),
      }));

      const { error } = await supabase
        .from("calendar_semester_schools")
        .upsert(relationRows, {
          onConflict: "semester_id,school_id",
        });

      if (error) {
        throw error;
      }

      await loadSemesterSchools(selectedSemesterId);

      setShowSchoolManager(false);
      setSuccessMessage("已更新本學期學校。");
    } catch (error) {
      console.error("更新學期學校失敗：", error);

      setErrorMessage(
        error?.message
          ? `更新學期學校失敗：${error.message}`
          : "更新學期學校失敗，請稍後再試。"
      );
    } finally {
      setSavingSchools(false);
    }
  }

  async function handleAddSchool(event) {
    event.preventDefault();

    if (!selectedSemesterId) {
      setErrorMessage("請先選擇學期。");
      return;
    }

    const schoolName = newSchoolName.trim();

    if (!schoolName) {
      setErrorMessage("請輸入學校名稱。");
      return;
    }

    const normalizedSchoolName = schoolName.toLocaleLowerCase("zh-TW");

    const duplicateSchool = allSchools.some(
      (school) =>
        school.name.trim().toLocaleLowerCase("zh-TW") ===
        normalizedSchoolName
    );

    if (duplicateSchool) {
      setErrorMessage("這所學校已經存在。");
      return;
    }

    try {
      setSavingSchools(true);
      setErrorMessage("");
      setSuccessMessage("");

      const existingSortOrders = allSchools.map(
        (school) => school.sort_order ?? 0
      );

      const nextSortOrder =
        existingSortOrders.length > 0
          ? Math.max(...existingSortOrders) + 1
          : 1;

      const { data: newSchool, error: schoolError } = await supabase
        .from("calendar_schools")
        .insert({
          name: schoolName,
          is_active: true,
          is_default: newSchoolIsDefault,
          sort_order: nextSortOrder,
        })
        .select("id, name, is_active, is_default, sort_order")
        .single();

      if (schoolError) {
        throw schoolError;
      }

      const { error: relationError } = await supabase
        .from("calendar_semester_schools")
        .upsert(
          {
            semester_id: selectedSemesterId,
            school_id: newSchool.id,
            is_included: true,
          },
          {
            onConflict: "semester_id,school_id",
          }
        );

      if (relationError) {
        throw relationError;
      }

      const nextSchools = [...allSchools, newSchool].sort((a, b) => {
        const sortDifference =
          (a.sort_order ?? 999) - (b.sort_order ?? 999);

        if (sortDifference !== 0) {
          return sortDifference;
        }

        return a.name.localeCompare(b.name, "zh-Hant");
      });

      setAllSchools(nextSchools);

      setSchoolSelections((current) => ({
        ...current,
        [newSchool.id]: true,
      }));

      setNewSchoolName("");
      setNewSchoolIsDefault(false);

      await loadSemesterSchools(selectedSemesterId);

      setSuccessMessage(`已新增「${newSchool.name}」，並加入本學期。`);
    } catch (error) {
      console.error("新增學校失敗：", error);

      setErrorMessage(
        error?.message
          ? `新增學校失敗：${error.message}`
          : "新增學校失敗，請稍後再試。"
      );
    } finally {
      setSavingSchools(false);
    }
  }

  return (
    <>
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
                    setShowCreateForm(false);
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
                建立後會先標記為「草稿」，並自動載入所有預設學校。
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
                  <strong>
                    {formatDate(selectedSemester.start_date)}
                  </strong>
                </div>

                <div className="semester-summary-item">
                  <span>結束日期</span>
                  <strong>
                    {formatDate(selectedSemester.end_date)}
                  </strong>
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

                  <div className="semester-school-heading-actions">
                    <span>{semesterSchools.length} 所</span>

                    <button
                      type="button"
                      className="calendar-text-button"
                      onClick={openSchoolManager}
                    >
                      ＋管理學校
                    </button>
                  </div>
                </div>

                {loadingSchools ? (
                  <p className="calendar-muted">正在讀取學校資料…</p>
                ) : semesterSchools.length === 0 ? (
                  <div className="calendar-empty-state calendar-empty-state--small">
                    <p>目前沒有載入學校。</p>
                    <span>請點擊「管理學校」加入學校。</span>
                  </div>
                ) : (
                  <div className="semester-school-tags">
                    {semesterSchools.map((school) => (
                      <span key={school.id}>{school.name}</span>
                    ))}
                  </div>
                )}
              </div>

              <DayOverridePanel
  semesterId={selectedSemester.id}
  semesterStartDate={selectedSemester.start_date}
  semesterEndDate={selectedSemester.end_date}
/>
<CalendarDayTester
  semesterId={selectedSemester.id}
  semesterStartDate={selectedSemester.start_date}
  semesterEndDate={selectedSemester.end_date}
/>
            </div>
          ) : (
            <div className="calendar-empty-state calendar-empty-state--large">
              <p>請先選擇或新增一個學期。</p>
              <span>建立完成後，才能繼續設定學校與學期日程。</span>
            </div>
          )}
        </section>
      </div>

      {showSchoolManager && (
        <div
          className="calendar-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !savingSchools
            ) {
              closeSchoolManager();
            }
          }}
        >
          <section
            className="calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="school-manager-title"
          >
            <header className="calendar-modal__header">
              <div>
                <p className="semester-card-kicker">
                  SCHOOL MANAGEMENT
                </p>

                <h2 id="school-manager-title">管理本學期學校</h2>
              </div>

              <button
                type="button"
                className="calendar-modal__close"
                onClick={closeSchoolManager}
                disabled={savingSchools}
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

            {successMessage && (
              <div className="calendar-message calendar-message--success">
                {successMessage}
              </div>
            )}

            {allSchools.length === 0 ? (
              <div className="calendar-empty-state calendar-empty-state--small">
                <p>目前還沒有任何學校。</p>
                <span>請在下方新增第一所學校。</span>
              </div>
            ) : (
              <div className="calendar-school-manager-list">
                {allSchools.map((school) => (
                  <label
                    key={school.id}
                    className={`calendar-school-option ${
                      schoolSelections[school.id]
                        ? "is-selected"
                        : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(
                        schoolSelections[school.id]
                      )}
                      onChange={() =>
                        handleSchoolSelectionChange(school.id)
                      }
                      disabled={savingSchools}
                    />

                    <span className="calendar-school-option__name">
                      {school.name}
                    </span>

                    {school.is_default && (
                      <span className="calendar-school-option__default">
                        預設
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <form
              className="calendar-add-school"
              onSubmit={handleAddSchool}
            >
              <div className="calendar-add-school__heading">
                <strong>新增學校</strong>
                <span>新增後會直接加入目前學期。</span>
              </div>

              <div className="calendar-add-school__row">
                <input
                  type="text"
                  value={newSchoolName}
                  onChange={(event) =>
                    setNewSchoolName(event.target.value)
                  }
                  placeholder="輸入學校名稱"
                  disabled={savingSchools}
                />

                <button
                  type="submit"
                  className="calendar-secondary-button"
                  disabled={savingSchools}
                >
                  {savingSchools ? "處理中…" : "新增"}
                </button>
              </div>

              <label className="calendar-default-checkbox">
                <input
                  type="checkbox"
                  checked={newSchoolIsDefault}
                  onChange={(event) =>
                    setNewSchoolIsDefault(event.target.checked)
                  }
                  disabled={savingSchools}
                />

                <span>
                  設為預設學校，之後建立新學期時自動加入
                </span>
              </label>
            </form>

            <footer className="calendar-modal__actions">
              <button
                type="button"
                className="calendar-secondary-button"
                onClick={closeSchoolManager}
                disabled={savingSchools}
              >
                取消
              </button>

              <button
                type="button"
                className="calendar-primary-button"
                onClick={handleSaveSchoolSelections}
                disabled={savingSchools}
              >
                {savingSchools
                  ? "儲存中…"
                  : "儲存學校設定"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

export default SemesterSetupPanel;