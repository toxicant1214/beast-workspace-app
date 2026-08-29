import * as XLSX from "xlsx";


const REQUIRED_COLUMNS = [
  "請假姓名",
  "開始日期",
  "結束日期",
  "請假原因",
  "假別",
];


function cleanText(value) {
  return String(
    value ?? ""
  ).trim();
}


function pad2(value) {
  return String(value)
    .padStart(2, "0");
}


function normalizePersonName(
  value
) {
  return cleanText(value)
    .replace(/\s+/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .toLowerCase();
}


function getChineseOnlyName(
  value
) {
  return normalizePersonName(
    value
  )
    .replace(
      /\([^)]*\)/g,
      ""
    )
    .trim();
}


function parseDateTime(
  value
) {
  const text =
    cleanText(value);

  if (!text) {
    return null;
  }


  const match =
    text.match(
      /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/
    );


  if (!match) {
    return null;
  }


  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const hour =
    Number(
      match[4] || 0
    );

  const minute =
    Number(
      match[5] || 0
    );


  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }


  const checkDate =
    new Date(
      year,
      month - 1,
      day
    );


  if (
    checkDate.getFullYear() !==
      year ||
    checkDate.getMonth() !==
      month - 1 ||
    checkDate.getDate() !==
      day
  ) {
    return null;
  }


  return {
    year,
    month,
    day,
    hour,
    minute,

    dateString:
      `${year}-${pad2(
        month
      )}-${pad2(day)}`,

    timeString:
      `${pad2(
        hour
      )}:${pad2(minute)}`,

    inputValue:
      `${year}-${pad2(
        month
      )}-${pad2(
        day
      )}T${pad2(
        hour
      )}:${pad2(
        minute
      )}`,

    display:
      `${year}/${month}/${day} ${pad2(
        hour
      )}:${pad2(minute)}`,

    isoLocal:
      `${year}-${pad2(
        month
      )}-${pad2(
        day
      )}T${pad2(
        hour
      )}:${pad2(
        minute
      )}:00+08:00`,
  };
}


function getDateSerial(
  dateInfo
) {
  return Date.UTC(
    dateInfo.year,
    dateInfo.month - 1,
    dateInfo.day
  );
}


function getInclusiveDayCount(
  start,
  end
) {
  const difference =
    getDateSerial(end) -
    getDateSerial(start);


  if (difference < 0) {
    return 0;
  }


  return (
    Math.floor(
      difference /
        86400000
    ) + 1
  );
}


function getTimeMinutes(
  dateInfo
) {
  return (
    dateInfo.hour * 60 +
    dateInfo.minute
  );
}


function calculateLeaveHours(
  start,
  end
) {
  if (
    !start ||
    !end
  ) {
    return {
      dayCount: 0,
      totalHours: 0,
      error: null,
      warning: null,
      calculationType: null,
    };
  }


  const dayCount =
    getInclusiveDayCount(
      start,
      end
    );


  if (dayCount <= 0) {
    return {
      dayCount: 0,
      totalHours: 0,
      error:
        "結束日期早於開始日期",
      warning: null,
      calculationType: null,
    };
  }


  const startMinutes =
    getTimeMinutes(start);

  const endMinutes =
    getTimeMinutes(end);


  /*
   * 同一天：
   * 直接按照開始與結束時間計算。
   */
  if (dayCount === 1) {
    const durationMinutes =
      endMinutes -
      startMinutes;


    if (
      durationMinutes <= 0
    ) {
      return {
        dayCount: 1,
        totalHours: 0,
        error:
          "結束時間必須晚於開始時間",
        warning: null,
        calculationType:
          "SAME_DAY",
      };
    }


    const totalHours =
      durationMinutes / 60;


    return {
      dayCount: 1,
      totalHours,
      error: null,
      warning:
        totalHours > 12
          ? "單日休假超過 12 小時，請確認"
          : null,
      calculationType:
        "SAME_DAY",
    };
  }


  /*
   * 跨日：
   * 目前以每一天 8 小時計算。
   */
  const totalHours =
    dayCount * 8;


  return {
    dayCount,
    totalHours,
    error: null,
    warning:
      `跨日休假依 ${dayCount} 天 × 8 小時計算`,
    calculationType:
      "MULTI_DAY",
  };
}


export function formatCsvLeaveHours(
  hours
) {
  const value =
    Number(hours || 0);


  if (!value) {
    return "0小時";
  }


  const fullDays =
    Math.floor(value / 8);

  const remainingHours =
    Number(
      (
        value -
        fullDays * 8
      ).toFixed(2)
    );


  if (
    fullDays > 0 &&
    remainingHours > 0
  ) {
    return `${fullDays}日${remainingHours}小時`;
  }


  if (fullDays > 0) {
    return `${fullDays}日`;
  }


  return `${Number(
    value.toFixed(2)
  )}小時`;
}


function getTeacherDisplayName(
  teacher
) {
  return (
    teacher?.chinese_name ||
    teacher?.english_name ||
    ""
  );
}


function findTeacherMatch(
  csvName,
  teachers
) {
  const normalizedCsvName =
    normalizePersonName(
      csvName
    );

  const chineseOnlyCsvName =
    getChineseOnlyName(
      csvName
    );


  const exactMatch =
    teachers.find(
      (teacher) => {
        const chineseName =
          normalizePersonName(
            teacher?.chinese_name
          );

        const englishName =
          normalizePersonName(
            teacher?.english_name
          );


        return (
          normalizedCsvName ===
            chineseName ||
          normalizedCsvName ===
            englishName
        );
      }
    );


  if (exactMatch) {
    return exactMatch;
  }


  if (chineseOnlyCsvName) {
    const chineseMatch =
      teachers.find(
        (teacher) =>
          normalizePersonName(
            teacher?.chinese_name
          ) ===
          chineseOnlyCsvName
      );


    if (chineseMatch) {
      return chineseMatch;
    }
  }


  return null;
}


function findExternalMatch(
  csvName,
  externalStaff
) {
  const normalizedCsvName =
    normalizePersonName(
      csvName
    );

  const chineseOnlyCsvName =
    getChineseOnlyName(
      csvName
    );


  return (
    externalStaff.find(
      (person) => {
        const existingName =
          normalizePersonName(
            person?.name
          );


        return (
          existingName ===
            normalizedCsvName ||
          existingName ===
            chineseOnlyCsvName
        );
      }
    ) || null
  );
}


function findLeaveTypeMatch(
  csvType,
  leaveTypes
) {
  const target =
    cleanText(csvType);


  return (
    leaveTypes.find(
      (leaveType) =>
        cleanText(
          leaveType?.name
        ) === target
    ) || null
  );
}


function createImportKey(
  row
) {
  return [
    "CSV",
    normalizePersonName(
      row.personName
    ),
    row.start?.isoLocal || "",
    row.end?.isoLocal || "",
    cleanText(
      row.leaveTypeName
    ),
    cleanText(
      row.leaveReason
    ),
  ].join("|");
}


function buildParsedRow({
  rowNumber,
  personName,
  leaveTypeName,
  leaveReason,
  startValue,
  endValue,
  raw,
}) {
  const cleanedPersonName =
    cleanText(
      personName
    );

  const cleanedLeaveType =
    cleanText(
      leaveTypeName
    );

  const cleanedReason =
    cleanText(
      leaveReason
    );

  const start =
    parseDateTime(
      startValue
    );

  const end =
    parseDateTime(
      endValue
    );


  const errors = [];
  const warnings = [];


  if (!cleanedPersonName) {
    errors.push(
      "沒有請假姓名"
    );
  }


  if (!cleanedLeaveType) {
    errors.push(
      "沒有假別"
    );
  }


  if (!start) {
    errors.push(
      "開始日期格式錯誤"
    );
  }


  if (!end) {
    errors.push(
      "結束日期格式錯誤"
    );
  }


  let calculation = {
    dayCount: 0,
    totalHours: 0,
    error: null,
    warning: null,
    calculationType: null,
  };


  if (
    start &&
    end
  ) {
    calculation =
      calculateLeaveHours(
        start,
        end
      );


    if (
      calculation.error
    ) {
      errors.push(
        calculation.error
      );
    }


    if (
      calculation.warning
    ) {
      warnings.push(
        calculation.warning
      );
    }
  }


  const row = {
    rowNumber,

    personName:
      cleanedPersonName,

    leaveTypeName:
      cleanedLeaveType,

    leaveReason:
      cleanedReason,

    start,

    end,

    dayCount:
      calculation.dayCount,

    totalHours:
      calculation.totalHours,

    calculationType:
      calculation.calculationType,

    formattedHours:
      formatCsvLeaveHours(
        calculation.totalHours
      ),

    errors,

    warnings,

    raw: raw || {},
  };


  return {
    ...row,

    importKey:
      createImportKey(
        row
      ),
  };
}


function matchSingleRow({
  row,
  teachers,
  externalStaff,
  leaveTypes,
}) {
  const teacherMatch =
    findTeacherMatch(
      row.personName,
      teachers
    );


  const externalMatch =
    teacherMatch
      ? null
      : findExternalMatch(
          row.personName,
          externalStaff
        );


  const leaveTypeMatch =
    findLeaveTypeMatch(
      row.leaveTypeName,
      leaveTypes
    );


  const errors = [
    ...row.errors,
  ];

  const warnings = [
    ...row.warnings,
  ];


  if (
    !leaveTypeMatch &&
    row.leaveTypeName
  ) {
    errors.push(
      `找不到假別「${row.leaveTypeName}」`
    );
  }


  let personStatus =
    "UNMATCHED";

  let personId =
    null;

  let personType =
    null;

  let matchedName =
    "";


  if (teacherMatch) {
    personStatus =
      "TEACHER";

    personType =
      "teacher";

    personId =
      teacherMatch.id;

    matchedName =
      getTeacherDisplayName(
        teacherMatch
      );
  } else if (
    externalMatch
  ) {
    personStatus =
      "EXTERNAL";

    personType =
      "external";

    personId =
      externalMatch.id;

    matchedName =
      externalMatch.name;
  } else {
    warnings.push(
      "老師管理中找不到，確認匯入後只會加入休假管理其他人員"
    );
  }


  return {
    ...row,

    errors,

    warnings,

    personStatus,

    personType,

    personId,

    matchedName,

    leaveTypeId:
      leaveTypeMatch?.id ||
      null,

    leaveTypeMatch,
  };
}


export async function parseLeaveCsvFile(
  file
) {
  if (!file) {
    throw new Error(
      "請選擇 CSV 檔案。"
    );
  }


  const buffer =
    await file.arrayBuffer();


  const workbook =
    XLSX.read(
      buffer,
      {
        type: "array",
      }
    );


  const firstSheetName =
    workbook.SheetNames[0];


  if (!firstSheetName) {
    throw new Error(
      "CSV 中沒有可讀取的資料。"
    );
  }


  const sheet =
    workbook.Sheets[
      firstSheetName
    ];


  const rawRows =
    XLSX.utils.sheet_to_json(
      sheet,
      {
        defval: "",
        raw: false,
      }
    );


  if (
    rawRows.length === 0
  ) {
    throw new Error(
      "CSV 中沒有休假紀錄。"
    );
  }


  const actualColumns =
    Object.keys(
      rawRows[0]
    );


  const missingColumns =
    REQUIRED_COLUMNS.filter(
      (column) =>
        !actualColumns.includes(
          column
        )
    );


  if (
    missingColumns.length > 0
  ) {
    throw new Error(
      `CSV 缺少欄位：${missingColumns.join(
        "、"
      )}`
    );
  }


  return rawRows.map(
    (rawRow, index) =>
      buildParsedRow({
        rowNumber:
          index + 2,

        personName:
          rawRow[
            "請假姓名"
          ],

        leaveTypeName:
          rawRow[
            "假別"
          ],

        leaveReason:
          rawRow[
            "請假原因"
          ],

        startValue:
          rawRow[
            "開始日期"
          ],

        endValue:
          rawRow[
            "結束日期"
          ],

        raw:
          rawRow,
      })
  );
}


export function matchLeaveCsvRows({
  rows,
  teachers,
  externalStaff,
  leaveTypes,
}) {
  return rows.map(
    (row) =>
      matchSingleRow({
        row,
        teachers,
        externalStaff,
        leaveTypes,
      })
  );
}


/*
 * CSV 預覽畫面修改單筆資料後，
 * 用這個函式重新解析、重新算時數、
 * 重新判斷假別與老師配對。
 */
export function updateLeaveCsvPreviewRow({
  originalRow,
  personName,
  leaveTypeName,
  leaveReason,
  startValue,
  endValue,
  teachers,
  externalStaff,
  leaveTypes,
}) {
  const rebuiltRow =
    buildParsedRow({
      rowNumber:
        originalRow.rowNumber,

      personName,

      leaveTypeName,

      leaveReason,

      startValue,

      endValue,

      raw:
        originalRow.raw,
    });


  return matchSingleRow({
    row:
      rebuiltRow,

    teachers,
    externalStaff,
    leaveTypes,
  });
}


export function getCsvPreviewSummary(
  rows
) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;

      summary.totalHours +=
        Number(
          row.totalHours || 0
        );


      if (
        row.errors.length > 0
      ) {
        summary.error += 1;
      }


      if (
        row.warnings.length > 0
      ) {
        summary.warning += 1;
      }


      if (
        row.personStatus ===
        "TEACHER"
      ) {
        summary.teacher += 1;
      }


      if (
        row.personStatus ===
        "EXTERNAL"
      ) {
        summary.external += 1;
      }


      if (
        row.personStatus ===
        "UNMATCHED"
      ) {
        summary.unmatched += 1;
      }


      return summary;
    },
    {
      total: 0,
      teacher: 0,
      external: 0,
      unmatched: 0,
      error: 0,
      warning: 0,
      totalHours: 0,
    }
  );
}