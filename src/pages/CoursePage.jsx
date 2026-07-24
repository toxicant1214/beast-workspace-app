import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./CoursePage.css";

const EMPTY_FORM = {
  course_name: "",
  note: "",
  is_active: true,
};

function CoursePage() {
  const [courses, setCourses] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    try {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("courses")
        .select(`
          id,
          course_name,
          is_active,
          note,
          created_at,
          updated_at,
          classes (
            id,
            is_active
          )
        `)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      setCourses(data || []);
    } catch (error) {
      console.error("讀取課程資料失敗：", error);
      setCourses([]);
      setLoadError(`讀取課程資料失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function openNewCourseDrawer() {
    setSelectedCourse(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setIsDrawerOpen(true);
  }

  function openEditCourseDrawer(course) {
    setSelectedCourse(course);

    setForm({
      course_name: course.course_name || "",
      note: course.note || "",
      is_active: course.is_active ?? true,
    });

    setFormError("");
    setIsDrawerOpen(true);
  }

  function closeDrawer() {
    if (isSaving) {
      return;
    }

    setIsDrawerOpen(false);
    setSelectedCourse(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
  }

  function updateForm(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));

    if (formError) {
      setFormError("");
    }
  }

  async function saveCourse(event) {
    event.preventDefault();

    const courseName = form.course_name.trim();
    const courseNote = form.note.trim();

    if (!courseName) {
      setFormError("請輸入課程名稱。");
      return;
    }

    const duplicatedCourse = courses.find((course) => {
      const isSameCourse =
        selectedCourse && course.id === selectedCourse.id;

      return (
        !isSameCourse &&
        course.course_name.trim().toLowerCase() ===
          courseName.toLowerCase()
      );
    });

    if (duplicatedCourse) {
      setFormError(`已經有「${duplicatedCourse.course_name}」這個課程。`);
      return;
    }

    const payload = {
      course_name: courseName,
      note: courseNote || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      setFormError("");

      if (selectedCourse) {
        const { error } = await supabase
          .from("courses")
          .update(payload)
          .eq("id", selectedCourse.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from("courses")
          .insert([payload]);

        if (error) {
          throw error;
        }
      }

      closeDrawer();
      await loadCourses();
    } catch (error) {
      console.error("儲存課程失敗：", error);

      if (error.code === "23505") {
        setFormError("這個課程名稱已經存在，請使用其他名稱。");
      } else {
        setFormError(`儲存課程失敗：${error.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCourseStatus(course) {
    const nextStatus = !course.is_active;
    const actionText = nextStatus ? "重新啟用" : "停用";

    const activeClassCount = getActiveClassCount(course);

    if (!nextStatus && activeClassCount > 0) {
      const confirmed = window.confirm(
        `「${course.course_name}」目前仍有 ${activeClassCount} 個啟用中的班級。\n\n停用課程不會刪除班級資料，但之後建立班級時將不再顯示此課程。\n\n確定要停用嗎？`
      );

      if (!confirmed) {
        return;
      }
    } else {
      const confirmed = window.confirm(
        `確定要${actionText}「${course.course_name}」嗎？`
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      const { error } = await supabase
        .from("courses")
        .update({
          is_active: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", course.id);

      if (error) {
        throw error;
      }

      await loadCourses();
    } catch (error) {
      console.error(`${actionText}課程失敗：`, error);
      window.alert(`${actionText}課程失敗：${error.message}`);
    }
  }

  function getClassCount(course) {
    return Array.isArray(course.classes)
      ? course.classes.length
      : 0;
  }

  function getActiveClassCount(course) {
    if (!Array.isArray(course.classes)) {
      return 0;
    }

    return course.classes.filter((classItem) => classItem.is_active).length;
  }

  const filteredCourses = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesKeyword =
        !keyword ||
        course.course_name?.toLowerCase().includes(keyword) ||
        course.note?.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && course.is_active) ||
        (statusFilter === "INACTIVE" && !course.is_active);

      return matchesKeyword && matchesStatus;
    });
  }, [courses, searchText, statusFilter]);

  const activeCourseCount = courses.filter(
    (course) => course.is_active
  ).length;

  const inactiveCourseCount =
    courses.length - activeCourseCount;

  const totalClassCount = courses.reduce(
    (total, course) => total + getClassCount(course),
    0
  );

  return (
    <div className="coursePage">
      <header className="coursePage__header">
        <div>
          <p className="coursePage__eyebrow">
            COURSE CENTER
          </p>

          <h1>課程管理</h1>

          <p className="coursePage__summary">
            建立倍思的課程類別，後續班級、學生修課、排課與學習紀錄，
            都會以課程作為共同依據。
          </p>
        </div>

        <button
          type="button"
          className="coursePage__primaryButton"
          onClick={openNewCourseDrawer}
        >
          ＋ 新增課程
        </button>
      </header>

      <section className="coursePage__stats">
        <div className="coursePage__statCard">
          <span>全部課程</span>
          <strong>{courses.length}</strong>
          <small>已建立的課程類別</small>
        </div>

        <div className="coursePage__statCard">
          <span>目前啟用</span>
          <strong>{activeCourseCount}</strong>
          <small>建立班級時可選擇</small>
        </div>

        <div className="coursePage__statCard">
          <span>已停用</span>
          <strong>{inactiveCourseCount}</strong>
          <small>保留歷史資料</small>
        </div>

        <div className="coursePage__statCard">
          <span>所屬班級</span>
          <strong>{totalClassCount}</strong>
          <small>已連結的班級總數</small>
        </div>
      </section>

      <section className="coursePage__content">
        <div className="coursePage__toolbar">
          <label className="coursePage__search">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              placeholder="搜尋課程名稱或備註..."
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value)
            }
            aria-label="課程狀態篩選"
          >
            <option value="ACTIVE">目前啟用</option>
            <option value="INACTIVE">已停用</option>
            <option value="ALL">全部狀態</option>
          </select>
        </div>

        <div className="coursePage__resultInfo">
          顯示 {filteredCourses.length} 個課程
        </div>

        {loadError && (
          <div className="coursePage__errorState">
            <p>{loadError}</p>

            <button type="button" onClick={loadCourses}>
              重新讀取
            </button>
          </div>
        )}

        {!loadError && isLoading && (
          <div className="coursePage__loadingState">
            正在讀取課程資料…
          </div>
        )}

        {!loadError &&
          !isLoading &&
          filteredCourses.length === 0 && (
            <div className="coursePage__emptyState">
              <div className="coursePage__emptyIcon">◎</div>

              <h2>
                {courses.length === 0
                  ? "尚未建立課程"
                  : "找不到符合條件的課程"}
              </h2>

              <p>
                {courses.length === 0
                  ? "先建立第一個課程，之後就能在課程底下新增班級。"
                  : "可以調整搜尋文字或狀態篩選。"}
              </p>

              {courses.length === 0 && (
                <button
                  type="button"
                  onClick={openNewCourseDrawer}
                >
                  ＋ 新增第一個課程
                </button>
              )}
            </div>
          )}

        {!loadError &&
          !isLoading &&
          filteredCourses.length > 0 && (
            <div className="coursePage__grid">
              {filteredCourses.map((course) => {
                const classCount = getClassCount(course);
                const activeClassCount =
                  getActiveClassCount(course);

                return (
                  <article
                    key={course.id}
                    className={`courseCard ${
                      course.is_active
                        ? ""
                        : "courseCard--inactive"
                    }`}
                  >
                    <div className="courseCard__top">
                      <div className="courseCard__symbol">
                        {course.course_name
                          ?.trim()
                          .charAt(0) || "課"}
                      </div>

                      <span
                        className={`courseCard__status ${
                          course.is_active
                            ? "courseCard__status--active"
                            : "courseCard__status--inactive"
                        }`}
                      >
                        {course.is_active
                          ? "啟用中"
                          : "已停用"}
                      </span>
                    </div>

                    <div className="courseCard__body">
                      <h2>{course.course_name}</h2>

                      <p
                        className={
                          course.note
                            ? "courseCard__note"
                            : "courseCard__note courseCard__note--empty"
                        }
                      >
                        {course.note ||
                          "尚未填寫課程備註。"}
                      </p>
                    </div>

                    <div className="courseCard__classInfo">
                      <div>
                        <span>全部班級</span>
                        <strong>{classCount}</strong>
                      </div>

                      <div>
                        <span>啟用班級</span>
                        <strong>{activeClassCount}</strong>
                      </div>
                    </div>

                    <div className="courseCard__actions">
                      <button
                        type="button"
                        className="courseCard__editButton"
                        onClick={() =>
                          openEditCourseDrawer(course)
                        }
                      >
                        編輯
                      </button>

                      <button
                        type="button"
                        className={
                          course.is_active
                            ? "courseCard__toggleButton courseCard__toggleButton--disable"
                            : "courseCard__toggleButton courseCard__toggleButton--enable"
                        }
                        onClick={() =>
                          toggleCourseStatus(course)
                        }
                      >
                        {course.is_active
                          ? "停用"
                          : "重新啟用"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
      </section>

      {isDrawerOpen && (
        <div
          className="courseDrawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-drawer-title"
        >
          <button
            type="button"
            className="courseDrawer__backdrop"
            onClick={closeDrawer}
            aria-label="關閉課程視窗"
          />

          <aside className="courseDrawer__panel">
            <header className="courseDrawer__header">
              <div>
                <p>COURSE DETAILS</p>

                <h2 id="course-drawer-title">
                  {selectedCourse
                    ? "編輯課程"
                    : "新增課程"}
                </h2>
              </div>

              <button
                type="button"
                className="courseDrawer__closeButton"
                onClick={closeDrawer}
                disabled={isSaving}
                aria-label="關閉"
              >
                ×
              </button>
            </header>

            <form
              className="courseDrawer__form"
              onSubmit={saveCourse}
            >
              <div className="courseDrawer__fields">
                <label className="courseDrawer__field">
                  <span>
                    課程名稱
                    <em>必填</em>
                  </span>

                  <input
                    type="text"
                    value={form.course_name}
                    onChange={(event) =>
                      updateForm(
                        "course_name",
                        event.target.value
                      )
                    }
                    placeholder="例如：五感作文"
                    maxLength={50}
                    autoFocus
                  />

                  <small>
                    課程是可重複使用的分類，例如外師美語、戰略圍棋。
                  </small>
                </label>

                <label className="courseDrawer__field">
                  <span>課程備註</span>

                  <textarea
                    value={form.note}
                    onChange={(event) =>
                      updateForm("note", event.target.value)
                    }
                    placeholder="可以記錄課程定位、適合年級或管理說明..."
                    rows={6}
                    maxLength={500}
                  />

                  <small>
                    {form.note.length}／500
                  </small>
                </label>

                <div className="courseDrawer__statusField">
                  <div>
                    <strong>課程狀態</strong>

                    <p>
                      停用後會保留原有班級與歷史資料，但建立新班級時不再提供選擇。
                    </p>
                  </div>

                  <label className="courseSwitch">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(event) =>
                        updateForm(
                          "is_active",
                          event.target.checked
                        )
                      }
                    />

                    <span className="courseSwitch__track">
                      <span className="courseSwitch__thumb" />
                    </span>

                    <strong>
                      {form.is_active
                        ? "啟用中"
                        : "已停用"}
                    </strong>
                  </label>
                </div>

                {formError && (
                  <div className="courseDrawer__error">
                    {formError}
                  </div>
                )}
              </div>

              <footer className="courseDrawer__footer">
                <button
                  type="button"
                  className="courseDrawer__cancelButton"
                  onClick={closeDrawer}
                  disabled={isSaving}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="courseDrawer__saveButton"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "儲存中…"
                    : selectedCourse
                      ? "儲存修改"
                      : "建立課程"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

export default CoursePage;