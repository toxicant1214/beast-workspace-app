import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const WEEKDAYS = [
  {
    value: 1,
    label: "星期一",
    column: "monday_time",
  },
  {
    value: 2,
    label: "星期二",
    column: "tuesday_time",
  },
  {
    value: 3,
    label: "星期三",
    column: "wednesday_time",
  },
  {
    value: 4,
    label: "星期四",
    column: "thursday_time",
  },
  {
    value: 5,
    label: "星期五",
    column: "friday_time",
  },
];

function normalizeTime(value) {
  if (!value) {
    return "";
  }

  return String(value).slice(0, 5);
}

function buildScheduleRows(rules) {
  const rowMap = new Map();

  rules.forEach((rule) => {
    WEEKDAYS.forEach((weekday) => {
      const pickupTime = normalizeTime(
        rule[weekday.column]
      );

      if (!pickupTime) {
        return;
      }

      const key = [
        rule.school,
        weekday.value,
        pickupTime,
      ].join("|");

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          key,
          school: rule.school,
          weekday: weekday.value,
          weekdayLabel: weekday.label,
          pickup_time: pickupTime,
        });
      }
    });
  });

  return Array.from(rowMap.values()).sort((a, b) => {
    const schoolCompare = a.school.localeCompare(
      b.school,
      "zh-Hant"
    );

    if (schoolCompare !== 0) {
      return schoolCompare;
    }

    if (a.weekday !== b.weekday) {
      return a.weekday - b.weekday;
    }

    return a.pickup_time.localeCompare(
      b.pickup_time
    );
  });
}

function TeacherTags({
  names,
  inputValue,
  disabled,
  onInputChange,
  onAdd,
  onRemove,
}) {
  function handleKeyDown(event) {
    if (
      event.key === "Enter" ||
      event.key === ","
    ) {
      event.preventDefault();
      onAdd();
    }
  }

  return (
    <div className="pickupStaffTagEditor">
      <div className="pickupStaffTags">
        {names.map((name) => (
          <span
            key={name}
            className="pickupStaffTag"
          >
            {name}

            <button
              type="button"
              aria-label={`移除 ${name}`}
              disabled={disabled}
              onClick={() => onRemove(name)}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="pickupStaffInputRow">
        <input
          type="text"
          value={inputValue}
          disabled={disabled}
          placeholder={
            names.length === 0
              ? "輸入老師姓名"
              : "繼續新增老師"
          }
          onChange={(event) =>
            onInputChange(event.target.value)
          }
          onKeyDown={handleKeyDown}
        />

        <button
          type="button"
          className="pickupStaffAddButton"
          disabled={
            disabled || !inputValue.trim()
          }
          onClick={onAdd}
        >
          新增
        </button>
      </div>

      <small>
        輸入姓名後按 Enter，也可以一次加入多位老師。
      </small>
    </div>
  );
}

function PickupStaffPanel() {
  const [rules, setRules] = useState([]);
  const [staffRules, setStaffRules] =
    useState([]);

  const [selectedSchool, setSelectedSchool] =
    useState("");

  const [teacherInputs, setTeacherInputs] =
    useState({});

  const [isLoading, setIsLoading] =
    useState(true);

  const [savingKey, setSavingKey] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [
      pickupRulesResult,
      staffRulesResult,
    ] = await Promise.all([
      supabase
        .from("pickup_rules")
        .select(
          `
            id,
            school,
            grade_group,
            monday_time,
            tuesday_time,
            wednesday_time,
            thursday_time,
            friday_time,
            is_active
          `
        )
        .eq("is_active", true)
        .order("school"),

      supabase
        .from("pickup_staff_rules")
        .select(
          `
            id,
            school,
            weekday,
            pickup_time,
            staff_names,
            note,
            is_active
          `
        )
        .eq("is_active", true)
        .order("school")
        .order("weekday")
        .order("pickup_time"),
    ]);

    if (pickupRulesResult.error) {
      console.error(
        pickupRulesResult.error
      );

      setErrorMessage(
        `讀取接車規則失敗：${pickupRulesResult.error.message}`
      );

      setIsLoading(false);
      return;
    }

    if (staffRulesResult.error) {
      console.error(
        staffRulesResult.error
      );

      setErrorMessage(
        `讀取接車老師失敗：${staffRulesResult.error.message}`
      );

      setIsLoading(false);
      return;
    }

    const nextRules =
      pickupRulesResult.data ?? [];

    setRules(nextRules);

    setStaffRules(
      staffRulesResult.data ?? []
    );

    const schools = Array.from(
      new Set(
        nextRules
          .map((rule) => rule.school)
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b, "zh-Hant")
    );

    setSelectedSchool((current) => {
      if (
        current &&
        schools.includes(current)
      ) {
        return current;
      }

      return schools[0] ?? "";
    });

    setIsLoading(false);
  }

  const scheduleRows = useMemo(
    () => buildScheduleRows(rules),
    [rules]
  );

  const schools = useMemo(() => {
    return Array.from(
      new Set(
        scheduleRows.map(
          (row) => row.school
        )
      )
    ).sort((a, b) =>
      a.localeCompare(b, "zh-Hant")
    );
  }, [scheduleRows]);

  const selectedRows = useMemo(() => {
    return scheduleRows.filter(
      (row) =>
        row.school === selectedSchool
    );
  }, [scheduleRows, selectedSchool]);

  const rowsByWeekday = useMemo(() => {
    return WEEKDAYS.map((weekday) => ({
      ...weekday,
      rows: selectedRows.filter(
        (row) =>
          row.weekday === weekday.value
      ),
    }));
  }, [selectedRows]);

  function findStaffRule(row) {
    return staffRules.find(
      (item) =>
        item.school === row.school &&
        Number(item.weekday) ===
          Number(row.weekday) &&
        normalizeTime(item.pickup_time) ===
          normalizeTime(row.pickup_time)
    );
  }

  function getStaffNames(row) {
    const staffRule =
      findStaffRule(row);

    if (
      !Array.isArray(staffRule?.staff_names)
    ) {
      return [];
    }

    return staffRule.staff_names;
  }

  function updateTeacherInput(
    rowKey,
    value
  ) {
    setTeacherInputs((current) => ({
      ...current,
      [rowKey]: value,
    }));
  }

  async function saveStaffNames(
    row,
    nextNames
  ) {
    setSavingKey(row.key);
    setErrorMessage("");

    const cleanedNames = Array.from(
      new Set(
        nextNames
          .map((name) => name.trim())
          .filter(Boolean)
      )
    );

    const existingRule =
      findStaffRule(row);

    const payload = {
      school: row.school,
      weekday: row.weekday,
      pickup_time: row.pickup_time,
      staff_names: cleanedNames,
      is_active: true,
      updated_at:
        new Date().toISOString(),
    };

    let result;

    if (existingRule) {
      result = await supabase
        .from("pickup_staff_rules")
        .update(payload)
        .eq("id", existingRule.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("pickup_staff_rules")
        .insert({
          ...payload,
          created_at:
            new Date().toISOString(),
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error(result.error);

      setErrorMessage(
        `儲存失敗：${result.error.message}`
      );

      setSavingKey("");
      return;
    }

    setStaffRules((current) => {
      const exists = current.some(
        (item) =>
          item.id === result.data.id
      );

      if (exists) {
        return current.map((item) =>
          item.id === result.data.id
            ? result.data
            : item
        );
      }

      return [
        ...current,
        result.data,
      ];
    });

    setSavingKey("");
  }

  async function addTeacher(row) {
    const inputValue =
      teacherInputs[row.key] ?? "";

    const newNames = inputValue
      .split(/[,，、]/)
      .map((name) => name.trim())
      .filter(Boolean);

    if (newNames.length === 0) {
      return;
    }

    const currentNames =
      getStaffNames(row);

    const nextNames = [
      ...currentNames,
      ...newNames,
    ];

    updateTeacherInput(row.key, "");

    await saveStaffNames(
      row,
      nextNames
    );
  }

  async function removeTeacher(
    row,
    teacherName
  ) {
    const nextNames = getStaffNames(
      row
    ).filter(
      (name) => name !== teacherName
    );

    await saveStaffNames(
      row,
      nextNames
    );
  }

  if (isLoading) {
    return (
      <section className="pickupPanel">
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">
            👩🏻‍🏫
          </span>

          <h2>正在讀取接車老師安排</h2>

          <p>請稍候一下。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="pickupPanel pickupStaffPanel">
      <div className="pickupStaffHeader">
        <div>
          <p className="eyebrow">
            SEMESTER STAFF SCHEDULE
          </p>

          <h2>學期固定接車老師</h2>

          <p>
            接車時間會自動沿用接車規則，
            老師姓名可直接手動輸入多人。
          </p>
        </div>

        <button
          type="button"
          className="pickupStaffRefreshButton"
          onClick={loadData}
        >
          重新整理
        </button>
      </div>

      {errorMessage && (
        <div className="pickupStaffError">
          {errorMessage}
        </div>
      )}

      {schools.length === 0 ? (
        <div className="pickupEmptyState">
          <span className="pickupEmptyState__icon">
            ⚙️
          </span>

          <h2>尚未建立接車規則</h2>

          <p>
            請先到「接車規則」設定學校與星期時間，
            系統才會產生可安排老師的時段。
          </p>
        </div>
      ) : (
        <div className="pickupStaffLayout">
          <aside className="pickupStaffSchoolList">
            <p className="pickupStaffSchoolList__title">
              選擇學校
            </p>

            {schools.map((school) => (
              <button
                key={school}
                type="button"
                className={
                  selectedSchool === school
                    ? "pickupStaffSchoolButton active"
                    : "pickupStaffSchoolButton"
                }
                onClick={() =>
                  setSelectedSchool(school)
                }
              >
                <span>{school}</span>

                <small>
                  {
                    scheduleRows.filter(
                      (row) =>
                        row.school === school
                    ).length
                  }{" "}
                  個時段
                </small>
              </button>
            ))}
          </aside>

          <div className="pickupStaffSchedule">
            <div className="pickupStaffScheduleHeader">
              <div>
                <p className="eyebrow">
                  SELECTED SCHOOL
                </p>

                <h3>{selectedSchool}</h3>
              </div>

              <span>
                整學期固定使用
              </span>
            </div>

            <div className="pickupStaffWeekList">
              {rowsByWeekday.map(
                (weekday) => (
                  <div
                    key={weekday.value}
                    className="pickupStaffWeekCard"
                  >
                    <div className="pickupStaffWeekCard__header">
                      <strong>
                        {weekday.label}
                      </strong>

                      <span>
                        {weekday.rows.length}
                        個接車時段
                      </span>
                    </div>

                    {weekday.rows.length ===
                    0 ? (
                      <div className="pickupStaffNoSchedule">
                        本日無接車安排
                      </div>
                    ) : (
                      <div className="pickupStaffTimeList">
                        {weekday.rows.map(
                          (row) => {
                            const names =
                              getStaffNames(
                                row
                              );

                            const isSaving =
                              savingKey ===
                              row.key;

                            return (
                              <div
                                key={row.key}
                                className="pickupStaffTimeRow"
                              >
                                <div className="pickupStaffTime">
                                  <small>
                                    接車時間
                                  </small>

                                  <strong>
                                    {
                                      row.pickup_time
                                    }
                                  </strong>
                                </div>

                                <TeacherTags
                                  names={names}
                                  inputValue={
                                    teacherInputs[
                                      row.key
                                    ] ?? ""
                                  }
                                  disabled={
                                    isSaving
                                  }
                                  onInputChange={(
                                    value
                                  ) =>
                                    updateTeacherInput(
                                      row.key,
                                      value
                                    )
                                  }
                                  onAdd={() =>
                                    addTeacher(
                                      row
                                    )
                                  }
                                  onRemove={(
                                    name
                                  ) =>
                                    removeTeacher(
                                      row,
                                      name
                                    )
                                  }
                                />

                                <div className="pickupStaffSaveStatus">
                                  {isSaving
                                    ? "儲存中…"
                                    : names.length >
                                        0
                                      ? "已儲存"
                                      : "尚未安排"}
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default PickupStaffPanel;