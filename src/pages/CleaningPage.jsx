import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./CleaningPage.css";

const EMPTY_ITEM_FORM = {
  name: "",
  description: "",
  is_active: true,
};

const EMPTY_RULE_FORM = {
  cleaning_item_id: "",
  rule_type: "ROTATION",
  frequency_type: "DAILY",
  weekday: "",
  month_day: "",
  monthly_mode: "FIRST_WORKDAY",
  fixed_teacher_id: "",
  member_ids: [],
  note: "",
  is_active: true,
};

const WEEKDAYS = [
  { value: 1, label: "星期一" },
  { value: 2, label: "星期二" },
  { value: 3, label: "星期三" },
  { value: 4, label: "星期四" },
  { value: 5, label: "星期五" },
  { value: 6, label: "星期六" },
  { value: 0, label: "星期日" },
];

function getTeacherName(teacher) {
  return (
    teacher?.chinese_name ||
    teacher?.name ||
    teacher?.teacher_name ||
    teacher?.english_name ||
    "未命名老師"
  );
}

function getFrequencyLabel(rule) {
  if (rule.frequency_type === "DAILY") {
    return "每日";
  }

  if (rule.frequency_type === "WEEKLY") {
    return WEEKDAYS.find(
      (item) => Number(item.value) === Number(rule.weekday)
    )?.label || "每週";
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

function CleaningPage() {
  const [activeTab, setActiveTab] = useState("ITEMS");

  const [items, setItems] = useState([]);
  const [rules, setRules] = useState([]);
  const [ruleMembers, setRuleMembers] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);

  const [editingItem, setEditingItem] = useState(null);
  const [editingRule, setEditingRule] = useState(null);

  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        itemsResult,
        rulesResult,
        membersResult,
        teachersResult,
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

        supabase
          .from("teachers")
          .select("*"),
      ]);

      if (itemsResult.error) throw itemsResult.error;
      if (rulesResult.error) throw rulesResult.error;
      if (membersResult.error) throw membersResult.error;
      if (teachersResult.error) throw teachersResult.error;

      setItems(itemsResult.data || []);
      setRules(rulesResult.data || []);
      setRuleMembers(membersResult.data || []);

      const teacherRows = (teachersResult.data || []).filter((teacher) => {
        if (teacher.is_active === false) {
          return false;
        }

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditRule(rule) {
    clearMessages();

    const memberIds = ruleMembers
      .filter((member) => member.cleaning_rule_id === rule.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((member) => member.teacher_id);

    setEditingRule(rule);
    setRuleForm({
      cleaning_item_id: rule.cleaning_item_id || "",
      rule_type: rule.rule_type || "ROTATION",
      frequency_type: rule.frequency_type || "DAILY",
      weekday:
        rule.weekday === null || rule.weekday === undefined
          ? ""
          : String(rule.weekday),
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

      if (field === "rule_type") {
        if (value === "ROTATION") {
          next.fixed_teacher_id = "";
        } else {
          next.member_ids = [];
        }
      }

      if (field === "frequency_type") {
        if (value !== "WEEKLY") {
          next.weekday = "";
        }

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
      ruleForm.weekday === ""
    ) {
      setErrorMessage("每週規則請選擇星期。");
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
      ruleForm.rule_type === "FIXED_PERSON" &&
      !ruleForm.fixed_teacher_id
    ) {
      setErrorMessage("固定負責規則請選擇老師。");
      return;
    }

    if (
      ruleForm.rule_type === "ROTATION" &&
      ruleForm.member_ids.length === 0
    ) {
      setErrorMessage("輪值規則至少要選一位老師。");
      return;
    }

    const payload = {
      cleaning_item_id: ruleForm.cleaning_item_id,
      rule_type: ruleForm.rule_type,
      frequency_type: ruleForm.frequency_type,
      weekday:
        ruleForm.frequency_type === "WEEKLY"
          ? Number(ruleForm.weekday)
          : null,
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
        ruleForm.rule_type === "FIXED_PERSON"
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
        ruleForm.rule_type === "ROTATION" &&
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
        editingRule ? "已更新清潔規則。" : "已建立清潔規則。"
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

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  const teacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers]
  );

  function getRuleTeachers(rule) {
    if (rule.rule_type === "FIXED_PERSON") {
      const teacher = teacherMap.get(rule.fixed_teacher_id);

      return teacher ? getTeacherName(teacher) : "尚未指定";
    }

    const names = ruleMembers
      .filter((member) => member.cleaning_rule_id === rule.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((member) => teacherMap.get(member.teacher_id))
      .filter(Boolean)
      .map(getTeacherName);

    return names.length > 0 ? names.join(" → ") : "尚未設定輪值";
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
            管理學期間的清潔項目、固定規則與輪值人員。
            寒暑假清潔將由營隊排班系統另外處理。
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
          <span>輪值規則</span>
          <strong>
            {
              activeRules.filter(
                (rule) => rule.rule_type === "ROTATION"
              ).length
            }
          </strong>
          <small>多人輪流</small>
        </article>

        <article>
          <span>固定負責</span>
          <strong>
            {
              activeRules.filter(
                (rule) => rule.rule_type === "FIXED_PERSON"
              ).length
            }
          </strong>
          <small>指定老師</small>
        </article>
      </section>

      <nav className="cleaningPage__tabs">
        <button
          type="button"
          className={activeTab === "ITEMS" ? "active" : ""}
          onClick={() => {
            setActiveTab("ITEMS");
            clearMessages();
          }}
        >
          清潔項目
        </button>

        <button
          type="button"
          className={activeTab === "RULES" ? "active" : ""}
          onClick={() => {
            setActiveTab("RULES");
            clearMessages();
          }}
        >
          固定規則
        </button>

        <button
          type="button"
          className={activeTab === "TODAY" ? "active" : ""}
          onClick={() => {
            setActiveTab("TODAY");
            clearMessages();
          }}
        >
          今日清潔
        </button>
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
                placeholder="例如：教室掃拖、倒垃圾、清洗冷氣濾網"
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
                placeholder="選填，可記錄清潔範圍或注意事項。"
              />
            </label>

            <label className="cleaningSwitchRow">
              <div>
                <strong>啟用項目</strong>
                <small>停用後保留歷史設定。</small>
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

              <strong>{items.length} 項</strong>
            </div>

            {items.length === 0 ? (
              <div className="cleaningEmpty">
                還沒有清潔項目，先從左側建立第一項。
              </div>
            ) : (
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

                      <p>
                        {item.description || "尚未填寫說明。"}
                      </p>
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
            )}
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
              <span>分配方式</span>

              <div>
                <button
                  type="button"
                  className={
                    ruleForm.rule_type === "ROTATION"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    updateRuleForm("rule_type", "ROTATION")
                  }
                >
                  輪值
                </button>

                <button
                  type="button"
                  className={
                    ruleForm.rule_type === "FIXED_PERSON"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    updateRuleForm("rule_type", "FIXED_PERSON")
                  }
                >
                  固定老師
                </button>
              </div>
            </div>

            <div className="cleaningChoiceGroup">
              <span>執行頻率</span>

              <div>
                {[
                  ["DAILY", "每日"],
                  ["WEEKLY", "每週"],
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
              <label>
                <span>每週執行日</span>
                <select
                  value={ruleForm.weekday}
                  onChange={(event) =>
                    updateRuleForm("weekday", event.target.value)
                  }
                >
                  <option value="">請選擇星期</option>
                  {WEEKDAYS.map((weekday) => (
                    <option
                      key={weekday.value}
                      value={weekday.value}
                    >
                      {weekday.label}
                    </option>
                  ))}
                </select>
              </label>
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

            {ruleForm.rule_type === "FIXED_PERSON" ? (
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
            ) : (
              <div className="cleaningMemberPicker">
                <span>輪值老師</span>
                <small>
                  目前的選取順序就是輪值順序。
                </small>

                <div>
                  {teachers.map((teacher) => {
                    const selected =
                      ruleForm.member_ids.includes(teacher.id);

                    const order =
                      ruleForm.member_ids.indexOf(teacher.id) + 1;

                    return (
                      <button
                        key={teacher.id}
                        type="button"
                        className={selected ? "selected" : ""}
                        onClick={() =>
                          toggleRuleMember(teacher.id)
                        }
                      >
                        {selected && (
                          <b>{order}</b>
                        )}
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

              <strong>{rules.length} 筆</strong>
            </div>

            {rules.length === 0 ? (
              <div className="cleaningEmpty">
                還沒有清潔規則，先從左側建立第一筆。
              </div>
            ) : (
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
                          <strong>
                            {item?.name || "已刪除項目"}
                          </strong>

                          <span>
                            {rule.rule_type === "ROTATION"
                              ? "輪值"
                              : "固定老師"}
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
            )}
          </div>
        </section>
      )}

      {activeTab === "TODAY" && (
        <section className="cleaningCard cleaningTodayPlaceholder">
          <p>TODAY CLEANING</p>
          <h2>今日清潔</h2>
          <strong>下一步會接上自動排班。</strong>
          <span>
            系統會依學期、共用休假、特殊上班日與你剛設定的規則，
            自動產生每天的清潔任務。
          </span>
        </section>
      )}
    </div>
  );
}

export default CleaningPage;