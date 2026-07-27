import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import "./CoursePage.css";

const EMPTY_COURSE_FORM = {
  course_name: "",
  note: "",
  is_active: true,
};

const EMPTY_CLASS_FORM = {
  class_name: "",
  weekday: "",
  start_time: "",
  end_time: "",
  first_lesson_date: "",
  total_sessions: 12,
  note: "",
  is_active: true,
};

const EMPTY_EXCLUSION_FORM = {
  title: "",
  date_mode: "SINGLE",
  start_date: "",
  end_date: "",
  note: "",
};

const WEEKDAY_OPTIONS = [
  { value: "1", label: "星期一" },
  { value: "2", label: "星期二" },
  { value: "3", label: "星期三" },
  { value: "4", label: "星期四" },
  { value: "5", label: "星期五" },
  { value: "6", label: "星期六" },
  { value: "0", label: "星期日" },
];

function CoursePage() {
  const [viewMode, setViewMode] = useState("COURSES");
  const [managingCourse, setManagingCourse] = useState(null);

  const [courses, setCourses] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [isCourseDrawerOpen, setIsCourseDrawerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseForm, setCourseForm] = useState({ ...EMPTY_COURSE_FORM });
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [courseFormError, setCourseFormError] = useState("");

  const [courseClasses, setCourseClasses] = useState([]);
  const [classSearchText, setClassSearchText] = useState("");
  const [classStatusFilter, setClassStatusFilter] = useState("ACTIVE");
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [classLoadError, setClassLoadError] = useState("");

  const [isClassDrawerOpen, setIsClassDrawerOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [classForm, setClassForm] = useState({ ...EMPTY_CLASS_FORM });
  const [isSavingClass, setIsSavingClass] = useState(false);
  const [classFormError, setClassFormError] = useState("");

  const [isStudentDrawerOpen, setIsStudentDrawerOpen] = useState(false);
  const [studentClass, setStudentClass] = useState(null);
  const [classStudents, setClassStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [studentSearchText, setStudentSearchText] = useState("");
  const [showHistoricalStudents, setShowHistoricalStudents] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSavingStudents, setIsSavingStudents] = useState(false);
  const [studentError, setStudentError] = useState("");

  const [isScheduleDrawerOpen, setIsScheduleDrawerOpen] = useState(false);
  const [schedulingClass, setSchedulingClass] = useState(null);
  const [scheduleExclusions, setScheduleExclusions] = useState([]);

  const [isExclusionDrawerOpen, setIsExclusionDrawerOpen] = useState(false);
  const [globalExclusions, setGlobalExclusions] = useState([]);
  const [selectedExclusion, setSelectedExclusion] = useState(null);
  const [exclusionForm, setExclusionForm] = useState({ ...EMPTY_EXCLUSION_FORM });
  const [isLoadingExclusions, setIsLoadingExclusions] = useState(false);
  const [isSavingExclusion, setIsSavingExclusion] = useState(false);
  const [exclusionError, setExclusionError] = useState("");
  const [schedulePreview, setSchedulePreview] = useState([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    try {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("courses")
        .select(`
          id,
          course_name,
          is_active,
          note,
          created_at,
          updated_at,
          course_classes (
            id,
            is_active
          )
        `)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error("讀取課程資料失敗：", error);
      setCourses([]);
      setLoadError(`讀取課程資料失敗：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCourseClasses(courseId) {
    try {
      setIsLoadingClasses(true);
      setClassLoadError("");

      const { data, error } = await supabase
        .from("course_classes")
        .select(`
          id,
          course_id,
          class_name,
          weekday,
          start_time,
          end_time,
          first_lesson_date,
          total_sessions,
          note,
          is_active,
          created_at,
          updated_at,
          course_class_sessions (
            id,
            session_number,
            session_date,
            status
          )
        `)
        .eq("course_id", courseId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setCourseClasses(data || []);
    } catch (error) {
      console.error("讀取班級資料失敗：", error);
      setCourseClasses([]);
      setClassLoadError(`讀取班級資料失敗：${error.message}`);
    } finally {
      setIsLoadingClasses(false);
    }
  }

  function openNewCourseDrawer() {
    setSelectedCourse(null);
    setCourseForm({ ...EMPTY_COURSE_FORM });
    setCourseFormError("");
    setIsCourseDrawerOpen(true);
  }

  function openEditCourseDrawer(course) {
    setSelectedCourse(course);
    setCourseForm({
      course_name: course.course_name || "",
      note: course.note || "",
      is_active: course.is_active ?? true,
    });
    setCourseFormError("");
    setIsCourseDrawerOpen(true);
  }

  function closeCourseDrawer() {
    if (isSavingCourse) return;
    setIsCourseDrawerOpen(false);
    setSelectedCourse(null);
    setCourseForm({ ...EMPTY_COURSE_FORM });
    setCourseFormError("");
  }

  function updateCourseForm(field, value) {
    setCourseForm((current) => ({ ...current, [field]: value }));
    if (courseFormError) setCourseFormError("");
  }

  async function saveCourse(event) {
    event.preventDefault();

    const courseName = courseForm.course_name.trim();
    const courseNote = courseForm.note.trim();

    if (!courseName) {
      setCourseFormError("請輸入課程名稱。");
      return;
    }

    const duplicatedCourse = courses.find((course) => {
      const isSameCourse = selectedCourse && course.id === selectedCourse.id;
      return (
        !isSameCourse &&
        course.course_name.trim().toLowerCase() === courseName.toLowerCase()
      );
    });

    if (duplicatedCourse) {
      setCourseFormError(`已經有「${duplicatedCourse.course_name}」這個課程。`);
      return;
    }

    const payload = {
      course_name: courseName,
      note: courseNote || null,
      is_active: courseForm.is_active,
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSavingCourse(true);
      setCourseFormError("");

      if (selectedCourse) {
        const { error } = await supabase
          .from("courses")
          .update(payload)
          .eq("id", selectedCourse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert([payload]);
        if (error) throw error;
      }

      closeCourseDrawer();
      await loadCourses();
    } catch (error) {
      console.error("儲存課程失敗：", error);
      setCourseFormError(
        error.code === "23505"
          ? "這個課程名稱已經存在，請使用其他名稱。"
          : `儲存課程失敗：${error.message}`
      );
    } finally {
      setIsSavingCourse(false);
    }
  }

  async function toggleCourseStatus(course) {
    const nextStatus = !course.is_active;
    const actionText = nextStatus ? "重新啟用" : "停用";
    const activeClassCount = getActiveClassCount(course);

    const message =
      !nextStatus && activeClassCount > 0
        ? `「${course.course_name}」目前仍有 ${activeClassCount} 個啟用中的班級。\n\n停用課程不會刪除班級資料，但之後建立班級時將不再顯示此課程。\n\n確定要停用嗎？`
        : `確定要${actionText}「${course.course_name}」嗎？`;

    if (!window.confirm(message)) return;

    try {
      const { error } = await supabase
        .from("courses")
        .update({
          is_active: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", course.id);

      if (error) throw error;
      await loadCourses();
    } catch (error) {
      console.error(`${actionText}課程失敗：`, error);
      window.alert(`${actionText}課程失敗：${error.message}`);
    }
  }

  async function openCourseClasses(course) {
    setManagingCourse(course);
    setViewMode("CLASSES");
    setClassSearchText("");
    setClassStatusFilter("ACTIVE");
    await loadCourseClasses(course.id);
  }

  async function backToCourses() {
    setViewMode("COURSES");
    setManagingCourse(null);
    setCourseClasses([]);
    setClassLoadError("");
    await loadCourses();
  }

  function getStudentDisplayName(student) {
    return (
      student?.chinese_name ||
      student?.student_name ||
      student?.name ||
      student?.full_name ||
      student?.english_name ||
      "未命名學生"
    );
  }

  async function loadStudentRoster(classId) {
    const { data, error } = await supabase
      .from("course_class_students")
      .select(`
        id,
        student_id,
        joined_at,
        left_at,
        is_active,
        note,
        students (*)
      `)
      .eq("course_class_id", classId)
      .eq("is_active", true)
      .order("joined_at", { ascending: true });

    if (error) throw error;
    setClassStudents(data || []);
  }

  async function loadAvailableStudents() {
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    setAllStudents(data || []);
  }

  async function openStudentDrawer(classItem) {
    setStudentClass(classItem);
    setStudentSearchText("");
    setShowHistoricalStudents(false);
    setSelectedStudentIds([]);
    setStudentError("");
    setIsStudentDrawerOpen(true);

    try {
      setIsLoadingStudents(true);
      await Promise.all([
        loadStudentRoster(classItem.id),
        loadAvailableStudents(),
      ]);
    } catch (error) {
      console.error("讀取學生名單失敗：", error);
      setClassStudents([]);
      setAllStudents([]);
      setStudentError(`讀取學生名單失敗：${error.message}`);
    } finally {
      setIsLoadingStudents(false);
    }
  }

  function closeStudentDrawer() {
    if (isSavingStudents) return;
    setIsStudentDrawerOpen(false);
    setStudentClass(null);
    setClassStudents([]);
    setAllStudents([]);
    setSelectedStudentIds([]);
    setStudentSearchText("");
    setShowHistoricalStudents(false);
    setStudentError("");
  }

  function toggleStudentSelection(studentId) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  }

  async function addSelectedStudents() {
    if (!studentClass || selectedStudentIds.length === 0) return;

    try {
      setIsSavingStudents(true);
      setStudentError("");

      const payload = selectedStudentIds.map((studentId) => ({
        course_class_id: studentClass.id,
        student_id: studentId,
        joined_at: new Date().toISOString().slice(0, 10),
        left_at: null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("course_class_students")
        .upsert(payload, { onConflict: "course_class_id,student_id" });

      if (error) throw error;
      setSelectedStudentIds([]);
      setStudentSearchText("");
      await loadStudentRoster(studentClass.id);
    } catch (error) {
      console.error("加入學生失敗：", error);
      setStudentError(`加入學生失敗：${error.message}`);
    } finally {
      setIsSavingStudents(false);
    }
  }

  async function removeStudentFromClass(rosterItem) {
    if (!studentClass) return;
    const name = getStudentDisplayName(rosterItem.students);
    if (!window.confirm(`確定要將「${name}」移出這個班級嗎？`)) return;

    try {
      setIsSavingStudents(true);
      setStudentError("");
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from("course_class_students")
        .update({
          is_active: false,
          left_at: today,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rosterItem.id);

      if (error) throw error;
      await loadStudentRoster(studentClass.id);
    } catch (error) {
      console.error("移除學生失敗：", error);
      setStudentError(`移除學生失敗：${error.message}`);
    } finally {
      setIsSavingStudents(false);
    }
  }

  function getStudentStatusValue(student) {
    return String(
      student?.student_status ||
      student?.status ||
      student?.enrollment_status ||
      ""
    )
      .trim()
      .toLowerCase();
  }

  function isHistoricalStudent(student) {
    const status = getStudentStatusValue(student);

    return [
      "畢業",
      "畢業生",
      "退班",
      "離班",
      "停用",
      "inactive",
      "graduated",
      "graduate",
      "withdrawn",
      "withdraw",
      "alumni",
    ].some((keyword) => status.includes(keyword));
  }

  const normalizedStudentSearch = studentSearchText.trim().toLowerCase();

  const availableStudentsForClass = normalizedStudentSearch
    ? allStudents
        .filter((student) => {
          const alreadyJoined = classStudents.some(
            (item) => item.student_id === student.id && item.is_active
          );
          if (alreadyJoined) return false;

          if (!showHistoricalStudents && isHistoricalStudent(student)) {
            return false;
          }

          const searchable = [
            getStudentDisplayName(student),
            student.english_name,
            student.school,
            student.student_number,
            student.grade,
            getStudentStatusValue(student),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(normalizedStudentSearch);
        })
        .slice(0, 30)
    : [];

  const selectedStudentsForAdd = selectedStudentIds
    .map((studentId) => allStudents.find((student) => student.id === studentId))
    .filter(Boolean);


  async function openScheduleDrawer(classItem) {
    setSchedulingClass(classItem);
    setSchedulePreview([]);
    setScheduleError("");
    setIsScheduleDrawerOpen(true);

    try {
      setIsLoadingSchedule(true);

      const { data, error } = await supabase
        .from("schedule_exclusions")
        .select(`
          id,
          title,
          exclusion_type,
          start_date,
          end_date,
          is_active,
          note
        `)
        .eq("is_active", true)
        .order("start_date", { ascending: true });

      if (error) throw error;
      setScheduleExclusions(data || []);
    } catch (error) {
      console.error("讀取停課日期失敗：", error);
      setScheduleExclusions([]);
      setScheduleError(`讀取停課日期失敗：${error.message}`);
    } finally {
      setIsLoadingSchedule(false);
    }
  }

  function closeScheduleDrawer() {
    setIsScheduleDrawerOpen(false);
    setSchedulingClass(null);
    setSchedulePreview([]);
    setScheduleExclusions([]);
    setScheduleError("");
  }

  async function loadGlobalExclusions() {
    try {
      setIsLoadingExclusions(true);
      setExclusionError("");

      const { data, error } = await supabase
        .from("schedule_exclusions")
        .select(`
          id,
          title,
          exclusion_type,
          start_date,
          end_date,
          is_active,
          note,
          created_at,
          updated_at
        `)
        .order("start_date", { ascending: true });

      if (error) throw error;
      setGlobalExclusions(data || []);
    } catch (error) {
      console.error("讀取共用休假失敗：", error);
      setGlobalExclusions([]);
      setExclusionError(`讀取共用休假失敗：${error.message}`);
    } finally {
      setIsLoadingExclusions(false);
    }
  }

  async function openExclusionDrawer() {
    setSelectedExclusion(null);
    setExclusionForm({ ...EMPTY_EXCLUSION_FORM });
    setExclusionError("");
    setIsExclusionDrawerOpen(true);
    await loadGlobalExclusions();
  }

  function closeExclusionDrawer() {
    if (isSavingExclusion) return;
    setIsExclusionDrawerOpen(false);
    setSelectedExclusion(null);
    setExclusionForm({ ...EMPTY_EXCLUSION_FORM });
    setExclusionError("");
  }

  function updateExclusionForm(field, value) {
    setExclusionForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "date_mode" && value === "SINGLE") {
        next.end_date = next.start_date;
      }
      if (field === "start_date" && current.date_mode === "SINGLE") {
        next.end_date = value;
      }
      return next;
    });
    if (exclusionError) setExclusionError("");
  }

  function editExclusion(item) {
    setSelectedExclusion(item);
    setExclusionForm({
      title: item.title || "",
      date_mode:
        item.start_date && item.end_date && item.start_date !== item.end_date
          ? "RANGE"
          : "SINGLE",
      start_date: item.start_date || "",
      end_date: item.end_date || item.start_date || "",
      note: item.note || "",
    });
    setExclusionError("");
  }

  function cancelEditExclusion() {
    setSelectedExclusion(null);
    setExclusionForm({ ...EMPTY_EXCLUSION_FORM });
    setExclusionError("");
  }

  async function saveExclusion(event) {
    event.preventDefault();

    const title = exclusionForm.title.trim();
    const startDate = exclusionForm.start_date;
    const endDate =
      exclusionForm.date_mode === "SINGLE"
        ? startDate
        : exclusionForm.end_date;

    if (!title) {
      setExclusionError("請輸入休假名稱。");
      return;
    }
    if (!startDate || !endDate) {
      setExclusionError("請選擇完整日期。");
      return;
    }
    if (endDate < startDate) {
      setExclusionError("結束日期不能早於開始日期。");
      return;
    }

    const payload = {
      title,
      exclusion_type: "CUSTOM",
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      note: exclusionForm.note.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSavingExclusion(true);
      setExclusionError("");

      if (selectedExclusion) {
        const { error } = await supabase
          .from("schedule_exclusions")
          .update(payload)
          .eq("id", selectedExclusion.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("schedule_exclusions")
          .insert([payload]);
        if (error) throw error;
      }

      setSelectedExclusion(null);
      setExclusionForm({ ...EMPTY_EXCLUSION_FORM });
      await loadGlobalExclusions();
    } catch (error) {
      console.error("儲存共用休假失敗：", error);
      setExclusionError(`儲存共用休假失敗：${error.message}`);
    } finally {
      setIsSavingExclusion(false);
    }
  }

  async function deleteExclusion(item) {
    if (!window.confirm(`確定要刪除「${item.title}」嗎？所有課程之後排課都不會再跳過這段日期。`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("schedule_exclusions")
        .delete()
        .eq("id", item.id);
      if (error) throw error;
      if (selectedExclusion?.id === item.id) cancelEditExclusion();
      await loadGlobalExclusions();
    } catch (error) {
      console.error("刪除共用休假失敗：", error);
      setExclusionError(`刪除共用休假失敗：${error.message}`);
    }
  }

  function parseDateOnly(value) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  function toDateOnlyString(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(date, days) {
    const nextDate = new Date(date);
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return nextDate;
  }

  function isDateInRange(dateString, startDate, endDate) {
    return dateString >= startDate && dateString <= endDate;
  }

  function getAppliedExclusions() {
    return scheduleExclusions.filter((item) => item.is_active);
  }

  function formatExclusionRange(item) {
    if (!item?.start_date) return "尚未設定";
    if (!item.end_date || item.start_date === item.end_date) {
      return formatDate(item.start_date);
    }
    return `${formatDate(item.start_date)}～${formatDate(item.end_date)}`;
  }

  function buildSchedulePreview() {
    if (!schedulingClass) return [];

    const {
      first_lesson_date: firstLessonDate,
      weekday,
      start_time: startTime,
      end_time: endTime,
      total_sessions: totalSessionsValue,
    } = schedulingClass;

    const totalSessions = Number(totalSessionsValue);

    if (!firstLessonDate || weekday === null || weekday === undefined) {
      throw new Error("請先在班級資料設定第一堂日期與每週上課日。");
    }

    if (!startTime || !endTime) {
      throw new Error("請先在班級資料設定開始時間與結束時間。");
    }

    if (!Number.isInteger(totalSessions) || totalSessions <= 0) {
      throw new Error("班級的一期堂數設定不正確。");
    }

    const firstDate = parseDateOnly(firstLessonDate);
    if (firstDate.getUTCDay() !== Number(weekday)) {
      throw new Error(
        `第一堂日期是星期${["日", "一", "二", "三", "四", "五", "六"][firstDate.getUTCDay()]}，與班級設定的${getWeekdayLabel(weekday)}不一致。請先編輯班級資料。`
      );
    }

    const appliedExclusions = getAppliedExclusions();
    const sessions = [];
    let candidateDate = firstDate;
    let safetyCount = 0;

    while (sessions.length < totalSessions && safetyCount < 520) {
      const candidateString = toDateOnlyString(candidateDate);
      const matchedExclusion = appliedExclusions.find((item) =>
        isDateInRange(candidateString, item.start_date, item.end_date)
      );

      if (!matchedExclusion) {
        sessions.push({
          session_number: sessions.length + 1,
          session_date: candidateString,
          start_time: normalizeTime(startTime),
          end_time: normalizeTime(endTime),
        });
      }

      candidateDate = addDays(candidateDate, 7);
      safetyCount += 1;
    }

    if (sessions.length < totalSessions) {
      throw new Error("無法在合理範圍內產生完整堂次，請檢查停課期間設定。");
    }

    return sessions;
  }

  function previewSchedule() {
    try {
      setScheduleError("");
      setSchedulePreview(buildSchedulePreview());
    } catch (error) {
      setSchedulePreview([]);
      setScheduleError(error.message);
    }
  }

  async function generateSchedule() {
    if (!schedulingClass || !managingCourse) return;

    let preview;
    try {
      preview = schedulePreview.length > 0 ? schedulePreview : buildSchedulePreview();
    } catch (error) {
      setScheduleError(error.message);
      return;
    }

    const existingCount = Array.isArray(schedulingClass.course_class_sessions)
      ? schedulingClass.course_class_sessions.length
      : 0;

    if (
      existingCount > 0 &&
      !window.confirm(
        `「${schedulingClass.class_name}」目前已有 ${existingCount} 堂課程日期。重新產生會取代原有排程，確定繼續嗎？`
      )
    ) {
      return;
    }

    try {
      setIsSavingSchedule(true);
      setScheduleError("");

      const { error: deleteError } = await supabase
        .from("course_class_sessions")
        .delete()
        .eq("course_class_id", schedulingClass.id);

      if (deleteError) throw deleteError;

      const payload = preview.map((session) => ({
        course_class_id: schedulingClass.id,
        session_number: session.session_number,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        status: "SCHEDULED",
        original_date: null,
        note: null,
        updated_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from("course_class_sessions")
        .insert(payload);

      if (insertError) throw insertError;

      closeScheduleDrawer();
      await loadCourseClasses(managingCourse.id);
    } catch (error) {
      console.error("產生課程日期失敗：", error);
      setScheduleError(`產生課程日期失敗：${error.message}`);
    } finally {
      setIsSavingSchedule(false);
    }
  }

  function openNewClassDrawer() {
    setSelectedClass(null);
    setClassForm({ ...EMPTY_CLASS_FORM });
    setClassFormError("");
    setIsClassDrawerOpen(true);
  }

  function openEditClassDrawer(classItem) {
    setSelectedClass(classItem);
    setClassForm({
      class_name: classItem.class_name || "",
      weekday:
        classItem.weekday === null || classItem.weekday === undefined
          ? ""
          : String(classItem.weekday),
      start_time: normalizeTime(classItem.start_time),
      end_time: normalizeTime(classItem.end_time),
      first_lesson_date: classItem.first_lesson_date || "",
      total_sessions: classItem.total_sessions ?? 12,
      note: classItem.note || "",
      is_active: classItem.is_active ?? true,
    });
    setClassFormError("");
    setIsClassDrawerOpen(true);
  }

  function closeClassDrawer() {
    if (isSavingClass) return;
    setIsClassDrawerOpen(false);
    setSelectedClass(null);
    setClassForm({ ...EMPTY_CLASS_FORM });
    setClassFormError("");
  }

  function updateClassForm(field, value) {
    setClassForm((current) => ({ ...current, [field]: value }));
    if (classFormError) setClassFormError("");
  }

  async function saveClass(event) {
    event.preventDefault();

    if (!managingCourse) return;

    const className = classForm.class_name.trim();
    const classNote = classForm.note.trim();
    const totalSessions = Number(classForm.total_sessions);

    if (!className) {
      setClassFormError("請輸入班級名稱。");
      return;
    }

    if (!Number.isInteger(totalSessions) || totalSessions <= 0) {
      setClassFormError("一期堂數必須是大於 0 的整數。");
      return;
    }

    if (
      classForm.start_time &&
      classForm.end_time &&
      classForm.end_time <= classForm.start_time
    ) {
      setClassFormError("結束時間必須晚於開始時間。");
      return;
    }

    const duplicatedClass = courseClasses.find((classItem) => {
      const isSameClass = selectedClass && classItem.id === selectedClass.id;
      return (
        !isSameClass &&
        classItem.class_name.trim().toLowerCase() === className.toLowerCase()
      );
    });

    if (duplicatedClass) {
      setClassFormError(`這個課程底下已經有「${duplicatedClass.class_name}」。`);
      return;
    }

    const payload = {
      course_id: managingCourse.id,
      class_name: className,
      weekday: classForm.weekday === "" ? null : Number(classForm.weekday),
      start_time: classForm.start_time || null,
      end_time: classForm.end_time || null,
      first_lesson_date: classForm.first_lesson_date || null,
      total_sessions: totalSessions,
      note: classNote || null,
      is_active: classForm.is_active,
      updated_at: new Date().toISOString(),
    };

    try {
      setIsSavingClass(true);
      setClassFormError("");

      if (selectedClass) {
        const { error } = await supabase
          .from("course_classes")
          .update(payload)
          .eq("id", selectedClass.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("course_classes").insert([payload]);
        if (error) throw error;
      }

      closeClassDrawer();
      await loadCourseClasses(managingCourse.id);
    } catch (error) {
      console.error("儲存班級失敗：", error);
      setClassFormError(
        error.code === "23505"
          ? "同一個課程底下不能建立重複的班級名稱。"
          : `儲存班級失敗：${error.message}`
      );
    } finally {
      setIsSavingClass(false);
    }
  }

  async function toggleClassStatus(classItem) {
    const nextStatus = !classItem.is_active;
    const actionText = nextStatus ? "重新啟用" : "停用";

    if (!window.confirm(`確定要${actionText}「${classItem.class_name}」嗎？`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("course_classes")
        .update({
          is_active: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", classItem.id);

      if (error) throw error;
      await loadCourseClasses(managingCourse.id);
    } catch (error) {
      console.error(`${actionText}班級失敗：`, error);
      window.alert(`${actionText}班級失敗：${error.message}`);
    }
  }

  function getClassCount(course) {
    return Array.isArray(course.course_classes)
      ? course.course_classes.length
      : 0;
  }

  function getActiveClassCount(course) {
    if (!Array.isArray(course.course_classes)) return 0;
    return course.course_classes.filter((item) => item.is_active).length;
  }

  function normalizeTime(value) {
    return value ? String(value).slice(0, 5) : "";
  }

  function getGeneratedSessionCount(classItem) {
    return Array.isArray(classItem.course_class_sessions)
      ? classItem.course_class_sessions.length
      : 0;
  }

  function getLastGeneratedSessionDate(classItem) {
    if (!Array.isArray(classItem.course_class_sessions)) return null;
    const dates = classItem.course_class_sessions
      .map((session) => session.session_date)
      .filter(Boolean)
      .sort();
    return dates.at(-1) || null;
  }

  function getWeekdayLabel(value) {
    const option = WEEKDAY_OPTIONS.find(
      (item) => Number(item.value) === Number(value)
    );
    return option?.label || "尚未設定";
  }

  function formatDate(value) {
    if (!value) return "尚未設定";
    return new Intl.DateTimeFormat("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(`${value}T00:00:00`));
  }

  const filteredCourses = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return courses.filter((course) => {
      const matchesKeyword =
        !keyword ||
        course.course_name?.toLowerCase().includes(keyword) ||
        course.note?.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && course.is_active) ||
        (statusFilter === "INACTIVE" && !course.is_active);

      return matchesKeyword && matchesStatus;
    });
  }, [courses, searchText, statusFilter]);

  const filteredClasses = useMemo(() => {
    const keyword = classSearchText.trim().toLowerCase();

    return courseClasses.filter((classItem) => {
      const matchesKeyword =
        !keyword ||
        classItem.class_name?.toLowerCase().includes(keyword) ||
        classItem.note?.toLowerCase().includes(keyword);

      const matchesStatus =
        classStatusFilter === "ALL" ||
        (classStatusFilter === "ACTIVE" && classItem.is_active) ||
        (classStatusFilter === "INACTIVE" && !classItem.is_active);

      return matchesKeyword && matchesStatus;
    });
  }, [courseClasses, classSearchText, classStatusFilter]);

  const activeCourseCount = courses.filter((course) => course.is_active).length;
  const inactiveCourseCount = courses.length - activeCourseCount;
  const totalClassCount = courses.reduce(
    (total, course) => total + getClassCount(course),
    0
  );

  const activeManagedClassCount = courseClasses.filter(
    (classItem) => classItem.is_active
  ).length;
  const inactiveManagedClassCount =
    courseClasses.length - activeManagedClassCount;

  if (viewMode === "CLASSES" && managingCourse) {
    return (
      <div className="coursePage">
        <header className="coursePage__header">
          <div>
            <p className="coursePage__eyebrow">COURSE CENTER</p>
            <h1>{managingCourse.course_name}</h1>
            <p className="coursePage__summary">
              課程管理　›　班級管理
            </p>
          </div>

          <div className="courseCard__actions">
            <button
              type="button"
              className="courseCard__editButton"
              onClick={backToCourses}
            >
              ← 返回全部課程
            </button>

            <button
              type="button"
              className="coursePage__primaryButton"
              onClick={openNewClassDrawer}
              disabled={!managingCourse.is_active}
              title={
                managingCourse.is_active
                  ? "新增班級"
                  : "課程已停用，無法新增班級"
              }
            >
              ＋ 新增班級
            </button>
          </div>
        </header>

        <section className="coursePage__stats">
          <div className="coursePage__statCard">
            <span>全部班級</span>
            <strong>{courseClasses.length}</strong>
            <small>此課程已建立的班級</small>
          </div>

          <div className="coursePage__statCard">
            <span>目前啟用</span>
            <strong>{activeManagedClassCount}</strong>
            <small>目前進行中的班級</small>
          </div>

          <div className="coursePage__statCard">
            <span>已停用</span>
            <strong>{inactiveManagedClassCount}</strong>
            <small>保留歷史資料</small>
          </div>

          <div className="coursePage__statCard">
            <span>預設一期</span>
            <strong>12</strong>
            <small>新增班級時可自行修改</small>
          </div>
        </section>

        <section className="coursePage__content">
          <div className="coursePage__toolbar">
            <label className="coursePage__search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="搜尋班級名稱或備註..."
                value={classSearchText}
                onChange={(event) => setClassSearchText(event.target.value)}
              />
            </label>

            <select
              value={classStatusFilter}
              onChange={(event) => setClassStatusFilter(event.target.value)}
              aria-label="班級狀態篩選"
            >
              <option value="ACTIVE">目前啟用</option>
              <option value="INACTIVE">已停用</option>
              <option value="ALL">全部狀態</option>
            </select>
          </div>

          <div className="coursePage__resultInfo">
            顯示 {filteredClasses.length} 個班級
          </div>

          {classLoadError && (
            <div className="coursePage__errorState">
              <p>{classLoadError}</p>
              <button
                type="button"
                onClick={() => loadCourseClasses(managingCourse.id)}
              >
                重新讀取
              </button>
            </div>
          )}

          {!classLoadError && isLoadingClasses && (
            <div className="coursePage__loadingState">
              正在讀取班級資料…
            </div>
          )}

          {!classLoadError &&
            !isLoadingClasses &&
            filteredClasses.length === 0 && (
              <div className="coursePage__emptyState">
                <div className="coursePage__emptyIcon">◎</div>
                <h2>
                  {courseClasses.length === 0
                    ? "尚未建立班級"
                    : "找不到符合條件的班級"}
                </h2>
                <p>
                  {courseClasses.length === 0
                    ? `可以在「${managingCourse.course_name}」底下建立第一個班級。`
                    : "可以調整搜尋文字或狀態篩選。"}
                </p>

                {courseClasses.length === 0 && managingCourse.is_active && (
                  <button type="button" onClick={openNewClassDrawer}>
                    ＋ 新增第一個班級
                  </button>
                )}
              </div>
            )}

          {!classLoadError &&
            !isLoadingClasses &&
            filteredClasses.length > 0 && (
              <div className="coursePage__grid">
                {filteredClasses.map((classItem) => (
                  <article
                    key={classItem.id}
                    className={`courseCard ${
                      classItem.is_active ? "" : "courseCard--inactive"
                    }`}
                  >
                    <div className="courseCard__top courseCard__top--statusOnly">
                      <span
                        className={`courseCard__status ${
                          classItem.is_active
                            ? "courseCard__status--active"
                            : "courseCard__status--inactive"
                        }`}
                      >
                        {classItem.is_active ? "啟用中" : "已停用"}
                      </span>
                    </div>

                    <div className="courseCard__body courseCard__body--class">
                      <h2>{classItem.class_name}</h2>

                      <div className="courseCard__scheduleSummary">
                        <p>
                          <span>固定時段</span>
                          <strong>
                            {getWeekdayLabel(classItem.weekday)}
                            {classItem.start_time && classItem.end_time
                              ? `｜${normalizeTime(classItem.start_time)}–${normalizeTime(
                                  classItem.end_time
                                )}`
                              : "｜尚未設定時間"}
                          </strong>
                        </p>

                        <p>
                          <span>第一堂</span>
                          <strong>{formatDate(classItem.first_lesson_date)}</strong>
                        </p>

                        <p>
                          <span>一期堂數</span>
                          <strong>{classItem.total_sessions || 12} 堂</strong>
                        </p>
                      </div>

                      {classItem.note && (
                        <p className="courseCard__note">{classItem.note}</p>
                      )}
                    </div>

                    <div className="courseCard__scheduleState">
                      {getGeneratedSessionCount(classItem) > 0 ? (
                        <>
                          <strong>
                            已產生 {getGeneratedSessionCount(classItem)} 堂課程日期
                          </strong>
                          <span>
                            最後一堂：{formatDate(getLastGeneratedSessionDate(classItem))}
                          </span>
                        </>
                      ) : (
                        <>
                          <strong>尚未產生實際課程日期</strong>
                          <span>
                            將依固定時段、國定假日與自訂停課期間安排。
                          </span>
                        </>
                      )}
                    </div>

                    <div className="courseCard__actions courseCard__actions--class">
                      <button
                        type="button"
                        className="courseCard__manageButton"
                        onClick={() => openStudentDrawer(classItem)}
                      >
                        學生名單
                      </button>

                      <button
                        type="button"
                        className="courseCard__manageButton"
                        onClick={() => openScheduleDrawer(classItem)}
                        disabled={!classItem.is_active}
                      >
                        {getGeneratedSessionCount(classItem) > 0
                          ? "重新安排課程"
                          : "安排課程日期"}
                      </button>

                      <button
                        type="button"
                        className="courseCard__editButton"
                        onClick={() => openEditClassDrawer(classItem)}
                      >
                        編輯班級
                      </button>

                      <button
                        type="button"
                        className={
                          classItem.is_active
                            ? "courseCard__toggleButton courseCard__toggleButton--disable"
                            : "courseCard__toggleButton courseCard__toggleButton--enable"
                        }
                        onClick={() => toggleClassStatus(classItem)}
                      >
                        {classItem.is_active ? "停用" : "重新啟用"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </section>

        {isStudentDrawerOpen && studentClass && (
          <div
            className="courseDrawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-drawer-title"
          >
            <button
              type="button"
              className="courseDrawer__backdrop"
              onClick={closeStudentDrawer}
              aria-label="關閉學生名單"
            />

            <aside className="courseDrawer__panel">
              <header className="courseDrawer__header">
                <div>
                  <p>STUDENT ROSTER</p>
                  <h2 id="student-drawer-title">{studentClass.class_name}</h2>
                  <small
                    style={{
                      display: "block",
                      marginTop: "6px",
                      color: "#8c9a94",
                      fontSize: "15px",
                    }}
                  >
                    管理這個班級的學生名單
                  </small>
                </div>
                <button
                  type="button"
                  className="courseDrawer__closeButton"
                  onClick={closeStudentDrawer}
                  disabled={isSavingStudents}
                  aria-label="關閉"
                >
                  ×
                </button>
              </header>

              <div className="courseDrawer__form">
                <div className="courseDrawer__fields">
                  <div
                    className="courseDrawer__field"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: "8px 16px",
                    }}
                  >
                    <span>目前學生</span>
                    <strong style={{ fontSize: "18px" }}>
                      {classStudents.length} 人
                    </strong>

                    <div style={{ gridColumn: "1 / -1" }}>
                      {isLoadingStudents ? (
                        <small>正在讀取學生資料…</small>
                      ) : classStudents.length === 0 ? (
                        <small>這個班級目前尚未加入學生。</small>
                      ) : (
                        <div style={{ display: "grid", gap: "8px" }}>
                          {classStudents.map((item) => (
                            <div
                              key={item.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                                padding: "10px 12px",
                                border: "1px solid #e4ebe7",
                                borderRadius: "12px",
                              }}
                            >
                              <span>
                                <strong>
                                  {getStudentDisplayName(item.students)}
                                </strong>
                                {item.students?.english_name
                                  ? `｜${item.students.english_name}`
                                  : ""}
                              </span>

                              <button
                                type="button"
                                className="courseCard__toggleButton courseCard__toggleButton--disable"
                                onClick={() => removeStudentFromClass(item)}
                                disabled={isSavingStudents}
                              >
                                移除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedStudentsForAdd.length > 0 && (
                    <div className="courseDrawer__field">
                      <span>
                        待加入學生（{selectedStudentsForAdd.length} 人）
                      </span>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {selectedStudentsForAdd.map((student) => (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => toggleStudentSelection(student.id)}
                            disabled={isSavingStudents}
                            title="按一下取消選取"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 12px",
                              border: "1px solid #bed1c8",
                              borderRadius: "999px",
                              background: "#f3f8f5",
                              color: "#2f5548",
                              cursor: isSavingStudents ? "default" : "pointer",
                              font: "inherit",
                            }}
                          >
                            <strong>{getStudentDisplayName(student)}</strong>
                            <span aria-hidden="true">×</span>
                          </button>
                        ))}
                      </div>

                      <small>
                        可繼續搜尋其他學生；已選取的人會保留在這裡。
                      </small>
                    </div>
                  )}

                  <label className="courseDrawer__field">
                    <span>搜尋並加入學生</span>
                    <input
                      type="search"
                      value={studentSearchText}
                      onChange={(event) => setStudentSearchText(event.target.value)}
                      placeholder="輸入姓名、英文名、學校或學號…"
                    />
                    <small>
                      搜尋後勾選學生，再換一個關鍵字繼續找；已選取名單不會消失。
                    </small>
                  </label>

                  <div className="courseDrawer__statusField">
                    <div>
                      <strong>包含歷史學生</strong>
                      <p>預設隱藏畢業生與退班生，需要時再開啟。</p>
                    </div>

                    <label className="courseSwitch">
                      <input
                        type="checkbox"
                        checked={showHistoricalStudents}
                        onChange={(event) =>
                          setShowHistoricalStudents(event.target.checked)
                        }
                        disabled={isSavingStudents}
                      />
                      <span className="courseSwitch__track">
                        <span className="courseSwitch__thumb" />
                      </span>
                      <strong>{showHistoricalStudents ? "顯示" : "隱藏"}</strong>
                    </label>
                  </div>

                  <div className="courseDrawer__field">
                    <span>
                      搜尋結果
                      {normalizedStudentSearch
                        ? `（${availableStudentsForClass.length} 筆）`
                        : ""}
                    </span>

                    {!normalizedStudentSearch ? (
                      <small>請先輸入學生姓名、英文名、學校或學號。</small>
                    ) : availableStudentsForClass.length === 0 ? (
                      <small>
                        找不到可加入的學生。可調整關鍵字，或開啟「包含歷史學生」。
                      </small>
                    ) : (
                      <div>
                        {availableStudentsForClass.map((student) => (
                          <label
                            key={student.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "22px minmax(0, 1fr)",
                              alignItems: "center",
                              columnGap: "12px",
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "12px 14px",
                              marginBottom: "10px",
                              border: "1px solid #dfe7e2",
                              borderRadius: "14px",
                              cursor: isSavingStudents ? "default" : "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.includes(student.id)}
                              onChange={() => toggleStudentSelection(student.id)}
                              disabled={isSavingStudents}
                              style={{
                                width: "20px",
                                height: "20px",
                                minWidth: "20px",
                                margin: 0,
                                padding: 0,
                                flex: "none",
                              }}
                            />
                            <span
                              style={{
                                minWidth: 0,
                                display: "flex",
                                alignItems: "baseline",
                                gap: "8px",
                                flexWrap: "wrap",
                                textAlign: "left",
                              }}
                            >
                              <strong style={{ wordBreak: "keep-all" }}>
                                {getStudentDisplayName(student)}
                              </strong>
                              {student.english_name ? (
                                <small style={{ margin: 0 }}>
                                  {student.english_name}
                                </small>
                              ) : null}
                              {isHistoricalStudent(student) ? (
                                <small style={{ margin: 0 }}>
                                  {getStudentStatusValue(student) || "歷史學生"}
                                </small>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {studentError && (
                    <div className="courseDrawer__error">{studentError}</div>
                  )}
                </div>

                <footer className="courseDrawer__footer">
                  <button
                    type="button"
                    className="courseDrawer__cancelButton"
                    onClick={closeStudentDrawer}
                    disabled={isSavingStudents}
                  >
                    關閉
                  </button>
                  <button
                    type="button"
                    className="courseDrawer__saveButton"
                    onClick={addSelectedStudents}
                    disabled={isSavingStudents || selectedStudentIds.length === 0}
                  >
                    {isSavingStudents
                      ? "加入中…"
                      : `加入班級（${selectedStudentIds.length}）`}
                  </button>
                </footer>
              </div>
            </aside>
          </div>
        )}

        {isScheduleDrawerOpen && schedulingClass && (
          <div
            className="courseDrawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-drawer-title"
          >
            <button
              type="button"
              className="courseDrawer__backdrop"
              onClick={closeScheduleDrawer}
              aria-label="關閉排課視窗"
            />

            <aside className="courseDrawer__panel">
              <header className="courseDrawer__header">
                <div>
                  <p>SCHEDULE</p>
                  <h2 id="schedule-drawer-title">安排課程日期</h2>
                </div>

                <button
                  type="button"
                  className="courseDrawer__closeButton"
                  onClick={closeScheduleDrawer}
                  disabled={isSavingSchedule}
                  aria-label="關閉"
                >
                  ×
                </button>
              </header>

              <div className="courseDrawer__form">
                <div className="courseDrawer__fields">
                  <div className="courseDrawer__field">
                    <span>班級</span>
                    <strong>{schedulingClass.class_name}</strong>
                    <small>
                      {getWeekdayLabel(schedulingClass.weekday)}｜
                      {normalizeTime(schedulingClass.start_time)}–
                      {normalizeTime(schedulingClass.end_time)}｜
                      {schedulingClass.total_sessions} 堂
                    </small>
                  </div>

                  <div className="courseDrawer__field">
                    <span>第一堂日期</span>
                    <strong>{formatDate(schedulingClass.first_lesson_date)}</strong>
                  </div>

                  <div className="courseDrawer__statusField">
                    <div>
                      <strong>套用共用休假日期</strong>
                      <p>所有課程統一套用，排課時會自動跳過已設定的單日與日期區間。</p>
                    </div>
                    <strong>自動套用</strong>
                  </div>

                  <div className="courseDrawer__field">
                    <span>目前套用的停課日期</span>
                    {isLoadingSchedule ? (
                      <small>正在讀取停課日期…</small>
                    ) : getAppliedExclusions().length === 0 ? (
                      <small>目前沒有符合條件的停課日期。</small>
                    ) : (
                      <div>
                        {getAppliedExclusions().map((item) => (
                          <p key={item.id}>
                            <strong>{item.title}</strong>　
                            {formatExclusionRange(item)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="coursePage__primaryButton"
                    onClick={previewSchedule}
                    disabled={isLoadingSchedule || isSavingSchedule}
                  >
                    預覽課程日期
                  </button>

                  {schedulePreview.length > 0 && (
                    <div className="courseDrawer__field">
                      <span>排課預覽</span>
                      <div>
                        {schedulePreview.map((session) => (
                          <p key={session.session_number}>
                            第 {session.session_number} 堂　
                            <strong>{formatDate(session.session_date)}</strong>　
                            {session.start_time}–{session.end_time}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {scheduleError && (
                    <div className="courseDrawer__error">{scheduleError}</div>
                  )}
                </div>

                <footer className="courseDrawer__footer">
                  <button
                    type="button"
                    className="courseDrawer__cancelButton"
                    onClick={closeScheduleDrawer}
                    disabled={isSavingSchedule}
                  >
                    取消
                  </button>

                  <button
                    type="button"
                    className="courseDrawer__saveButton"
                    onClick={generateSchedule}
                    disabled={
                      isSavingSchedule ||
                      isLoadingSchedule ||
                      schedulePreview.length === 0
                    }
                  >
                    {isSavingSchedule ? "產生中…" : "確認產生課程"}
                  </button>
                </footer>
              </div>
            </aside>
          </div>
        )}

        {isClassDrawerOpen && (
          <div
            className="courseDrawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-drawer-title"
          >
            <button
              type="button"
              className="courseDrawer__backdrop"
              onClick={closeClassDrawer}
              aria-label="關閉班級視窗"
            />

            <aside className="courseDrawer__panel">
              <header className="courseDrawer__header">
                <div>
                  <p>CLASS DETAILS</p>
                  <h2 id="class-drawer-title">
                    {selectedClass ? "編輯班級" : "新增班級"}
                  </h2>
                </div>

                <button
                  type="button"
                  className="courseDrawer__closeButton"
                  onClick={closeClassDrawer}
                  disabled={isSavingClass}
                  aria-label="關閉"
                >
                  ×
                </button>
              </header>

              <form className="courseDrawer__form" onSubmit={saveClass}>
                <div className="courseDrawer__fields">
                  <label className="courseDrawer__field">
                    <span>
                      班級名稱
                      <em>必填</em>
                    </span>
                    <input
                      type="text"
                      value={classForm.class_name}
                      onChange={(event) =>
                        updateClassForm("class_name", event.target.value)
                      }
                      placeholder={`例如：${managingCourse.course_name}一班`}
                      maxLength={50}
                      autoFocus
                    />
                  </label>

                  <label className="courseDrawer__field">
                    <span>每週上課日</span>
                    <select
                      value={classForm.weekday}
                      onChange={(event) =>
                        updateClassForm("weekday", event.target.value)
                      }
                    >
                      <option value="">尚未設定</option>
                      {WEEKDAY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="courseDrawer__field">
                    <span>開始時間</span>
                    <input
                      type="time"
                      value={classForm.start_time}
                      onChange={(event) =>
                        updateClassForm("start_time", event.target.value)
                      }
                    />
                  </label>

                  <label className="courseDrawer__field">
                    <span>結束時間</span>
                    <input
                      type="time"
                      value={classForm.end_time}
                      onChange={(event) =>
                        updateClassForm("end_time", event.target.value)
                      }
                    />
                  </label>

                  <label className="courseDrawer__field">
                    <span>第一堂日期</span>
                    <input
                      type="date"
                      value={classForm.first_lesson_date}
                      onChange={(event) =>
                        updateClassForm("first_lesson_date", event.target.value)
                      }
                    />
                  </label>

                  <label className="courseDrawer__field">
                    <span>
                      一期堂數
                      <em>必填</em>
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={classForm.total_sessions}
                      onChange={(event) =>
                        updateClassForm("total_sessions", event.target.value)
                      }
                    />
                    <small>預設為 12 堂，未來可依課程自行調整。</small>
                  </label>

                  <label className="courseDrawer__field">
                    <span>班級備註</span>
                    <textarea
                      value={classForm.note}
                      onChange={(event) =>
                        updateClassForm("note", event.target.value)
                      }
                      placeholder="可以記錄適合年級、上課提醒或班級說明..."
                      rows={5}
                      maxLength={500}
                    />
                    <small>{classForm.note.length}／500</small>
                  </label>

                  <div className="courseDrawer__statusField">
                    <div>
                      <strong>班級狀態</strong>
                      <p>停用後保留資料，但不列入目前進行中的班級。</p>
                    </div>

                    <label className="courseSwitch">
                      <input
                        type="checkbox"
                        checked={classForm.is_active}
                        onChange={(event) =>
                          updateClassForm("is_active", event.target.checked)
                        }
                      />
                      <span className="courseSwitch__track">
                        <span className="courseSwitch__thumb" />
                      </span>
                      <strong>
                        {classForm.is_active ? "啟用中" : "已停用"}
                      </strong>
                    </label>
                  </div>

                  {classFormError && (
                    <div className="courseDrawer__error">
                      {classFormError}
                    </div>
                  )}
                </div>

                <footer className="courseDrawer__footer">
                  <button
                    type="button"
                    className="courseDrawer__cancelButton"
                    onClick={closeClassDrawer}
                    disabled={isSavingClass}
                  >
                    取消
                  </button>

                  <button
                    type="submit"
                    className="courseDrawer__saveButton"
                    disabled={isSavingClass}
                  >
                    {isSavingClass
                      ? "儲存中…"
                      : selectedClass
                        ? "儲存修改"
                        : "建立班級"}
                  </button>
                </footer>
              </form>
            </aside>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="coursePage">
      <header className="coursePage__header">
        <div>
          <p className="coursePage__eyebrow">COURSE CENTER</p>
          <h1>課程管理</h1>
          <p className="coursePage__summary">
            建立倍思的才藝課程種類，並在各課程底下管理實際開設的班級。
          </p>
        </div>

        <div className="courseCard__actions">
          <button
            type="button"
            className="courseCard__editButton"
            onClick={openExclusionDrawer}
          >
            共用休假設定
          </button>

          <button
            type="button"
            className="coursePage__primaryButton"
            onClick={openNewCourseDrawer}
          >
            ＋ 新增課程
          </button>
        </div>
      </header>

      <section className="coursePage__stats">
        <div className="coursePage__statCard">
          <span>全部課程</span>
          <strong>{courses.length}</strong>
          <small>已建立的才藝課程種類</small>
        </div>

        <div className="coursePage__statCard">
          <span>目前啟用</span>
          <strong>{activeCourseCount}</strong>
          <small>目前可建立班級</small>
        </div>

        <div className="coursePage__statCard">
          <span>已停用</span>
          <strong>{inactiveCourseCount}</strong>
          <small>保留歷史資料</small>
        </div>

        <div className="coursePage__statCard">
          <span>所屬班級</span>
          <strong>{totalClassCount}</strong>
          <small>所有才藝課班級總數</small>
        </div>
      </section>

      <section className="coursePage__content">
        <div className="coursePage__toolbar">
          <label className="coursePage__search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="搜尋課程名稱或備註..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="課程狀態篩選"
          >
            <option value="ACTIVE">目前啟用</option>
            <option value="INACTIVE">已停用</option>
            <option value="ALL">全部狀態</option>
          </select>
        </div>

        <div className="coursePage__resultInfo">
          顯示 {filteredCourses.length} 個課程
        </div>

        {loadError && (
          <div className="coursePage__errorState">
            <p>{loadError}</p>
            <button type="button" onClick={loadCourses}>
              重新讀取
            </button>
          </div>
        )}

        {!loadError && isLoading && (
          <div className="coursePage__loadingState">正在讀取課程資料…</div>
        )}

        {!loadError && !isLoading && filteredCourses.length === 0 && (
          <div className="coursePage__emptyState">
            <div className="coursePage__emptyIcon">◎</div>
            <h2>
              {courses.length === 0 ? "尚未建立課程" : "找不到符合條件的課程"}
            </h2>
            <p>
              {courses.length === 0
                ? "先建立第一個才藝課程，之後就能在課程底下新增班級。"
                : "可以調整搜尋文字或狀態篩選。"}
            </p>

            {courses.length === 0 && (
              <button type="button" onClick={openNewCourseDrawer}>
                ＋ 新增第一個課程
              </button>
            )}
          </div>
        )}

        {!loadError && !isLoading && filteredCourses.length > 0 && (
          <div className="coursePage__grid">
            {filteredCourses.map((course) => {
              const classCount = getClassCount(course);
              const activeClassCount = getActiveClassCount(course);

              return (
                <article
                  key={course.id}
                  className={`courseCard ${
                    course.is_active ? "" : "courseCard--inactive"
                  }`}
                >
                  <div className="courseCard__top courseCard__top--statusOnly">
                    <span
                      className={`courseCard__status ${
                        course.is_active
                          ? "courseCard__status--active"
                          : "courseCard__status--inactive"
                      }`}
                    >
                      {course.is_active ? "啟用中" : "已停用"}
                    </span>
                  </div>

                  <div className="courseCard__body">
                    <h2>{course.course_name}</h2>
                    <p
                      className={
                        course.note
                          ? "courseCard__note"
                          : "courseCard__note courseCard__note--empty"
                      }
                    >
                      {course.note || "尚未填寫課程備註。"}
                    </p>
                  </div>

                  <div className="courseCard__classInfo">
                    <div>
                      <span>全部班級</span>
                      <strong>{classCount}</strong>
                    </div>
                    <div>
                      <span>啟用班級</span>
                      <strong>{activeClassCount}</strong>
                    </div>
                  </div>

                  <div className="courseCard__actions">
                    <button
                      type="button"
                      className="courseCard__manageButton"
                      onClick={() => openCourseClasses(course)}
                    >
                      管理班級
                    </button>

                    <button
                      type="button"
                      className="courseCard__editButton"
                      onClick={() => openEditCourseDrawer(course)}
                    >
                      編輯
                    </button>

                    <button
                      type="button"
                      className={
                        course.is_active
                          ? "courseCard__toggleButton courseCard__toggleButton--disable"
                          : "courseCard__toggleButton courseCard__toggleButton--enable"
                      }
                      onClick={() => toggleCourseStatus(course)}
                    >
                      {course.is_active ? "停用" : "重新啟用"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isExclusionDrawerOpen && (
        <div
          className="courseDrawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exclusion-drawer-title"
        >
          <button
            type="button"
            className="courseDrawer__backdrop"
            onClick={closeExclusionDrawer}
            aria-label="關閉共用休假設定"
          />

          <aside className="courseDrawer__panel">
            <header className="courseDrawer__header">
              <div>
                <p>SHARED DAYS OFF</p>
                <h2 id="exclusion-drawer-title">共用休假設定</h2>
              </div>

              <button
                type="button"
                className="courseDrawer__closeButton"
                onClick={closeExclusionDrawer}
                disabled={isSavingExclusion}
                aria-label="關閉"
              >
                ×
              </button>
            </header>

            <form className="courseDrawer__form" onSubmit={saveExclusion}>
              <div className="courseDrawer__fields">
                <div className="courseDrawer__field">
                  <span>套用範圍</span>
                  <strong>所有課程與所有班級</strong>
                  <small>新增一次，之後每個班級產生課程日期時都會自動跳過。</small>
                </div>

                <label className="courseDrawer__field">
                  <span>休假名稱 <em>必填</em></span>
                  <input
                    type="text"
                    value={exclusionForm.title}
                    onChange={(event) =>
                      updateExclusionForm("title", event.target.value)
                    }
                    placeholder="例如：中秋節補假、寒假"
                    maxLength={80}
                    autoFocus
                  />
                </label>

                <label className="courseDrawer__field">
                  <span>日期類型</span>
                  <select
                    value={exclusionForm.date_mode}
                    onChange={(event) =>
                      updateExclusionForm("date_mode", event.target.value)
                    }
                  >
                    <option value="SINGLE">單日</option>
                    <option value="RANGE">日期區間</option>
                  </select>
                </label>

                <label className="courseDrawer__field">
                  <span>
                    {exclusionForm.date_mode === "SINGLE" ? "休假日期" : "開始日期"}
                    <em>必填</em>
                  </span>
                  <input
                    type="date"
                    value={exclusionForm.start_date}
                    onChange={(event) =>
                      updateExclusionForm("start_date", event.target.value)
                    }
                  />
                </label>

                {exclusionForm.date_mode === "RANGE" && (
                  <label className="courseDrawer__field">
                    <span>結束日期 <em>必填</em></span>
                    <input
                      type="date"
                      value={exclusionForm.end_date}
                      min={exclusionForm.start_date || undefined}
                      onChange={(event) =>
                        updateExclusionForm("end_date", event.target.value)
                      }
                    />
                  </label>
                )}

                <label className="courseDrawer__field">
                  <span>備註</span>
                  <textarea
                    value={exclusionForm.note}
                    onChange={(event) =>
                      updateExclusionForm("note", event.target.value)
                    }
                    placeholder="選填"
                    rows={3}
                    maxLength={300}
                  />
                </label>

                {exclusionError && (
                  <div className="courseDrawer__error">{exclusionError}</div>
                )}

                <div className="courseDrawer__field">
                  <span>已設定的共用休假</span>

                  {isLoadingExclusions ? (
                    <small>正在讀取共用休假…</small>
                  ) : globalExclusions.length === 0 ? (
                    <small>目前尚未設定任何休假日期。</small>
                  ) : (
                    <div>
                      {globalExclusions.map((item) => (
                        <div key={item.id} className="courseCard__actions">
                          <p>
                            <strong>{item.title}</strong>　{formatExclusionRange(item)}
                          </p>
                          <button
                            type="button"
                            className="courseCard__editButton"
                            onClick={() => editExclusion(item)}
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            className="courseCard__toggleButton courseCard__toggleButton--disable"
                            onClick={() => deleteExclusion(item)}
                          >
                            刪除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <footer className="courseDrawer__footer">
                {selectedExclusion && (
                  <button
                    type="button"
                    className="courseDrawer__cancelButton"
                    onClick={cancelEditExclusion}
                    disabled={isSavingExclusion}
                  >
                    取消編輯
                  </button>
                )}

                <button
                  type="button"
                  className="courseDrawer__cancelButton"
                  onClick={closeExclusionDrawer}
                  disabled={isSavingExclusion}
                >
                  關閉
                </button>

                <button
                  type="submit"
                  className="courseDrawer__saveButton"
                  disabled={isSavingExclusion}
                >
                  {isSavingExclusion
                    ? "儲存中…"
                    : selectedExclusion
                      ? "儲存修改"
                      : "新增休假"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}

      {isCourseDrawerOpen && (
        <div
          className="courseDrawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="course-drawer-title"
        >
          <button
            type="button"
            className="courseDrawer__backdrop"
            onClick={closeCourseDrawer}
            aria-label="關閉課程視窗"
          />

          <aside className="courseDrawer__panel">
            <header className="courseDrawer__header">
              <div>
                <p>COURSE DETAILS</p>
                <h2 id="course-drawer-title">
                  {selectedCourse ? "編輯課程" : "新增課程"}
                </h2>
              </div>

              <button
                type="button"
                className="courseDrawer__closeButton"
                onClick={closeCourseDrawer}
                disabled={isSavingCourse}
                aria-label="關閉"
              >
                ×
              </button>
            </header>

            <form className="courseDrawer__form" onSubmit={saveCourse}>
              <div className="courseDrawer__fields">
                <label className="courseDrawer__field">
                  <span>
                    課程名稱
                    <em>必填</em>
                  </span>
                  <input
                    type="text"
                    value={courseForm.course_name}
                    onChange={(event) =>
                      updateCourseForm("course_name", event.target.value)
                    }
                    placeholder="例如：戰略圍棋"
                    maxLength={50}
                    autoFocus
                  />
                  <small>
                    每個才藝課程只需建立一次，之後可在課程底下建立多個班級。
                  </small>
                </label>

                <label className="courseDrawer__field">
                  <span>課程備註</span>
                  <textarea
                    value={courseForm.note}
                    onChange={(event) =>
                      updateCourseForm("note", event.target.value)
                    }
                    placeholder="可以記錄課程定位、適合年級或管理說明..."
                    rows={6}
                    maxLength={500}
                  />
                  <small>{courseForm.note.length}／500</small>
                </label>

                <div className="courseDrawer__statusField">
                  <div>
                    <strong>課程狀態</strong>
                    <p>
                      停用後會保留原有班級與歷史資料，但無法再新增班級。
                    </p>
                  </div>

                  <label className="courseSwitch">
                    <input
                      type="checkbox"
                      checked={courseForm.is_active}
                      onChange={(event) =>
                        updateCourseForm("is_active", event.target.checked)
                      }
                    />
                    <span className="courseSwitch__track">
                      <span className="courseSwitch__thumb" />
                    </span>
                    <strong>
                      {courseForm.is_active ? "啟用中" : "已停用"}
                    </strong>
                  </label>
                </div>

                {courseFormError && (
                  <div className="courseDrawer__error">
                    {courseFormError}
                  </div>
                )}
              </div>

              <footer className="courseDrawer__footer">
                <button
                  type="button"
                  className="courseDrawer__cancelButton"
                  onClick={closeCourseDrawer}
                  disabled={isSavingCourse}
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="courseDrawer__saveButton"
                  disabled={isSavingCourse}
                >
                  {isSavingCourse
                    ? "儲存中…"
                    : selectedCourse
                      ? "儲存修改"
                      : "建立課程"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

export default CoursePage;
