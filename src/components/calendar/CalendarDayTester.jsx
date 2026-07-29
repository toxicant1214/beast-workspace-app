import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { getCalendarDay } from "../../utils/calendarEngine";

function CalendarDayTester({
  semesterId,
  semesterStartDate,
  semesterEndDate,
}) {
  const [selectedDate, setSelectedDate] = useState("");
  const [dayOverrides, setDayOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!semesterId) {
      setDayOverrides([]);
      setSelectedDate("");
      return;
    }

    setSelectedDate(semesterStartDate || "");
    loadDayOverrides();
  }, [semesterId, semesterStartDate]);

  async function loadDayOverrides() {
    if (!semesterId) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("calendar_day_overrides")
        .select(
          "id, semester_id, override_date, override_type, title, notes"
        )
        .eq("semester_id", semesterId)
        .order("override_date", { ascending: true });

      if (error) {
        throw error;
      }

      setDayOverrides(data || []);
    } catch (error) {
      console.error("讀取日期設定失敗：", error);

      setDayOverrides([]);

      setErrorMessage(
        error?.message
          ? `讀取日期設定失敗：${error.message}`
          : "讀取日期設定失敗，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }

  const result = selectedDate
    ? getCalendarDay({
        date: selectedDate,
        semesterStartDate,
        semesterEndDate,
        dayOverrides,
      })
    : null;

  function getResultClassName(calendarDay) {
    if (!calendarDay) {
      return "";
    }

    if (!calendarDay.isValid || !calendarDay.isWithinSemester) {
      return "calendar-day-result--neutral";
    }

    if (calendarDay.isWorkday) {
      return "calendar-day-result--workday";
    }

    return "calendar-day-result--closed";
  }

  return (
    <section className="calendar-day-tester">
      <div className="calendar-day-tester__heading">
        <div>
          <p className="semester-card-kicker">
            CALENDAR ENGINE
          </p>

          <h3>日期判斷測試</h3>

          <span>
            選擇一天，確認系統是否判斷為上課日或休假日。
          </span>
        </div>

        <button
          type="button"
          className="calendar-secondary-button"
          onClick={loadDayOverrides}
          disabled={loading}
        >
          {loading ? "更新中…" : "重新讀取"}
        </button>
      </div>

      {errorMessage && (
        <div className="calendar-message calendar-message--error">
          {errorMessage}
        </div>
      )}

      <div className="calendar-day-tester__body">
        <label className="calendar-field">
          <span>測試日期</span>

          <input
            type="date"
            value={selectedDate}
            min={semesterStartDate || undefined}
            max={semesterEndDate || undefined}
            onChange={(event) =>
              setSelectedDate(event.target.value)
            }
          />
        </label>

        {result && (
          <article
            className={`calendar-day-result ${getResultClassName(
              result
            )}`}
          >
            <div className="calendar-day-result__status">
              <span>
                {result.isWorkday ? "可以上課" : "不上課"}
              </span>

              <strong>{result.typeLabel}</strong>
            </div>

            <div className="calendar-day-result__content">
              <h4>{result.title}</h4>

              <p>
                日期：{result.date}
              </p>

              <p>
                判斷來源：
                {result.source === "OVERRIDE"
                  ? "學期重要日期設定"
                  : result.source === "WEEKLY_RULE"
                    ? "每週固定規則"
                    : result.source ===
                        "OUTSIDE_SEMESTER"
                      ? "學期範圍"
                      : "系統判斷"}
              </p>

              {result.notes && (
                <p>備註：{result.notes}</p>
              )}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

export default CalendarDayTester;