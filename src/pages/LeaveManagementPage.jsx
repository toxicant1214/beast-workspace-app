import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createExternalStaff,
  createLeaveRecord,
  deleteLeaveRecord,
  formatLeaveHours,
  getActiveTeachers,
  getExternalStaff,
  getLeaveRecords,
  getLeaveTypes,
  importLeaveCsvRows,
  updateLeaveRecord,
} from "../services/leaveService";

import {
  formatCsvLeaveHours,
  getCsvPreviewSummary,
  matchLeaveCsvRows,
  parseLeaveCsvFile,
  updateLeaveCsvPreviewRow,
} from "../services/leaveCsvService";

import {
  buildMonthlyLeaveReport,
  getCurrentMonthString,
  getMonthLabel,
} from "../services/leaveReportService";

import "./LeaveManagementPage.css";


const TABS = [
  {
    key: "overview",
    label: "休假總覽",
  },
  {
    key: "records",
    label: "休假登記",
  },
  {
    key: "monthly",
    label: "月報表",
  },
  {
    key: "settings",
    label: "假別／額度設定",
  },
];


function getTodayString() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getTeacherName(
  teacher
) {
  return (
    teacher?.chinese_name ||
    teacher?.english_name ||
    "未命名老師"
  );
}


function getRecordPersonName(
  record
) {
  if (record?.teachers) {
    return getTeacherName(
      record.teachers
    );
  }

  if (
    record?.leave_external_staff
  ) {
    return (
      record
        .leave_external_staff
        .name ||
      "未命名人員"
    );
  }

  return "未知人員";
}



function shiftMonthString(
  monthKey,
  delta
) {
  const [
    yearText,
    monthText,
  ] =
    String(monthKey).split("-");

  const date =
    new Date(
      Number(yearText),
      Number(monthText) - 1 + delta,
      1
    );

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}


function formatDateTimeForReport(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  const hour =
    String(
      date.getHours()
    ).padStart(2, "0");

  const minute =
    String(
      date.getMinutes()
    ).padStart(2, "0");

  return `${month}/${day} ${hour}:${minute}`;
}


function LeaveManagementPage() {
  const [
    activeTab,
    setActiveTab,
  ] = useState("overview");

  const [
    teachers,
    setTeachers,
  ] = useState([]);

  const [
    externalStaff,
    setExternalStaff,
  ] = useState([]);

  const [
    leaveTypes,
    setLeaveTypes,
  ] = useState([]);

  const [
    records,
    setRecords,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    addingExternalStaff,
    setAddingExternalStaff,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    showForm,
    setShowForm,
  ] = useState(false);

  const [
    editingRecord,
    setEditingRecord,
  ] = useState(null);

  const [
    showExternalForm,
    setShowExternalForm,
  ] = useState(false);

  const [
    externalForm,
    setExternalForm,
  ] = useState({
    name: "",
    department: "",
  });


  const [
    showCsvPreview,
    setShowCsvPreview,
  ] = useState(false);

  const [
    csvFileName,
    setCsvFileName,
  ] = useState("");

  const [
    csvRows,
    setCsvRows,
  ] = useState([]);

  const [
    csvLoading,
    setCsvLoading,
  ] = useState(false);

  const [
    csvImporting,
    setCsvImporting,
  ] = useState(false);

  const [
    csvImportError,
    setCsvImportError,
  ] = useState("");


  const [
    editingCsvRow,
    setEditingCsvRow,
  ] = useState(null);

  const [
    csvEditForm,
    setCsvEditForm,
  ] = useState({
    personName: "",
    leaveTypeName: "",
    startValue: "",
    endValue: "",
    leaveReason: "",
  });


  const [
    reportMonth,
    setReportMonth,
  ] = useState(
    getCurrentMonthString()
  );

  const [
    overviewMonth,
    setOverviewMonth,
  ] = useState(
    getCurrentMonthString()
  );

  const [
    overviewPerson,
    setOverviewPerson,
  ] = useState("all");

  const [
    expandedRecordMonths,
    setExpandedRecordMonths,
  ] = useState([]);


  const csvInputRef =
    useRef(null);


  const today =
    getTodayString();


  const [
    form,
    setForm,
  ] = useState({
    personValue: "",
    leaveTypeId: "",
    startDate: today,
    endDate: today,
    inputUnit: "DAY",
    inputValue: "1",
    isLastMinute: false,
    note: "",
  });


  async function loadData() {
    try {
      setLoading(true);
      setErrorMessage("");

      const [
        teacherRows,
        externalRows,
        leaveTypeRows,
        leaveRecordRows,
      ] = await Promise.all([
        getActiveTeachers(),
        getExternalStaff(),
        getLeaveTypes(),
        getLeaveRecords(),
      ]);

      setTeachers(
        teacherRows
      );

      setExternalStaff(
        externalRows
      );

      setLeaveTypes(
        leaveTypeRows
      );

      setRecords(
        leaveRecordRows
      );
    } catch (error) {
      console.error(
        "讀取休假資料失敗：",
        error
      );

      setErrorMessage(
        error?.message ||
        "休假資料讀取失敗。"
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadData();
  }, []);


  const activeExternalStaff =
    useMemo(
      () =>
        externalStaff.filter(
          (person) =>
            person.is_active
        ),
      [externalStaff]
    );


  const csvSummary =
    useMemo(
      () =>
        getCsvPreviewSummary(
          csvRows
        ),
      [csvRows]
    );


  const csvImportableCount =
    useMemo(
      () =>
        csvRows.filter(
          (row) =>
            row.errors.length === 0
        ).length,
      [csvRows]
    );


  const monthlyReport =
    useMemo(
      () =>
        buildMonthlyLeaveReport({
          records,
          month:
            reportMonth,
          teachers,
        }),
      [
        records,
        reportMonth,
        teachers,
      ]
    );


  const groupedRecordMonths =
    useMemo(() => {
      const groups = new Map();

      records.forEach((record) => {
        const monthKey =
          String(record.start_date || "")
            .slice(0, 7);

        if (!monthKey) {
          return;
        }

        if (!groups.has(monthKey)) {
          groups.set(monthKey, []);
        }

        groups.get(monthKey).push(record);
      });

      return Array.from(
        groups.entries()
      )
        .sort(
          ([monthA], [monthB]) =>
            monthB.localeCompare(monthA)
        )
        .map(
          ([monthKey, monthRecords]) => ({
            monthKey,
            label:
              getMonthLabel(monthKey),
            records:
              [...monthRecords].sort(
                (a, b) =>
                  String(b.start_date || "")
                    .localeCompare(
                      String(a.start_date || "")
                    )
              ),
          })
        );
    }, [records]);


  function toggleRecordMonth(
    monthKey
  ) {
    setExpandedRecordMonths(
      (current) =>
        current.includes(monthKey)
          ? current.filter(
              (item) =>
                item !== monthKey
            )
          : [
              ...current,
              monthKey,
            ]
    );
  }


  function updateForm(
    field,
    value
  ) {
    setForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }


  function resetForm() {
    setForm({
      personValue: "",
      leaveTypeId: "",
      startDate: today,
      endDate: today,
      inputUnit: "DAY",
      inputValue: "1",
      isLastMinute: false,
      note: "",
    });

    setExternalForm({
      name: "",
      department: "",
    });

    setShowExternalForm(false);
    setErrorMessage("");
    setSuccessMessage("");
  }


  function handleOpenForm() {
    setEditingRecord(null);
    resetForm();
    setShowForm(true);
  }


  function handleEditRecord(
    record
  ) {
    const personValue =
      record.teacher_id
        ? `teacher:${record.teacher_id}`
        : `external:${record.external_staff_id}`;

    setEditingRecord(
      record
    );

    setForm({
      personValue,
      leaveTypeId:
        record.leave_type_id || "",
      startDate:
        record.start_date,
      endDate:
        record.end_date,
      inputUnit:
        record.input_unit ||
        "HOUR",
      inputValue:
        String(
          record.input_value ||
          ""
        ),
      isLastMinute:
        Boolean(
          record.is_last_minute
        ),
      note:
        record.note || "",
    });

    setExternalForm({
      name: "",
      department: "",
    });

    setShowExternalForm(false);
    setErrorMessage("");
    setSuccessMessage("");
    setShowForm(true);
  }


  function handleCloseForm() {
    if (
      saving ||
      addingExternalStaff
    ) {
      return;
    }

    setShowForm(false);
    setEditingRecord(null);
    resetForm();
  }


  async function handleAddExternalStaff() {
    try {
      setAddingExternalStaff(
        true
      );

      setErrorMessage("");

      const newPerson =
        await createExternalStaff({
          name:
            externalForm.name,
          department:
            externalForm.department,
        });

      setExternalStaff(
        (current) => [
          ...current,
          newPerson,
        ]
      );

      setForm(
        (current) => ({
          ...current,
          personValue:
            `external:${newPerson.id}`,
        })
      );

      setExternalForm({
        name: "",
        department: "",
      });

      setShowExternalForm(
        false
      );
    } catch (error) {
      console.error(
        "新增其他人員失敗：",
        error
      );

      setErrorMessage(
        error?.message ||
        "新增其他人員失敗。"
      );
    } finally {
      setAddingExternalStaff(
        false
      );
    }
  }


  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const [
        personType,
        personId,
      ] =
        form.personValue.split(
          ":"
        );

      const recordPayload = {
        personType,
        personId,
        leaveTypeId:
          form.leaveTypeId,
        startDate:
          form.startDate,
        endDate:
          form.endDate,
        inputUnit:
          form.inputUnit,
        inputValue:
          form.inputValue,
        isLastMinute:
          form.isLastMinute,
        note:
          form.note,
      };


      if (editingRecord) {
        await updateLeaveRecord(
          editingRecord.id,
          recordPayload
        );
      } else {
        await createLeaveRecord(
          recordPayload
        );
      }


      await loadData();


      setSuccessMessage(
        editingRecord
          ? "休假紀錄已修改。"
          : "休假紀錄已新增。"
      );


      setShowForm(false);
      setEditingRecord(null);

      setForm({
        personValue: "",
        leaveTypeId: "",
        startDate: today,
        endDate: today,
        inputUnit: "DAY",
        inputValue: "1",
        isLastMinute: false,
        note: "",
      });
    } catch (error) {
      console.error(
        editingRecord
          ? "修改休假紀錄失敗："
          : "新增休假紀錄失敗：",
        error
      );

      setErrorMessage(
        error?.message ||
        (
          editingRecord
            ? "修改休假紀錄失敗。"
            : "新增休假紀錄失敗。"
        )
      );
    } finally {
      setSaving(false);
    }
  }


  async function handleDelete(
    record
  ) {
    const personName =
      getRecordPersonName(
        record
      );

    const confirmed =
      window.confirm(
        `確定要刪除 ${personName} 的這筆休假紀錄嗎？`
      );

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");
      setSuccessMessage("");

      await deleteLeaveRecord(
        record.id
      );

      await loadData();

      setSuccessMessage(
        "休假紀錄已刪除。"
      );
    } catch (error) {
      console.error(
        "刪除休假紀錄失敗：",
        error
      );

      setErrorMessage(
        error?.message ||
        "刪除休假紀錄失敗。"
      );
    }
  }


  function handleOpenCsvPicker() {
    setErrorMessage("");
    setSuccessMessage("");
    setCsvImportError("");

    if (
      csvInputRef.current
    ) {
      csvInputRef.current.value =
        "";

      csvInputRef.current.click();
    }
  }


  async function handleCsvFileChange(
    event
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setCsvLoading(true);
      setErrorMessage("");
      setCsvImportError("");

      const parsedRows =
        await parseLeaveCsvFile(
          file
        );

      const matchedRows =
        matchLeaveCsvRows({
          rows:
            parsedRows,
          teachers,
          externalStaff,
          leaveTypes,
        });

      setCsvFileName(
        file.name
      );

      setCsvRows(
        matchedRows
      );

      setShowCsvPreview(
        true
      );
    } catch (error) {
      console.error(
        "CSV 讀取失敗：",
        error
      );

      setErrorMessage(
        error?.message ||
        "CSV 讀取失敗。"
      );
    } finally {
      setCsvLoading(false);
    }
  }


  function handleCloseCsvPreview() {
    if (csvImporting) {
      return;
    }

    setShowCsvPreview(
      false
    );

    setCsvRows([]);
    setCsvFileName("");
    setCsvImportError("");
    setEditingCsvRow(null);

    if (
      csvInputRef.current
    ) {
      csvInputRef.current.value =
        "";
    }
  }


  function handleOpenCsvEdit(
    row
  ) {
    setEditingCsvRow(
      row
    );

    setCsvEditForm({
      personName:
        row.personName || "",

      leaveTypeName:
        row.leaveTypeName || "",

      startValue:
        row.start?.inputValue ||
        "",

      endValue:
        row.end?.inputValue ||
        "",

      leaveReason:
        row.leaveReason || "",
    });
  }


  function handleCloseCsvEdit() {
    setEditingCsvRow(
      null
    );

    setCsvEditForm({
      personName: "",
      leaveTypeName: "",
      startValue: "",
      endValue: "",
      leaveReason: "",
    });
  }


  function updateCsvEditForm(
    field,
    value
  ) {
    setCsvEditForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }


  function handleSaveCsvEdit() {
    if (!editingCsvRow) {
      return;
    }


    const updatedRow =
      updateLeaveCsvPreviewRow({
        originalRow:
          editingCsvRow,

        personName:
          csvEditForm.personName,

        leaveTypeName:
          csvEditForm.leaveTypeName,

        leaveReason:
          csvEditForm.leaveReason,

        startValue:
          csvEditForm.startValue,

        endValue:
          csvEditForm.endValue,

        teachers,

        externalStaff,

        leaveTypes,
      });


    setCsvRows(
      (current) =>
        current.map(
          (row) =>
            row.rowNumber ===
            editingCsvRow.rowNumber
              ? updatedRow
              : row
        )
    );


    handleCloseCsvEdit();
  }


  async function handleConfirmCsvImport() {
    if (
      csvImporting ||
      csvImportableCount === 0
    ) {
      return;
    }

    try {
      setCsvImporting(
        true
      );

      setCsvImportError("");
      setErrorMessage("");
      setSuccessMessage("");


      const result =
        await importLeaveCsvRows(
          csvRows
        );


      await loadData();


      const summaryParts = [];


      summaryParts.push(
        `成功匯入 ${result.imported} 筆`
      );


      if (
        result.skippedDuplicate >
        0
      ) {
        summaryParts.push(
          `重複跳過 ${result.skippedDuplicate} 筆`
        );
      }


      if (
        result.skippedError >
        0
      ) {
        summaryParts.push(
          `異常跳過 ${result.skippedError} 筆`
        );
      }


      if (
        result.createdExternal >
        0
      ) {
        summaryParts.push(
          `新增其他人員 ${result.createdExternal} 位`
        );
      }


      if (
        result.failed.length >
        0
      ) {
        summaryParts.push(
          `匯入失敗 ${result.failed.length} 筆`
        );
      }


      setSuccessMessage(
        `${summaryParts.join(
          "・"
        )}。`
      );


      if (
        result.failed.length >
        0
      ) {
        setCsvImportError(
          result.failed
            .map(
              (item) =>
                `第 ${item.rowNumber} 列 ${item.personName}：${item.message}`
            )
            .join("\n")
        );

        return;
      }


      setShowCsvPreview(
        false
      );

      setCsvRows([]);
      setCsvFileName("");
      setEditingCsvRow(null);


      if (
        csvInputRef.current
      ) {
        csvInputRef.current.value =
          "";
      }
    } catch (error) {
      console.error(
        "CSV 匯入失敗：",
        error
      );

      setCsvImportError(
        error?.message ||
        "CSV 匯入失敗。"
      );
    } finally {
      setCsvImporting(
        false
      );
    }
  }


  const overviewMonthOptions =
    useMemo(() => {
      const months = new Set([
        getCurrentMonthString(),
      ]);

      records.forEach((record) => {
        const monthKey =
          String(
            record.start_date || ""
          ).slice(0, 7);

        if (monthKey) {
          months.add(monthKey);
        }
      });

      return Array.from(months)
        .sort((a, b) =>
          b.localeCompare(a)
        );
    }, [records]);


  const overviewPersonOptions =
    useMemo(() => {
      const options = [];

      teachers.forEach((teacher) => {
        options.push({
          value:
            `teacher:${teacher.id}`,
          label:
            getTeacherName(teacher),
          group:
            "Workspace 老師",
        });
      });

      activeExternalStaff.forEach(
        (person) => {
          options.push({
            value:
              `external:${person.id}`,
            label:
              person.department
                ? `${person.name}｜${person.department}`
                : person.name,
            group:
              "其他人員",
          });
        }
      );

      return options;
    }, [
      teachers,
      activeExternalStaff,
    ]);


  function recordMatchesOverviewPerson(
    record
  ) {
    if (
      overviewPerson === "all"
    ) {
      return true;
    }

    const [
      personType,
      personId,
    ] =
      overviewPerson.split(":");

    if (
      personType === "teacher"
    ) {
      return (
        String(
          record.teacher_id || ""
        ) === String(personId)
      );
    }

    return (
      String(
        record.external_staff_id || ""
      ) === String(personId)
    );
  }


  function getSemesterRange(
    monthKey
  ) {
    const [
      yearText,
      monthText,
    ] =
      String(monthKey).split("-");

    const year =
      Number(yearText);

    const month =
      Number(monthText);

    if (
      !year ||
      !month
    ) {
      return null;
    }

    if (
      month >= 8
    ) {
      return {
        start:
          `${year}-08`,
        end:
          `${year + 1}-01`,
        label:
          `${year} 年 8 月～${year + 1} 年 1 月`,
      };
    }

    if (
      month === 1
    ) {
      return {
        start:
          `${year - 1}-08`,
        end:
          `${year}-01`,
        label:
          `${year - 1} 年 8 月～${year} 年 1 月`,
      };
    }

    return {
      start:
        `${year}-02`,
      end:
        `${year}-07`,
      label:
        `${year} 年 2 月～${year} 年 7 月`,
    };
  }


  const overviewStats =
    useMemo(() => {
      const selectedMonthRecords =
        records.filter((record) => {
          const recordMonth =
            String(
              record.start_date || ""
            ).slice(0, 7);

          return (
            recordMonth ===
              overviewMonth &&
            recordMatchesOverviewPerson(
              record
            )
          );
        });

      const semester =
        getSemesterRange(
          overviewMonth
        );

      const semesterRecords =
        semester
          ? records.filter(
              (record) => {
                const recordMonth =
                  String(
                    record.start_date ||
                      ""
                  ).slice(0, 7);

                return (
                  recordMonth >=
                    semester.start &&
                  recordMonth <=
                    semester.end &&
                  recordMatchesOverviewPerson(
                    record
                  )
                );
              }
            )
          : [];

      const sumHours =
        (rows) =>
          rows.reduce(
            (total, record) =>
              total +
              Number(
                record.leave_hours ||
                  0
              ),
            0
          );

      return {
        selectedMonthRecords:
          [...selectedMonthRecords]
            .sort(
              (a, b) =>
                String(
                  b.start_date ||
                    ""
                ).localeCompare(
                  String(
                    a.start_date ||
                      ""
                  )
                )
            ),

        monthHours:
          sumHours(
            selectedMonthRecords
          ),

        monthLastMinuteCount:
          selectedMonthRecords.filter(
            (record) =>
              record.is_last_minute
          ).length,

        semesterHours:
          sumHours(
            semesterRecords
          ),

        semesterLastMinuteCount:
          semesterRecords.filter(
            (record) =>
              record.is_last_minute
          ).length,

        semester,
      };
    }, [
      records,
      overviewMonth,
      overviewPerson,
    ]);


  function renderOverview() {
    const selectedPersonLabel =
      overviewPerson === "all"
        ? "全部人員"
        : overviewPersonOptions.find(
            (option) =>
              option.value ===
              overviewPerson
          )?.label ||
          "指定人員";

    return (
      <section className="leave-section">
        <div className="leave-overview-heading">
          <div>
            <h2>
              休假總覽
            </h2>

            <p>
              依月份與人員快速查看休假狀況。
            </p>
          </div>

          <div className="leave-overview-filters">
            <label className="leave-overview-filter">
              <span>
                查看月份
              </span>

              <select
                value={
                  overviewMonth
                }
                onChange={(
                  event
                ) =>
                  setOverviewMonth(
                    event.target.value
                  )
                }
              >
                {overviewMonthOptions.map(
                  (monthKey) => (
                    <option
                      key={
                        monthKey
                      }
                      value={
                        monthKey
                      }
                    >
                      {
                        getMonthLabel(
                          monthKey
                        )
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="leave-overview-filter">
              <span>
                查看人員
              </span>

              <select
                value={
                  overviewPerson
                }
                onChange={(
                  event
                ) =>
                  setOverviewPerson(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  全部人員
                </option>

                <optgroup label="Workspace 老師">
                  {overviewPersonOptions
                    .filter(
                      (option) =>
                        option.group ===
                        "Workspace 老師"
                    )
                    .map(
                      (option) => (
                        <option
                          key={
                            option.value
                          }
                          value={
                            option.value
                          }
                        >
                          {
                            option.label
                          }
                        </option>
                      )
                    )}
                </optgroup>

                {overviewPersonOptions.some(
                  (option) =>
                    option.group ===
                    "其他人員"
                ) && (
                  <optgroup label="其他人員">
                    {overviewPersonOptions
                      .filter(
                        (option) =>
                          option.group ===
                          "其他人員"
                      )
                      .map(
                        (option) => (
                          <option
                            key={
                              option.value
                            }
                            value={
                              option.value
                            }
                          >
                            {
                              option.label
                            }
                          </option>
                        )
                      )}
                  </optgroup>
                )}
              </select>
            </label>
          </div>
        </div>


        <div className="leave-overview-context">
          <strong>
            {selectedPersonLabel}
          </strong>

          <span>
            {getMonthLabel(
              overviewMonth
            )}
          </span>

          {overviewStats.semester && (
            <small>
              同學期：
              {
                overviewStats
                  .semester
                  .label
              }
            </small>
          )}
        </div>


        <div className="leave-summary-grid">
          <div className="leave-summary-card">
            <span>
              所選月份休假時數
            </span>

            <strong>
              {
                formatLeaveHours(
                  overviewStats
                    .monthHours
                )
              }
            </strong>

            <small>
              {
                overviewStats
                  .selectedMonthRecords
                  .length
              }
              次
            </small>
          </div>

          <div className="leave-summary-card">
            <span>
              所選月份臨時假
            </span>

            <strong>
              {
                overviewStats
                  .monthLastMinuteCount
              }
            </strong>

            <small>
              次
            </small>
          </div>

          <div className="leave-summary-card">
            <span>
              同學期休假時數
            </span>

            <strong>
              {
                formatLeaveHours(
                  overviewStats
                    .semesterHours
                )
              }
            </strong>

            <small>
              {
                overviewStats
                  .semester
                  ?.label || "—"
              }
            </small>
          </div>

          <div className="leave-summary-card">
            <span>
              同學期臨時假
            </span>

            <strong>
              {
                overviewStats
                  .semesterLastMinuteCount
              }
            </strong>

            <small>
              次
            </small>
          </div>
        </div>


        <div className="leave-overview-records-card">
          <div className="leave-overview-records-heading">
            <div>
              <strong>
                休假紀錄
              </strong>

              <span>
                {
                  getMonthLabel(
                    overviewMonth
                  )
                }
                ・
                {
                  selectedPersonLabel
                }
              </span>
            </div>

            <span>
              {
                overviewStats
                  .selectedMonthRecords
                  .length
              }
              筆
            </span>
          </div>

          {overviewStats
            .selectedMonthRecords
            .length === 0 ? (
            <div className="leave-overview-empty">
              這個條件目前沒有休假紀錄。
            </div>
          ) : (
            <div className="leave-record-table-wrap">
              <table className="leave-record-table">
                <thead>
                  <tr>
                    <th>人員</th>
                    <th>假別</th>
                    <th>日期</th>
                    <th>時數</th>
                    <th>臨時請假</th>
                    <th>原因／備註</th>
                  </tr>
                </thead>

                <tbody>
                  {overviewStats
                    .selectedMonthRecords
                    .map(
                      (record) => (
                        <tr
                          key={
                            record.id
                          }
                        >
                          <td>
                            <strong>
                              {
                                getRecordPersonName(
                                  record
                                )
                              }
                            </strong>

                            {record
                              .leave_external_staff
                              ?.department && (
                              <small>
                                {
                                  record
                                    .leave_external_staff
                                    .department
                                }
                              </small>
                            )}
                          </td>

                          <td>
                            {
                              record
                                .leave_types
                                ?.name ||
                              "—"
                            }
                          </td>

                          <td>
                            {record.start_date ===
                            record.end_date
                              ? record.start_date
                              : `${record.start_date} ～ ${record.end_date}`}
                          </td>

                          <td>
                            {
                              formatLeaveHours(
                                record.leave_hours
                              )
                            }
                          </td>

                          <td>
                            {record.is_last_minute
                              ? "是"
                              : "—"}
                          </td>

                          <td>
                            {record.leave_reason ||
                              record.note ||
                              "—"}
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  }


  function renderRecords() {
    return (
      <section className="leave-section">
        <div className="leave-records-heading">
          <div>
            <h2>
              休假登記
            </h2>

            <p>
              可手動新增，
              也可以直接匯入每月 CSV 清單。
            </p>
          </div>


          <div className="leave-record-toolbar">
            <input
              ref={
                csvInputRef
              }
              className="leave-hidden-file-input"
              type="file"
              accept=".csv,text/csv"
              onChange={
                handleCsvFileChange
              }
            />

            <button
              type="button"
              className="leave-secondary-button"
              onClick={
                handleOpenCsvPicker
              }
              disabled={
                csvLoading
              }
            >
              {csvLoading
                ? "讀取中…"
                : "匯入 CSV"}
            </button>

            <button
              type="button"
              className="leave-primary-button"
              onClick={
                handleOpenForm
              }
            >
              ＋ 新增休假
            </button>
          </div>
        </div>


        {successMessage && (
          <div className="leave-message leave-message--success">
            {successMessage}
          </div>
        )}


        {errorMessage &&
          !showForm &&
          !showCsvPreview && (
          <div className="leave-message leave-message--error">
            {errorMessage}
          </div>
        )}


        {loading ? (
          <div className="leave-placeholder">
            <strong>
              讀取中…
            </strong>

            <p>
              正在讀取休假資料。
            </p>
          </div>
        ) : records.length ===
          0 ? (
          <div className="leave-empty-state">
            <div className="leave-empty-state__icon">
              ◷
            </div>

            <strong>
              還沒有休假紀錄
            </strong>

            <p>
              可以手動新增，
              也可以直接匯入每月 CSV。
            </p>

            <div className="leave-empty-actions">
              <button
                type="button"
                className="leave-secondary-button"
                onClick={
                  handleOpenCsvPicker
                }
              >
                匯入 CSV
              </button>

              <button
                type="button"
                className="leave-primary-button"
                onClick={
                  handleOpenForm
                }
              >
                ＋ 新增休假
              </button>
            </div>
          </div>
        ) : (
          <div className="leave-record-month-folders">
            {groupedRecordMonths.map(
              (group) => {
                const isExpanded =
                  expandedRecordMonths.includes(
                    group.monthKey
                  );

                return (
                  <section
                    className={
                      isExpanded
                        ? "leave-record-month-folder is-open"
                        : "leave-record-month-folder"
                    }
                    key={
                      group.monthKey
                    }
                  >
                    <button
                      type="button"
                      className="leave-record-month-folder__header"
                      onClick={() =>
                        toggleRecordMonth(
                          group.monthKey
                        )
                      }
                    >
                      <div>
                        <span className="leave-record-month-folder__caret">
                          {isExpanded
                            ? "⌄"
                            : "›"}
                        </span>

                        <strong>
                          {group.label}
                        </strong>
                      </div>

                      <span className="leave-record-month-folder__count">
                        {group.records.length} 筆
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="leave-record-table-wrap">
                        <table className="leave-record-table">
                          <thead>
                            <tr>
                              <th>人員</th>
                              <th>假別</th>
                              <th>日期</th>
                              <th>時數</th>
                              <th>臨時請假</th>
                              <th>原因／備註</th>
                              <th />
                            </tr>
                          </thead>

                          <tbody>
                            {group.records.map(
                              (record) => (
                                <tr
                                  key={
                                    record.id
                                  }
                                >
                                  <td>
                                    <strong>
                                      {
                                        getRecordPersonName(
                                          record
                                        )
                                      }
                                    </strong>

                                    {record
                                      .leave_external_staff
                                      ?.department && (
                                      <small>
                                        {
                                          record
                                            .leave_external_staff
                                            .department
                                        }
                                      </small>
                                    )}
                                  </td>

                                  <td>
                                    {
                                      record
                                        .leave_types
                                        ?.name ||
                                      "—"
                                    }
                                  </td>

                                  <td>
                                    {record.start_date ===
                                    record.end_date
                                      ? record.start_date
                                      : `${record.start_date} ～ ${record.end_date}`}
                                  </td>

                                  <td>
                                    {
                                      formatLeaveHours(
                                        record.leave_hours
                                      )
                                    }
                                  </td>

                                  <td>
                                    {record.is_last_minute
                                      ? "是"
                                      : "—"}
                                  </td>

                                  <td>
                                    {record.leave_reason ||
                                      record.note ||
                                      "—"}
                                  </td>

                                  <td>
                                    <div className="leave-row-actions">
                                      <button
                                        type="button"
                                        className="leave-edit-button"
                                        onClick={() =>
                                          handleEditRecord(
                                            record
                                          )
                                        }
                                      >
                                        修改
                                      </button>

                                      <button
                                        type="button"
                                        className="leave-delete-button"
                                        onClick={() =>
                                          handleDelete(
                                            record
                                          )
                                        }
                                      >
                                        刪除
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              }
            )}
          </div>
        )}


        {showForm && (
          <div
            className="leave-modal-backdrop"
            onMouseDown={
              handleCloseForm
            }
          >
            <div
              className="leave-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="leave-modal-header">
                <div>
                  <span>
                    LEAVE RECORD
                  </span>

                  <h3>
                    {editingRecord
                      ? "修改休假"
                      : "新增休假"}
                  </h3>
                </div>

                <button
                  type="button"
                  className="leave-modal-close"
                  onClick={
                    handleCloseForm
                  }
                  disabled={
                    saving ||
                    addingExternalStaff
                  }
                >
                  ×
                </button>
              </div>


              <form
                className="leave-form"
                onSubmit={
                  handleSubmit
                }
              >
                <div className="leave-field leave-field--full">
                  <div className="leave-field-heading">
                    <span>
                      請假人員
                    </span>

                    {!editingRecord && (
                      <button
                        type="button"
                        className="leave-inline-add-button"
                        onClick={() =>
                          setShowExternalForm(
                            (
                              current
                            ) =>
                              !current
                          )
                        }
                      >
                        ＋ 其他人員
                      </button>
                    )}
                  </div>

                  <select
                    value={
                      form.personValue
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "personValue",
                        event.target
                          .value
                      )
                    }
                    required
                  >
                    <option value="">
                      請選擇人員
                    </option>


                    {teachers.length >
                      0 && (
                      <optgroup label="Workspace 老師">
                        {teachers.map(
                          (
                            teacher
                          ) => (
                            <option
                              key={
                                teacher.id
                              }
                              value={`teacher:${teacher.id}`}
                            >
                              {
                                getTeacherName(
                                  teacher
                                )
                              }
                            </option>
                          )
                        )}
                      </optgroup>
                    )}


                    {activeExternalStaff.length >
                      0 && (
                      <optgroup label="其他人員">
                        {activeExternalStaff.map(
                          (
                            person
                          ) => (
                            <option
                              key={
                                person.id
                              }
                              value={`external:${person.id}`}
                            >
                              {
                                person.name
                              }
                              {person.department
                                ? `｜${person.department}`
                                : ""}
                            </option>
                          )
                        )}
                      </optgroup>
                    )}
                  </select>
                </div>


                {showExternalForm &&
                  !editingRecord && (
                  <div className="leave-external-form leave-field--full">
                    <div className="leave-external-form-header">
                      <div>
                        <strong>
                          新增其他人員
                        </strong>

                        <span>
                          只加入休假登記名單，
                          不會建立 Workspace 老師帳號。
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setShowExternalForm(
                            false
                          )
                        }
                      >
                        ×
                      </button>
                    </div>


                    <div className="leave-external-form-grid">
                      <label className="leave-field">
                        <span>
                          姓名
                        </span>

                        <input
                          type="text"
                          placeholder="例如：Amy"
                          value={
                            externalForm.name
                          }
                          onChange={(
                            event
                          ) =>
                            setExternalForm(
                              (
                                current
                              ) => ({
                                ...current,
                                name:
                                  event
                                    .target
                                    .value,
                              })
                            )
                          }
                        />
                      </label>


                      <label className="leave-field">
                        <span>
                          所屬
                        </span>

                        <input
                          type="text"
                          placeholder="例如：美語部"
                          value={
                            externalForm.department
                          }
                          onChange={(
                            event
                          ) =>
                            setExternalForm(
                              (
                                current
                              ) => ({
                                ...current,
                                department:
                                  event
                                    .target
                                    .value,
                              })
                            )
                          }
                        />
                      </label>
                    </div>


                    <div className="leave-external-form-actions">
                      <button
                        type="button"
                        className="leave-secondary-button"
                        onClick={() =>
                          setShowExternalForm(
                            false
                          )
                        }
                        disabled={
                          addingExternalStaff
                        }
                      >
                        取消
                      </button>

                      <button
                        type="button"
                        className="leave-primary-button"
                        onClick={
                          handleAddExternalStaff
                        }
                        disabled={
                          addingExternalStaff
                        }
                      >
                        {addingExternalStaff
                          ? "新增中…"
                          : "加入名單"}
                      </button>
                    </div>
                  </div>
                )}


                <label className="leave-field leave-field--full">
                  <span>
                    假別
                  </span>

                  <select
                    value={
                      form.leaveTypeId
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "leaveTypeId",
                        event.target
                          .value
                      )
                    }
                    required
                  >
                    <option value="">
                      請選擇假別
                    </option>

                    {leaveTypes.map(
                      (
                        leaveType
                      ) => (
                        <option
                          key={
                            leaveType.id
                          }
                          value={
                            leaveType.id
                          }
                        >
                          {
                            leaveType.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>


                <label className="leave-field">
                  <span>
                    開始日期
                  </span>

                  <input
                    type="date"
                    value={
                      form.startDate
                    }
                    onChange={(
                      event
                    ) => {
                      const value =
                        event.target
                          .value;

                      updateForm(
                        "startDate",
                        value
                      );

                      if (
                        form.endDate <
                        value
                      ) {
                        updateForm(
                          "endDate",
                          value
                        );
                      }
                    }}
                    required
                  />
                </label>


                <label className="leave-field">
                  <span>
                    結束日期
                  </span>

                  <input
                    type="date"
                    value={
                      form.endDate
                    }
                    min={
                      form.startDate
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "endDate",
                        event.target
                          .value
                      )
                    }
                    required
                  />
                </label>


                <label className="leave-field">
                  <span>
                    計算方式
                  </span>

                  <select
                    value={
                      form.inputUnit
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "inputUnit",
                        event.target
                          .value
                      )
                    }
                  >
                    <option value="DAY">
                      天
                    </option>

                    <option value="HOUR">
                      小時
                    </option>
                  </select>
                </label>


                <label className="leave-field">
                  <span>
                    {form.inputUnit ===
                    "DAY"
                      ? "休假天數"
                      : "休假時數"}
                  </span>

                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={
                      form.inputValue
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "inputValue",
                        event.target
                          .value
                      )
                    }
                    required
                  />

                  <small>
                    {form.inputUnit ===
                    "DAY"
                      ? "1 日以 8 小時計算"
                      : "可直接輸入實際時數"}
                  </small>
                </label>


                <label className="leave-check-field leave-field--full">
                  <input
                    type="checkbox"
                    checked={
                      form.isLastMinute
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "isLastMinute",
                        event.target
                          .checked
                      )
                    }
                  />

                  <div>
                    <strong>
                      臨時請假
                    </strong>

                    <span>
                      若為臨時提出的休假，
                      可另外標記供後續統計使用。
                    </span>
                  </div>
                </label>


                <label className="leave-field leave-field--full">
                  <span>
                    備註
                  </span>

                  <textarea
                    rows="3"
                    placeholder="選填，例如：其他假別原因、特殊說明…"
                    value={
                      form.note
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "note",
                        event.target
                          .value
                      )
                    }
                  />
                </label>


                {errorMessage && (
                  <div className="leave-message leave-message--error leave-field--full">
                    {
                      errorMessage
                    }
                  </div>
                )}


                <div className="leave-form-actions leave-field--full">
                  <button
                    type="button"
                    className="leave-secondary-button"
                    onClick={
                      handleCloseForm
                    }
                    disabled={
                      saving ||
                      addingExternalStaff
                    }
                  >
                    取消
                  </button>

                  <button
                    type="submit"
                    className="leave-primary-button"
                    disabled={
                      saving ||
                      addingExternalStaff
                    }
                  >
                    {saving
                      ? "儲存中…"
                      : editingRecord
                        ? "儲存修改"
                        : "儲存休假"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}


        {showCsvPreview && (
          <div
            className="leave-modal-backdrop"
            onMouseDown={
              handleCloseCsvPreview
            }
          >
            <div
              className="leave-csv-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="leave-modal-header">
                <div>
                  <span>
                    CSV IMPORT
                  </span>

                  <h3>
                    匯入休假清單
                  </h3>
                </div>

                <button
                  type="button"
                  className="leave-modal-close"
                  onClick={
                    handleCloseCsvPreview
                  }
                  disabled={
                    csvImporting
                  }
                >
                  ×
                </button>
              </div>


              <div className="leave-csv-content">
                <div className="leave-csv-file-info">
                  <div>
                    <strong>
                      {csvFileName}
                    </strong>

                    <span>
                      已讀取 {csvSummary.total} 筆休假資料
                    </span>
                  </div>
                </div>


                <div className="leave-csv-summary-grid">
                  <div className="leave-csv-summary-card">
                    <span>
                      老師已配對
                    </span>

                    <strong>
                      {csvSummary.teacher}
                    </strong>
                  </div>

                  <div className="leave-csv-summary-card">
                    <span>
                      其他人員
                    </span>

                    <strong>
                      {csvSummary.external}
                    </strong>
                  </div>

                  <div className="leave-csv-summary-card">
                    <span>
                      未配對
                    </span>

                    <strong>
                      {csvSummary.unmatched}
                    </strong>
                  </div>

                  <div className="leave-csv-summary-card">
                    <span>
                      異常
                    </span>

                    <strong>
                      {csvSummary.error}
                    </strong>
                  </div>
                </div>


                <div className="leave-csv-note">
                  <strong>
                    匯入規則
                  </strong>

                  <p>
                    每一筆都可以先修改再匯入。
                    老師管理中已有的人會直接配對；
                    未配對的人只會加入休假管理其他人員，
                    不會新增到老師管理。
                  </p>
                </div>


                {csvImportError && (
                  <div className="leave-message leave-message--error">
                    {csvImportError
                      .split("\n")
                      .map(
                        (
                          line,
                          index
                        ) => (
                          <div
                            key={
                              index
                            }
                          >
                            {line}
                          </div>
                        )
                      )}
                  </div>
                )}


                <div className="leave-csv-table-wrap">
                  <table className="leave-csv-table">
                    <thead>
                      <tr>
                        <th>
                          姓名
                        </th>

                        <th>
                          配對
                        </th>

                        <th>
                          假別
                        </th>

                        <th>
                          日期時間
                        </th>

                        <th>
                          時數
                        </th>

                        <th>
                          原因
                        </th>

                        <th>
                          狀態
                        </th>

                        <th />
                      </tr>
                    </thead>

                    <tbody>
                      {csvRows.map(
                        (
                          row
                        ) => (
                          <tr
                            key={`${row.rowNumber}-${row.importKey}`}
                            className={
                              row.errors.length >
                              0
                                ? "leave-csv-row leave-csv-row--error"
                                : row.warnings.length >
                                    0
                                  ? "leave-csv-row leave-csv-row--warning"
                                  : "leave-csv-row"
                            }
                          >
                            <td>
                              <strong>
                                {
                                  row.personName
                                }
                              </strong>

                              <small>
                                CSV 第 {row.rowNumber} 列
                              </small>
                            </td>

                            <td>
                              {row.personStatus ===
                              "TEACHER" ? (
                                <span className="leave-csv-status leave-csv-status--matched">
                                  老師管理
                                </span>
                              ) : row.personStatus ===
                                "EXTERNAL" ? (
                                <span className="leave-csv-status leave-csv-status--external">
                                  其他人員
                                </span>
                              ) : (
                                <span className="leave-csv-status leave-csv-status--unmatched">
                                  新增其他人員
                                </span>
                              )}

                              {row.matchedName && (
                                <small>
                                  {
                                    row.matchedName
                                  }
                                </small>
                              )}
                            </td>

                            <td>
                              {
                                row.leaveTypeName ||
                                "—"
                              }
                            </td>

                            <td>
                              {row.start &&
                              row.end ? (
                                <>
                                  <strong>
                                    {
                                      row.start
                                        .display
                                    }
                                  </strong>

                                  <small>
                                    ～
                                    {
                                      row.end
                                        .display
                                    }
                                  </small>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>

                            <td>
                              <strong>
                                {
                                  formatCsvLeaveHours(
                                    row.totalHours
                                  )
                                }
                              </strong>

                              {row.dayCount >
                                1 && (
                                <small>
                                  {row.dayCount} 天
                                </small>
                              )}
                            </td>

                            <td>
                              {
                                row.leaveReason ||
                                "—"
                              }
                            </td>

                            <td>
                              {row.errors.length >
                              0 ? (
                                <div className="leave-csv-issues">
                                  {row.errors.map(
                                    (
                                      item,
                                      index
                                    ) => (
                                      <span
                                        key={`error-${index}`}
                                        className="leave-csv-issue leave-csv-issue--error"
                                      >
                                        {
                                          item
                                        }
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : row.warnings.length >
                                0 ? (
                                <div className="leave-csv-issues">
                                  {row.warnings.map(
                                    (
                                      item,
                                      index
                                    ) => (
                                      <span
                                        key={`warning-${index}`}
                                        className="leave-csv-issue leave-csv-issue--warning"
                                      >
                                        {
                                          item
                                        }
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : (
                                <span className="leave-csv-status leave-csv-status--ok">
                                  可匯入
                                </span>
                              )}
                            </td>

                            <td>
                              <button
                                type="button"
                                className="leave-edit-button"
                                onClick={() =>
                                  handleOpenCsvEdit(
                                    row
                                  )
                                }
                                disabled={
                                  csvImporting
                                }
                              >
                                修改
                              </button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>


                <div className="leave-csv-footer">
                  <div>
                    <strong>
                      可匯入
                    </strong>

                    <span>
                      {csvImportableCount} 筆
                    </span>
                  </div>

                  <div className="leave-csv-footer-actions">
                    <button
                      type="button"
                      className="leave-secondary-button"
                      onClick={
                        handleCloseCsvPreview
                      }
                      disabled={
                        csvImporting
                      }
                    >
                      取消
                    </button>

                    <button
                      type="button"
                      className="leave-primary-button"
                      onClick={
                        handleConfirmCsvImport
                      }
                      disabled={
                        csvImporting ||
                        csvImportableCount ===
                          0
                      }
                    >
                      {csvImporting
                        ? "匯入中…"
                        : `確認匯入 ${csvImportableCount} 筆`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {editingCsvRow && (
          <div
            className="leave-csv-edit-backdrop"
            onMouseDown={
              handleCloseCsvEdit
            }
          >
            <div
              className="leave-csv-edit-modal"
              onMouseDown={(
                event
              ) =>
                event.stopPropagation()
              }
            >
              <div className="leave-modal-header">
                <div>
                  <span>
                    CSV RECORD
                  </span>

                  <h3>
                    修改匯入資料
                  </h3>
                </div>

                <button
                  type="button"
                  className="leave-modal-close"
                  onClick={
                    handleCloseCsvEdit
                  }
                >
                  ×
                </button>
              </div>


              <div className="leave-form">
                <label className="leave-field leave-field--full">
                  <span>
                    姓名
                  </span>

                  <input
                    type="text"
                    value={
                      csvEditForm.personName
                    }
                    onChange={(
                      event
                    ) =>
                      updateCsvEditForm(
                        "personName",
                        event.target.value
                      )
                    }
                  />
                </label>


                <label className="leave-field leave-field--full">
                  <span>
                    假別
                  </span>

                  <select
                    value={
                      csvEditForm.leaveTypeName
                    }
                    onChange={(
                      event
                    ) =>
                      updateCsvEditForm(
                        "leaveTypeName",
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      請選擇假別
                    </option>

                    {leaveTypes.map(
                      (
                        leaveType
                      ) => (
                        <option
                          key={
                            leaveType.id
                          }
                          value={
                            leaveType.name
                          }
                        >
                          {
                            leaveType.name
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>


                <label className="leave-field">
                  <span>
                    開始日期時間
                  </span>

                  <input
                    type="datetime-local"
                    value={
                      csvEditForm.startValue
                    }
                    onChange={(
                      event
                    ) =>
                      updateCsvEditForm(
                        "startValue",
                        event.target.value
                      )
                    }
                  />
                </label>


                <label className="leave-field">
                  <span>
                    結束日期時間
                  </span>

                  <input
                    type="datetime-local"
                    value={
                      csvEditForm.endValue
                    }
                    onChange={(
                      event
                    ) =>
                      updateCsvEditForm(
                        "endValue",
                        event.target.value
                      )
                    }
                  />
                </label>


                <label className="leave-field leave-field--full">
                  <span>
                    請假原因
                  </span>

                  <textarea
                    rows="3"
                    value={
                      csvEditForm.leaveReason
                    }
                    onChange={(
                      event
                    ) =>
                      updateCsvEditForm(
                        "leaveReason",
                        event.target.value
                      )
                    }
                  />
                </label>


                <div className="leave-csv-edit-preview leave-field--full">
                  <span>
                    修改後會自動重新計算日期、時數與人員配對。
                  </span>
                </div>


                <div className="leave-form-actions leave-field--full">
                  <button
                    type="button"
                    className="leave-secondary-button"
                    onClick={
                      handleCloseCsvEdit
                    }
                  >
                    取消
                  </button>

                  <button
                    type="button"
                    className="leave-primary-button"
                    onClick={
                      handleSaveCsvEdit
                    }
                  >
                    套用修改
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }


  const monthlyDetailRecords =
    useMemo(
      () =>
        records
          .filter(
            (record) =>
              String(
                record.start_date || ""
              ).slice(0, 7) ===
              reportMonth
          )
          .sort(
            (a, b) => {
              const dateCompare =
                String(
                  a.start_datetime ||
                    a.start_date ||
                    ""
                ).localeCompare(
                  String(
                    b.start_datetime ||
                      b.start_date ||
                      ""
                  )
                );

              if (
                dateCompare !== 0
              ) {
                return dateCompare;
              }

              return getRecordPersonName(
                a
              ).localeCompare(
                getRecordPersonName(
                  b
                ),
                "zh-Hant"
              );
            }
          ),
      [
        records,
        reportMonth,
      ]
    );


  function renderMonthlyReport() {
    const summary =
      monthlyReport.summary;

    return (
      <section className="leave-section">
        <div className="leave-report-heading">
          <div>
            <p className="leave-report-eyebrow">
              MONTHLY REPORT
            </p>

            <h2>
              月報表
            </h2>

            <p>
              先查看當月每一筆休假明細，
              再於報表下方彙整統計。
            </p>
          </div>

          <div className="leave-report-month-nav">
            <span>
              報表月份
            </span>

            <div>
              <button
                type="button"
                onClick={() =>
                  setReportMonth(
                    shiftMonthString(
                      reportMonth,
                      -1
                    )
                  )
                }
                aria-label="上一個月"
              >
                ‹
              </button>

              <strong>
                {
                  getMonthLabel(
                    reportMonth
                  )
                }
              </strong>

              <button
                type="button"
                onClick={() =>
                  setReportMonth(
                    shiftMonthString(
                      reportMonth,
                      1
                    )
                  )
                }
                aria-label="下一個月"
              >
                ›
              </button>
            </div>
          </div>
        </div>


        <div className="leave-report-title-card">
          <div>
            <span>
              BEAST WORKSPACE
            </span>

            <h3>
              {getMonthLabel(
                reportMonth
              )}
              休假月報
            </h3>
          </div>

          <div className="leave-report-title-total">
            <span>
              當月休假合計
            </span>

            <strong>
              {
                summary.totalDisplay
              }
            </strong>

            <small>
              共 {summary.totalLeaveCount} 次
            </small>
          </div>
        </div>


        <div className="leave-report-table-card">
          <div className="leave-report-table-heading">
            <div>
              <strong>
                當月逐筆休假明細
              </strong>

              <span>
                依日期排序，
                保留每一筆請假紀錄。
              </span>
            </div>

            <span className="leave-report-row-count">
              {
                monthlyDetailRecords
                  .length
              }
              筆
            </span>
          </div>

          {loading ? (
            <div className="leave-report-empty">
              正在讀取休假資料…
            </div>
          ) : monthlyDetailRecords.length ===
            0 ? (
            <div className="leave-report-empty">
              <strong>
                這個月份目前沒有休假紀錄
              </strong>

              <span>
                可以用左右箭頭切換月份。
              </span>
            </div>
          ) : (
            <div className="leave-report-table-wrap">
              <table className="leave-report-table leave-report-detail-table">
                <thead>
                  <tr>
                    <th>
                      人員
                    </th>

                    <th>
                      假別
                    </th>

                    <th>
                      日期
                    </th>

                    <th>
                      開始
                    </th>

                    <th>
                      結束
                    </th>

                    <th>
                      時數
                    </th>

                    <th>
                      臨時請假
                    </th>

                    <th>
                      原因／備註
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {monthlyDetailRecords.map(
                    (record) => (
                      <tr
                        key={
                          record.id
                        }
                      >
                        <td>
                          <strong>
                            {
                              getRecordPersonName(
                                record
                              )
                            }
                          </strong>

                          {record
                            .leave_external_staff
                            ?.department && (
                            <small>
                              {
                                record
                                  .leave_external_staff
                                  .department
                              }
                            </small>
                          )}
                        </td>

                        <td>
                          {
                            record
                              .leave_types
                              ?.name ||
                            "—"
                          }
                        </td>

                        <td>
                          {record.start_date ===
                          record.end_date
                            ? record.start_date
                            : `${record.start_date} ～ ${record.end_date}`}
                        </td>

                        <td>
                          {
                            formatDateTimeForReport(
                              record.start_datetime
                            )
                          }
                        </td>

                        <td>
                          {
                            formatDateTimeForReport(
                              record.end_datetime
                            )
                          }
                        </td>

                        <td>
                          <strong>
                            {
                              formatLeaveHours(
                                record.leave_hours
                              )
                            }
                          </strong>
                        </td>

                        <td>
                          {record.is_last_minute
                            ? "是"
                            : "—"}
                        </td>

                        <td>
                          {record.leave_reason ||
                            record.note ||
                            "—"}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>


        <div className="leave-report-summary-section">
          <div className="leave-report-summary-section__heading">
            <div>
              <span>
                SUMMARY
              </span>

              <strong>
                當月統計
              </strong>
            </div>

            <small>
              {
                getMonthLabel(
                  reportMonth
                )
              }
            </small>
          </div>

          <div className="leave-report-summary-grid">
            <div className="leave-report-summary-card">
              <span>
                當月請假人數
              </span>

              <strong>
                {
                  summary.peopleOnLeave
                }
              </strong>

              <small>
                人
              </small>
            </div>

            <div className="leave-report-summary-card">
              <span>
                未請假老師
              </span>

              <strong>
                {
                  summary.noLeaveTeacherCount
                }
              </strong>

              <small>
                人
              </small>
            </div>

            <div className="leave-report-summary-card">
              <span>
                本月休假次數
              </span>

              <strong>
                {
                  summary.totalLeaveCount
                }
              </strong>

              <small>
                次
              </small>
            </div>

            <div className="leave-report-summary-card">
              <span>
                單月 3 次以上
              </span>

              <strong>
                {
                  summary.frequentLeaveCount
                }
              </strong>

              <small>
                人
              </small>
            </div>
          </div>


          <div className="leave-report-type-grid">
            <div className="leave-report-type-card">
              <span>
                事假
              </span>

              <strong>
                {
                  summary.personalDisplay
                }
              </strong>
            </div>

            <div className="leave-report-type-card">
              <span>
                病假
              </span>

              <strong>
                {
                  summary.sickDisplay
                }
              </strong>
            </div>

            <div className="leave-report-type-card">
              <span>
                特休
              </span>

              <strong>
                {
                  summary.annualDisplay
                }
              </strong>
            </div>

            <div className="leave-report-type-card">
              <span>
                其他
              </span>

              <strong>
                {
                  summary.otherDisplay
                }
              </strong>
            </div>
          </div>


          <div className="leave-report-table-card">
            <div className="leave-report-table-heading">
              <div>
                <strong>
                  人員統計
                </strong>

                <span>
                  當月有休假紀錄的人員彙總。
                </span>
              </div>
            </div>

            {monthlyReport.rows.length ===
              0 ? (
              <div className="leave-report-empty">
                這個月份目前沒有統計資料。
              </div>
            ) : (
              <div className="leave-report-table-wrap">
                <table className="leave-report-table">
                  <thead>
                    <tr>
                      <th>
                        老師
                      </th>

                      <th>
                        所屬
                      </th>

                      <th>
                        事假
                      </th>

                      <th>
                        病假
                      </th>

                      <th>
                        特休
                      </th>

                      <th>
                        其他
                      </th>

                      <th>
                        本月次數
                      </th>

                      <th>
                        本月合計
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {monthlyReport.rows.map(
                      (
                        person
                      ) => (
                        <tr
                          key={
                            person.personKey
                          }
                        >
                          <td>
                            <strong>
                              {
                                person.name
                              }
                            </strong>
                          </td>

                          <td>
                            {
                              person.department
                            }
                          </td>

                          <td>
                            {
                              person.personalDisplay
                            }
                          </td>

                          <td>
                            {
                              person.sickDisplay
                            }
                          </td>

                          <td>
                            {
                              person.annualDisplay
                            }
                          </td>

                          <td>
                            {
                              person.otherDisplay
                            }
                          </td>

                          <td>
                            <strong>
                              {
                                person.leaveCount
                              }
                            </strong>
                          </td>

                          <td>
                            <strong>
                              {
                                person.totalDisplay
                              }
                            </strong>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>


          {monthlyReport.frequentLeavePeople.length >
            0 && (
            <div className="leave-report-attention">
              <div>
                <span>
                  ATTENTION
                </span>

                <strong>
                  本月休假較頻繁
                </strong>
              </div>

              <div className="leave-report-attention-list">
                {monthlyReport.frequentLeavePeople.map(
                  (
                    person
                  ) => (
                    <div
                      key={
                        person.personKey
                      }
                    >
                      <strong>
                        {
                          person.name
                        }
                      </strong>

                      <span>
                        {
                          person.leaveCount
                        }
                        次・
                        {
                          person.totalDisplay
                        }
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }


  function renderSettings() {
    return (
      <section className="leave-section">
        <div>
          <h2>
            假別／額度設定
          </h2>

          <p>
            管理休假假別與後續額度設定。
          </p>
        </div>


        <div className="leave-placeholder">
          <strong>
            目前假別
          </strong>

          <div className="leave-type-list">
            {leaveTypes.length >
            0 ? (
              leaveTypes.map(
                (
                  leaveType
                ) => (
                  <span
                    key={
                      leaveType.id
                    }
                  >
                    {
                      leaveType.name
                    }
                  </span>
                )
              )
            ) : (
              <>
                <span>
                  事假
                </span>

                <span>
                  病假
                </span>

                <span>
                  特休
                </span>

                <span>
                  其他
                </span>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }


  function renderContent() {
    if (
      activeTab ===
      "records"
    ) {
      return renderRecords();
    }

    if (
      activeTab ===
      "monthly"
    ) {
      return renderMonthlyReport();
    }

    if (
      activeTab ===
      "settings"
    ) {
      return renderSettings();
    }

    return renderOverview();
  }


  return (
    <div className="leave-management-page">
      <div className="leave-page-header">
        <div>
          <p className="leave-page-eyebrow">
            STAFF MANAGEMENT
          </p>

          <h1>
            休假管理
          </h1>

          <p>
            統一管理老師休假、
            月度統計與正式報表。
          </p>
        </div>
      </div>


      <div className="leave-tabs">
        {TABS.map(
          (tab) => (
            <button
              key={
                tab.key
              }
              type="button"
              className={
                activeTab ===
                  tab.key
                  ? "leave-tab leave-tab--active"
                  : "leave-tab"
              }
              onClick={() =>
                setActiveTab(
                  tab.key
                )
              }
            >
              {
                tab.label
              }
            </button>
          )
        )}
      </div>


      {renderContent()}
    </div>
  );
}


export default LeaveManagementPage;