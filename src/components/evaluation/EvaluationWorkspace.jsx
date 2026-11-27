import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import { getActiveTeachers } from "../../services/teacherService";
import { getTeacherAssignments } from "../../services/teacherAssignmentService";
import {
  STATUS_LABELS,
  createEvent,
  getAdminExclusions,
  getEventTypes,
  getEvents,
  resendNotify,
  resolveDispute,
  saveEventType,
  setAdminExclusion,
  syncEvaluation,
  voidEvent,
} from "../../services/evaluationService";
import {
  availableEvaluationYears,
  computeManualSemester,
  computeSystemSemester,
  computeTeacherYear,
  evaluationYearInfo,
  campExcluded,
  semEntry,
  courseEnrolled,
  semesterBasics,
  singleDayBlock,
  INSPECTION_TYPES,
  inspectionScore,
  LEAVE_TYPES,
  PROTECTED_LEAVE_TYPES,
  leaveWeight,
  lateList,
  firstPunch,
  DEFAULT_LATE_TIERS,
  noLateRanges,
  SUBJECTS,
  getYearSettings,
  loadEvaluationSources,
  saveWithdrawal,
  saveYearSettings,
  TOGGLEABLE_INDICATORS,
} from "../../services/evaluationDataService";

// =========================================================
// 教師考核 Phase 2｜總覽、個別教師、正式考核
// =========================================================

function todayText() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

function teacherName(teacher) {
  return teacher?.chinese_name || teacher?.english_name || "老師";
}

function pointsText(points) {
  const value = Number(points) || 0;
  const abs = Math.abs(value);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return "0";
}

function money(value) {
  return Math.round(Number(value) || 0).toLocaleString("zh-TW");
}

function notifyMessage(result) {
  if (!result) return "";
  if (result.success) return "已用 LINE 通知老師。";
  if (result.skipped) return result.message;
  return result.message || "LINE 通知沒有送出。";
}

function StatusChip({ status }) {
  const tone = {
    pending: S.chipWarn,
    confirmed: S.chipOk,
    disputing: S.chipAlert,
    disputed: S.chipAlert,
    void: S.chipMuted,
  }[status] || S.chipMuted;
  return <span style={{ ...S.chip, ...tone }}>{STATUS_LABELS[status] || status}</span>;
}

// ---------------------------------------------------------
// 登記事件
// ---------------------------------------------------------

function EventFormModal({ teachers, types, onClose, onSaved }) {
  const activeTypes = types.filter((t) => t.is_active && !t.per_day);
  const [teacherId, setTeacherId] = useState("");
  const [eventDate, setEventDate] = useState(todayText());
  const [typeId, setTypeId] = useState("");
  const [custom, setCustom] = useState({ name: "", direction: "minus", points: 3 });
  const [overdueDays, setOverdueDays] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const type =
    typeId === "__custom"
      ? { id: null, name: custom.name.trim(), direction: custom.direction, points: Math.abs(Number(custom.points) || 0), per_day: false }
      : activeTypes.find((t) => t.id === typeId);
  const preview = type
    ? (type.direction === "plus" ? 1 : -1) *
      Number(type.points || 0) *
      (type.per_day ? Math.max(1, Number(overdueDays) || 1) : 1)
    : 0;

  async function submit(event) {
    event.preventDefault();
    if (!teacherId || !type || !eventDate) {
      setError("請選老師、日期和項目。");
      return;
    }
    if (typeId === "__custom" && (!type.name || !type.points)) {
      setError("自訂事件請填名稱和分數。");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const result = await createEvent({ teacherId, eventDate, type, note, overdueDays });
      onSaved(`已登記：${teacherName(teachers.find((t) => t.id === teacherId))} ${type.name} ${pointsText(preview)}。${notifyMessage(result.notify)}`);
    } catch (saveError) {
      console.error("登記考核事件失敗：", saveError);
      setError("登記失敗，請稍後再試。");
      setSaving(false);
    }
  }

  return (
    <div style={S.overlay}>
      <button type="button" aria-label="關閉" style={S.backdrop} onClick={onClose} />
      <form style={S.modal} onSubmit={submit}>
        <h3 style={S.modalTitle}>登記事件</h3>

        <label style={S.label}>老師</label>
        <select style={S.input} value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">請選擇</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{teacherName(t)}</option>
          ))}
        </select>

        <label style={S.label}>日期</label>
        <input style={S.input} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />

        <label style={S.label}>項目</label>
        <div style={S.typeGrid}>
          {activeTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeId(t.id)}
              style={{
                ...S.typeButton,
                ...(t.direction === "plus" ? S.typePlus : S.typeMinus),
                ...(typeId === t.id ? S.typeSelected : {}),
              }}
            >
              {t.name}
              <span style={S.typePoints}>
                {t.direction === "plus" ? "+" : "−"}{Number(t.points)}{t.per_day ? "/天" : ""}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTypeId("__custom")}
            style={{ ...S.typeButton, ...(typeId === "__custom" ? S.typeSelected : {}), background: "#f3efe9", color: "#5a4d42" }}
          >
            ＋ 自訂
          </button>
        </div>

        {typeId === "__custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...S.input, flex: "1 1 180px" }} placeholder="事件名稱（例如：私下收家長禮物）" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            <select style={{ ...S.input, width: 90 }} value={custom.direction} onChange={(e) => setCustom({ ...custom, direction: e.target.value })}>
              <option value="minus">扣分</option>
              <option value="plus">加分</option>
            </select>
            <input style={{ ...S.input, width: 80 }} type="number" min="0" step="0.5" value={custom.points} onChange={(e) => setCustom({ ...custom, points: e.target.value })} />
            <span style={S.muted}>分</span>
          </div>
        )}

        {type?.per_day && (
          <>
            <label style={S.label}>逾期天數</label>
            <input style={S.input} type="number" min="1" value={overdueDays} onChange={(e) => setOverdueDays(e.target.value)} />
          </>
        )}

        <label style={S.label}>備註（可留白）</label>
        <textarea style={{ ...S.input, minHeight: "70px" }} value={note} onChange={(e) => setNote(e.target.value)} />

        {type && (
          <div style={S.previewLine}>
            分數 <strong style={preview >= 0 ? S.plusText : S.minusText}>{pointsText(preview)}</strong>
            {type.direction === "plus"
              ? "・加進年度總分（上限另計），只通知老師"
              : type.per_day
                ? "・直接記分，不通知老師"
                : (type.name === "安全問題" || !type.id)
                  ? "・直接從年度總分扣，老師要在 LINE 確認"
                  : "・計入該項指標次數，老師要在 LINE 確認"}
          </div>
        )}

        {error && <div style={S.errorText}>{error}</div>}

        <div style={S.modalActions}>
          <button type="button" style={S.ghostButton} onClick={onClose}>取消</button>
          <button type="submit" style={S.primaryButton} disabled={saving}>
            {saving ? "儲存中…" : "登記並通知"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------
// 異議處理
// ---------------------------------------------------------

function DisputeCard({ event, teacher, onDone }) {
  const [points, setPoints] = useState(Math.abs(Number(event.points) || 0));
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision) {
    try {
      setBusy(true);
      const result = await resolveDispute(event, { decision, points, adminNote });
      onDone(`已處理 ${teacherName(teacher)} 的異議。${result?.success ? "已通知老師結果。" : (result?.message || "")}`);
    } catch (error) {
      console.error("處理異議失敗：", error);
      onDone("處理失敗，請稍後再試。", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article style={S.disputeCard}>
      <div style={S.rowBetween}>
        <strong>{teacherName(teacher)}・{event.type_name} {pointsText(event.points)}</strong>
        <span style={S.muted}>{event.event_date}</span>
      </div>
      {event.note && <div style={S.muted}>說明：{event.note}</div>}
      <div style={S.reasonBox}>老師原因：{event.dispute_reason || "（尚未填寫）"}</div>
      <input style={S.input} placeholder="主管說明（會一起通知老師，可留白）" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
      <div style={S.actionRow}>
        <button type="button" style={S.primaryButton} disabled={busy} onClick={() => decide("keep")}>維持</button>
        <span style={S.inlineGroup}>
          改成
          <input style={S.smallInput} type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} />
          分
          <button type="button" style={S.ghostButton} disabled={busy} onClick={() => decide("adjust")}>修改</button>
        </span>
        <button type="button" style={S.dangerButton} disabled={busy} onClick={() => decide("void")}>撤銷</button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------
// 行政配合明細（可設定不列入計算）
// ---------------------------------------------------------

function AdminItemList({ items, perDay, onToggle, onlyProblems = false }) {
  const [busyId, setBusyId] = useState("");
  const list = onlyProblems
    ? items.filter((i) => i.status === "late" || i.status === "open" || i.excluded)
    : items;

  async function toggle(item) {
    let note = "";
    if (!item.excluded) {
      note = window.prompt(`「${item.title}」不列入計算的原因（可留白）`, "") ?? null;
      if (note === null) return;
    }
    try {
      setBusyId(item.id);
      await onToggle(item, !item.excluded, note);
    } finally {
      setBusyId("");
    }
  }

  if (!list.length) {
    return <div style={S.empty}>{onlyProblems ? "沒有逾期的任務。" : "這段期間沒有任務。"}</div>;
  }

  return (
    <div style={S.list}>
      {list.map((item) => (
        <div key={item.id} style={{ ...S.listRow, ...(item.excluded ? S.voidRow : {}) }}>
          <div style={S.listDate}>{item.deadline.slice(5).replace("-", "/")}</div>
          <div style={S.listMain}>
            <div>{item.title}</div>
            <div style={S.muted}>
              截止 {item.deadline.replace(/-/g, "/")}
              {item.completedDay && `・回報 ${item.completedDay.replace(/-/g, "/")}`}
            </div>
            {item.excluded && (
              <div style={S.muted}>不列入計算{item.excludeNote ? `：${item.excludeNote}` : ""}</div>
            )}
          </div>
          <div style={S.listSide}>
            {item.status === "ontime" && <span style={{ ...S.chip, ...S.chipOk }}>準時完成</span>}
            {item.status === "late" && <span style={{ ...S.chip, ...S.chipAlert }}>逾期 {item.days} 天完成</span>}
            {item.status === "open" && <span style={{ ...S.chip, ...S.chipAlert }}>已逾期 {item.days} 天・未回報</span>}
            {item.status === "upcoming" && <span style={{ ...S.chip, ...S.chipMuted }}>未到期</span>}
            {item.days > 0 && !item.excluded && <strong style={S.minusText}>{pointsText(-item.days * perDay)}</strong>}
            {(item.days > 0 || item.excluded) && (
              <button type="button" style={S.linkButton} disabled={busyId === item.id} onClick={() => toggle(item)}>
                {item.excluded ? "恢復計算" : "不列入計算"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminDetailModal({ row, perDay, onToggle, onClose }) {
  return (
    <div style={S.overlay}>
      <button type="button" aria-label="關閉" style={S.backdrop} onClick={onClose} />
      <div style={{ ...S.modal, width: "min(620px, 100%)" }}>
        <div style={S.rowBetween}>
          <h3 style={S.modalTitle}>{teacherName(row.teacher)}・行政配合</h3>
          <button type="button" style={S.ghostButton} onClick={onClose}>關閉</button>
        </div>
        <p style={S.hint}>
          準時 {row.admin.onTime}/{row.admin.total}・累計逾期 {row.admin.overdueDays} 天・{pointsText(row.admin.score)} 分
          {row.admin.excludedCount > 0 && `・${row.admin.excludedCount} 件不列入計算`}
        </p>
        <AdminItemList items={row.admin.items} perDay={perDay} onToggle={onToggle} onlyProblems />
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// 事件列表（時間軸）
// ---------------------------------------------------------

function EventList({ events, teacherMap, showTeacher, onChanged }) {
  async function handleVoid(event) {
    if (!window.confirm(`確定撤銷這筆「${event.type_name}」？撤銷後不列入計分，也不會通知老師。`)) return;
    try {
      await voidEvent(event.id);
      onChanged("已撤銷。");
    } catch (error) {
      console.error(error);
      onChanged("撤銷失敗。", true);
    }
  }

  async function handleResend(event) {
    const result = await resendNotify(event.id);
    onChanged(notifyMessage(result), !result?.success);
  }

  if (!events.length) {
    return <div style={S.empty}>這段期間沒有紀錄。</div>;
  }

  return (
    <div style={S.list}>
      {events.map((event) => (
        <div key={event.id} style={{ ...S.listRow, ...(event.status === "void" ? S.voidRow : {}) }}>
          <div style={S.listDate}>{event.event_date?.slice(5).replace("-", "/")}</div>
          <div style={S.listMain}>
            <div>
              {showTeacher && <strong>{teacherName(teacherMap[event.teacher_id])}・</strong>}
              {event.type_name}
              {event.overdue_days ? `（${event.overdue_days} 天）` : ""}
              {event.source === "overdue" && <span style={S.sourceTag}>自動</span>}
            </div>
            {event.note && <div style={S.muted}>{event.note}</div>}
            {event.dispute_reason && <div style={S.muted}>異議：{event.dispute_reason}</div>}
            {event.admin_note && <div style={S.muted}>主管：{event.admin_note}</div>}
            {event.notify_error && <div style={S.errorText}>通知失敗：{event.notify_error}</div>}
          </div>
          <div style={S.listSide}>
            <strong style={Number(event.points) >= 0 ? S.plusText : S.minusText}>{pointsText(event.points)}</strong>
            <StatusChip status={event.status} />
            {event.status !== "void" && (
              <span style={S.linkGroup}>
                {(event.notify_error || event.status === "pending") && (
                  <button type="button" style={S.linkButton} onClick={() => handleResend(event)}>重送</button>
                )}
                <button type="button" style={S.linkButton} onClick={() => handleVoid(event)}>撤銷</button>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


// ---------------------------------------------------------
// 主元件：年度資料夾 + 四個分頁
// ---------------------------------------------------------

const SOURCE_TAG = { 系統: "sys", 事件: "ev", 抽查: "ins", 手動: "ins" };

function r1(x) {
  return x === null || x === undefined ? "—" : Math.round(x * 10) / 10;
}

export default function EvaluationWorkspace({ tab }) {
  const years = useMemo(() => availableEvaluationYears(), []);
  const [year, setYear] = useState(years[0]);
  const info = useMemo(() => evaluationYearInfo(year), [year]);

  const [teachers, setTeachers] = useState([]);
  const [types, setTypes] = useState([]);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [exclusions, setExclusions] = useState({});
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });
  const [formOpen, setFormOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [adminDetailId, setAdminDetailId] = useState("");
  const [saving, setSaving] = useState(false);

  const showMessage = useCallback((text, error = false) => setMessage({ text, error }), []);

  const loadAll = useCallback(async () => {
    try {
      setLoadError("");
      const [teacherRows, typeRows, eventRows, settingValue, assignmentRows, exclusionValue, sourceData] = await Promise.all([
        getActiveTeachers(),
        getEventTypes(),
        getEvents(info.range),
        getYearSettings(year),
        getTeacherAssignments().catch(() => []),
        getAdminExclusions().catch(() => ({})),
        loadEvaluationSources(),
      ]);
      setTeachers(teacherRows.filter((t) => t.role !== "admin"));
      setTypes(typeRows);
      setEvents(eventRows);
      setSettings(settingValue);
      setAssignments(assignmentRows || []);
      setExclusions(exclusionValue || {});
      setSources(sourceData);
    } catch (error) {
      console.error("讀取考核資料失敗：", error);
      setLoadError("考核資料讀取失敗，請重新整理再試一次。");
    } finally {
      setLoading(false);
    }
  }, [year, info]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await syncEvaluation();
      if (!cancelled) await loadAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const teacherMap = useMemo(() => Object.fromEntries(teachers.map((t) => [t.id, t])), [teachers]);
  const typeMap = useMemo(() => Object.fromEntries(types.map((t) => [t.name, t])), [types]);

  const results = useMemo(() => {
    if (!settings || !sources) return [];
    const rows = teachers.map((teacher) =>
      computeTeacherYear({ teacher, info, sources, events, assignments, exclusions, settings, typeMap, teacherIds: teachers.map((t) => t.id) })
    );
    rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    return rows;
  }, [teachers, info, sources, events, assignments, exclusions, settings, typeMap]);

  const locked = Boolean(settings?.locked);
  const snapshotRows = settings?.snapshot?.rows || [];

  async function persist(next, okText) {
    try {
      setSaving(true);
      await saveYearSettings(year, next);
      setSettings(next);
      if (okText) showMessage(okText);
    } catch (error) {
      console.error("儲存年度設定失敗：", error);
      showMessage("儲存失敗，請稍後再試。", true);
    } finally {
      setSaving(false);
    }
  }

  /** 自動儲存單一老師的學期資料：先讀最新設定再只改這一格，避免蓋掉別的視窗 */
  async function saveSemEntry(semKey, teacherId, entry) {
    const latest = await getYearSettings(year);
    if (latest.locked) throw new Error("locked");
    const next = {
      ...latest,
      semData: { ...(latest.semData || {}), [semKey]: { ...(latest.semData?.[semKey] || {}), [teacherId]: entry } },
    };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function saveInspection(insp) {
    const latest = await getYearSettings(year);
    if (latest.locked) throw new Error("locked");
    const list = (latest.inspections || []).filter((i) => i.id !== insp.id);
    list.push(insp);
    list.sort((a, b) => b.date.localeCompare(a.date));
    const next = { ...latest, inspections: list };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function saveLeave(leave) {
    const latest = await getYearSettings(year);
    if (latest.locked) throw new Error("locked");
    const list = (latest.leaveLog || []).filter((l) => l.id !== leave.id);
    list.push(leave);
    list.sort((a, b) => b.from.localeCompare(a.from));
    const next = { ...latest, leaveLog: list };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  /** 合併打卡資料：{ [tid]: { date: "HH:MM" } } */
  async function savePunches(incoming) {
    const latest = await getYearSettings(year);
    if (latest.locked) throw new Error("locked");
    const punches = { ...(latest.punches || {}) };
    for (const [tid, days] of Object.entries(incoming)) punches[tid] = { ...(punches[tid] || {}), ...days };
    const next = { ...latest, punches };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function toggleLateExempt(tid, date, value) {
    const latest = await getYearSettings(year);
    const ex = { ...(latest.lateExempt || {}) };
    ex[tid] = { ...(ex[tid] || {}) };
    if (value) ex[tid][date] = true;
    else delete ex[tid][date];
    const next = { ...latest, lateExempt: ex };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function saveLeaves(newOnes) {
    const latest = await getYearSettings(year);
    if (latest.locked) throw new Error("locked");
    const ids = new Set(newOnes.map((l) => l.id));
    const list = [...(latest.leaveLog || []).filter((l) => !ids.has(l.id)), ...newOnes].sort((a, b) => b.from.localeCompare(a.from));
    const next = { ...latest, leaveLog: list };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function deleteLeave(id) {
    const latest = await getYearSettings(year);
    const next = { ...latest, leaveLog: (latest.leaveLog || []).filter((l) => l.id !== id) };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function deleteInspection(id) {
    const latest = await getYearSettings(year);
    const next = { ...latest, inspections: (latest.inspections || []).filter((i) => i.id !== id) };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function saveSemToggles(semKey, list) {
    const latest = await getYearSettings(year);
    const next = { ...latest, disabledBySem: { ...(latest.disabledBySem || {}), [semKey]: list } };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function saveSingleDay(semKey, block) {
    const latest = await getYearSettings(year);
    if (latest.locked) throw new Error("locked");
    const next = { ...latest, singleDay: { ...(latest.singleDay || {}), [semKey]: block } };
    await saveYearSettings(year, next);
    setSettings(next);
  }

  async function lockYear() {
    if (!window.confirm(`確定封存「${info.label}」？封存後分數、設定與年終金額都會鎖定。`)) return;
    const rows = results.map((r) => ({
      teacherId: r.teacher.id,
      name: teacherName(r.teacher),
      spring: r.spring.score,
      fall: r.fall.score,
      fallCats: r.fall.catScores,
      bonus: r.bonus,
      total: r.total,
      factor: r.factor,
      salary: r.salary,
      isLeader: r.isLeader,
      pay: r.pay,
    }));
    const now = new Date();
    await persist({ ...settings, locked: true, lockedAt: now.toISOString(), snapshot: { rows } }, `${info.label} 已封存。`);
  }

  async function unlockYear() {
    if (!window.confirm(`確定解除「${info.label}」的封存？分數會恢復即時計算。`)) return;
    await persist({ ...settings, locked: false, lockedAt: null, snapshot: null }, "已解除封存。");
  }

  async function toggleExclusion(item, excluded, note) {
    try {
      const next = await setAdminExclusion(item.id, excluded, note);
      setExclusions(next);
      showMessage(excluded ? `「${item.title}」已不列入計算。` : `「${item.title}」已恢復計算。`);
    } catch (error) {
      console.error(error);
      showMessage("設定失敗，請稍後再試。", true);
    }
  }

  async function updateWithdrawal(item, patch) {
    const csId = item.classStudentId || item.id;
    try {
      await saveWithdrawal(csId, { reason: item.reason, deduct: item.deduct, ...patch });
      const next = { ...sources };
      const list = next.withdrawals.filter((w) => w.class_student_id !== csId);
      list.push({ class_student_id: csId, reason: patch.reason ?? item.reason, deduct: patch.deduct ?? item.deduct });
      next.withdrawals = list;
      setSources(next);
    } catch (error) {
      console.error(error);
      showMessage("退班登記儲存失敗。", true);
    }
  }

  function afterChange(text, error = false) {
    showMessage(text, error);
    loadAll();
  }

  if (loading && !settings) return <div style={S.empty}>正在讀取考核資料…</div>;
  if (loadError) return <div style={S.errorBanner}>{loadError}</div>;
  if (!settings) return null;

  const disputes = events.filter((e) => e.status === "disputed" || e.status === "disputing");
  const selected = results.find((r) => r.teacher.id === selectedTeacherId) || results[0];
  const springLabel = info.spring.label;
  const fallLabel = info.fall.label;

  return (
    <div>
      {/* 年度資料夾 */}
      <div style={S.folders}>
        {years.map((y) => {
          const yi = evaluationYearInfo(y);
          return (
            <button key={y} type="button" onClick={() => setYear(y)} style={{ ...S.folder, ...(y === year ? S.folderOn : {}) }}>
              <strong>
                {yi.label}
                {y === year && (locked
                  ? <span style={{ ...S.chip, ...S.chipBlue, marginLeft: 6 }}>已封存</span>
                  : <span style={{ ...S.chip, ...S.chipWarn, marginLeft: 6 }}>進行中</span>)}
              </strong>
              <span style={S.muted}>{yi.semesters}・{yi.range.from.replace(/-/g, "/")}～{yi.range.to.replace(/-/g, "/")}</span>
            </button>
          );
        })}
        <div style={{ ...S.folder, borderStyle: "dashed", cursor: "default" }}>
          <strong style={{ color: "#8a7f76" }}>＋ {years[0] + 1}</strong>
          <span style={S.muted}>{years[0] + 1}/2/1 自動建立</span>
        </div>
      </div>

      {locked && (
        <div style={S.lockBar}>
          {info.label} 已於 {new Date(settings.lockedAt).toLocaleDateString("zh-TW")} 結算封存：總覽與年終金額顯示封存當下的結果，設定不能修改。
          <button type="button" style={S.linkButton} onClick={unlockYear}>解除封存</button>
        </div>
      )}

      <div style={S.toolbar}>
        <span style={S.muted}>
          年度總分 = {springLabel} × {settings.springWeight}% ＋ {fallLabel} × {100 - settings.springWeight}% ＋ 額外加分（上限 {settings.bonusCap}）－ 安全問題／自訂扣分
        </span>
        <span style={S.actionRow}>
          {!locked && <button type="button" style={S.primaryButton} disabled={saving} onClick={lockYear}>年度結算封存</button>}
        </span>
      </div>

      {message.text && <div style={message.error ? S.errorBanner : S.successBanner}>{message.text}</div>}
      {sources?.errors?.length > 0 && (
        <div style={S.errorBanner}>部分資料讀取失敗（{sources.errors.join("、")}），相關指標先不計分。</div>
      )}

      {tab === "overview" && (
        <>
          {disputes.length > 0 && (
            <section style={S.section}>
              <h2 style={S.sectionTitle}>待處理異議 <span style={S.countBadge}>{disputes.length}</span></h2>
              <div style={S.cardGrid}>
                {disputes.map((event) => (
                  <DisputeCard key={event.id} event={event} teacher={teacherMap[event.teacher_id]} onDone={afterChange} />
                ))}
              </div>
            </section>
          )}

          <section style={S.section}>
            <h2 style={S.sectionTitle}>年度分數排行{locked && <span style={{ ...S.chip, ...S.chipBlue }}>封存結果</span>}</h2>
            <p style={S.hint}>點老師看明細；點 C 行政可看任務逾期明細。</p>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>老師</th>
                    <th style={S.thNum}>{springLabel}</th>
                    <th style={S.thNum}>A 教學<br /><span style={S.muted}>{settings.w.A}%</span></th>
                    <th style={S.thNum}>B 班經<br /><span style={S.muted}>{settings.w.B}%</span></th>
                    <th style={S.thNum}>C 行政<br /><span style={S.muted}>{settings.w.C}%</span></th>
                    <th style={S.thNum}>D 招生<br /><span style={S.muted}>{settings.w.D}%</span></th>
                    <th style={S.thNum}>{fallLabel}</th>
                    <th style={S.thNum}>加分</th>
                    <th style={S.thNum}>扣分</th>
                    <th style={S.thNum}>年度總分</th>
                    <th style={S.thNum}>係數</th>
                  </tr>
                </thead>
                <tbody>
                  {(locked ? snapshotRows : results).map((row, index) => {
                    const id = locked ? row.teacherId : row.teacher.id;
                    const name = locked ? row.name : teacherName(row.teacher);
                    const cats = locked ? row.fallCats || {} : row.fall.catScores;
                    const springScore = locked ? row.spring : row.spring.score;
                    const fallScore = locked ? row.fall : row.fall.score;
                    return (
                      <tr key={id} style={S.clickRow} onClick={() => setSelectedTeacherId(id)}>
                        <td style={S.td}>{index + 1}</td>
                        <td style={S.td}>
                          {name}
                          {(locked ? row.isLeader : row.isLeader) && <span style={S.leaderTag}>組長</span>}
                        </td>
                        <td style={S.tdNum}>{r1(springScore)}</td>
                        <td style={S.tdNum} title={!locked && row.fall?.adjusted ? "本學期調整成績基準線" : undefined}>
                          {r1(cats.A)}{!locked && row.fall?.adjusted && <span style={{ ...S.chip, ...S.chipWarn, marginLeft: 4 }}>調</span>}
                        </td>
                        <td style={S.tdNum}>{r1(cats.B)}</td>
                        <td
                          style={{ ...S.tdNum, ...(cats.C !== null && cats.C < 60 ? S.minusText : {}), cursor: locked ? "default" : "pointer", textDecoration: locked ? "none" : "underline dotted" }}
                          onClick={(e) => {
                            if (locked) return;
                            e.stopPropagation();
                            setAdminDetailId(id);
                          }}
                        >
                          {r1(cats.C)}
                        </td>
                        <td style={S.tdNum}>{r1(cats.D)}</td>
                        <td style={{ ...S.tdNum, fontWeight: 700 }}>{r1(fallScore)}</td>
                        <td style={{ ...S.tdNum, ...S.plusText }}>{row.bonus ? `+${row.bonus}` : "—"}</td>
                        <td style={{ ...S.tdNum, ...S.minusText }}>{row.deduct ? `−${row.deduct}` : "—"}</td>
                        <td style={{ ...S.tdNum, fontWeight: 800 }}>{r1(row.total)}</td>
                        <td style={S.tdNum}>{row.factor ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {selectedTeacherId && <p style={S.hint}>到「個別教師」看 {teacherName(teacherMap[selectedTeacherId])} 的完整明細。</p>}
          </section>

          <section style={S.section}>
            <h2 style={S.sectionTitle}>最近事件</h2>
            <EventList events={events.slice(0, 15)} teacherMap={teacherMap} showTeacher onChanged={afterChange} />
          </section>
        </>
      )}

      {tab === "teacher" && selected && (
        <TeacherDetail
          row={selected}
          results={results}
          settings={settings}
          info={info}
          events={events}
          teacherMap={teacherMap}
          locked={locked}
          onSelect={setSelectedTeacherId}
          onToggleExclusion={toggleExclusion}
          onWithdrawal={updateWithdrawal}
          onChanged={afterChange}
        />
      )}

      {tab === "log" && (
        <DailyLogPanel
          info={info}
          sources={sources}
          settings={settings}
          teachers={teachers}
          events={events}
          teacherMap={teacherMap}
          locked={locked}
          onNewEvent={() => setFormOpen(true)}
          onSaveInspection={async (insp) => {
            try {
              await saveInspection(insp);
              showMessage(`${insp.date} ${INSPECTION_TYPES[insp.type]} 已儲存。`);
              return true;
            } catch (error) {
              console.error(error);
              showMessage("抽查儲存失敗，請再試一次。", true);
              return false;
            }
          }}
          onDeleteInspection={async (id) => {
            await deleteInspection(id);
            showMessage("已刪除這次抽查。");
          }}
          onSaveLeave={async (leave) => {
            try {
              await saveLeave(leave);
              showMessage(`${teacherName(teacherMap[leave.teacherId])} ${leave.from} ${leave.type} 已登記。`);
              return true;
            } catch (error) {
              console.error(error);
              showMessage("請假儲存失敗，請再試一次。", true);
              return false;
            }
          }}
          onDeleteLeave={async (id) => {
            await deleteLeave(id);
            showMessage("已刪除這筆請假。");
          }}
          onSavePunches={async (map, text) => {
            try {
              await savePunches(map);
              showMessage(text);
            } catch (error) {
              console.error(error);
              showMessage("打卡資料儲存失敗，請再試一次。", true);
            }
          }}
          onToggleLateExempt={toggleLateExempt}
          onSaveLeaves={async (list, text) => {
            try {
              await saveLeaves(list);
              showMessage(text);
            } catch (error) {
              console.error(error);
              showMessage("假單匯入失敗，請再試一次。", true);
            }
          }}
          onChanged={afterChange}
        />
      )}

      {tab === "data" && (
        <SemesterDataPanel
          info={info}
          settings={settings}
          teachers={teachers}
          sources={sources}
          events={events}
          assignments={assignments}
          exclusions={exclusions}
          typeMap={typeMap}
          locked={locked}
          saving={saving}
          onWithdrawal={updateWithdrawal}
          onAutoSave={saveSemEntry}
          onSaveSingleDay={saveSingleDay}
          onSaveSemToggles={saveSemToggles}
        />
      )}

      {tab === "yearend" && (
        <YearEndPanel
          rows={locked ? snapshotRows : results}
          locked={locked}
          settings={settings}
          saving={saving}
          onSave={(next) => persist(next, "已儲存。")}
        />
      )}

      {tab === "settings" && (
        <YearSettingsPanel
          info={info}
          settings={settings}
          types={types}
          teachers={teachers}
          locked={locked}
          saving={saving}
          onSave={async (next, typeDraft) => {
            for (const type of typeDraft || []) {
              const original = types.find((t) => t.id === type.id);
              if (original && (Number(original.points) !== Number(type.points) || original.is_active !== type.is_active)) {
                await saveEventType(type);
              }
            }
            await persist(next, "年度設定已儲存。");
            loadAll();
          }}
        />
      )}

      {adminDetailId && results.find((r) => r.teacher.id === adminDetailId) && (
        <AdminDetailModal
          row={{
            teacher: teacherMap[adminDetailId],
            admin: results.find((r) => r.teacher.id === adminDetailId).fall.admin,
          }}
          perDay={Number(settings.perDay || 0)}
          onToggle={toggleExclusion}
          onClose={() => setAdminDetailId("")}
        />
      )}

      {formOpen && (
        <EventFormModal
          teachers={teachers}
          types={types}
          onClose={() => setFormOpen(false)}
          onSaved={(text) => {
            setFormOpen(false);
            afterChange(text);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 個別教師
// ---------------------------------------------------------

function CategoryCard({ code, name, weight, score, indicators }) {
  return (
    <div style={S.catCard}>
      <div style={S.rowBetween}>
        <strong>{code} {name}</strong>
        <span style={S.muted}>比重 {weight}%・<strong style={{ color: "#413832" }}>{r1(score)}</strong> 分</span>
      </div>
      <div style={S.meter}><i style={{ ...S.meterBar, width: `${Math.max(0, Math.min(100, score || 0))}%` }} /></div>
      {indicators.map((ind) => (
        <div key={ind.key} style={{ ...S.indRow, ...(ind.score === null ? { opacity: 0.5 } : {}) }}>
          <span>
            {ind.name}
            <span style={{ ...S.chip, ...(SOURCE_TAG[ind.source] === "sys" ? S.chipBlue : SOURCE_TAG[ind.source] === "ev" ? S.chipAlert : S.chipOk), marginLeft: 6 }}>{ind.source}</span>
            <br />
            <span style={S.muted}>{ind.detail}</span>
          </span>
          <strong>{ind.score === null ? "—" : ind.score}</strong>
        </div>
      ))}
    </div>
  );
}

const CAT_NAMES = { A: "教學成效", B: "班級經營與親師", C: "行政與配合", D: "招生貢獻" };

function MovesList({ moves, locked, onWithdrawal, onRemove }) {
  if (!moves.length) return <div style={S.empty}>這學期沒有進退班。</div>;
  return (
    <div style={S.list}>
      {moves.map((m) => (
        <div key={m.id} style={S.listRow}>
          <div style={S.listDate}>{(m.date || "").slice(5).replace("-", "/")}</div>
          <div style={S.listMain}>
            <div>
              <span style={{ ...S.chip, ...(m.type === "進班" ? S.chipOk : S.chipAlert), marginRight: 6 }}>{m.type}</span>
              {m.name}
              <span style={{ ...S.chip, ...S.chipMuted, marginLeft: 6 }}>{m.auto ? "系統" : "手填"}</span>
              {m.type === "退班" && m.auto && !m.reason && <span style={{ ...S.chip, ...S.chipWarn, marginLeft: 6 }}>待填原因</span>}
            </div>
            {m.type === "退班" && (m.auto ? (
              <input
                style={{ ...S.input, padding: "6px 9px", fontSize: "13px" }}
                defaultValue={m.reason}
                placeholder="退班原因（例如搬家、轉班、對帶班不滿）"
                disabled={locked}
                onBlur={(e) => e.target.value !== (m.reason || "") && onWithdrawal(m, { reason: e.target.value })}
              />
            ) : (
              m.reason && <div style={S.muted}>{m.reason}</div>
            ))}
          </div>
          {m.type === "退班" && (
            <label style={{ ...S.muted, display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={Boolean(m.deduct)} disabled={locked || !m.auto} onChange={(e) => onWithdrawal(m, { deduct: e.target.checked })} />
              列入扣分
            </label>
          )}
          {!m.auto && onRemove && !locked && (
            <button type="button" style={S.linkButton} onClick={() => onRemove(m.manualIndex)}>刪除</button>
          )}
        </div>
      ))}
    </div>
  );
}

function SemesterCard({ title, sem, settings, perDay, onToggleExclusion, onWithdrawal, locked }) {
  const b = sem.basics || {};
  if (sem.taught === false) {
    return (
      <div style={S.section}>
        <h2 style={S.sectionTitle}>{title}<span style={{ ...S.chip, ...S.chipMuted }}>這學期未帶班</span></h2>
        <p style={S.hint}>年度總分只看另一學期。</p>
      </div>
    );
  }
  if (sem.mode === "manual") {
    return (
      <div style={S.section}>
        <h2 style={S.sectionTitle}>{title}<span style={{ ...S.chip, ...S.chipMuted }}>手動輸入</span></h2>
        <p style={S.hint}>系統尚未上線，用每月考核與營隊報名數；在「學期資料」輸入。學期分數 <strong>{r1(sem.score)}</strong></p>
        <div style={S.catCard}>
          <div style={S.rowBetween}><strong>每月考核（代替 A＋B＋C）</strong><span style={S.muted}>平均 {r1(sem.monthlyRaw)}／{sem.monthlyMax} → <strong>{r1(sem.monthlyAvg)}</strong> 分</span></div>
          <div style={S.muted}>{(sem.monthly || []).length ? sem.monthly.map((m, i) => `${i + 2}月 ${m === "" || m === undefined ? "—" : m}`).join("・") : "尚未輸入"}</div>
        </div>
        <div style={S.catCard}>
          <div style={S.rowBetween}><strong>D 暑假營隊報名率</strong><span style={S.muted}><strong>{r1(sem.campScore)}</strong> 分</span></div>
          <div style={S.muted}>{sem.noCamp ? "畢業班，不計暑假營隊" : sem.campRate !== null && sem.campRate !== undefined ? `報名率 ${r1(sem.campRate)}%・${sem.campGrade || "?"} 年級班目標 ${sem.campTarget}%` : "尚未輸入"}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={S.section}>
      <h2 style={S.sectionTitle}>{title}<span style={{ ...S.chip, ...S.chipBlue }}>系統計算</span></h2>
      <p style={S.hint}>學期分數 <strong>{r1(sem.score)}</strong>・{b.grade || "?"} 年級・開學 {b.start ?? "?"} 人 → 目前 {b.size ?? "?"} 人</p>
      {["A", "B", "C", "D"].map((k) => (
        <CategoryCard key={k} code={k} name={CAT_NAMES[k]} weight={settings.w[k]} score={sem.catScores[k]} indicators={sem.categories[k]} />
      ))}

      <h3 style={S.subTitle}>行政配合明細</h3>
      <AdminItemList items={sem.admin.items} perDay={perDay} onToggle={onToggleExclusion} onlyProblems />

      <h3 style={S.subTitle}>進班／退班</h3>
      <MovesList moves={b.moves || []} locked={locked} onWithdrawal={onWithdrawal} />
    </div>
  );
}

function TeacherDetail({ row, results, settings, info, events, teacherMap, locked, onSelect, onToggleExclusion, onWithdrawal, onChanged }) {
  const own = events.filter((e) => e.teacher_id === row.teacher.id);
  return (
    <>
      <section style={S.section}>
        <div style={S.actionRow}>
          <select style={S.rangeSelect} value={row.teacher.id} onChange={(e) => onSelect(e.target.value)}>
            {results.map((r) => <option key={r.teacher.id} value={r.teacher.id}>{teacherName(r.teacher)}</option>)}
          </select>
          <span style={S.muted}>
            年度總分 <strong style={{ fontSize: 18, color: "#413832" }}>{r1(row.total)}</strong>・係數 {row.factor ?? "—"}・加分 {row.bonus}・扣分 {row.deduct || 0}
            {row.bonusRaw > row.bonus && `（原 ${row.bonusRaw}，超過上限）`}
          </span>
        </div>
        {locked && <p style={S.hint}>此年度已封存；以下為即時資料，正式結果以總覽的封存分數為準。</p>}
      </section>
      <div style={S.grid2}>
        <SemesterCard title={info.spring.label} sem={row.spring} settings={settings} perDay={Number(settings.perDay || 0)} onToggleExclusion={onToggleExclusion} onWithdrawal={onWithdrawal} locked={locked} />
        <SemesterCard title={info.fall.label} sem={row.fall} settings={settings} perDay={Number(settings.perDay || 0)} onToggleExclusion={onToggleExclusion} onWithdrawal={onWithdrawal} locked={locked} />
      </div>
      <section style={S.section}>
        <h2 style={S.sectionTitle}>事件與加分紀錄</h2>
        <EventList events={own} teacherMap={teacherMap} onChanged={onChanged} />
      </section>
    </>
  );
}

// ---------------------------------------------------------
// 正式考核（年終）
// ---------------------------------------------------------

function YearEndPanel({ rows, locked, settings, saving, onSave }) {
  const [salaries, setSalaries] = useState(settings.salaries || {});
  const [leaders, setLeaders] = useState(new Set(settings.leaders || []));
  useEffect(() => {
    setSalaries(settings.salaries || {});
    setLeaders(new Set(settings.leaders || []));
  }, [settings]);

  const live = rows.map((r) => {
    const id = locked ? r.teacherId : r.teacher.id;
    if (locked) return { id, name: r.name, total: r.total, factor: r.factor, salary: r.salary, isLeader: r.isLeader, pay: r.pay };
    const salary = Number(salaries[id]) || 0;
    const isLeader = leaders.has(id);
    const pay = r.factor === null ? 0 : salary * Number(settings.base_months || 0) * r.factor + (isLeader ? Number(settings.leader_bonus || 0) : 0);
    return { id, name: teacherName(r.teacher), total: r.total, factor: r.factor, salary, isLeader, pay };
  });
  const sum = live.reduce((a, r) => a + r.pay, 0);

  return (
    <section style={S.section}>
      <h2 style={S.sectionTitle}>年終試算</h2>
      <p style={S.hint}>
        年終 = 月薪 × 基本月數（{settings.base_months}）× 係數 ＋ 組長加給（{money(settings.leader_bonus)}）。
        {locked ? "已封存，金額鎖定。" : "月數、加給、級距在「年度設定」改。"}
      </p>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>老師</th>
              <th style={S.thNum}>年度總分</th>
              <th style={S.thNum}>係數</th>
              <th style={S.thNum}>月薪</th>
              <th style={S.th}>組長</th>
              <th style={S.thNum}>年終</th>
            </tr>
          </thead>
          <tbody>
            {live.map((r) => (
              <tr key={r.id}>
                <td style={S.td}>{r.name}</td>
                <td style={S.tdNum}>{r1(r.total)}</td>
                <td style={S.tdNum}>{r.factor ?? "—"}</td>
                <td style={S.tdNum}>
                  {locked ? money(r.salary) : (
                    <input style={S.salaryInput} type="number" min="0" value={salaries[r.id] ?? ""} onChange={(e) => setSalaries({ ...salaries, [r.id]: e.target.value })} />
                  )}
                </td>
                <td style={S.td}>
                  <input
                    type="checkbox"
                    checked={r.isLeader}
                    disabled={locked}
                    onChange={() => {
                      const next = new Set(leaders);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      setLeaders(next);
                    }}
                  />
                </td>
                <td style={{ ...S.tdNum, fontWeight: 800 }}>{r.salary ? money(r.pay) : "—"}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...S.td, fontWeight: 800 }} colSpan={5}>合計</td>
              <td style={{ ...S.tdNum, fontWeight: 800 }}>{money(sum)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!locked && (
        <div style={S.modalActions}>
          <button type="button" style={S.primaryButton} disabled={saving} onClick={() => onSave({ ...settings, salaries, leaders: [...leaders] })}>
            {saving ? "儲存中…" : "儲存月薪與組長"}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------
// 學期資料：一位一位老師填
// ---------------------------------------------------------

const hasVal = (v) => v !== undefined && v !== null && v !== "";

function semProgress(entry, basics, manualMode, semKey) {
  if (entry.taught === false) return { done: true, missing: [] };
  const missing = [];
  if (!basics.grade) missing.push("年級");
  if (basics.start === null) missing.push("開學人數");
  if (manualMode) {
    if (!(entry.monthly || []).some(hasVal)) missing.push("每月考核");
  } else {
    const examDone = (key, avgKey, tKey) =>
      SUBJECTS.every((n) => hasVal(entry[key]?.[n])) || (!entry[key] && (hasVal(entry[avgKey]) || hasVal(entry[tKey])));
    if (!examDone("mid", "midAvg", "midT")) missing.push("期中");
    if (!examDone("fin", "finAvg", "finT")) missing.push("期末");
    if (hasVal(entry.baselineOverride) && !String(entry.baselineReason || "").trim()) missing.push("調整原因");
  }
  if (!campExcluded(entry, semKey, basics.grade) && !hasVal(entry.campRate) && !hasVal(entry.camp)) missing.push("營隊");
  return { done: missing.length === 0, missing };
}

// ---------------------------------------------------------
// 日常登記：事件＋抽查
// ---------------------------------------------------------

function DailyLogPanel({ info, sources, settings, teachers, events, teacherMap, locked, onNewEvent, onSaveInspection, onDeleteInspection, onSaveLeave, onDeleteLeave, onSavePunches, onToggleLateExempt, onSaveLeaves, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [leaveEditing, setLeaveEditing] = useState(null);
  const [leaveFilter, setLeaveFilter] = useState("");
  const leaves = (settings.leaveLog || []).filter((l) => !leaveFilter || l.teacherId === leaveFilter).slice().sort((a, b) => b.from.localeCompare(a.from));
  const [filter, setFilter] = useState("");
  const inspections = (settings.inspections || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const shownEvents = filter ? events.filter((e) => e.teacher_id === filter) : events;

  function newInspection(type) {
    setEditing({ id: `i${Date.now()}`, type, date: todayText(), results: Object.fromEntries(teachers.map((t) => [t.id, { issues: [], custom: [] }])), isNew: true });
  }

  return (
    <>
      <section style={S.section}>
        <h2 style={S.sectionTitle}>日常登記</h2>
        <p style={S.hint}>事件可以回溯登記，日期填發生當天。扣分事件會推 LINE 給老師確認；抽查和請假不通知老師。</p>
        {!locked && (
          <div style={{ ...S.actionRow, gap: 10 }}>
            <button type="button" style={S.primaryButton} onClick={onNewEvent}>＋ 登記事件</button>
            <button type="button" style={S.primaryButton} onClick={() => newInspection("hw")}>＋ 作業抽查</button>
            <button type="button" style={S.primaryButton} onClick={() => newInspection("env")}>＋ 環境抽查</button>
            <button type="button" style={S.primaryButton} onClick={() => setLeaveEditing({ id: `l${Date.now()}`, teacherId: "", from: todayText(), to: todayText(), type: "事假", hours: 8, lastMinute: false, note: "" })}>＋ 登記請假</button>
          </div>
        )}
      </section>

      <section style={S.section}>
        <h2 style={S.sectionTitle}>抽查紀錄</h2>
        {inspections.length ? (
          <div style={S.list}>
            {inspections.map((insp) => {
              const scores = teachers.map((t) => inspectionScore(insp, t.id, settings)).filter((x) => x !== null);
              const low = teachers.filter((t) => {
                const sc = inspectionScore(insp, t.id, settings);
                return sc !== null && sc < 100;
              });
              return (
                <div key={insp.id} style={S.listRow}>
                  <div style={S.listDate}>{insp.date.slice(5).replace("-", "/")}</div>
                  <div style={S.listMain}>
                    <div><strong>{INSPECTION_TYPES[insp.type]}</strong>・全校平均 {scores.length ? r1(avg(scores)) : "—"}</div>
                    <div style={S.muted}>{low.length ? `有扣分：${low.map((t) => `${teacherName(t)} ${Math.round(inspectionScore(insp, t.id, settings))}`).join("、")}` : "全部 100"}</div>
                  </div>
                  {!locked && (
                    <span style={S.actionRow}>
                      <button type="button" style={S.linkButton} onClick={() => setEditing(JSON.parse(JSON.stringify(insp)))}>編輯</button>
                      <button type="button" style={S.linkButton} onClick={() => window.confirm("刪除這次抽查？") && onDeleteInspection(insp.id)}>刪除</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={S.empty}>還沒有抽查紀錄。</div>
        )}
      </section>

      <PunchSection
        info={info}
        sources={sources}
        settings={settings}
        teachers={teachers}
        locked={locked}
        onSave={onSavePunches}
        onToggle={onToggleLateExempt}
        onLeave={(tid, date) => setLeaveEditing({ id: `l${Date.now()}`, teacherId: tid, from: date, to: date, type: "事假", hours: 8, lastMinute: false, note: "" })}
      />

      <section style={S.section}>
        <div style={S.rowBetween}>
          <h2 style={S.sectionTitle}>請假紀錄</h2>
          <span style={S.actionRow}>
          {!locked && <LeaveUpload teachers={teachers} settings={settings} onSave={onSaveLeaves} />}
          <select style={S.rangeSelect} value={leaveFilter} onChange={(e) => setLeaveFilter(e.target.value)}>
            <option value="">全部老師</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{teacherName(t)}</option>)}
          </select>
          </span>
        </div>
        {leaves.length ? (
          <div style={S.list}>
            {leaves.map((l) => {
              const w = leaveWeight(settings, l.type);
              const lost = ((Number(l.hours) || 0) / 8) * w;
              return (
                <div key={l.id} style={S.listRow}>
                  <div style={S.listDate}>{l.from.slice(5).replace("-", "/")}{l.to && l.to !== l.from ? `～${l.to.slice(5).replace("-", "/")}` : ""}</div>
                  <div style={S.listMain}>
                    <div>
                      <strong>{teacherName(teacherMap[l.teacherId])}</strong>・{l.type}・{l.hours} 小時
                      {l.lastMinute && <span style={{ ...S.chip, ...S.chipAlert, marginLeft: 6 }}>臨時</span>}
                    </div>
                    <div style={S.muted}>
                      {PROTECTED_LEAVE_TYPES.includes(l.type) ? "不扣分" : `出勤扣 ${Math.round(lost * 10) / 10}`}
                      {l.lastMinute ? `＋臨時 ${settings.attendancePenalty}` : ""}
                      {l.note ? `・${l.note}` : ""}
                    </div>
                  </div>
                  {!locked && (
                    <span style={S.actionRow}>
                      <button type="button" style={S.linkButton} onClick={() => setLeaveEditing({ ...l })}>編輯</button>
                      <button type="button" style={S.linkButton} onClick={() => window.confirm("刪除這筆請假？") && onDeleteLeave(l.id)}>刪除</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={S.empty}>還沒有請假紀錄。</div>
        )}
      </section>

      <section style={S.section}>
        <div style={S.rowBetween}>
          <h2 style={S.sectionTitle}>事件紀錄</h2>
          <select style={S.rangeSelect} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">全部老師</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{teacherName(t)}</option>)}
          </select>
        </div>
        <EventList events={shownEvents} teacherMap={teacherMap} showTeacher onChanged={onChanged} />
      </section>

      {leaveEditing && (
        <LeaveEditor
          draft={leaveEditing}
          settings={settings}
          teachers={teachers}
          onClose={() => setLeaveEditing(null)}
          onSave={async (leave) => {
            const ok = await onSaveLeave(leave);
            if (ok) setLeaveEditing(null);
          }}
        />
      )}

      {editing && (
        <InspectionEditor
          draft={editing}
          settings={settings}
          teachers={teachers}
          info={info}
          onClose={() => setEditing(null)}
          onSave={async (insp) => {
            const ok = await onSaveInspection(insp);
            if (ok) setEditing(null);
          }}
        />
      )}
    </>
  );
}

function avg(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

/** 打卡紀錄：上傳打卡 Excel，只讀「倍思學院」分頁、只認系統裡的老師 */
function PunchSection({ info, sources, settings, teachers, locked, onSave, onToggle, onLeave }) {
  const [busy, setBusy] = useState(false);
  const [openTid, setOpenTid] = useState("");
  const fileRef = useRef(null);

  const nameMap = new Map();
  for (const t of teachers) {
    for (const n of [t.chinese_name, t.english_name, settings.punchNames?.[t.id]]) {
      if (n && String(n).trim()) nameMap.set(String(n).trim(), t.id);
    }
  }

  async function handleFiles(files) {
    setBusy(true);
    const map = {};
    let rows = 0;
    const unknown = new Set();
    try {
      for (const file of files) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheetName = wb.SheetNames.find((n) => n.includes("倍思")) || wb.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" });
        const head = data[0] || [];
        const iName = head.findIndex((h) => String(h).includes("姓名"));
        const iDate = head.findIndex((h) => String(h).includes("日期"));
        const iIn = head.findIndex((h) => String(h).includes("上班"));
        if (iName < 0 || iDate < 0 || iIn < 0) continue;
        for (const row of data.slice(1)) {
          const name = String(row[iName] || "").trim();
          const tid = nameMap.get(name);
          if (!tid) {
            if (name) unknown.add(name);
            continue;
          }
          const date = String(row[iDate] || "").slice(0, 10).replace(/\//g, "-");
          const t = firstPunch(row[iIn]);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !t) continue;
          map[tid] = map[tid] || {};
          if (!map[tid][date] || t < map[tid][date]) map[tid][date] = t;
          rows += 1;
        }
      }
      const matched = Object.keys(map).length;
      await onSave(map, `已匯入 ${rows} 筆打卡（${matched} 位老師）。其他 ${unknown.size} 人不是考核名單，已略過。`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const summary = teachers.map((t) => {
    const days = Object.keys(settings.punches?.[t.id] || {}).filter((d) => d >= info.range.from && d <= info.range.to).length;
    const list = lateList(t.id, info.range, settings, sources);
    const hasSched = Object.values(settings.workSchedule?.[t.id] || {}).some(Boolean);
    return { t, days, list, counted: list.filter((x) => !x.exempt).length, hasSched };
  });

  return (
    <section style={S.section}>
      <h2 style={S.sectionTitle}>打卡紀錄（遲到）</h2>
      <p style={S.hint}>
        每月把打卡 Excel 檔上傳一次（可以一次選好幾個月）。系統只讀「倍思學院」分頁、只認考核名單裡的老師；
        每天第一次上班打卡比上班時間晚就算遲到，依晚到分鐘數分級扣分；有上班日卻沒打卡、也沒請假，算「未打卡」扣 {settings.missingPunchPoints ?? 2} 分（是請假就按「登記請假」）；週六日和寒暑假（
        {noLateRanges(settings, sources).map((x) => `${x.name} ${x.from.slice(5).replace("-", "/")}～${x.to.slice(5).replace("-", "/")}`).join("、") || "未設定"}
        ）不算。上班時間、扣分級距、寒暑假期間在「年度設定」修改。
      </p>
      {!locked && (
        <div style={S.actionRow}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={(e) => e.target.files?.length && handleFiles([...e.target.files])} />
          <button type="button" style={S.primaryButton} disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "匯入中…" : "＋ 上傳打卡檔"}</button>
        </div>
      )}
      <div style={{ ...S.list, marginTop: 8 }}>
        {summary.map(({ t, days, list, counted, hasSched }) => (
          <div key={t.id}>
            <div style={{ ...S.listRow, cursor: list.length ? "pointer" : "default" }} onClick={() => list.length && setOpenTid(openTid === t.id ? "" : t.id)}>
              <div style={S.listMain}>
                <strong>{teacherName(t)}</strong>
                <span style={S.muted}>・打卡 {days} 天</span>
                {!hasSched && <span style={{ ...S.chip, ...S.chipWarn, marginLeft: 6 }}>未設上班時間</span>}
              </div>
              <span style={counted ? S.minusText : S.muted}>
                {list.some((x) => x.missing && !x.exempt) ? `未打卡 ${list.filter((x) => x.missing && !x.exempt).length}・` : ""}遲到 {counted - list.filter((x) => x.missing && !x.exempt).length} 次{counted ? `・扣 ${list.filter((x) => !x.exempt).reduce((a, x) => a + x.points, 0)}` : ""}{list.length ? (openTid === t.id ? " ▾" : " ▸") : ""}
              </span>
            </div>
            {openTid === t.id && (
              <div style={{ padding: "4px 0 10px 16px" }}>
                {list.map((x) => (
                  <div key={x.date} style={{ ...S.actionRow, padding: "3px 0", opacity: x.exempt ? 0.5 : 1 }}>
                    <span style={{ width: 90 }}>{x.date.slice(5).replace("-", "/")}（{"日一二三四五六"[new Date(`${x.date}T00:00:00`).getDay()]}）</span>
                    {x.missing ? (
                      <>
                        <span style={{ ...S.chip, ...S.chipWarn }}>未打卡</span>
                        <span style={S.muted}>沒有打卡也沒有請假・扣 {x.points}</span>
                        {!locked && <button type="button" style={S.linkButton} onClick={() => onLeave(t.id, x.date)}>登記請假</button>}
                      </>
                    ) : (
                      <span style={S.muted}>上班 {x.start}・打卡 {x.time}・晚 {x.minutes} 分・扣 {x.points}</span>
                    )}
                    {!locked && (
                      <label style={S.muted}>
                        <input type="checkbox" checked={x.exempt} onChange={(e) => onToggle(t.id, x.date, e.target.checked)} /> 不算
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 上傳假單 Excel（請假姓名、開始日期、結束日期、假別、總計），只認考核名單裡的老師 */
function LeaveUpload({ teachers, settings, onSave }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const nameMap = new Map();
  for (const t of teachers) {
    for (const n of [t.chinese_name, t.english_name, settings.punchNames?.[t.id]]) if (n && String(n).trim()) nameMap.set(String(n).trim(), t.id);
  }
  const pad = (n) => String(n).padStart(2, "0");
  const toParts = (v) => {
    if (v instanceof Date) return { date: `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`, time: `${pad(v.getHours())}:${pad(v.getMinutes())}` };
    const m = String(v || "").match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    return m ? { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, time: m[4] ? `${pad(m[4])}:${m[5]}` : "" } : null;
  };

  async function handle(files) {
    setBusy(true);
    const out = [];
    let skipped = 0;
    try {
      for (const file of files) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
        const hi = rows.findIndex((r) => r.some((c) => String(c).includes("請假姓名")));
        if (hi < 0) continue;
        const h = rows[hi].map((c) => String(c));
        const col = (k) => h.findIndex((c) => c.includes(k));
        const iN = col("請假姓名"), iS = col("開始"), iE = col("結束"), iT = col("假別"), iH = col("總計"), iR = col("原因");
        for (const r of rows.slice(hi + 1)) {
          const name = String(r[iN] || "").trim();
          if (!name) continue;
          const tid = nameMap.get(name);
          if (!tid) { skipped += 1; continue; }
          const s = toParts(r[iS]);
          const e = toParts(r[iE]) || s;
          if (!s) continue;
          const rawType = String(r[iT] || "").trim();
          const type = [...LEAVE_TYPES, ...PROTECTED_LEAVE_TYPES].find((t) => rawType.includes(t.replace("假", ""))) || (rawType ? "其他" : "事假");
          const hours = Number(String(r[iH] || "").replace(/[^\d.]/g, "")) || 8;
          out.push({ id: `x-${tid}-${s.date}${s.time}`, teacherId: tid, from: s.date, to: e.date, type, hours, lastMinute: false, note: [rawType !== type ? rawType : "", String(r[iR] || "").trim(), s.time && e.time ? `${s.time}–${e.time}` : ""].filter(Boolean).join("・") });
        }
      }
      await onSave(out, `已匯入 ${out.length} 筆請假${skipped ? `，其他 ${skipped} 筆不是考核名單已略過` : ""}。重複上傳不會重複登記。`);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={(e) => e.target.files?.length && handle([...e.target.files])} />
      <button type="button" style={S.ghostButton} disabled={busy} onClick={() => ref.current?.click()}>{busy ? "匯入中…" : "上傳假單"}</button>
    </>
  );
}

function LeaveEditor({ draft: initial, settings, teachers, onClose, onSave }) {
  const [d, setD] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const days = d.from && d.to ? Math.max(1, Math.round((new Date(d.to) - new Date(d.from)) / 86400000) + 1) : 1;
  const w = leaveWeight(settings, d.type);
  const lost = ((Number(d.hours) || 0) / 8) * w;
  const isProtected = PROTECTED_LEAVE_TYPES.includes(d.type);

  return (
    <div style={S.overlay}>
      <button type="button" aria-label="關閉" style={S.backdrop} onClick={onClose} />
      <div style={S.modal}>
        <h3 style={S.modalTitle}>登記請假</h3>
        <label style={S.label}>老師</label>
        <select style={S.input} value={d.teacherId} onChange={(e) => setD({ ...d, teacherId: e.target.value })}>
          <option value="">請選擇</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{teacherName(t)}</option>)}
        </select>
        <label style={S.label}>日期</label>
        <div style={S.actionRow}>
          <input style={{ ...S.input, width: 160 }} type="date" value={d.from} onChange={(e) => {
            const from = e.target.value;
            const to = !d.to || d.to < from ? from : d.to;
            setD({ ...d, from, to });
          }} />
          <span>到</span>
          <input style={{ ...S.input, width: 160 }} type="date" value={d.to} min={d.from} onChange={(e) => {
            const to = e.target.value;
            const n = Math.max(1, Math.round((new Date(to) - new Date(d.from)) / 86400000) + 1);
            setD({ ...d, to, hours: n * 8 });
          }} />
        </div>
        <label style={S.label}>假別</label>
        <select style={S.input} value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>
          {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          <optgroup label="不扣分">
            {PROTECTED_LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </optgroup>
        </select>
        <label style={S.label}>時數（{days} 天，1 天 8 小時；半天填 4）</label>
        <input style={{ ...S.input, width: 120 }} type="number" min="0" step="0.5" value={d.hours} onChange={(e) => setD({ ...d, hours: e.target.value === "" ? "" : Number(e.target.value) })} />
        <label style={{ ...S.label, display: "flex", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "flex-start", textAlign: "left" }}>
          <input type="checkbox" checked={Boolean(d.lastMinute)} onChange={(e) => setD({ ...d, lastMinute: e.target.checked })} />
          臨時請假（沒有提前申請）
        </label>
        <label style={S.label}>備註（可留白）</label>
        <input style={S.input} value={d.note || ""} onChange={(e) => setD({ ...d, note: e.target.value })} />
        <div style={S.previewLine}>
          {isProtected ? "不扣分" : `出勤扣 ${Math.round(lost * 10) / 10} 分（${d.type} 每天 ${w}）`}
          {d.lastMinute ? `＋臨時請假 ${settings.attendancePenalty}` : ""}・不通知老師
        </div>
        {error && <div style={S.errorText}>{error}</div>}
        <div style={S.modalActions}>
          <button type="button" style={S.ghostButton} onClick={onClose}>取消</button>
          <button
            type="button"
            style={S.primaryButton}
            disabled={saving}
            onClick={async () => {
              if (!d.teacherId || !d.from || !d.hours) return setError("請選老師、日期，並填時數。");
              setSaving(true);
              await onSave({ ...d, to: d.to || d.from });
              setSaving(false);
            }}
          >
            {saving ? "儲存中…" : "登記"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InspectionEditor({ draft: initial, settings, teachers, info, onClose, onSave }) {
  const [draft, setDraft] = useState(() => {
    const d = JSON.parse(JSON.stringify(initial));
    delete d.isNew;
    for (const t of teachers) if (!d.results[t.id]) d.results[t.id] = { issues: [], custom: [] };
    return d;
  });
  const [saving, setSaving] = useState(false);
  const [otherDraft, setOtherDraft] = useState({});
  const items = settings.inspectionItems?.[draft.type] || [];
  const inYear = draft.date >= info.range.from && draft.date <= info.range.to;

  const putRes = (tid, patch) => setDraft((d) => ({ ...d, results: { ...d.results, [tid]: { ...d.results[tid], ...patch } } }));

  return (
    <div style={S.overlay}>
      <button type="button" aria-label="關閉" style={S.backdrop} onClick={onClose} />
      <div style={{ ...S.modal, width: "min(900px, 100%)" }}>
        <h3 style={S.modalTitle}>{INSPECTION_TYPES[draft.type]}</h3>
        <div style={S.actionRow}>
          <label style={S.muted}>抽查日期 <input style={{ ...S.smallInput, width: 160 }} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
          {!inYear && <span style={S.minusText}>日期不在 {info.label} 範圍內</span>}
        </div>
        <p style={S.hint}>每位老師勾發現的問題，100 分往下扣；也可以直接填調整後分數（要寫原因）。老師那天不在就勾「本次不計」。</p>

        {teachers.map((t) => {
          const res = draft.results[t.id] || { issues: [], custom: [] };
          const score = inspectionScore(draft, t.id, settings);
          const issues = new Set(res.issues || []);
          return (
            <div key={t.id} style={{ ...S.catCard, ...(res.skip ? { opacity: 0.5 } : {}) }}>
              <div style={S.rowBetween}>
                <strong>{teacherName(t)}</strong>
                <span style={S.actionRow}>
                  <label style={S.muted}><input type="checkbox" checked={Boolean(res.skip)} onChange={(e) => putRes(t.id, { skip: e.target.checked })} /> 本次不計</label>
                  <strong style={{ fontSize: 18, color: score !== null && score < 100 ? "#c0392b" : "#413832" }}>{score === null ? "—" : Math.round(score)}</strong>
                </span>
              </div>
              {!res.skip && (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {items.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          const next = new Set(issues);
                          if (next.has(it.id)) next.delete(it.id);
                          else next.add(it.id);
                          putRes(t.id, { issues: [...next] });
                        }}
                        style={{ ...S.chip, cursor: "pointer", padding: "6px 10px", fontSize: 13, ...(issues.has(it.id) ? S.chipAlert : S.chipMuted) }}
                      >
                        {it.name} −{it.points}
                      </button>
                    ))}
                  </div>
                  <div style={{ ...S.actionRow, marginTop: 6 }}>
                    <span style={S.muted}>其他問題</span>
                    <input style={{ ...S.smallInput, width: 220 }} placeholder="例如：作業本遺失" value={otherDraft[t.id]?.name ?? ""} onChange={(e) => setOtherDraft({ ...otherDraft, [t.id]: { points: 5, ...otherDraft[t.id], name: e.target.value } })} />
                    <span style={S.muted}>扣</span>
                    <input style={S.smallInput} type="number" min="0" value={otherDraft[t.id]?.points ?? 5} onChange={(e) => setOtherDraft({ ...otherDraft, [t.id]: { name: "", ...otherDraft[t.id], points: e.target.value } })} />
                    <span style={S.muted}>分</span>
                    <button
                      type="button"
                      style={S.ghostButton}
                      onClick={() => {
                        const o = otherDraft[t.id] || {};
                        if (!String(o.name || "").trim()) return;
                        putRes(t.id, { custom: [...(res.custom || []), { name: o.name.trim(), points: Number(o.points ?? 5) || 0 }] });
                        setOtherDraft({ ...otherDraft, [t.id]: { name: "", points: 5 } });
                      }}
                    >
                      加入
                    </button>
                  </div>
                  {(res.custom || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {res.custom.map((c, i) => (
                        <span key={i} style={{ ...S.chip, ...S.chipAlert, padding: "6px 10px", fontSize: 13 }}>
                          {c.name} −{c.points}
                          <button type="button" style={S.linkButton} onClick={() => putRes(t.id, { custom: res.custom.filter((_, j) => j !== i) })}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ ...S.actionRow, marginTop: 8 }}>
                    <span style={S.muted}>調整後分數</span>
                    <input style={S.smallInput} type="number" min="0" max="100" value={res.override ?? ""} onChange={(e) => putRes(t.id, { override: e.target.value === "" ? "" : Number(e.target.value) })} />
                    {res.override !== undefined && res.override !== "" && (
                      <input style={{ ...S.smallInput, width: 260, ...(String(res.note || "").trim() ? {} : { borderColor: "#c0392b" }) }} placeholder="調整原因（必填）" value={res.note ?? ""} onChange={(e) => putRes(t.id, { note: e.target.value })} />
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

        <div style={S.modalActions}>
          <button type="button" style={S.ghostButton} onClick={onClose}>取消</button>
          <button
            type="button"
            style={S.primaryButton}
            disabled={saving}
            onClick={async () => {
              const missingNote = teachers.find((t) => {
                const res = draft.results[t.id] || {};
                return !res.skip && res.override !== undefined && res.override !== "" && !String(res.note || "").trim();
              });
              if (missingNote) return window.alert(`${teacherName(missingNote)} 有調整分數，請填原因。`);
              setSaving(true);
              await onSave(draft);
              setSaving(false);
            }}
          >
            {saving ? "儲存中…" : "儲存這次抽查"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 單日課程總表：一列一班、一欄一堂課，整學期填一次（可從試算表貼上） */
function SingleDayTable({ semKey, label, settings, teachers, sources, locked, onSave }) {
  const [block, setBlock] = useState(() => JSON.parse(JSON.stringify(singleDayBlock(settings, semKey))));
  const [status, setStatus] = useState("idle");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [open, setOpen] = useState(true);
  const timer = useRef(null);
  const pendingRef = useRef(null);

  const teacherIdSet = new Set(teachers.map((t) => t.id));
  const classMap = new Map((sources?.classes || []).map((c) => [c.id, c]));
  const rows = [];
  for (const ct of sources?.classTeachers || []) {
    if (!teacherIdSet.has(ct.teacher_id) || !classMap.has(ct.class_id)) continue;
    if (rows.some((r) => r.classId === ct.class_id)) continue;
    rows.push({ classId: ct.class_id, className: classMap.get(ct.class_id).class_name || "", teacher: teachers.find((t) => t.id === ct.teacher_id) });
  }
  rows.sort((a, b) => a.className.localeCompare(b.className));

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const job = pendingRef.current;
    if (!job) return;
    pendingRef.current = null;
    setStatus("saving");
    try {
      await onSave(semKey, job);
      setStatus(pendingRef.current ? "saving" : "saved");
    } catch (error) {
      console.error("單日課程儲存失敗：", error);
      pendingRef.current = pendingRef.current || job;
      setStatus("error");
    }
  }, [onSave, semKey]);
  useEffect(() => () => { flush(); }, [flush]);

  const update = (next) => {
    if (locked) return;
    setBlock(next);
    pendingRef.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
    setStatus("dirty");
  };
  const num = (v) => (v === "" ? "" : Number(v));

  function addCourse() {
    const name = window.prompt("課程名稱（例如：不要對我尖叫）", "");
    if (!name || !name.trim()) return;
    update({ ...block, courses: [...(block.courses || []), { id: `c${Date.now()}`, name: name.trim() }] });
  }
  function removeCourse(c) {
    if (!window.confirm(`刪除「${c.name}」和它的報名人數？`)) return;
    update({ ...block, courses: block.courses.filter((x) => x.id !== c.id) });
  }

  /** 貼上：第一列是標題（班別、課程名…），之後每列「班別 人數 人數…」；合計、佔比欄會自動略過 */
  function applyPaste() {
    const lines = pasteText.split(/\r?\n/).map((l) => l.split("\t").map((x) => x.trim())).filter((l) => l.some(Boolean));
    if (lines.length < 2) return window.alert("至少要有標題列和一列班級。");
    const header = lines[0];
    const courseCols = [];
    header.forEach((h, i) => {
      if (i === 0 || !h || /合計|總計|佔比|占比|%/.test(h)) return;
      courseCols.push({ index: i, name: h });
    });
    if (!courseCols.length) return window.alert("找不到課程欄位，請連標題列一起複製。");
    const courses = [...(block.courses || [])];
    const idFor = {};
    for (const col of courseCols) {
      let c = courses.find((x) => x.name === col.name);
      if (!c) {
        c = { id: `c${Date.now()}${col.index}`, name: col.name };
        courses.push(c);
      }
      idFor[col.index] = c.id;
    }
    const byName = new Map(rows.map((r) => [r.className.toUpperCase(), r.classId]));
    const counts = JSON.parse(JSON.stringify(block.counts || {}));
    let matched = 0;
    // 全校報名人數：所有班別列加總（不含美語、合計列）
    const enrolled = {};
    for (const line of lines.slice(1)) {
      const name = line[0] || "";
      if (!name || /美語|合計|總計|小計/.test(name)) continue;
      for (const col of courseCols) {
        const v = Number(line[col.index]);
        if (!Number.isNaN(v)) enrolled[idFor[col.index]] = (enrolled[idFor[col.index]] || 0) + v;
      }
    }
    for (const c of courses) if (enrolled[c.id] !== undefined) c.enrolled = enrolled[c.id];
    for (const line of lines.slice(1)) {
      const cid = byName.get((line[0] || "").toUpperCase());
      if (!cid) continue;
      matched += 1;
      counts[cid] = counts[cid] || {};
      for (const col of courseCols) {
        const v = line[col.index];
        if (v !== undefined && v !== "" && !Number.isNaN(Number(v))) counts[cid][idFor[col.index]] = Number(v);
      }
    }
    update({ courses, counts });
    setPasteOpen(false);
    setPasteText("");
    window.alert(`已貼上 ${courseCols.length} 堂課、${matched} 個班。記得在每堂課填「上課日」和「全校人數」。`);
  }

  const courses = block.courses || [];
  const rowTotal = (cid) => courses.reduce((s2, c) => s2 + (Number(block.counts?.[cid]?.[c.id]) || 0), 0);
  const statusText = { idle: "", dirty: "輸入中…", saving: "儲存中…", saved: "✓ 已自動儲存", error: "儲存失敗" }[status];

  return (
    <section style={S.section}>
      <div style={S.rowBetween}>
        <h2 style={{ ...S.sectionTitle, cursor: "pointer" }} onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} {label} 單日課程總表
          <span style={{ ...S.chip, ...(courses.length ? S.chipOk : S.chipWarn) }}>{courses.length ? `${courses.length} 堂課` : "未填"}</span>
        </h2>
        <span style={status === "error" ? S.minusText : S.muted}>
          {statusText}{status === "error" && <button type="button" style={S.linkButton} onClick={flush}>重試</button>}
        </span>
      </div>
      {open && (
        <>
          <p style={S.hint}>每堂課填一次「上課日」和「當時全校人數」，下面各班填報名人數（不是佔比）。班上人數系統會用上課當天的人數（開學＋之前進班－之前退班）。全校平均 = 全校報名 ÷ 全校人數。</p>
          {!locked && (
            <div style={S.actionRow}>
              <button type="button" style={S.ghostButton} onClick={() => setPasteOpen(!pasteOpen)}>從試算表貼上</button>
              <button type="button" style={S.ghostButton} onClick={addCourse}>＋ 新增課程</button>
            </div>
          )}
          {pasteOpen && (
            <div style={{ marginTop: 8 }}>
              <textarea
                style={{ ...S.input, width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 12 }}
                placeholder={"在試算表選取「班別」到最後一堂課（含標題列）→ 複製 → 貼在這裡\n合計、佔比欄可以一起選，會自動略過"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div style={S.actionRow}>
                <button type="button" style={S.primaryButton} onClick={applyPaste}>套用</button>
                <button type="button" style={S.ghostButton} onClick={() => setPasteOpen(false)}>取消</button>
              </div>
            </div>
          )}
          {courses.length > 0 ? (
            <div style={{ ...S.tableWrap, marginTop: 8 }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>班別</th>
                    <th style={S.th}>老師</th>
                    {courses.map((c) => (
                      <th key={c.id} style={S.thNum}>
                        {c.name}
                        {!locked && <button type="button" style={S.linkButton} onClick={() => removeCourse(c)}>刪除</button>}
                      </th>
                    ))}
                    <th style={S.thNum}>合計</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["上課日", "date"],
                    ["當時全校人數", "schoolTotal"],
                    ["全校報名人數", "enrolled"],
                  ].map(([labelText, field]) => (
                    <tr key={field} style={{ background: "#faf6f0" }}>
                      <td style={{ ...S.td, fontWeight: 700 }} colSpan={2}>{labelText}{field === "enrolled" && <span style={S.muted}>（不含美語）</span>}</td>
                      {courses.map((c, ci) => {
                        const missing = field !== "enrolled" && !c[field];
                        return (
                          <td key={c.id} style={S.tdNum}>
                            <input
                              style={{ ...S.smallInput, ...(field === "date" ? { width: 140 } : {}), ...(missing ? { borderColor: "#c0392b" } : {}) }}
                              type={field === "date" ? "date" : "number"} disabled={locked}
                              min={field === "date" ? undefined : "0"}
                              placeholder={field === "enrolled" ? String(courseEnrolled(block, c)) : ""}
                              value={c[field] ?? ""}
                              onChange={(e) => {
                                const list = [...courses];
                                list[ci] = { ...c, [field]: field === "date" ? e.target.value : num(e.target.value) };
                                update({ ...block, courses: list });
                              }}
                            />
                          </td>
                        );
                      })}
                      <td style={S.tdNum}>
                        {field === "enrolled" && (() => {
                          const tot = courses.reduce((a, c) => a + (Number(c.schoolTotal) || 0), 0);
                          const en = courses.reduce((a, c) => a + (c.schoolTotal ? courseEnrolled(block, c) : 0), 0);
                          return tot ? <span style={S.muted}>全校平均 {Math.round((en / tot) * 1000) / 10}%</span> : null;
                        })()}
                      </td>
                    </tr>
                  ))}
                  {rows.map((r) => (
                    <tr key={r.classId}>
                      <td style={S.td}>{r.className}</td>
                      <td style={S.td}>{teacherName(r.teacher)}</td>
                      {courses.map((c) => (
                        <td key={c.id} style={S.tdNum}>
                          <input style={S.smallInput} type="number" min="0" disabled={locked}
                            value={block.counts?.[r.classId]?.[c.id] ?? ""}
                            onChange={(e) => update({
                              ...block,
                              counts: { ...(block.counts || {}), [r.classId]: { ...(block.counts?.[r.classId] || {}), [c.id]: num(e.target.value) } },
                            })} />
                        </td>
                      ))}
                      <td style={{ ...S.tdNum, fontWeight: 700 }}>{rowTotal(r.classId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={S.muted}>還沒有課程，按「從試算表貼上」或「新增課程」。</p>
          )}
        </>
      )}
    </section>
  );
}

function SemesterDataPanel({ info, settings, teachers, sources, events, assignments, exclusions, typeMap, locked, onWithdrawal, onAutoSave, onSaveSingleDay, onSaveSemToggles }) {
  const [semKey, setSemKey] = useState("fall");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id || "");
  const [draft, setDraft] = useState({});
  const [newMove, setNewMove] = useState({ date: "", name: "", type: "退班", reason: "", deduct: true });
  const range = info[semKey];
  const manualMode = semKey === "spring" && settings.springMode === "manual";
  const teacherIds = teachers.map((t) => t.id);

  useEffect(() => {
    if (!teacherId && teachers[0]) setTeacherId(teachers[0].id);
  }, [teachers, teacherId]);
  // 自動儲存：停手 0.8 秒就存；換老師／換學期／離開頁面前先存掉
  const [saveState, setSaveState] = useState({ status: "idle", at: null });
  const pending = useRef(null);
  const timer = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return;
    pending.current = null;
    setSaveState({ status: "saving", at: null });
    try {
      await onAutoSave(job.semKey, job.teacherId, job.entry);
      setSaveState({ status: pending.current ? "saving" : "saved", at: new Date() });
    } catch (error) {
      console.error("自動儲存失敗：", error);
      pending.current = pending.current || job;
      setSaveState({ status: "error", at: null });
    }
  }, [onAutoSave]);

  useEffect(() => {
    // 換老師或學期：先存上一位，再載入這一位
    flush();
    setDraft(JSON.parse(JSON.stringify(semEntry(settingsRef.current, semKey, teacherId) || {})));
  }, [semKey, teacherId, flush]);

  useEffect(() => {
    const warn = (e) => {
      if (pending.current) {
        flush();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      flush();
    };
  }, [flush]);

  const withDraft = (base, tid, entry) => ({
    ...base,
    semData: { ...(base.semData || {}), [semKey]: { ...(base.semData?.[semKey] || {}), [tid]: entry } },
  });
  const liveSettings = withDraft(settings, teacherId, draft);

  const cards = teachers.map((t) => {
    const entry = semEntry(settings, semKey, t.id);
    const basics = semesterBasics({ teacherId: t.id, range, sources, settings, systemData: !manualMode });
    return { t, entry, ...semProgress(entry, basics, manualMode, semKey) };
  });
  const doneCount = cards.filter((c) => c.done).length;

  const basics = semesterBasics({ teacherId, range, sources, settings: liveSettings, systemData: !manualMode });
  const sem = manualMode
    ? computeManualSemester({ teacherId, range, sources, settings: liveSettings })
    : computeSystemSemester({ teacherId, range, sources, events, assignments, exclusions, settings: liveSettings, typeMap, teacherIds });

  const put = (k, v) => {
    if (locked) return;
    setDraft((d) => {
      const next = { ...d, [k]: v };
      pending.current = { semKey, teacherId, entry: next };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
      setSaveState({ status: "dirty", at: null });
      return next;
    });
  };
  const num = (v) => (v === "" ? "" : Number(v));
  const numInput = (k, props = {}) => (
    <input style={S.smallInput} type="number" min="0" disabled={locked} value={draft[k] ?? ""} onChange={(e) => put(k, num(e.target.value))} {...props} />
  );
  const campLabel = semKey === "fall" ? "寒假營隊報名" : "暑假營隊報名";
  const taught = draft.taught !== false;

  function nextTeacher() {
    const idx = teachers.findIndex((t) => t.id === teacherId);
    if (teachers[idx + 1]) setTeacherId(teachers[idx + 1].id);
  }
  const saveText = {
    idle: "邊填邊自動儲存",
    dirty: "輸入中…",
    saving: "儲存中…",
    saved: `已自動儲存 ${saveState.at ? saveState.at.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : ""}`,
    error: "儲存失敗，請檢查網路",
  }[saveState.status];

  function addMove() {
    if (!newMove.date || !newMove.name.trim()) return;
    put("moves", [...(draft.moves || []), { ...newMove, name: newMove.name.trim(), deduct: newMove.type === "退班" ? newMove.deduct : false }]);
    setNewMove({ date: "", name: "", type: "退班", reason: "", deduct: true });
  }

  const step = (n, title, children, note) => (
    <div style={S.catCard}>
      <div style={S.rowBetween}><strong>{n}. {title}</strong>{note && <span style={S.muted}>{note}</span>}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );

  return (
    <>
      <section style={S.section}>
        <div style={S.actionRow}>
          {["spring", "fall"].map((k) => (
            <button key={k} type="button" onClick={() => setSemKey(k)} style={k === semKey ? S.primaryButton : S.ghostButton}>
              {info[k].label}{k === "spring" && settings.springMode === "manual" ? "（手動）" : ""}
            </button>
          ))}
          <span style={S.muted}>已完成 {doneCount}/{teachers.length} 位</span>
        </div>
        <div style={{ ...S.cardGrid, marginTop: 10 }}>
          {cards.map((c) => (
            <button
              key={c.t.id}
              type="button"
              onClick={() => setTeacherId(c.t.id)}
              style={{ ...S.folder, textAlign: "left", ...(c.t.id === teacherId ? S.folderOn : {}) }}
            >
              <strong>
                {teacherName(c.t)}
                {c.entry.taught === false
                  ? <span style={{ ...S.chip, ...S.chipMuted, marginLeft: 6 }}>未帶班</span>
                  : c.done
                    ? <span style={{ ...S.chip, ...S.chipOk, marginLeft: 6 }}>完成</span>
                    : <span style={{ ...S.chip, ...S.chipWarn, marginLeft: 6 }}>缺 {c.missing.length}</span>}
              </strong>
              <span style={S.muted}>{c.done ? "—" : `缺：${c.missing.join("、")}`}</span>
            </button>
          ))}
        </div>
      </section>

      {!manualMode && (
        <section style={S.section}>
          <h2 style={S.sectionTitle}>{range.label} 列入計分的指標</h2>
          <p style={S.hint}>這學期沒辦法做的項目取消勾選，該類別會用其他指標平均。注意：事件類 0 次就是 100 分，沒有從頭記錄就該取消。</p>
          <div style={S.actionRow}>
            {TOGGLEABLE_INDICATORS.map((ind) => {
              const off = new Set(settings.disabledBySem?.[semKey] || []);
              const yearOff = (settings.disabledIndicators || []).includes(ind.key);
              return (
                <label key={ind.key} style={{ ...S.muted, display: "flex", gap: 4, alignItems: "center", opacity: yearOff ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    disabled={locked || yearOff}
                    checked={!off.has(ind.key) && !yearOff}
                    onChange={(e) => {
                      const next = new Set(off);
                      if (e.target.checked) next.delete(ind.key);
                      else next.add(ind.key);
                      onSaveSemToggles(semKey, [...next]);
                    }}
                  />
                  {ind.name}{yearOff && "（年度設定已關）"}
                </label>
              );
            })}
          </div>
        </section>
      )}

      {!manualMode && (
        <SingleDayTable
          key={semKey}
          semKey={semKey}
          label={range.label}
          settings={settings}
          teachers={teachers}
          sources={sources}
          locked={locked}
          onSave={onSaveSingleDay}
        />
      )}

      {teacherId && (
        <section style={S.section}>
          <h2 style={S.sectionTitle}>
            {teacherName(teachers.find((t) => t.id === teacherId))}・{range.label}
            <span style={{ ...S.chip, ...(manualMode ? S.chipMuted : S.chipBlue) }}>{manualMode ? "手動學期" : "系統學期"}</span>
          </h2>
          {locked && <p style={S.hint}>此年度已封存，只能查看。</p>}

          {step(1, "任教狀態", (
            <div style={S.actionRow}>
              <label style={S.muted}><input type="radio" checked={taught} disabled={locked} onChange={() => put("taught", true)} /> 有帶班</label>
              <label style={S.muted}><input type="radio" checked={!taught} disabled={locked} onChange={() => put("taught", false)} /> 這學期沒帶（新進／請長假）</label>
            </div>
          ), !taught ? "年度分數只算另一學期" : null)}

          {taught && (
            <>
              {step(2, "帶班年級", (
                <select style={S.rangeSelect} disabled={locked} value={draft.grade ?? ""} onChange={(e) => put("grade", num(e.target.value))}>
                  <option value="">{basics.grade ? `預設 ${basics.grade} 年級（看班級名稱）` : "請選擇"}</option>
                  {[1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{g} 年級</option>)}
                </select>
              ), `營隊目標 ${settings.campTargets?.[basics.grade] ?? "—"}%`)}

              {step(3, "班上人數與進退班", (
                <>
                  <div style={S.actionRow}>
                    <span>開學人數</span>
                    {numInput("start", { placeholder: basics.startFromSystem ? String(basics.start) : "" })}
                    {basics.startFromSystem && !hasVal(draft.start) && <span style={S.muted}>（系統抓開學名單 {basics.start} 人，可改）</span>}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <MovesList
                      moves={basics.moves}
                      locked={locked}
                      onWithdrawal={onWithdrawal}
                      onRemove={(i) => put("moves", (draft.moves || []).filter((_, idx) => idx !== i))}
                    />
                  </div>
                  {!locked && (
                    <div style={{ ...S.actionRow, marginTop: 8 }}>
                      <input style={{ ...S.smallInput, width: 140 }} type="date" value={newMove.date} min={range.from} max={range.to} onChange={(e) => setNewMove({ ...newMove, date: e.target.value })} />
                      <select style={S.rangeSelect} value={newMove.type} onChange={(e) => setNewMove({ ...newMove, type: e.target.value })}>
                        <option>退班</option>
                        <option>進班</option>
                      </select>
                      <input style={{ ...S.smallInput, width: 90 }} placeholder="學生" value={newMove.name} onChange={(e) => setNewMove({ ...newMove, name: e.target.value })} />
                      {newMove.type === "退班" && (
                        <>
                          <input style={{ ...S.smallInput, width: 150 }} placeholder="原因" value={newMove.reason} onChange={(e) => setNewMove({ ...newMove, reason: e.target.value })} />
                          <label style={S.muted}><input type="checkbox" checked={newMove.deduct} onChange={(e) => setNewMove({ ...newMove, deduct: e.target.checked })} /> 列入扣分</label>
                        </>
                      )}
                      <button type="button" style={S.ghostButton} onClick={addMove}>＋ 加一筆</button>
                    </div>
                  )}
                  <p style={S.hint}>
                    目前人數 = 開學 {basics.start ?? "?"} ＋ 進班 {basics.joins} − 退班 {basics.leaves.length} = <strong>{basics.size ?? "?"}</strong> 人
                    {!manualMode && "・系統名單裡的進退班會自動列出，只要補原因"}
                  </p>
                </>
              ))}

              {manualMode
                ? step(4, "每月考核（代替 A＋B＋C）", (
                  <div style={S.actionRow}>
                    {["2月", "3月", "4月", "5月", "6月"].map((m, i) => (
                      <label key={m} style={S.muted}>
                        {m}{" "}
                        <input style={S.smallInput} type="number" min="1" max={settings.monthlyMax ?? 5} step="0.5" disabled={locked} value={(draft.monthly || [])[i] ?? ""} onChange={(e) => {
                          const next = [...(draft.monthly || [])];
                          next[i] = num(e.target.value);
                          put("monthly", next);
                        }} />
                      </label>
                    ))}
                  </div>
                ), `平均 ${r1(sem.monthlyRaw)}／${sem.monthlyMax ?? 5} → ${r1(sem.monthlyAvg)} 分`)
                : step(4, "班級平均成績（期中、期末，各四科）", (
                  <>
                    {[["mid", "期中"], ["fin", "期末"]].map(([key, label]) => (
                      <div key={key} style={{ ...S.actionRow, marginBottom: 6 }}>
                        <span style={{ width: 40 }}>{label}</span>
                        {SUBJECTS.map((n) => {
                          const v = draft[key]?.[n];
                          const low = hasVal(v) && sem.baseline && Number(v) < sem.baseline;
                          return (
                            <label key={n} style={S.muted}>
                              {n}{" "}
                              <input
                                style={{ ...S.smallInput, ...(low ? { borderColor: "#c0392b", color: "#c0392b" } : {}) }}
                                type="number" min="0" max="100" step="0.1" disabled={locked}
                                value={v ?? ""}
                                onChange={(e) => put(key, { ...(draft[key] || {}), [n]: num(e.target.value) })}
                              />
                            </label>
                          );
                        })}
                      </div>
                    ))}
                    <p style={S.hint}>照教室系統各科班平均填。{sem.adjusted ? "本學期調整基準線" : `${basics.grade || "?"} 年級基準線`} {sem.baseline ?? "—"} 分：每次從 100 分起扣，哪一科低於基準線就扣「差幾分 × {settings.subjectPenalty ?? 3}」，高分科不補分；期中、期末再平均。</p>
                    <div style={{ ...S.actionRow, marginTop: 4 }}>
                      <span style={S.muted}>本學期基準線調整（例外）</span>
                      <input style={S.smallInput} type="number" min="0" max="100" disabled={locked}
                        placeholder={String(settings.baseline?.[basics.grade] ?? "")}
                        value={draft.baselineOverride ?? ""} onChange={(e) => put("baselineOverride", num(e.target.value))} />
                      {hasVal(draft.baselineOverride) && (
                        <input style={{ ...S.smallInput, width: 260, ...(String(draft.baselineReason || "").trim() ? {} : { borderColor: "#c0392b" }) }}
                          placeholder="調整原因（必填，例如：班上程度落後、起點平均 75）" disabled={locked}
                          value={draft.baselineReason ?? ""} onChange={(e) => put("baselineReason", e.target.value)} />
                      )}
                    </div>
                    {sem.adjusted && <p style={{ ...S.hint, color: "#b26a00" }}>⚠ 這位老師本學期用調整後的基準線，總覽與個別教師都會標示。</p>}
                  </>
                ), `得分 ${r1(sem.examRate)}`)}

              {step(5, campLabel, (
                <>
                  {semKey === "spring" && (
                    <label style={{ ...S.muted, display: "flex", gap: 4, alignItems: "center", marginBottom: 6 }}>
                      <input type="checkbox" disabled={locked} checked={campExcluded(draft, semKey, basics.grade)} onChange={(e) => put("noCamp", e.target.checked)} />
                      畢業班，不計暑假營隊（六年級預設勾選；五六混班請取消，填五年級的報名率）
                    </label>
                  )}
                  {!campExcluded(draft, semKey, basics.grade) && <div style={S.actionRow}>
                    <span>報名率</span>
                    <input style={S.smallInput} type="number" min="0" max="100" step="0.1" disabled={locked}
                      placeholder={hasVal(draft.camp) && basics.size ? String(Math.round((draft.camp / basics.size) * 1000) / 10) : ""}
                      value={draft.campRate ?? ""} onChange={(e) => put("campRate", num(e.target.value))} />
                    <span>%</span>
                  </div>}
                  <p style={S.hint}>照報表填班級報名率；{basics.grade || "?"} 年級目標 {settings.campTargets?.[basics.grade] ?? "—"}%，達標 100 分，未達按比例。</p>
                </>
              ), `得分 ${r1(sem.campScore)}`)}

              {!manualMode && step(6, "單日課程（看上方總表，自動算）", (
                <p style={S.muted}>
                  班上報名 {sem.courseCount ?? 0} 人次／上課當天人數合計 {sem.courseSize || "?"} 人（{sem.courseSize ? Math.round((sem.courseCount / sem.courseSize) * 1000) / 10 : 0}%）・全校平均 {Math.round((sem.courseAvg || 0) * 1000) / 10}%
                  {sem.courseAvg ? "" : "（上方總表還沒填完：每堂課要有全校人數，先不計分）"}
                </p>
              ), `得分 ${r1(sem.courseScore)}`)}
            </>
          )}

          <div style={{ ...S.rowBetween, marginTop: 12 }}>
            <span style={S.muted}>這學期試算 <strong style={{ fontSize: 18, color: "#413832" }}>{taught ? r1(sem.score) : "不計"}</strong></span>
            {!locked && (
              <span style={S.actionRow}>
                <span style={saveState.status === "error" ? S.minusText : S.muted}>
                  {saveState.status === "saved" ? "✓ " : ""}{saveText}
                  {saveState.status === "error" && <button type="button" style={S.linkButton} onClick={flush}>重試</button>}
                </span>
                <button type="button" style={S.primaryButton} onClick={nextTeacher}>下一位老師 →</button>
              </span>
            )}
          </div>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------
// 年度設定（只套用這個年度）
// ---------------------------------------------------------


function YearSettingsPanel({ info, settings, types, teachers, locked, saving, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [typeDraft, setTypeDraft] = useState(types);
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => setTypeDraft(types), [types]);

  const set = (path, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let cur = next;
      for (let i = 0; i < path.length - 1; i += 1) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      return next;
    });
  };
  const num = (v) => (v === "" ? "" : Number(v));
  const wSum = ["A", "B", "C", "D"].reduce((a, k) => a + Number(draft.w[k] || 0), 0);
  const field = (label, path, value, step = 1) => (
    <label style={S.label}>
      {label}
      <input style={S.input} type="number" step={step} value={value ?? ""} disabled={locked} onChange={(e) => set(path, num(e.target.value))} />
    </label>
  );

  return (
    <section style={S.section}>
      <h2 style={S.sectionTitle}>{info.label} 的設定</h2>
      <p style={S.hint}>這份設定只套用 {info.label}（{info.semesters}），改下一年度不會影響這裡。{locked && "已封存，不能修改。"}</p>

      <h3 style={S.subTitle}>四大類比重 <span style={wSum === 100 ? S.muted : S.minusText}>合計 {wSum}%</span></h3>
      <div style={S.settingsGrid}>
        {field("A 教學成效 %", ["w", "A"], draft.w.A)}
        {field("B 班級經營與親師 %", ["w", "B"], draft.w.B)}
        {field("C 行政與配合 %", ["w", "C"], draft.w.C)}
        {field("D 招生貢獻 %", ["w", "D"], draft.w.D)}
      </div>

      <h3 style={S.subTitle}>學期</h3>
      <div style={S.settingsGrid}>
        {field(`${info.spring.label} 佔 %（其餘為 ${info.fall.label}）`, ["springWeight"], draft.springWeight)}
        <label style={S.label}>
          {info.spring.label} 資料來源
          <select style={S.input} value={draft.springMode} disabled={locked} onChange={(e) => set(["springMode"], e.target.value)}>
            <option value="manual">手動輸入（每月考核＋營隊）</option>
            <option value="system">系統計算</option>
          </select>
        </label>
      </div>

      <p style={S.hint}>每學期的人數、進退班、成績、營隊報名都在「學期資料」分頁填。</p>

      <h3 style={S.subTitle}>指標規則</h3>
      <div style={S.settingsGrid}>
        {field("成績基準線：三年級", ["baseline", "3"], draft.baseline[3])}
        {field("四年級", ["baseline", "4"], draft.baseline[4])}
        {field("五年級", ["baseline", "5"], draft.baseline[5])}
        {field("六年級", ["baseline", "6"], draft.baseline[6])}
        {field("成績每科低於基準 1 分扣", ["subjectPenalty"], draft.subjectPenalty, 0.5)}
        {field("任務逾期每天扣", ["perDay"], draft.perDay, 0.5)}
        {field("臨時請假／遲到每次扣", ["attendancePenalty"], draft.attendancePenalty)}
        {field("營隊報名率目標：三年級 %", ["campTargets", "3"], draft.campTargets?.[3])}
        {field("四年級 %", ["campTargets", "4"], draft.campTargets?.[4])}
        {field("五年級 %", ["campTargets", "5"], draft.campTargets?.[5])}
        {field("六年級 %", ["campTargets", "6"], draft.campTargets?.[6])}
        {field("事件 0 次得分", ["countScore", 0], draft.countScore[0])}
        {field("事件 1 次得分", ["countScore", 1], draft.countScore[1])}
        {field("事件 2 次以上得分", ["countScore", 2], draft.countScore[2])}
        {field("額外加分上限", ["bonusCap"], draft.bonusCap)}
      </div>

      <h3 style={S.subTitle}>上班時間（算遲到用）</h3>
      <p style={S.hint}>每位老師星期幾的上班時間；空白的那天不算遲到。打卡名字跟系統不同時，在「打卡名字」填打卡檔上的名字。</p>
      <div style={{ marginTop: 6 }}>
        <strong style={{ fontSize: 14 }}>遲到扣分級距</strong>
        {(draft.lateTiers?.length ? draft.lateTiers : DEFAULT_LATE_TIERS).map((t, i, arr) => {
          const prev = i === 0 ? 1 : Number(arr[i - 1].upTo) + 1;
          const tiers = draft.lateTiers?.length ? draft.lateTiers : DEFAULT_LATE_TIERS.map((x) => ({ ...x }));
          const put = (k, v) => set(["lateTiers"], tiers.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
          const last = i === arr.length - 1;
          return (
            <div key={i} style={{ ...S.actionRow, marginTop: 4 }}>
              <span style={S.muted}>晚 {prev} 分</span>
              {last ? <span style={S.muted}>以上</span> : (
                <>
                  <span style={S.muted}>～</span>
                  <input style={S.smallInput} type="number" min="1" disabled={locked} value={t.upTo} onChange={(e) => put("upTo", num(e.target.value))} />
                  <span style={S.muted}>分</span>
                </>
              )}
              <span style={S.muted}>扣</span>
              <input style={S.smallInput} type="number" min="0" step="0.5" disabled={locked} value={t.points} onChange={(e) => put("points", num(e.target.value))} />
            </div>
          );
        })}
      </div>
      <div style={{ ...S.tableWrap, marginTop: 8 }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>老師</th>
              {["一", "二", "三", "四", "五"].map((d) => <th key={d} style={S.thNum}>{d}</th>)}
              <th style={S.th}>打卡名字</th>
            </tr>
          </thead>
          <tbody>
            {(teachers || []).map((t) => (
              <tr key={t.id}>
                <td style={S.td}>{teacherName(t)}</td>
                {[1, 2, 3, 4, 5].map((wd) => (
                  <td key={wd} style={S.tdNum}>
                    <input
                      style={{ ...S.smallInput, width: 96 }}
                      type="time"
                      disabled={locked}
                      value={draft.workSchedule?.[t.id]?.[wd] || ""}
                      onChange={(e) => set(["workSchedule"], { ...(draft.workSchedule || {}), [t.id]: { ...(draft.workSchedule?.[t.id] || {}), [wd]: e.target.value } })}
                    />
                  </td>
                ))}
                <td style={S.td}>
                  <input
                    style={{ ...S.smallInput, width: 110 }}
                    disabled={locked}
                    placeholder={teacherName(t)}
                    value={draft.punchNames?.[t.id] || ""}
                    onChange={(e) => set(["punchNames"], { ...(draft.punchNames || {}), [t.id]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10 }}>
        <strong style={{ fontSize: 14 }}>不算遲到的期間（寒暑假）</strong>
        <p style={S.hint}>營隊管理裡的冬令營、夏令營日期會自動排除；營隊以外的假期在這裡加。</p>
        {(draft.noLateRanges || []).map((x, i) => {
          const list = draft.noLateRanges || [];
          const put = (k, v) => set(["noLateRanges"], list.map((y, j) => (j === i ? { ...y, [k]: v } : y)));
          return (
            <div key={i} style={{ ...S.actionRow, marginTop: 4 }}>
              <input style={{ ...S.smallInput, width: 100 }} disabled={locked} value={x.name || ""} placeholder="名稱" onChange={(e) => put("name", e.target.value)} />
              <input style={{ ...S.smallInput, width: 150 }} type="date" disabled={locked} value={x.from || ""} onChange={(e) => put("from", e.target.value)} />
              <span style={S.muted}>～</span>
              <input style={{ ...S.smallInput, width: 150 }} type="date" disabled={locked} value={x.to || ""} onChange={(e) => put("to", e.target.value)} />
              {!locked && <button type="button" style={S.linkButton} onClick={() => set(["noLateRanges"], list.filter((_, j) => j !== i))}>刪除</button>}
            </div>
          );
        })}
        {!locked && (
          <button type="button" style={{ ...S.ghostButton, marginTop: 6 }} onClick={() => set(["noLateRanges"], [...(draft.noLateRanges || []), { name: "", from: "", to: "" }])}>＋ 新增期間</button>
        )}
      </div>

      <h3 style={S.subTitle}>請假扣分（出勤，每天扣幾分；8 小時算 1 天）</h3>
      <div style={S.settingsGrid}>
        {LEAVE_TYPES.map((t) => <div key={t} style={{ display: "contents" }}>{field(t, ["leaveWeights", t], draft.leaveWeights?.[t])}</div>)}
      </div>
      <p style={S.hint}>{PROTECTED_LEAVE_TYPES.join("、")}只記錄，不扣分。</p>

      <h3 style={S.subTitle}>抽查項目與扣分</h3>
      <p style={S.hint}>抽查時可勾選的問題；改名或扣分會影響這年度所有抽查的計算。</p>
      {Object.entries(INSPECTION_TYPES).map(([type, title]) => {
        const items = draft.inspectionItems?.[type] || [];
        const setItems = (next) => set(["inspectionItems"], { ...(draft.inspectionItems || {}), [type]: next });
        return (
          <div key={type} style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 14 }}>{title}</strong>
            {items.map((it, i) => (
              <div key={it.id} style={{ ...S.actionRow, marginTop: 4 }}>
                <input style={{ ...S.smallInput, width: 260 }} disabled={locked} value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <span style={S.muted}>扣</span>
                <input style={S.smallInput} type="number" min="0" disabled={locked} value={it.points} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, points: num(e.target.value) } : x)))} />
                {!locked && <button type="button" style={S.linkButton} onClick={() => setItems(items.filter((_, j) => j !== i))}>刪除</button>}
              </div>
            ))}
            {!locked && (
              <button type="button" style={{ ...S.ghostButton, marginTop: 6 }} onClick={() => setItems([...items, { id: `${type}${Date.now()}`, name: "新項目", points: 5 }])}>＋ 新增項目</button>
            )}
          </div>
        );
      })}

      <h3 style={S.subTitle}>本年度列入計分的指標</h3>
      <p style={S.hint}>資料還不完整的指標可以先取消勾選，該類別會用其他指標平均。</p>
      <div style={S.actionRow}>
        {TOGGLEABLE_INDICATORS.map((ind) => {
          const off = new Set(draft.disabledIndicators || []);
          return (
            <label key={ind.key} style={{ ...S.muted, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" disabled={locked} checked={!off.has(ind.key)} onChange={(e) => {
                const next = new Set(off);
                if (e.target.checked) next.delete(ind.key);
                else next.add(ind.key);
                set(["disabledIndicators"], [...next]);
              }} />
              {ind.name}
            </label>
          );
        })}
      </div>

      <h3 style={S.subTitle}>年終</h3>
      <div style={S.settingsGrid}>
        {field("基本月數", ["base_months"], draft.base_months, 0.1)}
        {field("組長加給（元）", ["leader_bonus"], draft.leader_bonus, 500)}
      </div>

      <h3 style={S.subTitle}>總分級距 → 係數</h3>
      {(draft.bands || []).map((band, i) => (
        <div key={i} style={S.inlineGroup}>
          {Number(band.min) <= -999 ? "其餘" : (
            <>
              <input style={S.smallInput} type="number" disabled={locked} value={band.min} onChange={(e) => set(["bands", i, "min"], num(e.target.value))} />
              分以上
            </>
          )}
          → 係數
          <input style={S.smallInput} type="number" step="0.1" disabled={locked} value={band.factor} onChange={(e) => set(["bands", i, "factor"], num(e.target.value))} />
        </div>
      ))}

      <h3 style={S.subTitle}>事件分數（加分項目與扣分事件）</h3>
      {typeDraft.filter((t) => !t.per_day).map((type) => (
        <div key={type.id} style={S.inlineGroup}>
          <span style={{ minWidth: "80px" }}>{type.name}</span>
          {type.direction === "plus" ? "+" : "−"}
          <input style={S.smallInput} type="number" step="0.5" min="0" disabled={locked} value={type.points}
            onChange={(e) => setTypeDraft((prev) => prev.map((t) => (t.id === type.id ? { ...t, points: e.target.value } : t)))} />
          分
        </div>
      ))}

      {!locked && (
        <div style={S.modalActions}>
          <button type="button" style={S.primaryButton} disabled={saving || wSum !== 100} onClick={() => onSave(draft, typeDraft)}>
            {saving ? "儲存中…" : wSum !== 100 ? "比重合計要等於 100%" : "儲存年度設定"}
          </button>
        </div>
      )}
    </section>
  );
}


const S = {
  folders: { display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" },
  folder: { border: "1px solid #ece4da", background: "#fffdf9", borderRadius: "14px", padding: "10px 14px", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: "3px", fontFamily: "inherit", fontSize: "14px", color: "#413832", minWidth: "200px" },
  folderOn: { borderColor: "#6b5644", boxShadow: "0 0 0 2px rgba(107,86,68,0.15)" },
  lockBar: { background: "#eef2f7", border: "1px solid #d3dbe6", color: "#4a5a70", borderRadius: "14px", padding: "10px 14px", fontSize: "13px", marginBottom: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  chipBlue: { background: "#eef2f7", color: "#4a5a70" },
  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "16px" },
  catCard: { border: "1px solid #ece4da", borderRadius: "14px", padding: "12px 14px", marginBottom: "10px", fontSize: "13px", color: "#413832", display: "flex", flexDirection: "column", gap: "4px" },
  meter: { height: "6px", background: "#f1ebe4", borderRadius: "99px", overflow: "hidden", margin: "4px 0" },
  meterBar: { display: "block", height: "100%", background: "#6b5644", borderRadius: "99px" },
  indRow: { display: "flex", justifyContent: "space-between", gap: "10px", padding: "5px 0", borderTop: "1px dashed #f0e9e0" },
  toolbar: { display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "16px" },
  rangeSelect: { border: "1px solid #ded4c9", background: "#fffdf9", borderRadius: "12px", padding: "9px 12px", fontSize: "13px", color: "#574c43" },
  primaryButton: { border: 0, background: "#6b5644", color: "#fff", borderRadius: "12px", padding: "9px 15px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  ghostButton: { border: "1px solid #ded4c9", background: "#fffdf9", color: "#574c43", borderRadius: "12px", padding: "8px 13px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  dangerButton: { border: "1px solid #efd3cf", background: "#fff4f2", color: "#a24e47", borderRadius: "12px", padding: "8px 13px", fontSize: "13px", fontWeight: 700, cursor: "pointer" },
  textButton: { border: 0, background: "transparent", color: "#8b6f55", fontWeight: 700, fontSize: "13px", cursor: "pointer", padding: "12px 0" },
  linkButton: { border: 0, background: "transparent", color: "#8b6f55", fontSize: "12px", cursor: "pointer", padding: "0 4px", textDecoration: "underline" },
  linkGroup: { display: "flex", gap: "2px" },
  errorBanner: { background: "#fff4f2", border: "1px solid #efd3cf", color: "#a24e47", borderRadius: "14px", padding: "12px 15px", marginBottom: "16px", fontSize: "13px" },
  successBanner: { background: "#f4f8f2", border: "1px solid #d7e4d1", color: "#5c7453", borderRadius: "14px", padding: "12px 15px", marginBottom: "16px", fontSize: "13px" },
  section: { background: "#fffdf9", border: "1px solid #ece4da", borderRadius: "20px", padding: "20px", marginBottom: "18px" },
  sectionTitle: { margin: "0 0 6px", fontSize: "17px", color: "#413832", display: "flex", alignItems: "center", gap: "8px" },
  subTitle: { margin: "18px 0 8px", fontSize: "14px", color: "#413832" },
  hint: { margin: "0 0 12px", color: "#8a7f76", fontSize: "12px", lineHeight: 1.6 },
  countBadge: { background: "#a24e47", color: "#fff", borderRadius: "999px", fontSize: "11px", padding: "2px 8px" },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" },
  disputeCard: { border: "1px solid #efd3cf", background: "#fffaf8", borderRadius: "16px", padding: "14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#413832" },
  reasonBox: { background: "#fff", border: "1px dashed #e3c9c4", borderRadius: "10px", padding: "8px 10px" },
  rowBetween: { display: "flex", justifyContent: "space-between", gap: "8px" },
  actionRow: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  inlineGroup: { display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", color: "#574c43", marginBottom: "6px", flexWrap: "wrap" },
  smallInput: { width: "64px", border: "1px solid #ded4c9", borderRadius: "8px", padding: "5px 7px", fontSize: "13px" },
  salaryInput: { width: "90px", border: "1px solid #ded4c9", borderRadius: "8px", padding: "5px 7px", fontSize: "13px", textAlign: "right" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "13px", color: "#413832" },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #ece4da", color: "#8a7f76", fontWeight: 700, whiteSpace: "nowrap" },
  thNum: { textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #ece4da", color: "#8a7f76", fontWeight: 700, whiteSpace: "nowrap" },
  td: { padding: "9px 10px", borderBottom: "1px solid #f3eee8", whiteSpace: "nowrap" },
  tdNum: { padding: "9px 10px", borderBottom: "1px solid #f3eee8", textAlign: "right", whiteSpace: "nowrap" },
  clickRow: { cursor: "pointer" },
  leaderTag: { marginLeft: "6px", fontSize: "10px", background: "#f1ebe4", color: "#6b5644", borderRadius: "999px", padding: "2px 6px" },
  alertTag: { marginLeft: "6px", fontSize: "10px", background: "#fff4f2", color: "#a24e47", borderRadius: "999px", padding: "2px 6px" },
  sourceTag: { marginLeft: "6px", fontSize: "10px", background: "#eef2f7", color: "#4a5a70", borderRadius: "999px", padding: "2px 6px" },
  plusText: { color: "#2f855a" },
  minusText: { color: "#c53030" },
  muted: { color: "#8a7f76", fontSize: "12px" },
  errorText: { color: "#a24e47", fontSize: "12px" },
  empty: { padding: "26px", textAlign: "center", color: "#8a7f76", fontSize: "13px" },
  list: { display: "flex", flexDirection: "column" },
  listRow: { display: "flex", gap: "12px", padding: "10px 4px", borderBottom: "1px solid #f3eee8", fontSize: "13px", color: "#413832", alignItems: "flex-start" },
  voidRow: { opacity: 0.45 },
  listDate: { minWidth: "44px", color: "#8a7f76" },
  listMain: { flex: 1, display: "flex", flexDirection: "column", gap: "3px" },
  listSide: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", whiteSpace: "nowrap" },
  chip: { fontSize: "11px", borderRadius: "999px", padding: "2px 8px", fontWeight: 700 },
  chipOk: { background: "#f4f8f2", color: "#5c7453" },
  chipWarn: { background: "#fdf6e7", color: "#a1741f" },
  chipAlert: { background: "#fff4f2", color: "#a24e47" },
  chipMuted: { background: "#f1eeea", color: "#8a7f76" },
  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px", marginBottom: "14px" },
  stat: { background: "#f7f1e9", borderRadius: "14px", padding: "12px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#8a7f76" },
  overlay: { position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
  backdrop: { position: "absolute", inset: 0, border: 0, background: "rgba(40, 30, 22, 0.35)", cursor: "pointer" },
  modal: { position: "relative", background: "#fffdf9", borderRadius: "20px", padding: "22px", width: "min(460px, 100%)", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 20px 60px rgba(40,30,22,0.2)" },
  modalTitle: { margin: "0 0 8px", fontSize: "18px", color: "#413832" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" },
  label: { fontSize: "12px", color: "#8a7f76", fontWeight: 700, marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" },
  input: { border: "1px solid #ded4c9", borderRadius: "10px", padding: "9px 11px", fontSize: "14px", background: "#fff", color: "#413832", fontFamily: "inherit" },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "6px" },
  typeButton: { border: "1px solid transparent", borderRadius: "10px", padding: "8px 10px", fontSize: "13px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: "6px", fontWeight: 700 },
  typeMinus: { background: "#fff4f2", color: "#a24e47" },
  typePlus: { background: "#f4f8f2", color: "#5c7453" },
  typeSelected: { borderColor: "#6b5644", boxShadow: "0 0 0 2px rgba(107,86,68,0.15)" },
  typePoints: { fontWeight: 400, opacity: 0.8 },
  previewLine: { fontSize: "13px", color: "#574c43", marginTop: "8px" },
  settingsBox: { borderTop: "1px solid #ece4da", paddingTop: "12px" },
  settingsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" },
};
