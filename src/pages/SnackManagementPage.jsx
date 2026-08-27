import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "../lib/supabase";
import { jsPDF } from "jspdf";
import { getStudentPickupDecision } from "../components/pickup/pickupStudentSchedule";

const TABS = [
  {
    key: "MONTHLY",
    label: "月點心表",
    description: "查看各班每日點心基準人數",
  },
  {
    key: "PREFERENCES",
    label: "點心選擇",
    description: "設定學生與班外學生的口味",
  },
  {
    key: "SUMMARY",
    label: "訂購統計",
    description: "查看各班與全校訂購總計",
  },
  {
    key: "SETTINGS",
    label: "點心設定",
    description: "管理點心品項與口味",
  },
];

const CLOSED_EVENT_TYPES = new Set([
  "HOLIDAY",
  "CLASSROOM_CLOSED",
]);

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function formatDate(dateValue) {
  if (!dateValue) return "—";

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parseLocalDate(dateValue));
}

function formatMonthLabel(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function getMonthValue(dateValue) {
  if (!dateValue) return "";
  return dateValue.slice(0, 7);
}

function getMonthDays(monthValue, semester) {
  if (!monthValue || !semester) return [];

  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const days = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const dateString = toDateString(date);
    const weekday = date.getDay();

    // 點心固定只供應週一至週五。
    // 六、日不建立點心日期，也不提供特殊例外。
    if (weekday === 0 || weekday === 6) {
      continue;
    }

    // 點心日期直接沿用行事曆學期起訖日。
    if (
      dateString < semester.start_date ||
      dateString > semester.end_date
    ) {
      continue;
    }

    days.push({
      date,
      dateString,
      day,
      weekday,
    });
  }

  return days;
}

function isMembershipActiveOnDate(membership, dateString) {
  if (!membership?.joined_at) return false;

  if (membership.joined_at > dateString) {
    return false;
  }

  if (membership.left_at && membership.left_at < dateString) {
    return false;
  }

  return true;
}

function SnackManagementPage({ teacherMode = null }) {
  const [semesters, setSemesters] = useState([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [activeTab, setActiveTab] = useState(
    teacherMode === "PREFERENCES"
      ? "PREFERENCES"
      : "MONTHLY"
  );

  const [selectedMonth, setSelectedMonth] = useState("");

  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [studentWeeklyRules, setStudentWeeklyRules] = useState([]);
  const [studentDateExceptions, setStudentDateExceptions] = useState([]);

  const [classSnackSettings, setClassSnackSettings] = useState([]);
  const [dailySnackExceptions, setDailySnackExceptions] = useState([]);
  const [dailyAdjustments, setDailyAdjustments] = useState([]);
  const [externalOrders, setExternalOrders] = useState([]);

  const [snackItems, setSnackItems] = useState([]);
  const [snackItemsLoading, setSnackItemsLoading] = useState(false);
  const [savingSnackSetting, setSavingSnackSetting] = useState(false);
  const [newSnackItemName, setNewSnackItemName] = useState("");
  const [newSnackItemNotes, setNewSnackItemNotes] = useState("");
  const [newSnackItemRequiresOption, setNewSnackItemRequiresOption] = useState(true);
  const [newOptionNames, setNewOptionNames] = useState({});

  const [preferenceClasses, setPreferenceClasses] = useState([]);
  const [preferenceMemberships, setPreferenceMemberships] = useState([]);
  const [studentSnackChoices, setStudentSnackChoices] = useState([]);
  const [preferenceClassTeachers, setPreferenceClassTeachers] = useState([]);
  const [teacherSnackChoices, setTeacherSnackChoices] = useState([]);
  const [preferenceClassSnackSettings, setPreferenceClassSnackSettings] = useState([]);
  const [selectedPreferenceClassId, setSelectedPreferenceClassId] = useState("");
  const [preferenceLoading, setPreferenceLoading] = useState(false);
  const [savingPreferenceKey, setSavingPreferenceKey] = useState("");
  const [exportingSummaryPdf, setExportingSummaryPdf] = useState(false);
  const [exportingPreferencePdf, setExportingPreferencePdf] = useState(false);

  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedExternalDate, setSelectedExternalDate] = useState(null);
  const [externalNameInput, setExternalNameInput] = useState("");
  const [savingCell, setSavingCell] = useState(false);
  const [savingExternalOrders, setSavingExternalOrders] = useState(false);

  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadSemesters();
  }, []);

  useEffect(() => {
    if (teacherMode === "PREFERENCES") {
      setActiveTab("PREFERENCES");
    } else if (teacherMode === "MONTHLY") {
      setActiveTab("MONTHLY");
    }
  }, [teacherMode]);

  async function loadSemesters() {
    try {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("calendar_semesters")
        .select(`
          id,
          name,
          start_date,
          end_date,
          status,
          created_at
        `)
        .order("start_date", { ascending: false });

      if (error) throw error;

      const rows = data || [];
      setSemesters(rows);

      if (rows.length > 0) {
        const confirmed = rows.find(
          (item) => item.status === "CONFIRMED"
        );

        setSelectedSemesterId(
          confirmed?.id || rows[0].id
        );
      }
    } catch (error) {
      console.error("讀取點心學期失敗：", error);
      setErrorMessage(`讀取學期失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  const selectedSemester = useMemo(
    () =>
      semesters.find(
        (semester) => semester.id === selectedSemesterId
      ) || null,
    [semesters, selectedSemesterId]
  );

  useEffect(() => {
    if (
      !["SETTINGS", "PREFERENCES", "SUMMARY"].includes(activeTab) ||
      !selectedSemesterId
    ) {
      return;
    }

    loadSnackSettings();
  }, [
    activeTab,
    selectedSemesterId,
  ]);

  useEffect(() => {
    if (
      !["PREFERENCES", "SUMMARY"].includes(activeTab) ||
      !selectedSemesterId ||
      !selectedSemester
    ) {
      return;
    }

    loadPreferenceData();
  }, [
    activeTab,
    selectedSemesterId,
    selectedSemester,
  ]);

  async function loadPreferenceData() {
    try {
      setPreferenceLoading(true);
      setErrorMessage("");

      const {
        data: classRows,
        error: classError,
      } = await supabase
        .from("classes")
        .select(`
          id,
          class_name,
          start_date,
          end_date,
          is_active,
          course_type
        `)
        .eq("course_type", "AFTER_SCHOOL")
        .order("class_name", { ascending: true });

      if (classError) throw classError;

      const relevantClasses = (classRows || []).filter(
        (classItem) => {
          if (
            classItem.start_date &&
            selectedSemester?.end_date &&
            classItem.start_date > selectedSemester.end_date
          ) {
            return false;
          }

          if (
            classItem.end_date &&
            selectedSemester?.start_date &&
            classItem.end_date < selectedSemester.start_date
          ) {
            return false;
          }

          return true;
        }
      );

      setPreferenceClasses(relevantClasses);

      const classIds = relevantClasses.map(
        (classItem) => classItem.id
      );

      if (classIds.length === 0) {
        setPreferenceMemberships([]);
        setStudentSnackChoices([]);
        setPreferenceClassTeachers([]);
        setTeacherSnackChoices([]);
        setPreferenceClassSnackSettings([]);
        setSelectedPreferenceClassId("");
        return;
      }

      const {
        data: membershipRows,
        error: membershipError,
      } = await supabase
        .from("class_students")
        .select(`
          id,
          class_id,
          student_id,
          joined_at,
          left_at,
          status,
          students (
            id,
            chinese_name,
            english_name
          )
        `)
        .in("class_id", classIds)
        .is("left_at", null)
        .neq("status", "inactive");

      if (membershipError) {
        throw membershipError;
      }

      const dedupedMemberships = [];
      const seen = new Set();

      (membershipRows || []).forEach((row) => {
        const key = `${row.class_id}:${row.student_id}`;
        if (seen.has(key)) return;
        seen.add(key);
        dedupedMemberships.push(row);
      });

      setPreferenceMemberships(dedupedMemberships);

      const studentIds = Array.from(
        new Set(
          dedupedMemberships.map(
            (row) => row.student_id
          )
        )
      );

      if (studentIds.length === 0) {
        setStudentSnackChoices([]);
      } else {
        const {
          data: choiceRows,
          error: choiceError,
        } = await supabase
          .from("snack_student_choices")
          .select(`
            id,
            semester_id,
            student_id,
            snack_item_id,
            snack_item_option_id,
            quantity,
            notes,
            created_at,
            updated_at
          `)
          .eq("semester_id", selectedSemesterId)
          .in("student_id", studentIds);

        if (choiceError) throw choiceError;

        setStudentSnackChoices(
          choiceRows || []
        );
      }

      const [
        classTeacherResult,
        preferenceSettingResult,
      ] = await Promise.all([
        supabase
          .from("class_teachers")
          .select(`
            id,
            class_id,
            teacher_id,
            is_primary,
            teachers (
              id,
              chinese_name,
              english_name,
              status
            )
          `)
          .in("class_id", classIds),

        supabase
          .from("snack_class_settings")
          .select("*")
          .eq("semester_id", selectedSemesterId)
          .in("class_id", classIds),
      ]);

      if (classTeacherResult.error) {
        throw classTeacherResult.error;
      }

      if (preferenceSettingResult.error) {
        throw preferenceSettingResult.error;
      }

      const teacherRelations =
        classTeacherResult.data || [];

      setPreferenceClassTeachers(
        teacherRelations
      );

      setPreferenceClassSnackSettings(
        preferenceSettingResult.data || []
      );

      const teacherIds = Array.from(
        new Set(
          teacherRelations.map(
            (row) => row.teacher_id
          )
        )
      );

      if (teacherIds.length === 0) {
        setTeacherSnackChoices([]);
      } else {
        const {
          data: teacherChoiceRows,
          error: teacherChoiceError,
        } = await supabase
          .from("snack_teacher_choices")
          .select(`
            id,
            semester_id,
            teacher_id,
            class_id,
            snack_item_id,
            snack_item_option_id,
            quantity,
            notes,
            created_at,
            updated_at
          `)
          .eq("semester_id", selectedSemesterId)
          .in("teacher_id", teacherIds)
          .in("class_id", classIds);

        if (teacherChoiceError) {
          throw teacherChoiceError;
        }

        setTeacherSnackChoices(
          teacherChoiceRows || []
        );
      }

      setSelectedPreferenceClassId(
        (current) => {
          if (
            current &&
            relevantClasses.some(
              (classItem) =>
                classItem.id === current
            )
          ) {
            return current;
          }

          return relevantClasses[0]?.id || "";
        }
      );
    } catch (error) {
      console.error(
        "讀取點心選擇資料失敗：",
        error
      );
      setErrorMessage(
        `讀取點心選擇失敗：${error.message}`
      );
      setPreferenceClasses([]);
      setPreferenceMemberships([]);
      setStudentSnackChoices([]);
      setPreferenceClassTeachers([]);
      setTeacherSnackChoices([]);
      setPreferenceClassSnackSettings([]);
      setSelectedPreferenceClassId("");
    } finally {
      setPreferenceLoading(false);
    }
  }

  function getStudentSnackChoice(
    studentId,
    snackItemId
  ) {
    return (
      studentSnackChoices.find(
        (choice) =>
          choice.student_id === studentId &&
          choice.snack_item_id === snackItemId
      ) || null
    );
  }

  async function saveStudentSnackChoice({
    studentId,
    snackItem,
    optionId = null,
    quantity = 1,
  }) {
    if (
      !selectedSemesterId ||
      !studentId ||
      !snackItem?.id
    ) {
      return;
    }

    const key =
      `${studentId}:${snackItem.id}`;

    try {
      setSavingPreferenceKey(key);
      setErrorMessage("");

      const existing =
        getStudentSnackChoice(
          studentId,
          snackItem.id
        );

      const numericQuantity =
        Number(quantity || 0);

      const shouldDelete =
        snackItem.requires_option
          ? !optionId
          : numericQuantity <= 0;

      if (shouldDelete) {
        if (existing?.id) {
          const { error } = await supabase
            .from("snack_student_choices")
            .delete()
            .eq("id", existing.id);

          if (error) throw error;

          setStudentSnackChoices(
            (current) =>
              current.filter(
                (choice) =>
                  choice.id !== existing.id
              )
          );
        }

        return;
      }

      const payload = {
        semester_id:
          selectedSemesterId,
        student_id: studentId,
        snack_item_id:
          snackItem.id,
        snack_item_option_id:
          snackItem.requires_option
            ? optionId
            : null,
        quantity:
          snackItem.requires_option
            ? 1
            : numericQuantity,
        updated_at:
          new Date().toISOString(),
      };

      const {
        data,
        error,
      } = await supabase
        .from("snack_student_choices")
        .upsert(
          payload,
          {
            onConflict:
              "semester_id,student_id,snack_item_id",
          }
        )
        .select("*")
        .single();

      if (error) throw error;

      setStudentSnackChoices(
        (current) => {
          const exists =
            current.some(
              (choice) =>
                choice.student_id ===
                  studentId &&
                choice.snack_item_id ===
                  snackItem.id
            );

          if (exists) {
            return current.map(
              (choice) =>
                choice.student_id ===
                    studentId &&
                choice.snack_item_id ===
                    snackItem.id
                  ? data
                  : choice
            );
          }

          return [
            ...current,
            data,
          ];
        }
      );
    } catch (error) {
      console.error(
        "儲存學生點心選擇失敗：",
        error
      );
      setErrorMessage(
        `儲存點心選擇失敗：${error.message}`
      );
    } finally {
      setSavingPreferenceKey("");
    }
  }

  function classTeacherEatsSnackForPreference(
    classId
  ) {
    return Boolean(
      preferenceClassSnackSettings.find(
        (item) =>
          item.class_id === classId
      )?.teacher_eats_snack
    );
  }

  function getPreferenceTeachersForClass(
    classId
  ) {
    if (
      !classTeacherEatsSnackForPreference(
        classId
      )
    ) {
      return [];
    }

    return preferenceClassTeachers
      .filter(
        (row) =>
          row.class_id === classId &&
          row.teachers?.status !== "inactive"
      )
      .map((row) => ({
        relation_id: row.id,
        teacher_id: row.teacher_id,
        name:
          row.teachers?.chinese_name ||
          row.teachers?.english_name ||
          "未命名老師",
        is_primary: Boolean(
          row.is_primary
        ),
      }))
      .sort((a, b) => {
        if (
          a.is_primary !== b.is_primary
        ) {
          return a.is_primary ? -1 : 1;
        }

        return a.name.localeCompare(
          b.name,
          "zh-Hant"
        );
      });
  }

  function getTeacherSnackChoice(
    teacherId,
    classId,
    snackItemId
  ) {
    return (
      teacherSnackChoices.find(
        (choice) =>
          choice.teacher_id ===
            teacherId &&
          choice.class_id === classId &&
          choice.snack_item_id ===
            snackItemId
      ) || null
    );
  }

  async function saveTeacherSnackChoice({
    teacherId,
    classId,
    snackItem,
    optionId = null,
    quantity = 1,
  }) {
    if (
      !selectedSemesterId ||
      !teacherId ||
      !classId ||
      !snackItem?.id
    ) {
      return;
    }

    const key =
      `teacher:${classId}:${teacherId}:${snackItem.id}`;

    try {
      setSavingPreferenceKey(key);
      setErrorMessage("");

      const existing =
        getTeacherSnackChoice(
          teacherId,
          classId,
          snackItem.id
        );

      const numericQuantity =
        Number(quantity || 0);

      const shouldDelete =
        snackItem.requires_option
          ? !optionId
          : numericQuantity <= 0;

      if (shouldDelete) {
        if (existing?.id) {
          const { error } =
            await supabase
              .from(
                "snack_teacher_choices"
              )
              .delete()
              .eq("id", existing.id);

          if (error) throw error;

          setTeacherSnackChoices(
            (current) =>
              current.filter(
                (choice) =>
                  choice.id !== existing.id
              )
          );
        }

        return;
      }

      const payload = {
        semester_id:
          selectedSemesterId,
        teacher_id: teacherId,
        class_id: classId,
        snack_item_id:
          snackItem.id,
        snack_item_option_id:
          snackItem.requires_option
            ? optionId
            : null,
        quantity:
          snackItem.requires_option
            ? 1
            : numericQuantity,
        updated_at:
          new Date().toISOString(),
      };

      const {
        data,
        error,
      } = await supabase
        .from("snack_teacher_choices")
        .upsert(
          payload,
          {
            onConflict:
              "semester_id,teacher_id,class_id,snack_item_id",
          }
        )
        .select("*")
        .single();

      if (error) throw error;

      setTeacherSnackChoices(
        (current) => {
          const exists =
            current.some(
              (choice) =>
                choice.teacher_id ===
                  teacherId &&
                choice.class_id ===
                  classId &&
                choice.snack_item_id ===
                  snackItem.id
            );

          if (exists) {
            return current.map(
              (choice) =>
                choice.teacher_id ===
                    teacherId &&
                choice.class_id ===
                    classId &&
                choice.snack_item_id ===
                    snackItem.id
                  ? data
                  : choice
            );
          }

          return [...current, data];
        }
      );
    } catch (error) {
      console.error(
        "儲存老師點心選擇失敗：",
        error
      );
      setErrorMessage(
        `儲存老師點心選擇失敗：${error.message}`
      );
    } finally {
      setSavingPreferenceKey("");
    }
  }

  async function loadSnackSettings() {
    try {
      setSnackItemsLoading(true);
      setErrorMessage("");

      const {
        data: itemRows,
        error: itemError,
      } = await supabase
        .from("snack_items")
        .select(`
          id,
          semester_id,
          name,
          requires_option,
          is_active,
          sort_order,
          notes,
          created_at,
          updated_at
        `)
        .eq(
          "semester_id",
          selectedSemesterId
        )
        .order(
          "sort_order",
          { ascending: true }
        )
        .order(
          "created_at",
          { ascending: true }
        );

      if (itemError) throw itemError;

      const ids = (itemRows || [])
        .map((item) => item.id);

      let optionRows = [];

      if (ids.length > 0) {
        const {
          data,
          error,
        } = await supabase
          .from("snack_item_options")
          .select(`
            id,
            snack_item_id,
            name,
            is_vegetarian_option,
            is_active,
            sort_order,
            created_at,
            updated_at
          `)
          .in(
            "snack_item_id",
            ids
          )
          .order(
            "sort_order",
            { ascending: true }
          )
          .order(
            "created_at",
            { ascending: true }
          );

        if (error) throw error;
        optionRows = data || [];
      }

      setSnackItems(
        (itemRows || []).map((item) => ({
          ...item,
          options: optionRows.filter(
            (option) =>
              option.snack_item_id === item.id
          ),
        }))
      );
    } catch (error) {
      console.error(
        "讀取點心設定失敗：",
        error
      );

      setErrorMessage(
        `讀取點心設定失敗：${error.message}`
      );
      setSnackItems([]);
    } finally {
      setSnackItemsLoading(false);
    }
  }

  async function createSnackItem() {
    const name = newSnackItemName.trim();

    if (
      !selectedSemesterId ||
      !name
    ) {
      return;
    }

    try {
      setSavingSnackSetting(true);
      setErrorMessage("");

      const nextSortOrder =
        snackItems.length > 0
          ? Math.max(
              ...snackItems.map(
                (item) =>
                  Number(item.sort_order || 0)
              )
            ) + 1
          : 0;

      const { error } = await supabase
        .from("snack_items")
        .insert({
          semester_id:
            selectedSemesterId,
          name,
          requires_option:
            newSnackItemRequiresOption,
          is_active: true,
          sort_order: nextSortOrder,
          notes:
            newSnackItemNotes.trim() ||
            null,
          updated_at:
            new Date().toISOString(),
        });

      if (error) throw error;

      setNewSnackItemName("");
      setNewSnackItemNotes("");
      setNewSnackItemRequiresOption(true);

      await loadSnackSettings();
    } catch (error) {
      console.error(
        "新增點心品項失敗：",
        error
      );

      setErrorMessage(
        `新增點心品項失敗：${error.message}`
      );
    } finally {
      setSavingSnackSetting(false);
    }
  }

  async function updateSnackItem(
    itemId,
    patch
  ) {
    try {
      setSavingSnackSetting(true);
      setErrorMessage("");

      const { error } = await supabase
        .from("snack_items")
        .update({
          ...patch,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", itemId);

      if (error) throw error;

      await loadSnackSettings();
    } catch (error) {
      console.error(
        "更新點心品項失敗：",
        error
      );

      setErrorMessage(
        `更新點心品項失敗：${error.message}`
      );
    } finally {
      setSavingSnackSetting(false);
    }
  }

  async function addSnackOption(
    item
  ) {
    const optionName =
      (
        newOptionNames[item.id] ||
        ""
      ).trim();

    if (!optionName) {
      return;
    }

    try {
      setSavingSnackSetting(true);
      setErrorMessage("");

      const nextSortOrder =
        item.options.length > 0
          ? Math.max(
              ...item.options.map(
                (option) =>
                  Number(
                    option.sort_order ||
                    0
                  )
              )
            ) + 1
          : 0;

      const { error } = await supabase
        .from("snack_item_options")
        .insert({
          snack_item_id: item.id,
          name: optionName,
          is_vegetarian_option: false,
          is_active: true,
          sort_order: nextSortOrder,
          updated_at:
            new Date().toISOString(),
        });

      if (error) throw error;

      setNewOptionNames(
        (current) => ({
          ...current,
          [item.id]: "",
        })
      );

      await loadSnackSettings();
    } catch (error) {
      console.error(
        "新增點心選項失敗：",
        error
      );

      setErrorMessage(
        `新增點心選項失敗：${error.message}`
      );
    } finally {
      setSavingSnackSetting(false);
    }
  }

  async function updateSnackOption(
    optionId,
    patch
  ) {
    try {
      setSavingSnackSetting(true);
      setErrorMessage("");

      const { error } = await supabase
        .from("snack_item_options")
        .update({
          ...patch,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", optionId);

      if (error) throw error;

      await loadSnackSettings();
    } catch (error) {
      console.error(
        "更新點心選項失敗：",
        error
      );

      setErrorMessage(
        `更新點心選項失敗：${error.message}`
      );
    } finally {
      setSavingSnackSetting(false);
    }
  }

  async function moveSnackItem(
    item,
    direction
  ) {
    const index = snackItems.findIndex(
      (row) => row.id === item.id
    );
    const targetIndex =
      index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >= snackItems.length
    ) {
      return;
    }

    const target =
      snackItems[targetIndex];

    try {
      setSavingSnackSetting(true);
      setErrorMessage("");

      const {
        error: firstError,
      } = await supabase
        .from("snack_items")
        .update({
          sort_order:
            Number(
              target.sort_order ||
              targetIndex
            ),
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", item.id);

      if (firstError) {
        throw firstError;
      }

      const {
        error: secondError,
      } = await supabase
        .from("snack_items")
        .update({
          sort_order:
            Number(
              item.sort_order ||
              index
            ),
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", target.id);

      if (secondError) {
        throw secondError;
      }

      await loadSnackSettings();
    } catch (error) {
      console.error(
        "調整點心品項順序失敗：",
        error
      );

      setErrorMessage(
        `調整順序失敗：${error.message}`
      );
    } finally {
      setSavingSnackSetting(false);
    }
  }

  async function moveSnackOption(
    item,
    option,
    direction
  ) {
    const index =
      item.options.findIndex(
        (row) =>
          row.id === option.id
      );
    const targetIndex =
      index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >=
        item.options.length
    ) {
      return;
    }

    const target =
      item.options[targetIndex];

    try {
      setSavingSnackSetting(true);
      setErrorMessage("");

      const {
        error: firstError,
      } = await supabase
        .from("snack_item_options")
        .update({
          sort_order:
            Number(
              target.sort_order ||
              targetIndex
            ),
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", option.id);

      if (firstError) {
        throw firstError;
      }

      const {
        error: secondError,
      } = await supabase
        .from("snack_item_options")
        .update({
          sort_order:
            Number(
              option.sort_order ||
              index
            ),
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", target.id);

      if (secondError) {
        throw secondError;
      }

      await loadSnackSettings();
    } catch (error) {
      console.error(
        "調整點心選項順序失敗：",
        error
      );

      setErrorMessage(
        `調整選項順序失敗：${error.message}`
      );
    } finally {
      setSavingSnackSetting(false);
    }
  }

  useEffect(() => {
    if (!selectedSemester) {
      setSelectedMonth("");
      return;
    }

    const today = toDateString(new Date());

    if (
      today >= selectedSemester.start_date &&
      today <= selectedSemester.end_date
    ) {
      setSelectedMonth(getMonthValue(today));
      return;
    }

    setSelectedMonth(
      getMonthValue(selectedSemester.start_date)
    );
  }, [selectedSemester]);

  const monthDays = useMemo(
    () => getMonthDays(selectedMonth, selectedSemester),
    [selectedMonth, selectedSemester]
  );

  const monthStart = monthDays[0]?.dateString || "";
  const monthEnd =
    monthDays[monthDays.length - 1]?.dateString || "";

  useEffect(() => {
    if (
      activeTab !== "MONTHLY" ||
      !selectedSemesterId ||
      !monthStart ||
      !monthEnd
    ) {
      return;
    }

    loadMonthlyBaseData();
  }, [
    activeTab,
    selectedSemesterId,
    monthStart,
    monthEnd,
  ]);

  async function loadMonthlyBaseData() {
    try {
      setMonthlyLoading(true);
      setErrorMessage("");

      const {
        data: classRows,
        error: classError,
      } = await supabase
        .from("classes")
        .select(`
          id,
          class_name,
          start_date,
          end_date,
          is_active,
          course_type
        `)
        .eq("course_type", "AFTER_SCHOOL")
        .order("class_name", { ascending: true });

      if (classError) throw classError;

      const relevantClasses = (classRows || []).filter(
        (classItem) => {
          if (
            classItem.start_date &&
            classItem.start_date > monthEnd
          ) {
            return false;
          }

          if (
            classItem.end_date &&
            classItem.end_date < monthStart
          ) {
            return false;
          }

          return true;
        }
      );

      setClasses(relevantClasses);

      const classIds = relevantClasses.map(
        (classItem) => classItem.id
      );

      if (classIds.length === 0) {
        setMemberships([]);
        setCalendarEvents([]);
        setStudentWeeklyRules([]);
        setStudentDateExceptions([]);
        return;
      }

      const [
        membershipResult,
        calendarResult,
        studentWeeklyResult,
        studentExceptionsResult,
        classSnackSettingsResult,
        dailySnackExceptionsResult,
        dailyAdjustmentsResult,
        externalOrdersResult,
      ] = await Promise.all([
        supabase
          .from("class_students")
          .select(`
            id,
            class_id,
            student_id,
            joined_at,
            left_at,
            status,
            students (
              id,
              chinese_name,
              english_name
            )
          `)
          .in("class_id", classIds)
          .lte("joined_at", monthEnd),

        supabase
          .from("calendar_school_events")
          .select("*")
          .eq("semester_id", selectedSemesterId),

        supabase
          .from("pickup_student_weekly_rules")
          .select("*")
          .eq("is_active", true),

        supabase
          .from("pickup_student_date_exceptions")
          .select("*")
          .eq("is_active", true)
          .gte("pickup_date", monthStart)
          .lte("pickup_date", monthEnd),

        supabase
          .from("snack_class_settings")
          .select("*")
          .eq("semester_id", selectedSemesterId),

        supabase
          .from("snack_daily_exceptions")
          .select("*")
          .eq("semester_id", selectedSemesterId)
          .eq("subject_type", "STUDENT")
          .gte("service_date", monthStart)
          .lte("service_date", monthEnd),

        supabase
          .from("snack_daily_adjustments")
          .select("*")
          .eq("semester_id", selectedSemesterId)
          .gte("service_date", monthStart)
          .lte("service_date", monthEnd),

        supabase
          .from("snack_external_orders")
          .select("*")
          .eq("semester_id", selectedSemesterId)
          .gte("service_date", monthStart)
          .lte("service_date", monthEnd)
          .order("service_date", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

      if (membershipResult.error) {
        throw membershipResult.error;
      }

      if (calendarResult.error) {
        throw calendarResult.error;
      }

      if (studentWeeklyResult.error) {
        throw studentWeeklyResult.error;
      }

      if (studentExceptionsResult.error) {
        throw studentExceptionsResult.error;
      }

      if (classSnackSettingsResult.error) {
        throw classSnackSettingsResult.error;
      }

      if (dailySnackExceptionsResult.error) {
        throw dailySnackExceptionsResult.error;
      }

      if (dailyAdjustmentsResult.error) {
        throw dailyAdjustmentsResult.error;
      }

      if (externalOrdersResult.error) {
        throw externalOrdersResult.error;
      }

      setMemberships(
        (membershipResult.data || []).filter(
          (item) =>
            !item.left_at ||
            item.left_at >= monthStart
        )
      );

      setCalendarEvents(calendarResult.data || []);

      setStudentWeeklyRules(
        studentWeeklyResult.data || []
      );

      setStudentDateExceptions(
        studentExceptionsResult.data || []
      );

      setClassSnackSettings(
        classSnackSettingsResult.data || []
      );

      setDailySnackExceptions(
        dailySnackExceptionsResult.data || []
      );

      setDailyAdjustments(
        dailyAdjustmentsResult.data || []
      );

      setExternalOrders(
        externalOrdersResult.data || []
      );
    } catch (error) {
      console.error("讀取月點心表資料失敗：", error);
      setErrorMessage(
        `讀取月點心表失敗：${error.message}`
      );
      setClasses([]);
      setMemberships([]);
      setCalendarEvents([]);
      setStudentWeeklyRules([]);
      setStudentDateExceptions([]);
      setClassSnackSettings([]);
      setDailySnackExceptions([]);
      setDailyAdjustments([]);
      setExternalOrders([]);
    } finally {
      setMonthlyLoading(false);
    }
  }

  const closedDateMap = useMemo(() => {
    const map = new Map();

    for (const event of calendarEvents) {
      const eventType =
        event.event_type ||
        event.type ||
        event.event_kind ||
        event.kind ||
        "";

      if (!CLOSED_EVENT_TYPES.has(eventType)) {
        continue;
      }

      const start =
        event.start_date ||
        event.event_date ||
        event.date;

      const end =
        event.end_date ||
        event.event_date ||
        event.date ||
        start;

      if (!start) continue;

      let cursor = parseLocalDate(start);
      const endDate = parseLocalDate(end);

      while (cursor && endDate && cursor <= endDate) {
        const dateString = toDateString(cursor);

        map.set(dateString, {
          title:
            event.title ||
            event.name ||
            eventType,
          eventType,
        });

        cursor = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + 1
        );
      }
    }

    return map;
  }, [calendarEvents]);


  function getClassTeacherEatsSnack(classId) {
    const row = classSnackSettings.find(
      (item) => item.class_id === classId
    );

    // 尚未設定時預設老師不計入，避免無意間多訂。
    return Boolean(row?.teacher_eats_snack);
  }

  function getDailyStudentExceptionIds(classId, dateString) {
    const validStudentIds = new Set(
      memberships
        .filter(
          (membership) =>
            membership.class_id === classId &&
            isMembershipActiveOnDate(
              membership,
              dateString
            )
        )
        .map((membership) => membership.student_id)
    );

    return new Set(
      dailySnackExceptions
        .filter(
          (item) =>
            item.service_date === dateString &&
            item.subject_type === "STUDENT" &&
            item.exclude_from_snack === true &&
            validStudentIds.has(item.subject_id)
        )
        .map((item) => item.subject_id)
    );
  }

  function getDailyAdjustment(classId, dateString) {
    return (
      dailyAdjustments.find(
        (item) =>
          item.class_id === classId &&
          item.service_date === dateString
      ) || null
    );
  }

  function getExternalOrdersForDate(dateString) {
    return externalOrders.filter(
      (item) => item.service_date === dateString
    );
  }

  function getExternalOrderCount(dateString) {
    return getExternalOrdersForDate(dateString).length;
  }

  function getClassStudentsForDate(classId, dateString) {
    const map = new Map();

    memberships.forEach((membership) => {
      if (membership.class_id !== classId) return;
      if (!isMembershipActiveOnDate(membership, dateString)) return;

      const decision = getStudentPickupDecision({
        studentId: membership.student_id,
        dateKey: dateString,
        weeklyRules: studentWeeklyRules,
        dateExceptions: studentDateExceptions,
      });

      if (decision.status === "ABSENT") return;

      if (!map.has(membership.student_id)) {
        map.set(membership.student_id, {
          student_id: membership.student_id,
          name:
            membership.students?.chinese_name ||
            membership.students?.english_name ||
            "未命名學生",
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "zh-Hant")
    );
  }

  function getCellBreakdown(classId, dateString) {
    if (closedDateMap.has(dateString)) {
      return {
        isClosed: true,
        baseCount: 0,
        teacherCount: 0,
        excludedCount: 0,
        adjustment: 0,
        finalCount: 0,
      };
    }

    const baseCount = getClassBaseCount(
      classId,
      dateString
    );

    const teacherCount =
      getClassTeacherEatsSnack(classId)
        ? 1
        : 0;

    const excludedCount =
      getDailyStudentExceptionIds(
        classId,
        dateString
      ).size;

    const adjustmentRow =
      getDailyAdjustment(
        classId,
        dateString
      );

    const adjustment =
      Number(
        adjustmentRow?.quantity_delta ||
        0
      );

    return {
      isClosed: false,
      baseCount,
      teacherCount,
      excludedCount,
      adjustment,
      adjustmentNote:
        adjustmentRow?.reason || "",
      finalCount:
        baseCount +
        teacherCount -
        excludedCount +
        adjustment,
    };
  }

  function getClassBaseCount(classId, dateString) {
    if (closedDateMap.has(dateString)) {
      return null;
    }

    const studentIds = new Set();

    for (const membership of memberships) {
      if (membership.class_id !== classId) {
        continue;
      }

      if (!isMembershipActiveOnDate(membership, dateString)) {
        continue;
      }

      const decision =
        getStudentPickupDecision({
          studentId: membership.student_id,
          dateKey: dateString,
          weeklyRules: studentWeeklyRules,
          dateExceptions: studentDateExceptions,
        });

      // 點心基準與班級點名表一致：
      // 只有「當天不進班 ABSENT」不計入。
      if (decision.status === "ABSENT") {
        continue;
      }

      studentIds.add(membership.student_id);
    }

    return studentIds.size;
  }

  const classRows = useMemo(
    () =>
      classes.map((classItem) => ({
        ...classItem,
        counts: monthDays.map((day) => {
          const breakdown =
            getCellBreakdown(
              classItem.id,
              day.dateString
            );

          return {
            ...day,
            count:
              breakdown.isClosed
                ? null
                : breakdown.finalCount,
            breakdown,
          };
        }),
      })),
    [
      classes,
      memberships,
      studentWeeklyRules,
      studentDateExceptions,
      classSnackSettings,
      dailySnackExceptions,
      dailyAdjustments,
      monthDays,
      closedDateMap,
    ]
  );

  const dailyTotals = useMemo(
    () =>
      monthDays.map((day) => {
        if (closedDateMap.has(day.dateString)) {
          return null;
        }

        const classTotal = classRows.reduce(
          (sum, classItem) => {
            const cell = classItem.counts.find(
              (item) =>
                item.dateString === day.dateString
            );

            return sum + (cell?.count || 0);
          },
          0
        );

        return (
          classTotal +
          getExternalOrderCount(day.dateString)
        );
      }),
    [
      monthDays,
      classRows,
      closedDateMap,
      externalOrders,
    ]
  );

  const availableMonths = useMemo(() => {
    if (!selectedSemester) return [];

    const result = [];
    const start = parseLocalDate(
      `${selectedSemester.start_date.slice(0, 7)}-01`
    );
    const end = parseLocalDate(
      `${selectedSemester.end_date.slice(0, 7)}-01`
    );

    let cursor = start;

    while (cursor <= end) {
      const value = `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1
      ).padStart(2, "0")}`;

      result.push(value);

      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        1
      );
    }

    return result;
  }, [selectedSemester]);

  const visibleTabs =
    teacherMode === "PREFERENCES"
      ? TABS.filter(
          (tab) => tab.key === "PREFERENCES"
        )
      : teacherMode === "MONTHLY"
        ? TABS.filter(
            (tab) => tab.key === "MONTHLY"
          )
        : TABS;

  const activeTabItem = visibleTabs.find(
    (tab) => tab.key === activeTab
  );


  async function saveTeacherSetting(
    classId,
    teacherEatsSnack
  ) {
    if (!selectedSemesterId) return;

    try {
      setSavingCell(true);
      setErrorMessage("");

      const { error } = await supabase
        .from("snack_class_settings")
        .upsert(
          {
            semester_id:
              selectedSemesterId,
            class_id: classId,
            teacher_eats_snack:
              teacherEatsSnack,
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "semester_id,class_id",
          }
        );

      if (error) throw error;

      setClassSnackSettings(
        (current) => {
          const exists =
            current.some(
              (item) =>
                item.class_id ===
                classId
            );

          if (exists) {
            return current.map(
              (item) =>
                item.class_id ===
                classId
                  ? {
                      ...item,
                      teacher_eats_snack:
                        teacherEatsSnack,
                    }
                  : item
            );
          }

          return [
            ...current,
            {
              semester_id:
                selectedSemesterId,
              class_id:
                classId,
              teacher_eats_snack:
                teacherEatsSnack,
            },
          ];
        }
      );
    } catch (error) {
      console.error(
        "儲存老師點心設定失敗：",
        error
      );

      setErrorMessage(
        `儲存老師點心設定失敗：${error.message}`
      );
    } finally {
      setSavingCell(false);
    }
  }

  async function saveDailyCell() {
    if (!selectedCell) return;

    const {
      classItem,
      dateString,
      excludedStudentIds,
      adjustment,
      adjustmentNote,
      studentReasons,
    } = selectedCell;

    try {
      setSavingCell(true);
      setErrorMessage("");

      const studentsForDay =
        getClassStudentsForDate(
          classItem.id,
          dateString
        );

      const existingForDay =
        dailySnackExceptions.filter(
          (item) =>
            item.service_date ===
              dateString &&
            item.subject_type ===
              "STUDENT" &&
            studentsForDay.some(
              (student) =>
                student.student_id ===
                item.subject_id
            )
        );

      const desiredIds =
        new Set(
          excludedStudentIds
        );

      const rowsToUpsert =
        studentsForDay
          .filter((student) =>
            desiredIds.has(
              student.student_id
            )
          )
          .map((student) => ({
            semester_id:
              selectedSemesterId,
            service_date:
              dateString,
            subject_type:
              "STUDENT",
            subject_id:
              student.student_id,
            exclude_from_snack:
              true,
            reason:
              studentReasons[
                student.student_id
              ]?.trim() ||
              null,
            updated_at:
              new Date().toISOString(),
          }));

      if (rowsToUpsert.length > 0) {
        const { error } =
          await supabase
            .from(
              "snack_daily_exceptions"
            )
            .upsert(
              rowsToUpsert,
              {
                onConflict:
                  "semester_id,service_date,subject_type,subject_id",
              }
            );

        if (error) throw error;
      }

      const idsToDelete =
        existingForDay
          .filter(
            (item) =>
              !desiredIds.has(
                item.subject_id
              )
          )
          .map((item) => item.id)
          .filter(Boolean);

      if (idsToDelete.length > 0) {
        const { error } =
          await supabase
            .from(
              "snack_daily_exceptions"
            )
            .delete()
            .in(
              "id",
              idsToDelete
            );

        if (error) throw error;
      }

      const adjustmentNumber =
        Number(adjustment || 0);

      const hasAdjustment =
        adjustmentNumber !== 0 ||
        adjustmentNote.trim();

      if (hasAdjustment) {
        const { error } =
          await supabase
            .from(
              "snack_daily_adjustments"
            )
            .upsert(
              {
                semester_id:
                  selectedSemesterId,
                class_id:
                  classItem.id,
                service_date:
                  dateString,
                quantity_delta:
                  adjustmentNumber,
                reason:
                  adjustmentNote.trim() ||
                  null,
                updated_at:
                  new Date().toISOString(),
              },
              {
                onConflict:
                  "semester_id,class_id,service_date",
              }
            );

        if (error) throw error;
      } else {
        const { error } =
          await supabase
            .from(
              "snack_daily_adjustments"
            )
            .delete()
            .eq(
              "semester_id",
              selectedSemesterId
            )
            .eq(
              "class_id",
              classItem.id
            )
            .eq(
              "service_date",
              dateString
            );

        if (error) throw error;
      }

      await loadMonthlyBaseData();
      setSelectedCell(null);
    } catch (error) {
      console.error(
        "儲存單日點心調整失敗：",
        error
      );

      setErrorMessage(
        `儲存單日點心調整失敗：${error.message}`
      );
    } finally {
      setSavingCell(false);
    }
  }

  function openDailyCell(
    classItem,
    dateString
  ) {
    const studentsForDay =
      getClassStudentsForDate(
        classItem.id,
        dateString
      );

    const excludedIds =
      getDailyStudentExceptionIds(
        classItem.id,
        dateString
      );

    const studentReasons = {};

    dailySnackExceptions
      .filter(
        (item) =>
          item.service_date ===
            dateString &&
          item.subject_type ===
            "STUDENT"
      )
      .forEach((item) => {
        studentReasons[
          item.subject_id
        ] = item.reason || "";
      });

    const adjustmentRow =
      getDailyAdjustment(
        classItem.id,
        dateString
      );

    setSelectedCell({
      classItem,
      dateString,
      studentsForDay,
      excludedStudentIds:
        Array.from(excludedIds),
      studentReasons,
      adjustment:
        Number(
          adjustmentRow?.quantity_delta ||
          0
        ),
      adjustmentNote:
        adjustmentRow?.reason ||
        "",
    });
  }

  function openExternalOrders(dateString) {
    setSelectedExternalDate(dateString);
    setExternalNameInput("");
  }

  async function addExternalOrder() {
    const personName = externalNameInput.trim();

    if (!personName || !selectedExternalDate || !selectedSemesterId) return;

    try {
      setSavingExternalOrders(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("snack_external_orders")
        .insert({
          semester_id: selectedSemesterId,
          service_date: selectedExternalDate,
          person_name: personName,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) throw error;

      setExternalOrders((current) => [...current, data]);
      setExternalNameInput("");
    } catch (error) {
      console.error("新增美語／班外生點心失敗：", error);
      setErrorMessage(`新增美語／班外生點心失敗：${error.message}`);
    } finally {
      setSavingExternalOrders(false);
    }
  }

  async function deleteExternalOrder(id) {
    try {
      setSavingExternalOrders(true);
      setErrorMessage("");

      const { error } = await supabase
        .from("snack_external_orders")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setExternalOrders((current) =>
        current.filter((item) => item.id !== id)
      );
    } catch (error) {
      console.error("刪除美語／班外生點心失敗：", error);
      setErrorMessage(`刪除美語／班外生點心失敗：${error.message}`);
    } finally {
      setSavingExternalOrders(false);
    }
  }

  async function exportMonthlySnackPdf() {
    if (
      !selectedSemester ||
      !selectedMonth ||
      classRows.length === 0 ||
      monthlyLoading
    ) {
      return;
    }

    try {
      setErrorMessage("");

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const fontResponse = await fetch(
        "https://cdn.jsdelivr.net/gh/ButTaiwan/iansui@main/fonts/ttf/Iansui-Regular.ttf"
      );

      if (!fontResponse.ok) {
        throw new Error(
          `芫荽體載入失敗（${fontResponse.status}）`
        );
      }

      const fontBytes = new Uint8Array(
        await fontResponse.arrayBuffer()
      );

      let binary = "";
      const chunkSize = 0x8000;

      for (
        let offset = 0;
        offset < fontBytes.length;
        offset += chunkSize
      ) {
        binary += String.fromCharCode(
          ...fontBytes.subarray(
            offset,
            Math.min(
              offset + chunkSize,
              fontBytes.length
            )
          )
        );
      }

      pdf.addFileToVFS(
        "Iansui-Regular.ttf",
        btoa(binary)
      );
      pdf.addFont(
        "Iansui-Regular.ttf",
        "Iansui",
        "normal"
      );
      pdf.setFont("Iansui", "normal");

      const pageWidth =
        pdf.internal.pageSize.getWidth();
      const pageHeight =
        pdf.internal.pageSize.getHeight();
      const marginX = 7;
      const marginTop = 7;
      const contentWidth =
        pageWidth - marginX * 2;

      pdf.setTextColor(31, 42, 36);
      pdf.setFontSize(10);
      pdf.text(
        "倍思學院",
        marginX,
        marginTop + 4
      );

      pdf.setFontSize(17);
      pdf.text(
        "月點心表",
        marginX,
        marginTop + 11
      );

      pdf.setFontSize(8);
      pdf.setTextColor(104, 118, 110);
      pdf.text(
        selectedSemester.name,
        marginX,
        marginTop + 15
      );

      pdf.setTextColor(31, 42, 36);
      pdf.setFontSize(12);
      pdf.text(
        formatMonthLabel(selectedMonth),
        pageWidth - marginX,
        marginTop + 11,
        { align: "right" }
      );

      const fixedWidths = {
        className: 14,
        teacher: 16,
      };

      const fixedTotal =
        fixedWidths.className +
        fixedWidths.teacher;

      const dateWidth =
        (contentWidth - fixedTotal) /
        Math.max(monthDays.length, 1);

      const headerTop = marginTop + 20;
      const headerHeight = 10;
      const rowHeight = 7.2;

      function drawCell({
        x,
        y,
        width,
        height,
        textValue = "",
        fontSize = 7.2,
        fill = null,
        textColor = [31, 42, 36],
        align = "center",
      }) {
        if (fill) {
          pdf.setFillColor(...fill);
        }

        pdf.setDrawColor(201, 207, 202);
        pdf.setLineWidth(0.14);
        pdf.rect(
          x,
          y,
          width,
          height,
          fill ? "FD" : "S"
        );

        pdf.setFont("Iansui", "normal");
        pdf.setFontSize(fontSize);
        pdf.setTextColor(...textColor);

        const text = String(
          textValue ?? ""
        );

        if (!text) return;

        const textX =
          align === "left"
            ? x + 1.2
            : x + width / 2;
        const textY =
          y + height / 2 + fontSize * 0.11;

        pdf.text(
          text,
          textX,
          textY,
          {
            align,
            baseline: "middle",
          }
        );
      }

      let x = marginX;
      const headerFill = [242, 244, 240];

      drawCell({
        x,
        y: headerTop,
        width: fixedWidths.className,
        height: headerHeight,
        textValue: "班級",
        fontSize: 8,
        fill: headerFill,
      });
      x += fixedWidths.className;

      drawCell({
        x,
        y: headerTop,
        width: fixedWidths.teacher,
        height: headerHeight,
        textValue: "老師點心",
        fontSize: 7.5,
        fill: headerFill,
      });
      x += fixedWidths.teacher;

      monthDays.forEach((day) => {
        const closed =
          closedDateMap.get(day.dateString);

        drawCell({
          x,
          y: headerTop,
          width: dateWidth,
          height: headerHeight,
          textValue:
            `${day.day}\n${[
              "日",
              "一",
              "二",
              "三",
              "四",
              "五",
              "六",
            ][day.weekday]}`,
          fontSize: 6.6,
          fill: closed
            ? [243, 240, 236]
            : headerFill,
          textColor: closed
            ? [145, 128, 118]
            : [31, 42, 36],
        });

        x += dateWidth;
      });

      classRows.forEach(
        (classItem, rowIndex) => {
          const y =
            headerTop +
            headerHeight +
            rowIndex * rowHeight;

          let cellX = marginX;

          drawCell({
            x: cellX,
            y,
            width: fixedWidths.className,
            height: rowHeight,
            textValue:
              classItem.class_name,
            fontSize: 7.5,
            align: "left",
          });
          cellX += fixedWidths.className;

          drawCell({
            x: cellX,
            y,
            width: fixedWidths.teacher,
            height: rowHeight,
            textValue:
              getClassTeacherEatsSnack(
                classItem.id
              )
                ? "要"
                : "不要",
            fontSize: 7.3,
          });
          cellX += fixedWidths.teacher;

          classItem.counts.forEach(
            (cell) => {
              const closed =
                closedDateMap.get(
                  cell.dateString
                );

              drawCell({
                x: cellX,
                y,
                width: dateWidth,
                height: rowHeight,
                textValue: closed
                  ? "休"
                  : cell.count,
                fontSize: 7.2,
                fill: closed
                  ? [247, 245, 242]
                  : null,
                textColor: closed
                  ? [153, 145, 138]
                  : [31, 42, 36],
              });

              cellX += dateWidth;
            }
          );
        }
      );

      const externalRowY =
        headerTop +
        headerHeight +
        classRows.length * rowHeight;

      let externalX = marginX;

      drawCell({
        x: externalX,
        y: externalRowY,
        width:
          fixedWidths.className +
          fixedWidths.teacher,
        height: rowHeight,
        textValue: "美語／班外生",
        fontSize: 6.9,
        fill: [249, 247, 242],
        align: "left",
      });
      externalX +=
        fixedWidths.className +
        fixedWidths.teacher;

      monthDays.forEach((day) => {
        const closed = closedDateMap.get(day.dateString);
        drawCell({
          x: externalX,
          y: externalRowY,
          width: dateWidth,
          height: rowHeight,
          textValue: closed ? "休" : getExternalOrderCount(day.dateString),
          fontSize: 7.2,
          fill: closed ? [247,245,242] : [249,247,242],
          textColor: closed ? [153,145,138] : [31,42,36],
        });
        externalX += dateWidth;
      });

      const totalY =
        headerTop +
        headerHeight +
        (classRows.length + 1) * rowHeight;

      let totalX = marginX;

      drawCell({
        x: totalX,
        y: totalY,
        width: fixedWidths.className,
        height: rowHeight,
        textValue: "當日總計",
        fontSize: 7.2,
        fill: headerFill,
        align: "left",
      });
      totalX += fixedWidths.className;

      drawCell({
        x: totalX,
        y: totalY,
        width: fixedWidths.teacher,
        height: rowHeight,
        textValue: "—",
        fontSize: 7.2,
        fill: headerFill,
      });
      totalX += fixedWidths.teacher;

      dailyTotals.forEach((total) => {
        drawCell({
          x: totalX,
          y: totalY,
          width: dateWidth,
          height: rowHeight,
          textValue:
            total === null ? "—" : total,
          fontSize: 7.2,
          fill: headerFill,
        });

        totalX += dateWidth;
      });

      const adjustmentNotes = [];

      classRows.forEach((classItem) => {
        classItem.counts.forEach((cell) => {
          if (
            cell.breakdown
              ?.excludedCount > 0 ||
            cell.breakdown
              ?.adjustment !== 0 ||
            cell.breakdown
              ?.adjustmentNote
          ) {
            const parts = [];

            if (
              cell.breakdown
                ?.excludedCount > 0
            ) {
              parts.push(
                `臨時不吃 ${cell.breakdown.excludedCount} 人`
              );
            }

            if (
              cell.breakdown
                ?.adjustment !== 0
            ) {
              const value =
                cell.breakdown.adjustment;
              parts.push(
                `手動 ${value > 0 ? "+" : ""}${value}`
              );
            }

            if (
              cell.breakdown
                ?.adjustmentNote
            ) {
              parts.push(
                cell.breakdown.adjustmentNote
              );
            }

            adjustmentNotes.push(
              `${cell.dateString}｜${classItem.class_name}｜${parts.join("；")}`
            );
          }
        });
      });

      if (adjustmentNotes.length > 0) {
        pdf.addPage("a4", "landscape");
        pdf.setTextColor(31, 42, 36);
        pdf.setFontSize(15);
        pdf.text(
          "點心調整備註",
          marginX,
          marginTop + 8
        );

        pdf.setFontSize(8.5);
        pdf.setTextColor(92, 103, 96);

        let noteY = marginTop + 17;

        adjustmentNotes.forEach(
          (note) => {
            if (
              noteY >
              pageHeight - 10
            ) {
              pdf.addPage(
                "a4",
                "landscape"
              );
              noteY = marginTop + 10;
            }

            pdf.text(
              `• ${note}`,
              marginX,
              noteY
            );
            noteY += 6;
          }
        );
      }

      const safeSemester =
        String(
          selectedSemester.name ||
          "學期"
        ).replace(
          /[\\/:*?"<>|]/g,
          "_"
        );

      const safeMonth =
        selectedMonth.replace("-", "年") +
        "月";

      pdf.save(
        `${safeSemester}_${safeMonth}_月點心表.pdf`
      );
    } catch (error) {
      console.error(
        "產出月點心表 PDF 失敗：",
        error
      );

      setErrorMessage(
        `產出 PDF 失敗：${error.message}`
      );
    }
  }

  async function exportSnackSummaryPdf() {
    if (
      !selectedSemester ||
      preferenceLoading ||
      snackItemsLoading
    ) {
      return;
    }

    const activeItems = snackItems.filter(
      (item) => item.is_active
    );

    if (activeItems.length === 0) {
      setErrorMessage(
        "目前沒有啟用中的點心品項，無法產出統計 PDF。"
      );
      return;
    }

    function getStudentIdsForClass(
      classId
    ) {
      return Array.from(
        new Set(
          preferenceMemberships
            .filter(
              (membership) =>
                membership.class_id === classId
            )
            .map(
              (membership) =>
                membership.student_id
            )
        )
      );
    }

    function buildPdfItemSummary(
      studentIds,
      item
    ) {
      const studentIdSet =
        new Set(studentIds);

      const choices =
        studentSnackChoices.filter(
          (choice) =>
            studentIdSet.has(
              choice.student_id
            ) &&
            choice.snack_item_id ===
              item.id
        );

      if (item.requires_option) {
        const options =
          (item.options || [])
            .filter(
              (option) =>
                option.is_active
            )
            .map((option) => ({
              name:
                option.name +
                (
                  option.is_vegetarian_option
                    ? "（素）"
                    : ""
                ),
              count:
                choices.filter(
                  (choice) =>
                    choice.snack_item_option_id ===
                      option.id
                ).length,
            }));

        const selectedStudentIds =
          new Set(
            choices
              .filter(
                (choice) =>
                  choice.snack_item_option_id
              )
              .map(
                (choice) =>
                  choice.student_id
              )
          );

        return {
          itemName: item.name,
          detail:
            options
              .map(
                (option) =>
                  `${option.name}：${option.count}`
              )
              .join("　") ||
            "尚無可用選項",
          total:
            options.reduce(
              (sum, option) =>
                sum + option.count,
              0
            ),
          unselected:
            Math.max(
              0,
              studentIds.length -
                selectedStudentIds.size
            ),
        };
      }

      const total =
        choices.reduce(
          (sum, choice) =>
            sum +
            Math.max(
              0,
              Number(
                choice.quantity || 0
              )
            ),
          0
        );

      const selectedCount =
        choices.filter(
          (choice) =>
            Number(
              choice.quantity || 0
            ) > 0
        ).length;

      return {
        itemName: item.name,
        detail: `總份數：${total}`,
        total,
        unselected:
          Math.max(
            0,
            studentIds.length -
              selectedCount
          ),
      };
    }

    function buildPdfTeacherSummary(
      classId,
      teacherIds,
      item
    ) {
      const teacherIdSet =
        new Set(teacherIds);

      const choices =
        teacherSnackChoices.filter(
          (choice) =>
            choice.class_id === classId &&
            teacherIdSet.has(
              choice.teacher_id
            ) &&
            choice.snack_item_id ===
              item.id
        );

      if (item.requires_option) {
        const options =
          (item.options || [])
            .filter(
              (option) =>
                option.is_active
            )
            .map((option) => ({
              id: option.id,
              name:
                option.name +
                (
                  option.is_vegetarian_option
                    ? "（素）"
                    : ""
                ),
              count:
                choices.filter(
                  (choice) =>
                    choice.snack_item_option_id ===
                      option.id
                ).length,
            }));

        const selectedIds =
          new Set(
            choices
              .filter(
                (choice) =>
                  choice.snack_item_option_id
              )
              .map(
                (choice) =>
                  choice.teacher_id
              )
          );

        return {
          itemName: item.name,
          options,
          total:
            options.reduce(
              (sum, option) =>
                sum + option.count,
              0
            ),
          unselected:
            Math.max(
              0,
              teacherIds.length -
                selectedIds.size
            ),
        };
      }

      const total =
        choices.reduce(
          (sum, choice) =>
            sum +
            Math.max(
              0,
              Number(
                choice.quantity || 0
              )
            ),
          0
        );

      const selectedIds =
        new Set(
          choices
            .filter(
              (choice) =>
                Number(
                  choice.quantity || 0
                ) > 0
            )
            .map(
              (choice) =>
                choice.teacher_id
            )
        );

      return {
        itemName: item.name,
        total,
        unselected:
          Math.max(
            0,
            teacherIds.length -
              selectedIds.size
          ),
      };
    }

    function mergePdfRows(
      studentRow,
      teacherRow,
      item
    ) {
      if (item.requires_option) {
        const studentParts =
          (item.options || [])
            .filter(
              (option) =>
                option.is_active
            )
            .map((option) => {
              const teacherOption =
                teacherRow.options?.find(
                  (row) =>
                    row.id === option.id
                );

              const studentChoiceCount =
                studentSnackChoices.filter(
                  (choice) =>
                    choice.snack_item_id ===
                      item.id &&
                    choice.snack_item_option_id ===
                      option.id
                );

              return {
                name:
                  option.name +
                  (
                    option.is_vegetarian_option
                      ? "（素）"
                      : ""
                  ),
                teacherCount:
                  teacherOption?.count ||
                  0,
              };
            });

        const studentDetailMap =
          new Map();

        String(studentRow.detail || "")
          .split("　")
          .forEach((part) => {
            const [name, value] =
              part.split("：");
            if (name) {
              studentDetailMap.set(
                name,
                Number(value || 0)
              );
            }
          });

        const detail =
          studentParts
            .map((part) => {
              const studentCount =
                studentDetailMap.get(
                  part.name
                ) || 0;

              return `${part.name}：${
                studentCount +
                part.teacherCount
              }`;
            })
            .join("　");

        return {
          itemName: item.name,
          detail:
            detail ||
            "尚無可用選項",
          total:
            studentRow.total +
            teacherRow.total,
          unselected:
            studentRow.unselected +
            teacherRow.unselected,
        };
      }

      const total =
        studentRow.total +
        teacherRow.total;

      return {
        itemName: item.name,
        detail: `總份數：${total}`,
        total,
        unselected:
          studentRow.unselected +
          teacherRow.unselected,
      };
    }

    const classSummaries =
      preferenceClasses.map(
        (classItem) => {
          const studentIds =
            getStudentIdsForClass(
              classItem.id
            );

          const teacherIds =
            getPreferenceTeachersForClass(
              classItem.id
            ).map(
              (teacher) =>
                teacher.teacher_id
            );

          return {
            title:
              classItem.class_name,
            studentCount:
              studentIds.length,
            teacherCount:
              teacherIds.length,
            rows:
              activeItems.map(
                (item) =>
                  mergePdfRows(
                    buildPdfItemSummary(
                      studentIds,
                      item
                    ),
                    buildPdfTeacherSummary(
                      classItem.id,
                      teacherIds,
                      item
                    ),
                    item
                  )
              ),
          };
        }
      );

    const overallSummary = {
      title: "全部班級總計",
      studentCount:
        classSummaries.reduce(
          (sum, summary) =>
            sum +
            summary.studentCount,
          0
        ),
      teacherCount:
        classSummaries.reduce(
          (sum, summary) =>
            sum +
            summary.teacherCount,
          0
        ),
      rows:
        activeItems.map(
          (item) => {
            const rows =
              classSummaries.map(
                (summary) =>
                  summary.rows.find(
                    (row) =>
                      row.itemName ===
                      item.name
                  )
              );

            if (
              item.requires_option
            ) {
              const optionTotals =
                new Map();

              rows.forEach((row) => {
                String(row?.detail || "")
                  .split("　")
                  .forEach((part) => {
                    const [name, value] =
                      part.split("：");
                    if (!name) return;
                    optionTotals.set(
                      name,
                      (optionTotals.get(
                        name
                      ) || 0) +
                        Number(
                          value || 0
                        )
                    );
                  });
              });

              return {
                itemName: item.name,
                detail:
                  Array.from(
                    optionTotals.entries()
                  )
                    .map(
                      ([name, count]) =>
                        `${name}：${count}`
                    )
                    .join("　") ||
                  "尚無可用選項",
                total:
                  rows.reduce(
                    (sum, row) =>
                      sum +
                      Number(
                        row?.total || 0
                      ),
                    0
                  ),
                unselected:
                  rows.reduce(
                    (sum, row) =>
                      sum +
                      Number(
                        row?.unselected ||
                          0
                      ),
                    0
                  ),
              };
            }

            const total =
              rows.reduce(
                (sum, row) =>
                  sum +
                  Number(
                    row?.total || 0
                  ),
                0
              );

            return {
              itemName: item.name,
              detail:
                `總份數：${total}`,
              total,
              unselected:
                rows.reduce(
                  (sum, row) =>
                    sum +
                    Number(
                      row?.unselected ||
                        0
                    ),
                  0
                ),
            };
          }
        ),
    };

    try {
      setExportingSummaryPdf(true);
      setErrorMessage("");

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const fontResponse = await fetch(
        "https://cdn.jsdelivr.net/gh/ButTaiwan/iansui@main/fonts/ttf/Iansui-Regular.ttf"
      );

      if (!fontResponse.ok) {
        throw new Error(
          `芫荽體載入失敗（${fontResponse.status}）`
        );
      }

      const fontBytes =
        new Uint8Array(
          await fontResponse.arrayBuffer()
        );

      let binary = "";
      const chunkSize = 0x8000;

      for (
        let offset = 0;
        offset < fontBytes.length;
        offset += chunkSize
      ) {
        binary +=
          String.fromCharCode(
            ...fontBytes.subarray(
              offset,
              Math.min(
                offset + chunkSize,
                fontBytes.length
              )
            )
          );
      }

      pdf.addFileToVFS(
        "Iansui-Regular.ttf",
        btoa(binary)
      );

      pdf.addFont(
        "Iansui-Regular.ttf",
        "Iansui",
        "normal"
      );

      pdf.setFont(
        "Iansui",
        "normal"
      );

      const pageWidth =
        pdf.internal.pageSize.getWidth();
      const pageHeight =
        pdf.internal.pageSize.getHeight();

      const marginX = 13;
      const marginTop = 12;
      const contentWidth =
        pageWidth -
        marginX * 2;

      const colWidths = {
        item: 42,
        total: 24,
      };

      const detailWidth =
        contentWidth -
        colWidths.item -
        colWidths.total;

      function drawPageHeader(
        title,
        studentCount,
        isContinuation = false
      ) {
        pdf.setTextColor(
          43,
          54,
          47
        );

        pdf.setFontSize(9);
        pdf.text(
          "倍思學院｜點心訂購統計",
          marginX,
          marginTop
        );

        pdf.setFontSize(17);
        pdf.text(
          isContinuation
            ? `${title}（續）`
            : title,
          marginX,
          marginTop + 9
        );

        pdf.setFontSize(8.5);
        pdf.setTextColor(
          104,
          116,
          108
        );

        pdf.text(
          `${selectedSemester.name}｜${studentCount} 位學生`,
          marginX,
          marginTop + 15
        );

        pdf.text(
          `列印日期：${new Intl.DateTimeFormat(
            "zh-TW"
          ).format(new Date())}`,
          pageWidth - marginX,
          marginTop + 15,
          { align: "right" }
        );

        return marginTop + 21;
      }

      function drawTableHeader(y) {
        const height = 9;

        pdf.setFillColor(
          242,
          244,
          240
        );
        pdf.setDrawColor(
          201,
          207,
          202
        );
        pdf.setTextColor(
          52,
          66,
          58
        );
        pdf.setFontSize(8);

        let x = marginX;

        [
          {
            text: "點心",
            width:
              colWidths.item,
            align: "left",
          },
          {
            text:
              "選項／數量",
            width:
              detailWidth,
            align: "left",
          },
          {
            text: "合計",
            width:
              colWidths.total,
            align: "center",
          },
        ].forEach((cell) => {
          pdf.rect(
            x,
            y,
            cell.width,
            height,
            "FD"
          );

          pdf.text(
            cell.text,
            cell.align === "center"
              ? x +
                  cell.width /
                    2
              : x + 2,
            y + 5.8,
            {
              align:
                cell.align,
            }
          );

          x += cell.width;
        });

        return y + height;
      }

      function drawSummaryPage(
        summary,
        addNewPage
      ) {
        if (addNewPage) {
          pdf.addPage(
            "a4",
            "portrait"
          );
        }

        let y =
          drawPageHeader(
            summary.title,
            summary.studentCount
          );

        y =
          drawTableHeader(y);

        summary.rows.forEach(
          (row) => {
            const detailText =
              row.unselected > 0
                ? `${row.detail}　｜　未設定：${row.unselected}`
                : row.detail;

            const detailLines =
              pdf.splitTextToSize(
                detailText,
                detailWidth - 4
              );

            const itemLines =
              pdf.splitTextToSize(
                row.itemName,
                colWidths.item - 4
              );

            const lineCount =
              Math.max(
                detailLines.length,
                itemLines.length,
                1
              );

            const rowHeight =
              Math.max(
                11,
                lineCount *
                  4.5 +
                  5
              );

            if (
              y + rowHeight >
              pageHeight - 15
            ) {
              pdf.addPage(
                "a4",
                "portrait"
              );

              y =
                drawPageHeader(
                  summary.title,
                  summary.studentCount,
                  true
                );

              y =
                drawTableHeader(
                  y
                );
            }

            pdf.setDrawColor(
              220,
              224,
              220
            );
            pdf.setTextColor(
              48,
              60,
              53
            );
            pdf.setFontSize(
              8.5
            );

            let x = marginX;

            pdf.rect(
              x,
              y,
              colWidths.item,
              rowHeight
            );

            pdf.text(
              itemLines,
              x + 2,
              y + 5,
              {
                baseline: "top",
              }
            );

            x +=
              colWidths.item;

            pdf.rect(
              x,
              y,
              detailWidth,
              rowHeight
            );

            pdf.text(
              detailLines,
              x + 2,
              y + 5,
              {
                baseline: "top",
              }
            );

            x +=
              detailWidth;

            pdf.rect(
              x,
              y,
              colWidths.total,
              rowHeight
            );

            pdf.setFontSize(
              11
            );
            pdf.text(
              String(
                row.total
              ),
              x +
                colWidths.total /
                  2,
              y +
                rowHeight /
                  2 +
                1.2,
              {
                align:
                  "center",
              }
            );

            y += rowHeight;
          }
        );
      }

      drawSummaryPage(
        overallSummary,
        false
      );

      classSummaries.forEach(
        (summary) =>
          drawSummaryPage(
            summary,
            true
          )
      );

      const safeSemester =
        String(
          selectedSemester.name ||
          "學期"
        ).replace(
          /[\\/:*?"<>|]/g,
          "_"
        );

      pdf.save(
        `${safeSemester}_點心訂購統計.pdf`
      );
    } catch (error) {
      console.error(
        "產出點心訂購統計 PDF 失敗：",
        error
      );

      setErrorMessage(
        `產出統計 PDF 失敗：${error.message}`
      );
    } finally {
      setExportingSummaryPdf(false);
    }
  }

  function renderSnackSummary() {
    const activeItems = snackItems.filter(
      (item) => item.is_active
    );

    const getClassStudentIds = (classId) =>
      Array.from(
        new Set(
          preferenceMemberships
            .filter(
              (membership) =>
                membership.class_id === classId
            )
            .map(
              (membership) =>
                membership.student_id
            )
        )
      );

    const buildItemSummary = (
      studentIds,
      item
    ) => {
      const studentIdSet =
        new Set(studentIds);

      const choices =
        studentSnackChoices.filter(
          (choice) =>
            studentIdSet.has(
              choice.student_id
            ) &&
            choice.snack_item_id ===
              item.id
        );

      if (item.requires_option) {
        const options =
          (item.options || [])
            .filter(
              (option) =>
                option.is_active
            )
            .map((option) => ({
              id: option.id,
              name: option.name,
              isVegetarian:
                Boolean(
                  option.is_vegetarian_option
                ),
              count:
                choices.filter(
                  (choice) =>
                    choice.snack_item_option_id ===
                      option.id
                ).length,
            }));

        const selectedStudentIds =
          new Set(
            choices
              .filter(
                (choice) =>
                  choice.snack_item_option_id
              )
              .map(
                (choice) =>
                  choice.student_id
              )
          );

        return {
          type: "options",
          item,
          options,
          total:
            options.reduce(
              (sum, option) =>
                sum + option.count,
              0
            ),
          unselected:
            Math.max(
              0,
              studentIds.length -
                selectedStudentIds.size
            ),
        };
      }

      const quantity =
        choices.reduce(
          (sum, choice) =>
            sum +
            Math.max(
              0,
              Number(
                choice.quantity || 0
              )
            ),
          0
        );

      const selectedCount =
        choices.filter(
          (choice) =>
            Number(
              choice.quantity || 0
            ) > 0
        ).length;

      return {
        type: "quantity",
        item,
        total: quantity,
        selectedCount,
        unselected:
          Math.max(
            0,
            studentIds.length -
              selectedCount
          ),
      };
    };

    const buildTeacherItemSummary = (
      classId,
      teacherIds,
      item
    ) => {
      const teacherIdSet =
        new Set(teacherIds);

      const choices =
        teacherSnackChoices.filter(
          (choice) =>
            choice.class_id === classId &&
            teacherIdSet.has(
              choice.teacher_id
            ) &&
            choice.snack_item_id ===
              item.id
        );

      if (item.requires_option) {
        const options =
          (item.options || [])
            .filter(
              (option) =>
                option.is_active
            )
            .map((option) => ({
              id: option.id,
              name: option.name,
              isVegetarian:
                Boolean(
                  option.is_vegetarian_option
                ),
              count:
                choices.filter(
                  (choice) =>
                    choice.snack_item_option_id ===
                      option.id
                ).length,
            }));

        const selectedIds =
          new Set(
            choices
              .filter(
                (choice) =>
                  choice.snack_item_option_id
              )
              .map(
                (choice) =>
                  choice.teacher_id
              )
          );

        return {
          type: "options",
          item,
          options,
          total:
            options.reduce(
              (sum, option) =>
                sum + option.count,
              0
            ),
          unselected:
            Math.max(
              0,
              teacherIds.length -
                selectedIds.size
            ),
        };
      }

      const total =
        choices.reduce(
          (sum, choice) =>
            sum +
            Math.max(
              0,
              Number(
                choice.quantity || 0
              )
            ),
          0
        );

      const selectedIds =
        new Set(
          choices
            .filter(
              (choice) =>
                Number(
                  choice.quantity || 0
                ) > 0
            )
            .map(
              (choice) =>
                choice.teacher_id
            )
        );

      return {
        type: "quantity",
        item,
        total,
        selectedCount:
          selectedIds.size,
        unselected:
          Math.max(
            0,
            teacherIds.length -
              selectedIds.size
          ),
      };
    };

    const mergeSummaries = (
      studentSummary,
      teacherSummary
    ) => {
      if (
        studentSummary.type ===
        "options"
      ) {
        return {
          ...studentSummary,
          options:
            studentSummary.options.map(
              (option) => {
                const teacherOption =
                  teacherSummary.options.find(
                    (row) =>
                      row.id === option.id
                  );

                return {
                  ...option,
                  count:
                    option.count +
                    (teacherOption?.count ||
                      0),
                };
              }
            ),
          total:
            studentSummary.total +
            teacherSummary.total,
          unselected:
            studentSummary.unselected +
            teacherSummary.unselected,
        };
      }

      return {
        ...studentSummary,
        total:
          studentSummary.total +
          teacherSummary.total,
        selectedCount:
          (studentSummary.selectedCount ||
            0) +
          (teacherSummary.selectedCount ||
            0),
        unselected:
          studentSummary.unselected +
          teacherSummary.unselected,
      };
    };

    const classSummaries =
      preferenceClasses.map(
        (classItem) => {
          const studentIds =
            getClassStudentIds(
              classItem.id
            );

          const teacherIds =
            getPreferenceTeachersForClass(
              classItem.id
            ).map(
              (teacher) =>
                teacher.teacher_id
            );

          return {
            classItem,
            studentIds,
            teacherIds,
            itemSummaries:
              activeItems.map(
                (item) =>
                  mergeSummaries(
                    buildItemSummary(
                      studentIds,
                      item
                    ),
                    buildTeacherItemSummary(
                      classItem.id,
                      teacherIds,
                      item
                    )
                  )
              ),
          };
        }
      );

    const allStudentIds = Array.from(
      new Set(
        preferenceMemberships.map(
          (membership) =>
            membership.student_id
        )
      )
    );

    const overallSummary =
      activeItems.map(
        (item) => {
          const empty =
            buildItemSummary([], item);

          return classSummaries.reduce(
            (total, classSummary) => {
              const current =
                classSummary.itemSummaries.find(
                  (row) =>
                    row.item.id ===
                    item.id
                );

              return mergeSummaries(
                total,
                current
              );
            },
            empty
          );
        }
      );

    function renderSummaryTable(
      itemSummaries
    ) {
      if (
        itemSummaries.length === 0
      ) {
        return (
          <div
            style={{
              padding: "28px 18px",
              textAlign: "center",
              color: "#929992",
            }}
          >
            尚未建立啟用中的點心品項
          </div>
        );
      }

      return (
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse:
                "separate",
              borderSpacing: 0,
              fontSize: "13px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    width: "32%",
                    padding:
                      "10px 12px",
                    textAlign: "left",
                    background:
                      "#f4f6f2",
                    color: "#34423a",
                    borderBottom:
                      "1px solid #e1e5df",
                  }}
                >
                  點心
                </th>

                <th
                  style={{
                    padding:
                      "10px 12px",
                    textAlign: "left",
                    background:
                      "#f4f6f2",
                    color: "#34423a",
                    borderBottom:
                      "1px solid #e1e5df",
                  }}
                >
                  選項／數量
                </th>

                <th
                  style={{
                    width: "88px",
                    padding:
                      "10px 12px",
                    textAlign: "center",
                    background:
                      "#f4f6f2",
                    color: "#34423a",
                    borderBottom:
                      "1px solid #e1e5df",
                  }}
                >
                  合計
                </th>
              </tr>
            </thead>

            <tbody>
              {itemSummaries.map(
                (summary) => (
                  <tr
                    key={
                      summary.item.id
                    }
                  >
                    <th
                      style={{
                        padding:
                          "12px",
                        textAlign: "left",
                        verticalAlign:
                          "top",
                        background:
                          "#fff",
                        color:
                          "#34423a",
                        borderBottom:
                          "1px solid #ecefeb",
                      }}
                    >
                      <div>
                        {
                          summary.item
                            .name
                        }
                      </div>

                      <small
                        style={{
                          display:
                            "block",
                          marginTop:
                            "4px",
                          color:
                            "#929992",
                          fontWeight:
                            400,
                        }}
                      >
                        {summary.type ===
                        "options"
                          ? "口味統計"
                          : "數量統計"}
                      </small>
                    </th>

                    <td
                      style={{
                        padding:
                          "10px 12px",
                        verticalAlign:
                          "top",
                        borderBottom:
                          "1px solid #ecefeb",
                      }}
                    >
                      {summary.type ===
                      "options" ? (
                        <div
                          style={{
                            display:
                              "flex",
                            gap: "7px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          {summary.options.map(
                            (
                              option
                            ) => (
                              <span
                                key={
                                  option.id
                                }
                                style={{
                                  padding:
                                    "6px 9px",
                                  border:
                                    "1px solid #e0e4de",
                                  borderRadius:
                                    "999px",
                                  background:
                                    option.count >
                                    0
                                      ? "#f1f6f2"
                                      : "#fafafa",
                                  color:
                                    option.count >
                                    0
                                      ? "#4f6758"
                                      : "#9a9f9b",
                                  whiteSpace:
                                    "nowrap",
                                }}
                              >
                                {
                                  option.name
                                }
                                {option.isVegetarian
                                  ? "（素）"
                                  : ""}
                                {" "}
                                <strong>
                                  {
                                    option.count
                                  }
                                </strong>
                              </span>
                            )
                          )}

                          {summary.unselected >
                            0 && (
                            <span
                              style={{
                                padding:
                                  "6px 9px",
                                border:
                                  "1px dashed #ddd8cf",
                                borderRadius:
                                  "999px",
                                color:
                                  "#9a765e",
                                background:
                                  "#fffaf3",
                                whiteSpace:
                                  "nowrap",
                              }}
                            >
                              未選擇{" "}
                              <strong>
                                {
                                  summary.unselected
                                }
                              </strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          style={{
                            display:
                              "flex",
                            gap: "8px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <span
                            style={{
                              padding:
                                "6px 9px",
                              border:
                                "1px solid #e0e4de",
                              borderRadius:
                                "999px",
                              background:
                                "#f1f6f2",
                              color:
                                "#4f6758",
                            }}
                          >
                            總份數{" "}
                            <strong>
                              {
                                summary.total
                              }
                            </strong>
                          </span>

                          {summary.unselected >
                            0 && (
                            <span
                              style={{
                                padding:
                                  "6px 9px",
                                border:
                                  "1px dashed #ddd8cf",
                                borderRadius:
                                  "999px",
                                background:
                                  "#fffaf3",
                                color:
                                  "#9a765e",
                              }}
                            >
                              未設定{" "}
                              <strong>
                                {
                                  summary.unselected
                                }
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td
                      style={{
                        padding:
                          "10px 12px",
                        textAlign:
                          "center",
                        verticalAlign:
                          "top",
                        borderBottom:
                          "1px solid #ecefeb",
                        fontSize:
                          "18px",
                        fontWeight:
                          800,
                        color:
                          "#34423a",
                      }}
                    >
                      {summary.total}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div
        style={{
          marginTop: "22px",
          display: "grid",
          gap: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong
              style={{
                display: "block",
                color: "#34423a",
                fontSize: "16px",
              }}
            >
              各班與全校訂購統計
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "4px",
                color: "#879088",
                fontSize: "12px",
              }}
            >
              PDF 第一頁為全部班級總計，後續每個班級各一頁。
            </span>
          </div>

          <button
            type="button"
            onClick={
              exportSnackSummaryPdf
            }
            disabled={
              exportingSummaryPdf ||
              preferenceLoading ||
              snackItemsLoading ||
              activeItems.length === 0
            }
            style={{
              height: "40px",
              padding: "0 15px",
              border:
                "1px solid #cfd7d0",
              borderRadius: "10px",
              background: "#fff",
              color: "#445149",
              font: "inherit",
              fontWeight: 700,
              cursor:
                exportingSummaryPdf
                  ? "wait"
                  : "pointer",
            }}
          >
            {exportingSummaryPdf
              ? "產出 PDF 中…"
              : "下載統計 PDF"}
          </button>
        </div>

        {preferenceLoading ||
        snackItemsLoading ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              color: "#879088",
            }}
          >
            正在整理訂購統計…
          </div>
        ) : (
          <>
            <section
              style={{
                border:
                  "1px solid #d9e0da",
                borderRadius:
                  "14px",
                overflow: "hidden",
                background: "#fff",
                boxShadow:
                  "0 4px 14px rgba(45,60,50,.05)",
              }}
            >
              <div
                style={{
                  padding:
                    "15px 18px",
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "space-between",
                  gap: "12px",
                  flexWrap:
                    "wrap",
                  background:
                    "#eef4ef",
                  borderBottom:
                    "1px solid #d9e0da",
                }}
              >
                <div>
                  <strong
                    style={{
                      display:
                        "block",
                      fontSize:
                        "17px",
                      color:
                        "#34423a",
                    }}
                  >
                    全部班級總計
                  </strong>

                  <span
                    style={{
                      display:
                        "block",
                      marginTop:
                        "3px",
                      color:
                        "#718078",
                      fontSize:
                        "12px",
                    }}
                  >
                    {
                      allStudentIds.length
                    }{" "}
                    位在籍學生
                  </span>
                </div>

                <span
                  style={{
                    padding:
                      "5px 9px",
                    borderRadius:
                      "999px",
                    background:
                      "#fff",
                    color:
                      "#587363",
                    fontSize:
                      "11px",
                    fontWeight:
                      700,
                  }}
                >
                  ALL CLASSES
                </span>
              </div>

              {renderSummaryTable(
                overallSummary
              )}
            </section>

            <div
              style={{
                display: "grid",
                gap: "14px",
              }}
            >
              {classSummaries.map(
                ({
                  classItem,
                  studentIds,
                  itemSummaries,
                }) => (
                  <section
                    key={
                      classItem.id
                    }
                    style={{
                      border:
                        "1px solid #e1e5df",
                      borderRadius:
                        "14px",
                      overflow:
                        "hidden",
                      background:
                        "#fff",
                    }}
                  >
                    <div
                      style={{
                        padding:
                          "13px 16px",
                        display:
                          "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "space-between",
                        gap:
                          "10px",
                        background:
                          "#fafbf8",
                        borderBottom:
                          "1px solid #e1e5df",
                      }}
                    >
                      <strong
                        style={{
                          color:
                            "#34423a",
                          fontSize:
                            "15px",
                        }}
                      >
                        {
                          classItem.class_name
                        }
                      </strong>

                      <span
                        style={{
                          color:
                            "#879088",
                          fontSize:
                            "12px",
                        }}
                      >
                        {
                          studentIds.length
                        }{" "}
                        位學生
                      </span>
                    </div>

                    {renderSummaryTable(
                      itemSummaries
                    )}
                  </section>
                )
              )}
            </div>

            <div
              style={{
                padding:
                  "11px 13px",
                borderRadius:
                  "10px",
                background:
                  "#fff8e8",
                color: "#806b38",
                fontSize:
                  "12px",
                lineHeight: 1.7,
              }}
            >
              統計只計入系統目前在籍的安親班學生；美語／班外生維持每日臨時訂餐，不納入固定口味統計。
            </div>
          </>
        )}
      </div>
    );
  }

  async function exportSnackPreferencePdf() {
    const activeItems = snackItems.filter((item) => item.is_active);
    const selectedClass = preferenceClasses.find(
      (classItem) => classItem.id === selectedPreferenceClassId
    );

    if (!selectedClass || activeItems.length === 0 || preferenceLoading || snackItemsLoading) {
      return;
    }

    try {
      setExportingPreferencePdf(true);
      setErrorMessage("");

      const students = preferenceMemberships
        .filter((membership) => membership.class_id === selectedPreferenceClassId)
        .map((membership) => ({
          type: "STUDENT",
          id: membership.student_id,
          name:
            membership.students?.chinese_name ||
            membership.students?.english_name ||
            "未命名學生",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

      const teachers = getPreferenceTeachersForClass(selectedPreferenceClassId).map(
        (teacher) => ({
          type: "TEACHER",
          id: teacher.teacher_id,
          name: `${teacher.name}（老師）`,
        })
      );

      const people = [...teachers, ...students];
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const fontResponse = await fetch(
        "https://cdn.jsdelivr.net/gh/ButTaiwan/iansui@main/fonts/ttf/Iansui-Regular.ttf"
      );
      if (!fontResponse.ok) {
        throw new Error(`芫荽體載入失敗（${fontResponse.status}）`);
      }

      const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < fontBytes.length; offset += chunkSize) {
        binary += String.fromCharCode(
          ...fontBytes.subarray(offset, Math.min(offset + chunkSize, fontBytes.length))
        );
      }
      const fontBase64 = btoa(binary);
      pdf.addFileToVFS("Iansui-Regular.ttf", fontBase64);
      pdf.addFont("Iansui-Regular.ttf", "Iansui", "normal");
      pdf.setFont("Iansui", "normal");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const nameWidth = 34;
      const usableWidth = pageWidth - margin * 2;
      const itemWidth = (usableWidth - nameWidth) / activeItems.length;
      const headerHeight = 15;
      const rowHeight = 10;

      const optionNameMap = new Map();
      activeItems.forEach((item) => {
        (item.options || []).forEach((option) => optionNameMap.set(option.id, option.name));
      });

      function choiceText(person, item) {
        const choice = person.type === "TEACHER"
          ? getTeacherSnackChoice(person.id, selectedPreferenceClassId, item.id)
          : getStudentSnackChoice(person.id, item.id);

        if (!choice) return "—";
        if (item.requires_option) {
          return optionNameMap.get(choice.snack_item_option_id) || "—";
        }
        return String(Number(choice.quantity || 0));
      }

      function drawPageHeader(pageNumber) {
        pdf.setFontSize(16);
        pdf.text(`${selectedClass.class_name}｜點心口味表`, margin, 12);
        pdf.setFontSize(9);
        pdf.text(
          `${selectedSemester?.name || ""}　即時資料　${people.length} 人`,
          margin,
          18
        );
        pdf.text(`第 ${pageNumber} 頁`, pageWidth - margin, 18, { align: "right" });
      }

      function drawTableHeader(y) {
        pdf.setDrawColor(205, 211, 205);
        pdf.setLineWidth(0.15);
        pdf.setFont("Iansui", "normal");
        pdf.setFontSize(9);

        // 姓名欄：每一格都明確重新指定填色與文字色，
        // 避免 jsPDF 在前一個繪圖操作後沿用錯誤狀態。
        pdf.setFillColor(244, 246, 242);
        pdf.rect(margin, y, nameWidth, headerHeight, "FD");
        pdf.setTextColor(52, 66, 58);
        pdf.text("姓名", margin + 2, y + 9);

        activeItems.forEach((item, index) => {
          const x = margin + nameWidth + itemWidth * index;

          // 每一個點心表頭格都重新指定顏色，不能只在迴圈外設定一次。
          pdf.setFillColor(244, 246, 242);
          pdf.setDrawColor(205, 211, 205);
          pdf.rect(x, y, itemWidth, headerHeight, "FD");

          pdf.setTextColor(52, 66, 58);
          pdf.setFont("Iansui", "normal");
          pdf.setFontSize(9);

          const lines = pdf.splitTextToSize(
            item.name,
            Math.max(8, itemWidth - 3)
          );

          pdf.text(
            lines.slice(0, 2),
            x + itemWidth / 2,
            y + 6,
            { align: "center" }
          );
        });

        return y + headerHeight;
      }

      let pageNumber = 1;
      drawPageHeader(pageNumber);
      let y = drawTableHeader(23);

      if (people.length === 0) {
        pdf.setFontSize(11);
        pdf.text("目前沒有可設定的人員", margin, y + 10);
      } else {
        people.forEach((person) => {
          if (y + rowHeight > pageHeight - margin) {
            pdf.addPage();
            pageNumber += 1;
            drawPageHeader(pageNumber);
            y = drawTableHeader(23);
          }

          pdf.setDrawColor(220, 224, 220);
          pdf.setTextColor(31, 42, 36);
          pdf.setFont("Iansui", "normal");
          pdf.rect(margin, y, nameWidth, rowHeight);
          pdf.setFontSize(9);
          pdf.text(person.name, margin + 2, y + 6.5);

          activeItems.forEach((item, index) => {
            const x = margin + nameWidth + itemWidth * index;
            pdf.rect(x, y, itemWidth, rowHeight);
            const text = choiceText(person, item);
            const lines = pdf.splitTextToSize(text, Math.max(8, itemWidth - 3));
            pdf.text(lines.slice(0, 2), x + itemWidth / 2, y + 6.5, { align: "center" });
          });

          y += rowHeight;
        });
      }

      const safeClassName = (selectedClass.class_name || "班級").replace(/[\\/:*?\"<>|]/g, "-");
      pdf.save(`${safeClassName}_點心口味表.pdf`);
    } catch (error) {
      console.error("產出點心口味 PDF 失敗：", error);
      setErrorMessage(`產出點心口味 PDF 失敗：${error.message}`);
    } finally {
      setExportingPreferencePdf(false);
    }
  }

  function renderSnackPreferences() {
    const activeItems = snackItems.filter(
      (item) => item.is_active
    );

    const selectedClass =
      preferenceClasses.find(
        (classItem) =>
          classItem.id ===
          selectedPreferenceClassId
      ) || null;

    const students =
      preferenceMemberships
        .filter(
          (membership) =>
            membership.class_id ===
            selectedPreferenceClassId
        )
        .map((membership) => ({
          student_id:
            membership.student_id,
          name:
            membership.students?.chinese_name ||
            membership.students?.english_name ||
            "未命名學生",
        }))
        .sort((a, b) =>
          a.name.localeCompare(
            b.name,
            "zh-Hant"
          )
        );

    const teachers =
      getPreferenceTeachersForClass(
        selectedPreferenceClassId
      );

    const teacherEnabled =
      classTeacherEatsSnackForPreference(
        selectedPreferenceClassId
      );

    function renderChoiceCell({
      personType,
      personId,
      item,
      rowIndex,
    }) {
      const isTeacher =
        personType === "TEACHER";

      const choice = isTeacher
        ? getTeacherSnackChoice(
            personId,
            selectedPreferenceClassId,
            item.id
          )
        : getStudentSnackChoice(
            personId,
            item.id
          );

      const savingKey = isTeacher
        ? `teacher:${selectedPreferenceClassId}:${personId}:${item.id}`
        : `${personId}:${item.id}`;

      const saving =
        savingPreferenceKey ===
        savingKey;

      const activeOptions =
        (item.options || []).filter(
          (option) =>
            option.is_active
        );

      const saveChoice = ({
        optionId = null,
        quantity = 1,
      }) => {
        if (isTeacher) {
          return saveTeacherSnackChoice({
            teacherId: personId,
            classId:
              selectedPreferenceClassId,
            snackItem: item,
            optionId,
            quantity,
          });
        }

        return saveStudentSnackChoice({
          studentId: personId,
          snackItem: item,
          optionId,
          quantity,
        });
      };

      return (
        <td
          key={item.id}
          style={{
            padding: "7px 8px",
            textAlign: "center",
            background:
              isTeacher
                ? "#fffaf0"
                : rowIndex % 2 === 0
                ? "#fff"
                : "#fbfcfa",
            borderBottom:
              "1px solid #ecefeb",
            borderRight:
              "1px solid #ecefeb",
          }}
        >
          {item.requires_option ? (
            activeOptions.length === 0 ? (
              <span
                style={{
                  color: "#a0968d",
                  fontSize: "12px",
                }}
              >
                尚無選項
              </span>
            ) : (
              <select
                value={
                  choice?.snack_item_option_id ||
                  ""
                }
                onChange={(event) =>
                  saveChoice({
                    optionId:
                      event.target.value ||
                      null,
                    quantity: 1,
                  })
                }
                disabled={saving}
                style={{
                  width: "100%",
                  height: "36px",
                  border:
                    "1px solid #d9ded8",
                  borderRadius: "8px",
                  background: "#fff",
                  padding: "0 8px",
                  font: "inherit",
                }}
              >
                <option value="">
                  未選擇
                </option>
                {activeOptions.map(
                  (option) => (
                    <option
                      key={option.id}
                      value={option.id}
                    >
                      {option.name}
                      {option.is_vegetarian_option
                        ? "（素）"
                        : ""}
                    </option>
                  )
                )}
              </select>
            )
          ) : (
            <input
              type="number"
              min="0"
              step="1"
              value={
                choice?.quantity ?? ""
              }
              onChange={(event) =>
                saveChoice({
                  quantity:
                    event.target.value,
                })
              }
              disabled={saving}
              placeholder="0"
              style={{
                width: "82px",
                height: "36px",
                border:
                  "1px solid #d9ded8",
                borderRadius: "8px",
                background: "#fff",
                padding: "0 8px",
                textAlign: "center",
                font: "inherit",
              }}
            />
          )}

          {saving && (
            <small
              style={{
                display: "block",
                marginTop: "3px",
                color: "#9a9284",
              }}
            >
              儲存中…
            </small>
          )}
        </td>
      );
    }

    return (
      <div
        style={{
          marginTop: "22px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong
              style={{
                display: "block",
                color: "#34423a",
                fontSize: "16px",
              }}
            >
              班級點心選擇
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "4px",
                fontSize: "12px",
                color: "#879088",
              }}
            >
              班級、學生與班級老師直接讀取系統；美語／班外生不在此設定。
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
          <label
            style={{
              display: "grid",
              gap: "5px",
              minWidth: "220px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                color: "#7b857e",
              }}
            >
              班級
            </span>

            <select
              value={
                selectedPreferenceClassId
              }
              onChange={(event) =>
                setSelectedPreferenceClassId(
                  event.target.value
                )
              }
              disabled={
                preferenceLoading ||
                preferenceClasses.length === 0
              }
              style={{
                height: "40px",
                padding: "0 12px",
                border:
                  "1px solid #d9ded8",
                borderRadius: "10px",
                background: "#fff",
                font: "inherit",
              }}
            >
              {preferenceClasses.map(
                (classItem) => (
                  <option
                    key={classItem.id}
                    value={classItem.id}
                  >
                    {classItem.class_name}
                  </option>
                )
              )}
            </select>
          </label>

          <button
            type="button"
            onClick={exportSnackPreferencePdf}
            disabled={
              exportingPreferencePdf ||
              preferenceLoading ||
              snackItemsLoading ||
              !selectedPreferenceClassId
            }
            style={{
              height: "40px",
              padding: "0 16px",
              border: "1px solid #cfd6cf",
              borderRadius: "10px",
              background: "#fff",
              color: "#435148",
              font: "inherit",
              fontWeight: 600,
              cursor: exportingPreferencePdf ? "wait" : "pointer",
              opacity: exportingPreferencePdf ? 0.65 : 1,
            }}
          >
            {exportingPreferencePdf ? "產出 PDF 中…" : "下載口味 PDF"}
          </button>
          </div>
        </div>

        {preferenceLoading ||
        snackItemsLoading ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              color: "#879088",
            }}
          >
            正在讀取班級與點心選擇…
          </div>
        ) : preferenceClasses.length === 0 ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              border:
                "1px dashed #d6ddd6",
              borderRadius: "14px",
              color: "#89918c",
              background: "#fafbf9",
            }}
          >
            目前沒有可用的安親班級
          </div>
        ) : activeItems.length === 0 ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              border:
                "1px dashed #d6ddd6",
              borderRadius: "14px",
              color: "#89918c",
              background: "#fafbf9",
            }}
          >
            這個學期尚未建立啟用中的點心品項，請先到「點心設定」新增。
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "10px",
                padding: "10px 12px",
                borderRadius: "10px",
                background: "#f5f7f3",
                color: "#657068",
                fontSize: "12px",
                flexWrap: "wrap",
              }}
            >
              <span>
                {selectedClass?.class_name ||
                  "班級"}
                {"｜"}
                {students.length} 位學生
                {teacherEnabled
                  ? `｜${teachers.length} 位老師`
                  : "｜老師點心：不要"}
              </span>

              <span>
                選擇後立即自動儲存
              </span>
            </div>

            {teacherEnabled &&
              teachers.length === 0 && (
                <div
                  style={{
                    padding:
                      "10px 12px",
                    borderRadius:
                      "10px",
                    background:
                      "#fff8e8",
                    color:
                      "#806b38",
                    fontSize:
                      "12px",
                  }}
                >
                  此班已設定「老師點心：要」，但尚未在班級管理設定班級老師。
                </div>
              )}

            <div
              style={{
                overflowX: "auto",
                border:
                  "1px solid #e1e5df",
                borderRadius: "14px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  minWidth:
                    `${180 + activeItems.length * 170}px`,
                  borderCollapse:
                    "separate",
                  borderSpacing: 0,
                  fontSize: "13px",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        width: "180px",
                        minWidth: "180px",
                        padding:
                          "11px 12px",
                        textAlign: "left",
                        background:
                          "#f4f6f2",
                        borderBottom:
                          "1px solid #e1e5df",
                        borderRight:
                          "1px solid #e1e5df",
                        color: "#34423a",
                      }}
                    >
                      姓名
                    </th>

                    {activeItems.map(
                      (item) => (
                        <th
                          key={item.id}
                          style={{
                            minWidth:
                              "170px",
                            padding:
                              "10px 8px",
                            textAlign:
                              "center",
                            background:
                              "#f8f9f6",
                            borderBottom:
                              "1px solid #e1e5df",
                            borderRight:
                              "1px solid #ecefeb",
                            color:
                              "#4f5c54",
                          }}
                        >
                          <div>
                            {item.name}
                          </div>
                          <small
                            style={{
                              display:
                                "block",
                              marginTop:
                                "3px",
                              color:
                                "#929992",
                              fontWeight:
                                400,
                            }}
                          >
                            {item.requires_option
                              ? "選擇口味"
                              : "填寫數量"}
                          </small>
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {teachers.map(
                    (teacher, index) => (
                      <tr
                        key={`teacher:${teacher.teacher_id}`}
                      >
                        <th
                          style={{
                            position:
                              "sticky",
                            left: 0,
                            zIndex: 1,
                            padding:
                              "10px 12px",
                            textAlign:
                              "left",
                            background:
                              "#fffaf0",
                            borderBottom:
                              "1px solid #ecefeb",
                            borderRight:
                              "1px solid #e1e5df",
                            color:
                              "#6f5b35",
                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {teacher.name}
                          <span
                            style={{
                              marginLeft:
                                "7px",
                              fontSize:
                                "11px",
                              color:
                                "#9a8154",
                            }}
                          >
                            老師
                          </span>
                        </th>

                        {activeItems.map(
                          (item) =>
                            renderChoiceCell({
                              personType:
                                "TEACHER",
                              personId:
                                teacher.teacher_id,
                              item,
                              rowIndex:
                                index,
                            })
                        )}
                      </tr>
                    )
                  )}

                  {students.length === 0 &&
                  teachers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          activeItems.length +
                          1
                        }
                        style={{
                          padding:
                            "32px 18px",
                          textAlign:
                            "center",
                          color:
                            "#929992",
                        }}
                      >
                        這個班級目前沒有可設定的人員
                      </td>
                    </tr>
                  ) : (
                    students.map(
                      (
                        student,
                        studentIndex
                      ) => (
                        <tr
                          key={
                            student.student_id
                          }
                        >
                          <th
                            style={{
                              position:
                                "sticky",
                              left: 0,
                              zIndex: 1,
                              padding:
                                "10px 12px",
                              textAlign:
                                "left",
                              background:
                                studentIndex %
                                  2 ===
                                0
                                  ? "#fff"
                                  : "#fbfcfa",
                              borderBottom:
                                "1px solid #ecefeb",
                              borderRight:
                                "1px solid #e1e5df",
                              color:
                                "#34423a",
                              whiteSpace:
                                "nowrap",
                            }}
                          >
                            {student.name}
                          </th>

                          {activeItems.map(
                            (item) =>
                              renderChoiceCell({
                                personType:
                                  "STUDENT",
                                personId:
                                  student.student_id,
                                item,
                                rowIndex:
                                  studentIndex,
                              })
                          )}
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: "10px",
                background: "#fff8e8",
                color: "#806b38",
                fontSize: "12px",
                lineHeight: 1.7,
              }}
            >
              老師只有在「月點心表」該班設定為「老師點心：要」時才會出現；老師口味會一起計入該班統計、全部班級總計與 PDF。
            </div>
          </>
        )}
      </div>
    );
  }

  function renderSnackSettings() {
    return (
      <div
        style={{
          marginTop: "22px",
          display: "grid",
          gap: "18px",
        }}
      >
        <section
          style={{
            padding: "18px",
            border:
              "1px solid #e1e5df",
            borderRadius: "14px",
            background: "#fafbf8",
            display: "grid",
            gap: "14px",
          }}
        >
          <div>
            <strong
              style={{
                display: "block",
                fontSize: "16px",
                color: "#34423a",
              }}
            >
              新增點心品項
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "4px",
                color: "#7d867f",
                fontSize: "12px",
              }}
            >
              本學期有哪些點心由這裡自行建立，不會寫死在系統裡。
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(180px, 1.2fr) minmax(180px, 1fr) auto auto",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={newSnackItemName}
              onChange={(event) =>
                setNewSnackItemName(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  event.preventDefault();
                  createSnackItem();
                }
              }}
              placeholder="點心名稱，例如：車輪餅"
              disabled={savingSnackSetting}
              style={{
                height: "40px",
                padding: "0 11px",
                border:
                  "1px solid #d9ded8",
                borderRadius: "9px",
                font: "inherit",
                background: "#fff",
              }}
            />

            <input
              type="text"
              value={newSnackItemNotes}
              onChange={(event) =>
                setNewSnackItemNotes(
                  event.target.value
                )
              }
              placeholder="備註（可留空）"
              disabled={savingSnackSetting}
              style={{
                height: "40px",
                padding: "0 11px",
                border:
                  "1px solid #d9ded8",
                borderRadius: "9px",
                font: "inherit",
                background: "#fff",
              }}
            />

            <label
              style={{
                height: "40px",
                padding: "0 12px",
                border:
                  "1px solid #d9ded8",
                borderRadius: "9px",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                whiteSpace: "nowrap",
                fontSize: "13px",
              }}
            >
              <input
                type="checkbox"
                checked={
                  newSnackItemRequiresOption
                }
                onChange={(event) =>
                  setNewSnackItemRequiresOption(
                    event.target.checked
                  )
                }
              />
              需要選口味
            </label>

            <button
              type="button"
              onClick={createSnackItem}
              disabled={
                savingSnackSetting ||
                !newSnackItemName.trim()
              }
              style={{
                height: "40px",
                padding: "0 16px",
                border: "none",
                borderRadius: "9px",
                background: "#88a993",
                color: "#fff",
                font: "inherit",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              新增品項
            </button>
          </div>
        </section>

        {snackItemsLoading ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              color: "#879088",
            }}
          >
            正在讀取點心設定…
          </div>
        ) : snackItems.length === 0 ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              border:
                "1px dashed #d6ddd6",
              borderRadius: "14px",
              color: "#89918c",
              background: "#fafbf9",
            }}
          >
            這個學期還沒有設定點心品項
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "14px",
            }}
          >
            {snackItems.map(
              (item, itemIndex) => (
                <article
                  key={item.id}
                  style={{
                    border:
                      "1px solid #e1e5df",
                    borderRadius: "14px",
                    background: item.is_active
                      ? "#fff"
                      : "#f7f7f4",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding:
                        "14px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent:
                        "space-between",
                      gap: "12px",
                      borderBottom:
                        item.requires_option
                          ? "1px solid #ecefeb"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          gap: "9px",
                          flexWrap: "wrap",
                        }}
                      >
                        <input
                          type="text"
                          defaultValue={
                            item.name
                          }
                          key={`${item.id}-${item.name}`}
                          onBlur={(event) => {
                            const name =
                              event.target.value.trim();

                            if (
                              name &&
                              name !==
                                item.name
                            ) {
                              updateSnackItem(
                                item.id,
                                { name }
                              );
                            } else {
                              event.target.value =
                                item.name;
                            }
                          }}
                          disabled={
                            savingSnackSetting
                          }
                          style={{
                            minWidth:
                              "180px",
                            maxWidth:
                              "360px",
                            height: "36px",
                            padding:
                              "0 9px",
                            border:
                              "1px solid #dddeda",
                            borderRadius:
                              "8px",
                            font: "inherit",
                            fontWeight:
                              700,
                            color:
                              "#34423a",
                            background:
                              "#fff",
                          }}
                        />

                        <span
                          style={{
                            padding:
                              "4px 8px",
                            borderRadius:
                              "999px",
                            background:
                              item.requires_option
                                ? "#edf4ef"
                                : "#f3f1ec",
                            color:
                              item.requires_option
                                ? "#587363"
                                : "#817b73",
                            fontSize:
                              "11px",
                          }}
                        >
                          {item.requires_option
                            ? "需要選口味"
                            : "固定品項"}
                        </span>

                        {!item.is_active && (
                          <span
                            style={{
                              padding:
                                "4px 8px",
                              borderRadius:
                                "999px",
                              background:
                                "#f4ece8",
                              color:
                                "#9a6555",
                              fontSize:
                                "11px",
                            }}
                          >
                            已停用
                          </span>
                        )}
                      </div>

                      <input
                        type="text"
                        defaultValue={
                          item.notes ||
                          ""
                        }
                        key={`${item.id}-${item.notes || "no-note"}`}
                        onBlur={(event) => {
                          const notes =
                            event.target.value.trim();

                          if (
                            notes !==
                            (
                              item.notes ||
                              ""
                            )
                          ) {
                            updateSnackItem(
                              item.id,
                              {
                                notes:
                                  notes ||
                                  null,
                              }
                            );
                          }
                        }}
                        placeholder="備註（可留空）"
                        disabled={
                          savingSnackSetting
                        }
                        style={{
                          marginTop:
                            "8px",
                          width:
                            "min(520px, 100%)",
                          height: "34px",
                          padding:
                            "0 9px",
                          border:
                            "1px solid #e3e4e0",
                          borderRadius:
                            "8px",
                          font: "inherit",
                          fontSize:
                            "12px",
                          color:
                            "#6f786f",
                          background:
                            "#fff",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        gap: "6px",
                        flexWrap: "wrap",
                        justifyContent:
                          "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          moveSnackItem(
                            item,
                            -1
                          )
                        }
                        disabled={
                          savingSnackSetting ||
                          itemIndex === 0
                        }
                        title="往上移"
                        style={{
                          width: "34px",
                          height: "34px",
                          border:
                            "1px solid #d9ded8",
                          borderRadius:
                            "8px",
                          background:
                            "#fff",
                          cursor:
                            "pointer",
                        }}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          moveSnackItem(
                            item,
                            1
                          )
                        }
                        disabled={
                          savingSnackSetting ||
                          itemIndex ===
                            snackItems.length -
                              1
                        }
                        title="往下移"
                        style={{
                          width: "34px",
                          height: "34px",
                          border:
                            "1px solid #d9ded8",
                          borderRadius:
                            "8px",
                          background:
                            "#fff",
                          cursor:
                            "pointer",
                        }}
                      >
                        ↓
                      </button>

                      <label
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          gap: "6px",
                          height: "34px",
                          padding:
                            "0 9px",
                          border:
                            "1px solid #d9ded8",
                          borderRadius:
                            "8px",
                          background:
                            "#fff",
                          fontSize:
                            "12px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            Boolean(
                              item.requires_option
                            )
                          }
                          onChange={(
                            event
                          ) =>
                            updateSnackItem(
                              item.id,
                              {
                                requires_option:
                                  event
                                    .target
                                    .checked,
                              }
                            )
                          }
                          disabled={
                            savingSnackSetting
                          }
                        />
                        口味
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          updateSnackItem(
                            item.id,
                            {
                              is_active:
                                !item.is_active,
                            }
                          )
                        }
                        disabled={
                          savingSnackSetting
                        }
                        style={{
                          height: "34px",
                          padding:
                            "0 11px",
                          border:
                            "1px solid #d9ded8",
                          borderRadius:
                            "8px",
                          background:
                            item.is_active
                              ? "#fff"
                              : "#edf4ef",
                          color:
                            item.is_active
                              ? "#8d6255"
                              : "#587363",
                          font: "inherit",
                          fontSize:
                            "12px",
                          cursor:
                            "pointer",
                        }}
                      >
                        {item.is_active
                          ? "停用"
                          : "啟用"}
                      </button>
                    </div>
                  </div>

                  {item.requires_option && (
                    <div
                      style={{
                        padding:
                          "14px 16px 16px",
                        display:
                          "grid",
                        gap: "10px",
                        background:
                          "#fcfcfa",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: "10px",
                          flexWrap:
                            "wrap",
                        }}
                      >
                        <strong
                          style={{
                            fontSize:
                              "13px",
                            color:
                              "#566159",
                          }}
                        >
                          可選口味
                        </strong>

                        <div
                          style={{
                            display:
                              "flex",
                            gap: "7px",
                            flex:
                              "1 1 320px",
                            justifyContent:
                              "flex-end",
                          }}
                        >
                          <input
                            type="text"
                            value={
                              newOptionNames[
                                item.id
                              ] || ""
                            }
                            onChange={(
                              event
                            ) =>
                              setNewOptionNames(
                                (
                                  current
                                ) => ({
                                  ...current,
                                  [item.id]:
                                    event
                                      .target
                                      .value,
                                })
                              )
                            }
                            onKeyDown={(
                              event
                            ) => {
                              if (
                                event.key ===
                                "Enter"
                              ) {
                                event.preventDefault();
                                addSnackOption(
                                  item
                                );
                              }
                            }}
                            placeholder="新增口味，例如：奶油"
                            disabled={
                              savingSnackSetting
                            }
                            style={{
                              width:
                                "min(300px, 100%)",
                              height:
                                "36px",
                              padding:
                                "0 9px",
                              border:
                                "1px solid #d9ded8",
                              borderRadius:
                                "8px",
                              font:
                                "inherit",
                            }}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              addSnackOption(
                                item
                              )
                            }
                            disabled={
                              savingSnackSetting ||
                              !(
                                newOptionNames[
                                  item.id
                                ] ||
                                ""
                              ).trim()
                            }
                            style={{
                              height:
                                "36px",
                              padding:
                                "0 12px",
                              border:
                                "none",
                              borderRadius:
                                "8px",
                              background:
                                "#88a993",
                              color:
                                "#fff",
                              font:
                                "inherit",
                              fontWeight:
                                700,
                              cursor:
                                "pointer",
                            }}
                          >
                            新增口味
                          </button>
                        </div>
                      </div>

                      {item.options.length ===
                      0 ? (
                        <div
                          style={{
                            padding:
                              "12px",
                            border:
                              "1px dashed #dedfdc",
                            borderRadius:
                              "9px",
                            color:
                              "#979d98",
                            fontSize:
                              "12px",
                            textAlign:
                              "center",
                          }}
                        >
                          尚未建立口味選項
                        </div>
                      ) : (
                        <div
                          style={{
                            display:
                              "grid",
                            gap: "7px",
                          }}
                        >
                          {item.options.map(
                            (
                              option,
                              optionIndex
                            ) => (
                              <div
                                key={
                                  option.id
                                }
                                style={{
                                  minHeight:
                                    "40px",
                                  padding:
                                    "6px 8px",
                                  border:
                                    "1px solid #e2e4e0",
                                  borderRadius:
                                    "9px",
                                  background:
                                    option.is_active
                                      ? "#fff"
                                      : "#f5f5f2",
                                  display:
                                    "flex",
                                  alignItems:
                                    "center",
                                  gap:
                                    "8px",
                                }}
                              >
                                <input
                                  type="text"
                                  defaultValue={
                                    option.name
                                  }
                                  key={`${option.id}-${option.name}`}
                                  onBlur={(
                                    event
                                  ) => {
                                    const name =
                                      event.target.value.trim();

                                    if (
                                      name &&
                                      name !==
                                        option.name
                                    ) {
                                      updateSnackOption(
                                        option.id,
                                        {
                                          name,
                                        }
                                      );
                                    } else {
                                      event.target.value =
                                        option.name;
                                    }
                                  }}
                                  disabled={
                                    savingSnackSetting
                                  }
                                  style={{
                                    flex:
                                      1,
                                    minWidth:
                                      0,
                                    height:
                                      "32px",
                                    padding:
                                      "0 8px",
                                    border:
                                      "1px solid #e1e2df",
                                    borderRadius:
                                      "7px",
                                    font:
                                      "inherit",
                                    background:
                                      "#fff",
                                  }}
                                />

                                <label
                                  style={{
                                    display:
                                      "flex",
                                    alignItems:
                                      "center",
                                    gap:
                                      "5px",
                                    fontSize:
                                      "11px",
                                    color:
                                      "#6f786f",
                                    whiteSpace:
                                      "nowrap",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Boolean(
                                      option.is_vegetarian_option
                                    )}
                                    onChange={(
                                      event
                                    ) =>
                                      updateSnackOption(
                                        option.id,
                                        {
                                          is_vegetarian_option:
                                            event
                                              .target
                                              .checked,
                                        }
                                      )
                                    }
                                    disabled={
                                      savingSnackSetting
                                    }
                                  />
                                  素食
                                </label>

                                <button
                                  type="button"
                                  onClick={() =>
                                    moveSnackOption(
                                      item,
                                      option,
                                      -1
                                    )
                                  }
                                  disabled={
                                    savingSnackSetting ||
                                    optionIndex ===
                                      0
                                  }
                                  style={{
                                    width:
                                      "30px",
                                    height:
                                      "30px",
                                    border:
                                      "1px solid #d9ded8",
                                    borderRadius:
                                      "7px",
                                    background:
                                      "#fff",
                                    cursor:
                                      "pointer",
                                  }}
                                >
                                  ↑
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    moveSnackOption(
                                      item,
                                      option,
                                      1
                                    )
                                  }
                                  disabled={
                                    savingSnackSetting ||
                                    optionIndex ===
                                      item.options
                                        .length -
                                        1
                                  }
                                  style={{
                                    width:
                                      "30px",
                                    height:
                                      "30px",
                                    border:
                                      "1px solid #d9ded8",
                                    borderRadius:
                                      "7px",
                                    background:
                                      "#fff",
                                    cursor:
                                      "pointer",
                                  }}
                                >
                                  ↓
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSnackOption(
                                      option.id,
                                      {
                                        is_active:
                                          !option.is_active,
                                      }
                                    )
                                  }
                                  disabled={
                                    savingSnackSetting
                                  }
                                  style={{
                                    minWidth:
                                      "54px",
                                    height:
                                      "30px",
                                    padding:
                                      "0 8px",
                                    border:
                                      "1px solid #d9ded8",
                                    borderRadius:
                                      "7px",
                                    background:
                                      option.is_active
                                        ? "#fff"
                                        : "#edf4ef",
                                    color:
                                      option.is_active
                                        ? "#8d6255"
                                        : "#587363",
                                    font:
                                      "inherit",
                                    fontSize:
                                      "11px",
                                    cursor:
                                      "pointer",
                                  }}
                                >
                                  {option.is_active
                                    ? "停用"
                                    : "啟用"}
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  function renderMonthlyTable() {
    return (
      <div
        style={{
          marginTop: "22px",
          display: "grid",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong
              style={{
                display: "block",
                color: "#34423a",
              }}
            >
              {formatMonthLabel(selectedMonth)}
            </strong>

            <span
              style={{
                display: "block",
                marginTop: "4px",
                fontSize: "12px",
                color: "#879088",
              }}
            >
              基準人數已同步班級點名邏輯；老師可在左側設定整學期
              「要／不要」。點擊任一日期數字，可處理臨時不吃、原因與數量調整。
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(event.target.value)
              }
              style={{
                height: "38px",
                padding: "0 12px",
                border: "1px solid #d9ded8",
                borderRadius: "10px",
                background: "#fff",
                font: "inherit",
              }}
            >
              {availableMonths.map((monthValue) => (
                <option
                  key={monthValue}
                  value={monthValue}
                >
                  {formatMonthLabel(monthValue)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={exportMonthlySnackPdf}
              disabled={
                monthlyLoading ||
                classRows.length === 0
              }
              style={{
                height: "38px",
                padding: "0 14px",
                border: "1px solid #cfd7d0",
                borderRadius: "10px",
                background: "#fff",
                color: "#445149",
                font: "inherit",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              下載 PDF
            </button>
          </div>
        </div>

        {monthlyLoading ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              color: "#879088",
            }}
          >
            正在讀取班級點心基準人數…
          </div>
        ) : classRows.length === 0 ? (
          <div
            style={{
              padding: "44px 20px",
              textAlign: "center",
              border: "1px dashed #d6ddd6",
              borderRadius: "14px",
              color: "#89918c",
              background: "#fafbf9",
            }}
          >
            這個月份沒有安親班級資料
          </div>
        ) : (
          <div
            style={{
              overflowX: "hidden",
              width: "100%",
              border: "1px solid #e1e5df",
              borderRadius: "14px",
            }}
          >
            <table
              style={{
                width: "100%",
                tableLayout: "fixed",
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      width: "58px",
                      padding: "10px 4px",
                      textAlign: "left",
                      background: "#f4f6f2",
                      borderBottom:
                        "1px solid #e1e5df",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    班級
                  </th>

                  <th
                    style={{
                      width: "70px",
                      padding: "8px 3px",
                      textAlign: "center",
                      background: "#f4f6f2",
                      borderBottom:
                        "1px solid #e1e5df",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    老師點心
                  </th>

                  {monthDays.map((day) => {
                    const closed = closedDateMap.get(
                      day.dateString
                    );

                    return (
                      <th
                        key={day.dateString}
                        title={
                          closed?.title ||
                          day.dateString
                        }
                        style={{
                          width: "auto",
                          padding: "7px 1px",
                          textAlign: "center",
                          background: closed
                            ? "#f1f1ee"
                            : "#f8f9f6",
                          color: closed
                            ? "#a0a49f"
                            : "#566159",
                          borderBottom:
                            "1px solid #e1e5df",
                          borderRight:
                            "1px solid #ecefeb",
                        }}
                      >
                        <div>{day.day}</div>
                        <div
                          style={{
                            marginTop: "2px",
                            fontSize: "10px",
                            fontWeight: 400,
                          }}
                        >
                          {
                            [
                              "日",
                              "一",
                              "二",
                              "三",
                              "四",
                              "五",
                              "六",
                            ][day.weekday]
                          }
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {classRows.map((classItem) => (
                  <tr key={classItem.id}>
                    <th
                      style={{
                        width: "58px",
                        padding: "10px 4px",
                        textAlign: "left",
                        background: "#fff",
                        color: "#34423a",
                        borderBottom:
                          "1px solid #ecefeb",
                        borderRight:
                          "1px solid #e1e5df",
                      }}
                    >
                      {classItem.class_name}
                    </th>

                    <td
                      style={{
                        padding: "6px",
                        textAlign: "center",
                        background: "#fffdf9",
                        borderBottom:
                          "1px solid #ecefeb",
                        borderRight:
                          "1px solid #e1e5df",
                      }}
                    >
                      <select
                        value={
                          getClassTeacherEatsSnack(
                            classItem.id
                          )
                            ? "YES"
                            : "NO"
                        }
                        onChange={(event) =>
                          saveTeacherSetting(
                            classItem.id,
                            event.target.value ===
                              "YES"
                          )
                        }
                        disabled={savingCell}
                        style={{
                          width: "60px",
                          height: "30px",
                          border:
                            "1px solid #d9ded8",
                          borderRadius:
                            "8px",
                          background: "#fff",
                          font: "inherit",
                        }}
                      >
                        <option value="YES">
                          要
                        </option>
                        <option value="NO">
                          不要
                        </option>
                      </select>
                    </td>

                    {classItem.counts.map((cell) => {
                      const closed =
                        closedDateMap.get(
                          cell.dateString
                        );

                      return (
                        <td
                          key={cell.dateString}
                          title={
                            closed
                              ? `${closed.title}｜不需點心`
                              : `${classItem.class_name}｜${cell.dateString}｜點擊調整`
                          }
                          onClick={() => {
                            if (!closed) {
                              openDailyCell(
                                classItem,
                                cell.dateString
                              );
                            }
                          }}
                          style={{
                            height: "44px",
                            padding: "4px 1px",
                            textAlign: "center",
                            fontWeight: 700,
                            background: closed
                              ? "#f4f4f1"
                              : "#fff",
                            color: closed
                              ? "#a8aca7"
                              : "#37443c",
                            borderBottom:
                              "1px solid #ecefeb",
                            borderRight:
                              "1px solid #ecefeb",
                            cursor: closed
                              ? "default"
                              : "pointer",
                            position: "relative",
                          }}
                        >
                          {closed ? (
                            "休"
                          ) : (
                            <>
                              <div>
                                {cell.count}
                              </div>
                              {(
                                cell.breakdown
                                  ?.excludedCount >
                                  0 ||
                                cell.breakdown
                                  ?.adjustment !==
                                  0
                              ) && (
                                <small
                                  style={{
                                    display:
                                      "block",
                                    marginTop:
                                      "2px",
                                    fontSize:
                                      "9px",
                                    fontWeight:
                                      500,
                                    color:
                                      "#9a765e",
                                  }}
                                >
                                  已調整
                                </small>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                <tr>
                  <th
                    colSpan={2}
                    style={{
                      width: "128px",
                      padding: "10px 8px",
                      textAlign: "left",
                      background: "#fffaf2",
                      color: "#6f5a43",
                      borderBottom: "1px solid #ecefeb",
                      borderRight: "1px solid #e1e5df",
                    }}
                  >
                    美語／班外生
                  </th>

                  {monthDays.map((day) => {
                    const closed = closedDateMap.get(day.dateString);
                    const count = getExternalOrderCount(day.dateString);
                    return (
                      <td
                        key={day.dateString}
                        title={closed ? `${closed.title}｜不需點心` : `美語／班外生｜${day.dateString}｜點擊管理訂餐名單`}
                        onClick={() => { if (!closed) openExternalOrders(day.dateString); }}
                        style={{
                          height: "44px",
                          padding: "4px 1px",
                          textAlign: "center",
                          fontWeight: 800,
                          background: closed ? "#f4f4f1" : "#fffaf2",
                          color: closed ? "#a8aca7" : count > 0 ? "#725b42" : "#a59a8d",
                          borderBottom: "1px solid #ecefeb",
                          borderRight: "1px solid #ecefeb",
                          cursor: closed ? "default" : "pointer",
                        }}
                      >
                        {closed ? "休" : count}
                      </td>
                    );
                  })}
                </tr>

                <tr>
                  <th
                    style={{
                      width: "58px",
                      padding: "10px 4px",
                      textAlign: "left",
                      background: "#f4f6f2",
                      color: "#34423a",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    當日總計
                  </th>

                  <td
                    style={{
                      padding: "8px 2px",
                      textAlign: "center",
                      fontWeight: 700,
                      background: "#f4f6f2",
                      color: "#6f786f",
                      borderRight:
                        "1px solid #e1e5df",
                    }}
                  >
                    —
                  </td>

                  {dailyTotals.map((total, index) => (
                    <td
                      key={
                        monthDays[index]?.dateString ||
                        index
                      }
                      style={{
                        padding: "8px 2px",
                        textAlign: "center",
                        fontWeight: 800,
                        background:
                          total === null
                            ? "#f1f1ee"
                            : "#f4f6f2",
                        color:
                          total === null
                            ? "#a8aca7"
                            : "#34423a",
                        borderRight:
                          "1px solid #e1e5df",
                      }}
                    >
                      {total === null ? "—" : total}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            padding: "11px 13px",
            borderRadius: "10px",
            background: "#fff8e8",
            color: "#806b38",
            fontSize: "12px",
            lineHeight: 1.7,
          }}
        >
          這一版已把特殊接送 ABSENT 正式接入。
          「社團後進班／晚到」與「家長自行送」仍會保留在點心基準人數，
          與班級點名表邏輯一致。
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        padding: "26px",
        display: "grid",
        gap: "22px",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.16em",
              color: "#8b928d",
            }}
          >
            SNACK MANAGEMENT
          </p>

          <h1
            style={{
              margin: "5px 0 0",
              fontSize: "28px",
              color: "#29332d",
            }}
          >
            點心管理
          </h1>
        </div>

        <label
          style={{
            display: "grid",
            gap: "5px",
            minWidth: "250px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "#7b857e",
            }}
          >
            學期
          </span>

          <select
            value={selectedSemesterId}
            onChange={(event) =>
              setSelectedSemesterId(
                event.target.value
              )
            }
            disabled={loading}
            style={{
              height: "40px",
              padding: "0 12px",
              border: "1px solid #d9ded8",
              borderRadius: "10px",
              background: "#fff",
              font: "inherit",
            }}
          >
            {semesters.map((semester) => (
              <option
                key={semester.id}
                value={semester.id}
              >
                {semester.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {errorMessage && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "10px",
            background: "#fff1ef",
            color: "#9b493f",
          }}
        >
          {errorMessage}
        </div>
      )}

      {selectedSemester && (
        <section
          style={{
            padding: "14px 18px",
            border: "1px solid #e0e4de",
            borderRadius: "14px",
            background: "#fafbf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            flexWrap: "wrap",
          }}
        >
          <strong>{selectedSemester.name}</strong>

          <span
            style={{
              fontSize: "13px",
              color: "#778078",
            }}
          >
            {formatDate(selectedSemester.start_date)}
            {" － "}
            {formatDate(selectedSemester.end_date)}
          </span>
        </section>
      )}

      <nav
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          padding: "6px",
          borderRadius: "14px",
          background: "#eef0eb",
        }}
      >
        {visibleTabs.map((tab) => {
          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: "1 1 180px",
                minHeight: "44px",
                border: "none",
                borderRadius: "10px",
                background: active
                  ? "#fff"
                  : "transparent",
                boxShadow: active
                  ? "0 2px 10px rgba(40,50,44,.08)"
                  : "none",
                cursor: "pointer",
                font: "inherit",
                fontWeight: active ? 700 : 500,
                color: active
                  ? "#34423a"
                  : "#768078",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section
        style={{
          minHeight: "420px",
          padding: "24px",
          border: "1px solid #e1e5df",
          borderRadius: "16px",
          background: "#fff",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            color: "#8c958f",
            letterSpacing: "0.12em",
          }}
        >
          {activeTabItem?.label}
        </p>

        <h2
          style={{
            margin: "6px 0 8px",
            fontSize: "20px",
          }}
        >
          {activeTabItem?.label}
        </h2>

        <p
          style={{
            margin: 0,
            color: "#778078",
          }}
        >
          {activeTabItem?.description}
        </p>

        {activeTab === "MONTHLY" ? (
          renderMonthlyTable()
        ) : activeTab === "PREFERENCES" ? (
          renderSnackPreferences()
        ) : activeTab === "SUMMARY" ? (
          renderSnackSummary()
        ) : activeTab === "SETTINGS" ? (
          renderSnackSettings()
        ) : (
          <div
            style={{
              marginTop: "40px",
              padding: "36px 20px",
              textAlign: "center",
              border: "1px dashed #d6ddd6",
              borderRadius: "14px",
              color: "#89918c",
              background: "#fafbf9",
            }}
          >
            這個區塊下一步開始製作
          </div>
        )}
      </section>

      {selectedExternalDate && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingExternalOrders) {
              setSelectedExternalDate(null);
            }
          }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(30,35,32,.28)",
            display: "flex", justifyContent: "flex-end",
          }}
        >
          <aside
            style={{
              width: "min(480px, 92vw)", height: "100%",
              background: "#fffdf9",
              boxShadow: "-12px 0 32px rgba(30,35,32,.12)",
              display: "flex", flexDirection: "column",
            }}
          >
            <header
              style={{
                padding: "22px 24px", borderBottom: "1px solid #e7e2d9",
                display: "flex", justifyContent: "space-between", gap: "16px",
                alignItems: "flex-start",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: "11px", letterSpacing: ".14em", color: "#9a9388" }}>SPECIAL SNACK</p>
                <h2 style={{ margin: "6px 0 2px", fontSize: "22px" }}>美語／班外生｜{selectedExternalDate}</h2>
                <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#7d766d" }}>有需要才新增姓名；姓名筆數就是當日點心份數。</p>
              </div>
              <button type="button" onClick={() => setSelectedExternalDate(null)} disabled={savingExternalOrders}
                style={{ border: "none", background: "#f1eee8", width: "38px", height: "38px", borderRadius: "50%", cursor: "pointer", fontSize: "22px" }}>×</button>
            </header>

            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "grid", gap: "18px" }}>
              <section>
                <h3 style={{ margin: "0 0 10px", fontSize: "16px" }}>當日訂餐名單</h3>
                <div style={{ display: "grid", gap: "8px" }}>
                  {getExternalOrdersForDate(selectedExternalDate).length === 0 ? (
                    <div style={{ padding: "16px", border: "1px dashed #ddd7ce", borderRadius: "10px", color: "#9a9388", background: "#faf8f4", textAlign: "center", fontSize: "13px" }}>今天尚未新增訂餐人員</div>
                  ) : (
                    getExternalOrdersForDate(selectedExternalDate).map((item) => (
                      <div key={item.id} style={{ minHeight: "42px", padding: "8px 10px 8px 12px", border: "1px solid #e4dfd6", borderRadius: "10px", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <strong>{item.person_name}</strong>
                        <button type="button" onClick={() => deleteExternalOrder(item.id)} disabled={savingExternalOrders}
                          style={{ border: "none", background: "#f3eee8", width: "30px", height: "30px", borderRadius: "8px", cursor: "pointer", color: "#8d685b", fontSize: "18px" }}>×</button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h3 style={{ margin: "0 0 10px", fontSize: "16px" }}>新增訂餐人員</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="text" value={externalNameInput} onChange={(e) => setExternalNameInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExternalOrder(); } }}
                    placeholder="輸入姓名" disabled={savingExternalOrders}
                    style={{ flex: 1, height: "40px", padding: "0 11px", border: "1px solid #ddd8cf", borderRadius: "9px", font: "inherit" }} />
                  <button type="button" onClick={addExternalOrder} disabled={savingExternalOrders || !externalNameInput.trim()}
                    style={{ minWidth: "74px", height: "40px", border: "none", borderRadius: "9px", background: "#88a993", color: "#fff", font: "inherit", fontWeight: 700, cursor: "pointer" }}>新增</button>
                </div>
              </section>

              <section style={{ padding: "14px 16px", borderRadius: "12px", background: "#f4f6f2", fontSize: "13px" }}>
                今日共 <strong style={{ margin: "0 5px", fontSize: "20px" }}>{getExternalOrderCount(selectedExternalDate)}</strong> 份
              </section>
            </div>

            <footer style={{ padding: "16px 24px", borderTop: "1px solid #e7e2d9", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setSelectedExternalDate(null)} disabled={savingExternalOrders}
                style={{ minWidth: "92px", height: "40px", border: "1px solid #d9d4cb", borderRadius: "10px", background: "#fff", font: "inherit", cursor: "pointer" }}>完成</button>
            </footer>
          </aside>
        </div>
      )}

      {selectedCell && (
        <div
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget &&
              !savingCell
            ) {
              setSelectedCell(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background:
              "rgba(30,35,32,.28)",
            display: "flex",
            justifyContent:
              "flex-end",
          }}
        >
          <aside
            style={{
              width: "min(520px, 92vw)",
              height: "100%",
              background: "#fffdf9",
              boxShadow:
                "-12px 0 32px rgba(30,35,32,.12)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <header
              style={{
                padding: "22px 24px",
                borderBottom:
                  "1px solid #e7e2d9",
                display: "flex",
                justifyContent:
                  "space-between",
                gap: "16px",
                alignItems: "flex-start",
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "11px",
                    letterSpacing:
                      ".14em",
                    color: "#9a9388",
                  }}
                >
                  DAILY SNACK
                </p>

                <h2
                  style={{
                    margin: "6px 0 2px",
                    fontSize: "22px",
                  }}
                >
                  {
                    selectedCell
                      .classItem
                      .class_name
                  }
                  {"｜"}
                  {
                    selectedCell
                      .dateString
                  }
                </h2>

                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    fontSize: "12px",
                    color: "#777168",
                  }}
                >
                  <span>
                    班級基準：
                    {
                      getClassBaseCount(
                        selectedCell
                          .classItem.id,
                        selectedCell
                          .dateString
                      )
                    }
                  </span>

                  <span>
                    老師：
                    {
                      getClassTeacherEatsSnack(
                        selectedCell
                          .classItem.id
                      )
                        ? "+1"
                        : "+0"
                    }
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedCell(null)
                }
                disabled={savingCell}
                style={{
                  border: "none",
                  background: "#f1eee8",
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: "22px",
                }}
              >
                ×
              </button>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 24px",
                display: "grid",
                gap: "22px",
              }}
            >
              <section>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontSize: "16px",
                  }}
                >
                  臨時不吃／請假
                </h3>

                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: "12px",
                    color: "#817b72",
                  }}
                >
                  ABSENT 已由班級點名基準排除，這裡只處理另外的臨時狀況。
                </p>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {selectedCell.studentsForDay.map(
                    (student) => {
                      const checked =
                        selectedCell
                          .excludedStudentIds
                          .includes(
                            student.student_id
                          );

                      return (
                        <div
                          key={
                            student.student_id
                          }
                          style={{
                            padding:
                              "10px 12px",
                            border:
                              "1px solid #e4dfd6",
                            borderRadius:
                              "10px",
                            background:
                              checked
                                ? "#fbf2ec"
                                : "#fff",
                            display: "grid",
                            gap: "8px",
                          }}
                        >
                          <label
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              gap: "8px",
                              cursor:
                                "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={
                                checked
                              }
                              onChange={(
                                event
                              ) => {
                                const nextChecked =
                                  event
                                    .target
                                    .checked;

                                setSelectedCell(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    excludedStudentIds:
                                      nextChecked
                                        ? [
                                            ...current
                                              .excludedStudentIds,
                                            student
                                              .student_id,
                                          ]
                                        : current
                                            .excludedStudentIds
                                            .filter(
                                              (
                                                id
                                              ) =>
                                                id !==
                                                student
                                                  .student_id
                                            ),
                                  })
                                );
                              }}
                            />

                            <strong>
                              {
                                student.name
                              }
                            </strong>

                            {checked && (
                              <span
                                style={{
                                  marginLeft:
                                    "auto",
                                  fontSize:
                                    "11px",
                                  color:
                                    "#9a6658",
                                }}
                              >
                                不計點心
                              </span>
                            )}
                          </label>

                          {checked && (
                            <input
                              type="text"
                              value={
                                selectedCell
                                  .studentReasons[
                                  student
                                    .student_id
                                ] || ""
                              }
                              onChange={(
                                event
                              ) =>
                                setSelectedCell(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    studentReasons:
                                      {
                                        ...current.studentReasons,
                                        [student.student_id]:
                                          event
                                            .target
                                            .value,
                                      },
                                  })
                                )
                              }
                              placeholder="原因，例如：臨時請假、家長交代不吃"
                              style={{
                                height:
                                  "36px",
                                padding:
                                  "0 10px",
                                border:
                                  "1px solid #ddd8cf",
                                borderRadius:
                                  "8px",
                                font:
                                  "inherit",
                              }}
                            />
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </section>

              <section>
                <h3
                  style={{
                    margin: "0 0 10px",
                    fontSize: "16px",
                  }}
                >
                  手動數量調整
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "120px 1fr",
                    gap: "10px",
                    alignItems: "center",
                  }}
                >
                  <label>
                    增減數量
                  </label>

                  <input
                    type="number"
                    value={
                      selectedCell
                        .adjustment
                    }
                    onChange={(event) =>
                      setSelectedCell(
                        (current) => ({
                          ...current,
                          adjustment:
                            Number(
                              event
                                .target
                                .value
                            ),
                        })
                      )
                    }
                    style={{
                      height: "38px",
                      padding: "0 10px",
                      border:
                        "1px solid #ddd8cf",
                      borderRadius:
                        "8px",
                      font: "inherit",
                    }}
                  />

                  <label>
                    備註
                  </label>

                  <input
                    type="text"
                    value={
                      selectedCell
                        .adjustmentNote
                    }
                    onChange={(event) =>
                      setSelectedCell(
                        (current) => ({
                          ...current,
                          adjustmentNote:
                            event.target
                              .value,
                        })
                      )
                    }
                    placeholder="例如：臨時多一位、老師外出"
                    style={{
                      height: "38px",
                      padding: "0 10px",
                      border:
                        "1px solid #ddd8cf",
                      borderRadius:
                        "8px",
                      font: "inherit",
                    }}
                  />
                </div>
              </section>

              <section
                style={{
                  padding: "14px 16px",
                  borderRadius: "12px",
                  background: "#f4f6f2",
                  display: "grid",
                  gap: "6px",
                  fontSize: "13px",
                }}
              >
                <div>
                  預估實際份數：
                  <strong
                    style={{
                      marginLeft: "6px",
                      fontSize: "18px",
                    }}
                  >
                    {
                      getClassBaseCount(
                        selectedCell
                          .classItem.id,
                        selectedCell
                          .dateString
                      ) +
                      (
                        getClassTeacherEatsSnack(
                          selectedCell
                            .classItem.id
                        )
                          ? 1
                          : 0
                      ) -
                      selectedCell
                        .excludedStudentIds
                        .length +
                      Number(
                        selectedCell
                          .adjustment ||
                          0
                      )
                    }
                  </strong>
                </div>
              </section>
            </div>

            <footer
              style={{
                padding: "16px 24px",
                borderTop:
                  "1px solid #e7e2d9",
                display: "flex",
                justifyContent:
                  "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setSelectedCell(null)
                }
                disabled={savingCell}
                style={{
                  minWidth: "88px",
                  height: "40px",
                  border:
                    "1px solid #d9d4cb",
                  borderRadius:
                    "10px",
                  background: "#fff",
                  font: "inherit",
                  cursor: "pointer",
                }}
              >
                取消
              </button>

              <button
                type="button"
                onClick={
                  saveDailyCell
                }
                disabled={savingCell}
                style={{
                  minWidth: "110px",
                  height: "40px",
                  border: "none",
                  borderRadius:
                    "10px",
                  background: "#88a993",
                  color: "#fff",
                  font: "inherit",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {savingCell
                  ? "儲存中…"
                  : "儲存調整"}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </main>
  );
}

export default SnackManagementPage;