import { supabase } from "../lib/supabase";

const DAY_OVERRIDE_TYPES = {
  HOLIDAY: "HOLIDAY",
  CLASSROOM_CLOSED: "CLASSROOM_CLOSED",
  SPECIAL_WORKDAY: "SPECIAL_WORKDAY",
};

const SPECIAL_BURDEN_WEEKDAYS = new Set([3, 5]);

const NORMAL_BURDEN_WEIGHT = 1;
const SPECIAL_BURDEN_WEIGHT = 1.5;


function pad2(value) {
  return String(value).padStart(2, "0");
}


function toDateString(date) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
}


function parseDateString(value) {
  const [year, month, day] = String(value)
    .slice(0, 10)
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}


function addDays(
  dateString,
  amount
) {
  const date =
    parseDateString(
      dateString
    );

  date.setDate(
    date.getDate() +
      amount
  );

  return toDateString(
    date
  );
}


function getDaysInMonth(
  year,
  month
) {
  return new Date(
    year,
    month,
    0
  ).getDate();
}


function getMonthRange(
  year,
  month
) {
  return {
    startDate:
      `${year}-${pad2(
        month
      )}-01`,

    endDate:
      `${year}-${pad2(
        month
      )}-${pad2(
        getDaysInMonth(
          year,
          month
        )
      )}`,
  };
}


function getMonthKey(
  dateString
) {
  return dateString.slice(
    0,
    7
  );
}


function getMonday(
  dateString
) {
  const date =
    parseDateString(
      dateString
    );

  const weekday =
    date.getDay();

  const distance =
    weekday === 0
      ? -6
      : 1 - weekday;

  date.setDate(
    date.getDate() +
      distance
  );

  return toDateString(
    date
  );
}


function compareDates(
  a,
  b
) {
  return a.localeCompare(
    b
  );
}


function unique(values) {
  return [
    ...new Set(values),
  ];
}


function isSpecialBurdenDay(
  dateString
) {
  return SPECIAL_BURDEN_WEEKDAYS.has(
    parseDateString(
      dateString
    ).getDay()
  );
}


function getBurdenWeight(
  dateString
) {
  return isSpecialBurdenDay(
    dateString
  )
    ? SPECIAL_BURDEN_WEIGHT
    : NORMAL_BURDEN_WEIGHT;
}


function getTeacherName(
  teacher
) {
  return (
    teacher?.chinese_name ||
    teacher?.english_name ||
    teacher?.name ||
    "未命名老師"
  );
}


export function getTodayDateString() {
  const now =
    new Date();

  const offset =
    now.getTimezoneOffset();

  return new Date(
    now.getTime() -
      offset *
        60 *
        1000
  )
    .toISOString()
    .slice(0, 10);
}


export async function getSemesterForDate(
  dateString
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "calendar_semesters"
      )
      .select(
        "id, name, start_date, end_date, status"
      )
      .lte(
        "start_date",
        dateString
      )
      .gte(
        "end_date",
        dateString
      )
      .neq(
        "status",
        "ARCHIVED"
      )
      .order(
        "start_date",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}


async function getSemestersForRange(
  startDate,
  endDate
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "calendar_semesters"
      )
      .select(
        "id, name, start_date, end_date, status"
      )
      .lte(
        "start_date",
        endDate
      )
      .gte(
        "end_date",
        startDate
      )
      .neq(
        "status",
        "ARCHIVED"
      )
      .order(
        "start_date",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


async function getOverridesForSemesters(
  semesterIds
) {
  if (
    semesterIds.length ===
    0
  ) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "calendar_day_overrides"
      )
      .select(
        `
          id,
          semester_id,
          override_date,
          override_type,
          title,
          notes
        `
      )
      .in(
        "semester_id",
        semesterIds
      )
      .order(
        "override_date",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


function findSemesterForDate(
  semesters,
  dateString
) {
  return (
    semesters.find(
      (semester) =>
        dateString >=
          semester.start_date &&
        dateString <=
          semester.end_date
    ) || null
  );
}


function findOverride(
  overrides,
  semesterId,
  dateString
) {
  return (
    overrides.find(
      (item) =>
        item.semester_id ===
          semesterId &&
        item.override_date ===
          dateString
    ) || null
  );
}


function isWorkingDayFromData(
  dateString,
  semester,
  overrides
) {
  if (!semester) {
    return false;
  }

  const override =
    findOverride(
      overrides,
      semester.id,
      dateString
    );

  if (
    override?.override_type ===
    DAY_OVERRIDE_TYPES.SPECIAL_WORKDAY
  ) {
    return true;
  }

  if (
    override?.override_type ===
      DAY_OVERRIDE_TYPES.HOLIDAY ||
    override?.override_type ===
      DAY_OVERRIDE_TYPES.CLASSROOM_CLOSED
  ) {
    return false;
  }

  const weekday =
    parseDateString(
      dateString
    ).getDay();

  return (
    weekday >= 1 &&
    weekday <= 5
  );
}


function isSemesterWorkingDay(
  dateString,
  semesters,
  overrides
) {
  const semester =
    findSemesterForDate(
      semesters,
      dateString
    );

  return isWorkingDayFromData(
    dateString,
    semester,
    overrides
  );
}


function getWorkingDatesInMonth(
  startDate,
  endDate,
  semesters,
  overrides
) {
  const dates = [];

  let cursor =
    startDate;

  while (
    cursor <= endDate
  ) {
    if (
      isSemesterWorkingDay(
        cursor,
        semesters,
        overrides
      )
    ) {
      dates.push(
        cursor
      );
    }

    cursor =
      addDays(
        cursor,
        1
      );
  }

  return dates;
}


function getRuleWeekdays(
  rule
) {
  if (
    Array.isArray(
      rule.weekdays
    ) &&
    rule.weekdays.length >
      0
  ) {
    return unique(
      rule.weekdays.map(
        Number
      )
    );
  }

  if (
    rule.weekday !==
      null &&
    rule.weekday !==
      undefined
  ) {
    return [
      Number(
        rule.weekday
      ),
    ];
  }

  return [];
}


function getNextWorkingDate(
  nominalDate,
  validWorkingDates,
  {
    sameWeek = false,
    sameMonth = false,
  } = {}
) {
  const nominalWeek =
    getMonday(
      nominalDate
    );

  const nominalMonth =
    getMonthKey(
      nominalDate
    );

  return (
    validWorkingDates.find(
      (dateString) => {
        if (
          dateString <
          nominalDate
        ) {
          return false;
        }

        if (
          sameWeek &&
          getMonday(
            dateString
          ) !==
            nominalWeek
        ) {
          return false;
        }

        if (
          sameMonth &&
          getMonthKey(
            dateString
          ) !==
            nominalMonth
        ) {
          return false;
        }

        return true;
      }
    ) || null
  );
}


function getRuleDueDatesForMonth(
  rule,
  year,
  month,
  validWorkingDates
) {
  if (
    validWorkingDates.length ===
    0
  ) {
    return [];
  }

  if (
    rule.frequency_type ===
    "DAILY"
  ) {
    return [
      ...validWorkingDates,
    ];
  }

  if (
    rule.frequency_type ===
    "WEEKLY"
  ) {
    const weekdays =
      getRuleWeekdays(
        rule
      );

    if (
      weekdays.length ===
      0
    ) {
      return [];
    }

    const result = [];

    for (
      const workingDate
      of validWorkingDates
    ) {
      const weekStart =
        getMonday(
          workingDate
        );

      for (
        const weekday
        of weekdays
      ) {
        const monday =
          parseDateString(
            weekStart
          );

        const offset =
          weekday === 0
            ? 6
            : weekday -
              1;

        monday.setDate(
          monday.getDate() +
            offset
        );

        const nominalDate =
          toDateString(
            monday
          );

        if (
          getMonthKey(
            nominalDate
          ) !==
          `${year}-${pad2(
            month
          )}`
        ) {
          continue;
        }

        const shiftedDate =
          getNextWorkingDate(
            nominalDate,
            validWorkingDates,
            {
              sameWeek:
                true,
            }
          );

        if (
          shiftedDate
        ) {
          result.push(
            shiftedDate
          );
        }
      }
    }

    return unique(
      result
    ).sort(
      compareDates
    );
  }

  if (
    rule.frequency_type ===
    "MONTHLY"
  ) {
    if (
      rule.monthly_mode ===
      "FIRST_WORKDAY"
    ) {
      return [
        validWorkingDates[0],
      ];
    }

    if (
      rule.monthly_mode ===
      "LAST_WORKDAY"
    ) {
      return [
        validWorkingDates[
          validWorkingDates.length -
            1
        ],
      ];
    }

    if (
      rule.monthly_mode ===
      "FIXED_DATE"
    ) {
      const requestedDay =
        Number(
          rule.month_day
        );

      if (
        !requestedDay
      ) {
        return [];
      }

      const clampedDay =
        Math.min(
          requestedDay,
          getDaysInMonth(
            year,
            month
          )
        );

      const nominalDate =
        `${year}-${pad2(
          month
        )}-${pad2(
          clampedDay
        )}`;

      const shiftedDate =
        getNextWorkingDate(
          nominalDate,
          validWorkingDates,
          {
            sameMonth:
              true,
          }
        );

      return shiftedDate
        ? [shiftedDate]
        : [];
    }
  }

  return [];
}


async function loadCleaningSetup() {
  const [
    rulesResult,
    membersResult,
    itemsResult,
    teachersResult,
    settingsResult,
  ] =
    await Promise.all([
      supabase
        .from(
          "cleaning_rules"
        )
        .select("*")
        .eq(
          "is_active",
          true
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          }
        ),

      supabase
        .from(
          "cleaning_rule_members"
        )
        .select("*")
        .order(
          "sort_order",
          {
            ascending:
              true,
          }
        ),

      supabase
        .from(
          "cleaning_items"
        )
        .select("*")
        .eq(
          "is_active",
          true
        ),

      supabase
        .from(
          "teachers"
        )
        .select("*"),

      supabase
        .from(
          "cleaning_teacher_settings"
        )
        .select("*"),
    ]);

  if (
    rulesResult.error
  ) {
    throw rulesResult.error;
  }

  if (
    membersResult.error
  ) {
    throw membersResult.error;
  }

  if (
    itemsResult.error
  ) {
    throw itemsResult.error;
  }

  if (
    teachersResult.error
  ) {
    throw teachersResult.error;
  }

  if (
    settingsResult.error
  ) {
    throw settingsResult.error;
  }

  const activeItemIds =
    new Set(
      (
        itemsResult.data ||
        []
      ).map(
        (item) =>
          item.id
      )
    );

  const teachers =
    (
      teachersResult.data ||
      []
    ).filter(
      (teacher) => {
        if (
          teacher.is_active ===
          false
        ) {
          return false;
        }

        const status =
          String(
            teacher.status ||
              teacher.teacher_status ||
              teacher.employment_status ||
              ""
          ).toUpperCase();

        return ![
          "INACTIVE",
          "RESIGNED",
          "LEFT",
        ].includes(
          status
        );
      }
    );

  const settingsMap =
    new Map(
      (
        settingsResult.data ||
        []
      ).map(
        (setting) => [
          setting.teacher_id,
          setting,
        ]
      )
    );

  return {
    rules:
      (
        rulesResult.data ||
        []
      ).filter(
        (rule) =>
          activeItemIds.has(
            rule.cleaning_item_id
          )
      ),

    members:
      membersResult.data ||
      [],

    items:
      itemsResult.data ||
      [],

    teachers,

    settingsMap,
  };
}


function getRotationCandidates(
  rule,
  members,
  teachers,
  settingsMap
) {
  const memberIds =
    members
      .filter(
        (member) =>
          member.cleaning_rule_id ===
          rule.id
      )
      .sort(
        (a, b) =>
          Number(
            a.sort_order ||
              0
          ) -
          Number(
            b.sort_order ||
              0
          )
      )
      .map(
        (member) =>
          member.teacher_id
      );

  const teacherMap =
    new Map(
      teachers.map(
        (teacher) => [
          teacher.id,
          teacher,
        ]
      )
    );

  const candidateIds =
    memberIds.length > 0
      ? memberIds
      : teachers.map(
          (teacher) =>
            teacher.id
        );

  return candidateIds
    .map(
      (teacherId) => {
        const teacher =
          teacherMap.get(
            teacherId
          );

        if (!teacher) {
          return null;
        }

        const setting =
          settingsMap.get(
            teacherId
          );

        if (
          setting?.participates_in_rotation ===
          false
        ) {
          return null;
        }

        return teacher;
      }
    )
    .filter(Boolean);
}


function createFairnessState(
  teachers
) {
  return new Map(
    teachers.map(
      (teacher) => [
        teacher.id,
        {
          teacherId:
            teacher.id,

          totalWeight: 0,

          totalCount: 0,

          wedFriCount: 0,

          lastAssignedDate:
            null,
        },
      ]
    )
  );
}


function applyTaskToFairness(
  fairness,
  task
) {
  if (
    !task.teacher_id
  ) {
    return;
  }

  if (
    !fairness.has(
      task.teacher_id
    )
  ) {
    fairness.set(
      task.teacher_id,
      {
        teacherId:
          task.teacher_id,

        totalWeight: 0,

        totalCount: 0,

        wedFriCount: 0,

        lastAssignedDate:
          null,
      }
    );
  }

  const current =
    fairness.get(
      task.teacher_id
    );

  const weight =
    Number(
      task.burden_weight ??
        getBurdenWeight(
          task.task_date
        )
    );

  current.totalWeight +=
    weight;

  current.totalCount +=
    1;

  if (
    isSpecialBurdenDay(
      task.task_date
    )
  ) {
    current.wedFriCount +=
      1;
  }

  if (
    !current.lastAssignedDate ||
    task.task_date >
      current.lastAssignedDate
  ) {
    current.lastAssignedDate =
      task.task_date;
  }
}


function chooseFairTeacher(
  candidates,
  fairness,
  dateString,
  lastTeacherId
) {
  if (
    candidates.length ===
    0
  ) {
    return null;
  }

  const isWedFri =
    isSpecialBurdenDay(
      dateString
    );

  const scored =
    candidates.map(
      (teacher) => {
        const state =
          fairness.get(
            teacher.id
          ) || {
            totalWeight: 0,
            totalCount: 0,
            wedFriCount: 0,
            lastAssignedDate:
              null,
          };

        return {
          teacher,
          state,

          repeated:
            teacher.id ===
            lastTeacherId,
        };
      }
    );

  scored.sort(
    (a, b) => {
      if (
        isWedFri &&
        a.state
          .wedFriCount !==
          b.state
            .wedFriCount
      ) {
        return (
          a.state
            .wedFriCount -
          b.state
            .wedFriCount
        );
      }

      if (
        a.state
          .totalWeight !==
        b.state
          .totalWeight
      ) {
        return (
          a.state
            .totalWeight -
          b.state
            .totalWeight
        );
      }

      if (
        a.state
          .totalCount !==
        b.state
          .totalCount
      ) {
        return (
          a.state
            .totalCount -
          b.state
            .totalCount
        );
      }

      if (
        a.repeated !==
        b.repeated
      ) {
        return a.repeated
          ? 1
          : -1;
      }

      return getTeacherName(
        a.teacher
      ).localeCompare(
        getTeacherName(
          b.teacher
        ),
        "zh-Hant"
      );
    }
  );

  return (
    scored[0]
      ?.teacher ||
    null
  );
}


function buildPublicRotationTask({
  rule,
  item,
  dateString,
  candidates,
  fairness,
  lastTeacherId,
}) {
  const teacher =
    chooseFairTeacher(
      candidates,
      fairness,
      dateString,
      lastTeacherId
    );

  if (!teacher) {
    return null;
  }

  return {
    cleaning_rule_id:
      rule.id,

    cleaning_item_id:
      rule.cleaning_item_id,

    teacher_id:
      teacher.id,

    task_date:
      dateString,

    status:
      "PENDING",

    burden_weight:
      getBurdenWeight(
        dateString
      ),

    is_manual_assignment:
      false,

    originally_assigned_teacher_id:
      teacher.id,

    note:
      rule.note ||
      item?.description ||
      null,
  };
}


function buildFixedTask({
  rule,
  item,
  dateString,
}) {
  if (
    !rule.fixed_teacher_id
  ) {
    return null;
  }

  return {
    cleaning_rule_id:
      rule.id,

    cleaning_item_id:
      rule.cleaning_item_id,

    teacher_id:
      rule.fixed_teacher_id,

    task_date:
      dateString,

    status:
      "PENDING",

    burden_weight:
      getBurdenWeight(
        dateString
      ),

    is_manual_assignment:
      false,

    originally_assigned_teacher_id:
      rule.fixed_teacher_id,

    note:
      rule.note ||
      item?.description ||
      null,
  };
}


function buildOwnAreaTasks({
  rule,
  item,
  dateString,
  teachers,
  settingsMap,
}) {
  return teachers
    .map(
      (teacher) => {
        const setting =
          settingsMap.get(
            teacher.id
          );

        const ownAreaLabel =
          setting
            ?.own_area_label
            ?.trim();

        if (
          !ownAreaLabel
        ) {
          return null;
        }

        return {
          cleaning_rule_id:
            rule.id,

          cleaning_item_id:
            rule.cleaning_item_id,

          teacher_id:
            teacher.id,

          task_date:
            dateString,

          status:
            "PENDING",

          burden_weight:
            0,

          is_manual_assignment:
            false,

          originally_assigned_teacher_id:
            teacher.id,

          note:
            rule.note ||
            ownAreaLabel ||
            item?.description ||
            null,
        };
      }
    )
    .filter(Boolean);
}


async function getMonthTasks(
  startDate,
  endDate
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .select("*")
      .gte(
        "task_date",
        startDate
      )
      .lte(
        "task_date",
        endDate
      )
      .order(
        "task_date",
        {
          ascending: true,
        }
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


async function removeRegeneratableMonthTasks(
  startDate,
  endDate
) {
  const {
    error,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .delete()
      .gte(
        "task_date",
        startDate
      )
      .lte(
        "task_date",
        endDate
      )
      .eq(
        "is_manual_assignment",
        false
      )
      .eq(
        "status",
        "PENDING"
      );

  if (error) {
    throw error;
  }
}


export async function generateCleaningMonth(
  year,
  month
) {
  const numericYear =
    Number(year);

  const numericMonth =
    Number(month);

  if (
    !Number.isInteger(
      numericYear
    ) ||
    !Number.isInteger(
      numericMonth
    ) ||
    numericMonth < 1 ||
    numericMonth > 12
  ) {
    throw new Error(
      "年月格式不正確。"
    );
  }

  const {
    startDate,
    endDate,
  } =
    getMonthRange(
      numericYear,
      numericMonth
    );

  const [
    semesters,
    setup,
    existingTasks,
  ] =
    await Promise.all([
      getSemestersForRange(
        startDate,
        endDate
      ),

      loadCleaningSetup(),

      getMonthTasks(
        startDate,
        endDate
      ),
    ]);

  if (
    semesters.length ===
    0
  ) {
    return {
      year:
        numericYear,

      month:
        numericMonth,

      startDate,
      endDate,

      semesters: [],

      workingDates: [],

      generated: 0,

      preserved:
        existingTasks.length,

      tasks:
        existingTasks,

      summary: [],
    };
  }

  const overrides =
    await getOverridesForSemesters(
      semesters.map(
        (semester) =>
          semester.id
      )
    );

  const workingDates =
    getWorkingDatesInMonth(
      startDate,
      endDate,
      semesters,
      overrides
    );

  const protectedTasks =
    existingTasks.filter(
      (task) =>
        task.is_manual_assignment ===
          true ||
        task.status !==
          "PENDING"
    );

  const protectedRuleDateKeys =
    new Set(
      protectedTasks.map(
        (task) =>
          `${task.cleaning_rule_id}|${task.task_date}`
      )
    );

  await removeRegeneratableMonthTasks(
    startDate,
    endDate
  );

  const {
    rules,
    members,
    items,
    teachers,
    settingsMap,
  } = setup;

  const itemMap =
    new Map(
      items.map(
        (item) => [
          item.id,
          item,
        ]
      )
    );

  const fairness =
    createFairnessState(
      teachers
    );

  for (
    const task
    of protectedTasks
  ) {
    applyTaskToFairness(
      fairness,
      task
    );
  }

  const generatedTasks =
    [];

  const lastTeacherByRule =
    new Map();

  for (
    const rule
    of rules
  ) {
    const item =
      itemMap.get(
        rule.cleaning_item_id
      );

    const dueDates =
      getRuleDueDatesForMonth(
        rule,
        numericYear,
        numericMonth,
        workingDates
      );

    const scope =
      rule.assignment_scope ||
      "PUBLIC";

    if (
      scope ===
      "OWN_AREA"
    ) {
      for (
        const dateString
        of dueDates
      ) {
        const tasks =
          buildOwnAreaTasks({
            rule,
            item,
            dateString,
            teachers,
            settingsMap,
          });

        generatedTasks.push(
          ...tasks
        );
      }

      continue;
    }

    if (
      scope ===
        "FIXED_TASK" ||
      rule.rule_type ===
        "FIXED_PERSON"
    ) {
      for (
        const dateString
        of dueDates
      ) {
        if (
          protectedRuleDateKeys.has(
            `${rule.id}|${dateString}`
          )
        ) {
          continue;
        }

        const task =
          buildFixedTask({
            rule,
            item,
            dateString,
          });

        if (
          task
        ) {
          generatedTasks.push(
            task
          );
        }
      }

      continue;
    }

    const candidates =
      getRotationCandidates(
        rule,
        members,
        teachers,
        settingsMap
      );

    for (
      const dateString
      of dueDates
    ) {
      if (
        protectedRuleDateKeys.has(
          `${rule.id}|${dateString}`
        )
      ) {
        continue;
      }

      const task =
        buildPublicRotationTask({
          rule,
          item,
          dateString,
          candidates,
          fairness,

          lastTeacherId:
            lastTeacherByRule.get(
              rule.id
            ) || null,
        });

      if (!task) {
        continue;
      }

      generatedTasks.push(
        task
      );

      applyTaskToFairness(
        fairness,
        task
      );

      lastTeacherByRule.set(
        rule.id,
        task.teacher_id
      );
    }
  }

  if (
    generatedTasks.length >
    0
  ) {
    const {
      error,
    } =
      await supabase
        .from(
          "cleaning_tasks"
        )
        .insert(
          generatedTasks
        );

    if (error) {
      throw error;
    }
  }

  const tasks =
    await getMonthTasks(
      startDate,
      endDate
    );

  const summary =
    teachers.map(
      (teacher) => {
        const teacherTasks =
          tasks.filter(
            (task) =>
              task.teacher_id ===
                teacher.id &&
              Number(
                task.burden_weight ||
                  0
              ) > 0
          );

        const wedFriCount =
          teacherTasks.filter(
            (task) =>
              isSpecialBurdenDay(
                task.task_date
              )
          ).length;

        const totalWeight =
          teacherTasks.reduce(
            (
              sum,
              task
            ) =>
              sum +
              Number(
                task.burden_weight ||
                  0
              ),
            0
          );

        const setting =
          settingsMap.get(
            teacher.id
          );

        return {
          teacher_id:
            teacher.id,

          teacher_name:
            getTeacherName(
              teacher
            ),

          participates_in_rotation:
            setting
              ?.participates_in_rotation !==
            false,

          total_count:
            teacherTasks.length,

          wed_fri_count:
            wedFriCount,

          total_weight:
            Number(
              totalWeight.toFixed(
                2
              )
            ),
        };
      }
    );

  return {
    year:
      numericYear,

    month:
      numericMonth,

    startDate,
    endDate,

    semesters,

    workingDates,

    generated:
      generatedTasks.length,

    preserved:
      protectedTasks.length,

    tasks,

    summary,
  };
}


export async function getCleaningMonth(
  year,
  month
) {
  const {
    startDate,
    endDate,
  } =
    getMonthRange(
      Number(year),
      Number(month)
    );

  return getMonthTasks(
    startDate,
    endDate
  );
}


export async function getCleaningTasksForDate(
  dateString =
    getTodayDateString()
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .select("*")
      .eq(
        "task_date",
        dateString
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}


export async function reassignCleaningTask(
  taskId,
  teacherId
) {
  if (
    !taskId ||
    !teacherId
  ) {
    throw new Error(
      "缺少任務或老師資料。"
    );
  }

  const {
    data: existing,
    error: existingError,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .select(
        `
          id,
          teacher_id,
          originally_assigned_teacher_id
        `
      )
      .eq(
        "id",
        taskId
      )
      .single();

  if (
    existingError
  ) {
    throw existingError;
  }

  const originalTeacherId =
    existing
      .originally_assigned_teacher_id ||
    existing.teacher_id;

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .update({
        teacher_id:
          teacherId,

        originally_assigned_teacher_id:
          originalTeacherId,

        is_manual_assignment:
          true,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        taskId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function setCleaningTaskDone(
  taskId,
  isDone
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .update({
        status:
          isDone
            ? "DONE"
            : "PENDING",

        completed_at:
          isDone
            ? new Date().toISOString()
            : null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        taskId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function skipCleaningTask(
  taskId,
  note = null
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .update({
        status:
          "SKIPPED",

        completed_at:
          null,

        note:
          note?.trim() ||
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        taskId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function restoreCleaningTask(
  taskId
) {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cleaning_tasks"
      )
      .update({
        status:
          "PENDING",

        completed_at:
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        taskId
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}


export async function saveCleaningTeacherSetting({
  teacherId,
  participatesInRotation,
  ownAreaLabel,
  note = null,
}) {
  if (
    !teacherId
  ) {
    throw new Error(
      "缺少老師資料。"
    );
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "cleaning_teacher_settings"
      )
      .upsert(
        {
          teacher_id:
            teacherId,

          participates_in_rotation:
            participatesInRotation,

          own_area_label:
            ownAreaLabel
              ?.trim() ||
            null,

          note:
            note?.trim() ||
            null,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "teacher_id",
        }
      )
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}