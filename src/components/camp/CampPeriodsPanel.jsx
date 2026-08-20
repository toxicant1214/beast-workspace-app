import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";


const DAY_TYPES = [
  {
    value: "GENERAL",
    label: "一般常規上課",
  },
  {
    value: "FIELD_TRIP",
    label: "戶外教學日",
  },
  {
    value: "OVERNIGHT",
    label: "兩天一夜",
  },
  {
    value: "CLOSED",
    label: "不開課",
  },
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


function parseDateKey(
  dateKey
) {
  if (!dateKey) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] = String(
    dateKey
  )
    .split("-")
    .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}


function toDateKey(
  date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}


function addDays(
  dateKey,
  amount
) {
  const date =
    parseDateKey(
      dateKey
    );

  if (!date) {
    return "";
  }

  date.setDate(
    date.getDate() +
      amount
  );

  return toDateKey(
    date
  );
}


function getAllDates(
  startDate,
  endDate
) {
  const start =
    parseDateKey(
      startDate
    );

  const end =
    parseDateKey(
      endDate
    );

  if (
    !start ||
    !end
  ) {
    return [];
  }

  const result = [];
  const current =
    new Date(start);

  while (
    current <= end
  ) {
    result.push(
      toDateKey(
        current
      )
    );

    current.setDate(
      current.getDate() +
        1
    );
  }

  return result;
}


function getWeekdayDates(
  startDate,
  endDate
) {
  return getAllDates(
    startDate,
    endDate
  ).filter(
    (dateKey) => {
      const date =
        parseDateKey(
          dateKey
        );

      const weekday =
        date.getDay();

      return (
        weekday !== 0 &&
        weekday !== 6
      );
    }
  );
}


function formatDate(
  dateKey
) {
  if (!dateKey) {
    return "—";
  }

  return String(
    dateKey
  ).replaceAll(
    "-",
    "/"
  );
}


function rangesOverlap(
  startA,
  endA,
  startB,
  endB
) {
  return (
    startA <= endB &&
    endA >= startB
  );
}


function CampPeriodsPanel({
  camp,
  onBack,
}) {
  const [
    periods,
    setPeriods,
  ] = useState([]);

  const [
    selectedPeriodId,
    setSelectedPeriodId,
  ] = useState("");

  const [
    periodDates,
    setPeriodDates,
  ] = useState([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    isFormOpen,
    setIsFormOpen,
  ] = useState(false);

  const [
    formData,
    setFormData,
  ] = useState({
    name: "",
    start_date:
      camp.start_date ||
      "",
    end_date:
      camp.start_date ||
      "",
  });

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);


  useEffect(() => {
    loadPeriods();
  }, [camp.id]);


  useEffect(() => {
    if (
      selectedPeriodId
    ) {
      loadPeriodDates(
        selectedPeriodId
      );
    } else {
      setPeriodDates([]);
    }
  }, [
    selectedPeriodId,
    periods,
  ]);


  async function loadPeriods() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const {
        data,
        error,
      } = await supabase
        .from(
          "camp_periods"
        )
        .select(`
          id,
          name,
          start_date,
          end_date,
          sort_order
        `)
        .eq(
          "camp_id",
          camp.id
        )
        .order(
          "sort_order",
          {
            ascending: true,
          }
        )
        .order(
          "start_date",
          {
            ascending: true,
          }
        );

      if (error) {
        throw error;
      }

      const rows =
        data ?? [];

      setPeriods(
        rows
      );

      setSelectedPeriodId(
        (current) => {
          if (
            current &&
            rows.some(
              (item) =>
                item.id ===
                current
            )
          ) {
            return current;
          }

          return (
            rows[0]?.id ||
            ""
          );
        }
      );
    } catch (error) {
      console.error(
        "讀取活動梯次失敗：",
        error
      );

      setErrorMessage(
        `讀取失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }


  async function loadPeriodDates(
    periodId
  ) {
    try {
      setErrorMessage("");

      const period =
        periods.find(
          (item) =>
            item.id ===
            periodId
        );

      if (!period) {
        return;
      }

      const {
        data,
        error,
      } = await supabase
        .from(
          "camp_period_dates"
        )
        .select(`
          id,
          camp_date,
          day_type,
          note
        `)
        .eq(
          "camp_id",
          camp.id
        )
        .eq(
          "period_id",
          periodId
        )
        .order(
          "camp_date",
          {
            ascending: true,
          }
        );

      if (error) {
        throw error;
      }

      if (
        (data ?? [])
          .length > 0
      ) {
        setPeriodDates(
          data
        );
        return;
      }

      const defaultDates =
        getWeekdayDates(
          period.start_date,
          period.end_date
        );

      if (
        defaultDates.length ===
        0
      ) {
        setPeriodDates([]);
        return;
      }

      const {
        data:
          insertedRows,
        error:
          insertError,
      } = await supabase
        .from(
          "camp_period_dates"
        )
        .insert(
          defaultDates.map(
            (dateKey) => ({
              camp_id:
                camp.id,
              period_id:
                periodId,
              camp_date:
                dateKey,
              day_type:
                "GENERAL",
            })
          )
        )
        .select(`
          id,
          camp_date,
          day_type,
          note
        `);

      if (insertError) {
        throw insertError;
      }

      setPeriodDates(
        [
          ...(
            insertedRows ??
            []
          ),
        ].sort(
          (a, b) =>
            String(
              a.camp_date
            ).localeCompare(
              String(
                b.camp_date
              )
            )
        )
      );
    } catch (error) {
      console.error(
        "讀取梯次日期失敗：",
        error
      );

      setErrorMessage(
        `讀取日期失敗：${error.message}`
      );
    }
  }


  const selectedPeriod =
    useMemo(
      () =>
        periods.find(
          (item) =>
            item.id ===
            selectedPeriodId
        ) || null,
      [
        periods,
        selectedPeriodId,
      ]
    );


  function findNextAvailableDate() {
    if (
      periods.length ===
      0
    ) {
      return (
        camp.start_date ||
        ""
      );
    }

    const sorted = [
      ...periods,
    ].sort(
      (a, b) =>
        String(
          a.end_date
        ).localeCompare(
          String(
            b.end_date
          )
        )
    );

    let candidate =
      addDays(
        sorted[
          sorted.length -
            1
        ].end_date,
        1
      );

    while (
      candidate &&
      candidate <=
        camp.end_date
    ) {
      const date =
        parseDateKey(
          candidate
        );

      const weekday =
        date.getDay();

      const occupied =
        periods.some(
          (period) =>
            candidate >=
              period.start_date &&
            candidate <=
              period.end_date
        );

      if (
        !occupied &&
        weekday !== 0 &&
        weekday !== 6
      ) {
        return candidate;
      }

      candidate =
        addDays(
          candidate,
          1
        );
    }

    return "";
  }


  function openCreateForm() {
    const nextStart =
      findNextAvailableDate();

    setFormData({
      name: "",
      start_date:
        nextStart,
      end_date:
        nextStart,
    });

    setErrorMessage("");
    setIsFormOpen(true);
  }


  function getAvailableEndDates() {
    if (
      !formData.start_date
    ) {
      return [];
    }

    const all =
      getAllDates(
        formData.start_date,
        camp.end_date
      );

    const result = [];

    for (
      const dateKey
      of all
    ) {
      const wouldOverlap =
        periods.some(
          (period) =>
            rangesOverlap(
              formData.start_date,
              dateKey,
              period.start_date,
              period.end_date
            )
        );

      if (
        wouldOverlap
      ) {
        break;
      }

      result.push(
        dateKey
      );
    }

    return result;
  }


  const availableStartDates =
    useMemo(() => {
      return getAllDates(
        camp.start_date,
        camp.end_date
      ).filter(
        (dateKey) => {
          const occupied =
            periods.some(
              (period) =>
                dateKey >=
                  period.start_date &&
                dateKey <=
                  period.end_date
            );

          return !occupied;
        }
      );
    }, [
      camp.start_date,
      camp.end_date,
      periods,
    ]);


  const availableEndDates =
    useMemo(
      () =>
        getAvailableEndDates(),
      [
        formData.start_date,
        periods,
        camp.end_date,
      ]
    );


  async function handleCreatePeriod(
    event
  ) {
    event.preventDefault();

    if (
      !formData.name.trim()
    ) {
      setErrorMessage(
        "請輸入梯次名稱。"
      );
      return;
    }

    if (
      !formData.start_date ||
      !formData.end_date
    ) {
      setErrorMessage(
        "請選擇梯次起迄日期。"
      );
      return;
    }

    if (
      formData.end_date <
      formData.start_date
    ) {
      setErrorMessage(
        "結束日期不能早於開始日期。"
      );
      return;
    }

    const hasOverlap =
      periods.some(
        (period) =>
          rangesOverlap(
            formData.start_date,
            formData.end_date,
            period.start_date,
            period.end_date
          )
      );

    if (hasOverlap) {
      setErrorMessage(
        "此日期區間已與其他梯次重疊，請重新選擇。"
      );
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      const nextSortOrder =
        periods.length ===
        0
          ? 0
          : Math.max(
              ...periods.map(
                (item) =>
                  Number(
                    item.sort_order ||
                      0
                  )
              )
            ) + 1;

      const {
        data,
        error,
      } = await supabase
        .from(
          "camp_periods"
        )
        .insert({
          camp_id:
            camp.id,
          name:
            formData.name.trim(),
          start_date:
            formData.start_date,
          end_date:
            formData.end_date,
          sort_order:
            nextSortOrder,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const dates =
        getWeekdayDates(
          formData.start_date,
          formData.end_date
        );

      if (
        dates.length > 0
      ) {
        const {
          error:
            dateError,
        } = await supabase
          .from(
            "camp_period_dates"
          )
          .insert(
            dates.map(
              (dateKey) => ({
                camp_id:
                  camp.id,
                period_id:
                  data.id,
                camp_date:
                  dateKey,
                day_type:
                  "GENERAL",
              })
            )
          );

        if (dateError) {
          throw dateError;
        }
      }

      setPeriods(
        (current) => [
          ...current,
          data,
        ]
      );

      setSelectedPeriodId(
        data.id
      );

      setIsFormOpen(
        false
      );

      setFormData({
        name: "",
        start_date: "",
        end_date: "",
      });
    } catch (error) {
      console.error(
        "建立梯次失敗：",
        error
      );

      setErrorMessage(
        `建立失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }


  async function updateDayType(
    row,
    dayType
  ) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from(
          "camp_period_dates"
        )
        .update({
          day_type:
            dayType,
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          row.id
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      setPeriodDates(
        (current) =>
          current.map(
            (item) =>
              item.id ===
                data.id
                ? data
                : item
          )
      );
    } catch (error) {
      console.error(
        "更新日期類型失敗：",
        error
      );

      setErrorMessage(
        `更新失敗：${error.message}`
      );
    }
  }


  async function addSingleDate() {
    if (
      !selectedPeriod
    ) {
      return;
    }

    const dateKey =
      window.prompt(
        "請輸入要新增的日期（YYYY-MM-DD）"
      );

    if (!dateKey) {
      return;
    }

    try {
      const {
        data,
        error,
      } = await supabase
        .from(
          "camp_period_dates"
        )
        .insert({
          camp_id:
            camp.id,
          period_id:
            selectedPeriod.id,
          camp_date:
            dateKey,
          day_type:
            "GENERAL",
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      setPeriodDates(
        (current) =>
          [
            ...current,
            data,
          ].sort(
            (a, b) =>
              String(
                a.camp_date
              ).localeCompare(
                String(
                  b.camp_date
                )
              )
          )
      );
    } catch (error) {
      console.error(
        "新增單日失敗：",
        error
      );

      setErrorMessage(
        `新增單日失敗：${error.message}`
      );
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
            onClick={
              onBack
            }
          >
            ← 返回營隊資料夾
          </button>

          <p className="campEyebrow">
            CAMP PERIODS
          </p>

          <h2>
            活動梯次與日期設定
          </h2>

          <p>
            {camp.name}
          </p>
        </div>

        <button
          type="button"
          className="campPrimaryButton"
          onClick={
            openCreateForm
          }
          disabled={
            availableStartDates.length ===
            0
          }
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
            <span>
              {periods.length}
            </span>
          </div>

          {periods.length ===
          0 ? (
            <div className="campPeriodSidebarEmpty">
              尚未建立梯次
            </div>
          ) : (
            periods.map(
              (period) => (
                <button
                  key={
                    period.id
                  }
                  type="button"
                  className={[
                    "campPeriodSelectCard",
                    selectedPeriodId ===
                    period.id
                      ? "is-active"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() =>
                    setSelectedPeriodId(
                      period.id
                    )
                  }
                >
                  <strong>
                    {period.name}
                  </strong>

                  <span>
                    {formatDate(
                      period.start_date
                    )}
                    {" ～ "}
                    {formatDate(
                      period.end_date
                    )}
                  </span>
                </button>
              )
            )
          )}
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
                    每日課程屬性設定－
                    {selectedPeriod.name}
                  </h3>

                  <p>
                    共{" "}
                    {periodDates.length}{" "}
                    個活動日
                  </p>
                </div>
              </div>


              <div className="campPeriodDateGrid">
                {periodDates.map(
                  (row) => {
                    const date =
                      parseDateKey(
                        row.camp_date
                      );

                    return (
                      <article
                        key={
                          row.id
                        }
                        className="campPeriodDateCard"
                      >
                        <div>
                          <strong>
                            {
                              row.camp_date
                            }
                          </strong>

                          <span>
                            {
                              WEEKDAY_LABELS[
                                date.getDay()
                              ]
                            }
                          </span>
                        </div>

                        <select
                          value={
                            row.day_type
                          }
                          onChange={(
                            event
                          ) =>
                            updateDayType(
                              row,
                              event.target
                                .value
                            )
                          }
                        >
                          {DAY_TYPES.map(
                            (option) => (
                              <option
                                key={
                                  option.value
                                }
                                value={
                                  option.value
                                }
                              >
                                {
                                  option.label
                                }
                              </option>
                            )
                          )}
                        </select>
                      </article>
                    );
                  }
                )}
              </div>


              <button
                type="button"
                className="campPeriodAddDateButton"
                onClick={
                  addSingleDate
                }
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
                <p className="campEyebrow">
                  NEW PERIOD
                </p>

                <h2>
                  建立活動梯次
                </h2>
              </div>

              <button
                type="button"
                className="campModal__close"
                onClick={() =>
                  setIsFormOpen(
                    false
                  )
                }
              >
                ×
              </button>
            </div>


            <form
              className="campForm"
              onSubmit={
                handleCreatePeriod
              }
            >
              <label className="campForm__field">
                <span>
                  梯次名稱 *
                </span>

                <input
                  type="text"
                  value={
                    formData.name
                  }
                  onChange={(
                    event
                  ) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        name:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="例如：2027寒假第二梯"
                  autoFocus
                />
              </label>


              <div className="campForm__dateGrid">
                <label className="campForm__field">
                  <span>
                    開始日期 *
                  </span>

                  <select
                    value={
                      formData.start_date
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      setFormData(
                        (current) => ({
                          ...current,
                          start_date:
                            value,
                          end_date:
                            value,
                        })
                      );
                    }}
                  >
                    <option value="">
                      請選擇開始日期
                    </option>

                    {availableStartDates.map(
                      (dateKey) => (
                        <option
                          key={
                            dateKey
                          }
                          value={
                            dateKey
                          }
                        >
                          {
                            formatDate(
                              dateKey
                            )
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>


                <label className="campForm__field">
                  <span>
                    結束日期 *
                  </span>

                  <select
                    value={
                      formData.end_date
                    }
                    disabled={
                      !formData.start_date
                    }
                    onChange={(
                      event
                    ) =>
                      setFormData(
                        (current) => ({
                          ...current,
                          end_date:
                            event.target
                              .value,
                        })
                      )
                    }
                  >
                    <option value="">
                      請選擇結束日期
                    </option>

                    {availableEndDates.map(
                      (dateKey) => (
                        <option
                          key={
                            dateKey
                          }
                          value={
                            dateKey
                          }
                        >
                          {
                            formatDate(
                              dateKey
                            )
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>
              </div>


              <p className="campPeriodFormHint">
                已使用在其他梯次的日期不會出現在可選範圍內，
                新梯次也不能與既有梯次重疊。
              </p>


              <div className="campModal__actions">
                <button
                  type="button"
                  className="campSecondaryButton"
                  onClick={() =>
                    setIsFormOpen(
                      false
                    )
                  }
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="campPrimaryButton"
                  disabled={
                    isSaving
                  }
                >
                  {isSaving
                    ? "建立中…"
                    : "建立梯次"}
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