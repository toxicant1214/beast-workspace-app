import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  generateCleaningMonth,
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

  const [monthTasks, setMonthTasks] = useState([]);
  const [monthSummary, setMonthSummary] = useState([]);
  const [todayTasks, setTodayTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [generatingMonth, setGeneratingMonth] = useState(false);
  const [savingTeacherSettingId, setSavingTeacherSettingId] = useState("");
  const [reassigningTaskId, setReassigningTaskId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadMonth();
  }, [selectedYear, selectedMonth, teachers]);

  useEffect(() => {
    if (activeTab === "TODAY") {
      loadToday();
    }
  }, [activeTab]);

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
          ? "已更新清潔規則。請重新產生本月未完成排班。"
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

  async function handleGenerateMonth() {
    try {
      setGeneratingMonth(true);
      clearMessages();

      const result = await generateCleaningMonth(
        selectedYear,
        selectedMonth
      );

      setMonthTasks(result.tasks || []);
      setMonthSummary(result.summary || []);

      setSuccessMessage(
        result.semesters?.length === 0
          ? "這個月份不在學期區間內，不產生學期清潔排班。"
          : `本月排班完成：新產生 ${result.generated || 0} 筆，保留 ${
              result.preserved || 0
            } 筆手動／已處理任務。`
      );
    } catch (error) {
      console.error("產生清潔月表失敗：", error);
      setErrorMessage(`產生清潔月表失敗：${error.message}`);
    } finally {
      setGeneratingMonth(false);
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
          <div className="cleaningCard cleaningMonth__toolbar">
            <div>
              <p>MONTHLY SCHEDULE</p>
              <h2>
                {selectedYear} 年 {selectedMonth} 月
              </h2>
            </div>

            <div className="cleaningMonth__actions">
              <button type="button" onClick={() => changeMonth(-1)}>
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

              <button type="button" onClick={() => changeMonth(1)}>
                下個月
              </button>

              <button
                type="button"
                className="primary"
                onClick={handleGenerateMonth}
                disabled={generatingMonth}
              >
                {generatingMonth
                  ? "排班中…"
                  : "產生／重新整理本月排班"}
              </button>
            </div>
          </div>

          <div className="cleaningMonth__summary">
            {monthSummary.map((row) => (
              <article key={row.teacher_id}>
                <strong>{row.teacher_name}</strong>

                <span>
                  {row.participates_in_rotation
                    ? "參與輪值"
                    : "不參與輪值"}
                </span>

                <small>
                  {row.total_count} 次｜週三五 {row.wed_fri_count} 次｜
                  負擔 {Number(row.total_weight || 0).toFixed(1)}
                </small>
              </article>
            ))}
          </div>

          <div className="cleaningCard cleaningMonth__tableWrap">
            {loadingMonth ? (
              <div className="cleaningEmpty">正在讀取月表…</div>
            ) : (
              <table className="cleaningMonth__table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>星期</th>
                    <th>清潔安排</th>
                  </tr>
                </thead>

                <tbody>
                  {monthDates.map((dateString) => {
                    const tasks =
                      monthTasksByDate.get(dateString) || [];

                    return (
                      <tr key={dateString}>
                        <td>{formatDate(dateString)}</td>

                        <td
                          className={
                            ["三", "五"].includes(
                              getWeekdayLabel(dateString)
                            )
                              ? "is-heavy-day"
                              : ""
                          }
                        >
                          {getWeekdayLabel(dateString)}
                        </td>

                        <td>
                          {tasks.length === 0 ? (
                            <span className="cleaningMonth__emptyDay">
                              —
                            </span>
                          ) : (
                            <div className="cleaningMonth__taskList">
                              {tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="cleaningMonth__task"
                                >
                                  <strong>
                                    {itemMap.get(task.cleaning_item_id)
                                      ?.name || "清潔工作"}
                                  </strong>

                                  <select
                                    value={task.teacher_id || ""}
                                    disabled={
                                      reassigningTaskId === task.id
                                    }
                                    onChange={(event) =>
                                      handleReassignTask(
                                        task.id,
                                        event.target.value
                                      )
                                    }
                                  >
                                    <option value="">未指定</option>

                                    {teachers.map((teacher) => (
                                      <option
                                        key={teacher.id}
                                        value={teacher.id}
                                      >
                                        {getTeacherName(teacher)}
                                      </option>
                                    ))}
                                  </select>

                                  {task.is_manual_assignment && (
                                    <span>手動</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
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
              今天沒有清潔任務。若是工作日但尚未排班，請先到月清潔表產生本月排班。
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