import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const WEEKDAYS = [
  { value: 1, label: "星期一" },
  { value: 2, label: "星期二" },
  { value: 3, label: "星期三" },
  { value: 4, label: "星期四" },
  { value: 5, label: "星期五" },
];

const GRADES = [
  "一年級",
  "二年級",
  "三年級",
  "四年級",
  "五年級",
  "六年級",
];

const emptyForm = {
  school: "",
  grade: "",
  weekday: 1,
  pickup_time: "",
  note: "",
};

function formatPickupTime(time) {
  if (!time) return "—";

  return time.slice(0, 5);
}

function getWeekdayLabel(weekday) {
  return (
    WEEKDAYS.find((item) => item.value === Number(weekday))
      ?.label || "—"
  );
}

function PickupRulesPanel() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(emptyForm);

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
        .order("school")
        .order("grade")
        .order("weekday");

      if (error) {
        throw error;
      }

      setRules(data || []);
    } catch (error) {
      console.error("讀取接車規則失敗：", error);
      setErrorMessage(`讀取接車規則失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setEditingRule(null);
    setForm(emptyForm);
  }

  function startEdit(rule) {
    setEditingRule(rule);

    setForm({
      school: rule.school || "",
      grade: rule.grade || "",
      weekday: Number(rule.weekday) || 1,
      pickup_time: formatPickupTime(rule.pickup_time),
      note: rule.note || "",
    });
  }

  function validateForm() {
    if (!form.school.trim()) {
      alert("請填寫學校名稱。");
      return false;
    }

    if (!form.grade) {
      alert("請選擇年級。");
      return false;
    }

    if (!form.weekday) {
      alert("請選擇星期。");
      return false;
    }

    if (!form.pickup_time) {
      alert("請設定接車時間。");
      return false;
    }

    return true;
  }

  async function saveRule(event) {
    event.preventDefault();

    if (!validateForm()) return;

    const ruleData = {
      school: form.school.trim(),
      grade: form.grade,
      weekday: Number(form.weekday),
      pickup_time: form.pickup_time,
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
        alert("這個學校、年級與星期已經有接車規則。");
        return;
      }

      setErrorMessage(`儲存接車規則失敗：${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRule(rule) {
    const confirmed = window.confirm(
      `確定要刪除「${rule.school}／${rule.grade}／${getWeekdayLabel(
        rule.weekday
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
      setErrorMessage(`刪除接車規則失敗：${error.message}`);
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
            <div>
              <p className="eyebrow">
                {editingRule ? "EDIT RULE" : "NEW RULE"}
              </p>

              <h2>
                {editingRule ? "編輯接車規則" : "新增接車規則"}
              </h2>
            </div>
          </div>

          <label>
            <span>學校名稱</span>

            <input
              type="text"
              placeholder="例如：林口國小"
              value={form.school}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  school: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>年級</span>

            <select
              value={form.grade}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  grade: event.target.value,
                }))
              }
            >
              <option value="">請選擇年級</option>

              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>星期</span>

            <select
              value={form.weekday}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  weekday: Number(event.target.value),
                }))
              }
            >
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

          <label>
            <span>接車時間</span>

            <input
              type="time"
              value={form.pickup_time}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  pickup_time: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>備註</span>

            <textarea
              placeholder="可留空，例如：週三為提早放學"
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
            />
          </label>

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
              {rules.length} 筆
            </span>
          </div>

          {errorMessage && (
            <p className="pickupErrorMessage">
              {errorMessage}
            </p>
          )}

          {isLoading ? (
            <div className="pickupRulesEmpty">
              正在讀取接車規則…
            </div>
          ) : rules.length === 0 ? (
            <div className="pickupRulesEmpty">
              <strong>目前還沒有接車規則</strong>
              <span>
                請先從左側新增第一筆學校、年級與星期設定。
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
                      <span>{schoolRules.length} 筆規則</span>
                    </div>

                    <div className="pickupRuleRows">
                      {schoolRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="pickupRuleRow"
                        >
                          <div className="pickupRuleRow__main">
                            <strong>{rule.grade}</strong>

                            <span>
                              {getWeekdayLabel(rule.weekday)}
                            </span>
                          </div>

                          <div className="pickupRuleRow__time">
                            {formatPickupTime(
                              rule.pickup_time
                            )}
                          </div>

                          <div className="pickupRuleRow__note">
                            {rule.note || "—"}
                          </div>

                          <div className="pickupRuleRow__actions">
                            <button
                              type="button"
                              onClick={() => startEdit(rule)}
                            >
                              編輯
                            </button>

                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteRule(rule)}
                            >
                              刪除
                            </button>
                          </div>
                        </div>
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