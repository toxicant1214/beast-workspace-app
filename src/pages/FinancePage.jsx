import { useEffect, useMemo, useState } from "react";
import {
  getFinanceStudentFeeSettings,
  saveFinanceStudentFeeSetting,
  getFinanceMonthSummary,
  generateFinanceMonthlyFees,
} from "../services/financeService";

const TABS = [
  "財務總覽",
  "學收管理",
  "人事成本",
  "營運支出",
  "分析報表",
  "月結紀錄",
];

const DISCOUNT_REASONS = [
  "",
  "手足優惠",
  "舊生優惠",
  "員工優惠",
  "特殊優惠",
  "其他",
];

const EMPTY_FORM = {
  childcare_enabled: false,
  childcare_list_price: 0,
  childcare_discount: 0,
  childcare_discount_reason: "",
  childcare_discount_note: "",
  english_enabled: false,
  english_list_price: 0,
  english_discount: 0,
  english_discount_reason: "",
  english_discount_note: "",
};

function money(value) {
  return `$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function finalFee(enabled, listPrice, discount) {
  if (!enabled) return 0;
  return Math.max(0, Number(listPrice || 0) - Number(discount || 0));
}

function currentMonthValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function displayMonth(value) {
  if (!value) return "—";
  const [year, month] = value.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function FinancePage() {
  const [activeTab, setActiveTab] = useState("財務總覽");
  const [amountsVisible, setAmountsVisible] = useState(false);

  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [feeFilter, setFeeFilter] = useState("ALL");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [feeForm, setFeeForm] = useState(EMPTY_FORM);
  const [savingFee, setSavingFee] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [billingMonth, setBillingMonth] = useState(currentMonthValue());
  const [monthSummary, setMonthSummary] = useState(null);
  const [loadingMonthSummary, setLoadingMonthSummary] = useState(false);
  const [generatingMonth, setGeneratingMonth] = useState(false);
  const [monthMessage, setMonthMessage] = useState("");

  const monthLabel = useMemo(() => {
    return new Date().toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "long",
    });
  }, []);

  const metrics = [
    { label: "總學收", value: "—", note: "安親＋美語" },
    { label: "總支出", value: "—", note: "人事＋營運支出" },
    { label: "營運結餘", value: "—", note: "本月即時估算" },
    { label: "收費學生", value: "—", note: "人" },
  ];

  useEffect(() => {
    if (activeTab !== "學收管理" || students.length > 0) return;

    let cancelled = false;

    async function loadStudents() {
      setLoadingStudents(true);
      setStudentError("");

      try {
        const rows = await getFinanceStudentFeeSettings();
        if (!cancelled) {
          setStudents(rows);
        }
      } catch (error) {
        console.error("讀取學收設定失敗", error);
        if (!cancelled) {
          setStudentError(error.message || "讀取學收設定失敗");
        }
      } finally {
        if (!cancelled) {
          setLoadingStudents(false);
        }
      }
    }

    loadStudents();

    return () => {
      cancelled = true;
    };
  }, [activeTab, students.length]);


  useEffect(() => {
    if (activeTab !== "學收管理") return;

    let cancelled = false;

    async function loadMonthSummary() {
      setLoadingMonthSummary(true);
      setMonthMessage("");

      try {
        const summary = await getFinanceMonthSummary(`${billingMonth}-01`);
        if (!cancelled) {
          setMonthSummary(summary);
        }
      } catch (error) {
        console.error("讀取月份帳務狀態失敗", error);
        if (!cancelled) {
          setMonthSummary(null);
          setMonthMessage(error.message || "讀取月份帳務狀態失敗");
        }
      } finally {
        if (!cancelled) {
          setLoadingMonthSummary(false);
        }
      }
    }

    loadMonthSummary();

    return () => {
      cancelled = true;
    };
  }, [activeTab, billingMonth]);

  const filteredStudents = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return students.filter((student) => {
      const setting = student.feeSetting;
      const childcareEnabled = Boolean(setting?.childcare_enabled);
      const englishEnabled = Boolean(setting?.english_enabled);
      const hasSetting = childcareEnabled || englishEnabled;

      const matchesKeyword =
        !keyword ||
        student.chinese_name?.toLowerCase().includes(keyword) ||
        student.student_no?.toLowerCase().includes(keyword) ||
        student.current_grade?.toLowerCase().includes(keyword);

      let matchesFilter = true;
      if (feeFilter === "CHILDCARE") matchesFilter = childcareEnabled;
      if (feeFilter === "ENGLISH") matchesFilter = englishEnabled;
      if (feeFilter === "UNSET") matchesFilter = !hasSetting;

      return matchesKeyword && matchesFilter;
    });
  }, [students, searchText, feeFilter]);

  const feeSummary = useMemo(() => {
    let configured = 0;
    let childcare = 0;
    let english = 0;

    students.forEach((student) => {
      const setting = student.feeSetting;
      const hasChildcare = Boolean(setting?.childcare_enabled);
      const hasEnglish = Boolean(setting?.english_enabled);

      if (hasChildcare || hasEnglish) configured += 1;
      if (hasChildcare) childcare += 1;
      if (hasEnglish) english += 1;
    });

    return {
      total: students.length,
      configured,
      childcare,
      english,
      unset: students.length - configured,
    };
  }, [students]);

  function openFeeEditor(student) {
    const setting = student.feeSetting;

    setSelectedStudent(student);
    setSaveMessage("");
    setFeeForm({
      ...EMPTY_FORM,
      ...(setting || {}),
      childcare_discount_reason: setting?.childcare_discount_reason || "",
      childcare_discount_note: setting?.childcare_discount_note || "",
      english_discount_reason: setting?.english_discount_reason || "",
      english_discount_note: setting?.english_discount_note || "",
    });
  }

  function updateForm(field, value) {
    setFeeForm((current) => ({
      ...current,
      [field]: value,
    }));
    setSaveMessage("");
  }

  async function handleSaveFee() {
    if (!selectedStudent) return;

    const childcarePrice = Number(feeForm.childcare_list_price || 0);
    const childcareDiscount = Number(feeForm.childcare_discount || 0);
    const englishPrice = Number(feeForm.english_list_price || 0);
    const englishDiscount = Number(feeForm.english_discount || 0);

    if (childcareDiscount > childcarePrice) {
      setSaveMessage("安親折扣不能高於原價。");
      return;
    }

    if (englishDiscount > englishPrice) {
      setSaveMessage("美語折扣不能高於原價。");
      return;
    }

    setSavingFee(true);
    setSaveMessage("");

    try {
      const saved = await saveFinanceStudentFeeSetting(
        selectedStudent.id,
        feeForm
      );

      setStudents((current) =>
        current.map((student) =>
          student.id === selectedStudent.id
            ? { ...student, feeSetting: saved }
            : student
        )
      );

      setSelectedStudent((current) =>
        current ? { ...current, feeSetting: saved } : current
      );

      setFeeForm((current) => ({
        ...current,
        ...saved,
        childcare_discount_reason: saved.childcare_discount_reason || "",
        childcare_discount_note: saved.childcare_discount_note || "",
        english_discount_reason: saved.english_discount_reason || "",
        english_discount_note: saved.english_discount_note || "",
      }));

      setSaveMessage("已儲存目前收費基準。");
    } catch (error) {
      console.error("儲存學收設定失敗", error);
      setSaveMessage(error.message || "儲存失敗，請稍後再試。");
    } finally {
      setSavingFee(false);
    }
  }


  async function handleGenerateMonth() {
    if (monthSummary?.monthRecord?.status === "CLOSED") {
      setMonthMessage("這個月份已結算，不能再建立原始學收。");
      return;
    }

    const confirmed = window.confirm(
      `要建立 ${displayMonth(billingMonth)} 的學收快照嗎？\n\n只會複製目前已設定的安親／美語收費；已存在的學生月帳不會被覆蓋。`
    );

    if (!confirmed) return;

    setGeneratingMonth(true);
    setMonthMessage("");

    try {
      const result = await generateFinanceMonthlyFees(`${billingMonth}-01`);
      const summary = await getFinanceMonthSummary(`${billingMonth}-01`);
      setMonthSummary(summary);

      if (result.createdCount > 0) {
        setMonthMessage(
          `已建立 ${result.createdCount} 筆 ${displayMonth(
            billingMonth
          )} 學收快照；原本已有 ${result.existingCount} 筆。`
        );
      } else if (result.existingCount > 0) {
        setMonthMessage(
          `本月沒有新增資料；目前已有 ${result.existingCount} 筆學收快照，既有資料沒有被覆蓋。`
        );
      } else {
        setMonthMessage(
          "目前沒有可建立的學生收費設定。請先完成至少一位學生的目前收費基準。"
        );
      }
    } catch (error) {
      console.error("建立月份學收失敗", error);
      setMonthMessage(error.message || "建立月份學收失敗，請稍後再試。");
    } finally {
      setGeneratingMonth(false);
    }
  }

  const childcareFinal = finalFee(
    feeForm.childcare_enabled,
    feeForm.childcare_list_price,
    feeForm.childcare_discount
  );

  const englishFinal = finalFee(
    feeForm.english_enabled,
    feeForm.english_list_price,
    feeForm.english_discount
  );

  return (
    <div className="financePage">
      <section className="financeHero">
        <div>
          <p className="financeEyebrow">OPERATIONS FINANCE</p>
          <h1>營運財務</h1>
          <p className="financeLead">
            把學收、人事與日常支出放在同一個視角，掌握每個月真正的營運結果。
          </p>
        </div>

        <div className="financeHeroActions">
          <div className="financeMonthBadge">
            <span>目前月份</span>
            <strong>{monthLabel}</strong>
          </div>
          <button
            type="button"
            className="financePrivacyButton"
            onClick={() => setAmountsVisible((value) => !value)}
            aria-label={amountsVisible ? "隱藏財務金額" : "顯示財務金額"}
          >
            {amountsVisible ? "◉" : "◎"}
            <span>{amountsVisible ? "隱藏金額" : "顯示金額"}</span>
          </button>
        </div>
      </section>

      <nav className="financeTabs" aria-label="營運財務功能">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "財務總覽" && (
        <>
          <section className="financeMetricGrid">
            {metrics.map((metric) => (
              <article className="financeMetricCard" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{amountsVisible ? metric.value : "••••••"}</strong>
                <small>{metric.note}</small>
              </article>
            ))}
          </section>

          <section className="financeOverviewGrid">
            <article className="financePanel">
              <div className="financePanelHeader">
                <div>
                  <p className="financeEyebrow">REVENUE</p>
                  <h2>學收結構</h2>
                </div>
                <span className="financeStatus">尚未建立本月帳務</span>
              </div>

              <div className="financeEmptyState">
                <div className="financeEmptyMark">$</div>
                <strong>本月還沒有學收資料</strong>
                <p>之後會從學生目前的安親、美語收費設定建立月份快照。</p>
              </div>
            </article>

            <article className="financePanel">
              <div className="financePanelHeader">
                <div>
                  <p className="financeEyebrow">COSTS</p>
                  <h2>成本概況</h2>
                </div>
              </div>

              <div className="financeCostList">
                <div><span>班級直接人事</span><strong>{amountsVisible ? "—" : "••••••"}</strong></div>
                <div><span>行政／共同人事</span><strong>{amountsVisible ? "—" : "••••••"}</strong></div>
                <div><span>營運支出</span><strong>{amountsVisible ? "—" : "••••••"}</strong></div>
              </div>
            </article>
          </section>
        </>
      )}

      {activeTab === "學收管理" && (
        <section className="financeTuitionLayout">
          <div className="financeTuitionMain">
            <section className="financeMonthBuilder">
              <div className="financeMonthBuilderInfo">
                <p className="financeEyebrow">MONTHLY SNAPSHOT</p>
                <h2>建立月份學收</h2>
                <p>
                  將「目前收費基準」複製成指定月份的正式帳務快照。
                  之後修改目前價格，不會回頭改動已建立的月份。
                </p>
              </div>

              <div className="financeMonthBuilderControls">
                <label>
                  <span>帳務月份</span>
                  <input
                    type="month"
                    value={billingMonth}
                    onChange={(event) => setBillingMonth(event.target.value)}
                  />
                </label>

                <div className="financeMonthState">
                  <span>月份狀態</span>
                  <strong
                    className={
                      monthSummary?.monthRecord?.status === "CLOSED"
                        ? "closed"
                        : "open"
                    }
                  >
                    {loadingMonthSummary
                      ? "讀取中…"
                      : monthSummary?.monthRecord?.status === "CLOSED"
                      ? "已結算"
                      : "未結算"}
                  </strong>
                </div>

                <div className="financeMonthState">
                  <span>已建立月帳</span>
                  <strong>
                    {loadingMonthSummary ? "—" : `${monthSummary?.feeCount || 0} 筆`}
                  </strong>
                </div>

                <button
                  type="button"
                  className="financePrimaryButton financeGenerateButton"
                  onClick={handleGenerateMonth}
                  disabled={
                    generatingMonth ||
                    loadingMonthSummary ||
                    monthSummary?.monthRecord?.status === "CLOSED"
                  }
                >
                  {generatingMonth
                    ? "建立中…"
                    : monthSummary?.feeCount > 0
                    ? "補建立未存在學生"
                    : "建立本月學收"}
                </button>
              </div>

              <div className="financeMonthBuilderFoot">
                <span>
                  目前已設定收費：
                  <strong>{feeSummary.configured}</strong> / {feeSummary.total} 位正式學生
                </span>

                {monthMessage && (
                  <span className="financeMonthMessage">{monthMessage}</span>
                )}
              </div>
            </section>

            <section className="financeMiniStats">
              <div><span>正式學生</span><strong>{feeSummary.total}</strong></div>
              <div><span>已設定收費</span><strong>{feeSummary.configured}</strong></div>
              <div><span>安親</span><strong>{feeSummary.childcare}</strong></div>
              <div><span>美語</span><strong>{feeSummary.english}</strong></div>
              <div><span>尚未設定</span><strong>{feeSummary.unset}</strong></div>
            </section>

            <section className="financePanel financeTuitionPanel">
              <div className="financePanelHeader financeTuitionHeader">
                <div>
                  <p className="financeEyebrow">TUITION SETTINGS</p>
                  <h2>目前收費基準</h2>
                  <p className="financePanelHint">
                    這裡只管理學生目前的安親／美語收費設定；每月正式帳務之後會另存快照。
                  </p>
                </div>
              </div>

              <div className="financeToolbar">
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="搜尋姓名、學號或年級"
                />

                <select
                  value={feeFilter}
                  onChange={(event) => setFeeFilter(event.target.value)}
                >
                  <option value="ALL">全部學生</option>
                  <option value="CHILDCARE">有安親收費</option>
                  <option value="ENGLISH">有美語收費</option>
                  <option value="UNSET">尚未設定</option>
                </select>
              </div>

              {loadingStudents ? (
                <div className="financeTableState">正在讀取正式學生與收費設定…</div>
              ) : studentError ? (
                <div className="financeTableState financeTableError">{studentError}</div>
              ) : (
                <div className="financeTableWrap">
                  <table className="financeTuitionTable">
                    <thead>
                      <tr>
                        <th>學生</th>
                        <th>年級</th>
                        <th>安親</th>
                        <th className="number">安親學收</th>
                        <th>美語</th>
                        <th className="number">美語學收</th>
                        <th className="number">目前合計</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => {
                        const setting = student.feeSetting;
                        const childcareAmount = finalFee(
                          setting?.childcare_enabled,
                          setting?.childcare_list_price,
                          setting?.childcare_discount
                        );
                        const englishAmount = finalFee(
                          setting?.english_enabled,
                          setting?.english_list_price,
                          setting?.english_discount
                        );
                        const total = childcareAmount + englishAmount;

                        return (
                          <tr key={student.id}>
                            <td>
                              <div className="financeStudentCell">
                                <strong>{student.chinese_name}</strong>
                                <span>{student.student_no || "—"}</span>
                              </div>
                            </td>
                            <td>{student.current_grade || "—"}</td>
                            <td>
                              <span className={setting?.childcare_enabled ? "financeFeeBadge on" : "financeFeeBadge"}>
                                {setting?.childcare_enabled ? "收費中" : "未設定"}
                              </span>
                            </td>
                            <td className="number">
                              {amountsVisible ? money(childcareAmount) : "••••••"}
                            </td>
                            <td>
                              <span className={setting?.english_enabled ? "financeFeeBadge on" : "financeFeeBadge"}>
                                {setting?.english_enabled ? "收費中" : "未設定"}
                              </span>
                            </td>
                            <td className="number">
                              {amountsVisible ? money(englishAmount) : "••••••"}
                            </td>
                            <td className="number financeTotalCell">
                              {amountsVisible ? money(total) : "••••••"}
                            </td>
                            <td className="financeRowActionCell">
                              <button type="button" onClick={() => openFeeEditor(student)}>
                                設定
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredStudents.length === 0 && (
                        <tr>
                          <td colSpan="8" className="financeNoRows">
                            沒有符合目前條件的學生。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className={`financeFeeEditor ${selectedStudent ? "open" : ""}`}>
            {selectedStudent ? (
              <>
                <div className="financeFeeEditorHeader">
                  <div>
                    <p className="financeEyebrow">CURRENT PRICING</p>
                    <h2>{selectedStudent.chinese_name}</h2>
                    <span>
                      {selectedStudent.student_no || "—"} · {selectedStudent.current_grade || "—"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="financeEditorClose"
                    onClick={() => setSelectedStudent(null)}
                    aria-label="關閉收費設定"
                  >
                    ×
                  </button>
                </div>

                <div className="financeFeeSection">
                  <label className="financeFeeToggle">
                    <input
                      type="checkbox"
                      checked={feeForm.childcare_enabled}
                      onChange={(event) => updateForm("childcare_enabled", event.target.checked)}
                    />
                    <span>
                      <strong>安親收費</strong>
                      <small>啟用後會納入月份學收</small>
                    </span>
                  </label>

                  <div className="financeFormGrid">
                    <label>
                      <span>原價</span>
                      <input
                        type={amountsVisible ? "number" : "password"}
                        inputMode="numeric"
                        min="0"
                        value={feeForm.childcare_list_price}
                        onChange={(event) => updateForm("childcare_list_price", event.target.value)}
                        disabled={!feeForm.childcare_enabled}
                      />
                    </label>
                    <label>
                      <span>折扣金額</span>
                      <input
                        type={amountsVisible ? "number" : "password"}
                        inputMode="numeric"
                        min="0"
                        value={feeForm.childcare_discount}
                        onChange={(event) => updateForm("childcare_discount", event.target.value)}
                        disabled={!feeForm.childcare_enabled}
                      />
                    </label>
                  </div>

                  <label className="financeFullField">
                    <span>折扣原因</span>
                    <select
                      value={feeForm.childcare_discount_reason}
                      onChange={(event) => updateForm("childcare_discount_reason", event.target.value)}
                      disabled={!feeForm.childcare_enabled}
                    >
                      {DISCOUNT_REASONS.map((reason) => (
                        <option key={reason || "none"} value={reason}>
                          {reason || "未選擇"}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="financeFullField">
                    <span>折扣備註</span>
                    <input
                      type="text"
                      value={feeForm.childcare_discount_note}
                      onChange={(event) => updateForm("childcare_discount_note", event.target.value)}
                      placeholder="可留空"
                      disabled={!feeForm.childcare_enabled}
                    />
                  </label>

                  <div className="financeFeeFinal">
                    <span>安親目前學收</span>
                    <strong>{amountsVisible ? money(childcareFinal) : "••••••"}</strong>
                  </div>
                </div>

                <div className="financeFeeSection">
                  <label className="financeFeeToggle">
                    <input
                      type="checkbox"
                      checked={feeForm.english_enabled}
                      onChange={(event) => updateForm("english_enabled", event.target.checked)}
                    />
                    <span>
                      <strong>美語收費</strong>
                      <small>啟用後會納入月份學收</small>
                    </span>
                  </label>

                  <div className="financeFormGrid">
                    <label>
                      <span>原價</span>
                      <input
                        type={amountsVisible ? "number" : "password"}
                        inputMode="numeric"
                        min="0"
                        value={feeForm.english_list_price}
                        onChange={(event) => updateForm("english_list_price", event.target.value)}
                        disabled={!feeForm.english_enabled}
                      />
                    </label>
                    <label>
                      <span>折扣金額</span>
                      <input
                        type={amountsVisible ? "number" : "password"}
                        inputMode="numeric"
                        min="0"
                        value={feeForm.english_discount}
                        onChange={(event) => updateForm("english_discount", event.target.value)}
                        disabled={!feeForm.english_enabled}
                      />
                    </label>
                  </div>

                  <label className="financeFullField">
                    <span>折扣原因</span>
                    <select
                      value={feeForm.english_discount_reason}
                      onChange={(event) => updateForm("english_discount_reason", event.target.value)}
                      disabled={!feeForm.english_enabled}
                    >
                      {DISCOUNT_REASONS.map((reason) => (
                        <option key={reason || "none"} value={reason}>
                          {reason || "未選擇"}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="financeFullField">
                    <span>折扣備註</span>
                    <input
                      type="text"
                      value={feeForm.english_discount_note}
                      onChange={(event) => updateForm("english_discount_note", event.target.value)}
                      placeholder="可留空"
                      disabled={!feeForm.english_enabled}
                    />
                  </label>

                  <div className="financeFeeFinal">
                    <span>美語目前學收</span>
                    <strong>{amountsVisible ? money(englishFinal) : "••••••"}</strong>
                  </div>
                </div>

                <div className="financeFeeEditorFooter">
                  <div className="financeEditorGrandTotal">
                    <span>目前合計</span>
                    <strong>
                      {amountsVisible
                        ? money(childcareFinal + englishFinal)
                        : "••••••"}
                    </strong>
                  </div>

                  {saveMessage && (
                    <p className="financeSaveMessage">{saveMessage}</p>
                  )}

                  <button
                    type="button"
                    className="financePrimaryButton"
                    onClick={handleSaveFee}
                    disabled={savingFee}
                  >
                    {savingFee ? "儲存中…" : "儲存目前收費基準"}
                  </button>
                </div>
              </>
            ) : (
              <div className="financeEditorPlaceholder">
                <div className="financeEmptyMark">$</div>
                <strong>選擇一位學生</strong>
                <p>從左側名單點「設定」，即可管理目前的安親與美語收費基準。</p>
              </div>
            )}
          </aside>
        </section>
      )}

      {activeTab !== "財務總覽" && activeTab !== "學收管理" && (
        <section className="financePanel financeComingSoon">
          <p className="financeEyebrow">{activeTab}</p>
          <h2>{activeTab}</h2>
          <p>頁面骨架已建立，下一階段再接上實際資料與操作功能。</p>
        </section>
      )}
    </div>
  );
}

export default FinancePage;
