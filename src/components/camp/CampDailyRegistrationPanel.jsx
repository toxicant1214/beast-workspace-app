import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../../lib/supabase";

const GRADE_OPTIONS = [
  { value: "K", label: "幼兒園" },
  { value: "G1", label: "一年級" },
  { value: "G2", label: "二年級" },
  { value: "G3", label: "三年級" },
  { value: "G4", label: "四年級" },
  { value: "G5", label: "五年級" },
  { value: "G6", label: "六年級" },
  { value: "GRADUATED", label: "畢業生" },
];

const GRADE_ORDER = GRADE_OPTIONS.reduce(
  (result, item, index) => ({
    ...result,
    [item.value]: index,
  }),
  {}
);

const WEEKDAY_LABELS = [
  "週日",
  "週一",
  "週二",
  "週三",
  "週四",
  "週五",
  "週六",
];

function getGradeLabel(value) {
  return (
    GRADE_OPTIONS.find((item) => item.value === value)?.label ||
    value ||
    "—"
  );
}

function parseDateKey(dateKey) {
  if (!dateKey) return null;

  const [year, month, day] = String(dateKey)
    .split("-")
    .map(Number);

  if (!year || !month || !day) return null;

  return new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0
  );
}

function normalizeType(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isOvernightDay(dayMeta) {
  const dayType = String(
    dayMeta?.day_type || ""
  ).trim();

  const title = String(
    dayMeta?.title || ""
  ).trim();

  const normalizedDayType =
    dayType.toUpperCase();

  const normalizedTitle =
    title.toUpperCase();

  return (
    dayType.includes("兩天一夜") ||
    title.includes("兩天一夜") ||
    normalizedDayType.includes("OVERNIGHT") ||
    normalizedDayType.includes("CAMP") ||
    normalizedTitle.includes("OVERNIGHT")
  );
}

function isOutdoorDay(dayMeta) {
  const dayType = String(
    dayMeta?.day_type || ""
  ).trim();

  const title = String(
    dayMeta?.title || ""
  ).trim();

  const normalizedDayType =
    dayType.toUpperCase();

  const normalizedTitle =
    title.toUpperCase();

  return (
    dayType.includes("戶外教學") ||
    title.includes("戶外教學") ||
    dayType.includes("戶外") ||
    title.includes("戶外") ||
    normalizedDayType.includes("OUTDOOR") ||
    normalizedDayType.includes("FIELD") ||
    normalizedTitle.includes("OUTDOOR")
  );
}

function createEmptyRecord() {
  return {
    registered: false,
    status: "NORMAL",
    morning: true,
    afternoon: true,
    meal: true,
    talent: false,
    overnight_mode: "",
    outdoor_joined: false,
    leave_type: "",
    note: "",
  };
}

function CampDailyRegistrationPanel({
  camp,
  onBack,
}) {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");

  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const [periodDates, setPeriodDates] = useState([]);
  const [dayMetaRows, setDayMetaRows] = useState([]);

  const [recordsByDate, setRecordsByDate] = useState({});

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingStudent, setIsLoadingStudent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const recordsRef = useRef({});
  const selectedStudentRef = useRef("");
  const activeDatesRef = useRef([]);

  useEffect(() => {
    loadPeriods();
  }, [camp.id]);

  useEffect(() => {
    if (!selectedPeriodId) {
      setStudents([]);
      setSelectedStudentId("");
      setPeriodDates([]);
      setDayMetaRows([]);
      return;
    }

    loadPeriodStudents(selectedPeriodId);
    loadPeriodDates(selectedPeriodId);
  }, [selectedPeriodId]);

  const selectedPeriod = useMemo(
    () =>
      periods.find(
        (period) =>
          period.id === selectedPeriodId
      ) || null,
    [
      periods,
      selectedPeriodId,
    ]
  );

  const activeDates = useMemo(
    () =>
      periodDates.map(
        (item) => item.camp_date
      ),
    [periodDates]
  );

  const dayMetaByDate = useMemo(() => {
    const map = new Map();

    for (const row of dayMetaRows) {
      map.set(
        row.camp_date,
        row
      );
    }

    return map;
  }, [dayMetaRows]);

  useEffect(() => {
    recordsRef.current =
      recordsByDate;
  }, [recordsByDate]);

  useEffect(() => {
    selectedStudentRef.current =
      selectedStudentId;
  }, [selectedStudentId]);

  useEffect(() => {
    activeDatesRef.current =
      activeDates;
  }, [activeDates]);

  useEffect(() => {
    if (
      !selectedPeriodId ||
      !selectedStudentId ||
      activeDates.length === 0
    ) {
      setRecordsByDate({});
      return;
    }

    loadStudentRecords();
  }, [
    selectedPeriodId,
    selectedStudentId,
    activeDates.join("|"),
  ]);

  async function loadPeriods() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } =
        await supabase
          .from("camp_periods")
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

      if (error) throw error;

      const nextPeriods =
        data ?? [];

      setPeriods(
        nextPeriods
      );

      if (
        nextPeriods.length >
        0
      ) {
        setSelectedPeriodId(
          nextPeriods[0].id
        );
      }
    } catch (error) {
      console.error(
        "讀取每日報名梯次失敗：",
        error
      );

      setErrorMessage(
        `讀取梯次失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPeriodStudents() {
    try {
      setIsLoadingStudent(true);
      setErrorMessage("");
      setSavedMessage("");
      setSelectedStudentId("");

      const { data, error } =
        await supabase
          .from("camp_students")
          .select(`
            id,
            chinese_name,
            grade,
            school
          `)
          .eq(
            "camp_id",
            camp.id
          );

      if (error) throw error;

      const nextStudents =
        (data ?? []).sort(
          (a, b) => {
            const gradeDiff =
              (GRADE_ORDER[
                a.grade
              ] ?? 999) -
              (GRADE_ORDER[
                b.grade
              ] ?? 999);

            if (
              gradeDiff !== 0
            ) {
              return gradeDiff;
            }

            return String(
              a.chinese_name ||
                ""
            ).localeCompare(
              String(
                b.chinese_name ||
                  ""
              ),
              "zh-Hant"
            );
          }
        );

      setStudents(
        nextStudents
      );

      if (
        nextStudents.length >
        0
      ) {
        setSelectedStudentId(
          nextStudents[0].id
        );
      }
    } catch (error) {
      console.error(
        "讀取營隊學生失敗：",
        error
      );

      setErrorMessage(
        `讀取營隊學生失敗：${error.message}`
      );
    } finally {
      setIsLoadingStudent(false);
    }
  }

  async function loadPeriodDates(
    periodId
  ) {
    try {
      setErrorMessage("");

      const { data, error } =
        await supabase
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

      if (error) throw error;

      const nextRows =
        data ?? [];

      setPeriodDates(
        nextRows.map(
          (row) => ({
            camp_date:
              row.camp_date,
          })
        )
      );

      setDayMetaRows(
        nextRows
      );
    } catch (error) {
      console.error(
        "讀取梯次日期設定失敗：",
        error
      );

      setErrorMessage(
        `讀取梯次日期設定失敗：${error.message}`
      );
    }
  }

  async function loadStudentRecords() {
    try {
      setIsLoadingStudent(true);
      setErrorMessage("");
      setSavedMessage("");

      const { data, error } =
        await supabase
          .from(
            "camp_student_daily_records"
          )
          .select(`
            id,
            attendance_status,
            morning,
            afternoon,
            meal,
            talent,
            overnight_mode,
            leave_type,
            note,
            camp_dates (
              id,
              camp_date
            )
          `)
          .eq(
            "camp_id",
            camp.id
          )
          .eq(
            "student_id",
            selectedStudentId
          );

      if (error) throw error;

      const next = {};

      for (
        const dateKey of
        activeDates
      ) {
        next[dateKey] =
          createEmptyRecord();
      }

      for (
        const row of
        data ?? []
      ) {
        const dateKey =
          row.camp_dates
            ?.camp_date;

        if (
          !dateKey ||
          !next[dateKey]
        ) {
          continue;
        }

        const attendanceStatus =
          normalizeType(
            row.attendance_status
          );

        next[dateKey] = {
          registered:
            attendanceStatus !==
            "ABSENT",

          status:
            attendanceStatus ===
            "LEAVE"
              ? "LEAVE"
              : "NORMAL",

          morning:
            row.morning ??
            true,

          afternoon:
            row.afternoon ??
            true,

          meal:
            row.meal ??
            true,

          talent:
            row.talent ??
            false,

          overnight_mode:
            row.overnight_mode === "JOIN"
              ? "JOIN"
              : row.overnight_mode === "INDOOR"
              ? "INDOOR"
              : row.overnight_mode === "ABSENT"
              ? "ABSENT"
              : "",

          outdoor_joined:
            attendanceStatus ===
              "OUTDOOR" ||
            attendanceStatus ===
              "FIELD_TRIP",

          leave_type:
            row.leave_type ||
            "",

          note:
            row.note || "",
        };
      }

      setRecordsByDate(
        next
      );

      recordsRef.current =
        next;

      setHasUnsavedChanges(
        false
      );

      setSavedMessage(
        "✓ 已載入"
      );
    } catch (error) {
      console.error(
        "讀取學生每日報名失敗：",
        error
      );

      setErrorMessage(
        `讀取每日報名失敗：${error.message}`
      );
    } finally {
      setIsLoadingStudent(false);
    }
  }

  function updateRecord(
    dateKey,
    patch
  ) {
    setSavedMessage("");
    setHasUnsavedChanges(
      true
    );

    setRecordsByDate(
      (current) => {
        const next = {
          ...current,

          [dateKey]: {
            ...(
              current[
                dateKey
              ] ||
              createEmptyRecord()
            ),

            ...patch,
          },
        };

        recordsRef.current =
          next;

        return next;
      }
    );
  }

  async function ensureCampDates() {
    const {
      data: existingRows,
      error:
        existingError,
    } = await supabase
      .from("camp_dates")
      .select(
        "id, camp_date"
      )
      .eq(
        "camp_id",
        camp.id
      )
      .in(
        "camp_date",
        activeDates
      );

    if (
      existingError
    ) {
      throw existingError;
    }

    const map = {};

    for (
      const row of
      existingRows ?? []
    ) {
      map[
        row.camp_date
      ] = row.id;
    }

    const missing =
      activeDates.filter(
        (dateKey) =>
          !map[dateKey]
      );

    if (
      missing.length >
      0
    ) {
      const {
        data:
          insertedRows,
        error:
          insertError,
      } = await supabase
        .from(
          "camp_dates"
        )
        .insert(
          missing.map(
            (dateKey) => ({
              camp_id:
                camp.id,

              camp_date:
                dateKey,

              day_type:
                "GENERAL",
            })
          )
        )
        .select(
          "id, camp_date"
        );

      if (
        insertError
      ) {
        throw insertError;
      }

      for (
        const row of
        insertedRows ?? []
      ) {
        map[
          row.camp_date
        ] = row.id;
      }
    }

    return map;
  }

  async function saveCurrentStudent() {
    const studentId =
      selectedStudentRef.current;

    const dates =
      activeDatesRef.current;

    const records =
      recordsRef.current;

    if (
      !studentId ||
      !selectedPeriod ||
      dates.length === 0
    ) {
      return true;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");
      setSavedMessage(
        "儲存中…"
      );

      const dateIdMap =
        await ensureCampDates();

      const rows =
        dates.map(
          (dateKey) => {
            const record =
              records[
                dateKey
              ] ||
              createEmptyRecord();

            const dayMeta =
              dayMetaByDate.get(
                dateKey
              );

            const overnightDay =
              isOvernightDay(
                dayMeta
              );

            const outdoorDay =
              isOutdoorDay(
                dayMeta
              );

            let attendanceStatus =
              "ABSENT";

            if (
              record.registered
            ) {
              if (
                record.status ===
                "LEAVE"
              ) {
                attendanceStatus =
                  "LEAVE";
              } else if (
                outdoorDay &&
                record.outdoor_joined
              ) {
                attendanceStatus =
                  "OUTDOOR";
              } else {
                attendanceStatus =
                  "NORMAL";
              }
            }

            const lockIndoorOptions =
              outdoorDay;

            return {
              camp_id:
                camp.id,

              camp_date_id:
                dateIdMap[
                  dateKey
                ],

              student_id:
                studentId,

              attendance_status:
                attendanceStatus,

              morning:
                record.registered &&
                record.status !==
                  "LEAVE" &&
                !lockIndoorOptions
                  ? Boolean(
                      record.morning
                    )
                  : false,

              afternoon:
                record.registered &&
                record.status !==
                  "LEAVE" &&
                !lockIndoorOptions
                  ? Boolean(
                      record.afternoon
                    )
                  : false,

              meal:
                record.registered &&
                record.status !==
                  "LEAVE" &&
                !lockIndoorOptions
                  ? Boolean(
                      record.meal
                    )
                  : false,

              talent:
                record.registered &&
                record.status !==
                  "LEAVE" &&
                !lockIndoorOptions
                  ? Boolean(
                      record.talent
                    )
                  : false,

              overnight_mode:
                overnightDay
                  ? !record.registered
                    ? "ABSENT"
                    : record.status === "LEAVE"
                    ? "ABSENT"
                    : record.overnight_mode === "JOIN"
                    ? "JOIN"
                    : "INDOOR"
                  : null,

              leave_type:
                record.registered &&
                record.status ===
                  "LEAVE"
                  ? record.leave_type.trim() ||
                    "請假"
                  : null,

              note:
                record.note.trim() ||
                null,

              updated_at:
                new Date().toISOString(),
            };
          }
        );

      const { error } =
        await supabase
          .from(
            "camp_student_daily_records"
          )
          .upsert(
            rows,
            {
              onConflict:
                "camp_date_id,student_id",
            }
          );

      if (error) throw error;

      setHasUnsavedChanges(
        false
      );

      setSavedMessage(
        "✓ 已自動儲存"
      );

      return true;
    } catch (error) {
      console.error(
        "儲存每日報名失敗：",
        error
      );

      setErrorMessage(
        `儲存失敗：${error.message}`
      );

      setSavedMessage(
        "儲存失敗"
      );

      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStudentChange(
    nextStudentId
  ) {
    if (
      nextStudentId ===
      selectedStudentId
    ) {
      return;
    }

    if (
      hasUnsavedChanges &&
      selectedStudentId
    ) {
      const ok =
        await saveCurrentStudent();

      if (!ok) return;
    }

    setSelectedStudentId(
      nextStudentId
    );
  }

  async function handlePeriodChange(
    nextPeriodId
  ) {
    if (
      nextPeriodId ===
      selectedPeriodId
    ) {
      return;
    }

    if (
      hasUnsavedChanges &&
      selectedStudentId
    ) {
      const ok =
        await saveCurrentStudent();

      if (!ok) return;
    }

    setSelectedPeriodId(
      nextPeriodId
    );
  }

  if (isLoading) {
    return (
      <div className="campDailyPanel">
        <div className="campEmptyState">
          正在讀取每日報名……
        </div>
      </div>
    );
  }

  return (
    <div className="campDailyPanel">
      <div className="campDailyPanel__header">
        <div>
          <button
            type="button"
            className="campBackButton"
            onClick={onBack}
          >
            ← 返回營隊資料夾
          </button>

          <p className="campEyebrow">
            DAILY REGISTRATION
          </p>

          <h2>每日報名</h2>

          <p>{camp.name}</p>
        </div>

        <div
          className="campDailySaveStatus"
          aria-live="polite"
        >
          {isSaving
            ? "儲存中…"
            : hasUnsavedChanges
            ? "切換學生時自動儲存"
            : savedMessage ||
              "✓ 已儲存"}
        </div>
      </div>

      <section className="campDailySelectors">
        <label>
          <span>
            1. 選擇活動梯次
          </span>

          <select
            value={
              selectedPeriodId
            }
            onChange={(
              event
            ) =>
              handlePeriodChange(
                event.target
                  .value
              )
            }
            disabled={
              isSaving
            }
          >
            {periods.map(
              (period) => (
                <option
                  key={
                    period.id
                  }
                  value={
                    period.id
                  }
                >
                  {
                    period.name
                  }
                </option>
              )
            )}
          </select>
        </label>

        <label>
          <span>
            2. 選擇學生
          </span>

          <select
            value={
              selectedStudentId
            }
            onChange={(
              event
            ) =>
              handleStudentChange(
                event.target
                  .value
              )
            }
            disabled={
              isSaving ||
              isLoadingStudent ||
              students.length ===
                0
            }
          >
            {students.length ===
            0 ? (
              <option value="">
                營隊學生總名單目前沒有學生
              </option>
            ) : (
              students.map(
                (student) => (
                  <option
                    key={
                      student.id
                    }
                    value={
                      student.id
                    }
                  >
                    [
                    {getGradeLabel(
                      student.grade
                    )}
                    ]{" "}
                    {
                      student.chinese_name
                    }
                  </option>
                )
              )
            )}
          </select>
        </label>
      </section>

      {errorMessage && (
        <div className="campMessage campMessage--error">
          {errorMessage}
        </div>
      )}

      {savedMessage && (
        <div className="campMessage campMessage--success">
          {savedMessage}
        </div>
      )}

      {!selectedPeriod ? (
        <div className="campEmptyState">
          尚未建立活動梯次。
        </div>
      ) : students.length ===
        0 ? (
        <div className="campEmptyState">
          <strong>
            營隊學生總名單目前沒有學生
          </strong>

          <p>
            請先回到「學生總名單」加入這次營隊的學生。
          </p>
        </div>
      ) : !selectedStudentId ? (
        <div className="campEmptyState">
          請選擇學生。
        </div>
      ) : (
        <section className="campDailyGrid">
          {activeDates.map(
            (dateKey) => {
              const date =
                parseDateKey(
                  dateKey
                );

              const record =
                recordsByDate[
                  dateKey
                ] ||
                createEmptyRecord();

              const dayMeta =
                dayMetaByDate.get(
                  dateKey
                );

              const overnightDay =
                isOvernightDay(
                  dayMeta
                );

              const outdoorDay =
                isOutdoorDay(
                  dayMeta
                );

              const normalOptionsDisabled =
                !record.registered ||
                record.status !==
                  "NORMAL" ||
                outdoorDay ||
                (
                  overnightDay &&
                  record.overnight_mode === "JOIN"
                );

              return (
                <article
                  key={
                    dateKey
                  }
                  className="campDailyCard"
                >
                  <div className="campDailyCard__top">
                    <div>
                      <strong>
                        {
                          dateKey
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

                    {dayMeta?.title && (
                      <span
                        style={{
                          marginLeft:
                            "auto",
                          marginRight:
                            "10px",
                          padding:
                            "5px 10px",
                          borderRadius:
                            "999px",
                          background:
                            overnightDay
                              ? "#eef0ff"
                              : outdoorDay
                              ? "#edf5ed"
                              : "#f3f0ea",
                          fontSize:
                            "13px",
                          fontWeight:
                            700,
                        }}
                      >
                        {
                          dayMeta.title
                        }
                      </span>
                    )}

                    <select
                      value={
                        record.registered
                          ? record.status
                          : "ABSENT"
                      }
                      onChange={(
                        event
                      ) => {
                        const value =
                          event.target
                            .value;

                        if (
                          value ===
                          "ABSENT"
                        ) {
                          updateRecord(
                            dateKey,
                            {
                              registered:
                                false,

                              status:
                                "NORMAL",

                              outdoor_joined:
                                false,

                              overnight_mode:
                                overnightDay
                                  ? "ABSENT"
                                  : "",
                            }
                          );
                        } else {
                          updateRecord(
                            dateKey,
                            {
                              registered:
                                true,

                              status:
                                value,
                            }
                          );
                        }
                      }}
                    >
                      <option value="ABSENT">
                        未報名
                      </option>

                      <option value="NORMAL">
                        正常出席
                      </option>

                      <option value="LEAVE">
                        請假
                      </option>
                    </select>
                  </div>

                  <label className="campDailyRegistered">
                    <input
                      type="checkbox"
                      checked={
                        record.registered
                      }
                      onChange={(
                        event
                      ) =>
                        updateRecord(
                          dateKey,
                          {
                            registered:
                              event
                                .target
                                .checked,

                            status:
                              event
                                .target
                                .checked
                                ? record.status
                                : "NORMAL",

                            outdoor_joined:
                              event
                                .target
                                .checked
                                ? record.outdoor_joined
                                : false,

                            overnight_mode:
                              event
                                .target
                                .checked
                                ? (
                                    record.overnight_mode === "JOIN"
                                      ? "JOIN"
                                      : "INDOOR"
                                  )
                                : "ABSENT",
                          }
                        )
                      }
                    />

                    <span>
                      報名此日
                    </span>
                  </label>

                  {overnightDay &&
                    record.registered &&
                    record.status ===
                      "NORMAL" && (
                      <div
                        style={{
                          marginTop:
                            "12px",
                          padding:
                            "14px 16px",
                          border:
                            "1px solid #d7ddff",
                          borderRadius:
                            "14px",
                          background:
                            "#f5f6ff",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            flexWrap: "nowrap",
                          }}
                        >
                          <strong
                            style={{
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              flexShrink: 0,
                            }}
                          >
                            兩天一夜
                          </strong>

                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                              fontSize: "14px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                record.overnight_mode ===
                                "JOIN"
                              }
                              onChange={(
                                event
                              ) =>
                                updateRecord(
                                  dateKey,
                                  {
                                    overnight_mode:
                                      event
                                        .target
                                        .checked
                                        ? "JOIN"
                                        : "INDOOR",

                                    morning:
                                      event
                                        .target
                                        .checked
                                        ? false
                                        : record.morning,

                                    afternoon:
                                      event
                                        .target
                                        .checked
                                        ? false
                                        : record.afternoon,

                                    meal:
                                      event
                                        .target
                                        .checked
                                        ? false
                                        : record.meal,

                                    talent:
                                      event
                                        .target
                                        .checked
                                        ? false
                                        : record.talent,
                                  }
                                )
                              }
                            />

                            參加兩天一夜
                          </span>
                        </label>
                      </div>
                    )}

                  {outdoorDay &&
                    record.registered &&
                    record.status ===
                      "NORMAL" && (
                      <div
                        style={{
                          marginTop:
                            "12px",
                          padding:
                            "14px 16px",
                          border:
                            "1px solid #d9e6d9",
                          borderRadius:
                            "14px",
                          background:
                            "#f4f8f3",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "10px",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            flexWrap: "nowrap",
                          }}
                        >
                          <strong
                            style={{
                              whiteSpace: "nowrap",
                              fontSize: "14px",
                              flexShrink: 0,
                            }}
                          >
                            戶外教學
                          </strong>

                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                              fontSize: "14px",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                record.outdoor_joined
                              }
                              onChange={(
                                event
                              ) =>
                                updateRecord(
                                  dateKey,
                                  {
                                    outdoor_joined:
                                      event
                                        .target
                                        .checked,

                                    registered:
                                      event
                                        .target
                                        .checked,
                                  }
                                )
                              }
                            />

                            參加戶外教學
                          </span>
                        </label>
                      </div>
                    )}

                  {record.registered &&
                    record.status ===
                      "NORMAL" && (
                      <div
                        className="campDailyOptions"
                        style={
                          outdoorDay
                            ? {
                                opacity:
                                  0.45,
                              }
                            : undefined
                        }
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              record.morning
                            }
                            disabled={
                              normalOptionsDisabled
                            }
                            onChange={(
                              event
                            ) =>
                              updateRecord(
                                dateKey,
                                {
                                  morning:
                                    event
                                      .target
                                      .checked,
                                }
                              )
                            }
                          />
                          上午上課
                        </label>

                        <label>
                          <input
                            type="checkbox"
                            checked={
                              record.afternoon
                            }
                            disabled={
                              normalOptionsDisabled
                            }
                            onChange={(
                              event
                            ) =>
                              updateRecord(
                                dateKey,
                                {
                                  afternoon:
                                    event
                                      .target
                                      .checked,
                                }
                              )
                            }
                          />
                          下午上課
                        </label>

                        <label>
                          <input
                            type="checkbox"
                            checked={
                              record.meal
                            }
                            disabled={
                              normalOptionsDisabled
                            }
                            onChange={(
                              event
                            ) =>
                              updateRecord(
                                dateKey,
                                {
                                  meal:
                                    event
                                      .target
                                      .checked,
                                }
                              )
                            }
                          />
                          含午餐
                        </label>

                        <label>
                          <input
                            type="checkbox"
                            checked={
                              record.talent
                            }
                            disabled={
                              normalOptionsDisabled
                            }
                            onChange={(
                              event
                            ) =>
                              updateRecord(
                                dateKey,
                                {
                                  talent:
                                    event
                                      .target
                                      .checked,
                                }
                              )
                            }
                          />
                          加選才藝課
                        </label>
                      </div>
                    )}

                  {outdoorDay &&
                    record.registered &&
                    record.status ===
                      "NORMAL" && (
                      <p
                        style={{
                          margin:
                            "10px 2px 0",
                          fontSize:
                            "13px",
                          color:
                            "#8a8e87",
                        }}
                      >
                        戶外教學日不開放室內課程，因此上午、下午、午餐與才藝選項固定關閉。
                      </p>
                    )}

                  {record.registered &&
                    record.status ===
                      "LEAVE" && (
                      <input
                        className="campDailyCard__leave"
                        type="text"
                        value={
                          record.leave_type
                        }
                        onChange={(
                          event
                        ) =>
                          updateRecord(
                            dateKey,
                            {
                              leave_type:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                        placeholder="例如：事假、病假"
                      />
                    )}

                  <input
                    className="campDailyCard__note"
                    type="text"
                    value={
                      record.note
                    }
                    onChange={(
                      event
                    ) =>
                      updateRecord(
                        dateKey,
                        {
                          note:
                            event.target
                              .value,
                        }
                      )
                    }
                    placeholder="單日課堂備註（如：吃全素、早退等）"
                  />
                </article>
              );
            }
          )}
        </section>
      )}
    </div>
  );
}

export default CampDailyRegistrationPanel;