import { useCallback, useEffect, useMemo, useState } from "react";

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
  computeTeacherYear,
  evaluationYearInfo,
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
  const [overdueDays, setOverdueDays] = useState(1);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const type = activeTypes.find((t) => t.id === typeId);
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
        </div>

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
              ? "・只通知老師"
              : type.per_day
                ? "・直接記分，不通知老師"
                : "・老師要在 LINE 確認"}
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

const SOURCE_TAG = { 系統: "sys", 事件: "ev", 抽查: "ins" };

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
      computeTeacherYear({ teacher, info, sources, events, assignments, exclusions, settings, typeMap })
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
    try {
      await saveWithdrawal(item.id, { reason: item.reason, deduct: item.deduct, ...patch });
      const next = { ...sources };
      const list = next.withdrawals.filter((w) => w.class_student_id !== item.id);
      list.push({ class_student_id: item.id, reason: patch.reason ?? item.reason, deduct: patch.deduct ?? item.deduct });
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
          年度總分 = {springLabel} × {settings.springWeight}% ＋ {fallLabel} × {100 - settings.springWeight}% ＋ 額外加分（上限 {settings.bonusCap}）
        </span>
        <span style={S.actionRow}>
          <button type="button" style={S.ghostButton} onClick={() => setFormOpen(true)}>＋ 登記事件</button>
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
                        <td style={S.tdNum}>{r1(cats.A)}</td>
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
          courses={sources?.courses || []}
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

function SemesterCard({ title, sem, settings, perDay, onToggleExclusion, onWithdrawal, locked }) {
  if (sem.mode === "manual") {
    return (
      <div style={S.section}>
        <h2 style={S.sectionTitle}>{title}<span style={{ ...S.chip, ...S.chipMuted }}>手動輸入</span></h2>
        <p style={S.hint}>系統尚未上線，用每月考核與營隊報名數；在「年度設定」輸入。學期分數 <strong>{r1(sem.score)}</strong></p>
        <div style={S.catCard}>
          <div style={S.rowBetween}><strong>每月考核（代替 A＋B＋C）</strong><span style={S.muted}>平均 <strong>{r1(sem.monthlyAvg)}</strong></span></div>
          <div style={S.muted}>{(sem.monthly || []).length ? sem.monthly.map((m, i) => `${i + 2}月 ${m || "—"}`).join("・") : "尚未輸入"}</div>
        </div>
        <div style={S.catCard}>
          <div style={S.rowBetween}><strong>D 營隊報名率</strong><span style={S.muted}><strong>{r1(sem.campScore)}</strong> 分</span></div>
          <div style={S.muted}>{sem.campTotal ? `${sem.campSigned || 0}/${sem.campTotal}・目標 ${settings.campTarget}%` : "尚未輸入"}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={S.section}>
      <h2 style={S.sectionTitle}>{title}<span style={{ ...S.chip, ...S.chipBlue }}>系統計算</span></h2>
      <p style={S.hint}>學期分數 <strong>{r1(sem.score)}</strong></p>
      {["A", "B", "C", "D"].map((k) => (
        <CategoryCard key={k} code={k} name={CAT_NAMES[k]} weight={settings.w[k]} score={sem.catScores[k]} indicators={sem.categories[k]} />
      ))}

      <h3 style={S.subTitle}>行政配合明細</h3>
      <AdminItemList items={sem.admin.items} perDay={perDay} onToggle={onToggleExclusion} onlyProblems />

      <h3 style={S.subTitle}>退班登記</h3>
      {sem.leftList.length ? (
        <div style={S.list}>
          {sem.leftList.map((l) => (
            <div key={l.id} style={S.listRow}>
              <div style={S.listDate}>{l.leftAt.slice(5).replace("-", "/")}</div>
              <div style={S.listMain}>
                <div>{l.studentName}{!l.recorded && <span style={{ ...S.chip, ...S.chipWarn, marginLeft: 6 }}>待填原因</span>}</div>
                <input
                  style={{ ...S.input, padding: "6px 9px", fontSize: "13px" }}
                  defaultValue={l.reason}
                  placeholder="退班原因（例如搬家、轉班、對帶班不滿）"
                  disabled={locked}
                  onBlur={(e) => e.target.value !== l.reason && onWithdrawal(l, { reason: e.target.value })}
                />
              </div>
              <label style={{ ...S.muted, display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={l.deduct} disabled={locked} onChange={(e) => onWithdrawal(l, { deduct: e.target.checked })} />
                列入扣分
              </label>
            </div>
          ))}
        </div>
      ) : (
        <div style={S.empty}>這學期沒有退班。</div>
      )}
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
            年度總分 <strong style={{ fontSize: 18, color: "#413832" }}>{r1(row.total)}</strong>・係數 {row.factor ?? "—"}・加分 {row.bonus}
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
// 年度設定（只套用這個年度）
// ---------------------------------------------------------

const MONTHS_SPRING = ["2月", "3月", "4月", "5月", "6月", "7月"];

function YearSettingsPanel({ info, settings, types, teachers, courses, locked, saving, onSave }) {
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
  const courseSet = new Set(draft.courseIds || []);

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

      {draft.springMode === "manual" && (
        <>
          <h3 style={S.subTitle}>{info.spring.label} 手動資料</h3>
          <p style={S.hint}>每月考核填 0～100 分，沒有的月份留白；營隊填班上報名人數／班上總人數。</p>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>老師</th>
                  {MONTHS_SPRING.slice(0, 5).map((m) => <th key={m} style={S.thNum}>{m}</th>)}
                  <th style={S.thNum}>營隊報名</th>
                  <th style={S.thNum}>班上人數</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => {
                  const m = draft.manual?.[t.id] || {};
                  const monthly = m.monthly || [];
                  const setManual = (key, value) => set(["manual"], { ...(draft.manual || {}), [t.id]: { ...m, [key]: value } });
                  return (
                    <tr key={t.id}>
                      <td style={S.td}>{teacherName(t)}</td>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <td key={i} style={S.tdNum}>
                          <input style={S.smallInput} type="number" min="0" max="100" disabled={locked} value={monthly[i] ?? ""} onChange={(e) => {
                            const next = [...monthly];
                            next[i] = num(e.target.value);
                            setManual("monthly", next);
                          }} />
                        </td>
                      ))}
                      <td style={S.tdNum}><input style={S.smallInput} type="number" min="0" disabled={locked} value={m.campSigned ?? ""} onChange={(e) => setManual("campSigned", num(e.target.value))} /></td>
                      <td style={S.tdNum}><input style={S.smallInput} type="number" min="0" disabled={locked} value={m.campTotal ?? ""} onChange={(e) => setManual("campTotal", num(e.target.value))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 style={S.subTitle}>指標規則</h3>
      <div style={S.settingsGrid}>
        {field("成績基準線：三年級", ["baseline", "3"], draft.baseline[3])}
        {field("四年級", ["baseline", "4"], draft.baseline[4])}
        {field("五年級", ["baseline", "5"], draft.baseline[5])}
        {field("六年級", ["baseline", "6"], draft.baseline[6])}
        {field("任務逾期每天扣", ["perDay"], draft.perDay, 0.5)}
        {field("臨時請假／遲到每次扣", ["attendancePenalty"], draft.attendancePenalty)}
        {field("營隊報名率目標 %", ["campTarget"], draft.campTarget)}
        {field("平日課程報名率目標 %", ["courseTarget"], draft.courseTarget)}
        {field("事件 0 次得分", ["countScore", 0], draft.countScore[0])}
        {field("事件 1 次得分", ["countScore", 1], draft.countScore[1])}
        {field("事件 2 次以上得分", ["countScore", 2], draft.countScore[2])}
        {field("額外加分上限", ["bonusCap"], draft.bonusCap)}
      </div>

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

      <h3 style={S.subTitle}>平日課程報名率要算哪些課程</h3>
      <p style={S.hint}>都不勾 = 全部課程都算。</p>
      <div style={S.actionRow}>
        {courses.map((c) => (
          <label key={c.id} style={{ ...S.muted, display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" disabled={locked} checked={courseSet.has(c.id)} onChange={(e) => {
              const next = new Set(courseSet);
              if (e.target.checked) next.add(c.id);
              else next.delete(c.id);
              set(["courseIds"], [...next]);
            }} />
            {c.course_name}
          </label>
        ))}
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
