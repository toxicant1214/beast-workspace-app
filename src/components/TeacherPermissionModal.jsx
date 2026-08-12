import {
  useEffect,
  useState,
} from "react";

import {
  getTeacherPermissions,
  saveTeacherPermissions,
} from "../services/teacherPermissionService";

import "./TeacherPermissionModal.css";


const PERMISSION_MODULES = [
  {
    key: "dashboard",
    label: "首頁",
    description: "老師登入後的首頁與工作摘要",
  },
  {
    key: "students",
    label: "學生資料",
    description: "學生基本資料與相關紀錄",
  },
  {
    key: "teacher_assignments",
    label: "老師任務",
    description: "查看與處理自己的老師任務",
  },
  {
    key: "classes",
    label: "班級管理",
    description: "班級資料與學生編班資訊",
    editOnly: true,
  },
  {
    key: "courses",
    label: "課程管理",
    description: "才藝班、單日課程、美語班與補課",
    editOnly: true,
  },
  {
    key: "camps",
    label: "營隊管理",
    description: "寒暑假營隊與活動資料",
  },
  {
    key: "calendar",
    label: "行事曆",
    description: "校區行程與活動安排",
  },
  {
    key: "pickup",
    label: "接送管理",
    description: "學生接送與路隊資料",
  },
  {
    key: "learning_reports",
    label: "學習報告書",
    description: "學生學習報告與相關資料",
  },
  {
    key: "camp_schedule",
    label: "營隊排班",
    description: "營隊期間老師排班安排",
  },
  {
    key: "cleaning",
    label: "清潔分配",
    description: "老師清潔工作與輪值安排",
  },
  {
    key: "score_analysis",
    label: "成績分析",
    description: "學生成績與分析資料",
  },
];


const LEVEL_OPTIONS = [
  {
    value: "hidden",
    label: "完全不顯示",
  },
  {
    value: "view",
    label: "僅查看",
  },
  {
    value: "edit",
    label: "可編輯",
  },
];


const EDIT_ONLY_LEVEL_OPTIONS = [
  {
    value: "hidden",
    label: "完全不顯示",
  },
  {
    value: "edit",
    label: "可編輯",
  },
];


function createDefaultPermissions() {
  return Object.fromEntries(
    PERMISSION_MODULES.map(
      (module) => [
        module.key,
        "hidden",
      ]
    )
  );
}


function TeacherPermissionModal({
  teacher,
  onClose,
  onSaved,
}) {
  const [
    permissions,
    setPermissions,
  ] = useState(
    createDefaultPermissions()
  );


  const [loading, setLoading] =
    useState(true);


  const [saving, setSaving] =
    useState(false);


  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");


  useEffect(() => {
    if (!teacher?.id) {
      return;
    }

    loadPermissions();
  }, [teacher?.id]);


  async function loadPermissions() {
    try {
      setLoading(true);
      setErrorMessage("");


      const rows =
        await getTeacherPermissions(
          teacher.id
        );


      const nextPermissions =
        createDefaultPermissions();


      rows.forEach((row) => {
        if (
          Object.prototype.hasOwnProperty.call(
            nextPermissions,
            row.module_key
          )
        ) {
          const module =
            PERMISSION_MODULES.find(
              (item) =>
                item.key ===
                row.module_key
            );


          const storedLevel =
            row.permission_level ||
            "hidden";


          /*
           * 班級管理、課程管理不接受 view。
           * 如果舊資料曾存過 view，
           * 載入時直接視為 hidden。
           */
          if (
            module?.editOnly &&
            storedLevel === "view"
          ) {
            nextPermissions[
              row.module_key
            ] = "hidden";
          } else {
            nextPermissions[
              row.module_key
            ] = storedLevel;
          }
        }
      });


      setPermissions(
        nextPermissions
      );
    } catch (error) {
      console.error(
        "讀取老師權限失敗：",
        error
      );


      setErrorMessage(
        "權限資料讀取失敗，請稍後再試。"
      );
    } finally {
      setLoading(false);
    }
  }


  function changePermission(
    moduleKey,
    level
  ) {
    setPermissions(
      (current) => ({
        ...current,
        [moduleKey]: level,
      })
    );
  }


  async function handleSave() {
    try {
      setSaving(true);
      setErrorMessage("");


      const rows =
        PERMISSION_MODULES.map(
          (module) => {
            let permissionLevel =
              permissions[
                module.key
              ] || "hidden";


            /*
             * 再加一道防線：
             * editOnly 模組不能存成 view。
             */
            if (
              module.editOnly &&
              permissionLevel ===
                "view"
            ) {
              permissionLevel =
                "hidden";
            }


            return {
              module_key:
                module.key,

              permission_level:
                permissionLevel,

              data_scope:
                "own",
            };
          }
        );


      await saveTeacherPermissions(
        teacher.id,
        rows
      );


      if (onSaved) {
        await onSaved();
      }


      onClose();
    } catch (error) {
      console.error(
        "儲存老師權限失敗：",
        error
      );


      setErrorMessage(
        error?.message ||
          "權限儲存失敗，請稍後再試。"
      );
    } finally {
      setSaving(false);
    }
  }


  if (!teacher) {
    return null;
  }


  const teacherName =
    teacher.chinese_name ||
    teacher.english_name ||
    "老師";


  return (
    <div
      className="teacherPermission__backdrop"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !saving
        ) {
          onClose();
        }
      }}
    >
      <section
        className="teacherPermission"
        role="dialog"
        aria-modal="true"
      >
        <header className="teacherPermission__header">
          <div>
            <p>
              PERMISSION SETTINGS
            </p>


            <h2>
              {teacherName}｜權限設定
            </h2>


            <span>
              設定老師登入 Workspace
              後可查看與操作的功能。
            </span>
          </div>


          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="關閉"
          >
            ×
          </button>
        </header>


        <div className="teacherPermission__body">
          {loading ? (
            <div className="teacherPermission__loading">
              正在讀取權限設定……
            </div>
          ) : (
            <>
              <div className="teacherPermission__legend">
                <span>
                  完全不顯示
                </span>

                <span>
                  僅查看
                </span>

                <span>
                  可編輯
                </span>
              </div>


              <div className="teacherPermission__list">
                {PERMISSION_MODULES.map(
                  (module) => {
                    const options =
                      module.editOnly
                        ? EDIT_ONLY_LEVEL_OPTIONS
                        : LEVEL_OPTIONS;


                    return (
                      <article
                        key={module.key}
                        className="teacherPermission__row"
                      >
                        <div className="teacherPermission__info">
                          <strong>
                            {module.label}
                          </strong>


                          <span>
                            {
                              module.description
                            }
                          </span>
                        </div>


                        <div className="teacherPermission__options">
                          {options.map(
                            (option) => (
                              <label
                                key={
                                  option.value
                                }
                                className={
                                  permissions[
                                    module.key
                                  ] ===
                                  option.value
                                    ? "teacherPermission__option is-selected"
                                    : "teacherPermission__option"
                                }
                              >
                                <input
                                  type="radio"
                                  name={
                                    `permission-${module.key}`
                                  }
                                  value={
                                    option.value
                                  }
                                  checked={
                                    permissions[
                                      module.key
                                    ] ===
                                    option.value
                                  }
                                  onChange={() =>
                                    changePermission(
                                      module.key,
                                      option.value
                                    )
                                  }
                                />


                                <span>
                                  {
                                    option.label
                                  }
                                </span>
                              </label>
                            )
                          )}
                        </div>
                      </article>
                    );
                  }
                )}
              </div>
            </>
          )}


          {errorMessage && (
            <div className="teacherPermission__error">
              {errorMessage}
            </div>
          )}
        </div>


        <footer className="teacherPermission__footer">
          <button
            type="button"
            className="teacherPermission__cancel"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>


          <button
            type="button"
            className="teacherPermission__save"
            onClick={handleSave}
            disabled={
              saving ||
              loading
            }
          >
            {saving
              ? "儲存中……"
              : "儲存權限"}
          </button>
        </footer>
      </section>
    </div>
  );
}


export default TeacherPermissionModal;