import { useState } from "react";
import { supabase } from "../lib/supabase";

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

function getStatusLabel(status) {
  if (status === "COMPLETED") {
    return "已完成";
  }

  if (status === "CANCELLED") {
    return "已取消";
  }

  return "待補課";
}

function MakeupDetailDrawer({
  makeupItem,
  onClose,
  onChanged,
}) {
  const [isProcessing, setIsProcessing] =
    useState(false);

  if (!makeupItem) {
    return null;
  }

  const student =
    makeupItem.students;

  const teacher =
    makeupItem.teachers;

  const isEnglish =
    makeupItem.makeup_type ===
    "ENGLISH";

  const courseName = isEnglish
    ? makeupItem.english_classes
        ?.class_name
    : [
        makeupItem.course_classes
          ?.courses?.course_name,
        makeupItem.course_classes
          ?.class_name,
      ]
        .filter(Boolean)
        .join("・");

  const hasRescheduled =
    Number(
      makeupItem.reschedule_count ||
        0
    ) > 0;

  async function refreshAndClose() {
    if (onChanged) {
      await onChanged();
    }

    onClose();
  }

  async function markCompleted() {
    const confirmed =
      window.confirm(
        `確定將「${student?.chinese_name || "這位學生"}」的補課標示為已完成嗎？`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsProcessing(true);

      const { error } =
        await supabase
          .from("makeup_classes")
          .update({
            status:
              "COMPLETED",
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            makeupItem.id
          );

      if (error) {
        throw error;
      }

      await refreshAndClose();
    } catch (error) {
      console.error(
        "完成補課失敗：",
        error
      );

      window.alert(
        `完成補課失敗：${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function cancelMakeup() {
    const confirmed =
      window.confirm(
        `確定取消「${student?.chinese_name || "這位學生"}」這筆補課嗎？\n\n取消後會保留紀錄。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsProcessing(true);

      const { error } =
        await supabase
          .from("makeup_classes")
          .update({
            status:
              "CANCELLED",
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            makeupItem.id
          );

      if (error) {
        throw error;
      }

      await refreshAndClose();
    } catch (error) {
      console.error(
        "取消補課失敗：",
        error
      );

      window.alert(
        `取消補課失敗：${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function deleteMakeup() {
    const confirmed =
      window.confirm(
        `確定永久刪除「${student?.chinese_name || "這位學生"}」這筆補課嗎？\n\n此操作不會保留紀錄，而且無法復原。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setIsProcessing(true);

      const { error } =
        await supabase
          .from("makeup_classes")
          .delete()
          .eq(
            "id",
            makeupItem.id
          );

      if (error) {
        throw error;
      }

      await refreshAndClose();
    } catch (error) {
      console.error(
        "永久刪除補課失敗：",
        error
      );

      window.alert(
        `永久刪除補課失敗：${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function rescheduleMakeup() {
    const currentDate =
      makeupItem.makeup_date;

    const currentTime =
      formatTime(
        makeupItem.start_time
      );

    const newDate =
      window.prompt(
        "請輸入新的補課日期（YYYY-MM-DD）：",
        currentDate
      );

    if (newDate === null) {
      return;
    }

    const trimmedDate =
      newDate.trim();

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        trimmedDate
      )
    ) {
      window.alert(
        "日期格式錯誤，請使用 YYYY-MM-DD。"
      );

      return;
    }

    const newTime =
      window.prompt(
        "請輸入新的補課開始時間（HH:MM）：",
        currentTime
      );

    if (newTime === null) {
      return;
    }

    const trimmedTime =
      newTime.trim();

    if (
      !/^\d{2}:\d{2}$/.test(
        trimmedTime
      )
    ) {
      window.alert(
        "時間格式錯誤，請使用 HH:MM。"
      );

      return;
    }

    updateReschedule(
      trimmedDate,
      trimmedTime
    );
  }

  async function updateReschedule(
    newDate,
    newTime
  ) {
    try {
      setIsProcessing(true);

      const { error } =
        await supabase
          .from("makeup_classes")
          .update({
            makeup_date:
              newDate,

            start_time:
              newTime,

            reschedule_count:
              Number(
                makeupItem.reschedule_count ||
                  0
              ) + 1,

            last_rescheduled_at:
              new Date().toISOString(),

            status:
              "PENDING",

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            makeupItem.id
          );

      if (error) {
        throw error;
      }

      await refreshAndClose();

      window.alert(
        "補課已改期。"
      );
    } catch (error) {
      console.error(
        "改期失敗：",
        error
      );

      window.alert(
        `改期失敗：${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div
      className="makeupDetail__backdrop"
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
      <aside className="makeupDetail">
        <header className="makeupDetail__header">
          <div>
            <p>
              MAKEUP DETAIL
            </p>

            <h2>
              {student?.chinese_name ||
                "補課詳情"}
            </h2>

            <span>
              {getStatusLabel(
                makeupItem.status
              )}
              {hasRescheduled
                ? " ・ ↻ 已改期"
                : ""}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={
              isProcessing
            }
            aria-label="關閉"
          >
            ×
          </button>
        </header>

        <div className="makeupDetail__body">
          <section className="makeupDetail__section">
            <p>
              MAKEUP INFO
            </p>

            <h3>
              補課資訊
            </h3>

            <div className="makeupDetail__infoGrid">
              <div>
                <span>
                  補課類型
                </span>

                <strong>
                  {isEnglish
                    ? "美語"
                    : "才藝"}
                </strong>
              </div>

              <div>
                <span>
                  原班級／課程
                </span>

                <strong>
                  {courseName ||
                    "未設定"}
                </strong>
              </div>

              <div>
                <span>
                  補課日期
                </span>

                <strong>
                  {formatDate(
                    makeupItem.makeup_date
                  )}
                </strong>
              </div>

              <div>
                <span>
                  補課時間
                </span>

                <strong>
                  {formatTime(
                    makeupItem.start_time
                  )}

                  {makeupItem.end_time
                    ? ` ～ ${formatTime(
                        makeupItem.end_time
                      )}`
                    : ""}
                </strong>
              </div>

              <div>
                <span>
                  通知老師
                </span>

                <strong>
                  {teacher?.chinese_name ||
                    "未設定"}
                </strong>
              </div>

              <div>
                <span>
                  目前狀態
                </span>

                <strong>
                  {getStatusLabel(
                    makeupItem.status
                  )}
                </strong>
              </div>
            </div>
          </section>

          {hasRescheduled && (
            <section className="makeupDetail__section">
              <p>
                RESCHEDULE
              </p>

              <h3>
                改期紀錄
              </h3>

              <div className="makeupDetail__infoGrid">
                <div>
                  <span>
                    原補課日期
                  </span>

                  <strong>
                    {formatDate(
                      makeupItem.original_makeup_date
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    原補課時間
                  </span>

                  <strong>
                    {formatTime(
                      makeupItem.original_start_time
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    改期次數
                  </span>

                  <strong>
                    {
                      makeupItem.reschedule_count
                    }{" "}
                    次
                  </strong>
                </div>
              </div>
            </section>
          )}

          <section className="makeupDetail__section">
            <p>
              NOTES
            </p>

            <h3>
              備註
            </h3>

            <div className="makeupDetail__note">
              {makeupItem.note ||
                "目前沒有備註。"}
            </div>
          </section>
        </div>

        <footer className="makeupDetail__footer">
          <button
            type="button"
            className="makeupDetail__reschedule"
            onClick={
              rescheduleMakeup
            }
            disabled={
              isProcessing
            }
          >
            改期
          </button>

          <button
            type="button"
            className="makeupDetail__complete"
            onClick={
              markCompleted
            }
            disabled={
              isProcessing ||
              makeupItem.status ===
                "COMPLETED"
            }
          >
            完成補課
          </button>

          <button
            type="button"
            className="makeupDetail__cancel"
            onClick={
              cancelMakeup
            }
            disabled={
              isProcessing ||
              makeupItem.status ===
                "CANCELLED"
            }
          >
            取消補課
          </button>

          <button
            type="button"
            className="makeupDetail__delete"
            onClick={
              deleteMakeup
            }
            disabled={
              isProcessing
            }
          >
            永久刪除
          </button>
        </footer>
      </aside>
    </div>
  );
}

export default MakeupDetailDrawer;