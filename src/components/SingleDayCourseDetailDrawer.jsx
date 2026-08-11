import { useState } from "react";
import { supabase } from "../lib/supabase";
import "./SingleDayCourseDetailDrawer.css";

function formatDate(dateString) {
  if (!dateString) {
    return "未設定";
  }

  const [year, month, day] =
    dateString.split("-");

  if (!year || !month || !day) {
    return dateString;
  }

  return `${year}/${month}/${day}`;
}

function formatTime(timeString) {
  if (!timeString) {
    return "未設定";
  }

  return timeString.slice(0, 5);
}

function getStatusLabel(status) {
  if (status === "COMPLETED") {
    return "已完成";
  }

  if (status === "CANCELLED") {
    return "已取消";
  }

  return "未開始";
}

function SingleDayCourseDetailDrawer({
  course,
  onClose,
  onChanged,
  onEdit,
}) {
  const [isProcessing, setIsProcessing] =
    useState(false);

  if (!course) {
    return null;
  }

  const teacher =
    course.teachers;

  const students =
    course.single_day_course_students ||
    [];

  async function refreshAndClose() {
    if (onChanged) {
      await onChanged();
    }

    onClose();
  }

  async function completeCourse() {
    const confirmed =
      window.confirm(
        `確定將「${course.course_name}」標示為已完成嗎？`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsProcessing(true);

      const { error } = await supabase
        .from("single_day_courses")
        .update({
          status: "COMPLETED",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", course.id);

      if (error) {
        throw error;
      }

      await refreshAndClose();
    } catch (error) {
      console.error(
        "完成單日課程失敗：",
        error
      );

      window.alert(
        `完成課程失敗：${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function cancelCourse() {
    const confirmed =
      window.confirm(
        `確定取消「${course.course_name}」嗎？\n\n取消後課程紀錄仍會保留。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsProcessing(true);

      const { error } = await supabase
        .from("single_day_courses")
        .update({
          status: "CANCELLED",
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", course.id);

      if (error) {
        throw error;
      }

      await refreshAndClose();
    } catch (error) {
      console.error(
        "取消單日課程失敗：",
        error
      );

      window.alert(
        `取消課程失敗：${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function deleteCourse() {
    const confirmed =
      window.confirm(
        `確定永久刪除「${course.course_name}」嗎？\n\n課程與參加學生名單都會刪除，而且無法復原。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsProcessing(true);

      const { error } = await supabase
        .from("single_day_courses")
        .delete()
        .eq("id", course.id);

      if (error) {
        throw error;
      }

      await refreshAndClose();
    } catch (error) {
      console.error(
        "永久刪除單日課程失敗：",
        error
      );

      window.alert(
        `永久刪除失敗：${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div
      className="singleDayDetail__backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !isProcessing
        ) {
          onClose();
        }
      }}
    >
      <aside className="singleDayDetail">
        <header className="singleDayDetail__header">
          <div>
            <p>
              SINGLE-DAY COURSE DETAIL
            </p>

            <h2>
              {course.course_name}
            </h2>

            <span>
              {getStatusLabel(
                course.status
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="singleDayDetail__body">
          <section className="singleDayDetail__section">
            <p>
              COURSE INFO
            </p>

            <h3>
              課程資訊
            </h3>

            <div className="singleDayDetail__infoGrid">
              <div>
                <span>
                  課程日期
                </span>

                <strong>
                  {formatDate(
                    course.course_date
                  )}
                </strong>
              </div>

              <div>
                <span>
                  課程時間
                </span>

                <strong>
                  {formatTime(
                    course.start_time
                  )}
                  {"－"}
                  {formatTime(
                    course.end_time
                  )}
                </strong>
              </div>

              <div>
                <span>
                  授課老師
                </span>

                <strong>
                  {teacher?.chinese_name ||
                    teacher?.english_name ||
                    "未設定"}
                </strong>
              </div>

              <div>
                <span>
                  合作單位
                </span>

                <strong>
                  {course.partner_name ||
                    "無"}
                </strong>
              </div>

              <div>
                <span>
                  目前狀態
                </span>

                <strong>
                  {getStatusLabel(
                    course.status
                  )}
                </strong>
              </div>

              <div>
                <span>
                  參加人數
                </span>

                <strong>
                  {students.length} 位
                </strong>
              </div>
            </div>
          </section>

          <section className="singleDayDetail__section">
            <div className="singleDayDetail__studentHeader">
              <div>
                <p>
                  PARTICIPANTS
                </p>

                <h3>
                  參加學生
                </h3>
              </div>

              <span>
                共 {students.length} 位
              </span>
            </div>

            {students.length === 0 ? (
              <div className="singleDayDetail__empty">
                目前沒有加入學生。
              </div>
            ) : (
              <div className="singleDayDetail__studentList">
                {students.map(
                  (item) => {
                    const student =
                      item.students;

                    return (
                      <div
                        key={item.id}
                        className="singleDayDetail__student"
                      >
                        <div>
                          <strong>
                            {student?.chinese_name ||
                              student?.english_name ||
                              "未命名學生"}
                          </strong>

                          <span>
                            {[
                              student?.current_grade,
                              student?.school,
                            ]
                              .filter(Boolean)
                              .join("・")}
                          </span>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>

          <section className="singleDayDetail__section">
            <p>
              NOTES
            </p>

            <h3>
              備註
            </h3>

            <div className="singleDayDetail__note">
              {course.note ||
                "目前沒有備註。"}
            </div>
          </section>
        </div>

        <footer className="singleDayDetail__footer">
          <button
  type="button"
  className="singleDayDetail__edit"
  onClick={() => {
    if (onEdit) {
      onEdit(course);
    }
  }}
  disabled={isProcessing}
>
  編輯課程
</button>

          <button
            type="button"
            className="singleDayDetail__complete"
            onClick={completeCourse}
            disabled={
              isProcessing ||
              course.status ===
                "COMPLETED"
            }
          >
            {course.status ===
            "COMPLETED"
              ? "已完成"
              : "完成課程"}
          </button>

          <button
            type="button"
            className="singleDayDetail__cancel"
            onClick={cancelCourse}
            disabled={
              isProcessing ||
              course.status ===
                "CANCELLED"
            }
          >
            {course.status ===
            "CANCELLED"
              ? "已取消"
              : "取消課程"}
          </button>

          <button
            type="button"
            className="singleDayDetail__delete"
            onClick={deleteCourse}
            disabled={isProcessing}
          >
            永久刪除
          </button>
        </footer>
      </aside>
    </div>
  );
}

export default SingleDayCourseDetailDrawer;