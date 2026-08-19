const STATUS_LABELS = {
  PLANNING: "規劃中",
  ACTIVE: "進行中",
  ARCHIVED: "已封存",
};

const CAMP_SECTIONS = [
  {
    key: "overview",
    title: "總覽",
    description: "查看本期營隊設定與目前進度。",
  },
  {
    key: "students",
    title: "學生與每日報名",
    description: "管理本期學生與每天的參加內容。",
  },
  {
    key: "classes",
    title: "營隊編班",
    description: "建立編班區間並安排各班學生。",
  },
  {
    key: "staff",
    title: "工作人員",
    description: "建立這一期自己的工作人員與請假資料。",
  },
  {
    key: "schedule",
    title: "人員排班",
    description: "安排主帶、助教、特殊任務與每日班別。",
  },
  {
    key: "cleaning",
    title: "清潔與工作安排",
    description: "設定本期清潔項目與每日輪值。",
  },
  {
    key: "export",
    title: "輸出",
    description: "產出班級點名表、工作人員班表與營隊總表。",
  },
];

function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const [year, month, day] = String(
    dateString
  ).split("-");

  return `${year}/${month}/${day}`;
}

function CampDetailPage({
  camp,
  onBack,
}) {
  return (
    <div className="campPage">
      <button
        type="button"
        className="campBackButton"
        onClick={onBack}
      >
        ← 返回營隊列表
      </button>

      <header className="campDetailHeader">
        <div>
          <p className="campEyebrow">
            CAMP FOLDER
          </p>

          <h1>{camp.name}</h1>

          <p>
            {formatDate(camp.start_date)}
            {" — "}
            {formatDate(camp.end_date)}
          </p>
        </div>

        <span className="campDetailHeader__status">
          {STATUS_LABELS[camp.status] || camp.status}
        </span>
      </header>

      <section className="campDetailIntro">
        <strong>
          這是一個獨立營隊資料夾
        </strong>

        <p>
          此處建立的學生、編班、工作人員、
          排班與清潔資料只屬於這一期營隊。
        </p>
      </section>

      <section className="campSectionGrid">
        {CAMP_SECTIONS.map((section) => (
          <article
            key={section.key}
            className="campSectionCard"
          >
            <span className="campSectionCard__dot" />

            <h2>{section.title}</h2>

            <p>{section.description}</p>

            <button
              type="button"
              disabled
            >
              即將建立
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

export default CampDetailPage;