import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getExternalStaff,
  getLeaveTypes,
} from "../../services/leaveService";

import {
  CATEGORY_LABELS,
  STUDENT_STATUS_LABELS,
  ackItems,
  addLeaveItem,
  approveLeaveRequest,
  describeNotifyResult,
  getActivePickupStaffRules,
  getAllTeachersSlotLoads,
  pickupDutiesFor,
  MAX_KIDS_PER_TEACHER,
  notifyItemsSubstitutes,
  notifyRemovedSubstitutes,
  setPaperReturned,
  renotifySubstitutes,
  returnLeaveRequest,
  submitLeaveRequest,
  buildDutyItems,
  cancelLeaveRequest,
  completeLeaveRequest,
  createLeaveRequest,
  deleteLeaveItem,
  formatDateLabel,
  formatTime,
  getCurrentTeacher,
  getLeavesInRange,
  getRequestProgress,
  getWorkflowRequests,
  getWorkflowTeachers,
  markStudentDayOff,
  markStudentLeft,
  hasSubstitute,
  listWorkDates,
  mergeLeaveItem,
  needsCoverage,
  parseDate,
  presentStudents,
  reopenLeaveRequest,
  splitLeaveItem,
  timesOverlap,
  toDateString,
  updateLeaveItem,
  updateManyItems,
} from "../../services/leaveWorkflowService";

import { downloadSignSheetPdf } from "./leaveSignSheetPdf";

import "./LeaveWorkflowPanel.css";


const STEPS = [
  { key: "coverage", label: "排代理" },
  { key: "handover", label: "交接" },
  { key: "submit", label: "送出" },
  { key: "approve", label: "主管確認" },
  { key: "ack", label: "代理確認" },
  { key: "paper", label: "紙本收回" },
  { key: "ready", label: "完成" },
];

const ADMIN_FILTERS = [
  { key: "waiting", label: "待主管確認" },
  { key: "in_progress", label: "進行中" },
  { key: "mine", label: "我的代理" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];

const TEACHER_FILTERS = [
  { key: "own", label: "我的請假" },
  { key: "mine", label: "我的代班" },
  { key: "completed", label: "已完成" },
];

function getUrlLeaveId() {
  try {
    return new URL(window.location.href).searchParams.get("leave");
  } catch {
    return null;
  }
}

const EMPTY_SUB = {
  substitute_teacher_id: null,
  substitute_external_id: null,
  substitute_name: null,
  ack_at: null,
  ack_by: null,
  ack_by_admin: false,
};


function teacherName(teacher) {
  if (!teacher) return "";
  return teacher.chinese_name || teacher.english_name || "";
}

function substituteName(item) {
  if (item.substitute_teacher) return teacherName(item.substitute_teacher);
  if (item.substitute_external) return item.substitute_external.name;
  if (item.substitute_name) return item.substitute_name;
  return "";
}

function timeLabel(item) {
  if (item.category === "slot") return item.title;
  const start = formatTime(item.start_time);
  const end = formatTime(item.end_time);
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return "未設定時間";
}

function addWorkDays(startDate, count) {
  const cursor = parseDate(startDate);
  let found = 0;
  let last = startDate;
  let guard = 0;
  while (found < count && guard < 62) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      found += 1;
      last = toDateString(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return last;
}

function studentCounts(item) {
  const list = item.students || [];
  return {
    present: list.filter((s) => s.status === "present").length,
    absent: list.filter((s) => s.status === "absent").length,
    english: list.filter((s) => s.status === "english").length,
    left: list.filter((s) => s.status === "left").length,
  };
}

/** 班級時段可以快速勾選的活動 */
const ACTIVITY_OPTIONS = ["作業時間", "多元課程", "點心"];

function hasHandoverDraft(item) {
  if ((item.activity_tags || []).length) return true;
  return [item.handover_progress, item.handover_students, item.handover_parents, item.handover_materials].some(
    (v) => v && String(v).trim()
  );
}

function groupByDate(items) {
  const groups = {};
  items.forEach((item) => {
    if (!groups[item.item_date]) groups[item.item_date] = [];
    groups[item.item_date].push(item);
  });
  return Object.entries(groups).sort(([a], [b]) => (a < b ? -1 : 1));
}

function dateRangeText(request) {
  return request.start_date === request.end_date
    ? formatDateLabel(request.start_date)
    : `${formatDateLabel(request.start_date)} ～ ${formatDateLabel(request.end_date)}`;
}


function LeaveWorkflowPanel({ mode = "admin", asTeacher = null, onExitPreview = null }) {
  const isTeacherMode = mode === "teacher";
  const isPreview = Boolean(asTeacher);
  const [previewTeacherId, setPreviewTeacherId] = useState("");
  const [currentTeacher, setCurrentTeacher] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [externalStaff, setExternalStaff] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  const [filter, setFilter] = useState(isTeacherMode ? "own" : "in_progress");
  const [selectedId, setSelectedId] = useState(getUrlLeaveId);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = currentTeacher?.role === "admin";

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [me, teacherList, externalList, typeList, requestList] = await Promise.all([
        getCurrentTeacher(),
        getWorkflowTeachers(),
        getExternalStaff(),
        getLeaveTypes(),
        getWorkflowRequests(),
      ]);
      setCurrentTeacher(asTeacher || me);
      // 一般名單不含主管；主管只在主管畫面的代理人選單最後面出現（排不開時才用）
      setTeachers(teacherList.filter((t) => t.role !== "admin"));
      setAdmins(teacherList.filter((t) => t.role === "admin"));
      setExternalStaff(externalList.filter((s) => s.is_active));
      setLeaveTypes(typeList);
      setRequests(requestList);
    } catch (error) {
      console.error("讀取請假流程失敗：", error);
      setMessage({ type: "error", text: `讀取請假流程失敗：${error.message}` });
    } finally {
      setLoading(false);
    }
  }, [asTeacher]);

  const reloadRequests = useCallback(async () => {
    try {
      setRequests(await getWorkflowRequests());
    } catch (error) {
      setMessage({ type: "error", text: `重新讀取失敗：${error.message}` });
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeItems = useMemo(
    () =>
      requests
        .filter((r) => r.status === "in_progress")
        .flatMap((r) => (r.leave_request_items || []).filter(needsCoverage)),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const meId = String(currentTeacher?.id || "");
    if (filter === "waiting") {
      return requests.filter((r) => r.status === "in_progress" && r.submitted_at && !r.approved_at);
    }
    if (filter === "own") {
      return requests.filter((r) => r.status === "in_progress" && String(r.teacher_id) === meId);
    }
    if (filter === "completed" && isTeacherMode) {
      return requests.filter(
        (r) =>
          r.status === "completed" &&
          (String(r.teacher_id) === meId ||
            (r.leave_request_items || []).some((i) => String(i.substitute_teacher_id) === meId))
      );
    }
    if (filter === "mine") {
      if (!currentTeacher) return [];
      return requests.filter(
        (r) =>
          r.status === "in_progress" &&
          // 老師畫面：主管確認後，代班老師才看得到
          (!isTeacherMode || r.approved_at) &&
          (r.leave_request_items || []).some(
            (i) => String(i.substitute_teacher_id) === String(currentTeacher.id)
          )
      );
    }
    return requests.filter((r) => r.status === filter);
  }, [requests, filter, currentTeacher, isTeacherMode]);

  const stats = useMemo(() => {
    const today = toDateString(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = toDateString(tomorrowDate);
    const uncovered = activeItems.filter((i) => !hasSubstitute(i));
    const urgent = uncovered.filter((i) => i.item_date === today || i.item_date === tomorrow);
    const myPending = currentTeacher
      ? activeItems.filter(
          (i) =>
            String(i.substitute_teacher_id) === String(currentTeacher.id) &&
            !i.ack_at &&
            requests.some((r) => r.id === i.request_id && r.approved_at)
        )
      : [];
    return {
      waiting: requests.filter((r) => r.status === "in_progress" && r.submitted_at && !r.approved_at).length,
      inProgress: requests.filter((r) => r.status === "in_progress").length,
      uncovered: uncovered.length,
      urgent: urgent.length,
      myPending: myPending.length,
    };
  }, [requests, activeItems, currentTeacher]);

  const selectedRequest = requests.find((r) => r.id === selectedId) || null;

  const previewTeacher = teachers.find((t) => String(t.id) === String(previewTeacherId)) || null;
  if (!isTeacherMode && previewTeacher) {
    return (
      <LeaveWorkflowPanel
        key={previewTeacher.id}
        mode="teacher"
        asTeacher={{ ...previewTeacher, role: "teacher" }}
        onExitPreview={() => setPreviewTeacherId("")}
      />
    );
  }

  if (loading) {
    return (
      <section className="leave-section">
        <div className="lwf-loading">讀取請假流程中…</div>
      </section>
    );
  }

  const previewBanner = isPreview && (
    <div className="lwf-preview-banner">
      <span>
        👀 正在用 <strong>{teacherName(asTeacher)}</strong> 老師的畫面預覽。在這裡按下的按鈕會真的寫入資料。
      </span>
      <button type="button" className="leave-secondary-button" onClick={onExitPreview}>
        回主管畫面
      </button>
    </div>
  );

  if (selectedRequest) {
    return (
      <>
      {previewBanner}
      <RequestDetail
        request={selectedRequest}
        teachers={teachers}
        admins={admins}
        externalStaff={externalStaff}
        currentTeacher={currentTeacher}
        isAdmin={isAdmin && !isTeacherMode}
        activeItems={activeItems}
        onBack={() => {
          setSelectedId(null);
          if (getUrlLeaveId()) window.history.replaceState(null, "", window.location.pathname);
        }}
        onChanged={reloadRequests}
      />
      </>
    );
  }

  return (
    <section className="leave-section">
      {previewBanner}
      <div className="leave-records-heading">
        <div>
          <h2>{isTeacherMode ? "我的請假" : "請假流程"}</h2>
          <p>
            自己找好代理人、填交接單 → 送出給主管 → 主管確認 → 代理老師確認，全部完成才算請假完成。
          </p>
        </div>
        <div className="lwf-heading-actions">
          {!isTeacherMode && isAdmin && (
            <label className="lwf-preview-select">
              <span>用老師畫面預覽</span>
              <select value={previewTeacherId} onChange={(e) => setPreviewTeacherId(e.target.value)}>
                <option value="">選擇老師</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{teacherName(t)}</option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="leave-primary-button" onClick={() => setShowForm(true)}>
            ＋ 新增請假
          </button>
        </div>
      </div>

      {message && <div className={`leave-message leave-message--${message.type}`}>{message.text}</div>}

      {!isTeacherMode && (
      <div className="lwf-stats">
        <div className={`lwf-stat ${stats.waiting ? "lwf-stat--warn" : ""}`}>
          <span>待主管確認</span>
          <strong>{stats.waiting}</strong>
        </div>
        <div className={`lwf-stat ${stats.uncovered ? "lwf-stat--warn" : ""}`}>
          <span>還沒排代理的格子</span>
          <strong>{stats.uncovered}</strong>
        </div>
        <div className={`lwf-stat ${stats.urgent ? "lwf-stat--danger" : ""}`}>
          <span>今天／明天的缺口</span>
          <strong>{stats.urgent}</strong>
        </div>
      </div>
      )}

      {isTeacherMode && stats.myPending > 0 && (
        <div className="lwf-my-ack">
          <span>你有 <strong>{stats.myPending}</strong> 格代班還沒確認，到「我的代班」打開查看。</span>
        </div>
      )}

      <div className="lwf-filters">
        {(isTeacherMode ? TEACHER_FILTERS : ADMIN_FILTERS).map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? "lwf-filter lwf-filter--active" : "lwf-filter"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredRequests.length === 0 ? (
        <div className="leave-empty-state">
          <strong>目前沒有資料</strong>
          <p>
            {filter === "in_progress" || filter === "own"
              ? "沒有進行中的請假。"
              : filter === "waiting"
              ? "沒有等你確認的請假。"
              : filter === "mine"
              ? "目前沒有需要你代理的格子。"
              : "這個分類目前沒有請假。"}
          </p>
        </div>
      ) : (
        <div className="lwf-request-list">
          {filteredRequests.map((request) => (
            <RequestCard key={request.id} request={request} onOpen={() => setSelectedId(request.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <NewRequestModal
          lockToSelf={isTeacherMode}
          teachers={teachers}
          leaveTypes={leaveTypes}
          currentTeacher={currentTeacher}
          onClose={() => setShowForm(false)}
          onCreated={async (request) => {
            setShowForm(false);
            await reloadRequests();
            setSelectedId(request.id);
          }}
        />
      )}
    </section>
  );
}


/* =========================
   請假卡片、步驟條
========================= */

function RequestCard({ request, onOpen }) {
  const progress = getRequestProgress(request);
  return (
    <button type="button" className="lwf-card" onClick={onOpen}>
      <div className="lwf-card-main">
        <div className="lwf-card-title">
          <strong>{teacherName(request.teachers)}</strong>
          <span className="lwf-badge">{request.leave_types?.name}</span>
          {request.is_last_minute && <span className="lwf-badge lwf-badge--danger">臨時假</span>}
        </div>
        <small>
          {dateRangeText(request)}・{request.input_value}
          {request.input_unit === "DAY" ? " 天" : " 小時"}
          {request.reason ? `・${request.reason}` : ""}
        </small>
      </div>
      <StepBar progress={progress} compact />
    </button>
  );
}

function StepBar({ progress, compact = false }) {
  if (progress.step === "completed") return <div className="lwf-done-tag">✓ 已完成，已寫入休假紀錄</div>;
  if (progress.step === "cancelled") return <div className="lwf-cancel-tag">已取消</div>;

  const counts = {
    coverage: `${progress.covered}/${progress.total}`,
    handover: `${progress.handed}/${progress.total}`,
    submit: "",
    approve: "",
    ack: `${progress.acked}/${progress.total}`,
    paper: "",
    ready: progress.ready ? "可完成" : "",
  };
  const done = {
    coverage: progress.total > 0 && progress.covered === progress.total,
    handover: progress.total > 0 && progress.handed === progress.total,
    submit: progress.submitted,
    approve: progress.approved,
    ack: progress.total > 0 && progress.acked === progress.total,
    paper: progress.paperReturned,
    ready: false,
  };

  return (
    <div className={compact ? "lwf-steps lwf-steps--compact" : "lwf-steps"}>
      {STEPS.map((step, index) => {
        let state = "todo";
        if (done[step.key]) state = "done";
        else if (step.key === progress.step) state = "current";
        return (
          <div key={step.key} className={`lwf-step lwf-step--${state}`}>
            <span className="lwf-step-dot">{state === "done" ? "✓" : index + 1}</span>
            <span className="lwf-step-label">
              {step.label}
              {counts[step.key] && <em>{counts[step.key]}</em>}
            </span>
          </div>
        );
      })}
    </div>
  );
}


/* =========================
   孩子名單
========================= */

function StudentList({
  students,
  selectable = false,
  selected = [],
  onToggle,
  onLeave,
  onUndoLeave,
  onDayOff,
  onUndoDayOff,
}) {
  const order = { present: 0, english: 1, left: 2, absent: 3 };
  const sorted = [...students].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return (
    <div className="lwf-students">
      {sorted.map((s) => {
        const canSelect = selectable && s.status === "present";
        const checked = selected.includes(String(s.id));
        return (
          <label
            key={s.id}
            className={`lwf-student lwf-student--${s.status} ${checked ? "lwf-student--checked" : ""}`}
          >
            {canSelect && <input type="checkbox" checked={checked} onChange={() => onToggle(String(s.id))} />}
            <strong>{s.name}</strong>
            <span className="lwf-student-meta">{[s.class_name, s.school, s.grade].filter(Boolean).join("・")}</span>
            {s.status !== "present" && (
              <span className={`lwf-status lwf-status--${s.status}`}>{STUDENT_STATUS_LABELS[s.status]}</span>
            )}
            {onLeave && s.status === "present" && (
              <button
                type="button"
                className="lwf-leave-button"
                title="這個孩子從這個時段起已經離開"
                onClick={(e) => {
                  e.preventDefault();
                  onLeave(s);
                }}
              >
                離班
              </button>
            )}
            {onDayOff && (s.status === "present" || s.status === "english" || s.status === "left") && (
              <button
                type="button"
                className="lwf-leave-button"
                title="家長來電請假，這一天所有時段都不在"
                onClick={(e) => {
                  e.preventDefault();
                  onDayOff(s);
                }}
              >
                當日請假
              </button>
            )}
            {onUndoDayOff && s.day_off && (
              <button
                type="button"
                className="lwf-leave-button"
                onClick={(e) => {
                  e.preventDefault();
                  onUndoDayOff(s);
                }}
              >
                取消請假
              </button>
            )}
            {onUndoLeave && s.status === "left" && (
              <button
                type="button"
                className="lwf-leave-button"
                onClick={(e) => {
                  e.preventDefault();
                  onUndoLeave(s);
                }}
              >
                取消離班
              </button>
            )}
            {s.note && <span className="lwf-student-note">{s.note}</span>}
          </label>
        );
      })}
    </div>
  );
}

function CountChips({ item }) {
  if (item.category !== "slot") {
    return item.student_count ? <span className="lwf-count">{item.student_count} 人</span> : null;
  }
  const c = studentCounts(item);
  return (
    <span className="lwf-count-chips">
      <span className="lwf-mini lwf-mini--present">在班 {c.present}</span>
      {c.english > 0 && <span className="lwf-mini lwf-mini--english">美語 {c.english}</span>}
      {c.left > 0 && <span className="lwf-mini lwf-mini--absent">離班 {c.left}</span>}
      {c.absent > 0 && <span className="lwf-mini lwf-mini--absent">不到 {c.absent}</span>}
    </span>
  );
}


/* =========================
   新增請假
========================= */

function NewRequestModal({ lockToSelf = false, teachers, leaveTypes, currentTeacher, onClose, onCreated }) {
  const today = toDateString(new Date());
  const [form, setForm] = useState(() => ({
    teacherId:
      currentTeacher && (lockToSelf || currentTeacher.role !== "admin") ? currentTeacher.id : "",
    leaveTypeId: "",
    startDate: today,
    endDate: today,
    inputUnit: "DAY",
    inputValue: 1,
    isLastMinute: false,
    reason: "",
    rangeStart: "",
    rangeEnd: "",
  }));
  const [items, setItems] = useState(null);
  const [dayNotes, setDayNotes] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [openKey, setOpenKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dates = listWorkDates(form.startDate, form.endDate);
  const dayMismatch = form.inputUnit === "DAY" && Number(form.inputValue) > dates.length;

  function updateForm(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "startDate" && next.endDate < value) next.endDate = value;
      // 改天數或開始日 → 結束日期自動推到第 N 個上班日
      if ((key === "inputValue" || key === "startDate") && next.inputUnit === "DAY") {
        const n = Math.ceil(Number(next.inputValue) || 0);
        if (n >= 1) next.endDate = addWorkDays(next.startDate, n);
      }
      // 改結束日期 → 天數跟著變
      if (key === "endDate" && next.inputUnit === "DAY") {
        const n = listWorkDates(next.startDate, value).length;
        if (n) next.inputValue = n;
      }
      return next;
    });
    if (["teacherId", "startDate", "endDate", "inputValue", "rangeStart", "rangeEnd"].includes(key)) setItems(null);
  }

  async function handleBuild() {
    setError("");
    const teacher = teachers.find((t) => String(t.id) === String(form.teacherId));
    if (!teacher) return setError("請先選擇請假老師。");
    if (!dates.length) return setError("請假期間沒有上班日（週一到週五）。");
    try {
      setBusy(true);
      if ((form.rangeStart && !form.rangeEnd) || (!form.rangeStart && form.rangeEnd)) {
        setBusy(false);
        return setError("請假時段要填開始和結束，或兩個都不填（整天）。");
      }
      const result = await buildDutyItems(
        teacher,
        form.startDate,
        form.endDate,
        form.rangeStart && form.rangeEnd ? { start: form.rangeStart, end: form.rangeEnd } : null
      );
      setItems(result.items.map((item, i) => ({ ...item, _key: `auto-${i}` })));
      setDayNotes(result.dayNotes || {});
      setWarnings(result.warnings);
    } catch (e) {
      setError(`算出職責失敗：${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function updateItem(key, patch) {
    setItems((prev) => prev.map((i) => (i._key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key) {
    setItems((prev) => prev.filter((i) => i._key !== key));
  }

  function addCustomItem() {
    setItems((prev) => [
      ...(prev || []),
      {
        _key: `custom-${Date.now()}`,
        item_date: dates[0] || form.startDate,
        start_time: null,
        end_time: null,
        category: "other",
        title: "",
        students: [],
        student_count: 0,
        source_id: null,
      },
    ]);
  }

  async function handleSubmit() {
    setError("");
    try {
      setBusy(true);
      const request = await createLeaveRequest({ ...form, dayNotes }, items || []);
      await onCreated(request);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="leave-modal-backdrop" onMouseDown={busy ? undefined : onClose}>
      <div className="leave-modal lwf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="leave-modal-header">
          <div>
            <span>LEAVE REQUEST</span>
            <h3>新增請假</h3>
          </div>
          <button type="button" className="leave-modal-close" onClick={onClose} disabled={busy}>×</button>
        </div>

        {lockToSelf && (
          <div className="lwf-rule-note">
            請先<strong>親自和代理老師協調好</strong>，再在系統上登記。真的找不到人，請直接跟主管說。
          </div>
        )}

        <div className="leave-form">
          <label className="leave-field">
            <span>請假老師</span>
            <select
              value={form.teacherId}
              disabled={lockToSelf}
              onChange={(e) => updateForm("teacherId", e.target.value)}
            >
              <option value="">請選擇</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {teacherName(t)}
                  {t.english_name && t.chinese_name ? `（${t.english_name}）` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="leave-field">
            <span>假別</span>
            <select value={form.leaveTypeId} onChange={(e) => updateForm("leaveTypeId", e.target.value)}>
              <option value="">請選擇</option>
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <label className="leave-field">
            <span>請假單位</span>
            <select value={form.inputUnit} onChange={(e) => updateForm("inputUnit", e.target.value)}>
              <option value="DAY">天</option>
              <option value="HOUR">小時</option>
            </select>
          </label>

          <label className="leave-field">
            <span>{form.inputUnit === "DAY" ? "天數" : "時數"}</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={form.inputValue}
              onChange={(e) => updateForm("inputValue", e.target.value)}
            />
          </label>

          <label className="leave-field">
            <span>開始日期</span>
            <input type="date" value={form.startDate} onChange={(e) => updateForm("startDate", e.target.value)} />
          </label>

          <label className="leave-field">
            <span>結束日期</span>
            <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => updateForm("endDate", e.target.value)} />
            <small className={dayMismatch ? "lwf-conflict" : ""}>
              {dayMismatch
                ? `請 ${form.inputValue} 天，但這段只有 ${dates.length} 個上班日`
                : `共 ${dates.length} 個上班日：${dates.map(formatDateLabel).join("、")}`}
            </small>
          </label>

          <label className="leave-field">
            <span>請假時段（選填，半天假用）</span>
            <span className="lwf-range">
              <input type="time" value={form.rangeStart} onChange={(e) => updateForm("rangeStart", e.target.value)} />
              <em>～</em>
              <input type="time" value={form.rangeEnd} onChange={(e) => updateForm("rangeEnd", e.target.value)} />
            </span>
            <small>不填＝整天。填了只會列出這段時間有孩子在班的格子。</small>
          </label>

          <label className="leave-field">
            <span>原因（選填）</span>
            <input value={form.reason} onChange={(e) => updateForm("reason", e.target.value)} placeholder="例：家中有事、看診" />
          </label>

          <label className="leave-check-field leave-field--full">
            <input type="checkbox" checked={form.isLastMinute} onChange={(e) => updateForm("isLastMinute", e.target.checked)} />
            <div>
              <strong>臨時假</strong>
              <span>當天或前一天才請。交接單可以先由主任代填，之後再請老師補。</span>
            </div>
          </label>
        </div>

        <div className="lwf-build">
          <div className="lwf-build-head">
            <div>
              <strong>受影響的孩子與時段</strong>
              <small>
                依接送設定判斷每個孩子幾點到班、哪天不到，美語課自動帶入，一二年級不列入。半天假請刪掉不受影響的時段。
              </small>
            </div>
            <button type="button" className="leave-secondary-button" onClick={handleBuild} disabled={busy || dayMismatch}>
              {items ? "重新計算" : "算出影響範圍"}
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="leave-message leave-message--error">讀不到：{warnings.join("、")}資料，請手動補上。</div>
          )}

          {items && (
            <>
              {items.length === 0 && Object.keys(dayNotes).length === 0 ? (
                <div className="lwf-hint">系統沒找到這位老師負責的班級、接送或美語課。請手動新增她負責的職責。</div>
              ) : (
                dates.map((date) => {
                  const dayItems = items.filter((i) => i.item_date === date);
                  return (
                    <div key={date} className="lwf-preview-day">
                      <h4>{formatDateLabel(date)}</h4>
                      {(dayNotes[date] || []).map((note) => (
                        <div key={note} className="lwf-day-note">📅 {note}</div>
                      ))}
                      {dayItems.map((item) => (
                        <div key={item._key} className="lwf-preview-item">
                          <div className="lwf-preview-row">
                            {item.category === "other" ? (
                              <span className="lwf-preview-times">
                                <input
                                  type="time"
                                  value={formatTime(item.start_time)}
                                  onChange={(e) => updateItem(item._key, { start_time: e.target.value || null })}
                                />
                                <input
                                  type="time"
                                  value={formatTime(item.end_time)}
                                  onChange={(e) => updateItem(item._key, { end_time: e.target.value || null })}
                                />
                              </span>
                            ) : (
                              <span className="lwf-time-text">{timeLabel(item)}</span>
                            )}
                            <span className={`lwf-cat lwf-cat--${item.category}`}>{CATEGORY_LABELS[item.category]}</span>
                            {item.category === "other" ? (
                              <input
                                className="lwf-preview-title"
                                value={item.title}
                                placeholder="職責名稱，例：午休巡堂"
                                onChange={(e) => updateItem(item._key, { title: e.target.value })}
                              />
                            ) : item.category === "slot" ? (
                              <button
                                type="button"
                                className="lwf-link-button"
                                onClick={() => setOpenKey(openKey === item._key ? null : item._key)}
                              >
                                <CountChips item={item} /> {openKey === item._key ? "▴ 收起" : "▾ 看孩子"}
                              </button>
                            ) : (
                              <strong>{item.title}</strong>
                            )}
                            <button type="button" className="lwf-icon-button" onClick={() => removeItem(item._key)} title="刪除這格">×</button>
                          </div>
                          {openKey === item._key && <StudentList students={item.students || []} />}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}

              <button type="button" className="lwf-link-button" onClick={addCustomItem}>＋ 手動新增一格</button>
            </>
          )}
        </div>

        {error && <div className="leave-message leave-message--error">{error}</div>}

        <div className="leave-form-actions">
          <button type="button" className="leave-secondary-button" onClick={onClose} disabled={busy}>取消</button>
          <button
            type="button"
            className="leave-primary-button"
            onClick={handleSubmit}
            disabled={busy || !items || items.length === 0 || dayMismatch}
          >
            {busy ? "處理中…" : "送出請假，開始排代理"}
          </button>
        </div>
      </div>
    </div>
  );
}


/* =========================
   請假明細
========================= */

function RequestDetail({ request, teachers, admins = [], externalStaff, currentTeacher, isAdmin, activeItems, onBack, onChanged }) {
  const [otherLeaves, setOtherLeaves] = useState([]);
  const [openHandoverId, setOpenHandoverId] = useState(null);
  const [showAllHandover, setShowAllHandover] = useState(false);
  const [confirmAsked, setConfirmAsked] = useState(false);
  const [openSegments, setOpenSegments] = useState({});
  const [toolsOpenId, setToolsOpenId] = useState(null);
  const [savedAt, setSavedAt] = useState({});
  const [openStudentsId, setOpenStudentsId] = useState(null);
  const [splitSelection, setSplitSelection] = useState({});
  const [ownLoads, setOwnLoads] = useState({});
  const [pickupRules, setPickupRules] = useState([]);

  useEffect(() => {
    let alive = true;
    getActivePickupStaffRules().then((rules) => alive && setPickupRules(rules));
    return () => {
      alive = false;
    };
  }, []);

  /** 這位老師在這格的時間，自己也要接送嗎？（不含這一格本身就是那趟接送） */
  function ownPickupClash(teacher, item) {
    if (!teacher) return [];
    return pickupDutiesFor(pickupRules, teacher, item.item_date).filter(
      (duty) =>
        !(item.category === "pickup" && String(item.source_id) === duty.rule_id) &&
        timesOverlap(
          { start_time: duty.time, end_time: duty.time },
          { start_time: item.start_time, end_time: item.end_time || item.start_time }
        )
    );
  }
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const items = request.leave_request_items || [];
  const workItems = items.filter(needsCoverage);
  const progress = getRequestProgress(request);
  const editable = request.status === "in_progress";
  const approved = Boolean(request.approved_at);
  const submitted = Boolean(request.submitted_at);
  // 排代理、交接：請假老師在主管確認前可以改；主管隨時可以改
  const canArrange = editable && (isAdmin || (isRequesterCheck() && !approved));
  // 代理確認：主管確認之後才開放
  const canAck = editable && approved;

  function isRequesterCheck() {
    return currentTeacher && String(currentTeacher.id) === String(request.teacher_id);
  }
  const isRequester = currentTeacher && String(currentTeacher.id) === String(request.teacher_id);
  const dayNotes = request.day_notes || {};

  const isMineItem = (i) => currentTeacher && String(i.substitute_teacher_id) === String(currentTeacher.id);
  const myPendingIds = workItems.filter((i) => isMineItem(i) && i.handover_done && !i.ack_at).map((i) => i.id);
  const myWaitingHandover = workItems.filter((i) => isMineItem(i) && !i.handover_done).length;
  const adminAckIds = workItems.filter((i) => hasSubstitute(i) && i.handover_done && !i.ack_at).map((i) => i.id);

  useEffect(() => {
    let alive = true;
    getLeavesInRange(request.start_date, request.end_date)
      .then((rows) => alive && setOtherLeaves(rows))
      .catch((e) => console.error("讀取同期請假失敗：", e));
    return () => {
      alive = false;
    };
  }, [request.start_date, request.end_date]);

  // 每位老師自己班在各時段的孩子數（一次算好全部老師，下拉選單直接顯示）
  const dateKey = [...new Set(items.map((i) => i.item_date))].sort().join(",");
  useEffect(() => {
    let alive = true;
    const dates = dateKey ? dateKey.split(",") : [];
    getAllTeachersSlotLoads(dates).then((loads) => {
      if (alive) setOwnLoads(loads || {});
    });
    return () => {
      alive = false;
    };
  }, [dateKey]);

  function teacherSlotSummary(teacherId, item) {
    if (item.category !== "slot" || !item.slot_key) return null;
    const id = String(teacherId);
    const own = ownLoads[`${id}|${item.item_date}|${item.slot_key}`] || 0;
    const covering = activeItems
      .filter(
        (o) =>
          o.id !== item.id &&
          String(o.substitute_teacher_id) === id &&
          o.item_date === item.item_date &&
          o.slot_key === item.slot_key
      )
      .reduce((sum, o) => sum + presentStudents(o).length, 0);
    return { own, covering };
  }

  function getLoad(item) {
    if (item.category !== "slot" || !item.substitute_teacher_id || !item.slot_key) return null;
    const id = String(item.substitute_teacher_id);
    const own = ownLoads[`${id}|${item.item_date}|${item.slot_key}`] || 0;
    const covering = activeItems
      .filter(
        (o) =>
          String(o.substitute_teacher_id) === id &&
          o.item_date === item.item_date &&
          o.slot_key === item.slot_key
      )
      .reduce((sum, o) => sum + presentStudents(o).length, 0);
    return { own, covering, total: own + covering };
  }

  function getConflicts(item) {
    const warnings = [];
    if (!item.substitute_teacher_id) return warnings;
    const subId = String(item.substitute_teacher_id);

    const subTeacher = teachers.find((t) => String(t.id) === subId);
    ownPickupClash(subTeacher, item).forEach((duty) => {
      warnings.push(`${duty.time} 自己也要接送（${duty.school}）`);
    });

    if (
      otherLeaves.some(
        (leave) =>
          String(leave.teacher_id) === subId &&
          leave.id !== request.id &&
          leave.start_date <= item.item_date &&
          leave.end_date >= item.item_date
      )
    ) {
      warnings.push("這天也請假");
    }

    activeItems
      .filter(
        (other) =>
          other.id !== item.id &&
          String(other.substitute_teacher_id) === subId &&
          other.item_date === item.item_date &&
          other.request_id !== request.id &&
          timesOverlap(other, item)
      )
      .forEach((other) => warnings.push(`同時段已代理別的請假（${timeLabel(other)}）`));

    return warnings;
  }

  async function run(key, fn, successText) {
    try {
      setBusyId(key);
      setMessage(null);
      await fn();
      await onChanged();
      if (successText) setMessage({ type: "success", text: successText });
    } catch (e) {
      console.error(e);
      setMessage({ type: "error", text: e.message });
    } finally {
      setBusyId(null);
    }
  }

  function subPatch(value) {
    const patch = { ...EMPTY_SUB };
    if (value.startsWith("t:")) patch.substitute_teacher_id = value.slice(2);
    if (value.startsWith("e:")) patch.substitute_external_id = value.slice(2);
    if (value.startsWith("n:")) patch.substitute_name = value.slice(2).trim() || null;
    return patch;
  }

  function subValueOf(item) {
    if (item.substitute_teacher_id) return `t:${item.substitute_teacher_id}`;
    if (item.substitute_external_id) return `e:${item.substitute_external_id}`;
    if (item.substitute_name) return `n:${item.substitute_name}`;
    return "";
  }

  // 自己填名字（例如其他分校調來的老師）
  const [customNameFor, setCustomNameFor] = useState(null);
  const [customNameText, setCustomNameText] = useState("");

  async function handleSubstituteChange(item, value) {
    const previousTeacherId = item.substitute_teacher_id;
    const patch = subPatch(value);
    let notice = "";
    await run(item.id, async () => {
      await updateLeaveItem(item.id, patch);
      if (approved) {
        const parts = [];
        if (previousTeacherId && String(previousTeacherId) !== String(patch.substitute_teacher_id || "")) {
          const removed = await notifyRemovedSubstitutes(request, [previousTeacherId], [item.id], "changed");
          if (removed) parts.push(`原代理：${describeNotifyResult(removed, "異動通知")}`);
        }
        if (patch.substitute_teacher_id) {
          const added = await notifyItemsSubstitutes(request, [item.id]);
          if (added) parts.push(`新代理：${describeNotifyResult(added, "代班通知")}`);
        }
        notice = parts.join("；");
      }
    });
    if (notice) setMessage({ type: "success", text: notice });
  }

  function handleApplyToRest(item, scope) {
    const patch = subPatch(subValueOf(item));
    const targets = workItems.filter(
      (i) => i.id !== item.id && !hasSubstitute(i) && (scope === "day" ? i.item_date === item.item_date : true)
    );
    if (!targets.length) return;
    run(
      item.id,
      async () => {
        await updateManyItems(targets.map((t) => t.id), patch);
        if (approved && patch.substitute_teacher_id) {
          await notifyItemsSubstitutes(request, targets.map((t) => t.id));
        }
      },
      `已套用到另外 ${targets.length} 格。`
    );
  }

  function toggleSplit(itemId, studentId) {
    setSplitSelection((prev) => {
      const list = prev[itemId] || [];
      return {
        ...prev,
        [itemId]: list.includes(studentId) ? list.filter((x) => x !== studentId) : [...list, studentId],
      };
    });
  }

  function handleSplit(item) {
    const ids = splitSelection[item.id] || [];
    run(
      item.id,
      async () => {
        await splitLeaveItem(item, ids);
        setSplitSelection((prev) => ({ ...prev, [item.id]: [] }));
      },
      `已把 ${ids.length} 個孩子拆成新的一格，請幫新的一格選代理人。`
    );
  }

  function handleDelete(item) {
    if (!window.confirm(`確定刪除「${timeLabel(item)}」這格？刪掉代表這段時間不需要代理。`)) return;
    run(item.id, () => deleteLeaveItem(item.id));
  }

  async function handleSubmit() {
    if (!window.confirm("確定送出給主管？主管確認前你還可以修改。")) return;
    let result;
    await run("submit", async () => {
      result = await submitLeaveRequest(request);
    });
    if (!result) return;
    setMessage({
      type: result?.failed ? "error" : "success",
      text: result?.skipped || result?.failed ? `已送出。${result.message}` : "已送出，主管會收到 LINE 通知。",
    });
  }

  /** 打字自動儲存（不跳訊息、不鎖畫面） */
  async function silentSave(itemId, patch) {
    try {
      await updateLeaveItem(itemId, patch);
      const now = new Date();
      setSavedAt((prev) => ({
        ...prev,
        [itemId]: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      }));
      await onChanged();
    } catch (e) {
      console.error(e);
      setMessage({ type: "error", text: `自動儲存失敗：${e.message}` });
    }
  }

  function toggleActivity(item, tag) {
    const tags = item.activity_tags || [];
    const next = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    silentSave(item.id, { activity_tags: next });
  }

  async function handleAllHandoverDone() {
    const pending = workItems.filter((i) => !i.handover_done);
    const ready = pending.filter(hasHandoverDraft);
    const empty = pending.length - ready.length;
    if (!ready.length) {
      setMessage({ type: "error", text: "還沒有填好內容的交接單。" });
      return;
    }
    await run(
      "all-handover",
      async () => {
        await updateManyItems(
          ready.map((i) => i.id),
          { handover_done: true, handover_by_admin: !isRequester }
        );
        setShowAllHandover(false);
      },
      empty
        ? `已完成 ${ready.length} 格交接；還有 ${empty} 格沒有填任何內容，請補填。`
        : `全部 ${ready.length} 格交接完成。`
    );
  }

  async function handleDayHandoverDone(dateItems) {
    const pending = dateItems.filter((i) => needsCoverage(i) && !i.handover_done);
    const ready = pending.filter(hasHandoverDraft);
    const empty = pending.length - ready.length;
    if (!ready.length) {
      setMessage({ type: "error", text: "這天還沒有填好內容的交接單。請先在每一格填寫並按「先存草稿」。" });
      return;
    }
    await run(
      "day-handover",
      () =>
        updateManyItems(
          ready.map((i) => i.id),
          { handover_done: true, handover_by_admin: !isRequester }
        ),
      empty
        ? `已完成 ${ready.length} 格交接；還有 ${empty} 格沒有填內容，請補填。`
        : `這天 ${ready.length} 格交接全部完成。`
    );
  }

  async function handleReturn() {
    if (!window.confirm("退回給老師修改？")) return;
    await run("return", () => returnLeaveRequest(request), "已退回，老師可以修改後再送出。");
  }

  async function handleApprove() {
    if (!window.confirm("確認這份代理安排？確認後會用 LINE 通知每位代理老師。")) return;
    let result;
    await run("approve", async () => {
      result = await approveLeaveRequest(request);
    });
    if (result) {
      setMessage({
        type: result.failed === true || result.failed?.length ? "error" : "success",
        text: `主管已確認。${describeNotifyResult(result, "代班通知")}`,
      });
    }
  }

  async function handleRenotify() {
    let result;
    await run("renotify", async () => {
      result = await renotifySubstitutes(request);
    });
    if (result) {
      setMessage({ type: result.failed ? "error" : "success", text: describeNotifyResult(result, "代班通知") });
    }
  }

  async function handleComplete() {
    if (!window.confirm("確認完成請假？完成後會寫入休假紀錄。")) return;
    await run("complete", () => completeLeaveRequest(request), "請假完成，已寫入休假紀錄。");
  }

  async function handleCancel() {
    if (
      !window.confirm(
        approved
          ? "確定取消這筆請假？會用 LINE 通知代理老師不用代班了。"
          : "確定取消這筆請假？不會寫入休假紀錄。"
      )
    )
      return;
    try {
      setBusyId("cancel");
      await cancelLeaveRequest(request.id);
      if (approved) {
        await notifyRemovedSubstitutes(
          request,
          workItems.map((i) => i.substitute_teacher_id),
          [],
          "cancelled"
        );
      }
      await onChanged();
      onBack();
    } catch (e) {
      setMessage({ type: "error", text: e.message });
      setBusyId(null);
    }
  }

  async function handlePrintSheet() {
    try {
      setBusyId("print");
      setMessage(null);
      await downloadSignSheetPdf(request);
      setMessage({ type: "success", text: "代班確認單已下載，每位代班老師一頁。" });
    } catch (e) {
      console.error(e);
      setMessage({ type: "error", text: `產生 PDF 失敗：${e.message}` });
    } finally {
      setBusyId(null);
    }
  }

  /* ---------- 連續時段、同一位代理人 → 合併成一列 ---------- */
  const SLOT_SEQ = ["s1", "s2", "s3", "s4", "s5", "s6"];

  function buildSegments(dateItems) {
    const segments = [];
    const groupable = (i) =>
      i.category === "slot" &&
      needsCoverage(i) &&
      hasSubstitute(i) &&
      !dateItems.some((o) => o.id !== i.id && o.slot_key === i.slot_key);
    dateItems.forEach((item) => {
      const last = segments[segments.length - 1];
      const prev = last?.items[last.items.length - 1];
      if (
        prev &&
        groupable(prev) &&
        groupable(item) &&
        subValueOf(prev) === subValueOf(item) &&
        SLOT_SEQ.indexOf(item.slot_key) === SLOT_SEQ.indexOf(prev.slot_key) + 1
      ) {
        last.items.push(item);
      } else {
        segments.push({ key: item.id, items: [item] });
      }
    });
    return segments;
  }

  function isSegmentOpen(seg) {
    if (openSegments[seg.key]) return true;
    return seg.items.some(
      (i) =>
        i.id === openHandoverId ||
        i.id === openStudentsId ||
        i.id === customNameFor ||
        (showAllHandover && !i.handover_done)
    );
  }

  async function handleGroupSubstituteChange(groupItems, value) {
    const patch = subPatch(value);
    const ids = groupItems.map((i) => i.id);
    const previous = [...new Set(groupItems.map((i) => i.substitute_teacher_id).filter(Boolean).map(String))].filter(
      (id) => id !== String(patch.substitute_teacher_id || "")
    );
    let notice = "";
    await run("group", async () => {
      await updateManyItems(ids, patch);
      if (approved) {
        const parts = [];
        if (previous.length) {
          const removed = await notifyRemovedSubstitutes(request, previous, ids, "changed");
          if (removed) parts.push(`原代理：${describeNotifyResult(removed, "異動通知")}`);
        }
        if (patch.substitute_teacher_id) {
          const added = await notifyItemsSubstitutes(request, ids);
          if (added) parts.push(`新代理：${describeNotifyResult(added, "代班通知")}`);
        }
        notice = parts.join("；");
      }
    });
    if (notice) setMessage({ type: "success", text: notice });
  }

  function substituteOptions(item) {
    return (
      <>
        <option value="">⚠ 尚未排代理</option>
        <optgroup label="老師">
          {teachers
            .filter((t) => String(t.id) !== String(request.teacher_id))
            .map((t) => {
              const sum = teacherSlotSummary(t.id, item);
              const clash = ownPickupClash(t, item);
              const parts = [];
              if (sum) parts.push(`自己班 ${sum.own} 人`);
              if (sum?.covering) parts.push(`已代 ${sum.covering} 人`);
              clash.forEach((d) => parts.push(`⚠${d.time} 要接送`));
              const extra = parts.length ? `（${parts.join("・")}）` : "";
              return (
                <option key={t.id} value={`t:${t.id}`}>
                  {teacherName(t)}
                  {extra}
                </option>
              );
            })}
        </optgroup>
        {(() => {
          const shownAdmins = admins.filter((a) => isAdmin || String(a.id) === String(item.substitute_teacher_id));
          if (!shownAdmins.length) return null;
          return (
            <optgroup label="主管">
              {shownAdmins.map((a) => (
                <option key={a.id} value={`t:${a.id}`}>{teacherName(a)}</option>
              ))}
            </optgroup>
          );
        })()}
        {item.substitute_name && <option value={`n:${item.substitute_name}`}>{item.substitute_name}（自填）</option>}
        {isAdmin && <option value="__custom__">＋ 自己填名字…</option>}
        {externalStaff.length > 0 && (
          <optgroup label="外部人員">
            {externalStaff.map((st) => (
              <option key={st.id} value={`e:${st.id}`}>
                {st.name}
                {st.department ? `（${st.department}）` : ""}
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  }

  function renderGroupRow(seg) {
    const groupItems = seg.items;
    const first = groupItems[0];
    const lastItem = groupItems[groupItems.length - 1];
    const counts = groupItems.map((i) => presentStudents(i).length);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const tags = [...new Set(groupItems.flatMap((i) => i.activity_tags || []))];
    const warnings = [...new Set(groupItems.flatMap((i) => getConflicts(i)))];
    const overCount = groupItems.filter((i) => (getLoad(i)?.total || 0) > MAX_KIDS_PER_TEACHER).length;
    const handed = groupItems.filter((i) => i.handover_done).length;
    const acked = groupItems.filter((i) => i.ack_at).length;
    const mine = isMineItem(first);
    const ackable = groupItems.filter((i) => i.handover_done && !i.ack_at).map((i) => i.id);
    const expand = () => setOpenSegments((prev) => ({ ...prev, [seg.key]: true }));

    return (
      <div key={`seg-${seg.key}`} className={`lwf-item lwf-item--group ${mine ? "lwf-item--mine" : ""}`}>
        <div className="lwf-item-row">
          <div className="lwf-item-time">
            <strong>
              {formatTime(first.start_time)}–{formatTime(lastItem.end_time)}
            </strong>
            <small className="lwf-group-count">{groupItems.length} 個時段</small>
          </div>

          <div className="lwf-item-what">
            <span className="lwf-count">在班 {minCount === maxCount ? minCount : `${minCount}–${maxCount}`} 人</span>
            {tags.map((tag) => (
              <span key={tag} className="lwf-tag lwf-tag--on lwf-tag--static">{tag}</span>
            ))}
            <button type="button" className="lwf-link-button" onClick={expand}>
              ▾ 展開
            </button>
          </div>

          <div className="lwf-item-sub">
            {canArrange ? (
              <select
                value={subValueOf(first)}
                disabled={!!busyId}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    expand();
                    return;
                  }
                  handleGroupSubstituteChange(groupItems, e.target.value);
                }}
              >
                {substituteOptions(first)}
              </select>
            ) : (
              <span>{substituteName(first) || "—"}</span>
            )}
            {warnings.map((w) => (
              <small key={w} className="lwf-conflict">⚠ {w}</small>
            ))}
            {overCount > 0 && (
              <small className="lwf-conflict">
                ⚠ 有 {overCount} 個時段超過 {MAX_KIDS_PER_TEACHER} 人，展開看
              </small>
            )}
          </div>

          <div className="lwf-item-status">
            {handed === groupItems.length ? (
              <span className="lwf-done-mark">✓ 交接</span>
            ) : (
              <button type="button" className="lwf-chip lwf-chip--todo" onClick={expand}>
                交接 {handed}/{groupItems.length}
              </button>
            )}
            {approved &&
              (acked === groupItems.length ? (
                <span className="lwf-done-mark">✓ 已確認</span>
              ) : mine && canAck && ackable.length ? (
                <button
                  type="button"
                  className="lwf-chip lwf-chip--primary"
                  disabled={!!busyId}
                  onClick={() => run("group-ack", () => ackItems(ackable, false))}
                >
                  我已了解
                </button>
              ) : isAdmin && canAck && ackable.length ? (
                <button
                  type="button"
                  className="lwf-chip lwf-chip--todo"
                  disabled={!!busyId}
                  onClick={() => run("group-ack", () => ackItems(ackable, true))}
                >
                  主管代確認
                </button>
              ) : (
                <span className="lwf-wait-mark">待確認</span>
              ))}
          </div>
        </div>
      </div>
    );
  }

  function renderItemRow(item, dateItems) {
              const needed = needsCoverage(item);
              const conflicts = getConflicts(item);
              const isMine = isMineItem(item);
              const busy = busyId === item.id;
              const siblings = dateItems.filter((i) => i.id !== item.id && item.slot_key && i.slot_key === item.slot_key);
              const selected = splitSelection[item.id] || [];
              const studentsOpen = openStudentsId === item.id;
              const dayHasEmpty = dateItems.some((i) => i.id !== item.id && needsCoverage(i) && !hasSubstitute(i));
              const anyEmpty = workItems.some((i) => i.id !== item.id && !hasSubstitute(i));

              return (
                <div
                  key={item.id}
                  className={`lwf-item ${needed && !hasSubstitute(item) ? "lwf-item--uncovered" : ""} ${
                    isMine ? "lwf-item--mine" : ""
                  } ${!needed ? "lwf-item--idle" : ""}`}
                >
                  <div className="lwf-item-row">
                    <div className="lwf-item-time">
                      <strong>{timeLabel(item)}</strong>
                      {siblings.length > 0 && <small>這個時段拆成 {siblings.length + 1} 組</small>}
                    </div>

                    <div className="lwf-item-what">
                      {item.category !== "slot" && (
                        <span className={`lwf-cat lwf-cat--${item.category}`}>{CATEGORY_LABELS[item.category]}</span>
                      )}
                      {item.category !== "slot" && <strong>{item.title}</strong>}
                      {item.category === "slot" ? (
                        <button type="button" className="lwf-link-button" onClick={() => setOpenStudentsId(studentsOpen ? null : item.id)}>
                          <CountChips item={item} /> {studentsOpen ? "▴ 收起" : "▾ 看孩子"}
                        </button>
                      ) : (
                        <CountChips item={item} />
                      )}
                      {item.category === "slot" && (item.activity_tags || []).length > 0 && (
                        <span className="lwf-activity">
                          {(item.activity_tags || []).map((tag) => (
                            <span key={tag} className="lwf-tag lwf-tag--on lwf-tag--static">{tag}</span>
                          ))}
                        </span>
                      )}
                    </div>

                    {needed ? (
                      <>
                        <div className="lwf-item-sub">
                          {canArrange ? (
                            <select
                              value={subValueOf(item)}
                              disabled={busy}
                              onChange={(e) => {
                                if (e.target.value === "__custom__") {
                                  setCustomNameFor(item.id);
                                  setCustomNameText(item.substitute_name || "");
                                  return;
                                }
                                setCustomNameFor(null);
                                handleSubstituteChange(item, e.target.value);
                              }}
                            >
                              {substituteOptions(item)}
                            </select>
                          ) : (
                            <span>{substituteName(item) || "—"}</span>
                          )}

                          {customNameFor === item.id && (
                            <span className="lwf-custom-name">
                              <input
                                autoFocus
                                value={customNameText}
                                placeholder="例：王小美（中正分校）"
                                onChange={(e) => setCustomNameText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && customNameText.trim()) {
                                    setCustomNameFor(null);
                                    handleSubstituteChange(item, `n:${customNameText.trim()}`);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="leave-secondary-button"
                                disabled={!customNameText.trim()}
                                onClick={() => {
                                  setCustomNameFor(null);
                                  handleSubstituteChange(item, `n:${customNameText.trim()}`);
                                }}
                              >
                                確定
                              </button>
                              <button type="button" className="lwf-link-button" onClick={() => setCustomNameFor(null)}>
                                取消
                              </button>
                            </span>
                          )}

                          {item.substitute_name && !item.substitute_teacher_id && (
                            <small className="lwf-load">沒有系統帳號，不會收到 LINE，請自行通知；確認由主管代按。</small>
                          )}

                          {conflicts.map((c) => (
                            <small key={c} className="lwf-conflict">⚠ {c}</small>
                          ))}

                          {(() => {
                            const load = getLoad(item);
                            if (!load) return null;
                            const over = load.total > MAX_KIDS_PER_TEACHER;
                            if (!over) return null;
                            return (
                              <small className={over ? "lwf-conflict" : "lwf-load"}>
                                {over ? "⚠ " : ""}這時段共顧 {load.total} 人
                                {load.own ? `（自己班 ${load.own}＋代班 ${load.covering}）` : ""}
                                {over ? `，超過 ${MAX_KIDS_PER_TEACHER} 人` : ""}
                              </small>
                            );
                          })()}

                          {canArrange && hasSubstitute(item) && anyEmpty && (
                            <span className="lwf-apply">
                              把空格也給他：
                              {dayHasEmpty && (
                                <button type="button" className="lwf-link-button" onClick={() => handleApplyToRest(item, "day")}>
                                  這天
                                </button>
                              )}
                              <button type="button" className="lwf-link-button" onClick={() => handleApplyToRest(item, "all")}>
                                全部
                              </button>
                            </span>
                          )}
                        </div>

                        <div className="lwf-item-status">
                          {item.handover_done ? (
                            <button
                              type="button"
                              className="lwf-done-mark"
                              title={item.handover_by_admin ? "主任代填，點開查看" : "點開查看交接單"}
                              onClick={() => setOpenHandoverId(openHandoverId === item.id ? null : item.id)}
                            >
                              ✓ 交接{item.handover_by_admin ? "（代填）" : ""}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="lwf-chip lwf-chip--todo"
                              onClick={() => setOpenHandoverId(openHandoverId === item.id ? null : item.id)}
                            >
                              {hasHandoverDraft(item) ? "交接草稿" : "填交接單"}
                            </button>
                          )}

                          {approved &&
                            (item.ack_at ? (
                              <button
                                type="button"
                                className="lwf-done-mark"
                                disabled={!editable || busy || !(isMine || isAdmin)}
                                title={editable && (isMine || isAdmin) ? "點一下取消確認" : ""}
                                onClick={() =>
                                  run(item.id, () => updateLeaveItem(item.id, { ack_at: null, ack_by: null, ack_by_admin: false }))
                                }
                              >
                                ✓ {item.ack_by_admin ? "主管代確認" : "已確認"}
                              </button>
                            ) : isMine ? (
                              <button
                                type="button"
                                className="lwf-chip lwf-chip--primary"
                                disabled={!canAck || busy || !item.handover_done}
                                title={!item.handover_done ? "等交接完才能確認" : ""}
                                onClick={() => run(item.id, () => ackItems([item.id], false))}
                              >
                                我已了解
                              </button>
                            ) : isAdmin && canAck && hasSubstitute(item) && item.handover_done ? (
                              <button
                                type="button"
                                className="lwf-chip lwf-chip--todo"
                                disabled={busy}
                                title="代理人口頭確認過，由主管代按"
                                onClick={() => run(item.id, () => ackItems([item.id], true))}
                              >
                                主管代確認
                              </button>
                            ) : (
                              <span className="lwf-wait-mark">待確認</span>
                            ))}

                          {canArrange && (
                            <span className="lwf-tools">
                              <button
                                type="button"
                                className="lwf-icon-button"
                                title="更多"
                                onClick={() => setToolsOpenId(toolsOpenId === item.id ? null : item.id)}
                              >
                                ⋯
                              </button>
                              {toolsOpenId === item.id && (
                                <span className="lwf-tools-menu">
                                  <button
                                    type="button"
                                    className="lwf-link-button lwf-danger-link"
                                    onClick={() => {
                                      setToolsOpenId(null);
                                      handleDelete(item);
                                    }}
                                  >
                                    刪除這格
                                  </button>
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="lwf-idle-text">這段沒有需要顧的孩子，不用排代理</div>
                    )}
                  </div>

                  {studentsOpen && (
                    <div className="lwf-students-wrap">
                      <StudentList
                        students={item.students || []}
                        selectable={canArrange && presentStudents(item).length > 1}
                        selected={selected}
                        onToggle={(id) => toggleSplit(item.id, id)}
                        onLeave={
                          canArrange
                            ? (student) =>
                                run(
                                  item.id,
                                  () => markStudentLeft(request, item, student.id),
                                  `${student.name} 從這個時段起標為已離班。`
                                )
                            : null
                        }
                        onUndoLeave={
                          canArrange
                            ? (student) =>
                                run(
                                  item.id,
                                  () => markStudentLeft(request, item, student.id, true),
                                  `已取消 ${student.name} 的離班。`
                                )
                            : null
                        }
                        onDayOff={
                          canArrange
                            ? (student) =>
                                run(
                                  item.id,
                                  () => markStudentDayOff(request, item.item_date, student.id),
                                  `${student.name} 這天所有時段已標為當日請假。`
                                )
                            : null
                        }
                        onUndoDayOff={
                          canArrange
                            ? (student) =>
                                run(
                                  item.id,
                                  () => markStudentDayOff(request, item.item_date, student.id, true),
                                  `已取消 ${student.name} 的當日請假。`
                                )
                            : null
                        }
                      />
                      {canArrange && (presentStudents(item).length > 1 || siblings.length > 0) && (
                        <div className="lwf-split-actions">
                          {presentStudents(item).length > 1 && (
                            <>
                              <small>勾選要交給另一位老師（另一間教室）的孩子：</small>
                              <button
                                type="button"
                                className="leave-secondary-button"
                                disabled={!selected.length || busy}
                                onClick={() => handleSplit(item)}
                              >
                                拆出 {selected.length || ""} 人成新的一格
                              </button>
                            </>
                          )}
                          {siblings.length > 0 && (
                            <button
                              type="button"
                              className="lwf-link-button"
                              disabled={busy}
                              onClick={() => run(item.id, () => mergeLeaveItem(item, siblings[0]), "已併回同一格。")}
                            >
                              這組併回同時段的另一格
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(openHandoverId === item.id || (showAllHandover && !item.handover_done)) && needed && (
                    <HandoverForm
                      key={`handover-${item.id}`}
                      item={item}
                      editable={canArrange}
                      byAdmin={!isRequester}
                      savedAt={savedAt[item.id]}
                      sameDayIds={dateItems.filter((i) => i.id !== item.id && needsCoverage(i) && !i.handover_done).map((i) => i.id)}
                      onAutoSave={(patch) => silentSave(item.id, patch)}
                      onToggleTag={(tag) => toggleActivity(item, tag)}
                      onAction={(patch, applyIds, text) =>
                        run(
                          item.id,
                          async () => {
                            await updateManyItems([item.id, ...applyIds], patch);
                            if (patch.handover_done) setOpenHandoverId(null);
                          },
                          text
                        )
                      }
                    />
                  )}
                </div>
              );
  }

  const missing = [];
  if (progress.covered < progress.total) missing.push(`${progress.total - progress.covered} 格還沒排代理`);
  if (progress.handed < progress.total) missing.push(`${progress.total - progress.handed} 格還沒交接`);
  if (progress.acked < progress.total) missing.push(`${progress.total - progress.acked} 格代理人還沒確認`);

  return (
    <section className="leave-section">
      <button type="button" className="lwf-link-button lwf-back" onClick={onBack}>← 回請假列表</button>

      <div className="lwf-detail-head">
        <div>
          <div className="lwf-card-title">
            <h2>{teacherName(request.teachers)} 請假</h2>
            <span className="lwf-badge">{request.leave_types?.name}</span>
            {request.is_last_minute && <span className="lwf-badge lwf-badge--danger">臨時假</span>}
          </div>
          <p>
            {dateRangeText(request)}・{request.input_value}
            {request.input_unit === "DAY" ? " 天" : " 小時"}
            {request.reason ? `・${request.reason}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="leave-secondary-button"
          disabled={busyId === "print" || workItems.length === 0}
          onClick={handlePrintSheet}
        >
          {busyId === "print" ? "產生 PDF 中…" : "列印代班確認單（PDF）"}
        </button>
      </div>

      <StepBar progress={progress} />

      {canAck && myPendingIds.length > 0 && (
        <div className="lwf-my-ack">
          <span>
            你是這筆請假的代理人，有 <strong>{myPendingIds.length}</strong> 格已交接、等你確認。
            {myWaitingHandover > 0 && `（另外 ${myWaitingHandover} 格還在等交接）`}
          </span>
          <button
            type="button"
            className="leave-primary-button"
            disabled={!!busyId}
            onClick={() => run("my-ack", () => ackItems(myPendingIds, false), "已確認，謝謝！")}
          >
            我已了解（{myPendingIds.length} 格）
          </button>
        </div>
      )}

      {message && <div className={`leave-message leave-message--${message.type}`}>{message.text}</div>}

      {canArrange && workItems.some((i) => !i.handover_done) && (
        <div className="lwf-toolbar">
          <button type="button" className="leave-secondary-button" onClick={() => setShowAllHandover((v) => !v)}>
            {showAllHandover ? "收起全部交接單" : "展開全部交接單"}
          </button>
          <span className="lwf-toolbar-hint">打字會自動儲存，全部填好再按右邊一次完成。</span>
          <button
            type="button"
            className="leave-primary-button"
            disabled={!!busyId || !workItems.some((i) => !i.handover_done && hasHandoverDraft(i))}
            onClick={handleAllHandoverDone}
          >
            全部交接完成（已填 {workItems.filter((i) => !i.handover_done && hasHandoverDraft(i)).length}／
            {workItems.filter((i) => !i.handover_done).length}）
          </button>
        </div>
      )}

      {groupByDate(items).map(([date, dateItems]) => (
        <div key={date} className="lwf-day">
          <div className="lwf-day-head">
            <h3>{formatDateLabel(date)}</h3>
            {canArrange &&
              dateItems.some((i) => needsCoverage(i) && !i.handover_done) && (
                <button
                  type="button"
                  className="leave-secondary-button"
                  disabled={!!busyId}
                  onClick={() => handleDayHandoverDone(dateItems)}
                >
                  這天全部交接完成
                </button>
              )}
          </div>
          {(dayNotes[date] || []).map((note) => (
            <div key={note} className="lwf-day-note">📅 {note}</div>
          ))}

          <div className="lwf-item-list">
            {buildSegments(dateItems).map((seg) => {
              if (seg.items.length > 1 && !isSegmentOpen(seg)) return renderGroupRow(seg);
              return (
                <div key={`segwrap-${seg.key}`} className={seg.items.length > 1 ? "lwf-seg-open" : "lwf-seg-single"}>
                  {seg.items.length > 1 && openSegments[seg.key] && (
                    <button
                      type="button"
                      className="lwf-link-button lwf-seg-collapse"
                      onClick={() => setOpenSegments((prev) => ({ ...prev, [seg.key]: false }))}
                    >
                      ▴ 合併這 {seg.items.length} 個時段
                    </button>
                  )}
                  {seg.items.map((item) => renderItemRow(item, dateItems))}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {canArrange && (
        <button
          type="button"
          className="lwf-link-button"
          onClick={() =>
            run(
              "add",
              () => addLeaveItem(request.id, { item_date: request.start_date, category: "other", title: "其他職責" }),
              "已新增一格。"
            )
          }
        >
          ＋ 手動新增一格
        </button>
      )}

      <div className="lwf-footer">
        {request.status === "in_progress" && (
          <>
            <div className="lwf-footer-text">
              {progress.ready ? (
                <strong className="lwf-ok">每個孩子、每個時段都有人負責，主管與代理人都確認了。</strong>
              ) : !progress.canSubmit ? (
                <span>還不能送出：{missing.filter((m) => !m.includes("確認")).join("、")}</span>
              ) : !submitted ? (
                <span>代理和交接都填好了，可以送出給主管。</span>
              ) : !approved ? (
                <span>已送出，等主管確認。</span>
              ) : (
                <span>
                  主管已確認。
                  {missing.length ? `等代理人確認：${missing.join("、")}` : ""}
                  {!progress.paperReturned ? "　簽名單收回後請勾「紙本已收回」。" : ""}
                </span>
              )}
            </div>
            <div className="lwf-footer-actions">
              {(isAdmin || (isRequester && !approved)) && (
                <button type="button" className="leave-delete-button" onClick={handleCancel} disabled={!!busyId}>
                  取消請假
                </button>
              )}

              {isRequester && !isAdmin && !submitted && (
                <>
                  <label className="lwf-paper-check">
                    <input
                      type="checkbox"
                      checked={confirmAsked}
                      onChange={(e) => setConfirmAsked(e.target.checked)}
                    />
                    我已親自告知並取得代理老師同意
                  </label>
                  <button
                    type="button"
                    className="leave-primary-button"
                    disabled={!progress.canSubmit || !confirmAsked || !!busyId}
                    title={!confirmAsked ? "請先勾選：已親自告知並取得代理老師同意" : ""}
                    onClick={handleSubmit}
                  >
                    送出給主管
                  </button>
                </>
              )}

              {isAdmin && !approved && submitted && (
                <button type="button" className="leave-secondary-button" disabled={!!busyId} onClick={handleReturn}>
                  退回修改
                </button>
              )}

              {isAdmin && !approved && (
                <button
                  type="button"
                  className="leave-primary-button"
                  disabled={!progress.canSubmit || !!busyId}
                  title={!progress.canSubmit ? "每一格都要排好代理、填好交接單" : ""}
                  onClick={handleApprove}
                >
                  主管確認並通知代理
                </button>
              )}

              {isAdmin && approved && progress.acked < progress.total && (
                <button type="button" className="leave-secondary-button" disabled={!!busyId} onClick={handleRenotify}>
                  再通知未確認的代理
                </button>
              )}

              {isAdmin && approved && adminAckIds.length > 0 && (
                <button
                  type="button"
                  className="leave-secondary-button"
                  disabled={!!busyId}
                  onClick={() => {
                    if (window.confirm(`代理人都已口頭確認過？將代為確認 ${adminAckIds.length} 格。`)) {
                      run("admin-ack", () => ackItems(adminAckIds, true), "已代為確認。");
                    }
                  }}
                >
                  主管代確認全部（{adminAckIds.length}）
                </button>
              )}

              {isAdmin && approved && (
                <label className="lwf-paper-check">
                  <input
                    type="checkbox"
                    checked={progress.paperReturned}
                    disabled={!!busyId}
                    onChange={(e) =>
                      run("paper", () => setPaperReturned(request, e.target.checked))
                    }
                  />
                  紙本簽名單已收回
                </label>
              )}

              {isAdmin && approved && (
                <button type="button" className="leave-primary-button" disabled={!progress.ready || !!busyId} onClick={handleComplete}>
                  {busyId === "complete" ? "寫入中…" : "完成請假"}
                </button>
              )}
            </div>
          </>
        )}

        {request.status === "completed" && (
          <div className="lwf-footer-text">
            <strong className="lwf-ok">✓ 已完成，已寫入休假紀錄。</strong>
          </div>
        )}

        {request.status === "cancelled" && (
          <div className="lwf-footer-actions">
            <span className="lwf-footer-text">這筆請假已取消。</span>
            {(isAdmin || isRequester) && (
              <button
                type="button"
                className="leave-secondary-button"
                disabled={!!busyId}
                onClick={() => run("reopen", () => reopenLeaveRequest(request.id))}
              >
                恢復這筆請假
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}


/* =========================
   交接單
========================= */

function HandoverForm({ item, editable, byAdmin, savedAt, sameDayIds, onAutoSave, onToggleTag, onAction }) {
  const [form, setForm] = useState({
    handover_progress: item.handover_progress || "",
    handover_students: item.handover_students || "",
    handover_parents: item.handover_parents || "",
    handover_materials: item.handover_materials || "",
  });

  // 打字停下 0.8 秒自動儲存；關掉表單時若還有沒存的內容也會存
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const saveRef = useRef(onAutoSave);
  saveRef.current = onAutoSave;

  function flush() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (pendingRef.current) {
      const patch = pendingRef.current;
      pendingRef.current = null;
      saveRef.current(patch);
    }
  }

  useEffect(() => () => flush(), []);

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 800);
      return next;
    });
  }

  const fields = [
    { key: "handover_progress", label: "今天進度／作業內容", placeholder: "例：數學習作 P.32–33、國語圈詞" },
    { key: "handover_students", label: "要特別注意的孩子", placeholder: "例：小明要吃藥（書包前袋）、小華不能跟小強坐" },
    { key: "handover_parents", label: "家長交代的事", placeholder: "例：小美 17:30 爸爸提早接、小安聯絡簿要請家長簽" },
    { key: "handover_materials", label: "教材放哪裡／其他", placeholder: "例：考卷在講桌第二個抽屜" },
  ];

  const filled = Object.values(form).some((v) => v.trim()) || (item.activity_tags || []).length > 0;

  return (
    <div className="lwf-handover">
      {item.category === "slot" && (
        <div className="lwf-handover-tags">
          <span>這段時間在做：</span>
          {ACTIVITY_OPTIONS.map((tag) => {
            const on = (item.activity_tags || []).includes(tag);
            return (
              <label key={tag} className={on ? "lwf-check lwf-check--on" : "lwf-check"}>
                <input type="checkbox" checked={on} disabled={!editable} onChange={() => onToggleTag(tag)} />
                {tag}
              </label>
            );
          })}
          <small>沒有特別要交代的，勾這裡就好，下面可以不填。</small>
        </div>
      )}
      <div className="lwf-handover-grid">
        {fields.map((f) => (
          <label key={f.key} className="leave-field">
            <span>{f.label}</span>
            <textarea
              rows={2}
              value={form[f.key]}
              placeholder={f.placeholder}
              disabled={!editable}
              onChange={(e) => updateField(f.key, e.target.value)}
              onBlur={flush}
            />
          </label>
        ))}
      </div>

      {editable && (
        <div className="lwf-handover-actions">
          <div className="lwf-handover-options">
            <small>{savedAt ? `✓ 已自動儲存 ${savedAt}` : "打字會自動儲存"}</small>
            {byAdmin && <small>你不是請假老師，完成時會標記為「主任代填」。</small>}
          </div>
          {sameDayIds.length > 0 && (
            <button
              type="button"
              className="lwf-link-button"
              onClick={() => {
                flush();
                if (window.confirm(`把這格的內容複製到這天其他還沒交接的 ${sameDayIds.length} 格？（會覆蓋那些格子已經打的內容）`)) {
                  onAction(
                    { ...form, activity_tags: item.activity_tags || [] },
                    sameDayIds,
                    `已複製到這天另外 ${sameDayIds.length} 格。`
                  );
                }
              }}
            >
              複製到這天其他 {sameDayIds.length} 格
            </button>
          )}
          {!item.handover_done && (
            <button
              type="button"
              className="leave-secondary-button"
              disabled={!filled}
              title={!filled ? "至少填一欄或勾一個活動" : ""}
              onClick={() => {
                flush();
                onAction({ ...form, handover_done: true, handover_by_admin: byAdmin }, [], "這格交接完成。");
              }}
            >
              只完成這格
            </button>
          )}
          {item.handover_done && (
            <button
              type="button"
              className="lwf-link-button"
              onClick={() => onAction({ handover_done: false, handover_by_admin: false }, [], "已改回未完成。")}
            >
              改回未完成
            </button>
          )}
        </div>
      )}
    </div>
  );
}


export default LeaveWorkflowPanel;
