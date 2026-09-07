import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createEvaluationWorkPeriod,
  getEvaluationWorkPeriods,
  setEvaluationWorkPeriodActive,
  updateEvaluationWorkPeriod,
} from "../services/evaluationWorkPeriodService";


const EMPTY_FORM = {
  name: "",
  periodType: "semester",
  startDate: "",
  endDate: "",
};


function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(
    `${dateString}T00:00:00`
  );

  return new Intl.DateTimeFormat(
    "zh-TW",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }
  ).format(date);
}


function getPeriodTypeLabel(type) {
  return type === "vacation"
    ? "寒暑期"
    : "學期";
}


function TeacherEvaluationPage({
  currentTeacher,
}) {
  const [periods, setPeriods] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    settingsOpen,
    setSettingsOpen,
  ] = useState(false);

  const [
    editorOpen,
    setEditorOpen,
  ] = useState(false);

  const [
    editingPeriod,
    setEditingPeriod,
  ] = useState(null);

  const [form, setForm] =
    useState(EMPTY_FORM);

  const [saving, setSaving] =
    useState(false);

  const [
    changingPeriodId,
    setChangingPeriodId,
  ] = useState(null);


  const activePeriods = useMemo(
    () =>
      periods.filter(
        (period) =>
          period.is_active
      ),
    [periods]
  );


  async function loadPeriods() {
    try {
      setLoading(true);
      setError("");

      const rows =
        await getEvaluationWorkPeriods({
          includeInactive: true,
        });

      setPeriods(rows);
    } catch (loadError) {
      console.error(
        "讀取工作區間失敗：",
        loadError
      );

      setError(
        "工作區間讀取失敗，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadPeriods();
  }, []);


  function openCreateEditor() {
    setEditingPeriod(null);
    setForm(EMPTY_FORM);
    setError("");
    setSuccessMessage("");
    setEditorOpen(true);
  }


  function openEditEditor(period) {
    setEditingPeriod(period);

    setForm({
      name: period.name || "",
      periodType:
        period.period_type ||
        "semester",
      startDate:
        period.start_date || "",
      endDate:
        period.end_date || "",
    });

    setError("");
    setSuccessMessage("");
    setEditorOpen(true);
  }


  function closeEditor() {
    if (saving) {
      return;
    }

    setEditorOpen(false);
    setEditingPeriod(null);
    setForm(EMPTY_FORM);
  }


  function updateForm(
    key,
    value
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }


  async function handleSave(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      if (editingPeriod) {
        await updateEvaluationWorkPeriod(
          editingPeriod.id,
          {
            name: form.name,
            periodType:
              form.periodType,
            startDate:
              form.startDate,
            endDate:
              form.endDate,
            isActive:
              editingPeriod
                .is_active,
          }
        );

        setSuccessMessage(
          "工作區間已更新。"
        );
      } else {
        await createEvaluationWorkPeriod({
          name: form.name,
          periodType:
            form.periodType,
          startDate:
            form.startDate,
          endDate:
            form.endDate,
          isActive: true,
        });

        setSuccessMessage(
          "工作區間已新增。"
        );
      }

      await loadPeriods();
      closeEditor();
    } catch (saveError) {
      console.error(
        "儲存工作區間失敗：",
        saveError
      );

      setError(
        saveError?.message ||
          "工作區間儲存失敗。"
      );
    } finally {
      setSaving(false);
    }
  }


  async function handleToggleActive(
    period
  ) {
    try {
      setChangingPeriodId(
        period.id
      );
      setError("");
      setSuccessMessage("");

      await setEvaluationWorkPeriodActive(
        period.id,
        !period.is_active
      );

      setSuccessMessage(
        period.is_active
          ? "工作區間已停用，歷史資料仍會保留。"
          : "工作區間已重新啟用。"
      );

      await loadPeriods();
    } catch (toggleError) {
      console.error(
        "更新工作區間狀態失敗：",
        toggleError
      );

      setError(
        toggleError?.message ||
          "更新工作區間狀態失敗。"
      );
    } finally {
      setChangingPeriodId(null);
    }
  }


  if (
    currentTeacher?.role !==
    "admin"
  ) {
    return (
      <section style={styles.page}>
        <div style={styles.emptyState}>
          目前沒有此頁面的存取權限。
        </div>
      </section>
    );
  }


  return (
    <section style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>
            TEACHER EVALUATION
          </div>

          <h1 style={styles.title}>
            教師考核
          </h1>

          <p style={styles.subtitle}>
            從日常工作紀錄開始累積，
            正式考核時再依工作區間整理與結算。
          </p>
        </div>

        <button
          type="button"
          style={styles.settingsButton}
          onClick={() =>
            setSettingsOpen(true)
          }
        >
          <span style={styles.gear}>
            ⚙
          </span>
          考核設定
        </button>
      </div>


      {(error ||
        successMessage) && (
        <div
          style={
            error
              ? styles.errorBanner
              : styles.successBanner
          }
        >
          {error || successMessage}
        </div>
      )}


      <div style={styles.tabRow}>
        <button
          type="button"
          style={{
            ...styles.tab,
            ...styles.activeTab,
          }}
        >
          總覽
        </button>

        <button
          type="button"
          style={styles.tab}
          disabled
        >
          個別教師
          <span style={styles.soon}>
            後續
          </span>
        </button>

        <button
          type="button"
          style={styles.tab}
          disabled
        >
          正式考核
          <span style={styles.soon}>
            後續
          </span>
        </button>
      </div>


      <div style={styles.heroCard}>
        <div>
          <div style={styles.heroLabel}>
            Phase 1
          </div>

          <h2 style={styles.heroTitle}>
            先把工作紀錄整理好
          </h2>

          <p style={styles.heroText}>
            任務、公告、請假與遲到會依工作區間整理。
            現階段先建立資料基礎，不進行正式計分。
          </p>
        </div>

        <div style={styles.heroMetric}>
          <strong style={styles.metricNumber}>
            {activePeriods.length}
          </strong>
          <span style={styles.metricLabel}>
            使用中的工作區間
          </span>
        </div>
      </div>


      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>
            工作區間
          </h2>

          <p style={styles.sectionHint}>
            這些區間獨立於行事曆，
            之後老師可依區間查看自己的工作紀錄。
          </p>
        </div>

        <button
          type="button"
          style={styles.textButton}
          onClick={() =>
            setSettingsOpen(true)
          }
        >
          管理工作區間 →
        </button>
      </div>


      {loading ? (
        <div style={styles.emptyState}>
          正在讀取工作區間…
        </div>
      ) : activePeriods.length ===
        0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            ◌
          </div>

          <strong>
            還沒有工作區間
          </strong>

          <span>
            先從「考核設定」建立第一個學期或寒暑期。
          </span>
        </div>
      ) : (
        <div style={styles.periodGrid}>
          {activePeriods.map(
            (period) => (
              <article
                key={period.id}
                style={styles.periodCard}
              >
                <div
                  style={
                    period.period_type ===
                    "vacation"
                      ? styles.vacationBadge
                      : styles.semesterBadge
                  }
                >
                  {getPeriodTypeLabel(
                    period.period_type
                  )}
                </div>

                <h3
                  style={styles.periodName}
                >
                  {period.name}
                </h3>

                <div
                  style={styles.periodDate}
                >
                  {formatDate(
                    period.start_date
                  )}
                  <span
                    style={styles.dateDash}
                  >
                    —
                  </span>
                  {formatDate(
                    period.end_date
                  )}
                </div>
              </article>
            )
          )}
        </div>
      )}


      {settingsOpen && (
        <div style={styles.overlay}>
          <button
            type="button"
            aria-label="關閉考核設定"
            style={styles.backdrop}
            onClick={() =>
              setSettingsOpen(false)
            }
          />

          <aside style={styles.drawer}>
            <div
              style={styles.drawerHeader}
            >
              <div>
                <div style={styles.eyebrow}>
                  EVALUATION SETTINGS
                </div>

                <h2
                  style={styles.drawerTitle}
                >
                  考核設定
                </h2>

                <p
                  style={styles.drawerSubtitle}
                >
                  先管理工作區間。
                  計分制度之後再逐步加入。
                </p>
              </div>

              <button
                type="button"
                style={styles.closeButton}
                onClick={() =>
                  setSettingsOpen(false)
                }
              >
                ×
              </button>
            </div>


            <div
              style={styles.drawerSectionHeader}
            >
              <div>
                <strong
                  style={styles.drawerSectionTitle}
                >
                  工作區間
                </strong>

                <div
                  style={styles.drawerSectionHint}
                >
                  學期與寒暑期皆可自行設定日期。
                </div>
              </div>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={
                  openCreateEditor
                }
              >
                ＋ 新增區間
              </button>
            </div>


            {loading ? (
              <div
                style={styles.drawerEmpty}
              >
                讀取中…
              </div>
            ) : periods.length === 0 ? (
              <div
                style={styles.drawerEmpty}
              >
                尚未建立任何工作區間。
              </div>
            ) : (
              <div style={styles.periodList}>
                {periods.map(
                  (period) => (
                    <div
                      key={period.id}
                      style={{
                        ...styles.periodRow,
                        opacity:
                          period.is_active
                            ? 1
                            : 0.58,
                      }}
                    >
                      <div
                        style={styles.periodRowMain}
                      >
                        <div
                          style={styles.periodRowTop}
                        >
                          <strong>
                            {period.name}
                          </strong>

                          <span
                            style={
                              period.period_type ===
                              "vacation"
                                ? styles.smallVacationBadge
                                : styles.smallSemesterBadge
                            }
                          >
                            {getPeriodTypeLabel(
                              period.period_type
                            )}
                          </span>

                          {!period.is_active && (
                            <span
                              style={styles.inactiveBadge}
                            >
                              已停用
                            </span>
                          )}
                        </div>

                        <div
                          style={styles.periodRowDate}
                        >
                          {formatDate(
                            period.start_date
                          )}
                          {" ～ "}
                          {formatDate(
                            period.end_date
                          )}
                        </div>
                      </div>

                      <div
                        style={styles.rowActions}
                      >
                        <button
                          type="button"
                          style={styles.rowButton}
                          onClick={() =>
                            openEditEditor(
                              period
                            )
                          }
                        >
                          編輯
                        </button>

                        <button
                          type="button"
                          style={styles.rowButton}
                          disabled={
                            changingPeriodId ===
                            period.id
                          }
                          onClick={() =>
                            handleToggleActive(
                              period
                            )
                          }
                        >
                          {changingPeriodId ===
                          period.id
                            ? "處理中…"
                            : period.is_active
                              ? "停用"
                              : "啟用"}
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </aside>
        </div>
      )}


      {editorOpen && (
        <div style={styles.modalOverlay}>
          <button
            type="button"
            aria-label="關閉工作區間編輯"
            style={styles.modalBackdrop}
            onClick={closeEditor}
          />

          <form
            style={styles.modal}
            onSubmit={handleSave}
          >
            <div style={styles.modalHeader}>
              <div>
                <div style={styles.eyebrow}>
                  WORK PERIOD
                </div>

                <h3 style={styles.modalTitle}>
                  {editingPeriod
                    ? "編輯工作區間"
                    : "新增工作區間"}
                </h3>
              </div>

              <button
                type="button"
                style={styles.closeButton}
                onClick={closeEditor}
              >
                ×
              </button>
            </div>


            <label style={styles.field}>
              <span style={styles.fieldLabel}>
                區間名稱
              </span>

              <input
                style={styles.input}
                value={form.name}
                onChange={(event) =>
                  updateForm(
                    "name",
                    event.target.value
                  )
                }
                placeholder="例如：2026 上學期"
                autoFocus
              />
            </label>


            <label style={styles.field}>
              <span style={styles.fieldLabel}>
                區間類型
              </span>

              <select
                style={styles.input}
                value={form.periodType}
                onChange={(event) =>
                  updateForm(
                    "periodType",
                    event.target.value
                  )
                }
              >
                <option value="semester">
                  學期
                </option>
                <option value="vacation">
                  寒暑期
                </option>
              </select>
            </label>


            <div style={styles.dateFields}>
              <label style={styles.field}>
                <span
                  style={styles.fieldLabel}
                >
                  開始日期
                </span>

                <input
                  type="date"
                  style={styles.input}
                  value={form.startDate}
                  onChange={(event) =>
                    updateForm(
                      "startDate",
                      event.target.value
                    )
                  }
                />
              </label>

              <label style={styles.field}>
                <span
                  style={styles.fieldLabel}
                >
                  結束日期
                </span>

                <input
                  type="date"
                  style={styles.input}
                  value={form.endDate}
                  onChange={(event) =>
                    updateForm(
                      "endDate",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>


            <div style={styles.modalNote}>
              工作區間不會自動跟隨行事曆。
              之後正式考核時，可以自行選擇要納入哪些區間。
            </div>


            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={closeEditor}
                disabled={saving}
              >
                取消
              </button>

              <button
                type="submit"
                style={styles.saveButton}
                disabled={saving}
              >
                {saving
                  ? "儲存中…"
                  : editingPeriod
                    ? "儲存修改"
                    : "建立區間"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}


const styles = {
  page: {
    padding: "28px 30px 60px",
    maxWidth: "1380px",
    margin: "0 auto",
  },

  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "24px",
    marginBottom: "26px",
  },

  eyebrow: {
    fontSize: "11px",
    letterSpacing: "0.16em",
    fontWeight: 800,
    color: "#9b8066",
    marginBottom: "7px",
  },

  title: {
    margin: 0,
    fontSize: "30px",
    lineHeight: 1.2,
    color: "#352f2b",
  },

  subtitle: {
    margin: "9px 0 0",
    color: "#81776f",
    fontSize: "14px",
    lineHeight: 1.7,
  },

  settingsButton: {
    border: "1px solid #ded4c9",
    background: "#fffdf9",
    color: "#574c43",
    borderRadius: "14px",
    padding: "11px 15px",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "7px",
    boxShadow: "0 6px 18px rgba(73, 56, 42, 0.05)",
  },

  gear: {
    fontSize: "15px",
  },

  errorBanner: {
    background: "#fff4f2",
    border: "1px solid #efd3cf",
    color: "#a24e47",
    borderRadius: "14px",
    padding: "12px 15px",
    marginBottom: "18px",
    fontSize: "13px",
  },

  successBanner: {
    background: "#f4f8f2",
    border: "1px solid #d7e4d1",
    color: "#5c7453",
    borderRadius: "14px",
    padding: "12px 15px",
    marginBottom: "18px",
    fontSize: "13px",
  },

  tabRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "18px",
  },

  tab: {
    border: 0,
    background: "transparent",
    color: "#9a9088",
    padding: "9px 13px",
    borderRadius: "10px",
    fontWeight: 700,
    fontSize: "13px",
  },

  activeTab: {
    background: "#f1ebe4",
    color: "#51463d",
  },

  soon: {
    marginLeft: "6px",
    fontSize: "9px",
    background: "#eee9e3",
    borderRadius: "999px",
    padding: "2px 5px",
  },

  heroCard: {
    background:
      "linear-gradient(135deg, #f7f1e9 0%, #f5f3ed 100%)",
    border: "1px solid #e7ded3",
    borderRadius: "22px",
    padding: "24px 26px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    marginBottom: "28px",
  },

  heroLabel: {
    color: "#a28467",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.12em",
    marginBottom: "8px",
  },

  heroTitle: {
    margin: 0,
    fontSize: "21px",
    color: "#413832",
  },

  heroText: {
    margin: "8px 0 0",
    maxWidth: "650px",
    color: "#82776f",
    fontSize: "13px",
    lineHeight: 1.7,
  },

  heroMetric: {
    minWidth: "150px",
    textAlign: "center",
    padding: "14px 18px",
    background: "rgba(255,255,255,0.62)",
    borderRadius: "17px",
  },

  metricNumber: {
    display: "block",
    color: "#5f4f42",
    fontSize: "28px",
    lineHeight: 1,
    marginBottom: "7px",
  },

  metricLabel: {
    color: "#8a7c70",
    fontSize: "11px",
  },

  sectionHeader: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "14px",
  },

  sectionTitle: {
    margin: 0,
    color: "#403934",
    fontSize: "18px",
  },

  sectionHint: {
    margin: "6px 0 0",
    color: "#92877e",
    fontSize: "12px",
  },

  textButton: {
    border: 0,
    background: "transparent",
    color: "#8d7158",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  },

  periodGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(230px, 1fr))",
    gap: "14px",
  },

  periodCard: {
    border: "1px solid #e8e1da",
    background: "#fff",
    borderRadius: "18px",
    padding: "18px",
    minHeight: "128px",
    boxShadow:
      "0 7px 22px rgba(60, 48, 38, 0.04)",
  },

  semesterBadge: {
    display: "inline-flex",
    background: "#edf3ed",
    color: "#637763",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "10px",
    fontWeight: 800,
  },

  vacationBadge: {
    display: "inline-flex",
    background: "#f7efe2",
    color: "#98734c",
    borderRadius: "999px",
    padding: "4px 8px",
    fontSize: "10px",
    fontWeight: 800,
  },

  periodName: {
    margin: "15px 0 9px",
    color: "#443c36",
    fontSize: "17px",
  },

  periodDate: {
    color: "#91867e",
    fontSize: "12px",
  },

  dateDash: {
    margin: "0 7px",
    color: "#c0b6ad",
  },

  emptyState: {
    border: "1px dashed #ded6ce",
    borderRadius: "18px",
    minHeight: "150px",
    padding: "26px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: "7px",
    color: "#8c8178",
    background: "#fdfbf8",
    fontSize: "13px",
  },

  emptyIcon: {
    fontSize: "25px",
    color: "#b8a89a",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "flex-end",
  },

  backdrop: {
    position: "absolute",
    inset: 0,
    border: 0,
    background: "rgba(40, 34, 30, 0.24)",
    cursor: "default",
  },

  drawer: {
    position: "relative",
    zIndex: 1,
    width: "min(560px, 92vw)",
    height: "100%",
    overflowY: "auto",
    background: "#fbfaf8",
    boxShadow:
      "-18px 0 50px rgba(44, 36, 30, 0.13)",
    padding: "26px",
  },

  drawerHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    paddingBottom: "22px",
    borderBottom: "1px solid #e9e2db",
  },

  drawerTitle: {
    margin: 0,
    color: "#3f3732",
    fontSize: "23px",
  },

  drawerSubtitle: {
    margin: "7px 0 0",
    color: "#8c8178",
    fontSize: "12px",
    lineHeight: 1.6,
  },

  closeButton: {
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    border: "1px solid #e1d8cf",
    background: "#fff",
    color: "#75685f",
    fontSize: "20px",
    cursor: "pointer",
  },

  drawerSectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "14px",
    margin: "24px 0 14px",
  },

  drawerSectionTitle: {
    color: "#4a4039",
    fontSize: "15px",
  },

  drawerSectionHint: {
    marginTop: "4px",
    color: "#9b9087",
    fontSize: "11px",
  },

  primaryButton: {
    border: 0,
    background: "#675548",
    color: "#fff",
    borderRadius: "11px",
    padding: "10px 13px",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
  },

  drawerEmpty: {
    border: "1px dashed #ddd4cc",
    borderRadius: "14px",
    padding: "24px",
    textAlign: "center",
    color: "#998e85",
    fontSize: "12px",
  },

  periodList: {
    display: "flex",
    flexDirection: "column",
    gap: "9px",
  },

  periodRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "14px",
    border: "1px solid #e7dfd8",
    borderRadius: "14px",
    background: "#fff",
  },

  periodRowMain: {
    minWidth: 0,
  },

  periodRowTop: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "7px",
    color: "#493f38",
    fontSize: "13px",
  },

  periodRowDate: {
    marginTop: "6px",
    color: "#958980",
    fontSize: "11px",
  },

  smallSemesterBadge: {
    background: "#edf3ed",
    color: "#687b68",
    borderRadius: "999px",
    padding: "3px 6px",
    fontSize: "9px",
    fontWeight: 800,
  },

  smallVacationBadge: {
    background: "#f7efe2",
    color: "#98734c",
    borderRadius: "999px",
    padding: "3px 6px",
    fontSize: "9px",
    fontWeight: 800,
  },

  inactiveBadge: {
    background: "#efefef",
    color: "#888",
    borderRadius: "999px",
    padding: "3px 6px",
    fontSize: "9px",
    fontWeight: 800,
  },

  rowActions: {
    display: "flex",
    gap: "5px",
    flexShrink: 0,
  },

  rowButton: {
    border: "1px solid #ddd3ca",
    background: "#fff",
    color: "#76675c",
    borderRadius: "9px",
    padding: "7px 9px",
    fontSize: "10px",
    fontWeight: 700,
    cursor: "pointer",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1100,
    display: "grid",
    placeItems: "center",
    padding: "20px",
  },

  modalBackdrop: {
    position: "absolute",
    inset: 0,
    border: 0,
    background: "rgba(42, 36, 32, 0.34)",
  },

  modal: {
    position: "relative",
    zIndex: 1,
    width: "min(500px, 94vw)",
    background: "#fff",
    borderRadius: "20px",
    padding: "23px",
    boxShadow:
      "0 24px 70px rgba(48, 39, 32, 0.2)",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    marginBottom: "20px",
  },

  modalTitle: {
    margin: 0,
    color: "#403832",
    fontSize: "20px",
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
    marginBottom: "15px",
  },

  fieldLabel: {
    color: "#6f6258",
    fontSize: "11px",
    fontWeight: 800,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #ddd4cc",
    background: "#fff",
    borderRadius: "11px",
    padding: "11px 12px",
    color: "#493f38",
    fontSize: "13px",
    outline: "none",
  },

  dateFields: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },

  modalNote: {
    background: "#f8f5f1",
    color: "#8b7d72",
    borderRadius: "11px",
    padding: "11px 12px",
    fontSize: "11px",
    lineHeight: 1.6,
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "20px",
  },

  cancelButton: {
    border: "1px solid #ddd4cc",
    background: "#fff",
    color: "#786b61",
    borderRadius: "10px",
    padding: "9px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  },

  saveButton: {
    border: 0,
    background: "#665448",
    color: "#fff",
    borderRadius: "10px",
    padding: "9px 15px",
    fontWeight: 800,
    fontSize: "12px",
    cursor: "pointer",
  },
};


export default TeacherEvaluationPage;
