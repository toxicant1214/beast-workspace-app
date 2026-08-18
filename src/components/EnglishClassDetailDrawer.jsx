import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import AddStudentsToEnglishClassDrawer from "./AddStudentsToEnglishClassDrawer";

function formatDate(dateString) {
  if (!dateString) return "未設定";

  const [year, month, day] =
    dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${year}/${month}/${day}`;
}

function formatTime(timeString) {
  if (!timeString) return "未設定";

  return timeString.slice(0, 5);
}

const WEEKDAY_LABELS = {
  1: "星期一",
  2: "星期二",
  3: "星期三",
  4: "星期四",
  5: "星期五",
  6: "星期六",
  7: "星期日",
};

function EnglishClassDetailDrawer({
  classItem,
  onClose,
  onDelete,
  onToggleStatus,
}) {
  const [isAddStudentsOpen, setIsAddStudentsOpen] =
    useState(false);

  const [classStudents, setClassStudents] =
    useState([]);

  const [isLoadingStudents, setIsLoadingStudents] =
    useState(true);

  const [processingId, setProcessingId] =
    useState(null);

  const [isDeletingClass, setIsDeletingClass] =
    useState(false);

  const [isChangingClassStatus, setIsChangingClassStatus] =
    useState(false);

  useEffect(() => {
    if (classItem?.id) {
      loadClassStudents();
    }
  }, [classItem?.id]);

  if (!classItem) return null;

  const schedules =
    classItem.english_class_schedules || [];

  async function loadClassStudents() {
    try {
      setIsLoadingStudents(true);

      const { data, error } = await supabase
        .from("english_class_students")
        .select(`
          id,
          student_id,
          joined_at,
          status,
          students (
            id,
            student_no,
            chinese_name,
            english_name,
            school,
            current_grade
          )
        `)
        .eq(
          "english_class_id",
          classItem.id
        )
        .eq("status", "ACTIVE")
        .order(
          "joined_at",
          { ascending: true }
        );

      if (error) {
        throw error;
      }

      setClassStudents(data || []);
    } catch (error) {
      console.error(
        "讀取美語班學生失敗：",
        error
      );

      window.alert(
        `讀取美語班學生失敗：${error.message}`
      );

      setClassStudents([]);
    } finally {
      setIsLoadingStudents(false);
    }
  }

  function openAddStudents() {
    setIsAddStudentsOpen(true);
  }

  function closeAddStudents() {
    setIsAddStudentsOpen(false);
  }

  async function handleStudentsAdded() {
    await loadClassStudents();
  }

  async function toggleClassStatus() {
    if (
      !onToggleStatus ||
      isChangingClassStatus
    ) {
      return;
    }

    const className =
      classItem.class_name ||
      "這個美語班";

    const nextAction =
      classItem.is_active
        ? "停用"
        : "重新啟用";

    const confirmed =
      window.confirm(
        classItem.is_active
          ? `確定要停用美語班「${className}」嗎？\n\n停用只會將班級標記為已停用，班級、學生編班、上課時段與相關歷程都會保留。之後仍可重新啟用。`
          : `確定要重新啟用美語班「${className}」嗎？`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsChangingClassStatus(
        true
      );

      await onToggleStatus(
        classItem
      );

      window.alert(
        `已${nextAction}美語班「${className}」。`
      );
    } catch (error) {
      console.error(
        `${nextAction}美語班失敗：`,
        error
      );

      window.alert(
        `${nextAction}美語班失敗：${error.message}`
      );
    } finally {
      setIsChangingClassStatus(
        false
      );
    }
  }

  async function deleteClassPermanently() {
    if (!onDelete || isDeletingClass) {
      return;
    }

    const className =
      classItem.class_name ||
      "這個美語班";

    const firstConfirmed =
      window.confirm(
        `確定要永久刪除美語班「${className}」嗎？\n\n刪除後：\n・班級資料會永久移除\n・每週上課時段會一併刪除\n・學生的美語班編班紀錄會一併刪除\n・既有補課紀錄會保留，但不再連結此美語班`
      );

    if (!firstConfirmed) {
      return;
    }

    const secondConfirmed =
      window.confirm(
        `⚠️ 最後確認\n\n確定要永久刪除「${className}」嗎？\n\n此操作無法復原。`
      );

    if (!secondConfirmed) {
      return;
    }

    try {
      setIsDeletingClass(true);

      await onDelete(
        classItem
      );

      window.alert(
        `已永久刪除美語班「${className}」。`
      );
    } catch (error) {
      console.error(
        "永久刪除美語班失敗：",
        error
      );

      window.alert(
        `刪除美語班失敗：${error.message}`
      );
    } finally {
      setIsDeletingClass(false);
    }
  }

  async function removeMistakenStudent(item) {
    const studentName =
      item.students?.chinese_name ||
      "這位學生";

    const confirmed = window.confirm(
      `確定要將「${studentName}」從「${classItem.class_name}」移除嗎？\n\n此操作視為誤加，會永久刪除這筆美語班紀錄，不會保留歷程。`
    );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingId(item.id);

      const { error } = await supabase
        .from(
          "english_class_students"
        )
        .delete()
        .eq("id", item.id);

      if (error) {
        throw error;
      }

      await loadClassStudents();

      window.alert(
        `已移除「${studentName}」，不會保留美語班歷程。`
      );
    } catch (error) {
      console.error(
        "移除美語班學生失敗：",
        error
      );

      window.alert(
        `移除學生失敗：${error.message}`
      );
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <>
      <div
        className="englishClassDetail__backdrop"
        onMouseDown={(event) => {
          if (
            event.target ===
            event.currentTarget
          ) {
            onClose();
          }
        }}
      >
        <aside className="englishClassDetail">
          <header className="englishClassDetail__header">
            <div>
              <p>
                ENGLISH CLASS DETAIL
              </p>

              <h2>
                {classItem.class_name}
              </h2>

              <span>
                {[
                  classItem.academic_year,
                  classItem.term,
                ]
                  .filter(Boolean)
                  .join("・") ||
                  "未設定學期"}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="關閉"
            >
              ×
            </button>
          </header>

          <div className="englishClassDetail__body">
            <section className="englishClassDetail__section">
              <div className="englishClassDetail__sectionHeading">
                <p>CLASS INFO</p>
                <h3>班級資訊</h3>
              </div>

              <div className="englishClassDetail__infoGrid">
                <div>
                  <span>學年度</span>

                  <strong>
                    {classItem.academic_year ||
                      "未設定"}
                  </strong>
                </div>

                <div>
                  <span>學期</span>

                  <strong>
                    {classItem.term ||
                      "未設定"}
                  </strong>
                </div>

                <div>
                  <span>開始日期</span>

                  <strong>
                    {formatDate(
                      classItem.start_date
                    )}
                  </strong>
                </div>

                <div>
                  <span>結束日期</span>

                  <strong>
                    {formatDate(
                      classItem.end_date
                    )}
                  </strong>
                </div>

                <div>
                  <span>授課老師</span>

                  <strong>
                    {classItem.teacher_name ||
                      "未設定"}
                  </strong>
                </div>

                <div>
                  <span>班級狀態</span>

                  <strong>
                    {classItem.is_active
                      ? "啟用中"
                      : "已停用"}
                  </strong>
                </div>
              </div>
            </section>

            <section className="englishClassDetail__section">
              <div className="englishClassDetail__sectionHeading">
                <p>
                  WEEKLY SCHEDULE
                </p>

                <h3>
                  每週上課時間
                </h3>
              </div>

              <div className="englishClassDetail__scheduleList">
                {schedules.length ===
                0 ? (
                  <p>
                    尚未設定上課時段。
                  </p>
                ) : (
                  schedules.map(
                    (schedule) => (
                      <div
                        key={schedule.id}
                      >
                        <strong>
                          {
                            WEEKDAY_LABELS[
                              schedule.weekday
                            ]
                          }
                        </strong>

                        <span>
                          {formatTime(
                            schedule.start_time
                          )}
                          {"－"}
                          {formatTime(
                            schedule.end_time
                          )}
                        </span>
                      </div>
                    )
                  )
                )}
              </div>
            </section>

            <section className="englishClassDetail__section">
              <div className="englishClassDetail__studentHeader">
                <div>
                  <p>
                    CURRENT STUDENTS
                  </p>

                  <h3>
                    目前學生
                  </h3>

                  <span>
                    目前{" "}
                    {classStudents.length}{" "}
                    位學生
                  </span>
                </div>

                <button
                  type="button"
                  className="englishClassDetail__addStudent"
                  onClick={
                    openAddStudents
                  }
                >
                  ＋ 加入學生
                </button>
              </div>

              {isLoadingStudents ? (
                <div className="englishClassDetail__empty">
                  <strong>
                    正在讀取學生資料……
                  </strong>
                </div>
              ) : classStudents.length ===
                0 ? (
                <div className="englishClassDetail__empty">
                  <div>＋</div>

                  <strong>
                    目前還沒有學生
                  </strong>

                  <p>
                    可從既有學生資料中批次加入。
                  </p>
                </div>
              ) : (
                <div className="englishClassDetail__studentList">
                  {classStudents.map(
                    (item) => {
                      const student =
                        item.students;

                      if (!student) {
                        return null;
                      }

                      const isProcessing =
                        processingId ===
                        item.id;

                      return (
                        <div
                          key={item.id}
                          className="englishClassDetail__studentItem"
                        >
                          <div className="englishClassDetail__studentInfo">
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

                            <small>
                              加入於{" "}
                              {formatDate(
                                item.joined_at
                              )}
                            </small>
                          </div>

                          <button
                            type="button"
                            className="englishClassDetail__removeStudent"
                            disabled={
                              isProcessing
                            }
                            onClick={() =>
                              removeMistakenStudent(
                                item
                              )
                            }
                          >
                            {isProcessing
                              ? "處理中…"
                              : "刪除誤加"}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </section>

            <section className="englishClassDetail__section">
              <div className="englishClassDetail__sectionHeading">
                <p>CLASS STATUS</p>
                <h3>班級狀態</h3>
              </div>

              <p
                style={{
                  margin: "0 0 14px",
                  lineHeight: 1.7,
                }}
              >
                目前狀態：
                <strong>
                  {classItem.is_active
                    ? "啟用中"
                    : "已停用"}
                </strong>
                。停用不會刪除任何班級、學生編班、時段或歷程資料。
              </p>

              <button
                type="button"
                onClick={
                  toggleClassStatus
                }
                disabled={
                  isChangingClassStatus
                }
                style={{
                  width: "100%",
                  minHeight: "44px",
                  border: "1px solid #c9cec8",
                  borderRadius: "12px",
                  background: "#fff",
                  fontWeight: 700,
                  cursor:
                    isChangingClassStatus
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    isChangingClassStatus
                      ? 0.6
                      : 1,
                }}
              >
                {isChangingClassStatus
                  ? "處理中…"
                  : classItem.is_active
                    ? "停用班級"
                    : "重新啟用班級"}
              </button>
            </section>

            <section
              className="englishClassDetail__section"
              style={{
                border: "1px solid #ead1cc",
                background: "#fff8f6",
              }}
            >
              <div className="englishClassDetail__sectionHeading">
                <p>DANGER ZONE</p>
                <h3>永久刪除班級</h3>
              </div>

              <p
                style={{
                  margin: "0 0 14px",
                  color: "#7f655f",
                  lineHeight: 1.7,
                }}
              >
                僅建議用於測試班級、誤建班級或確定不需保留的資料。
                刪除後無法復原。
              </p>

              <button
                type="button"
                onClick={
                  deleteClassPermanently
                }
                disabled={
                  isDeletingClass
                }
                style={{
                  width: "100%",
                  minHeight: "44px",
                  border: "1px solid #d8a39a",
                  borderRadius: "12px",
                  background: "#fff",
                  color: "#a64f43",
                  fontWeight: 700,
                  cursor: isDeletingClass
                    ? "not-allowed"
                    : "pointer",
                  opacity: isDeletingClass
                    ? 0.6
                    : 1,
                }}
              >
                {isDeletingClass
                  ? "刪除中…"
                  : "永久刪除班級"}
              </button>
            </section>

            {classItem.note && (
              <section className="englishClassDetail__section">
                <div className="englishClassDetail__sectionHeading">
                  <p>NOTES</p>
                  <h3>備註</h3>
                </div>

                <div className="englishClassDetail__note">
                  {classItem.note}
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>

      {isAddStudentsOpen && (
        <AddStudentsToEnglishClassDrawer
          classItem={classItem}
          onClose={
            closeAddStudents
          }
          onAdded={
            handleStudentsAdded
          }
        />
      )}
    </>
  );
}

export default EnglishClassDetailDrawer;