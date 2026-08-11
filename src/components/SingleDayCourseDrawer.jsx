import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import "./SingleDayCourseDrawer.css";

const INITIAL_FORM = {
  courseName: "",
  courseDate: "",
  startTime: "",
  endTime: "",
  teacherId: "",
  partnerName: "",
  note: "",
};

function getInitialForm(course) {
  if (!course) {
    return INITIAL_FORM;
  }

  return {
    courseName:
      course.course_name || "",

    courseDate:
      course.course_date || "",

    startTime:
      course.start_time
        ? String(course.start_time).slice(
            0,
            5
          )
        : "",

    endTime:
      course.end_time
        ? String(course.end_time).slice(
            0,
            5
          )
        : "",

    teacherId:
      course.teacher_id || "",

    partnerName:
      course.partner_name || "",

    note:
      course.note || "",
  };
}

function getCourseStudentIds(course) {
  if (!course) {
    return [];
  }

  return (
    course.single_day_course_students ||
    []
  )
    .map((item) => item.student_id)
    .filter(Boolean);
}

function SingleDayCourseDrawer({
  isOpen,
  onClose,
  onCreated,
  onUpdated,
  course = null,
}) {
  const isEditMode =
    Boolean(course?.id);

  const [form, setForm] =
    useState(INITIAL_FORM);

  const [teachers, setTeachers] =
    useState([]);

  const [students, setStudents] =
    useState([]);

  const [
    selectedStudentIds,
    setSelectedStudentIds,
  ] = useState([]);

  const [
    studentSearch,
    setStudentSearch,
  ] = useState("");

  const [
    isLoadingOptions,
    setIsLoadingOptions,
  ] = useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setForm(
      getInitialForm(course)
    );

    setSelectedStudentIds(
      getCourseStudentIds(course)
    );

    setStudentSearch("");

    loadOptions();
  }, [
    isOpen,
    course,
  ]);

  async function loadOptions() {
    try {
      setIsLoadingOptions(true);

      const [
        teachersResult,
        studentsResult,
      ] = await Promise.all([
        supabase
          .from("teachers")
          .select(`
            id,
            chinese_name,
            english_name,
            status
          `)
          .eq(
            "status",
            "active"
          )
          .order(
            "chinese_name"
          ),

        supabase
  .from("students")
  .select(`
    id,
    chinese_name,
    english_name,
    school,
    current_grade
  `)
  .order(
    "chinese_name"
  ),
      ]);

      if (
        teachersResult.error
      ) {
        throw teachersResult.error;
      }

      if (
        studentsResult.error
      ) {
        throw studentsResult.error;
      }

      setTeachers(
        teachersResult.data || []
      );

      setStudents(
        studentsResult.data || []
      );
    } catch (error) {
      console.error(
        "讀取單日課程選項失敗：",
        error
      );

      window.alert(
        `讀取資料失敗：${error.message}`
      );
    } finally {
      setIsLoadingOptions(false);
    }
  }

  const filteredStudents =
    useMemo(() => {
      const keyword =
        studentSearch
          .trim()
          .toLowerCase();

      if (!keyword) {
        return students;
      }

      return students.filter(
        (student) => {
          const searchableText = [
  student.chinese_name,
  student.english_name,
  student.school,
  student.current_grade,
]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return (
            searchableText.includes(
              keyword
            )
          );
        }
      );
    }, [
      students,
      studentSearch,
    ]);

  function updateForm(
    field,
    value
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleStudent(
    studentId
  ) {
    setSelectedStudentIds(
      (current) => {
        if (
          current.includes(
            studentId
          )
        ) {
          return current.filter(
            (id) =>
              id !== studentId
          );
        }

        return [
          ...current,
          studentId,
        ];
      }
    );
  }

  function removeStudent(
    studentId
  ) {
    setSelectedStudentIds(
      (current) =>
        current.filter(
          (id) =>
            id !== studentId
        )
    );
  }

  const selectedStudents =
    useMemo(
      () =>
        selectedStudentIds
          .map((studentId) =>
            students.find(
              (student) =>
                student.id ===
                studentId
            )
          )
          .filter(Boolean),
      [
        selectedStudentIds,
        students,
      ]
    );

  function validateForm() {
    if (
      !form.courseName.trim()
    ) {
      window.alert(
        "請輸入課程名稱。"
      );

      return false;
    }

    if (!form.courseDate) {
      window.alert(
        "請選擇課程日期。"
      );

      return false;
    }

    if (
      !form.startTime ||
      !form.endTime
    ) {
      window.alert(
        "請設定開始時間與結束時間。"
      );

      return false;
    }

    if (
      form.endTime <=
      form.startTime
    ) {
      window.alert(
        "結束時間必須晚於開始時間。"
      );

      return false;
    }

    return true;
  }

  function buildCoursePayload() {
    return {
      course_name:
        form.courseName.trim(),

      course_date:
        form.courseDate,

      start_time:
        form.startTime,

      end_time:
        form.endTime,

      teacher_id:
        form.teacherId || null,

      partner_name:
        form.partnerName.trim() ||
        null,

      note:
        form.note.trim() ||
        null,

      updated_at:
        new Date().toISOString(),
    };
  }

  async function createCourse() {
    const {
      data: createdCourse,
      error: courseError,
    } = await supabase
      .from(
        "single_day_courses"
      )
      .insert({
        ...buildCoursePayload(),
        status: "UPCOMING",
      })
      .select("id")
      .single();

    if (courseError) {
      throw courseError;
    }

    if (
      selectedStudentIds.length >
      0
    ) {
      const studentRows =
        selectedStudentIds.map(
          (studentId) => ({
            single_day_course_id:
              createdCourse.id,

            student_id:
              studentId,
          })
        );

      const {
        error: studentsError,
      } = await supabase
        .from(
          "single_day_course_students"
        )
        .insert(
          studentRows
        );

      if (studentsError) {
        await supabase
          .from(
            "single_day_courses"
          )
          .delete()
          .eq(
            "id",
            createdCourse.id
          );

        throw studentsError;
      }
    }

    if (onCreated) {
      await onCreated();
    }
  }

  async function updateCourse() {
    const {
      error: courseError,
    } = await supabase
      .from(
        "single_day_courses"
      )
      .update(
        buildCoursePayload()
      )
      .eq(
        "id",
        course.id
      );

    if (courseError) {
      throw courseError;
    }

    const {
      error: deleteStudentsError,
    } = await supabase
      .from(
        "single_day_course_students"
      )
      .delete()
      .eq(
        "single_day_course_id",
        course.id
      );

    if (
      deleteStudentsError
    ) {
      throw deleteStudentsError;
    }

    if (
      selectedStudentIds.length >
      0
    ) {
      const studentRows =
        selectedStudentIds.map(
          (studentId) => ({
            single_day_course_id:
              course.id,

            student_id:
              studentId,
          })
        );

      const {
        error: studentsError,
      } = await supabase
        .from(
          "single_day_course_students"
        )
        .insert(
          studentRows
        );

      if (studentsError) {
        throw studentsError;
      }
    }

    if (onUpdated) {
      await onUpdated();
    }
  }

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setIsSaving(true);

      if (isEditMode) {
        await updateCourse();
      } else {
        await createCourse();
      }

      onClose();
    } catch (error) {
      console.error(
        isEditMode
          ? "更新單日課程失敗："
          : "建立單日課程失敗：",
        error
      );

      window.alert(
        `${
          isEditMode
            ? "更新"
            : "建立"
        }單日課程失敗：${
          error.message
        }`
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="singleDayDrawer">
      <button
        type="button"
        className="singleDayDrawer__backdrop"
        onClick={onClose}
        aria-label={
          isEditMode
            ? "關閉編輯單日課程"
            : "關閉新增單日課程"
        }
      />

      <aside className="singleDayDrawer__panel">
        <header className="singleDayDrawer__header">
          <div>
            <p>
              {isEditMode
                ? "EDIT SINGLE-DAY COURSE"
                : "NEW SINGLE-DAY COURSE"}
            </p>

            <h2>
              {isEditMode
                ? "編輯單日課程"
                : "新增單日課程"}
            </h2>
          </div>

          <button
            type="button"
            className="singleDayDrawer__close"
            onClick={onClose}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <form
          className="singleDayDrawer__form"
          onSubmit={handleSubmit}
        >
          <section className="singleDayDrawer__section">
            <label>
              <span>
                課程名稱 *
              </span>

              <input
                type="text"
                value={
                  form.courseName
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "courseName",
                    event.target.value
                  )
                }
                placeholder="例如：科學探究工作坊"
              />
            </label>
          </section>

          <section className="singleDayDrawer__section">
            <h3>
              課程日期與時間
            </h3>

            <label>
              <span>
                課程日期 *
              </span>

              <input
                type="date"
                value={
                  form.courseDate
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "courseDate",
                    event.target.value
                  )
                }
              />
            </label>

            <div className="singleDayDrawer__twoColumns">
              <label>
                <span>
                  開始時間 *
                </span>

                <input
                  type="time"
                  value={
                    form.startTime
                  }
                  onChange={(
                    event
                  ) =>
                    updateForm(
                      "startTime",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span>
                  結束時間 *
                </span>

                <input
                  type="time"
                  value={
                    form.endTime
                  }
                  onChange={(
                    event
                  ) =>
                    updateForm(
                      "endTime",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </section>

          <section className="singleDayDrawer__section">
            <h3>
              授課與合作資訊
            </h3>

            <label>
              <span>
                授課老師
              </span>

              <select
                value={
                  form.teacherId
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "teacherId",
                    event.target.value
                  )
                }
                disabled={
                  isLoadingOptions
                }
              >
                <option value="">
                  不指定老師
                </option>

                {teachers.map(
                  (teacher) => (
                    <option
                      key={
                        teacher.id
                      }
                      value={
                        teacher.id
                      }
                    >
                      {teacher.chinese_name ||
                        teacher.english_name ||
                        "未命名老師"}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span>
                合作單位（選填）
              </span>

              <input
                type="text"
                value={
                  form.partnerName
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "partnerName",
                    event.target.value
                  )
                }
                placeholder="例如：雄獅文具想像力製造所"
              />
            </label>
          </section>

          <section className="singleDayDrawer__section">
            <div className="singleDayDrawer__studentHeading">
              <div>
                <h3>
                  參加學生
                </h3>

                <p>
                  已選擇{" "}
                  {
                    selectedStudentIds.length
                  }{" "}
                  位學生
                </p>
              </div>
            </div>

            <input
              type="search"
              className="singleDayDrawer__search"
              value={
                studentSearch
              }
              onChange={(
                event
              ) =>
                setStudentSearch(
                  event.target.value
                )
              }
              placeholder="搜尋學生姓名、學校或年級"
            />

            {selectedStudents.length >
              0 && (
              <div className="singleDayDrawer__selectedStudents">
                {selectedStudents.map(
                  (student) => (
                    <button
                      key={
                        student.id
                      }
                      type="button"
                      onClick={() =>
                        removeStudent(
                          student.id
                        )
                      }
                    >
                      {student.chinese_name ||
                        student.english_name}

                      <span>
                        ×
                      </span>
                    </button>
                  )
                )}
              </div>
            )}

            <div className="singleDayDrawer__studentList">
              {isLoadingOptions ? (
                <div className="singleDayDrawer__studentEmpty">
                  正在讀取學生……
                </div>
              ) : filteredStudents.length ===
                0 ? (
                <div className="singleDayDrawer__studentEmpty">
                  找不到符合的學生。
                </div>
              ) : (
                filteredStudents.map(
                  (student) => {
                    const isSelected =
                      selectedStudentIds.includes(
                        student.id
                      );

                    return (
                      <button
                        key={
                          student.id
                        }
                        type="button"
                        className={
                          isSelected
                            ? "singleDayDrawer__student singleDayDrawer__student--selected"
                            : "singleDayDrawer__student"
                        }
                        onClick={() =>
                          toggleStudent(
                            student.id
                          )
                        }
                      >
                        <span>
                          <strong>
                            {student.chinese_name ||
                              student.english_name ||
                              "未命名學生"}
                          </strong>

                          <small>
                            {[
                              student.school,
                              student.current_grade,
                            ]
                              .filter(
                                Boolean
                              )
                              .join("・") ||
                              "—"}
                          </small>
                        </span>

                        <span className="singleDayDrawer__check">
                          {isSelected
                            ? "✓"
                            : ""}
                        </span>
                      </button>
                    );
                  }
                )
              )}
            </div>
          </section>

          <section className="singleDayDrawer__section">
            <label>
              <span>
                備註（選填）
              </span>

              <textarea
                rows="4"
                value={
                  form.note
                }
                onChange={(
                  event
                ) =>
                  updateForm(
                    "note",
                    event.target.value
                  )
                }
                placeholder="可記錄課程準備、特殊事項或其他資訊"
              />
            </label>
          </section>

          <footer className="singleDayDrawer__footer">
            <button
              type="button"
              className="singleDayDrawer__cancel"
              onClick={onClose}
              disabled={
                isSaving
              }
            >
              取消
            </button>

            <button
              type="submit"
              className="singleDayDrawer__save"
              disabled={
                isSaving
              }
            >
              {isSaving
                ? isEditMode
                  ? "儲存中……"
                  : "建立中……"
                : isEditMode
                  ? "儲存變更"
                  : "建立課程"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}

export default SingleDayCourseDrawer;