import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function MakeupDrawer({
  onClose,
  onSaved,
}) {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [studentId, setStudentId] = useState("");
  const [makeupType, setMakeupType] = useState("ENGLISH");

  const [englishClasses, setEnglishClasses] = useState([]);
  const [talentClasses, setTalentClasses] = useState([]);

  const [sourceId, setSourceId] = useState("");

  const [makeupDate, setMakeupDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [notifyTeacherId, setNotifyTeacherId] =
    useState("");

  const [note, setNote] = useState("");

  const [searchText, setSearchText] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] =
    useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    if (!studentId) {
      setEnglishClasses([]);
      setTalentClasses([]);
      setSourceId("");
      return;
    }

    loadStudentClasses();
  }, [studentId]);

  useEffect(() => {
    setSourceId("");
  }, [makeupType]);

  async function loadBaseData() {
    try {
      setIsLoading(true);

      const [
        studentsResult,
        teachersResult,
      ] = await Promise.all([
        supabase
          .from("students")
          .select(`
            id,
            student_no,
            chinese_name,
            english_name,
            school,
            current_grade
          `)
          .eq("record_scope", "NORMAL")
          .eq("student_status", "ACTIVE")
          .order("current_grade")
          .order("chinese_name"),

        supabase
  .from("teachers")
  .select(`
    id,
    chinese_name,
    english_name,
    position,
    status
  `)
  .eq("status", "active")
  .order("chinese_name"),
      ]);

      if (studentsResult.error) {
        throw studentsResult.error;
      }

      if (teachersResult.error) {
        throw teachersResult.error;
      }

      setStudents(
        studentsResult.data || []
      );

      setTeachers(
        teachersResult.data || []
      );
    } catch (error) {
      console.error(
        "讀取補課基本資料失敗：",
        error
      );

      window.alert(
        `讀取資料失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadStudentClasses() {
    try {
      setIsLoadingClasses(true);

      const [
        englishResult,
        talentResult,
      ] = await Promise.all([
        supabase
          .from("english_class_students")
          .select(`
            id,
            english_class_id,
            status,
            english_classes (
              id,
              class_name,
              academic_year,
              term,
              teacher_name
            )
          `)
          .eq("student_id", studentId)
          .eq("status", "ACTIVE"),

        supabase
          .from("course_class_students")
          .select(`
            id,
            course_class_id,
            is_active,
            course_classes (
              id,
              class_name,
              weekday,
              start_time,
              end_time,
              course_id,
              courses (
                id,
                course_name
              )
            )
          `)
          .eq("student_id", studentId)
          .eq("is_active", true),
      ]);

      if (englishResult.error) {
        throw englishResult.error;
      }

      if (talentResult.error) {
        throw talentResult.error;
      }

      setEnglishClasses(
        englishResult.data || []
      );

      setTalentClasses(
        talentResult.data || []
      );
    } catch (error) {
      console.error(
        "讀取學生目前課程失敗：",
        error
      );

      window.alert(
        `讀取學生課程失敗：${error.message}`
      );

      setEnglishClasses([]);
      setTalentClasses([]);
    } finally {
      setIsLoadingClasses(false);
    }
  }

  const selectedStudent = useMemo(
    () =>
      students.find(
        (student) =>
          student.id === studentId
      ) || null,
    [students, studentId]
  );

  const filteredStudents = useMemo(() => {
    const keyword = searchText
      .trim()
      .toLowerCase();

    if (!keyword) {
      return [];
    }

    return students
      .filter((student) => {
        return (
          student.chinese_name
            ?.toLowerCase()
            .includes(keyword) ||
          student.english_name
            ?.toLowerCase()
            .includes(keyword) ||
          student.student_no
            ?.toLowerCase()
            .includes(keyword) ||
          student.school
            ?.toLowerCase()
            .includes(keyword) ||
          student.current_grade
            ?.toLowerCase()
            .includes(keyword)
        );
      })
      .slice(0, 12);
  }, [students, searchText]);

  function selectStudent(student) {
    setStudentId(student.id);

    setSearchText("");

    setSourceId("");
  }

  function clearStudent() {
    setStudentId("");

    setSearchText("");

    setEnglishClasses([]);
    setTalentClasses([]);

    setSourceId("");
  }

  async function handleSave(event) {
    event.preventDefault();

    if (!studentId) {
      window.alert("請選擇學生。");
      return;
    }

    if (!sourceId) {
      window.alert(
        makeupType === "ENGLISH"
          ? "請選擇美語班。"
          : "請選擇才藝班。"
      );
      return;
    }

    if (!makeupDate) {
      window.alert("請選擇補課日期。");
      return;
    }

    if (!startTime) {
      window.alert("請輸入補課時間。");
      return;
    }

    if (!notifyTeacherId) {
      window.alert(
        "請選擇要通知的安親老師。"
      );
      return;
    }

    if (
      endTime &&
      endTime <= startTime
    ) {
      window.alert(
        "結束時間必須晚於開始時間。"
      );
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        student_id: studentId,
        makeup_type: makeupType,

        english_class_id:
          makeupType === "ENGLISH"
            ? sourceId
            : null,

        course_class_id:
          makeupType === "TALENT"
            ? sourceId
            : null,

        makeup_date: makeupDate,
        original_makeup_date:
          makeupDate,

        start_time: startTime,
        original_start_time:
          startTime,

        end_time:
          endTime || null,

        notify_teacher_id:
          notifyTeacherId,

        status: "PENDING",

        note:
          note.trim() || null,

        updated_at:
          new Date().toISOString(),
      };

      const { error } = await supabase
        .from("makeup_classes")
        .insert([payload]);

      if (error) {
        throw error;
      }

      if (onSaved) {
        await onSaved();
      }

      onClose();

      window.alert(
        "補課已建立。"
      );
    } catch (error) {
      console.error(
        "建立補課失敗：",
        error
      );

      window.alert(
        `建立補課失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="makeupDrawer__backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !isSaving
        ) {
          onClose();
        }
      }}
    >
      <form
        className="makeupDrawer"
        onSubmit={handleSave}
      >
        <header className="makeupDrawer__header">
          <div>
            <p>NEW MAKEUP</p>

            <h2>新增補課</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="makeupDrawer__body">
          <section className="makeupDrawer__section">
            <h3>學生</h3>

            {selectedStudent ? (
              <div className="makeupDrawer__selectedStudent">
                <div>
                  <span>
                    已選學生
                  </span>

                  <strong>
                    {
                      selectedStudent.chinese_name
                    }
                  </strong>

                  <small>
                    {[
                      selectedStudent.current_grade,
                      selectedStudent.school,
                      selectedStudent.english_name,
                    ]
                      .filter(Boolean)
                      .join(" ・ ")}
                  </small>
                </div>

                <button
                  type="button"
                  onClick={clearStudent}
                  disabled={isSaving}
                >
                  重新選擇
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={searchText}
                  placeholder="輸入姓名、英文名、學校或學號..."
                  autoComplete="off"
                  onChange={(event) =>
                    setSearchText(
                      event.target.value
                    )
                  }
                />

                <div className="makeupDrawer__studentResults">
                  {!searchText.trim() ? (
                    <small>
                      請輸入關鍵字搜尋學生。
                    </small>
                  ) : filteredStudents.length ===
                    0 ? (
                    <small>
                      找不到符合條件的學生。
                    </small>
                  ) : (
                    filteredStudents.map(
                      (student) => (
                        <button
                          key={student.id}
                          type="button"
                          className="makeupDrawer__studentResult"
                          onClick={() =>
                            selectStudent(
                              student
                            )
                          }
                        >
                          <strong>
                            {
                              student.chinese_name
                            }
                          </strong>

                          <span>
                            {[
                              student.current_grade,
                              student.school,
                              student.english_name,
                            ]
                              .filter(
                                Boolean
                              )
                              .join(
                                " ・ "
                              )}
                          </span>
                        </button>
                      )
                    )
                  )}
                </div>
              </>
            )}
          </section>

          <section className="makeupDrawer__section">
            <h3>補課類型</h3>

            <div className="makeupDrawer__typeButtons">
              <button
                type="button"
                className={
                  makeupType === "ENGLISH"
                    ? "makeupDrawer__typeButton makeupDrawer__typeButton--active"
                    : "makeupDrawer__typeButton"
                }
                onClick={() =>
                  setMakeupType(
                    "ENGLISH"
                  )
                }
              >
                美語
              </button>

              <button
                type="button"
                className={
                  makeupType === "TALENT"
                    ? "makeupDrawer__typeButton makeupDrawer__typeButton--active"
                    : "makeupDrawer__typeButton"
                }
                onClick={() =>
                  setMakeupType(
                    "TALENT"
                  )
                }
              >
                才藝
              </button>
            </div>
          </section>

          <section className="makeupDrawer__section">
            <h3>
              原班級／課程
            </h3>

            {isLoadingClasses ? (
              <p>
                正在讀取學生課程……
              </p>
            ) : (
              <select
                value={sourceId}
                onChange={(event) =>
                  setSourceId(
                    event.target.value
                  )
                }
                disabled={!studentId}
              >
                <option value="">
                  {studentId
                    ? "請選擇班級／課程"
                    : "請先選擇學生"}
                </option>

                {makeupType ===
                "ENGLISH"
                  ? englishClasses.map(
                      (item) => (
                        <option
                          key={item.id}
                          value={
                            item.english_class_id
                          }
                        >
                          {
                            item
                              .english_classes
                              ?.class_name
                          }
                        </option>
                      )
                    )
                  : talentClasses.map(
                      (item) => {
                        const classItem =
                          item.course_classes;

                        const courseName =
                          classItem?.courses
                            ?.course_name;

                        return (
                          <option
                            key={item.id}
                            value={
                              item.course_class_id
                            }
                          >
                            {[
                              courseName,
                              classItem?.class_name,
                            ]
                              .filter(Boolean)
                              .join("・")}
                          </option>
                        );
                      }
                    )}
              </select>
            )}
          </section>

          <section className="makeupDrawer__section">
            <h3>
              補課日期與時間
            </h3>

            <div className="makeupDrawer__grid">
              <label>
                <span>補課日期</span>

                <input
                  type="date"
                  value={makeupDate}
                  onChange={(event) =>
                    setMakeupDate(
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span>開始時間</span>

                <input
                  type="time"
                  value={startTime}
                  onChange={(event) =>
                    setStartTime(
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span>結束時間</span>

                <input
                  type="time"
                  value={endTime}
                  onChange={(event) =>
                    setEndTime(
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </section>

          <section className="makeupDrawer__section">
            <h3>
              通知安親老師
            </h3>

            <select
              value={notifyTeacherId}
              onChange={(event) =>
                setNotifyTeacherId(
                  event.target.value
                )
              }
              disabled={isLoading}
            >
              <option value="">
                請選擇老師
              </option>

              {teachers.map(
                (teacher) => (
                  <option
                    key={teacher.id}
                    value={teacher.id}
                  >
                    {teacher.chinese_name}
                    {teacher.english_name
                      ? `・${teacher.english_name}`
                      : ""}
                  </option>
                )
              )}
            </select>

            <small>
              此老師之後會在補課當日的晨報收到提醒。
            </small>
          </section>

          <section className="makeupDrawer__section">
            <h3>備註</h3>

            <textarea
              rows="4"
              value={note}
              placeholder="可記錄補課原因、教材或其他提醒..."
              onChange={(event) =>
                setNote(
                  event.target.value
                )
              }
            />
          </section>
        </div>

        <footer className="makeupDrawer__footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            取消
          </button>

          <button
            type="submit"
            className="makeupDrawer__save"
            disabled={isSaving}
          >
            {isSaving
              ? "建立中……"
              : "建立補課"}
          </button>
        </footer>
      </form>
    </div>
  );
}

export default MakeupDrawer;