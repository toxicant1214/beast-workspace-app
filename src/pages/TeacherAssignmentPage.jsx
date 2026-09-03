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
  updateTeacherAssignment,
} from "../services/teacherAssignmentService";
import {
  hasActionPermission,
  isAdmin,
} from "../services/permissionService";
import LineBindingCard from "../components/LineBindingCard";
import "./TeacherAssignmentPage.css";

const REMINDER_OPTIONS = [
  {
    value: 10080,
    label: "一週前",
  },
  {
    value: 2880,
    label: "兩天前",
  },
  {
    value: 1440,
    label: "一天前",
  },
  {
    value: 60,
    label: "截止前 1 小時",
  },
  {
    value: 30,
    label: "截止前 30 分鐘",
  },
];

const CUSTOM_REMINDER_UNITS = {
  days: {
    label: "天前",
    multiplier: 1440,
  },
  hours: {
    label: "小時前",
    multiplier: 60,
  },
  minutes: {
    label: "分鐘前",
    multiplier: 1,
  },
};

const createEmptyForm = () => ({
  title: "",
  description: "",
  deadline: "",
  priority: "normal",
  teacherIds: [],
  reminderOffsets: [],
  customReminderValue: "",
  customReminderUnit: "days",
});

function toDateTimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

function isAssignmentCompleted(assignment) {
  const members = assignment.teacher_assignment_members ?? [];
  return members.length > 0 && members.every((member) => member.admin_confirmed);
}

function isAssignmentWaitingConfirm(assignment) {
  if (isAssignmentCompleted(assignment)) return false;
  const members = assignment.teacher_assignment_members ?? [];
  return members.some(
    (member) => member.teacher_completed && !member.admin_confirmed
  );
}

function getAssignmentCompletedAt(assignment) {
  const members = assignment.teacher_assignment_members ?? [];
  const timestamps = members
    .map((member) => member.admin_confirmed_at)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function sortAssignmentsByDeadline(a, b) {
  const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;

  if (aTime !== bTime) return aTime - bTime;

  const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
  return aCreated - bCreated;
}
function getMemberStatus(member, deadline) {
  const completionTiming = getCompletionTiming(
    member.teacher_completed_at,
    deadline
  );

  const completedLate = completionTiming.startsWith("逾期");

  if (member.admin_confirmed) {
    return {
      className: completedLate
        ? "is-confirmed is-completed-late"
        : "is-confirmed",
      text: completedLate ? "已正式完成・逾期完成" : "已正式完成・準時完成",
    };
  }

  if (member.teacher_completed) {
    return {
      className: completedLate ? "is-completed-late" : "is-waiting",
      text: completedLate
        ? "逾期完成・等待主管確認"
        : "準時完成・等待主管確認",
    };
  }

  const isPastDeadline =
    deadline && new Date(deadline).getTime() < new Date().getTime();

  if (isPastDeadline) {
    return {
      className: "is-overdue",
      text: "已逾期・尚未回報",
    };
  }

  return {
    className: "is-pending",
    text: "尚未回報",
  };
}
function getPriorityLabel(priority) {
  if (priority === "urgent") return "非常重要";
  if (priority === "high") return "重要";
  return "一般";
}

function formatReminderOffset(offset) {
  const fixedOption = REMINDER_OPTIONS.find(
    (option) => option.value === offset
  );

  if (fixedOption) {
    return fixedOption.label;
  }

  if (offset % 1440 === 0) {
    return `${offset / 1440} 天前`;
  }

  if (offset % 60 === 0) {
    return `${offset / 60} 小時前`;
  }

  return `${offset} 分鐘前`;
}

function TeacherAssignmentPage({ currentTeacher }) {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState("");
  const [formData, setFormData] = useState(createEmptyForm());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedMemberIds, setExpandedMemberIds] = useState([]);
  const [expandedAssignmentIds, setExpandedAssignmentIds] = useState([]);
  const [teacherKeyword, setTeacherKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("in_progress");
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

    const result = visibleAssignments.filter((assignment) => {
      const members = assignment.teacher_assignment_members ?? [];
      const matchesKeyword =
        !keyword ||
        assignment.title?.toLowerCase().includes(keyword) ||
        assignment.description?.toLowerCase().includes(keyword) ||
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

      const completed = isAssignmentCompleted(assignment);
      const waitingConfirm = isAssignmentWaitingConfirm(assignment);
      const overdue = isAssignmentOverdue(assignment);

      const matchesStatus =
        (statusFilter === "in_progress" && !completed && !waitingConfirm) ||
        (statusFilter === "waiting_confirm" && waitingConfirm) ||
        (statusFilter === "overdue" && overdue) ||
        (statusFilter === "completed" && completed);

      return matchesKeyword && matchesStatus;
    });

    if (statusFilter === "completed") {
      return [...result].sort(
        (a, b) => getAssignmentCompletedAt(b) - getAssignmentCompletedAt(a)
      );
    }

    return [...result].sort(sortAssignmentsByDeadline);
  }, [visibleAssignments, teacherKeyword, statusFilter]);

  const inProgressAssignmentCount = useMemo(
    () =>
      visibleAssignments.filter(
        (assignment) =>
          !isAssignmentCompleted(assignment) &&
          !isAssignmentWaitingConfirm(assignment)
      ).length,
    [visibleAssignments]
  );

  const waitingConfirmationCount = useMemo(
    () =>
      visibleAssignments.filter((assignment) =>
        isAssignmentWaitingConfirm(assignment)
      ).length,
    [visibleAssignments]
  );

  const completedAssignmentCount = useMemo(
    () =>
      visibleAssignments.filter((assignment) =>
        isAssignmentCompleted(assignment)
      ).length,
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

    setEditingAssignmentId("");
    setFormData(createEmptyForm());
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(assignment) {
    if (!canCreate) {
      setErrorMessage("你沒有修改老師任務的權限。");
      return;
    }

    if (assignment.calendar_event_id) {
      setErrorMessage(
        "這筆任務由行事曆同步，請回到行事曆修改。"
      );
      return;
    }

    const members = assignment.teacher_assignment_members ?? [];

    setEditingAssignmentId(assignment.id);
    setFormData({
      title: assignment.title || "",
      description: assignment.description || "",
      deadline: toDateTimeLocalValue(assignment.deadline),
      priority: assignment.priority || "normal",
      teacherIds: members
        .map((member) => member.teacher_id)
        .filter(Boolean),
      reminderOffsets: Array.isArray(assignment.reminder_offsets)
        ? assignment.reminder_offsets
            .map((offset) => Number(offset))
            .filter(
              (offset) => Number.isInteger(offset) && offset > 0
            )
        : [],
      customReminderValue: "",
      customReminderUnit: "days",
    });
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function closeCreateForm() {
    if (saving) {
      return;
    }

    setIsFormOpen(false);
    setEditingAssignmentId("");
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

  function toggleAssignmentExpanded(assignmentId) {
    setExpandedAssignmentIds((previous) =>
      previous.includes(assignmentId)
        ? previous.filter((id) => id !== assignmentId)
        : [...previous, assignmentId]
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

  function toggleReminderOffset(offset) {
    setFormData((previous) => {
      const alreadySelected =
        previous.reminderOffsets.includes(offset);

      return {
        ...previous,
        reminderOffsets: alreadySelected
          ? previous.reminderOffsets.filter(
              (currentOffset) => currentOffset !== offset
            )
          : [...previous.reminderOffsets, offset],
      };
    });
  }

  function addCustomReminder() {
    const numberValue = Number(formData.customReminderValue);
    const selectedUnit =
      CUSTOM_REMINDER_UNITS[formData.customReminderUnit];

    if (
      !Number.isFinite(numberValue) ||
      numberValue <= 0 ||
      !selectedUnit
    ) {
      setErrorMessage("請輸入正確的自訂提醒時間。");
      return;
    }

    const offset = Math.round(
      numberValue * selectedUnit.multiplier
    );

    if (offset <= 0) {
      setErrorMessage("自訂提醒時間必須大於 0。");
      return;
    }

    setFormData((previous) => ({
      ...previous,
      reminderOffsets: previous.reminderOffsets.includes(offset)
        ? previous.reminderOffsets
        : [...previous.reminderOffsets, offset],
      customReminderValue: "",
    }));

    setErrorMessage("");
  }

  function removeReminderOffset(offset) {
    setFormData((previous) => ({
      ...previous,
      reminderOffsets: previous.reminderOffsets.filter(
        (currentOffset) => currentOffset !== offset
      ),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canCreate) {
      setErrorMessage(
        editingAssignmentId
          ? "你沒有修改老師任務的權限。"
          : "你沒有新增老師任務的權限。"
      );
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

      const payload = {
        ...formData,
        deadline: formData.deadline
          ? new Date(formData.deadline).toISOString()
          : null,
      };

      if (editingAssignmentId) {
        await updateTeacherAssignment(
          editingAssignmentId,
          payload
        );
      } else {
        await createTeacherAssignment(payload);
      }

      await loadPageData();
      closeCreateForm();
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error?.message ||
          (editingAssignmentId
            ? "修改老師任務失敗，請稍後再試。"
            : "新增老師任務失敗，請稍後再試。")
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

      <section className="teacher-assignment-workbar">
        <div className="teacher-assignment-workbar__main">
          <button
            type="button"
            className={statusFilter === "in_progress" ? "is-active" : ""}
            onClick={() => setStatusFilter("in_progress")}
          >
            進行中 <strong>{inProgressAssignmentCount}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === "waiting_confirm" ? "is-active" : ""}
            onClick={() => setStatusFilter("waiting_confirm")}
          >
            待主管確認 <strong>{waitingConfirmationCount}</strong>
          </button>
          <button
            type="button"
            className={statusFilter === "overdue" ? "is-active is-alert" : ""}
            onClick={() => setStatusFilter("overdue")}
          >
            已逾期 <strong>{overdueAssignmentCount}</strong>
          </button>
        </div>

        <button
          type="button"
          className={
            statusFilter === "completed"
              ? "teacher-assignment-workbar__completed is-active"
              : "teacher-assignment-workbar__completed"
          }
          onClick={() => setStatusFilter("completed")}
        >
          已完成 <strong>{completedAssignmentCount}</strong> <span>›</span>
        </button>
      </section>

      <section className="teacher-assignment-list is-compact">
        <div className="teacher-assignment-list__toolbar is-compact">
          <div>
            <h2>
              {statusFilter === "completed"
                ? "已完成任務"
                : statusFilter === "waiting_confirm"
                  ? "待主管確認"
                  : statusFilter === "overdue"
                    ? "逾期任務"
                    : "任務列表"}
            </h2>
            <p>
              {statusFilter === "completed"
                ? "已完成任務獨立收納，需要時再回來查。"
                : "依截止日期自動排序；新增或修改時間後會立即重新排列。"}
            </p>
          </div>

          <div className="teacher-assignment-list__controls">
            <input
              type="search"
              value={teacherKeyword}
              onChange={(event) => setTeacherKeyword(event.target.value)}
              placeholder="搜尋任務、內容或老師"
            />
            <button
              type="button"
              className="teacher-assignment-page__refresh-button"
              onClick={loadPageData}
              disabled={loading}
            >
              {loading ? "讀取中…" : "重新整理"}
            </button>
          </div>
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
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="teacher-assignment-page__empty is-compact">
            <strong>這個區域目前沒有任務</strong>
            <p>可以切換上方分類，或調整搜尋條件。</p>
          </div>
        ) : (
          <div className="teacher-assignment-compact-list">
            {filteredAssignments.map((assignment) => {
              const members = assignment.teacher_assignment_members ?? [];
              const overdue = isAssignmentOverdue(assignment);
              const completed = isAssignmentCompleted(assignment);
              const waitingConfirm = isAssignmentWaitingConfirm(assignment);
              const confirmedCount = members.filter(
                (member) => member.admin_confirmed
              ).length;
              const teacherCompletedCount = members.filter(
                (member) => member.teacher_completed
              ).length;
              const expanded = expandedAssignmentIds.includes(assignment.id);

              return (
                <article
                  className={
                    expanded
                      ? "teacher-assignment-compact-card is-expanded"
                      : "teacher-assignment-compact-card"
                  }
                  key={assignment.id}
                >
                  <button
                    type="button"
                    className="teacher-assignment-compact-card__row"
                    onClick={() => toggleAssignmentExpanded(assignment.id)}
                  >
                    <span
                      className={`teacher-assignment-card__priority is-${assignment.priority}`}
                    >
                      {getPriorityLabel(assignment.priority)}
                    </span>

                    <span className="teacher-assignment-compact-card__title">
                      <strong>{assignment.title}</strong>
                      <small>
                        {assignment.calendar_event_id ? "行事曆同步" : "老師任務"}
                      </small>
                    </span>

                    <span
                      className={
                        overdue
                          ? "teacher-assignment-compact-card__deadline is-overdue"
                          : "teacher-assignment-compact-card__deadline"
                      }
                    >
                      <small>截止</small>
                      <strong>{formatDeadline(assignment.deadline)}</strong>
                    </span>

                    <span className="teacher-assignment-compact-card__progress-text">
                      <small>正式完成</small>
                      <strong>
                        {confirmedCount} / {members.length}
                      </strong>
                    </span>

                    <span className="teacher-assignment-compact-card__status">
                      {completed
                        ? "已完成"
                        : waitingConfirm
                          ? `待確認 ${teacherCompletedCount}/${members.length}`
                          : overdue
                            ? "已逾期"
                            : "進行中"}
                    </span>

                    <span className="teacher-assignment-compact-card__chevron">
                      {expanded ? "⌃" : "⌄"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="teacher-assignment-compact-card__details">
                      <div className="teacher-assignment-compact-card__details-head">
                        <div>
                          <span>截止時間</span>
                          <strong>{formatDeadline(assignment.deadline)}</strong>
                        </div>

                        <div className="teacher-assignment-compact-card__actions">
                          {canCreate && !assignment.calendar_event_id && (
                            <button
                              type="button"
                              className="teacher-assignment-page__refresh-button"
                              onClick={() => openEditForm(assignment)}
                              disabled={processingId === assignment.id}
                            >
                              編輯
                            </button>
                          )}
                          {assignment.calendar_event_id && adminMode && (
                            <span>由行事曆同步</span>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="teacher-assignment-card__delete"
                              onClick={() => handleDeleteAssignment(assignment)}
                              disabled={processingId === assignment.id}
                            >
                              刪除
                            </button>
                          )}
                        </div>
                      </div>

                      {assignment.description && (
                        <p className="teacher-assignment-card__description">
                          {assignment.description}
                        </p>
                      )}

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
                                      (confirmedCount / members.length) * 100
                                    )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="teacher-assignment-members">
                        {members.map((member) => {
                          const teacher = member.teachers;
                          const isProcessing = processingId === member.id;
                          const isOwnAssignment =
                            member.teacher_id === currentTeacher?.id;
                          const mayComplete =
                            adminMode || (canCompleteOwn && isOwnAssignment);
                          const isHistoryExpanded =
                            expandedMemberIds.includes(member.id);
                          const memberStatus = getMemberStatus(
                            member,
                            assignment.deadline
                          );

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
                                  <span>{teacher?.position || "未設定職務"}</span>
                                </div>
                              </div>

                              <div className="teacher-assignment-member__status">
                                <span className={memberStatus.className}>
                                  {memberStatus.text}
                                </span>
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
                                    onClick={() => handleTeacherComplete(member)}
                                    disabled={isProcessing || member.admin_confirmed}
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
                                    onClick={() => handleAdminConfirm(member)}
                                    disabled={isProcessing || !member.teacher_completed}
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
                                      {formatHistoryTime(assignment.created_at)}
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
                                      {formatHistoryTime(member.admin_confirmed_at)}
                                    </strong>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
                <p>{editingAssignmentId ? "Edit Assignment" : "New Assignment"}</p>
                <h2 id="teacher-assignment-form-title">
                  {editingAssignmentId ? "編輯老師任務" : "新增老師任務"}
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
                            <div className="teacher-assignment-form__reminders">
                <div className="teacher-assignment-form__section-heading">
                  <span>截止前提醒</span>
                  <small>可一次複選，也可以不設定</small>
                </div>

                {!formData.deadline && (
                  <div className="teacher-assignment-form__reminder-notice">
                    請先設定截止日期與時間，提醒才會生效。
                  </div>
                )}

                <div className="teacher-assignment-form__reminder-grid">
                  {REMINDER_OPTIONS.map((option) => {
                    const selected =
                      formData.reminderOffsets.includes(option.value);

                    return (
                      <label
                        className={
                          selected
                            ? "teacher-assignment-form__reminder-option is-selected"
                            : "teacher-assignment-form__reminder-option"
                        }
                        key={option.value}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            toggleReminderOffset(option.value)
                          }
                        />

                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="teacher-assignment-form__custom-reminder">
                  <span>自訂提醒</span>

                  <div className="teacher-assignment-form__custom-reminder-row">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={formData.customReminderValue}
                      onChange={(event) =>
                        setFormData((previous) => ({
                          ...previous,
                          customReminderValue: event.target.value,
                        }))
                      }
                      placeholder="輸入數字"
                    />

                    <select
                      value={formData.customReminderUnit}
                      onChange={(event) =>
                        setFormData((previous) => ({
                          ...previous,
                          customReminderUnit: event.target.value,
                        }))
                      }
                    >
                      <option value="days">天前</option>
                      <option value="hours">小時前</option>
                      <option value="minutes">分鐘前</option>
                    </select>

                    <button
                      type="button"
                      onClick={addCustomReminder}
                    >
                      ＋ 加入
                    </button>
                  </div>
                </div>

                {formData.reminderOffsets.length > 0 && (
                  <div className="teacher-assignment-form__selected-reminders">
                    <span>已選擇提醒</span>

                    <div>
                      {[...formData.reminderOffsets]
                        .sort((a, b) => b - a)
                        .map((offset) => (
                          <button
                            type="button"
                            key={offset}
                            onClick={() =>
                              removeReminderOffset(offset)
                            }
                            title="點擊移除"
                          >
                            {formatReminderOffset(offset)}
                            <b>×</b>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
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
                  {saving
                    ? editingAssignmentId
                      ? "儲存中…"
                      : "建立中…"
                    : editingAssignmentId
                      ? "儲存修改"
                      : "建立任務"}
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