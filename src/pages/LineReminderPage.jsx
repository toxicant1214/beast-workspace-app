import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";


const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL;


function getTeacherName(teacher) {
  return (
    teacher?.chinese_name ||
    teacher?.english_name ||
    "未命名老師"
  );
}


function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "zh-TW",
      {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    ).format(new Date(value));
  } catch {
    return String(value);
  }
}


function isOnTime(
  confirmedAt,
  deadlineAt
) {
  if (
    !confirmedAt ||
    !deadlineAt
  ) {
    return false;
  }

  return (
    new Date(confirmedAt).getTime() <=
    new Date(deadlineAt).getTime()
  );
}


function LineReminderPage() {
  const [
    teachers,
    setTeachers,
  ] = useState([]);

  const [
    announcements,
    setAnnouncements,
  ] = useState([]);

  const [
    reminders,
    setReminders,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    content,
    setContent,
  ] = useState("");

  const [
    selectedTeacherIds,
    setSelectedTeacherIds,
  ] = useState([]);

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState(null);

  const [
    remindingId,
    setRemindingId,
  ] = useState(null);

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    expandedId,
    setExpandedId,
  ] = useState(null);


  const activeTeachers =
    useMemo(
      () =>
        teachers.filter(
          (teacher) =>
            teacher.status ===
            "active"
        ),
      [teachers]
    );


  const selectableTeachers =
    useMemo(
      () =>
        activeTeachers.filter(
          (teacher) =>
            Boolean(
              teacher.line_user_id
            )
        ),
      [activeTeachers]
    );


  const allSelected =
    selectableTeachers.length > 0 &&
    selectableTeachers.every(
      (teacher) =>
        selectedTeacherIds.includes(
          teacher.id
        )
    );


  async function loadData() {
    try {
      setLoading(true);
      setError("");


      const [
        teacherResult,
        announcementResult,
        reminderResult,
      ] = await Promise.all([
        supabase
          .from("teachers")
          .select(
            `
            id,
            chinese_name,
            english_name,
            status,
            line_user_id
            `
          )
          .order(
            "chinese_name",
            {
              ascending: true,
            }
          ),

        supabase
          .from("announcements")
          .select(
            `
            id,
            title,
            content,
            status,
            sent_at,
            deadline_at,
            created_at,
            announcement_recipients (
              id,
              teacher_id,
              opened_at,
              scroll_completed_at,
              confirmed_at,
              teachers (
                id,
                chinese_name,
                english_name,
                line_user_id
              )
            )
            `
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          ),

        supabase
          .from(
            "announcement_reminders"
          )
          .select(
            `
            id,
            announcement_id,
            teacher_id,
            reminded_at
            `
          ),
      ]);


      if (teacherResult.error) {
        throw teacherResult.error;
      }

      if (announcementResult.error) {
        throw announcementResult.error;
      }

      if (reminderResult.error) {
        throw reminderResult.error;
      }


      setTeachers(
        teacherResult.data || []
      );

      setAnnouncements(
        announcementResult.data || []
      );

      setReminders(
        reminderResult.data || []
      );
    } catch (loadError) {
      console.error(
        "讀取工作公告資料失敗：",
        loadError
      );

      setError(
        loadError?.message ||
          "讀取工作公告資料失敗。"
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadData();
  }, []);


  function toggleTeacher(
    teacherId
  ) {
    setSelectedTeacherIds(
      (current) => {
        if (
          current.includes(
            teacherId
          )
        ) {
          return current.filter(
            (id) =>
              id !== teacherId
          );
        }

        return [
          ...current,
          teacherId,
        ];
      }
    );
  }


  function toggleAll() {
    if (allSelected) {
      setSelectedTeacherIds(
        []
      );
      return;
    }

    setSelectedTeacherIds(
      selectableTeachers.map(
        (teacher) =>
          teacher.id
      )
    );
  }


  async function handleSend() {
    try {
      setError("");
      setSuccessMessage("");


      const trimmedTitle =
        title.trim();

      const trimmedContent =
        content.trim();


      if (!trimmedTitle) {
        throw new Error(
          "請輸入公告標題。"
        );
      }

      if (!trimmedContent) {
        throw new Error(
          "請輸入公告內容。"
        );
      }

      if (
        selectedTeacherIds.length ===
        0
      ) {
        throw new Error(
          "請至少選擇一位老師。"
        );
      }

      if (!API_BASE_URL) {
        throw new Error(
          "尚未設定後端 API 網址。"
        );
      }


      setSending(true);


      const {
        data:
          announcementRows,
        error:
          announcementError,
      } =
        await supabase
          .from(
            "announcements"
          )
          .insert({
            title:
              trimmedTitle,
            content:
              trimmedContent,
            status:
              "draft",
          })
          .select(
            "id"
          );


      if (
        announcementError
      ) {
        throw announcementError;
      }


      const announcementId =
        announcementRows?.[0]
          ?.id;


      if (!announcementId) {
        throw new Error(
          "建立公告失敗。"
        );
      }


      const recipientRows =
        selectedTeacherIds.map(
          (teacherId) => ({
            announcement_id:
              announcementId,
            teacher_id:
              teacherId,
          })
        );


      const {
        error:
          recipientError,
      } =
        await supabase
          .from(
            "announcement_recipients"
          )
          .insert(
            recipientRows
          );


      if (
        recipientError
      ) {
        await supabase
          .from(
            "announcements"
          )
          .delete()
          .eq(
            "id",
            announcementId
          );

        throw recipientError;
      }


      const response =
        await fetch(
          `${API_BASE_URL}/api/announcements/${announcementId}/send`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );


      let result = null;

      try {
        result =
          await response.json();
      } catch {
        result = null;
      }


      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.message ||
            "LINE 公告發送失敗。"
        );
      }


      setSuccessMessage(
        `已發送給 ${result.sent_count || 0} 位老師${
          result.failed_count
            ? `，${result.failed_count} 位發送失敗`
            : ""
        }。`
      );

      setTitle("");
      setContent("");
      setSelectedTeacherIds(
        []
      );

      await loadData();
    } catch (sendError) {
      console.error(
        "發送工作公告失敗：",
        sendError
      );

      setError(
        sendError?.message ||
          "發送工作公告失敗。"
      );
    } finally {
      setSending(false);
    }
  }


  async function handleRemind(
    announcement
  ) {
    try {
      setError("");
      setSuccessMessage("");

      if (!API_BASE_URL) {
        throw new Error(
          "尚未設定後端 API 網址。"
        );
      }

      setRemindingId(
        announcement.id
      );

      const response =
        await fetch(
          `${API_BASE_URL}/api/announcements/${announcement.id}/remind`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
          }
        );

      let result = null;

      try {
        result =
          await response.json();
      } catch {
        result = null;
      }

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.message ||
            "提醒未確認老師失敗。"
        );
      }

      setSuccessMessage(
        result.sent_count > 0
          ? `已重新提醒 ${result.sent_count} 位尚未確認的老師${
              result.failed_count
                ? `，${result.failed_count} 位提醒失敗`
                : ""
            }。原簽收期限不變。`
          : result.message ||
              "目前沒有需要提醒的老師。"
      );

      await loadData();
    } catch (remindError) {
      console.error(
        "提醒未確認老師失敗：",
        remindError
      );

      setError(
        remindError?.message ||
          "提醒未確認老師失敗。"
      );
    } finally {
      setRemindingId(null);
    }
  }


  async function handleDelete(
    announcement
  ) {
    const confirmed =
      window.confirm(
        `確定要刪除「${announcement.title}」嗎？\n\n這會一併刪除這則公告的簽收與提醒紀錄，且無法復原。`
      );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      setSuccessMessage("");
      setDeletingId(
        announcement.id
      );

      if (!API_BASE_URL) {
        throw new Error(
          "尚未設定後端 API 網址。"
        );
      }

      const response =
        await fetch(
          `${API_BASE_URL}/api/announcements/${announcement.id}`,
          {
            method: "DELETE",
          }
        );

      let result = null;

      try {
        result =
          await response.json();
      } catch {
        result = null;
      }

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.message ||
            "刪除公告失敗。"
        );
      }

      if (
        expandedId ===
        announcement.id
      ) {
        setExpandedId(null);
      }

      setSuccessMessage(
        `已刪除「${announcement.title}」。`
      );

      await loadData();
    } catch (deleteError) {
      console.error(
        "刪除工作公告失敗：",
        deleteError
      );

      setError(
        deleteError?.message ||
          "刪除工作公告失敗。"
      );
    } finally {
      setDeletingId(null);
    }
  }


  function getReminderCount(
    announcementId,
    teacherId
  ) {
    return reminders.filter(
      (row) =>
        row.announcement_id ===
          announcementId &&
        row.teacher_id ===
          teacherId
    ).length;
  }


  function getAnnouncementStats(
    announcement
  ) {
    const recipients =
      announcement
        .announcement_recipients ||
      [];

    const confirmed =
      recipients.filter(
        (recipient) =>
          Boolean(
            recipient.confirmed_at
          )
      );

    const onTime =
      confirmed.filter(
        (recipient) =>
          isOnTime(
            recipient.confirmed_at,
            announcement.deadline_at
          )
      );

    return {
      total:
        recipients.length,
      confirmed:
        confirmed.length,
      unconfirmed:
        recipients.length -
        confirmed.length,
      onTime:
        onTime.length,
      late:
        confirmed.length -
        onTime.length,
    };
  }


  if (loading) {
    return (
      <div style={styles.page}>
        <h1 style={styles.pageTitle}>
          工作提醒
        </h1>

        <p style={styles.muted}>
          正在讀取公告資料…
        </p>
      </div>
    );
  }


  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>
            LINE 公告簽收
          </div>

          <h1 style={styles.pageTitle}>
            工作提醒
          </h1>

          <p style={styles.subtitle}>
            發送公告、確認簽收，
            未確認的人再直接追。
          </p>
        </div>
      </div>


      {error && (
        <div style={styles.errorBox}>
          {error}
        </div>
      )}


      {successMessage && (
        <div
          style={
            styles.successBox
          }
        >
          {successMessage}
        </div>
      )}


      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>
              建立工作公告
            </h2>

            <p style={styles.cardDescription}>
              送出後即開始計算 12 小時簽收期限。
            </p>
          </div>

          <div style={styles.deadlineBadge}>
            12 小時內確認
          </div>
        </div>


        <label style={styles.label}>
          公告標題
        </label>

        <input
          type="text"
          value={title}
          onChange={(event) =>
            setTitle(
              event.target.value
            )
          }
          placeholder="例如：開學接送注意事項"
          style={styles.input}
        />


        <label style={styles.label}>
          公告內容
        </label>

        <textarea
          value={content}
          onChange={(event) =>
            setContent(
              event.target.value
            )
          }
          placeholder={
            "可一次輸入多項佈達，例如：\n① 接車板務必隨身攜帶\n② 週三美語時間延後 10 分鐘\n③ 新生學生大卡本週完成"
          }
          rows={8}
          style={styles.textarea}
        />


        <div style={styles.teacherHeader}>
          <div>
            <div style={styles.label}>
              發送對象
            </div>

            <div style={styles.helper}>
              已選擇 {
                selectedTeacherIds.length
              } 位
            </div>
          </div>

          <button
            type="button"
            onClick={toggleAll}
            style={styles.secondaryButton}
          >
            {allSelected
              ? "取消全選"
              : "全選可發送老師"}
          </button>
        </div>


        <div style={styles.teacherGrid}>
          {activeTeachers.map(
            (teacher) => {
              const canSend =
                Boolean(
                  teacher.line_user_id
                );

              const selected =
                selectedTeacherIds.includes(
                  teacher.id
                );

              return (
                <button
                  key={teacher.id}
                  type="button"
                  disabled={!canSend}
                  onClick={() =>
                    toggleTeacher(
                      teacher.id
                    )
                  }
                  style={{
                    ...styles.teacherChip,
                    ...(selected
                      ? styles.teacherChipSelected
                      : {}),
                    ...(!canSend
                      ? styles.teacherChipDisabled
                      : {}),
                  }}
                >
                  <span
                    style={
                      styles.checkBox
                    }
                  >
                    {selected
                      ? "✓"
                      : ""}
                  </span>

                  <span>
                    {getTeacherName(
                      teacher
                    )}
                  </span>

                  {!canSend && (
                    <span
                      style={
                        styles.unboundText
                      }
                    >
                      未綁 LINE
                    </span>
                  )}
                </button>
              );
            }
          )}
        </div>


        <div style={styles.sendFooter}>
          <div style={styles.sendNote}>
            公告會直接顯示在老師的 LINE，
            不需要另外開網頁。
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            style={{
              ...styles.primaryButton,
              opacity:
                sending
                  ? 0.6
                  : 1,
            }}
          >
            {sending
              ? "發送中…"
              : "發送工作公告"}
          </button>
        </div>
      </section>


      <section style={styles.historySection}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              公告紀錄
            </h2>

            <p style={styles.sectionDescription}>
              快速查看還有誰沒有確認。
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            style={styles.refreshButton}
          >
            重新整理
          </button>
        </div>


        {announcements.length ===
        0 ? (
          <div style={styles.emptyCard}>
            還沒有公告紀錄。
          </div>
        ) : (
          <div style={styles.list}>
            {announcements.map(
              (announcement) => {
                const stats =
                  getAnnouncementStats(
                    announcement
                  );

                const recipients =
                  announcement
                    .announcement_recipients ||
                  [];

                const isExpanded =
                  expandedId ===
                  announcement.id;

                return (
                  <article
                    key={
                      announcement.id
                    }
                    style={
                      styles.announcementCard
                    }
                  >
                    <div
                      style={
                        styles.announcementTop
                      }
                    >
                      <div>
                        <div
                          style={
                            styles.statusRow
                          }
                        >
                          <span
                            style={{
                              ...styles.statusBadge,
                              ...(announcement.status ===
                              "sent"
                                ? styles.statusSent
                                : styles.statusDraft),
                            }}
                          >
                            {announcement.status ===
                            "sent"
                              ? "已發送"
                              : "草稿"}
                          </span>

                          <span
                            style={
                              styles.timeText
                            }
                          >
                            {announcement.sent_at
                              ? `${formatDateTime(
                                  announcement.sent_at
                                )} 發送`
                              : `${formatDateTime(
                                  announcement.created_at
                                )} 建立`}
                          </span>
                        </div>

                        <h3
                          style={
                            styles.announcementTitle
                          }
                        >
                          {
                            announcement.title
                          }
                        </h3>
                      </div>


                      <div
                        style={
                          styles.statBlock
                        }
                      >
                        <div
                          style={
                            styles.statPrimary
                          }
                        >
                          {stats.confirmed}
                          {" / "}
                          {stats.total}
                        </div>

                        <div
                          style={
                            styles.statLabel
                          }
                        >
                          已確認
                        </div>
                      </div>
                    </div>


                    <div
                      style={
                        styles.progressTrack
                      }
                    >
                      <div
                        style={{
                          ...styles.progressFill,
                          width:
                            stats.total > 0
                              ? `${Math.round(
                                  (
                                    stats.confirmed /
                                    stats.total
                                  ) *
                                    100
                                )}%`
                              : "0%",
                        }}
                      />
                    </div>


                    <div
                      style={
                        styles.summaryRow
                      }
                    >
                      <span>
                        已確認{" "}
                        <strong>
                          {stats.confirmed}
                        </strong>
                      </span>

                      <span>
                        未確認{" "}
                        <strong>
                          {stats.unconfirmed}
                        </strong>
                      </span>

                      <span>
                        準時{" "}
                        <strong>
                          {stats.onTime}
                        </strong>
                      </span>

                      <span>
                        逾期{" "}
                        <strong>
                          {stats.late}
                        </strong>
                      </span>

                      {announcement.deadline_at && (
                        <span>
                          期限{" "}
                          <strong>
                            {formatDateTime(
                              announcement.deadline_at
                            )}
                          </strong>
                        </span>
                      )}
                    </div>


                    <div
                      style={
                        styles.actionRow
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(
                            isExpanded
                              ? null
                              : announcement.id
                          )
                        }
                        style={
                          styles.secondaryButton
                        }
                      >
                        {isExpanded
                          ? "收起簽收狀況"
                          : "查看簽收狀況"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          stats.unconfirmed ===
                            0 ||
                          remindingId ===
                            announcement.id
                        }
                        onClick={() =>
                          handleRemind(
                            announcement
                          )
                        }
                        style={{
                          ...styles.remindButton,
                          opacity:
                            stats.unconfirmed ===
                              0 ||
                            remindingId ===
                              announcement.id
                              ? 0.45
                              : 1,
                        }}
                      >
                        {remindingId ===
                        announcement.id
                          ? "提醒發送中…"
                          : "提醒未確認老師"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          deletingId ===
                          announcement.id
                        }
                        onClick={() =>
                          handleDelete(
                            announcement
                          )
                        }
                        style={{
                          ...styles.deleteButton,
                          opacity:
                            deletingId ===
                            announcement.id
                              ? 0.5
                              : 1,
                        }}
                      >
                        {deletingId ===
                        announcement.id
                          ? "刪除中…"
                          : "刪除公告"}
                      </button>
                    </div>


                    {isExpanded && (
                      <div
                        style={
                          styles.recipientList
                        }
                      >
                        {recipients.map(
                          (recipient) => {
                            const teacher =
                              recipient.teachers ||
                              {};

                            const reminderCount =
                              getReminderCount(
                                announcement.id,
                                recipient.teacher_id
                              );

                            const confirmed =
                              Boolean(
                                recipient.confirmed_at
                              );

                            const onTime =
                              confirmed &&
                              isOnTime(
                                recipient.confirmed_at,
                                announcement.deadline_at
                              );

                            return (
                              <div
                                key={
                                  recipient.id
                                }
                                style={
                                  styles.recipientRow
                                }
                              >
                                <div
                                  style={
                                    styles.recipientNameWrap
                                  }
                                >
                                  <div
                                    style={{
                                      ...styles.recipientIcon,
                                      ...(confirmed
                                        ? styles.recipientIconDone
                                        : styles.recipientIconPending),
                                    }}
                                  >
                                    {confirmed
                                      ? "✓"
                                      : "○"}
                                  </div>

                                  <div>
                                    <div
                                      style={
                                        styles.recipientName
                                      }
                                    >
                                      {getTeacherName(
                                        teacher
                                      )}
                                    </div>

                                    <div
                                      style={
                                        styles.recipientMeta
                                      }
                                    >
                                      {confirmed
                                        ? `${formatDateTime(
                                            recipient.confirmed_at
                                          )} 確認`
                                        : "尚未確認"}

                                      {reminderCount >
                                        0 &&
                                        `｜已提醒 ${reminderCount} 次`}
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  {confirmed ? (
                                    <span
                                      style={{
                                        ...styles.smallStatus,
                                        ...(onTime
                                          ? styles.smallStatusOnTime
                                          : styles.smallStatusLate),
                                      }}
                                    >
                                      {onTime
                                        ? "準時"
                                        : "逾期"}
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        ...styles.smallStatus,
                                        ...styles.smallStatusPending,
                                      }}
                                    >
                                      未確認
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </article>
                );
              }
            )}
          </div>
        )}
      </section>
    </div>
  );
}


const styles = {
  page: {
    padding:
      "36px 42px 80px",
    maxWidth: "1180px",
    margin: "0 auto",
    boxSizing: "border-box",
  },

  header: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-start",
    marginBottom: "28px",
  },

  eyebrow: {
    fontSize: "13px",
    letterSpacing: "0.14em",
    color: "#9a8f82",
    marginBottom: "8px",
  },

  pageTitle: {
    margin: 0,
    fontSize: "38px",
    color: "#30372f",
    lineHeight: 1.25,
  },

  subtitle: {
    margin: "10px 0 0",
    color: "#7a8179",
    fontSize: "15px",
    lineHeight: 1.7,
  },

  muted: {
    color: "#888",
  },

  errorBox: {
    marginBottom: "18px",
    padding: "14px 16px",
    background: "#fff0ee",
    color: "#a44e45",
    borderRadius: "14px",
  },

  successBox: {
    marginBottom: "18px",
    padding: "14px 16px",
    background: "#edf5ed",
    color: "#47684d",
    borderRadius: "14px",
  },

  card: {
    background: "#fff",
    border:
      "1px solid #ebe8e2",
    borderRadius: "24px",
    padding: "28px",
    boxShadow:
      "0 10px 30px rgba(45, 52, 45, 0.04)",
  },

  cardHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "18px",
    alignItems: "flex-start",
    marginBottom: "24px",
  },

  cardTitle: {
    margin: 0,
    fontSize: "22px",
    color: "#384138",
  },

  cardDescription: {
    margin: "6px 0 0",
    color: "#8a9089",
    fontSize: "13px",
  },

  deadlineBadge: {
    background: "#f4f1ea",
    color: "#6c6255",
    padding: "8px 12px",
    borderRadius: "999px",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },

  label: {
    display: "block",
    margin:
      "18px 0 8px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#545c54",
  },

  helper: {
    color: "#999e98",
    fontSize: "12px",
    marginTop: "4px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border:
      "1px solid #dddcd7",
    borderRadius: "13px",
    padding: "13px 14px",
    fontSize: "15px",
    fontFamily: "inherit",
    outline: "none",
    background: "#fff",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border:
      "1px solid #dddcd7",
    borderRadius: "13px",
    padding: "14px",
    fontSize: "15px",
    lineHeight: 1.8,
    resize: "vertical",
    fontFamily: "inherit",
    outline: "none",
    background: "#fff",
  },

  teacherHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-end",
    gap: "18px",
    marginTop: "8px",
  },

  teacherGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
    marginTop: "12px",
  },

  teacherChip: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    minHeight: "44px",
    border:
      "1px solid #dddcd7",
    borderRadius: "12px",
    background: "#fff",
    padding: "10px 12px",
    fontFamily: "inherit",
    fontSize: "14px",
    color: "#515851",
    cursor: "pointer",
    textAlign: "left",
  },

  teacherChipSelected: {
    background: "#edf3ed",
    borderColor: "#aebfae",
    color: "#39513d",
  },

  teacherChipDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
    background: "#f7f6f3",
  },

  checkBox: {
    width: "19px",
    height: "19px",
    flex: "0 0 19px",
    border:
      "1px solid #babdb8",
    borderRadius: "5px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
  },

  unboundText: {
    marginLeft: "auto",
    fontSize: "10px",
    color: "#a29282",
  },

  sendFooter: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "20px",
    alignItems: "center",
    marginTop: "26px",
    paddingTop: "20px",
    borderTop:
      "1px solid #efede8",
  },

  sendNote: {
    color: "#8b918a",
    fontSize: "12px",
    lineHeight: 1.6,
  },

  primaryButton: {
    border: 0,
    borderRadius: "12px",
    background: "#354438",
    color: "#fff",
    padding: "13px 22px",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
  },

  secondaryButton: {
    border:
      "1px solid #d7d8d3",
    borderRadius: "10px",
    background: "#fff",
    color: "#596159",
    padding: "9px 13px",
    fontSize: "12px",
    fontFamily: "inherit",
    cursor: "pointer",
  },

  historySection: {
    marginTop: "38px",
  },

  sectionHeader: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "flex-end",
    gap: "18px",
    marginBottom: "16px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "22px",
    color: "#384138",
  },

  sectionDescription: {
    margin: "5px 0 0",
    color: "#929791",
    fontSize: "12px",
  },

  refreshButton: {
    border: 0,
    background: "transparent",
    color: "#667166",
    fontFamily: "inherit",
    cursor: "pointer",
    fontSize: "12px",
  },

  emptyCard: {
    padding: "34px",
    background: "#fff",
    border:
      "1px solid #ebe8e2",
    borderRadius: "20px",
    color: "#9a9e99",
    textAlign: "center",
  },

  list: {
    display: "grid",
    gap: "14px",
  },

  announcementCard: {
    background: "#fff",
    border:
      "1px solid #ebe8e2",
    borderRadius: "20px",
    padding: "22px",
  },

  announcementTop: {
    display: "flex",
    justifyContent:
      "space-between",
    gap: "18px",
    alignItems: "flex-start",
  },

  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  statusBadge: {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: "999px",
    fontSize: "10px",
  },

  statusSent: {
    background: "#edf5ed",
    color: "#4d6b52",
  },

  statusDraft: {
    background: "#f3f0ea",
    color: "#766a5c",
  },

  timeText: {
    color: "#9a9f99",
    fontSize: "11px",
  },

  announcementTitle: {
    margin:
      "10px 0 0",
    fontSize: "18px",
    color: "#374037",
  },

  statBlock: {
    textAlign: "right",
  },

  statPrimary: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#384738",
  },

  statLabel: {
    marginTop: "2px",
    color: "#969b95",
    fontSize: "11px",
  },

  progressTrack: {
    height: "7px",
    borderRadius: "999px",
    background: "#eceeea",
    overflow: "hidden",
    marginTop: "18px",
  },

  progressFill: {
    height: "100%",
    borderRadius: "999px",
    background: "#829683",
    transition:
      "width 0.25s ease",
  },

  summaryRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    marginTop: "12px",
    color: "#7a817a",
    fontSize: "12px",
  },

  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px",
    marginTop: "18px",
  },

  remindButton: {
    border: 0,
    borderRadius: "10px",
    background: "#f4efe6",
    color: "#6e604d",
    padding: "9px 13px",
    fontSize: "12px",
    fontFamily: "inherit",
    cursor: "pointer",
  },

  deleteButton: {
    marginLeft: "auto",
    border:
      "1px solid #ead8d4",
    borderRadius: "10px",
    background: "#fff",
    color: "#a05d55",
    padding: "9px 13px",
    fontSize: "12px",
    fontFamily: "inherit",
    cursor: "pointer",
  },

  recipientList: {
    marginTop: "18px",
    borderTop:
      "1px solid #efede8",
  },

  recipientRow: {
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    gap: "16px",
    padding: "14px 2px",
    borderBottom:
      "1px solid #f1efe9",
  },

  recipientNameWrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  recipientIcon: {
    width: "27px",
    height: "27px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
  },

  recipientIconDone: {
    background: "#eaf3ea",
    color: "#4f6e54",
  },

  recipientIconPending: {
    background: "#f3f1ec",
    color: "#8d877e",
  },

  recipientName: {
    color: "#4c544c",
    fontSize: "13px",
    fontWeight: 600,
  },

  recipientMeta: {
    color: "#999d98",
    fontSize: "11px",
    marginTop: "3px",
  },

  smallStatus: {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: "999px",
    fontSize: "10px",
  },

  smallStatusOnTime: {
    background: "#edf5ed",
    color: "#4d6c52",
  },

  smallStatusLate: {
    background: "#fff1e8",
    color: "#a05c31",
  },

  smallStatusPending: {
    background: "#f3f1ec",
    color: "#8a8378",
  },
};


export default LineReminderPage;
