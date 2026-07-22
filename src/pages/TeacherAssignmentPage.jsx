import { useEffect, useMemo, useState } from "react";
import { getActiveTeachers } from "../services/teacherService";
import {
  confirmTeacherAssignment,
  createTeacherAssignment,
  deleteTeacherAssignment,
  getTeacherAssignments,
  markTeacherAssignmentCompleted,
  undoConfirmTeacherAssignment,
  undoTeacherAssignmentCompleted,
} from "../services/teacherAssignmentService";
import {
  hasActionPermission,
  isAdmin,
} from "../services/permissionService";
import LineBindingCard from "../components/LineBindingCard";
import "./TeacherAssignmentPage.css";

const createEmptyForm = () => ({
  title: "",
  description: "",
  deadline: "",
  priority: "normal",
  teacherIds: [],
});

function formatDeadline(value) {
  if (!value) {
    return "未設定截止時間";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatHistoryTime(value) {
  if (!value) {
    return "尚未完成";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function getCompletionTiming(completedAt, deadline) {
  if (!completedAt || !deadline) {
    return "";
  }

  const difference =
    new Date(completedAt).getTime() - new Date(deadline).getTime();

  if (difference <= 0) {
    return "準時完成";
  }

  const totalHours = Math.floor(difference / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0 && hours > 0) {
    return `逾期 ${days} 天 ${hours} 小時`;
  }

  if (days > 0) {
    return `逾期 ${days} 天`;
  }

  return `逾期 ${Math.max(totalHours, 1)} 小時`;
}

function isAssignmentOverdue(assignment) {
  if (!assignment.deadline) {
    return false;
  }

  const members = assignment.teacher_assignment_members ?? [];
  const allConfirmed =
    members.length > 0 &&
    members.every((member) => member.admin_confirmed);

  return !allConfirmed && new Date(assignment.deadline) < new Date();
}

function getPriorityLabel(priority) {
  if (priority === "urgent") return "非常重要";
  if (priority === "high") return "重要";
  return "一般";
}

function TeacherAssignmentPage({ currentTeacher }) {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState(createEmptyForm());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedMemberIds, setExpandedMemberIds] = useState([]);
  const [teacherKeyword, setTeacherKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const adminMode = isAdmin(currentTeacher);
  const canViewAll =
    adminMode ||
    currentTeacher?.permissions?.teacher_assignments?.view_scope === "all";
  const canCreate =
    adminMode ||
    hasActionPermission(currentTeacher, "teacher_assignments", "create");
  const canDelete =
    adminMode ||
    hasActionPermission(currentTeacher, "teacher_assignments", "delete");
  const canAdminConfirm =
    adminMode ||
    hasActionPermission(
      currentTeacher,
      "teacher_assignments",
      "admin_confirm"
    );
  const canCompleteOwn =
    adminMode ||
    hasActionPermission(
      currentTeacher,
      "teacher_assignments",
      "confirm_own"
    );

  const visibleAssignments = useMemo(() => {
    if (canViewAll) {
      return assignments;
    }

    if (!currentTeacher?.id) {
      return [];
    }

    return assignments
      .map((assignment) => {
        const ownMembers = (
          assignment.teacher_assignment_members ?? []
        ).filter((member) => member.teacher_id === currentTeacher.id);

        if (ownMembers.length === 0) {
          return null;
        }

        return {
          ...assignment,
          teacher_assignment_members: ownMembers,
        };
      })
      .filter(Boolean);
  }, [assignments, canViewAll, currentTeacher?.id]);

  const filteredAssignments = useMemo(() => {
  const keyword = teacherKeyword.trim().toLowerCase();

  return visibleAssignments.filter((assignment) => {
    const members = assignment.teacher_assignment_members ?? [];

    const matchesTeacher =
      !adminMode ||
      !keyword ||
      members.some((member) => {
        const teacher = member.teachers;

        return [
          teacher?.chinese_name,
          teacher?.english_name,
          teacher?.position,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(keyword));
      });

    const isOverdue = isAssignmentOverdue(assignment);

    const isCompleted =
      members.length > 0 &&
      members.every((member) => member.admin_confirmed);

    const isWaitingConfirm =
  members.some(
    (member) =>
      member.teacher_completed &&
      !member.admin_confirmed
  );

    const isInProgress =
      !isOverdue &&
      !isCompleted &&
      !isWaitingConfirm;

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "in_progress" && isInProgress) ||
      (statusFilter === "waiting_confirm" && isWaitingConfirm) ||
      (statusFilter === "completed" && isCompleted) ||
      (statusFilter === "overdue" && isOverdue);

    return matchesTeacher && matchesStatus;
  });
}, [
  visibleAssignments,
  teacherKeyword,
  statusFilter,
  adminMode,
]);
  const activeAssignmentCount = useMemo(
    () =>
      visibleAssignments.filter((assignment) => assignment.status === "active")
        .length,
    [visibleAssignments]
  );

  const waitingConfirmationCount = useMemo(
    () =>
      visibleAssignments.reduce((total, assignment) => {
        const members = assignment.teacher_assignment_members ?? [];

        return (
          total +
          members.filter(
            (member) =>
              member.teacher_completed && !member.admin_confirmed
          ).length
        );
      }, 0),
    [visibleAssignments]
  );

  const incompleteMemberCount = useMemo(
    () =>
      visibleAssignments.reduce((total, assignment) => {
        const members = assignment.teacher_assignment_members ?? [];

        return (
          total +
          members.filter((member) => !member.admin_confirmed).length
        );
      }, 0),
    [visibleAssignments]
  );
const overdueAssignmentCount = useMemo(
  () =>
    visibleAssignments.filter((assignment) =>
      isAssignmentOverdue(assignment)
    ).length,
  [visibleAssignments]
);
  useEffect(() => {
    loadPageData();
  }, []);

  async function loadPageData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [assignmentData, teacherData] = await Promise.all([
        getTeacherAssignments(),
        canCreate ? getActiveTeachers() : Promise.resolve([]),
      ]);

      setAssignments(assignmentData);
      setTeachers(teacherData);
    } catch (error) {
      console.error(error);
      setErrorMessage("老師任務資料讀取失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    if (!canCreate) {
      setErrorMessage("你沒有新增老師任務的權限。");
      return;
    }

    setFormData(createEmptyForm());
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function closeCreateForm() {
    if (saving) {
      return;
    }

    setIsFormOpen(false);
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

  function toggleMemberHistory(memberId) {
  setExpandedMemberIds((previous) =>
    previous.includes(memberId)
      ? previous.filter((id) => id !== memberId)
      : [...previous, memberId]
  );
}
  function toggleTeacher(teacherId) {
    setFormData((previous) => {
      const alreadySelected = previous.teacherIds.includes(teacherId);

      return {
        ...previous,
        teacherIds: alreadySelected
          ? previous.teacherIds.filter((id) => id !== teacherId)
          : [...previous.teacherIds, teacherId],
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canCreate) {
      setErrorMessage("你沒有新增老師任務的權限。");
      return;
    }

    if (!formData.title.trim()) {
      setErrorMessage("請輸入任務名稱。");
      return;
    }

    if (formData.teacherIds.length === 0) {
      setErrorMessage("請至少選擇一位老師。");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");

      await createTeacherAssignment({
        ...formData,
        deadline: formData.deadline
          ? new Date(formData.deadline).toISOString()
          : null,
      });

      await loadPageData();
      closeCreateForm();
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error?.message || "新增老師任務失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTeacherComplete(member) {
    const isOwnAssignment = member.teacher_id === currentTeacher?.id;

    if (!adminMode && (!canCompleteOwn || !isOwnAssignment)) {
      setErrorMessage("你只能回報自己的任務完成狀態。");
      return;
    }

    try {
      setProcessingId(member.id);
      setErrorMessage("");

      if (member.teacher_completed) {
        await undoTeacherAssignmentCompleted(member.id);
      } else {
        await markTeacherAssignmentCompleted(member.id);
      }

      await loadPageData();
    } catch (error) {
      console.error(error);
      setErrorMessage("更新老師完成狀態失敗，請稍後再試。");
    } finally {
      setProcessingId("");
    }
  }

  async function handleAdminConfirm(member) {
    if (!canAdminConfirm) {
      setErrorMessage("你沒有主管確認權限。");
      return;
    }

    if (!member.teacher_completed) {
      setErrorMessage("老師尚未回報完成，暫時無法確認。");
      return;
    }

    try {
      setProcessingId(member.id);
      setErrorMessage("");

      if (member.admin_confirmed) {
        await undoConfirmTeacherAssignment(member.id);
      } else {
        await confirmTeacherAssignment(member.id);
      }

      await loadPageData();
    } catch (error) {
      console.error(error);
      setErrorMessage("更新主管確認狀態失敗，請稍後再試。");
    } finally {
      setProcessingId("");
    }
  }

  async function handleDeleteAssignment(assignment) {
    if (!canDelete) {
      setErrorMessage("你沒有刪除老師任務的權限。");
      return;
    }

    const confirmed = window.confirm(
      `確定要永久刪除任務「${assignment.title}」嗎？\n\n老師的回報與確認紀錄也會一起刪除，此動作無法復原。`
    );

    if (!confirmed) {
      return;
    }

    try {
      setProcessingId(assignment.id);
      setErrorMessage("");

      await deleteTeacherAssignment(assignment.id);
      await loadPageData();
    } catch (error) {
      console.error(error);
      setErrorMessage("刪除老師任務失敗，請稍後再試。");
    } finally {
      setProcessingId("");
    }
  }

  return (
    <main className="teacher-assignment-page">
      <section className="teacher-assignment-page__header">
        <div>
          <p className="teacher-assignment-page__eyebrow">
            Teacher Assignments
          </p>

          <h1>老師任務</h1>

          <p className="teacher-assignment-page__description">
            {adminMode
              ? "指派老師工作、查看老師完成回報，並由主管進行最後確認。"
              : "查看指派給你的工作，完成後可直接回報。"}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            className="teacher-assignment-page__add-button"
            onClick={openCreateForm}
          >
            ＋ 新增任務
          </button>
        )}
            </section>

      {!adminMode && <LineBindingCard />}

      <section className="teacher-assignment-summary">
        <article className="teacher-assignment-summary__card">
          <span>進行中任務</span>
          <strong>{activeAssignmentCount}</strong>
          <small>目前建立的老師任務</small>
        </article>

        <article className="teacher-assignment-summary__card">
  <span>逾期任務</span>
  <strong>{overdueAssignmentCount}</strong>
  <small>已超過截止時間</small>
</article>

        <article className="teacher-assignment-summary__card">
          <span>等待主管確認</span>
          <strong>{waitingConfirmationCount}</strong>
          <small>老師已回報完成</small>
        </article>

        <article className="teacher-assignment-summary__card">
          <span>尚未正式完成</span>
          <strong>{incompleteMemberCount}</strong>
          <small>依每位老師分別計算</small>
        </article>
      </section>

      <section className="teacher-assignment-list">
        <div className="teacher-assignment-list__toolbar">
          <div>
            <h2>任務列表</h2>
            <p>
              {adminMode
                ? "老師完成回報後，仍需由主管確認。"
                : "這裡只會顯示指派給你的任務。"}
            </p>
          </div>
          {adminMode && (
  <div className="teacher-assignment-list__search">
  <input
    type="search"
    value={teacherKeyword}
    onChange={(event) => setTeacherKeyword(event.target.value)}
    placeholder="搜尋老師姓名、英文名或職稱"
  />

  <select
    value={statusFilter}
    onChange={(event) => setStatusFilter(event.target.value)}
  >
    <option value="all">全部任務</option>
    <option value="in_progress">進行中</option>
    <option value="waiting_confirm">待主管確認</option>
    <option value="completed">已完成</option>
    <option value="overdue">已逾期</option>
  </select>
</div>
)}
          <button
            type="button"
            className="teacher-assignment-page__refresh-button"
            onClick={loadPageData}
            disabled={loading}
          >
            {loading ? "讀取中…" : "重新整理"}
          </button>
        </div>

        {errorMessage && !isFormOpen && (
          <div className="teacher-assignment-page__error">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="teacher-assignment-page__empty">
            正在讀取老師任務…
          </div>
        ) : visibleAssignments.length === 0 ? (
          <div className="teacher-assignment-page__empty">
            <strong>
              {adminMode ? "目前尚未建立老師任務" : "目前沒有指派給你的任務"}
            </strong>
            <p>
              {adminMode
                ? "按右上角「新增任務」，開始指派第一項工作。"
                : "有新任務時，會顯示在這裡。"}
            </p>
          </div>
        ) : (
          <div className="teacher-assignment-grid">
            {filteredAssignments.map((assignment) => {
  const members =
    assignment.teacher_assignment_members ?? [];

  const overdue = isAssignmentOverdue(assignment);

  const confirmedCount = members.filter(
    (member) => member.admin_confirmed
  ).length;

              return (
                <article
                  className="teacher-assignment-card"
                  key={assignment.id}
                >
                  <div className="teacher-assignment-card__header">
  <div>
    <div className="teacher-assignment-card__badges">
      <span
        className={`teacher-assignment-card__priority is-${assignment.priority}`}
      >
        {getPriorityLabel(assignment.priority)}
      </span>

      {overdue && (
        <span className="teacher-assignment-card__overdue">
          已逾期
        </span>
      )}
    </div>

    <h2>{assignment.title}</h2>
  </div>

                    {canDelete && (
                      <button
                        type="button"
                        className="teacher-assignment-card__delete"
                        onClick={() =>
                          handleDeleteAssignment(assignment)
                        }
                        disabled={processingId === assignment.id}
                      >
                        刪除
                      </button>
                    )}
                  </div>

                  {assignment.description && (
                    <p className="teacher-assignment-card__description">
                      {assignment.description}
                    </p>
                  )}

                  <div className="teacher-assignment-card__meta">
                    <span>截止時間</span>
                    <strong>
                      {formatDeadline(assignment.deadline)}
                    </strong>
                  </div>

                  <div className="teacher-assignment-card__progress">
                    <div>
                      <span>正式完成進度</span>
                      <strong>
                        {confirmedCount} / {members.length}
                      </strong>
                    </div>

                    <div className="teacher-assignment-card__progress-bar">
                      <span
                        style={{
                          width:
                            members.length === 0
                              ? "0%"
                              : `${Math.round(
                                  (confirmedCount /
                                    members.length) *
                                    100
                                )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="teacher-assignment-members">
                    {members.map((member) => {
                      const teacher = member.teachers;
                      const isProcessing =
                        processingId === member.id;
                      const isOwnAssignment =
                        member.teacher_id === currentTeacher?.id;
                      const mayComplete =
                        adminMode || (canCompleteOwn && isOwnAssignment);
                      const isHistoryExpanded =
                        expandedMemberIds.includes(member.id);

                      return (
                        <div
  className="teacher-assignment-member"
  key={member.id}
  onClick={() => toggleMemberHistory(member.id)}
>
                          <div className="teacher-assignment-member__identity">
                            <div className="teacher-assignment-member__avatar">
                              {teacher?.chinese_name?.slice(0, 1) || "師"}
                            </div>

                            <div className="teacher-assignment-member__info">
                              <strong>
                                {isHistoryExpanded ? "▼ " : "▶ "}
                                {teacher?.chinese_name || "未知老師"}
                              </strong>

                              <span>
                                {teacher?.position || "未設定職務"}
                              </span>
                            </div>
                          </div>

                          <div className="teacher-assignment-member__status">
                            {member.admin_confirmed ? (
                              <span className="is-confirmed">
                                已正式完成
                              </span>
                            ) : member.teacher_completed ? (
                              <span className="is-waiting">
                                等待主管確認
                              </span>
                            ) : (
                              <span className="is-pending">
                                尚未回報
                              </span>
                            )}
                          </div>

                          <div
  className="teacher-assignment-member__actions"
  onClick={(event) => event.stopPropagation()}
>
                            {mayComplete && (
                              <button
                                type="button"
                                className={
                                  member.teacher_completed
                                    ? "teacher-complete-button is-completed"
                                    : "teacher-complete-button"
                                }
                                onClick={() =>
                                  handleTeacherComplete(member)
                                }
                                disabled={
                                  isProcessing ||
                                  member.admin_confirmed
                                }
                              >
                                {member.teacher_completed
                                  ? "取消回報"
                                  : adminMode
                                    ? "老師完成"
                                    : "我已完成"}
                              </button>
                            )}

                            {canAdminConfirm && (
                              <button
                                type="button"
                                className={
                                  member.admin_confirmed
                                    ? "admin-confirm-button is-confirmed"
                                    : "admin-confirm-button"
                                }
                                onClick={() =>
                                  handleAdminConfirm(member)
                                }
                                disabled={
                                  isProcessing ||
                                  !member.teacher_completed
                                }
                              >
                                {member.admin_confirmed
                                  ? "取消確認"
                                  : "主管確認"}
                              </button>
                            )}
                          </div>

                          {adminMode && isHistoryExpanded && (
                            <div className="teacher-assignment-member__history">
                              <div className="teacher-assignment-member__history-item">
                                <span>任務建立</span>
                                <strong>
                                  {formatHistoryTime(
                                    assignment.created_at
                                  )}
                                </strong>
                              </div>

                              <div className="teacher-assignment-member__history-item">
  <span>老師完成</span>

  <div className="teacher-assignment-member__history-result">
    {member.teacher_completed_at &&
      assignment.deadline && (
        <small>
          （
          {getCompletionTiming(
            member.teacher_completed_at,
            assignment.deadline
          )}
          ）
        </small>
      )}

    <strong>
      {formatHistoryTime(
        member.teacher_completed_at
      )}
    </strong>
  </div>
</div>

                              <div className="teacher-assignment-member__history-item">
                                <span>主管確認</span>
                                <strong>
                                  {formatHistoryTime(
                                    member.admin_confirmed_at
                                  )}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {canCreate && isFormOpen && (
        <div
          className="teacher-assignment-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateForm();
            }
          }}
        >
          <section
            className="teacher-assignment-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-assignment-form-title"
          >
            <div className="teacher-assignment-modal__header">
              <div>
                <p>New Assignment</p>
                <h2 id="teacher-assignment-form-title">
                  新增老師任務
                </h2>
              </div>

              <button
                type="button"
                className="teacher-assignment-modal__close"
                onClick={closeCreateForm}
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <form
              className="teacher-assignment-form"
              onSubmit={handleSubmit}
            >
              <label className="teacher-assignment-form__field">
                <span>
                  任務名稱 <b>必填</b>
                </span>

                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="例如：整理暑假教材"
                  autoFocus
                />
              </label>

              <label className="teacher-assignment-form__field">
                <span>任務內容</span>

                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="請填寫工作內容、完成標準或注意事項"
                  rows="4"
                />
              </label>

              <div className="teacher-assignment-form__grid">
                <label className="teacher-assignment-form__field">
                  <span>截止日期與時間</span>

                  <input
                    type="datetime-local"
                    name="deadline"
                    value={formData.deadline}
                    onChange={handleInputChange}
                  />
                </label>

                <label className="teacher-assignment-form__field">
                  <span>重要程度</span>

                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleInputChange}
                  >
                    <option value="normal">一般</option>
                    <option value="high">重要</option>
                    <option value="urgent">非常重要</option>
                  </select>
                </label>
              </div>

              <div className="teacher-assignment-form__teachers">
                <span>
                  指派老師 <b>至少選擇一位</b>
                </span>

                {teachers.length === 0 ? (
                  <div className="teacher-assignment-form__no-teacher">
                    目前沒有可指派的在職老師，請先到老師管理新增老師。
                  </div>
                ) : (
                  <div className="teacher-assignment-form__teacher-grid">
                    {teachers.map((teacher) => (
                      <label
                        className={
                          formData.teacherIds.includes(teacher.id)
                            ? "teacher-assignment-form__teacher-option is-selected"
                            : "teacher-assignment-form__teacher-option"
                        }
                        key={teacher.id}
                      >
                        <input
                          type="checkbox"
                          checked={formData.teacherIds.includes(
                            teacher.id
                          )}
                          onChange={() =>
                            toggleTeacher(teacher.id)
                          }
                        />

                        <span>
                          <strong>{teacher.chinese_name}</strong>
                          <small>
                            {teacher.position || "未設定職務"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="teacher-assignment-form__error">
                  {errorMessage}
                </div>
              )}

              <div className="teacher-assignment-form__actions">
                <button
                  type="button"
                  className="teacher-assignment-form__cancel"
                  onClick={closeCreateForm}
                  disabled={saving}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="teacher-assignment-form__save"
                  disabled={saving || teachers.length === 0}
                >
                  {saving ? "建立中…" : "建立任務"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default TeacherAssignmentPage;