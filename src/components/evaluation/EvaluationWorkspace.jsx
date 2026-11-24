import { useCallback, useEffect, useMemo, useState } from "react";

import { getActiveTeachers } from "../../services/teacherService";
import { getTeacherAssignments } from "../../services/teacherAssignmentService";
import {
  STATUS_LABELS,
  computeAdminCooperation,
  createEvent,
  factorForScore,
  getEventTypes,
  getEvents,
  getYearEndSettings,
  resendNotify,
  resolveDispute,
  saveEventType,
  saveYearEndSettings,
  summarizeTeacher,
  syncEvaluation,
  voidEvent,
} from "../../services/evaluationService";

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

function buildRangeOptions(periods) {
  const year = new Date().getFullYear();
  const options = [
    { value: `year:${year}`, label: `${year} 整年` },
    { value: `year:${year - 1}`, label: `${year - 1} 整年` },
  ];
  for (const period of periods || []) {
    if (!period.is_active) continue;
    options.push({ value: `period:${period.id}`, label: `區間：${period.name}` });
  }
  return options;
}

function resolveRange(value, periods) {
  if (value?.startsWith("period:")) {
    const period = (periods || []).find((p) => `period:${p.id}` === value);
    if (period) return { from: period.start_date, to: period.end_date };
  }
  const year = Number(value?.split(":")[1]) || new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
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
// 主元件
// ---------------------------------------------------------

export default function EvaluationWorkspace({ tab, periods }) {
  const rangeOptions = useMemo(() => buildRangeOptions(periods), [periods]);
  const [rangeValue, setRangeValue] = useState(rangeOptions[0].value);
  const range = useMemo(() => resolveRange(rangeValue, periods), [rangeValue, periods]);

  const [teachers, setTeachers] = useState([]);
  const [types, setTypes] = useState([]);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState({ text: "", error: false });
  const [formOpen, setFormOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  const showMessage = useCallback((text, error = false) => setMessage({ text, error }), []);

  const loadAll = useCallback(async () => {
    try {
      setLoadError("");
      const [teacherRows, typeRows, eventRows, settingValue, assignments] = await Promise.all([
        getActiveTeachers(),
        getEventTypes(),
        getEvents(range),
        getYearEndSettings(),
        getTeacherAssignments().catch(() => []),
      ]);
      const staff = teacherRows.filter((t) => t.role !== "admin");
      setTeachers(staff);
      setTypes(typeRows);
      setEvents(eventRows);
      setSettings(settingValue);

      setAssignments(assignments || []);
    } catch (error) {
      console.error("讀取考核資料失敗：", error);
      setLoadError("考核資料讀取失敗。如果是第一次使用，請先到 Supabase 執行 teacher_evaluation_建表.sql。");
    } finally {
      setLoading(false);
    }
  }, [range]);

  // 進頁面先請後端處理「超過天數自動確認」，再讀資料
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

  const teacherMap = useMemo(
    () => Object.fromEntries(teachers.map((t) => [t.id, t])),
    [teachers]
  );

  const baseScore = Number(settings?.base_score ?? 100);

  const perDay = Number(settings?.overdue_per_day ?? 1);

  const ranking = useMemo(() => {
    const rows = teachers.map((teacher) => {
      const own = events.filter((e) => e.teacher_id === teacher.id);
      const summary = summarizeTeacher(own, baseScore);
      const admin = computeAdminCooperation(assignments, teacher.id, {
        from: range.from,
        to: range.to,
        since: settings?.overdue_since,
        perDay,
      });
      return { teacher, ...summary, admin, score: summary.score + admin.score };
    });
    rows.sort((a, b) => b.score - a.score);
    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [teachers, events, baseScore, assignments, range, settings, perDay]);

  const disputes = events.filter((e) => e.status === "disputed" || e.status === "disputing");

  function afterChange(text, error = false) {
    showMessage(text, error);
    loadAll();
  }

  if (loading && !settings) {
    return <div style={S.empty}>正在讀取考核資料…</div>;
  }

  if (loadError) {
    return <div style={S.errorBanner}>{loadError}</div>;
  }

  const leaders = new Set(settings?.leaders || []);

  return (
    <div>
      <div style={S.toolbar}>
        <select style={S.rangeSelect} value={rangeValue} onChange={(e) => setRangeValue(e.target.value)}>
          {rangeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button type="button" style={S.primaryButton} onClick={() => setFormOpen(true)}>＋ 登記事件</button>
      </div>

      {message.text && (
        <div style={message.error ? S.errorBanner : S.successBanner}>{message.text}</div>
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
            <h2 style={S.sectionTitle}>分數排行</h2>
            <p style={S.hint}>
              每人從 {baseScore} 分開始。行政配合直接從老師任務計算：每逾期 1 天扣 {perDay} 分，還沒回報的照目前天數算。
              事件裡有異議、待主管處理的紀錄先不計分。
            </p>
            <div style={S.tableWrap}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>老師</th>
                    <th style={S.thNum}>行政配合</th>
                    <th style={S.thNum}>事件加分</th>
                    <th style={S.thNum}>事件扣分</th>
                    <th style={S.thNum}>分數</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => (
                    <tr
                      key={row.teacher.id}
                      style={S.clickRow}
                      onClick={() => setSelectedTeacherId(row.teacher.id)}
                    >
                      <td style={S.td}>{row.rank}</td>
                      <td style={S.td}>
                        {teacherName(row.teacher)}
                        {leaders.has(row.teacher.id) && <span style={S.leaderTag}>組長</span>}
                        {row.disputed > 0 && <span style={S.alertTag}>異議 {row.disputed}</span>}
                      </td>
                      <td style={S.tdNum}>
                        <span style={S.muted}>
                          準時 {row.admin.onTime}/{row.admin.total}
                          {row.admin.overdueDays > 0 && `・逾期 ${row.admin.overdueDays} 天`}
                          {row.admin.open > 0 && `（${row.admin.open} 件未回報）`}
                        </span>{" "}
                        <strong style={row.admin.score < 0 ? S.minusText : undefined}>{pointsText(row.admin.score)}</strong>
                      </td>
                      <td style={{ ...S.tdNum, ...S.plusText }}>{row.plusCount} 次 / {pointsText(row.plus)}</td>
                      <td style={{ ...S.tdNum, ...S.minusText }}>{row.minusCount} 次 / {pointsText(row.minus)}</td>
                      <td style={{ ...S.tdNum, fontWeight: 800 }}>{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedTeacherId && (
              <p style={S.hint}>到「個別教師」可看 {teacherName(teacherMap[selectedTeacherId])} 的完整紀錄。</p>
            )}
          </section>

          <section style={S.section}>
            <h2 style={S.sectionTitle}>最近紀錄</h2>
            <EventList events={events.slice(0, 15)} teacherMap={teacherMap} showTeacher onChanged={afterChange} />
          </section>
        </>
      )}

      {tab === "teacher" && (
        <section style={S.section}>
          <select
            style={{ ...S.rangeSelect, marginBottom: "16px" }}
            value={selectedTeacherId}
            onChange={(e) => setSelectedTeacherId(e.target.value)}
          >
            <option value="">選擇老師</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{teacherName(t)}</option>
            ))}
          </select>

          {selectedTeacherId ? (
            (() => {
              const row = ranking.find((r) => r.teacher.id === selectedTeacherId);
              const own = events.filter((e) => e.teacher_id === selectedTeacherId);
              return (
                <>
                  <div style={S.statRow}>
                    <div style={S.stat}><span>分數</span><strong>{row?.score ?? baseScore}</strong></div>
                    <div style={S.stat}><span>排名</span><strong>{row?.rank ?? "—"}</strong></div>
                    <div style={S.stat}><span>行政配合</span><strong style={(row?.admin.score ?? 0) < 0 ? S.minusText : undefined}>{pointsText(row?.admin.score ?? 0)}</strong></div>
                    <div style={S.stat}><span>事件加分</span><strong style={S.plusText}>{row?.plusCount ?? 0} 次</strong></div>
                    <div style={S.stat}><span>事件扣分</span><strong style={S.minusText}>{row?.minusCount ?? 0} 次</strong></div>
                  </div>

                  <h3 style={S.subTitle}>
                    行政配合（老師任務）
                    <span style={{ ...S.muted, fontWeight: 400, marginLeft: "8px" }}>
                      準時 {row?.admin.onTime ?? 0}/{row?.admin.total ?? 0}・累計逾期 {row?.admin.overdueDays ?? 0} 天
                    </span>
                  </h3>
                  {row?.admin.items.length ? (
                    <div style={S.list}>
                      {row.admin.items.map((item) => (
                        <div key={item.id} style={S.listRow}>
                          <div style={S.listDate}>{item.deadline.slice(5).replace("-", "/")}</div>
                          <div style={S.listMain}>{item.title}</div>
                          <div style={S.listSide}>
                            {item.status === "ontime" && <span style={{ ...S.chip, ...S.chipOk }}>準時完成</span>}
                            {item.status === "late" && <span style={{ ...S.chip, ...S.chipAlert }}>逾期 {item.days} 天完成</span>}
                            {item.status === "open" && <span style={{ ...S.chip, ...S.chipAlert }}>已逾期 {item.days} 天・未回報</span>}
                            {item.status === "upcoming" && <span style={{ ...S.chip, ...S.chipMuted }}>未到期</span>}
                            {item.days > 0 && <strong style={S.minusText}>{pointsText(-item.days * perDay)}</strong>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={S.empty}>這段期間沒有任務。</div>
                  )}

                  <h3 style={S.subTitle}>事件紀錄</h3>
                  <EventList events={own} teacherMap={teacherMap} onChanged={afterChange} />
                </>
              );
            })()
          ) : (
            <div style={S.empty}>先選一位老師。</div>
          )}
        </section>
      )}

      {tab === "yearend" && settings && (
        <YearEndPanel
          ranking={ranking}
          settings={settings}
          types={types}
          onSaved={(text, error) => afterChange(text, error)}
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
// 正式考核（年終試算 + 計分設定）
// ---------------------------------------------------------

function YearEndPanel({ ranking, settings, types, onSaved }) {
  const [draft, setDraft] = useState(settings);
  const [typeDraft, setTypeDraft] = useState(types);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => setTypeDraft(types), [types]);

  const leaders = new Set(draft.leaders || []);
  const salaries = draft.salaries || {};

  function update(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleLeader(id) {
    const next = new Set(leaders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update("leaders", [...next]);
  }

  function updateBand(index, key, value) {
    const bands = (draft.bands || []).map((band, i) => (i === index ? { ...band, [key]: value } : band));
    update("bands", bands);
  }

  function updateType(id, key, value) {
    setTypeDraft((prev) => prev.map((t) => (t.id === id ? { ...t, [key]: value } : t)));
  }

  async function save() {
    try {
      setSaving(true);
      const clean = {
        ...draft,
        base_months: Number(draft.base_months) || 0,
        leader_bonus: Number(draft.leader_bonus) || 0,
        base_score: Number(draft.base_score) || 100,
        auto_confirm_days: Number(draft.auto_confirm_days) || 3,
        overdue_per_day: Number(draft.overdue_per_day) || 0,
        bands: (draft.bands || []).map((b) => ({ min: Number(b.min), factor: Number(b.factor) })),
      };
      await saveYearEndSettings(clean);
      for (const type of typeDraft) {
        const original = types.find((t) => t.id === type.id);
        if (
          original &&
          (Number(original.points) !== Number(type.points) || original.is_active !== type.is_active)
        ) {
          await saveEventType(type);
        }
      }
      onSaved("年終設定已儲存。");
    } catch (error) {
      console.error("儲存年終設定失敗：", error);
      onSaved("儲存失敗，請稍後再試。", true);
    } finally {
      setSaving(false);
    }
  }

  const rows = ranking.map((row) => {
    const salary = Number(salaries[row.teacher.id]) || 0;
    const factor = factorForScore(row.score, draft.bands);
    const base = salary * (Number(draft.base_months) || 0) * factor;
    const leaderBonus = leaders.has(row.teacher.id) ? Number(draft.leader_bonus) || 0 : 0;
    return { ...row, salary, factor, base, leaderBonus, total: base + leaderBonus };
  });
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <section style={S.section}>
      <h2 style={S.sectionTitle}>年終試算</h2>
      <p style={S.hint}>
        年終 = 月薪 × 基本月數（{draft.base_months}）× 係數 ＋ 組長加給。月薪填好後記得按儲存。
      </p>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>老師</th>
              <th style={S.thNum}>分數</th>
              <th style={S.thNum}>係數</th>
              <th style={S.thNum}>月薪</th>
              <th style={S.th}>組長</th>
              <th style={S.thNum}>年終</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.teacher.id}>
                <td style={S.td}>{teacherName(row.teacher)}</td>
                <td style={S.tdNum}>{row.score}</td>
                <td style={S.tdNum}>{row.factor}</td>
                <td style={S.tdNum}>
                  <input
                    style={S.salaryInput}
                    type="number"
                    min="0"
                    value={salaries[row.teacher.id] ?? ""}
                    onChange={(e) => update("salaries", { ...salaries, [row.teacher.id]: e.target.value })}
                  />
                </td>
                <td style={S.td}>
                  <input type="checkbox" checked={leaders.has(row.teacher.id)} onChange={() => toggleLeader(row.teacher.id)} />
                </td>
                <td style={{ ...S.tdNum, fontWeight: 800 }}>{row.salary ? money(row.total) : "—"}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...S.td, fontWeight: 800 }} colSpan={5}>合計</td>
              <td style={{ ...S.tdNum, fontWeight: 800 }}>{money(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <button type="button" style={S.textButton} onClick={() => setShowSettings((v) => !v)}>
        {showSettings ? "收起計分設定 ▲" : "計分設定（級距、行政配合、事件分數、組長加給）▼"}
      </button>

      {showSettings && (
        <div style={S.settingsBox}>
          <div style={S.settingsGrid}>
            <label style={S.label}>基本月數
              <input style={S.input} type="number" step="0.1" value={draft.base_months} onChange={(e) => update("base_months", e.target.value)} />
            </label>
            <label style={S.label}>組長加給（元）
              <input style={S.input} type="number" value={draft.leader_bonus} onChange={(e) => update("leader_bonus", e.target.value)} />
            </label>
            <label style={S.label}>起始分數
              <input style={S.input} type="number" value={draft.base_score} onChange={(e) => update("base_score", e.target.value)} />
            </label>
            <label style={S.label}>幾天沒回自動確認
              <input style={S.input} type="number" min="1" value={draft.auto_confirm_days} onChange={(e) => update("auto_confirm_days", e.target.value)} />
            </label>
            <label style={S.label}>行政配合：逾期每天扣幾分
              <input style={S.input} type="number" step="0.5" min="0" value={draft.overdue_per_day ?? 1} onChange={(e) => update("overdue_per_day", e.target.value)} />
            </label>
            <label style={S.label}>行政配合：從哪天的任務開始算
              <input style={S.input} type="date" value={draft.overdue_since || ""} onChange={(e) => update("overdue_since", e.target.value)} />
            </label>
          </div>

          <h3 style={S.subTitle}>分數級距 → 係數</h3>
          {(draft.bands || []).map((band, index) => (
            <div key={index} style={S.inlineGroup}>
              {Number(band.min) <= -9999 ? "其餘" : (
                <>
                  <input style={S.smallInput} type="number" value={band.min} onChange={(e) => updateBand(index, "min", e.target.value)} />
                  分以上
                </>
              )}
              → 係數
              <input style={S.smallInput} type="number" step="0.1" value={band.factor} onChange={(e) => updateBand(index, "factor", e.target.value)} />
            </div>
          ))}

          <h3 style={S.subTitle}>事件項目分數</h3>
          {typeDraft.filter((type) => !type.per_day).map((type) => (
            <div key={type.id} style={S.inlineGroup}>
              <span style={{ minWidth: "80px" }}>{type.name}</span>
              {type.direction === "plus" ? "+" : "−"}
              <input style={S.smallInput} type="number" step="0.5" min="0" value={type.points} onChange={(e) => updateType(type.id, "points", e.target.value)} />
              {type.per_day ? "分／天" : "分"}
              {!type.is_system && (
                <label style={S.muted}>
                  <input type="checkbox" checked={type.is_active} onChange={(e) => updateType(type.id, "is_active", e.target.checked)} /> 使用中
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={S.modalActions}>
        <button type="button" style={S.primaryButton} disabled={saving} onClick={save}>
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------
// 樣式（沿用教師考核頁的配色）
// ---------------------------------------------------------

const S = {
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
