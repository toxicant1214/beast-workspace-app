const HOURS_PER_DAY = 8;


export function formatReportHours(
  hours
) {
  const value =
    Number(hours || 0);

  if (!value) {
    return "—";
  }

  const days =
    Math.floor(
      value / HOURS_PER_DAY
    );

  const remainingHours =
    Number(
      (
        value -
        days * HOURS_PER_DAY
      ).toFixed(2)
    );

  if (
    days > 0 &&
    remainingHours > 0
  ) {
    return `${days}日${remainingHours}小時`;
  }

  if (days > 0) {
    return `${days}日`;
  }

  return `${Number(
    value.toFixed(2)
  )}小時`;
}


function getPersonKey(
  record
) {
  if (record.teacher_id) {
    return `teacher:${record.teacher_id}`;
  }

  if (record.external_staff_id) {
    return `external:${record.external_staff_id}`;
  }

  return null;
}


function getPersonName(
  record
) {
  if (record.teachers) {
    return (
      record.teachers.chinese_name ||
      record.teachers.english_name ||
      "未命名老師"
    );
  }

  if (
    record.leave_external_staff
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


function getDepartment(
  record
) {
  if (
    record.leave_external_staff
  ) {
    return (
      record
        .leave_external_staff
        .department ||
      "其他"
    );
  }

  return "安親部";
}


function getLeaveTypeName(
  record
) {
  return (
    record.leave_types?.name ||
    record.leave_type ||
    "其他"
  );
}


function isRecordInMonth(
  record,
  month
) {
  if (
    !record?.start_date ||
    !month
  ) {
    return false;
  }

  return record.start_date.startsWith(
    month
  );
}


export function buildMonthlyLeaveReport({
  records = [],
  month,
  teachers = [],
}) {
  const monthRecords =
    records.filter(
      (record) =>
        isRecordInMonth(
          record,
          month
        )
    );


  const personMap =
    new Map();


  monthRecords.forEach(
    (record) => {
      const personKey =
        getPersonKey(
          record
        );

      if (!personKey) {
        return;
      }


      if (
        !personMap.has(
          personKey
        )
      ) {
        personMap.set(
          personKey,
          {
            personKey,

            name:
              getPersonName(
                record
              ),

            department:
              getDepartment(
                record
              ),

            personalHours: 0,
            sickHours: 0,
            annualHours: 0,
            otherHours: 0,

            leaveCount: 0,
            totalHours: 0,

            lastMinuteCount: 0,

            records: [],
          }
        );
      }


      const person =
        personMap.get(
          personKey
        );

      const hours =
        Number(
          record.leave_hours ||
          0
        );

      const leaveTypeName =
        getLeaveTypeName(
          record
        );


      person.leaveCount += 1;
      person.totalHours += hours;

      if (
        record.is_last_minute
      ) {
        person.lastMinuteCount += 1;
      }


      if (
        leaveTypeName === "事假"
      ) {
        person.personalHours +=
          hours;
      } else if (
        leaveTypeName === "病假"
      ) {
        person.sickHours +=
          hours;
      } else if (
        leaveTypeName === "特休"
      ) {
        person.annualHours +=
          hours;
      } else {
        person.otherHours +=
          hours;
      }


      person.records.push(
        record
      );
    }
  );


  const rows =
    Array.from(
      personMap.values()
    )
      .map(
        (person) => ({
          ...person,

          personalDisplay:
            formatReportHours(
              person.personalHours
            ),

          sickDisplay:
            formatReportHours(
              person.sickHours
            ),

          annualDisplay:
            formatReportHours(
              person.annualHours
            ),

          otherDisplay:
            formatReportHours(
              person.otherHours
            ),

          totalDisplay:
            formatReportHours(
              person.totalHours
            ),
        })
      )
      .sort(
        (a, b) => {
          if (
            a.department !==
            b.department
          ) {
            return a.department.localeCompare(
              b.department,
              "zh-Hant"
            );
          }

          return a.name.localeCompare(
            b.name,
            "zh-Hant"
          );
        }
      );


  const peopleOnLeave =
    rows.length;


  const totalLeaveCount =
    rows.reduce(
      (
        total,
        person
      ) =>
        total +
        person.leaveCount,
      0
    );


  const totalHours =
    rows.reduce(
      (
        total,
        person
      ) =>
        total +
        person.totalHours,
      0
    );


  const personalHours =
    rows.reduce(
      (
        total,
        person
      ) =>
        total +
        person.personalHours,
      0
    );


  const sickHours =
    rows.reduce(
      (
        total,
        person
      ) =>
        total +
        person.sickHours,
      0
    );


  const annualHours =
    rows.reduce(
      (
        total,
        person
      ) =>
        total +
        person.annualHours,
      0
    );


  const otherHours =
    rows.reduce(
      (
        total,
        person
      ) =>
        total +
        person.otherHours,
      0
    );


  const frequentLeavePeople =
    rows.filter(
      (person) =>
        person.leaveCount >= 3
    );


  const activeTeacherCount =
    teachers.length;


  const teacherLeaveIds =
    new Set(
      monthRecords
        .filter(
          (record) =>
            record.teacher_id
        )
        .map(
          (record) =>
            record.teacher_id
        )
    );


  const noLeaveTeacherCount =
    Math.max(
      0,
      activeTeacherCount -
        teacherLeaveIds.size
    );


  return {
    month,

    rows,

    summary: {
      activeTeacherCount,

      peopleOnLeave,

      noLeaveTeacherCount,

      totalLeaveCount,

      totalHours,

      totalDisplay:
        formatReportHours(
          totalHours
        ),

      personalHours,

      personalDisplay:
        formatReportHours(
          personalHours
        ),

      sickHours,

      sickDisplay:
        formatReportHours(
          sickHours
        ),

      annualHours,

      annualDisplay:
        formatReportHours(
          annualHours
        ),

      otherHours,

      otherDisplay:
        formatReportHours(
          otherHours
        ),

      frequentLeaveCount:
        frequentLeavePeople.length,
    },

    frequentLeavePeople,
  };
}


export function getCurrentMonthString() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}`;
}


export function getMonthLabel(
  month
) {
  if (!month) {
    return "";
  }

  const [
    year,
    monthNumber,
  ] = month.split("-");

  return `${year} 年 ${Number(
    monthNumber
  )} 月`;
}