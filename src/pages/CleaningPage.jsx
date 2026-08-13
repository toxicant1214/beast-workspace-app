import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  generateCleaningSemester,
  getCleaningSemesters,
  getCleaningSemesterStatus,
  getCleaningMonth,
  getCleaningTasksForDate,
  reassignCleaningTask,
  saveCleaningTeacherSetting,
  setCleaningTaskDone,
} from "../services/cleaningService";
import "./CleaningPage.css";

const EMPTY_ITEM_FORM = {
  name: "",
  description: "",
  is_active: true,
};

const EMPTY_RULE_FORM = {
  cleaning_item_id: "",
  assignment_scope: "PUBLIC",
  rule_type: "ROTATION",
  frequency_type: "DAILY",
  weekdays: [],
  month_day: "",
  monthly_mode: "FIRST_WORKDAY",
  fixed_teacher_id: "",
  member_ids: [],
  note: "",
  is_active: true,
};

const WEEKDAYS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

const SCOPE_OPTIONS = [
  {
    value: "PUBLIC",
    label: "公共輪值",
    description: "公共區域工作，依公平負擔自動輪值。",
  },
  {
    value: "OWN_AREA",
    label: "自己區域",
    description: "老師固定負責自己的教室／區域。",
  },
  {
    value: "FIXED_TASK",
    label: "固定專責",
    description: "固定由指定老師負責的工作。",
  },
];

function getTeacherName(teacher) {
  return (
    teacher?.chinese_name ||
    teacher?.english_name ||
    teacher?.name ||
    teacher?.teacher_name ||
    "未命名老師"
  );
}

function getDateParts(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function formatDate(dateString) {
  if (!dateString) return "";
  const [, month, day] = dateString.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function getWeekdayLabel(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return ["日", "一", "二", "三", "四", "五", "六"][weekday];
}

function getFrequencyLabel(rule) {
  if (rule.frequency_type === "DAILY") {
    return "每日";
  }

  if (rule.frequency_type === "WEEKLY") {
    const values =
      Array.isArray(rule.weekdays) && rule.weekdays.length > 0
        ? rule.weekdays.map(Number)
        : rule.weekday !== null && rule.weekday !== undefined
          ? [Number(rule.weekday)]
          : [];

    const labels = WEEKDAYS
      .filter((item) => values.includes(item.value))
      .map((item) => `週${item.label}`);

    return labels.length > 0 ? labels.join("、") : "每週";
  }

  if (rule.frequency_type === "MONTHLY") {
    if (rule.monthly_mode === "FIRST_WORKDAY") {
      return "每月第一個工作日";
    }

    if (rule.monthly_mode === "LAST_WORKDAY") {
      return "每月最後一個工作日";
    }

    if (rule.monthly_mode === "FIXED_DATE") {
      return `每月 ${rule.month_day || "—"} 日`;
    }

    return "每月";
  }

  return "未設定";
}

function getScopeLabel(scope) {
  return (
    SCOPE_OPTIONS.find((option) => option.value === scope)?.label ||
    "公共輪值"
  );
}


const MAX_VISIBLE_TASKS_PER_DAY = 3;

function getTodayDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(now.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function getCalendarCells(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const mondayFirstOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayFirstOffset + lastDay.getDate()) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const dayOffset = index - mondayFirstOffset + 1;
    const date = new Date(year, month - 1, dayOffset);
    const dateString = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");

    return {
      dateString,
      day: date.getDate(),
      weekday: date.getDay(),
      isCurrentMonth: date.getMonth() === month - 1,
    };
  });
}

function getOverrideLabel(override) {
  if (!override) return "";

  return (
    override.title ||
    (override.override_type === "SPECIAL_WORKDAY"
      ? "特殊上班"
      : override.override_type === "HOLIDAY"
        ? "休假"
        : override.override_type === "CLASSROOM_CLOSED"
          ? "教室休假"
          : "")
  );
}

function CleaningPage() {
  const [activeTab, setActiveTab] = useState("MONTH");
  const [items, setItems] = useState([]);
  const [rules, setRules] = useState([]);
  const [ruleMembers, setRuleMembers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherSettings, setTeacherSettings] = useState([]);

  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);

  const [editingItem, setEditingItem] = useState(null);
  const [editingRule, setEditingRule] = useState(null);

  const initialDate = getDateParts();
  const [selectedYear, setSelectedYear] = useState(initialDate.year);
const [selectedMonth, setSelectedMonth] = useState(initialDate.month);

const [semesters, setSemesters] = useState([]);
const [selectedSemesterId, setSelectedSemesterId] = useState("");

const [semesterStatus, setSemesterStatus] = useState({
  generated: false,
  taskCount: 0,
});

const [monthTasks, setMonthTasks] = useState([]);
  const [monthSummary, setMonthSummary] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [generatingSemester, setGeneratingSemester] = useState(false);
  const [savingTeacherSettingId, setSavingTeacherSettingId] = useState("");
  const [reassigningTaskId, setReassigningTaskId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [calendarViewMode, setCalendarViewMode] = useState("ALL");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [currentTeacherId, setCurrentTeacherId] = useState("");
  const [monthOverrides, setMonthOverrides] = useState([]);
  const [expandedDate, setExpandedDate] = useState("");

  useEffect(() => {
  loadData();
  loadSemesters();
}, []);

  useEffect(() => {
    loadMonth();
  }, [selectedYear, selectedMonth, teachers]);

  useEffect(() => {
    if (activeTab === "TODAY") {
      loadToday();
    }
  }, [activeTab]);

  useEffect(() => {
  if (!selectedSemesterId) {
    return;
  }

  const semester =
    semesters.find(
      (item) =>
        item.id ===
        selectedSemesterId
    );

  if (!semester) {
    return;
  }

  refreshSemesterStatus(
    selectedSemesterId
  );

  const currentMonthKey =
    `${selectedYear}-${String(
      selectedMonth
    ).padStart(2, "0")}`;

  const startMonthKey =
    semester.start_date.slice(
      0,
      7
    );

  const endMonthKey =
    semester.end_date.slice(
      0,
      7
    );

  if (
    currentMonthKey <
      startMonthKey ||
    currentMonthKey >
      endMonthKey
  ) {
    const today =
      getTodayDateString();

    const targetDate =
      today >=
        semester.start_date &&
      today <=
        semester.end_date
        ? today
        : semester.start_date;

    const [
      year,
      month,
    ] =
      targetDate
        .split("-")
        .map(Number);

    setSelectedYear(year);
    setSelectedMonth(month);
  }
}, [
  selectedSemesterId,
  semesters,
]);

  async function loadSemesters() {
  try {
    const rows = await getCleaningSemesters();

    setSemesters(rows);

    if (rows.length === 0) {
      setSelectedSemesterId("");
      return;
    }

    const today = getTodayDateString();

    const currentSemester =
      rows.find(
        (semester) =>
          today >= semester.start_date &&
          today <= semester.end_date
      ) ||
      rows.find(
        (semester) =>
          semester.start_date > today
      ) ||
      rows[0];

    setSelectedSemesterId(
      currentSemester.id
    );
  } catch (error) {
    console.error(
      "讀取學期資料失敗：",
      error
    );

    setErrorMessage(
      `讀取學期資料失敗：${error.message}`
    );
  }
}


async function refreshSemesterStatus(
  semesterId
) {
  if (!semesterId) {
    setSemesterStatus({
      generated: false,
      taskCount: 0,
    });

    return;
  }

  try {
    const status =
      await getCleaningSemesterStatus(
        semesterId
      );

    setSemesterStatus(status);
  } catch (error) {
    console.error(
      "讀取學期清潔狀態失敗：",
      error
    );
  }
}

  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        itemsResult,
        rulesResult,
        membersResult,
        teachersResult,
        settingsResult,
      ] = await Promise.all([
        supabase
          .from("cleaning_items")
          .select("*")
          .order("is_active", { ascending: false })
          .order("name", { ascending: true }),
        supabase
          .from("cleaning_rules")
          .select("*")
          .order("is_active", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase
          .from("cleaning_rule_members")
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase.from("teachers").select("*"),
        supabase.from("cleaning_teacher_settings").select("*"),
      ]);

      if (itemsResult.error) throw itemsResult.error;
      if (rulesResult.error) throw rulesResult.error;
      if (membersResult.error) throw membersResult.error;
      if (teachersResult.error) throw teachersResult.error;
      if (settingsResult.error) throw settingsResult.error;

      setItems(itemsResult.data || []);
      setRules(rulesResult.data || []);
      setRuleMembers(membersResult.data || []);
      setTeacherSettings(settingsResult.data || []);

      const teacherRows = (teachersResult.data || []).filter((teacher) => {
        if (teacher.is_active === false) return false;

        const status = String(
          teacher.status ||
            teacher.teacher_status ||
            teacher.employment_status ||
            ""
        ).toUpperCase();

        return !["INACTIVE", "RESIGNED", "LEFT"].includes(status);
      });

      setTeachers(
        teacherRows.sort((a, b) =>
          getTeacherName(a).localeCompare(getTeacherName(b), "zh-Hant")
        )
      );


      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user || null;

      if (authUser) {
        const matchedTeacher = teacherRows.find((teacher) =>
          [
            teacher.auth_user_id,
            teacher.user_id,
            teacher.profile_id,
          ].filter(Boolean).includes(authUser.id) ||
          (teacher.email &&
            authUser.email &&
            teacher.email.toLowerCase() === authUser.email.toLowerCase())
        );

        setCurrentTeacherId(matchedTeacher?.id || "");
      }
    } catch (error) {
      console.error("讀取清潔資料失敗：", error);
      setErrorMessage(`讀取清潔資料失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadMonth() {
    try {
      setLoadingMonth(true);
      setErrorMessage("");

      const tasks = await getCleaningMonth(
        selectedYear,
        selectedMonth
      );

      setMonthTasks(tasks || []);

      const start = `${selectedYear}-${String(selectedMonth).padStart(
        2,
        "0"
      )}-01`;

      const lastDay = new Date(
        selectedYear,
        selectedMonth,
        0
      ).getDate();

      const end = `${selectedYear}-${String(selectedMonth).padStart(
        2,
        "0"
      )}-${String(lastDay).padStart(2, "0")}`;

      const { data: settingsRows } = await supabase
        .from("cleaning_teacher_settings")
        .select("*");

      const { data: allTasks } = await supabase
        .from("cleaning_tasks")
        .select("*")
        .gte("task_date", start)
        .lte("task_date", end);


      const { data: overrideRows, error: overridesError } = await supabase
        .from("calendar_day_overrides")
        .select("*")
        .gte("override_date", start)
        .lte("override_date", end);

      if (overridesError) throw overridesError;

      setMonthOverrides(overrideRows || []);

      const settingMap = new Map(
        (settingsRows || []).map((row) => [row.teacher_id, row])
      );

      const summary = teachers.map((teacher) => {
        const teacherTasks = (allTasks || []).filter(
          (task) =>
            task.teacher_id === teacher.id &&
            Number(task.burden_weight || 0) > 0
        );

        const wedFriCount = teacherTasks.filter((task) => {
          const weekday = getWeekdayLabel(task.task_date);
          return weekday === "三" || weekday === "五";
        }).length;

        return {
          teacher_id: teacher.id,
          teacher_name: getTeacherName(teacher),
          participates_in_rotation:
            settingMap.get(teacher.id)?.participates_in_rotation !== false,
          total_count: teacherTasks.length,
          wed_fri_count: wedFriCount,
          total_weight: teacherTasks.reduce(
            (sum, task) => sum + Number(task.burden_weight || 0),
            0
          ),
        };
      });

      setMonthSummary(summary);
    } catch (error) {
      console.error("讀取清潔月表失敗：", error);
      setErrorMessage(`讀取清潔月表失敗：${error.message}`);
    } finally {
      setLoadingMonth(false);
    }
  }

  async function loadToday() {
    try {
      const tasks = await getCleaningTasksForDate();
      setTodayTasks(tasks || []);
    } catch (error) {
      console.error("讀取今日清潔失敗：", error);
      setErrorMessage(`讀取今日清潔失敗：${error.message}`);
    }
  }

  function clearMessages() {
    setErrorMessage("");
    setSuccessMessage("");
  }

  function resetItemForm() {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
  }

  function resetRuleForm() {
    setEditingRule(null);
    setRuleForm(EMPTY_RULE_FORM);
  }

  function startEditItem(item) {
    clearMessages();
    setEditingItem(item);
    setItemForm({
      name: item.name || "",
      description: item.description || "",
      is_active: item.is_active !== false,
    });
    setActiveTab("ITEMS");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditRule(rule) {
    clearMessages();

    const memberIds = ruleMembers
      .filter((member) => member.cleaning_rule_id === rule.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((member) => member.teacher_id);

    const weekdays =
      Array.isArray(rule.weekdays) && rule.weekdays.length > 0
        ? rule.weekdays.map(Number)
        : rule.weekday !== null && rule.weekday !== undefined
          ? [Number(rule.weekday)]
          : [];

    setEditingRule(rule);
    setRuleForm({
      cleaning_item_id: rule.cleaning_item_id || "",
      assignment_scope: rule.assignment_scope || "PUBLIC",
      rule_type: rule.rule_type || "ROTATION",
      frequency_type: rule.frequency_type || "DAILY",
      weekdays,
      month_day:
        rule.month_day === null || rule.month_day === undefined
          ? ""
          : String(rule.month_day),
      monthly_mode: rule.monthly_mode || "FIRST_WORKDAY",
      fixed_teacher_id: rule.fixed_teacher_id || "",
      member_ids: memberIds,
      note: rule.note || "",
      is_active: rule.is_active !== false,
    });

    setActiveTab("RULES");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveItem(event) {
    event.preventDefault();
    clearMessages();

    const name = itemForm.name.trim();

    if (!name) {
      setErrorMessage("請輸入清潔項目名稱。");
      return;
    }

    const payload = {
      name,
      description: itemForm.description.trim() || null,
      is_active: itemForm.is_active,
      updated_at: new Date().toISOString(),
    };

    try {
      setSavingItem(true);

      if (editingItem) {
        const { error } = await supabase
          .from("cleaning_items")
          .update(payload)
          .eq("id", editingItem.id);

        if (error) throw error;

        setSuccessMessage(`已更新「${name}」。`);
      } else {
        const { error } = await supabase
          .from("cleaning_items")
          .insert([payload]);

        if (error) throw error;

        setSuccessMessage(`已新增「${name}」。`);
      }

      resetItemForm();
      await loadData();
    } catch (error) {
      console.error("儲存清潔項目失敗：", error);
      setErrorMessage(`儲存清潔項目失敗：${error.message}`);
    } finally {
      setSavingItem(false);
    }
  }

  async function toggleItem(item) {
    clearMessages();

    try {
      const { error } = await supabase
        .from("cleaning_items")
        .update({
          is_active: !item.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (error) throw error;

      await loadData();
    } catch (error) {
      console.error("更新清潔項目狀態失敗：", error);
      setErrorMessage(`更新清潔項目狀態失敗：${error.message}`);
    }
  }

  function updateRuleForm(field, value) {
    setRuleForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "assignment_scope") {
        if (value === "OWN_AREA") {
          next.rule_type = "FIXED_PERSON";
          next.fixed_teacher_id = "";
          next.member_ids = [];
        }

        if (value === "FIXED_TASK") {
          next.rule_type = "FIXED_PERSON";
          next.member_ids = [];
        }

        if (value === "PUBLIC") {
          next.rule_type = "ROTATION";
          next.fixed_teacher_id = "";
        }
      }

      if (field === "frequency_type") {
        if (value !== "WEEKLY") next.weekdays = [];
        if (value !== "MONTHLY") {
          next.month_day = "";
          next.monthly_mode = "FIRST_WORKDAY";
        }
      }

      if (field === "monthly_mode" && value !== "FIXED_DATE") {
        next.month_day = "";
      }

      return next;
    });

    clearMessages();
  }

  function toggleWeekday(weekday) {
    setRuleForm((current) => {
      const exists = current.weekdays.includes(weekday);

      return {
        ...current,
        weekdays: exists
          ? current.weekdays.filter((value) => value !== weekday)
          : [...current.weekdays, weekday],
      };
    });

    clearMessages();
  }

  function toggleRuleMember(teacherId) {
    setRuleForm((current) => {
      const exists = current.member_ids.includes(teacherId);

      return {
        ...current,
        member_ids: exists
          ? current.member_ids.filter((id) => id !== teacherId)
          : [...current.member_ids, teacherId],
      };
    });

    clearMessages();
  }

  async function saveRule(event) {
    event.preventDefault();
    clearMessages();

    if (!ruleForm.cleaning_item_id) {
      setErrorMessage("請選擇清潔項目。");
      return;
    }

    if (
      ruleForm.frequency_type === "WEEKLY" &&
      ruleForm.weekdays.length === 0
    ) {
      setErrorMessage("每週規則請至少選擇一天。");
      return;
    }

    if (
      ruleForm.frequency_type === "MONTHLY" &&
      ruleForm.monthly_mode === "FIXED_DATE" &&
      !ruleForm.month_day
    ) {
      setErrorMessage("請設定每月執行日期。");
      return;
    }

    if (
      ruleForm.assignment_scope === "FIXED_TASK" &&
      !ruleForm.fixed_teacher_id
    ) {
      setErrorMessage("固定專責工作請選擇負責老師。");
      return;
    }

    if (
      ruleForm.assignment_scope === "PUBLIC" &&
      ruleForm.member_ids.length === 0
    ) {
      setErrorMessage("公共輪值至少要選一位老師。");
      return;
    }

    const payload = {
      cleaning_item_id: ruleForm.cleaning_item_id,
      assignment_scope: ruleForm.assignment_scope,
      rule_type:
        ruleForm.assignment_scope === "PUBLIC"
          ? "ROTATION"
          : "FIXED_PERSON",
      frequency_type: ruleForm.frequency_type,
      weekdays:
        ruleForm.frequency_type === "WEEKLY"
          ? ruleForm.weekdays
          : null,
      weekday: null,
      month_day:
        ruleForm.frequency_type === "MONTHLY" &&
        ruleForm.monthly_mode === "FIXED_DATE"
          ? Number(ruleForm.month_day)
          : null,
      monthly_mode:
        ruleForm.frequency_type === "MONTHLY"
          ? ruleForm.monthly_mode
          : null,
      fixed_teacher_id:
        ruleForm.assignment_scope === "FIXED_TASK"
          ? ruleForm.fixed_teacher_id
          : null,
      note: ruleForm.note.trim() || null,
      is_active: ruleForm.is_active,
      updated_at: new Date().toISOString(),
    };

    try {
      setSavingRule(true);

      let ruleId = editingRule?.id;

      if (editingRule) {
        const { error } = await supabase
          .from("cleaning_rules")
          .update(payload)
          .eq("id", editingRule.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("cleaning_rules")
          .insert([payload])
          .select("id")
          .single();

        if (error) throw error;

        ruleId = data.id;
      }

      const { error: deleteMembersError } = await supabase
        .from("cleaning_rule_members")
        .delete()
        .eq("cleaning_rule_id", ruleId);

      if (deleteMembersError) throw deleteMembersError;

      if (
        ruleForm.assignment_scope === "PUBLIC" &&
        ruleForm.member_ids.length > 0
      ) {
        const memberPayload = ruleForm.member_ids.map(
          (teacherId, index) => ({
            cleaning_rule_id: ruleId,
            teacher_id: teacherId,
            sort_order: index,
          })
        );

        const { error: insertMembersError } = await supabase
          .from("cleaning_rule_members")
          .insert(memberPayload);

        if (insertMembersError) throw insertMembersError;
      }

      setSuccessMessage(
        editingRule
          ? "已更新清潔規則。請回月清潔表更新本學期排班。"
          : "已建立清潔規則。"
      );

      resetRuleForm();
      await loadData();
    } catch (error) {
      console.error("儲存清潔規則失敗：", error);
      setErrorMessage(`儲存清潔規則失敗：${error.message}`);
    } finally {
      setSavingRule(false);
    }
  }

  async function toggleRule(rule) {
    clearMessages();

    try {
      const { error } = await supabase
        .from("cleaning_rules")
        .update({
          is_active: !rule.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id);

      if (error) throw error;

      await loadData();
    } catch (error) {
      console.error("更新清潔規則狀態失敗：", error);
      setErrorMessage(`更新清潔規則狀態失敗：${error.message}`);
    }
  }

  async function handleGenerateSemester() {
    if (!selectedSemesterId) {
      setErrorMessage("請先選擇學期。");
      return;
    }

    try {
      setGeneratingSemester(true);
      clearMessages();

      const result = await generateCleaningSemester(
        selectedSemesterId
      );

      await loadMonth();
      await refreshSemesterStatus(
        selectedSemesterId
      );

      setSuccessMessage(
        `${result.semester?.name || "本學期"}排班完成：新產生 ${
          result.generated || 0
        } 筆，保留 ${
          result.preserved || 0
        } 筆歷史／手動／已處理任務。`
      );
    } catch (error) {
      console.error("產生學期清潔排班失敗：", error);
      setErrorMessage(
        `產生學期清潔排班失敗：${error.message}`
      );
    } finally {
      setGeneratingSemester(false);
    }
  }

  function changeMonth(offset) {
    const next = new Date(
      selectedYear,
      selectedMonth - 1 + offset,
      1
    );

    setSelectedYear(next.getFullYear());
    setSelectedMonth(next.getMonth() + 1);
  }

  async function handleTeacherSettingChange(
    teacher,
    field,
    value
  ) {
    const existing =
      teacherSettings.find(
        (setting) => setting.teacher_id === teacher.id
      ) || {};

    const nextSetting = {
      teacherId: teacher.id,
      participatesInRotation:
        field === "participates_in_rotation"
          ? value
          : existing.participates_in_rotation !== false,
      ownAreaLabel:
        field === "own_area_label"
          ? value
          : existing.own_area_label || "",
      note: existing.note || null,
    };

    try {
      setSavingTeacherSettingId(teacher.id);

      const saved = await saveCleaningTeacherSetting(
        nextSetting
      );

      setTeacherSettings((current) => {
        const without = current.filter(
          (setting) => setting.teacher_id !== teacher.id
        );

        return [...without, saved];
      });

      setSuccessMessage(
        `${getTeacherName(teacher)} 的清潔設定已更新。`
      );
    } catch (error) {
      console.error("儲存老師清潔設定失敗：", error);
      setErrorMessage(`儲存老師清潔設定失敗：${error.message}`);
    } finally {
      setSavingTeacherSettingId("");
    }
  }

  async function handleReassignTask(taskId, teacherId) {
    try {
      setReassigningTaskId(taskId);

      await reassignCleaningTask(taskId, teacherId);
      await loadMonth();

      setSuccessMessage(
        "已手動更換負責老師，之後重新排班會保留這筆。"
      );
    } catch (error) {
      console.error("更換清潔老師失敗：", error);
      setErrorMessage(`更換清潔老師失敗：${error.message}`);
    } finally {
      setReassigningTaskId("");
    }
  }

  async function handleDone(task, isDone) {
    try {
      await setCleaningTaskDone(task.id, isDone);
      await loadToday();
      await loadMonth();
    } catch (error) {
      console.error("更新清潔任務失敗：", error);
      setErrorMessage(`更新清潔任務失敗：${error.message}`);
    }
  }

  const selectedSemester = useMemo(
    () =>
      semesters.find(
        (semester) =>
          semester.id === selectedSemesterId
      ) || null,
    [semesters, selectedSemesterId]
  );

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  const teacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers]
  );

  const settingMap = useMemo(
    () =>
      new Map(
        teacherSettings.map((setting) => [
          setting.teacher_id,
          setting,
        ])
      ),
    [teacherSettings]
  );

  const monthTasksByDate = useMemo(() => {
    const map = new Map();

    monthTasks.forEach((task) => {
      if (!map.has(task.task_date)) {
        map.set(task.task_date, []);
      }

      map.get(task.task_date).push(task);
    });

    return map;
  }, [monthTasks]);

  const monthDates = useMemo(() => {
    const days = new Date(
      selectedYear,
      selectedMonth,
      0
    ).getDate();

    return Array.from({ length: days }, (_, index) => {
      const day = index + 1;

      return `${selectedYear}-${String(selectedMonth).padStart(
        2,
        "0"
      )}-${String(day).padStart(2, "0")}`;
    });
  }, [selectedYear, selectedMonth]);

  const overrideMap = useMemo(
    () => new Map(monthOverrides.map((row) => [row.override_date, row])),
    [monthOverrides]
  );

  const calendarCells = useMemo(
    () => getCalendarCells(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const activeViewTeacherId =
    calendarViewMode === "MY"
      ? currentTeacherId
      : calendarViewMode === "PERSON"
        ? selectedTeacherId
        : "";

  const visibleMonthTasks = useMemo(() => {
    if (!activeViewTeacherId) return monthTasks;

    return monthTasks.filter(
      (task) => task.teacher_id === activeViewTeacherId
    );
  }, [monthTasks, activeViewTeacherId]);

  const visibleTasksByDate = useMemo(() => {
    const map = new Map();

    visibleMonthTasks.forEach((task) => {
      if (!map.has(task.task_date)) {
        map.set(task.task_date, []);
      }

      map.get(task.task_date).push(task);
    });

    return map;
  }, [visibleMonthTasks]);

  const expandedTasks = expandedDate
    ? visibleTasksByDate.get(expandedDate) || []
    : [];

  function getVisibleTaskText(task, includeTeacher = true) {
    const itemName =
      itemMap.get(task.cleaning_item_id)?.name || "清潔工作";

    if (!includeTeacher) {
      return itemName;
    }

    return `${itemName}｜${getTeacherName(
      teacherMap.get(task.teacher_id)
    )}`;
  }

  function exportCalendarImage(mode = "CURRENT") {
    const exportTeacherId =
      mode === "MY"
        ? currentTeacherId
        : mode === "PERSON"
          ? selectedTeacherId
          : activeViewTeacherId;

    const exportTasks = exportTeacherId
      ? monthTasks.filter((task) => task.teacher_id === exportTeacherId)
      : mode === "ALL"
        ? monthTasks
        : visibleMonthTasks;

    const includeTeacher = !exportTeacherId;
    const exportTeacher = exportTeacherId
      ? teacherMap.get(exportTeacherId)
      : null;

    const taskMap = new Map();
    exportTasks.forEach((task) => {
      if (!taskMap.has(task.task_date)) taskMap.set(task.task_date, []);
      taskMap.get(task.task_date).push(task);
    });

    const width = 1540;
    const sidePadding = 56;
    const usableWidth = width - sidePadding * 2;
    const cellWidth = usableWidth / 7;
    const headerHeight = 170;
    const weekdayHeight = 54;
    const weeks = Math.ceil(calendarCells.length / 7);
    const weekHeights = [];

    for (let weekIndex = 0; weekIndex < weeks; weekIndex += 1) {
      const weekCells = calendarCells.slice(weekIndex * 7, weekIndex * 7 + 7);
      const maxTaskCount = Math.max(
        0,
        ...weekCells.map((cell) => (taskMap.get(cell.dateString) || []).length)
      );
      weekHeights.push(Math.max(150, 70 + maxTaskCount * 30));
    }

    const height =
      headerHeight +
      weekdayHeight +
      weekHeights.reduce((sum, value) => sum + value, 0) +
      60;

    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#f8f8f3";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#29312d";
    context.font = "700 38px system-ui, -apple-system, sans-serif";
    context.fillText(
      `${selectedYear} 年 ${selectedMonth} 月清潔安排`,
      sidePadding,
      70
    );

    context.fillStyle = "#778079";
    context.font = "500 21px system-ui, -apple-system, sans-serif";
    context.fillText(
      exportTeacher ? `${getTeacherName(exportTeacher)}｜個人清潔月表` : "全部清潔月表",
      sidePadding,
      112
    );

    const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
    context.textAlign = "center";
    context.font = "700 20px system-ui, -apple-system, sans-serif";
    context.fillStyle = "#5c6b62";

    weekdayLabels.forEach((label, index) => {
      context.fillText(
        label,
        sidePadding + cellWidth * index + cellWidth / 2,
        headerHeight + 34
      );
    });

    let y = headerHeight + weekdayHeight;

    for (let weekIndex = 0; weekIndex < weeks; weekIndex += 1) {
      const rowHeight = weekHeights[weekIndex];

      for (let column = 0; column < 7; column += 1) {
        const cell = calendarCells[weekIndex * 7 + column];
        const x = sidePadding + cellWidth * column;
        const tasks = taskMap.get(cell.dateString) || [];
        const override = overrideMap.get(cell.dateString);
        const isWeekend = column >= 5;

        context.fillStyle = !cell.isCurrentMonth
          ? "#f0f1ed"
          : isWeekend || ["HOLIDAY", "CLASSROOM_CLOSED"].includes(override?.override_type)
            ? "#f3f2ed"
            : "#ffffff";
        context.fillRect(x, y, cellWidth, rowHeight);

        context.strokeStyle = "#dfe5e0";
        context.strokeRect(x, y, cellWidth, rowHeight);

        context.textAlign = "left";
        context.fillStyle = cell.isCurrentMonth ? "#35473d" : "#adb3ae";
        context.font = "700 20px system-ui, -apple-system, sans-serif";
        context.fillText(String(cell.day), x + 14, y + 28);

        if (override) {
          context.textAlign = "right";
          context.fillStyle = "#9b746d";
          context.font = "600 13px system-ui, -apple-system, sans-serif";
          context.fillText(
            getOverrideLabel(override),
            x + cellWidth - 12,
            y + 27
          );
        }

        context.textAlign = "left";
        tasks.forEach((task, taskIndex) => {
          context.fillStyle = "#46564d";
          context.font = "500 15px system-ui, -apple-system, sans-serif";
          const raw = getVisibleTaskText(task, includeTeacher);
          const maxChars = includeTeacher ? 16 : 20;
          const text = raw.length > maxChars ? `${raw.slice(0, maxChars - 1)}…` : raw;
          context.fillText(text, x + 14, y + 60 + taskIndex * 28);
        });
      }

      y += rowHeight;
    }

    const link = document.createElement("a");
    const suffix = exportTeacher
      ? `_${getTeacherName(exportTeacher)}`
      : "_全部";
    link.download = `${selectedYear}-${String(selectedMonth).padStart(
      2,
      "0"
    )}_清潔月表${suffix}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function getRuleTeachers(rule) {
    if (rule.assignment_scope === "OWN_AREA") {
      return "各自負責自己的區域";
    }

    if (
      rule.assignment_scope === "FIXED_TASK" ||
      rule.rule_type === "FIXED_PERSON"
    ) {
      const teacher = teacherMap.get(rule.fixed_teacher_id);

      return teacher ? getTeacherName(teacher) : "尚未指定";
    }

    const names = ruleMembers
      .filter((member) => member.cleaning_rule_id === rule.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((member) => teacherMap.get(member.teacher_id))
      .filter(Boolean)
      .map(getTeacherName);

    return names.length > 0 ? names.join("、") : "尚未設定輪值";
  }

  const activeItems = items.filter((item) => item.is_active);
  const activeRules = rules.filter((rule) => rule.is_active);

  if (loading) {
    return (
      <div className="cleaningPage">
        <div className="cleaningPage__loading">
          正在讀取清潔設定…
        </div>
      </div>
    );
  }

  return (
    <div className="cleaningPage">
      <header className="cleaningPage__header">
        <div>
          <p className="cleaningPage__eyebrow">
            CLEANING MANAGEMENT
          </p>

          <h1>清潔分配</h1>

          <p>
            月表先排、每天照表執行。學期間共用行事曆休假，
            週三與週五另外平衡負擔。
          </p>
        </div>
      </header>

      <section className="cleaningPage__stats">
        <article>
          <span>清潔項目</span>
          <strong>{activeItems.length}</strong>
          <small>目前啟用</small>
        </article>

        <article>
          <span>清潔規則</span>
          <strong>{activeRules.length}</strong>
          <small>目前啟用</small>
        </article>

        <article>
          <span>本月任務</span>
          <strong>{monthTasks.length}</strong>
          <small>{selectedMonth} 月</small>
        </article>

        <article>
          <span>輪值老師</span>
          <strong>
            {
              teachers.filter(
                (teacher) =>
                  settingMap.get(teacher.id)
                    ?.participates_in_rotation !== false
              ).length
            }
          </strong>
          <small>可參與公共輪值</small>
        </article>
      </section>

      <nav className="cleaningPage__tabs">
        {[
          ["MONTH", "月清潔表"],
          ["TODAY", "今日清潔"],
          ["ITEMS", "清潔項目"],
          ["RULES", "固定規則"],
          ["TEACHERS", "老師設定"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? "active" : ""}
            onClick={() => {
              setActiveTab(key);
              clearMessages();
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {errorMessage && (
        <div className="cleaningPage__message cleaningPage__message--error">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="cleaningPage__message cleaningPage__message--success">
          {successMessage}
        </div>
      )}

      {activeTab === "MONTH" && (
        <section className="cleaningMonth">
          <div className="cleaningCard cleaningSemesterPanel">
            <div className="cleaningSemesterPanel__main">
              <div className="cleaningSemesterPanel__title">
                <p>SEMESTER SCHEDULE</p>
                <h2>學期清潔排班</h2>
              </div>

              <label className="cleaningSemesterPanel__select">
                <span>學期</span>

                <select
                  value={selectedSemesterId}
                  onChange={(event) =>
                    setSelectedSemesterId(event.target.value)
                  }
                >
                  {semesters.length === 0 && (
                    <option value="">尚未建立學期</option>
                  )}

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

              <div className="cleaningSemesterPanel__meta">
                <span>排班期間</span>
                <strong>
                  {selectedSemester
                    ? `${selectedSemester.start_date.replaceAll(
                        "-",
                        "/"
                      )} ～ ${selectedSemester.end_date.replaceAll(
                        "-",
                        "/"
                      )}`
                    : "—"}
                </strong>
              </div>

              <div
                className={[
                  "cleaningSemesterPanel__status",
                  semesterStatus.generated
                    ? "is-ready"
                    : "is-empty",
                ].join(" ")}
              >
                <span>
                  {semesterStatus.generated
                    ? "已產生排班"
                    : "尚未產生"}
                </span>

                {semesterStatus.generated && (
                  <small>
                    {semesterStatus.taskCount} 筆任務
                  </small>
                )}
              </div>

              <button
                type="button"
                className="primary"
                onClick={handleGenerateSemester}
                disabled={
                  !selectedSemesterId ||
                  generatingSemester
                }
              >
                {generatingSemester
                  ? "排班中…"
                  : semesterStatus.generated
                    ? "更新本學期排班"
                    : "產生本學期排班"}
              </button>
            </div>

            <div className="cleaningMonth__toolbar">
              <div>
                <p>MONTHLY VIEW</p>
                <h2>
                  {selectedYear} 年 {selectedMonth} 月
                </h2>
              </div>

              <div className="cleaningMonth__actions">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                >
                  上個月
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const now = getDateParts();
                    setSelectedYear(now.year);
                    setSelectedMonth(now.month);
                  }}
                >
                  本月
                </button>

                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                >
                  下個月
                </button>
              </div>
            </div>
          </div>

          <div className="cleaningCard cleaningCalendarControls">
            <div className="cleaningCalendarControls__view">
              <span>查看</span>

              <button
                type="button"
                className={calendarViewMode === "ALL" ? "active" : ""}
                onClick={() => setCalendarViewMode("ALL")}
              >
                全部清潔
              </button>

              <button
                type="button"
                className={calendarViewMode === "MY" ? "active" : ""}
                disabled={!currentTeacherId}
                onClick={() => setCalendarViewMode("MY")}
              >
                我的清潔
              </button>

              <select
                value={calendarViewMode === "PERSON" ? selectedTeacherId : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedTeacherId(value);
                  setCalendarViewMode(value ? "PERSON" : "ALL");
                }}
              >
                <option value="">選擇老師查看</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {getTeacherName(teacher)}
                  </option>
                ))}
              </select>
            </div>

            <div className="cleaningCalendarControls__export">
              <button type="button" onClick={() => exportCalendarImage("ALL")}>
                輸出全部圖檔
              </button>

              <button
                type="button"
                disabled={!activeViewTeacherId}
                onClick={() => exportCalendarImage("CURRENT")}
              >
                輸出個人圖檔
              </button>
            </div>
          </div>

          <div className="cleaningCard cleaningCalendarCard">
            {loadingMonth ? (
              <div className="cleaningEmpty">正在讀取月表…</div>
            ) : (
              <>
                <div className="cleaningCalendar__weekdays">
                  {["一", "二", "三", "四", "五", "六", "日"].map(
                    (label) => (
                      <div key={label}>{label}</div>
                    )
                  )}
                </div>

                <div className="cleaningCalendar">
                  {calendarCells.map((cell) => {
                    const tasks = visibleTasksByDate.get(cell.dateString) || [];
                    const override = overrideMap.get(cell.dateString);
                    const visibleTasks = tasks.slice(0, MAX_VISIBLE_TASKS_PER_DAY);
                    const hiddenCount = Math.max(
                      0,
                      tasks.length - MAX_VISIBLE_TASKS_PER_DAY
                    );
                    const isToday = cell.dateString === getTodayDateString();
                    const isWeekend = cell.weekday === 0 || cell.weekday === 6;
                    const isClosed = [
                      "HOLIDAY",
                      "CLASSROOM_CLOSED",
                    ].includes(override?.override_type);

                    return (
                      <button
                        key={cell.dateString}
                        type="button"
                        className={[
                          "cleaningCalendarDay",
                          !cell.isCurrentMonth ? "is-outside" : "",
                          isWeekend ? "is-weekend" : "",
                          isClosed ? "is-closed" : "",
                          isToday ? "is-today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          if (cell.isCurrentMonth) {
                            setExpandedDate(cell.dateString);
                          }
                        }}
                      >
                        <div className="cleaningCalendarDay__header">
                          <strong>{cell.day}</strong>
                        </div>

                        {override && (
                          <div
                            className={[
                              "cleaningCalendarDay__override",
                              override.override_type === "SPECIAL_WORKDAY"
                                ? "is-workday"
                                : "is-holiday",
                            ].join(" ")}
                            title={getOverrideLabel(override)}
                          >
                            {getOverrideLabel(override)}
                          </div>
                        )}

                        <div className="cleaningCalendarDay__tasks">
                          {visibleTasks.map((task) => (
                            <div
                              key={task.id}
                              className={
                                task.status === "DONE"
                                  ? "cleaningCalendarTask is-done"
                                  : "cleaningCalendarTask"
                              }
                            >
                              <span>
                                {itemMap.get(task.cleaning_item_id)?.name ||
                                  "清潔工作"}
                              </span>

                              {!activeViewTeacherId && (
                                <b>
                                  {getTeacherName(
                                    teacherMap.get(task.teacher_id)
                                  )}
                                </b>
                              )}
                            </div>
                          ))}

                          {hiddenCount > 0 && (
                            <div className="cleaningCalendarDay__more">
                              ＋{hiddenCount} 項
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {expandedDate && (
            <div
              className="cleaningDayModalBackdrop"
              onClick={() => setExpandedDate("")}
            >
              <section
                className="cleaningDayModal"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="cleaningDayModal__header">
                  <div>
                    <p>DAY DETAILS</p>
                    <h3>
                      {formatDate(expandedDate)}（
                      {getWeekdayLabel(expandedDate)}）
                    </h3>
                  </div>

                  <button type="button" onClick={() => setExpandedDate("")}>
                    關閉
                  </button>
                </div>

                {expandedTasks.length === 0 ? (
                  <div className="cleaningEmpty">這天沒有清潔工作。</div>
                ) : (
                  <div className="cleaningDayModal__tasks">
                    {expandedTasks.map((task) => (
                      <article key={task.id}>
                        <div>
                          <strong>
                            {itemMap.get(task.cleaning_item_id)?.name ||
                              "清潔工作"}
                          </strong>

                          <span>
                            {getTeacherName(teacherMap.get(task.teacher_id))}
                          </span>
                        </div>

                        <select
                          value={task.teacher_id || ""}
                          disabled={reassigningTaskId === task.id}
                          onChange={(event) =>
                            handleReassignTask(task.id, event.target.value)
                          }
                        >
                          {teachers.map((teacher) => (
                            <option key={teacher.id} value={teacher.id}>
                              {getTeacherName(teacher)}
                            </option>
                          ))}
                        </select>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </section>
      )}

      {activeTab === "TODAY" && (
        <section className="cleaningCard">
          <div className="cleaningCard__header">
            <div>
              <p>TODAY CLEANING</p>
              <h2>今日清潔</h2>
            </div>

            <strong>{todayTasks.length} 項</strong>
          </div>

          {todayTasks.length === 0 ? (
            <div className="cleaningEmpty">
              今天沒有清潔任務。若是工作日但尚未排班，請先到月清潔表產生本學期排班。
            </div>
          ) : (
            <div className="cleaningTodayList">
              {todayTasks.map((task) => (
                <article key={task.id}>
                  <div>
                    <strong>
                      {itemMap.get(task.cleaning_item_id)?.name ||
                        "清潔工作"}
                    </strong>

                    <span>
                      {getTeacherName(
                        teacherMap.get(task.teacher_id)
                      )}
                    </span>
                  </div>

                  <label>
                    <input
                      type="checkbox"
                      checked={task.status === "DONE"}
                      onChange={(event) =>
                        handleDone(task, event.target.checked)
                      }
                    />
                    完成
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "ITEMS" && (
        <section className="cleaningPage__layout">
          <form
            className="cleaningCard cleaningForm"
            onSubmit={saveItem}
          >
            <div className="cleaningCard__header">
              <div>
                <p>ITEM SETTINGS</p>
                <h2>
                  {editingItem ? "編輯清潔項目" : "新增清潔項目"}
                </h2>
              </div>
            </div>

            <label>
              <span>項目名稱</span>
              <input
                type="text"
                value={itemForm.name}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="例如：教室掃拖、倒垃圾、洗冷氣濾網"
              />
            </label>

            <label>
              <span>說明</span>
              <textarea
                rows="4"
                value={itemForm.description}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="選填"
              />
            </label>

            <label className="cleaningSwitchRow">
              <div>
                <strong>啟用項目</strong>
                <small>停用後保留歷史資料。</small>
              </div>

              <input
                type="checkbox"
                checked={itemForm.is_active}
                onChange={(event) =>
                  setItemForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
            </label>

            <div className="cleaningForm__actions">
              {editingItem && (
                <button
                  type="button"
                  className="secondary"
                  onClick={resetItemForm}
                  disabled={savingItem}
                >
                  取消
                </button>
              )}

              <button
                type="submit"
                className="primary"
                disabled={savingItem}
              >
                {savingItem
                  ? "儲存中…"
                  : editingItem
                    ? "儲存修改"
                    : "新增項目"}
              </button>
            </div>
          </form>

          <div className="cleaningCard">
            <div className="cleaningCard__header">
              <div>
                <p>CLEANING ITEMS</p>
                <h2>清潔項目</h2>
              </div>
            </div>

            <div className="cleaningList">
              {items.map((item) => (
                <article
                  key={item.id}
                  className={
                    item.is_active
                      ? "cleaningListItem"
                      : "cleaningListItem is-inactive"
                  }
                >
                  <div>
                    <div className="cleaningListItem__title">
                      <strong>{item.name}</strong>
                      <span>
                        {item.is_active ? "啟用中" : "已停用"}
                      </span>
                    </div>

                    <p>{item.description || "尚未填寫說明。"}</p>
                  </div>

                  <div className="cleaningListItem__actions">
                    <button
                      type="button"
                      onClick={() => startEditItem(item)}
                    >
                      編輯
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() => toggleItem(item)}
                    >
                      {item.is_active ? "停用" : "重新啟用"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeTab === "RULES" && (
        <section className="cleaningPage__layout">
          <form
            className="cleaningCard cleaningForm"
            onSubmit={saveRule}
          >
            <div className="cleaningCard__header">
              <div>
                <p>RULE SETTINGS</p>
                <h2>
                  {editingRule ? "編輯清潔規則" : "新增清潔規則"}
                </h2>
              </div>
            </div>

            <label>
              <span>清潔項目</span>
              <select
                value={ruleForm.cleaning_item_id}
                onChange={(event) =>
                  updateRuleForm(
                    "cleaning_item_id",
                    event.target.value
                  )
                }
              >
                <option value="">請選擇項目</option>

                {activeItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="cleaningChoiceGroup">
              <span>工作類型</span>

              <div className="cleaningChoiceGroup__scope">
                {SCOPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      ruleForm.assignment_scope === option.value
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      updateRuleForm(
                        "assignment_scope",
                        option.value
                      )
                    }
                  >
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="cleaningChoiceGroup">
              <span>執行頻率</span>

              <div>
                {[
                  ["DAILY", "每日"],
                  ["WEEKLY", "每週指定日"],
                  ["MONTHLY", "每月"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      ruleForm.frequency_type === value
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      updateRuleForm("frequency_type", value)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {ruleForm.frequency_type === "WEEKLY" && (
              <div className="cleaningWeekdayPicker">
                <span>每週執行日</span>

                <div>
                  {WEEKDAYS.map((weekday) => (
                    <button
                      key={weekday.value}
                      type="button"
                      className={
                        ruleForm.weekdays.includes(weekday.value)
                          ? "selected"
                          : ""
                      }
                      onClick={() => toggleWeekday(weekday.value)}
                    >
                      {weekday.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ruleForm.frequency_type === "MONTHLY" && (
              <>
                <label>
                  <span>每月執行方式</span>

                  <select
                    value={ruleForm.monthly_mode}
                    onChange={(event) =>
                      updateRuleForm(
                        "monthly_mode",
                        event.target.value
                      )
                    }
                  >
                    <option value="FIRST_WORKDAY">
                      每月第一個工作日
                    </option>
                    <option value="LAST_WORKDAY">
                      每月最後一個工作日
                    </option>
                    <option value="FIXED_DATE">
                      每月指定日期
                    </option>
                  </select>
                </label>

                {ruleForm.monthly_mode === "FIXED_DATE" && (
                  <label>
                    <span>每月日期</span>

                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={ruleForm.month_day}
                      onChange={(event) =>
                        updateRuleForm(
                          "month_day",
                          event.target.value
                        )
                      }
                    />
                  </label>
                )}
              </>
            )}

            {ruleForm.assignment_scope === "FIXED_TASK" && (
              <label>
                <span>固定負責老師</span>

                <select
                  value={ruleForm.fixed_teacher_id}
                  onChange={(event) =>
                    updateRuleForm(
                      "fixed_teacher_id",
                      event.target.value
                    )
                  }
                >
                  <option value="">請選擇老師</option>

                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {getTeacherName(teacher)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {ruleForm.assignment_scope === "PUBLIC" && (
              <div className="cleaningMemberPicker">
                <span>可參與這項工作的老師</span>

                <small>
                  系統會再套用「老師設定」中的不參與輪值名單。
                </small>

                <div>
                  {teachers.map((teacher) => {
                    const selected =
                      ruleForm.member_ids.includes(teacher.id);

                    return (
                      <button
                        key={teacher.id}
                        type="button"
                        className={selected ? "selected" : ""}
                        onClick={() =>
                          toggleRuleMember(teacher.id)
                        }
                      >
                        {getTeacherName(teacher)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label>
              <span>備註</span>
              <textarea
                rows="3"
                value={ruleForm.note}
                onChange={(event) =>
                  updateRuleForm("note", event.target.value)
                }
                placeholder="選填"
              />
            </label>

            <label className="cleaningSwitchRow">
              <div>
                <strong>啟用規則</strong>
                <small>停用後不再產生新的清潔任務。</small>
              </div>

              <input
                type="checkbox"
                checked={ruleForm.is_active}
                onChange={(event) =>
                  updateRuleForm(
                    "is_active",
                    event.target.checked
                  )
                }
              />
            </label>

            <div className="cleaningForm__actions">
              {editingRule && (
                <button
                  type="button"
                  className="secondary"
                  onClick={resetRuleForm}
                  disabled={savingRule}
                >
                  取消
                </button>
              )}

              <button
                type="submit"
                className="primary"
                disabled={savingRule}
              >
                {savingRule
                  ? "儲存中…"
                  : editingRule
                    ? "儲存修改"
                    : "建立規則"}
              </button>
            </div>
          </form>

          <div className="cleaningCard">
            <div className="cleaningCard__header">
              <div>
                <p>CLEANING RULES</p>
                <h2>固定規則</h2>
              </div>
            </div>

            <div className="cleaningList">
              {rules.map((rule) => {
                const item = itemMap.get(rule.cleaning_item_id);

                return (
                  <article
                    key={rule.id}
                    className={
                      rule.is_active
                        ? "cleaningListItem"
                        : "cleaningListItem is-inactive"
                    }
                  >
                    <div>
                      <div className="cleaningListItem__title">
                        <strong>{item?.name || "已刪除項目"}</strong>

                        <span>
                          {getScopeLabel(
                            rule.assignment_scope || "PUBLIC"
                          )}
                        </span>
                      </div>

                      <p>
                        {getFrequencyLabel(rule)}
                        {" ｜ "}
                        {getRuleTeachers(rule)}
                      </p>

                      {rule.note && <small>{rule.note}</small>}
                    </div>

                    <div className="cleaningListItem__actions">
                      <button
                        type="button"
                        onClick={() => startEditRule(rule)}
                      >
                        編輯
                      </button>

                      <button
                        type="button"
                        className="danger"
                        onClick={() => toggleRule(rule)}
                      >
                        {rule.is_active ? "停用" : "重新啟用"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {activeTab === "TEACHERS" && (
        <section className="cleaningCard">
          <div className="cleaningCard__header">
            <div>
              <p>TEACHER SETTINGS</p>
              <h2>老師清潔設定</h2>
            </div>
          </div>

          <div className="cleaningTeacherSettings">
            {teachers.map((teacher) => {
              const setting = settingMap.get(teacher.id);

              return (
                <article key={teacher.id}>
                  <strong>{getTeacherName(teacher)}</strong>

                  <label>
                    <input
                      type="checkbox"
                      checked={
                        setting?.participates_in_rotation !== false
                      }
                      disabled={
                        savingTeacherSettingId === teacher.id
                      }
                      onChange={(event) =>
                        handleTeacherSettingChange(
                          teacher,
                          "participates_in_rotation",
                          event.target.checked
                        )
                      }
                    />
                    參與公共清潔輪值
                  </label>

                  <label>
                    <span>自己的教室／區域</span>

                    <input
                      type="text"
                      defaultValue={setting?.own_area_label || ""}
                      placeholder="例如：三年級教室"
                      onBlur={(event) =>
                        handleTeacherSettingChange(
                          teacher,
                          "own_area_label",
                          event.target.value
                        )
                      }
                    />
                  </label>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default CleaningPage;