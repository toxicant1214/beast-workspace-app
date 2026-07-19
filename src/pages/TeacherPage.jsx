import { useEffect, useMemo, useState } from "react";
import {
  createTeacher,
  getTeachers,
  setTeacherStatus,
  updateTeacher,
} from "../services/teacherService";
import "./TeacherPage.css";

const createEmptyForm = () => ({
  chinese_name: "",
  english_name: "",
  position: "",
  phone: "",
  email: "",
  hire_date: "",
  notes: "",
  status: "active",
});

function TeacherPage() {
  const [teachers, setTeachers] = useState([]);
  const [showInactive, setShowInactive] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [formData, setFormData] = useState(createEmptyForm());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const activeTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.status === "active"),
    [teachers]
  );

  const inactiveTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.status === "inactive"),
    [teachers]
  );

  const displayedTeachers = showInactive
    ? inactiveTeachers
    : activeTeachers;

  useEffect(() => {
    loadTeachers();
  }, []);

  async function loadTeachers() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await getTeachers({
        includeInactive: true,
      });

      setTeachers(data);
    } catch (error) {
      console.error(error);
      setErrorMessage("老師資料讀取失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingTeacherId(null);
    setFormData(createEmptyForm());
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(teacher) {
    setEditingTeacherId(teacher.id);

    setFormData({
      chinese_name: teacher.chinese_name ?? "",
      english_name: teacher.english_name ?? "",
      position: teacher.position ?? "",
      phone: teacher.phone ?? "",
      email: teacher.email ?? "",
      hire_date: teacher.hire_date ?? "",
      notes: teacher.notes ?? "",
      status: teacher.status ?? "active",
    });

    setErrorMessage("");
    setIsFormOpen(true);
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setIsFormOpen(false);
    setEditingTeacherId(null);
    setFormData(createEmptyForm());
    setErrorMessage("");
  }

  function handleInputChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.chinese_name.trim()) {
      setErrorMessage("請輸入老師中文姓名。");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");

      if (editingTeacherId) {
        await updateTeacher(editingTeacherId, formData);
      } else {
        await createTeacher(formData);
      }

      await loadTeachers();
      closeForm();
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error?.message || "老師資料儲存失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateTeacher(teacher) {
    const confirmed = window.confirm(
      `確定要停用「${teacher.chinese_name}」嗎？\n\n停用後將不會出現在老師任務的指派名單中，但過去紀錄會保留。`
    );

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");

      await setTeacherStatus(teacher.id, "inactive");
      await loadTeachers();
    } catch (error) {
      console.error(error);
      setErrorMessage("停用老師失敗，請稍後再試。");
    }
  }

  async function handleRestoreTeacher(teacher) {
    const confirmed = window.confirm(
      `確定要恢復「${teacher.chinese_name}」為在職老師嗎？`
    );

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");

      await setTeacherStatus(teacher.id, "active");
      await loadTeachers();
    } catch (error) {
      console.error(error);
      setErrorMessage("恢復老師失敗，請稍後再試。");
    }
  }

  return (
    <main className="teacher-page">
      <section className="teacher-page__header">
        <div>
          <p className="teacher-page__eyebrow">Teacher Management</p>
          <h1>老師管理</h1>
          <p className="teacher-page__description">
            管理老師基本資料與任職狀態。停用老師仍會保留過去的任務與完成紀錄。
          </p>
        </div>

        <button
          type="button"
          className="teacher-page__add-button"
          onClick={openCreateForm}
        >
          ＋ 新增老師
        </button>
      </section>

      <section className="teacher-summary">
        <article className="teacher-summary__card">
          <span>在職老師</span>
          <strong>{activeTeachers.length}</strong>
          <small>可接受任務指派</small>
        </article>

        <article className="teacher-summary__card">
          <span>停用老師</span>
          <strong>{inactiveTeachers.length}</strong>
          <small>保留歷史紀錄</small>
        </article>

        <article className="teacher-summary__card">
          <span>老師總數</span>
          <strong>{teachers.length}</strong>
          <small>包含在職與停用</small>
        </article>
      </section>

      <section className="teacher-list-section">
        <div className="teacher-list-section__toolbar">
          <div className="teacher-status-tabs">
            <button
              type="button"
              className={
                !showInactive
                  ? "teacher-status-tabs__button is-active"
                  : "teacher-status-tabs__button"
              }
              onClick={() => setShowInactive(false)}
            >
              在職老師
              <span>{activeTeachers.length}</span>
            </button>

            <button
              type="button"
              className={
                showInactive
                  ? "teacher-status-tabs__button is-active"
                  : "teacher-status-tabs__button"
              }
              onClick={() => setShowInactive(true)}
            >
              停用老師
              <span>{inactiveTeachers.length}</span>
            </button>
          </div>

          <button
            type="button"
            className="teacher-page__refresh-button"
            onClick={loadTeachers}
            disabled={loading}
          >
            {loading ? "讀取中…" : "重新整理"}
          </button>
        </div>

        {errorMessage && !isFormOpen && (
          <div className="teacher-page__error">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="teacher-page__empty">
            正在讀取老師資料…
          </div>
        ) : displayedTeachers.length === 0 ? (
          <div className="teacher-page__empty">
            <strong>
              {showInactive
                ? "目前沒有停用老師"
                : "目前尚未新增老師"}
            </strong>

            <p>
              {showInactive
                ? "老師停用後會顯示在這裡。"
                : "請先新增第一位老師，之後才能進行任務指派。"}
            </p>
          </div>
        ) : (
          <div className="teacher-grid">
            {displayedTeachers.map((teacher) => (
              <article
                className="teacher-card"
                key={teacher.id}
              >
                <div className="teacher-card__top">
                  <div className="teacher-card__avatar">
                    {teacher.chinese_name?.slice(0, 1)}
                  </div>

                  <div className="teacher-card__identity">
                    <div className="teacher-card__name-row">
                      <h2>{teacher.chinese_name}</h2>

                      <span
                        className={
                          teacher.status === "active"
                            ? "teacher-card__status is-active"
                            : "teacher-card__status is-inactive"
                        }
                      >
                        {teacher.status === "active"
                          ? "在職"
                          : "已停用"}
                      </span>
                    </div>

                    <p>
                      {teacher.english_name || "尚未填寫英文姓名"}
                    </p>
                  </div>
                </div>

                <div className="teacher-card__details">
                  <div>
                    <span>職務</span>
                    <strong>
                      {teacher.position || "尚未設定"}
                    </strong>
                  </div>

                  <div>
                    <span>電話</span>
                    <strong>
                      {teacher.phone || "尚未填寫"}
                    </strong>
                  </div>

                  <div>
                    <span>電子信箱</span>
                    <strong>
                      {teacher.email || "尚未填寫"}
                    </strong>
                  </div>

                  <div>
                    <span>到職日期</span>
                    <strong>
                      {teacher.hire_date || "尚未填寫"}
                    </strong>
                  </div>
                </div>

                {teacher.notes && (
                  <div className="teacher-card__notes">
                    {teacher.notes}
                  </div>
                )}

                <div className="teacher-card__actions">
                  <button
                    type="button"
                    className="teacher-card__edit-button"
                    onClick={() => openEditForm(teacher)}
                  >
                    編輯資料
                  </button>

                  {teacher.status === "active" ? (
                    <button
                      type="button"
                      className="teacher-card__deactivate-button"
                      onClick={() =>
                        handleDeactivateTeacher(teacher)
                      }
                    >
                      停用老師
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="teacher-card__restore-button"
                      onClick={() =>
                        handleRestoreTeacher(teacher)
                      }
                    >
                      恢復在職
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isFormOpen && (
        <div
          className="teacher-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm();
            }
          }}
        >
          <section
            className="teacher-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-form-title"
          >
            <div className="teacher-modal__header">
              <div>
                <p>Teacher Profile</p>
                <h2 id="teacher-form-title">
                  {editingTeacherId
                    ? "編輯老師資料"
                    : "新增老師"}
                </h2>
              </div>

              <button
                type="button"
                className="teacher-modal__close"
                onClick={closeForm}
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <form
              className="teacher-form"
              onSubmit={handleSubmit}
            >
              <div className="teacher-form__grid">
                <label className="teacher-form__field">
                  <span>
                    中文姓名
                    <b>必填</b>
                  </span>

                  <input
                    type="text"
                    name="chinese_name"
                    value={formData.chinese_name}
                    onChange={handleInputChange}
                    placeholder="例如：林小美"
                    autoFocus
                  />
                </label>

                <label className="teacher-form__field">
                  <span>英文姓名</span>

                  <input
                    type="text"
                    name="english_name"
                    value={formData.english_name}
                    onChange={handleInputChange}
                    placeholder="例如：Amy"
                  />
                </label>

                <label className="teacher-form__field">
                  <span>職務</span>

                  <input
                    type="text"
                    name="position"
                    value={formData.position}
                    onChange={handleInputChange}
                    placeholder="例如：安親老師"
                    list="teacher-position-options"
                  />

                  <datalist id="teacher-position-options">
                    <option value="安親老師" />
                    <option value="行政老師" />
                    <option value="美語老師" />
                    <option value="才藝老師" />
                    <option value="外師" />
                    <option value="主管" />
                  </datalist>
                </label>

                <label className="teacher-form__field">
                  <span>聯絡電話</span>

                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="例如：0912-345-678"
                  />
                </label>

                <label className="teacher-form__field teacher-form__field--wide">
                  <span>電子信箱</span>

                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="例如：teacher@example.com"
                  />
                </label>

                <label className="teacher-form__field">
                  <span>到職日期</span>

                  <input
                    type="date"
                    name="hire_date"
                    value={formData.hire_date}
                    onChange={handleInputChange}
                  />
                </label>

                <label className="teacher-form__field teacher-form__field--full">
                  <span>備註</span>

                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="可填寫老師負責班級、工作安排或其他備註"
                    rows="4"
                  />
                </label>
              </div>

              {errorMessage && (
                <div className="teacher-form__error">
                  {errorMessage}
                </div>
              )}

              <div className="teacher-form__actions">
                <button
                  type="button"
                  className="teacher-form__cancel"
                  onClick={closeForm}
                  disabled={saving}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="teacher-form__save"
                  disabled={saving}
                >
                  {saving
                    ? "儲存中…"
                    : editingTeacherId
                    ? "儲存修改"
                    : "新增老師"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default TeacherPage;