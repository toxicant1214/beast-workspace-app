import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

const DAY_TYPES = [
  { value: "GENERAL", label: "一般常規上課" },
  { value: "FIELD_TRIP", label: "戶外教學日" },
  { value: "OVERNIGHT", label: "兩天一夜" },
  { value: "CLOSED", label: "不開課" },
];

const WEEKDAY_LABELS = [
  "週日",
  "週一",
  "週二",
  "週三",
  "週四",
  "週五",
  "週六",
];

function parseDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekdays(startDate, endDate) {
  if (!startDate || !endDate) return [];

  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const result = [];
  const current = new Date(start);

  while (current <= end) {
    const weekday = current.getDay();

    if (weekday !== 0 && weekday !== 6) {
      result.push(toDateKey(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return result;
}

function formatDate(dateKey) {
  if (!dateKey) return "—";
  return String(dateKey).replaceAll("-", "/");
}

function CampPeriodsPanel({
  camp,
  onBack,
}) {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [periodDates, setPeriodDates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    start_date: camp.start_date || "",
    end_date: camp.start_date || "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadPeriods();
  }, [camp.id]);

  useEffect(() => {
    if (selectedPeriodId) {
      loadPeriodDates(selectedPeriodId);
    } else {
      setPeriodDates([]);
    }
  }, [selectedPeriodId]);

  async function loadPeriods() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("camp_periods")
        .select("id, name, start_date, end_date, sort_order")
        .eq("camp_id", camp.id)
        .order("sort_order", { ascending: true })
        .order("start_date", { ascending: true });

      if (error) throw error;

      const rows = data ?? [];
      setPeriods(rows);

      if (rows.length > 0) {
        setSelectedPeriodId((current) =>
          current && rows.some((item) => item.id === current)
            ? current
            : rows[0].id
        );
      } else {
        setSelectedPeriodId("");
      }
    } catch (error) {
      console.error("讀取活動梯次失敗：", error);
      setErrorMessage(`讀取失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPeriodDates(periodId) {
    try {
      setErrorMessage("");

      const period = periods.find((item) => item.id === periodId);
      if (!period) return;

      const { data, error } = await supabase
        .from("camp_period_dates")
        .select("id, camp_date, day_type, note")
        .eq("camp_id", camp.id)
        .eq("period_id", periodId)
        .order("camp_date", { ascending: true });

      if (error) throw error;

      if ((data ?? []).length > 0) {
        setPeriodDates(data);
        return;
      }

      const defaultDates = getWeekdays(
        period.start_date,
        period.end_date
      );

      if (defaultDates.length === 0) {
        setPeriodDates([]);
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("camp_period_dates")
        .insert(
          defaultDates.map((dateKey) => ({
            camp_id: camp.id,
            period_id: periodId,
            camp_date: dateKey,
            day_type: "GENERAL",
          }))
        )
        .select("id, camp_date, day_type, note");

      if (insertError) throw insertError;

      setPeriodDates(
        [...(inserted ?? [])].sort((a, b) =>
          String(a.camp_date).localeCompare(String(b.camp_date))
        )
      );
    } catch (error) {
      console.error("讀取梯次日期失敗：", error);
      setErrorMessage(`讀取日期失敗：${error.message}`);
    }
  }

  const selectedPeriod = useMemo(
    () =>
      periods.find((item) => item.id === selectedPeriodId) ||
      null,
    [periods, selectedPeriodId]
  );

  async function handleCreatePeriod(event) {
    event.preventDefault();

    if (!formData.name.trim()) {
      setErrorMessage("請輸入梯次名稱。");
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      setErrorMessage("請選擇梯次起迄日期。");
      return;
    }

    if (formData.end_date < formData.start_date) {
      setErrorMessage("結束日期不能早於開始日期。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      const nextSortOrder =
        periods.length === 0
          ? 0
          : Math.max(
              ...periods.map((item) =>
                Number(item.sort_order || 0)
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
        })
        .select()
        .single();

      if (error) throw error;

      const dates = getWeekdays(
        formData.start_date,
        formData.end_date
      );

      if (dates.length > 0) {
        const { error: dateError } = await supabase
          .from("camp_period_dates")
          .insert(
            dates.map((dateKey) => ({
              camp_id: camp.id,
              period_id: data.id,
              camp_date: dateKey,
              day_type: "GENERAL",
            }))
          );

        if (dateError) throw dateError;
      }

      setPeriods((current) => [...current, data]);
      setSelectedPeriodId(data.id);
      setIsFormOpen(false);
      setFormData({
        name: "",
        start_date: camp.start_date || "",
        end_date: camp.start_date || "",
      });
    } catch (error) {
      console.error("建立梯次失敗：", error);
      setErrorMessage(`建立失敗：${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function updateDayType(row, dayType) {
    try {
      const { data, error } = await supabase
        .from("camp_period_dates")
        .update({
          day_type: dayType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select()
        .single();

      if (error) throw error;

      setPeriodDates((current) =>
        current.map((item) =>
          item.id === data.id ? data : item
        )
      );
    } catch (error) {
      console.error("更新日期類型失敗：", error);
      setErrorMessage(`更新失敗：${error.message}`);
    }
  }

  async function addSingleDate() {
    if (!selectedPeriod) return;

    const dateKey = window.prompt(
      "請輸入要新增的日期（YYYY-MM-DD）"
    );

    if (!dateKey) return;

    try {
      const { data, error } = await supabase
        .from("camp_period_dates")
        .insert({
          camp_id: camp.id,
          period_id: selectedPeriod.id,
          camp_date: dateKey,
          day_type: "GENERAL",
        })
        .select()
        .single();

      if (error) throw error;

      setPeriodDates((current) =>
        [...current, data].sort((a, b) =>
          String(a.camp_date).localeCompare(
            String(b.camp_date)
          )
        )
      );
    } catch (error) {
      console.error("新增單日失敗：", error);
      setErrorMessage(`新增單日失敗：${error.message}`);
    }
  }

  if (isLoading) {
    return (
      <div className="campPeriodsPanel">
        <div className="campEmptyState">
          正在讀取活動梯次……
        </div>
      </div>
    );
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
          <h2>活動梯次與日期設定</h2>
          <p>{camp.name}</p>
        </div>

        <button
          type="button"
          className="campPrimaryButton"
          onClick={() => setIsFormOpen(true)}
        >
          ＋ 建立新活動梯次
        </button>
      </div>

      {errorMessage && (
        <div className="campMessage campMessage--error">
          {errorMessage}
        </div>
      )}

      <div className="campPeriodsLayout">
        <aside className="campPeriodsSidebar">
          <div className="campPeriodsSidebar__title">
            活動梯次清單
            <span>{periods.length}</span>
          </div>

          {periods.map((period) => (
            <button
              key={period.id}
              type="button"
              className={[
                "campPeriodSelectCard",
                selectedPeriodId === period.id
                  ? "is-active"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setSelectedPeriodId(period.id)}
            >
              <strong>{period.name}</strong>
              <span>
                {formatDate(period.start_date)}
                {" ～ "}
                {formatDate(period.end_date)}
              </span>
            </button>
          ))}
        </aside>

        <section className="campPeriodDatesArea">
          {!selectedPeriod ? (
            <div className="campEmptyState">
              尚未建立活動梯次。
            </div>
          ) : (
            <>
              <div className="campPeriodDatesArea__header">
                <div>
                  <h3>
                    每日課程屬性設定－{selectedPeriod.name}
                  </h3>
                  <p>
                    共 {periodDates.length} 個活動日
                  </p>
                </div>
              </div>

              <div className="campPeriodDateGrid">
                {periodDates.map((row) => {
                  const date = parseDateKey(row.camp_date);

                  return (
                    <article
                      key={row.id}
                      className="campPeriodDateCard"
                    >
                      <div>
                        <strong>{row.camp_date}</strong>
                        <span>
                          {WEEKDAY_LABELS[date.getDay()]}
                        </span>
                      </div>

                      <select
                        value={row.day_type}
                        onChange={(event) =>
                          updateDayType(
                            row,
                            event.target.value
                          )
                        }
                      >
                        {DAY_TYPES.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </article>
                  );
                })}
              </div>

              <button
                type="button"
                className="campPeriodAddDateButton"
                onClick={addSingleDate}
              >
                ＋ 手動新增單日上課日期
              </button>
            </>
          )}
        </section>
      </div>

      {isFormOpen && (
        <div className="campModalBackdrop">
          <div className="campModal">
            <div className="campModal__header">
              <div>
                <p className="campEyebrow">NEW PERIOD</p>
                <h2>建立活動梯次</h2>
              </div>

              <button
                type="button"
                className="campModal__close"
                onClick={() => setIsFormOpen(false)}
              >
                ×
              </button>
            </div>

            <form
              className="campForm"
              onSubmit={handleCreatePeriod}
            >
              <label className="campForm__field">
                <span>梯次名稱 *</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：2027寒假第一梯"
                />
              </label>

              <div className="campForm__dateGrid">
                <label className="campForm__field">
                  <span>開始日期 *</span>
                  <input
                    type="date"
                    value={formData.start_date}
                    min={camp.start_date}
                    max={camp.end_date}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        start_date: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="campForm__field">
                  <span>結束日期 *</span>
                  <input
                    type="date"
                    value={formData.end_date}
                    min={formData.start_date || camp.start_date}
                    max={camp.end_date}
                    onChange={(event) =>
                      setFormData((current) => ({
                        ...current,
                        end_date: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <div className="campModal__actions">
                <button
                  type="button"
                  className="campSecondaryButton"
                  onClick={() => setIsFormOpen(false)}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="campPrimaryButton"
                  disabled={isSaving}
                >
                  {isSaving ? "建立中…" : "建立梯次"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CampPeriodsPanel;