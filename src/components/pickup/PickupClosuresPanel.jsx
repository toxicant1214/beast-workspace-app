import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

const CLOSURE_SCOPES = [
  {
    value: "ALL",
    label: "全體停接",
    description: "適用於颱風停課、臨時停課或其他全區特殊停接",
  },
  {
    value: "SCHOOL",
    label: "指定學校停接",
    description: "適用於單一學校校慶補假、運動會或臨時停課",
  },
];

function getTodayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  return new Date(now.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) return "—";

  const [year, month, day] = dateString.split("-");

  return `${year}/${month}/${day}`;
}

function getWeekday(dateString) {
  if (!dateString) return "";

  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];

  const date = new Date(`${dateString}T00:00:00`);

  return weekdays[date.getDay()];
}

function getScopeLabel(scope) {
  return (
    CLOSURE_SCOPES.find((item) => item.value === scope)?.label ||
    "未設定"
  );
}

function createEmptyForm() {
  return {
    closure_scope: "ALL",
    school: "",
    closure_date: getTodayString(),
    reason: "",
  };
}

function PickupClosuresPanel() {
  const [schools, setSchools] = useState([]);
  const [closures, setClosures] = useState([]);
  const [form, setForm] = useState(createEmptyForm());

  const [editingClosure, setEditingClosure] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [
        { data: ruleData, error: ruleError },
        { data: closureData, error: closureError },
      ] = await Promise.all([
        supabase
          .from("pickup_rules")
          .select("school")
          .eq("is_active", true)
          .order("school", { ascending: true }),

        supabase
          .from("pickup_closures")
          .select("*")
          .order("closure_date", { ascending: false })
          .order("closure_scope", { ascending: true })
          .order("school", { ascending: true }),
      ]);

      if (ruleError) throw ruleError;
      if (closureError) throw closureError;

      const uniqueSchools = [
        ...new Set(
          (ruleData || [])
            .map((item) => item.school?.trim())
            .filter(Boolean)
        ),
      ];

      setSchools(uniqueSchools);
      setClosures(closureData || []);
    } catch (error) {
      console.error("讀取停接資料失敗：", error);

      setErrorMessage(
        `讀取停接資料失敗：${error.message}`
      );
    } finally {
      setIsLoading(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => {
      const nextForm = {
        ...current,
        [field]: value,
      };

      if (field === "closure_scope" && value === "ALL") {
        nextForm.school = "";
      }

      return nextForm;
    });
  }

  function resetForm() {
    setEditingClosure(null);
    setForm(createEmptyForm());
    setErrorMessage("");
  }

  function startEdit(closure) {
    setEditingClosure(closure);

    setForm({
      closure_scope: closure.closure_scope || "SCHOOL",
      school: closure.school || "",
      closure_date: closure.closure_date || getTodayString(),
      reason: closure.reason || "",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function validateForm() {
    if (!form.closure_scope) {
      alert("請選擇停接範圍。");
      return false;
    }

    if (
      form.closure_scope === "SCHOOL" &&
      !form.school
    ) {
      alert("請選擇停接學校。");
      return false;
    }

    if (!form.closure_date) {
      alert("請選擇停接日期。");
      return false;
    }

    return true;
  }

  async function saveClosure(event) {
    event.preventDefault();

    if (!validateForm()) return;

    const closureData = {
      closure_scope: form.closure_scope,
      school:
        form.closure_scope === "SCHOOL"
          ? form.school
          : null,
      closure_date: form.closure_date,
      reason: form.reason.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      setErrorMessage("");

      if (editingClosure) {
        const { error } = await supabase
          .from("pickup_closures")
          .update(closureData)
          .eq("id", editingClosure.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pickup_closures")
          .insert([closureData]);

        if (error) throw error;
      }

      resetForm();
      await loadInitialData();
    } catch (error) {
      console.error("儲存停接資料失敗：", error);

      if (error.code === "23505") {
        setErrorMessage(
          form.closure_scope === "ALL"
            ? "這一天已經有全體停接紀錄，請直接編輯原有資料。"
            : "這間學校在這一天已經有停接紀錄，請直接編輯原有資料。"
        );
        return;
      }

      setErrorMessage(
        `儲存停接資料失敗：${error.message}`
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteClosure(closure) {
    const targetName =
      closure.closure_scope === "ALL"
        ? "全體停接"
        : closure.school;

    const confirmed = window.confirm(
      `確定要刪除「${targetName}／${formatDate(
        closure.closure_date
      )}」的停接紀錄嗎？`
    );

    if (!confirmed) return;

    try {
      setErrorMessage("");

      const { error } = await supabase
        .from("pickup_closures")
        .delete()
        .eq("id", closure.id);

      if (error) throw error;

      if (editingClosure?.id === closure.id) {
        resetForm();
      }

      await loadInitialData();
    } catch (error) {
      console.error("刪除停接資料失敗：", error);

      setErrorMessage(
        `刪除停接資料失敗：${error.message}`
      );
    }
  }

  const groupedClosures = useMemo(() => {
    return closures.reduce((result, closure) => {
      const month = closure.closure_date
        ? closure.closure_date.slice(0, 7)
        : "未設定日期";

      if (!result[month]) {
        result[month] = [];
      }

      result[month].push(closure);

      return result;
    }, {});
  }, [closures]);

  return (
    <section className="pickupPanel pickupClosuresPanel">
      <div className="pickupClosuresLayout">
        <form
          className="pickupClosureForm"
          onSubmit={saveClosure}
        >
          <div className="pickupClosureForm__header">
            <p className="eyebrow">
              {editingClosure
                ? "EDIT CLOSURE"
                : "NEW CLOSURE"}
            </p>

            <h2>
              {editingClosure
                ? "編輯停接安排"
                : "新增停接安排"}
            </h2>

            <p>
              國定假日與教室休假由行事曆自動套用；這裡只管理接送系統的臨時停接。
            </p>
          </div>

          <div className="pickupClosureScopeOptions">
            {CLOSURE_SCOPES.map((scope) => {
              const isActive =
                form.closure_scope === scope.value;

              return (
                <button
                  key={scope.value}
                  type="button"
                  className={
                    isActive
                      ? "pickupClosureScopeOption active"
                      : "pickupClosureScopeOption"
                  }
                  onClick={() =>
                    updateForm(
                      "closure_scope",
                      scope.value
                    )
                  }
                >
                  <strong>{scope.label}</strong>
                  <span>{scope.description}</span>
                </button>
              );
            })}
          </div>

          {form.closure_scope === "SCHOOL" && (
            <>
              <label>
                <span>停接學校</span>

                <select
                  value={form.school}
                  onChange={(event) =>
                    updateForm(
                      "school",
                      event.target.value
                    )
                  }
                >
                  <option value="">請選擇學校</option>

                  {schools.map((school) => (
                    <option
                      key={school}
                      value={school}
                    >
                      {school}
                    </option>
                  ))}
                </select>
              </label>

              {schools.length === 0 && !isLoading && (
                <p className="pickupClosureHint">
                  尚未找到學校，請先到「接車規則」建立學校規則。
                </p>
              )}
            </>
          )}

          <label>
            <span>停接日期</span>

            <input
              type="date"
              value={form.closure_date}
              onChange={(event) =>
                updateForm(
                  "closure_date",
                  event.target.value
                )
              }
            />
          </label>

          <label>
            <span>停接原因</span>

            <textarea
              placeholder={
                form.closure_scope === "ALL"
                  ? "例如：颱風停課、臨時停課或其他全區特殊停接"
                  : "例如：校慶補假、運動會或臨時停課"
              }
              value={form.reason}
              onChange={(event) =>
                updateForm("reason", event.target.value)
              }
            />
          </label>

          {errorMessage && (
            <p className="pickupErrorMessage">
              {errorMessage}
            </p>
          )}

          <div className="pickupRuleForm__actions">
            {editingClosure && (
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
              disabled={
                isSaving ||
                (
                  form.closure_scope === "SCHOOL" &&
                  schools.length === 0
                )
              }
            >
              {isSaving
                ? "儲存中…"
                : editingClosure
                  ? "儲存修改"
                  : "新增停接"}
            </button>
          </div>
        </form>

        <div className="pickupClosureList">
          <div className="pickupRuleList__header">
            <div>
              <p className="eyebrow">
                PICKUP CHANGES
              </p>

              <h2>停接紀錄</h2>
            </div>

            <span className="pickupRuleCount">
              {closures.length} 筆
            </span>
          </div>

          {isLoading ? (
            <div className="pickupRulesEmpty">
              正在讀取停接資料…
            </div>
          ) : closures.length === 0 ? (
            <div className="pickupRulesEmpty">
              <strong>目前沒有停接紀錄</strong>

              <span>
                國定假日與教室休假不需在這裡重複建立；有臨時全體停接或指定學校停接時再新增即可。
              </span>
            </div>
          ) : (
            <div className="pickupClosureMonthGroups">
              {Object.entries(groupedClosures).map(
                ([month, monthClosures]) => (
                  <section
                    key={month}
                    className="pickupClosureMonthGroup"
                  >
                    <div className="pickupClosureMonthGroup__header">
                      <h3>
                        {month.replace("-", " 年 ")} 月
                      </h3>

                      <span>
                        {monthClosures.length} 筆
                      </span>
                    </div>

                    <div className="pickupClosureRows">
                      {monthClosures.map((closure) => {
                        const isAll =
                          closure.closure_scope === "ALL";

                        return (
                          <article
                            key={closure.id}
                            className={
                              isAll
                                ? "pickupClosureRow is-all"
                                : "pickupClosureRow"
                            }
                          >
                            <div className="pickupClosureDate">
                              <strong>
                                {formatDate(
                                  closure.closure_date
                                )}
                              </strong>

                              <span>
                                {getWeekday(
                                  closure.closure_date
                                )}
                              </span>
                            </div>

                            <div className="pickupClosureInfo">
                              <div className="pickupClosureScopeBadge">
                                {getScopeLabel(
                                  closure.closure_scope
                                )}
                              </div>

                              <strong>
                                {isAll
                                  ? "所有學校"
                                  : closure.school}
                              </strong>

                              <span>
                                {closure.reason ||
                                  "未填寫停接原因"}
                              </span>
                            </div>

                            <div className="pickupRuleRow__actions">
                              <button
                                type="button"
                                onClick={() =>
                                  startEdit(closure)
                                }
                              >
                                編輯
                              </button>

                              <button
                                type="button"
                                className="danger"
                                onClick={() =>
                                  deleteClosure(closure)
                                }
                              >
                                刪除
                              </button>
                            </div>
                          </article>
                        );
                      })}
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

export default PickupClosuresPanel;