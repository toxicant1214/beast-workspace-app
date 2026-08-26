import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const GRADE_GROUPS = [
  { value: "LOW", label: "低年級", description: "一、二年級" },
  { value: "MIDDLE", label: "中年級", description: "三、四年級" },
  { value: "HIGH", label: "高年級", description: "五、六年級" },
];

const WEEKDAYS = [
  {
    key: "monday_time",
    label: "星期一",
  },
  {
    key: "tuesday_time",
    label: "星期二",
  },
  {
    key: "wednesday_time",
    label: "星期三",
  },
  {
    key: "thursday_time",
    label: "星期四",
  },
  {
    key: "friday_time",
    label: "星期五",
  },
];

function createEmptyForm() {
  return {
    school: "",
    grade_group: "",
    monday_time: "",
    tuesday_time: "",
    wednesday_time: "",
    thursday_time: "",
    friday_time: "",
    note: "",
  };
}

function formatTime(time) {
  if (!time) return "";

  return time.slice(0, 5);
}

function getGradeGroupLabel(value) {
  return (
    GRADE_GROUPS.find((item) => item.value === value)?.label ||
    "未設定"
  );
}

function getGradeGroupDescription(value) {
  return (
    GRADE_GROUPS.find((item) => item.value === value)
      ?.description || ""
  );
}

function PickupRulesPanel() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(createEmptyForm());

  const [editingRule, setEditingRule] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("pickup_rules")
        .select("*")
        .order("school", { ascending: true })
        .order("grade_group", { ascending: true });

      if (error) {
        throw error;
      }

      setRules(data || []);
    } catch (error) {
      console.error("讀取接車規則失敗：", error);
      setErrorMessage(
        `讀取接車規則失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setEditingRule(null);
    setForm(createEmptyForm());
    setErrorMessage("");
  }

  function startEdit(rule) {
    setEditingRule(rule);

    setForm({
      school: rule.school || "",
      grade_group: rule.grade_group || "",
      monday_time: formatTime(rule.monday_time),
      tuesday_time: formatTime(rule.tuesday_time),
      wednesday_time: formatTime(rule.wednesday_time),
      thursday_time: formatTime(rule.thursday_time),
      friday_time: formatTime(rule.friday_time),
      note: rule.note || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function togglePickupDay(field) {
    setForm((current) => ({
      ...current,
      [field]: current[field] ? "" : "12:20",
    }));
  }

  function validateForm() {
    if (!form.school.trim()) {
      alert("請填寫學校名稱。");
      return false;
    }

    if (!form.grade_group) {
      alert("請選擇低年級、中年級或高年級。");
      return false;
    }

    const hasPickupTime = WEEKDAYS.some(
      (weekday) => form[weekday.key]
    );

    if (!hasPickupTime) {
      alert("請至少設定一天的接車時間。");
      return false;
    }

    return true;
  }

  async function saveRule(event) {
    event.preventDefault();

    if (!validateForm()) return;

    const ruleData = {
      school: form.school.trim(),
      grade_group: form.grade_group,
      monday_time: form.monday_time || null,
      tuesday_time: form.tuesday_time || null,
      wednesday_time: form.wednesday_time || null,
      thursday_time: form.thursday_time || null,
      friday_time: form.friday_time || null,
      note: form.note.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      setErrorMessage("");

      if (editingRule) {
        const { error } = await supabase
          .from("pickup_rules")
          .update(ruleData)
          .eq("id", editingRule.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pickup_rules")
          .insert([ruleData]);

        if (error) throw error;
      }

      resetForm();
      await loadRules();
    } catch (error) {
      console.error("儲存接車規則失敗：", error);

      if (error.code === "23505") {
        setErrorMessage(
          "這間學校的這個年級區間已經有接車規則，請直接編輯原有資料。"
        );
        return;
      }

      setErrorMessage(
        `儲存接車規則失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRule(rule) {
    const confirmed = window.confirm(
      `確定要刪除「${rule.school}／${getGradeGroupLabel(
        rule.grade_group
      )}」的接車規則嗎？`
    );

    if (!confirmed) return;

    try {
      setErrorMessage("");

      const { error } = await supabase
        .from("pickup_rules")
        .delete()
        .eq("id", rule.id);

      if (error) throw error;

      if (editingRule?.id === rule.id) {
        resetForm();
      }

      await loadRules();
    } catch (error) {
      console.error("刪除接車規則失敗：", error);
      setErrorMessage(
        `刪除接車規則失敗：${error.message}`
      );
    }
  }

  const groupedRules = useMemo(() => {
    return rules.reduce((result, rule) => {
      const school = rule.school || "未設定學校";

      if (!result[school]) {
        result[school] = [];
      }

      result[school].push(rule);

      return result;
    }, {});
  }, [rules]);

  return (
    <section className="pickupPanel pickupRulesPanel">
      <div className="pickupRulesLayout">
        <form
          className="pickupRuleForm"
          onSubmit={saveRule}
        >
          <div className="pickupRuleForm__header">
            <p className="eyebrow">
              {editingRule ? "EDIT RULE" : "NEW RULE"}
            </p>

            <h2>
              {editingRule
                ? "編輯接車規則"
                : "新增接車規則"}
            </h2>
          </div>

          <label>
            <span>學校名稱</span>

            <input
              type="text"
              placeholder="例如：新林國小"
              value={form.school}
              onChange={(event) =>
                updateForm("school", event.target.value)
              }
            />
          </label>

          <label>
            <span>年級區間</span>

            <select
              value={form.grade_group}
              onChange={(event) =>
                updateForm(
                  "grade_group",
                  event.target.value
                )
              }
            >
              <option value="">請選擇年級區間</option>

              {GRADE_GROUPS.map((group) => (
                <option
                  key={group.value}
                  value={group.value}
                >
                  {group.label}（{group.description}）
                </option>
              ))}
            </select>
          </label>

          <div className="pickupWeekSettings">
            <div className="pickupWeekSettings__title">
              <span>每週接車時間</span>
              <small>
                不需要接車的星期可直接關閉
              </small>
            </div>

            {WEEKDAYS.map((weekday) => {
              const isEnabled = Boolean(
                form[weekday.key]
              );

              return (
                <div
                  key={weekday.key}
                  className={`pickupWeekdayRow ${
                    isEnabled
                      ? "is-enabled"
                      : "is-disabled"
                  }`}
                >
                  <label className="pickupWeekdayToggle">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() =>
                        togglePickupDay(weekday.key)
                      }
                    />

                    <span>{weekday.label}</span>
                  </label>

                  {isEnabled ? (
                    <input
                      type="time"
                      value={form[weekday.key]}
                      onChange={(event) =>
                        updateForm(
                          weekday.key,
                          event.target.value
                        )
                      }
                    />
                  ) : (
                    <span className="pickupNoService">
                      不接車
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <label>
            <span>備註</span>

            <textarea
              placeholder="可留空，例如：星期三為提早放學"
              value={form.note}
              onChange={(event) =>
                updateForm("note", event.target.value)
              }
            />
          </label>

          {errorMessage && (
            <p className="pickupErrorMessage">
              {errorMessage}
            </p>
          )}

          <div className="pickupRuleForm__actions">
            {editingRule && (
              <button
                type="button"
                onClick={resetForm}
                disabled={isSaving}
              >
                取消編輯
              </button>
            )}

            <button
              type="submit"
              className="primary"
              disabled={isSaving}
            >
              {isSaving
                ? "儲存中…"
                : editingRule
                  ? "儲存修改"
                  : "新增規則"}
            </button>
          </div>
        </form>

        <div className="pickupRuleList">
          <div className="pickupRuleList__header">
            <div>
              <p className="eyebrow">RULE LIST</p>
              <h2>固定接車規則</h2>
            </div>

            <span className="pickupRuleCount">
              {rules.length} 組
            </span>
          </div>

          {isLoading ? (
            <div className="pickupRulesEmpty">
              正在讀取接車規則…
            </div>
          ) : rules.length === 0 ? (
            <div className="pickupRulesEmpty">
              <strong>目前還沒有接車規則</strong>

              <span>
                請先從左側新增第一組學校與年級設定。
              </span>
            </div>
          ) : (
            <div className="pickupSchoolGroups">
              {Object.entries(groupedRules).map(
                ([school, schoolRules]) => (
                  <section
                    key={school}
                    className="pickupSchoolGroup"
                  >
                    <div className="pickupSchoolGroup__header">
                      <h3>{school}</h3>

                      <span>
                        {schoolRules.length} 組規則
                      </span>
                    </div>

                    <div className="pickupGradeRuleCards">
                      {schoolRules.map((rule) => (
                        <article
                          key={rule.id}
                          className="pickupGradeRuleCard"
                        >
                          <div className="pickupGradeRuleCard__header">
                            <div>
                              <strong>
                                {getGradeGroupLabel(
                                  rule.grade_group
                                )}
                              </strong>

                              <span>
                                {getGradeGroupDescription(
                                  rule.grade_group
                                )}
                              </span>
                            </div>

                            <div className="pickupRuleRow__actions">
                              <button
                                type="button"
                                onClick={() =>
                                  startEdit(rule)
                                }
                              >
                                編輯
                              </button>

                              <button
                                type="button"
                                className="danger"
                                onClick={() =>
                                  deleteRule(rule)
                                }
                              >
                                刪除
                              </button>
                            </div>
                          </div>

                          <div className="pickupRuleWeekGrid">
                            {WEEKDAYS.map((weekday) => {
                              const pickupTime =
                                formatTime(
                                  rule[weekday.key]
                                );

                              return (
                                <div
                                  key={weekday.key}
                                  className={`pickupRuleDay ${
                                    pickupTime
                                      ? "has-time"
                                      : "no-time"
                                  }`}
                                >
                                  <span>
                                    {weekday.label.replace(
                                      "星期",
                                      "週"
                                    )}
                                  </span>

                                  <strong>
                                    {pickupTime ||
                                      "不接車"}
                                  </strong>
                                </div>
                              );
                            })}
                          </div>

                          {rule.note && (
                            <p className="pickupGradeRuleCard__note">
                              {rule.note}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default PickupRulesPanel;