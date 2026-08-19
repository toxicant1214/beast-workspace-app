import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import CampPeriodStudentsModal from "./CampPeriodStudentsModal";

const EMPTY_FORM = {
  name: "",
  start_date: "",
  end_date: "",
  notes: "",
};

function formatDate(dateString) {
  if (!dateString) return "—";
  const [year, month, day] = String(dateString).split("-");
  return `${year}/${month}/${day}`;
}

function CampPeriodsPanel({ camp, onBack }) {
  const [periods, setPeriods] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [managingPeriod, setManagingPeriod] = useState(null);

  useEffect(() => {
    loadPeriods();
  }, [camp.id]);

  async function loadPeriods() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [periodsResult, membersResult] = await Promise.all([
        supabase
          .from("camp_periods")
          .select(`
            id,
            camp_id,
            name,
            start_date,
            end_date,
            sort_order,
            notes,
            created_at,
            updated_at
          `)
          .eq("camp_id", camp.id)
          .order("sort_order", { ascending: true })
          .order("start_date", { ascending: true }),

        supabase
          .from("camp_period_students")
          .select("period_id")
          .eq("camp_id", camp.id),
      ]);

      if (periodsResult.error) throw periodsResult.error;
      if (membersResult.error) throw membersResult.error;

      setPeriods(periodsResult.data ?? []);

      const counts = {};
      for (const row of membersResult.data ?? []) {
        counts[row.period_id] = (counts[row.period_id] || 0) + 1;
      }
      setStudentCounts(counts);
    } catch (error) {
      console.error("讀取活動梯次失敗：", error);
      setErrorMessage(`讀取活動梯次失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  const sortedPeriods = useMemo(() => {
    return [...periods].sort((a, b) => {
      const orderDiff =
        Number(a.sort_order || 0) - Number(b.sort_order || 0);

      if (orderDiff !== 0) return orderDiff;

      return String(a.start_date).localeCompare(
        String(b.start_date)
      );
    });
  }, [periods]);

  function openCreateForm() {
    setEditingPeriod(null);
    setFormData({
      ...EMPTY_FORM,
      start_date: camp.start_date || "",
      end_date: camp.start_date || "",
    });
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(period) {
    setEditingPeriod(period);
    setFormData({
      name: period.name || "",
      start_date: period.start_date || "",
      end_date: period.end_date || "",
      notes: period.notes || "",
    });
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!formData.name.trim()) {
      setErrorMessage("請輸入梯次名稱。");
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      setErrorMessage("請選擇梯次開始與結束日期。");
      return;
    }

    if (formData.end_date < formData.start_date) {
      setErrorMessage("結束日期不能早於開始日期。");
      return;
    }

    if (
      formData.start_date < camp.start_date ||
      formData.end_date > camp.end_date
    ) {
      setErrorMessage("梯次日期必須落在本營隊起迄日期內。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      if (editingPeriod) {
        const { data, error } = await supabase
          .from("camp_periods")
          .update({
            name: formData.name.trim(),
            start_date: formData.start_date,
            end_date: formData.end_date,
            notes: formData.notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingPeriod.id)
          .eq("camp_id", camp.id)
          .select()
          .single();

        if (error) throw error;

        setPeriods((current) =>
          current.map((period) =>
            period.id === data.id ? data : period
          )
        );
      } else {
        const nextSortOrder =
          periods.length === 0
            ? 0
            : Math.max(
                ...periods.map((period) =>
                  Number(period.sort_order || 0)
                )
              ) + 1;

        const { data, error } = await supabase
          .from("camp_periods")
          .insert({
            camp_id: camp.id,
            name: formData.name.trim(),
            start_date: formData.start_date,
            end_date: formData.end_date,
            sort_order: nextSortOrder,
            notes: formData.notes.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;

        setPeriods((current) => [...current, data]);
      }

      setIsFormOpen(false);
      setEditingPeriod(null);
      setFormData(EMPTY_FORM);
    } catch (error) {
      console.error("儲存活動梯次失敗：", error);
      setErrorMessage(`儲存失敗：${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(period) {
    const count = studentCounts[period.id] || 0;

    const confirmed = window.confirm(
      `確定要刪除「${period.name}」嗎？\n\n` +
        (count > 0
          ? `目前已有 ${count} 位學生加入此梯次，刪除後這些梯次名單也會一起移除。`
          : "此梯次目前沒有學生。")
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("camp_periods")
        .delete()
        .eq("id", period.id)
        .eq("camp_id", camp.id);

      if (error) throw error;

      setPeriods((current) =>
        current.filter((item) => item.id !== period.id)
      );

      setStudentCounts((current) => {
        const next = { ...current };
        delete next[period.id];
        return next;
      });
    } catch (error) {
      console.error("刪除活動梯次失敗：", error);
      setErrorMessage(`刪除失敗：${error.message}`);
    }
  }

  return (
    <div className="campPeriodsPanel">
      <div className="campPeriodsPanel__header">
        <div>
          <button
            type="button"
            className="campBackButton"
            onClick={onBack}
          >
            ← 返回營隊資料夾
          </button>

          <p className="campEyebrow">CAMP PERIODS</p>
          <h2>活動梯次</h2>
          <p>{camp.name}</p>
        </div>

        <button
          type="button"
          className="campPrimaryButton"
          onClick={openCreateForm}
        >
          ＋ 建立新梯次
        </button>
      </div>

      {errorMessage && (
        <div className="campMessage campMessage--error">
          {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="campEmptyState">
          <strong>正在讀取活動梯次……</strong>
        </div>
      ) : sortedPeriods.length === 0 ? (
        <div className="campEmptyState">
          <div className="campEmptyState__icon">🗂️</div>
          <strong>目前還沒有活動梯次</strong>
          <p>
            先建立第一梯、第二梯等活動梯次，
            再從學生總名單勾選每梯參加的學生。
          </p>
          <button
            type="button"
            className="campSecondaryButton"
            onClick={openCreateForm}
          >
            建立第一個梯次
          </button>
        </div>
      ) : (
        <div className="campPeriodList">
          {sortedPeriods.map((period) => (
            <article key={period.id} className="campPeriodCard">
              <div className="campPeriodCard__main">
                <div>
                  <p className="campEyebrow">ACTIVITY PERIOD</p>
                  <h3>{period.name}</h3>

                  <p className="campPeriodCard__date">
                    {formatDate(period.start_date)}
                    {" — "}
                    {formatDate(period.end_date)}
                  </p>

                  {period.notes && (
                    <p className="campPeriodCard__note">
                      {period.notes}
                    </p>
                  )}
                </div>

                <div className="campPeriodCard__count">
                  <span>已選學生</span>
                  <strong>
                    {studentCounts[period.id] || 0} 人
                  </strong>
                </div>
              </div>

              <div className="campPeriodCard__actions">
                <button
                  type="button"
                  className="campPrimaryButton campPrimaryButton--small"
                  onClick={() => setManagingPeriod(period)}
                >
                  管理學生
                </button>

                <button
                  type="button"
                  className="campSecondaryButton campSecondaryButton--small"
                  onClick={() => openEditForm(period)}
                >
                  編輯
                </button>

                <button
                  type="button"
                  className="campDangerButton"
                  onClick={() => handleDelete(period)}
                >
                  刪除
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="campModalBackdrop">
          <div className="campModal">
            <div className="campModal__header">
              <div>
                <p className="campEyebrow">CAMP PERIOD</p>
                <h2>
                  {editingPeriod
                    ? "編輯活動梯次"
                    : "建立活動梯次"}
                </h2>
              </div>

              <button
                type="button"
                className="campModal__close"
                onClick={() => setIsFormOpen(false)}
              >
                ×
              </button>
            </div>

            <form className="campForm" onSubmit={handleSubmit}>
              <label className="campForm__field">
                <span>梯次名稱 *</span>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="例如：第一梯"
                  autoFocus
                />
              </label>

              <div className="campForm__dateGrid">
                <label className="campForm__field">
                  <span>開始日期 *</span>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    min={camp.start_date}
                    max={camp.end_date}
                    onChange={handleChange}
                  />
                </label>

                <label className="campForm__field">
                  <span>結束日期 *</span>
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    min={formData.start_date || camp.start_date}
                    max={camp.end_date}
                    onChange={handleChange}
                  />
                </label>
              </div>

              <label className="campForm__field">
                <span>備註</span>
                <textarea
                  name="notes"
                  rows="3"
                  value={formData.notes}
                  onChange={handleChange}
                />
              </label>

              {errorMessage && (
                <div className="campMessage campMessage--error">
                  {errorMessage}
                </div>
              )}

              <div className="campModal__actions">
                <button
                  type="button"
                  className="campSecondaryButton"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="campPrimaryButton"
                  disabled={isSaving}
                >
                  {isSaving ? "儲存中…" : "儲存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CampPeriodStudentsModal
        camp={camp}
        period={managingPeriod}
        isOpen={Boolean(managingPeriod)}
        onClose={() => setManagingPeriod(null)}
        onSaved={(count) => {
          if (!managingPeriod) return;
          setStudentCounts((current) => ({
            ...current,
            [managingPeriod.id]: count,
          }));
        }}
      />
    </div>
  );
}

export default CampPeriodsPanel;