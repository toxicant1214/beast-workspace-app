import LeaveWorkflowPanel from "../components/leave/LeaveWorkflowPanel";

import "./LeaveManagementPage.css";


/**
 * 老師用：我的請假
 * 只看得到自己的請假，以及自己被排到的代班。
 */
function MyLeavePage() {
  return (
    <div className="leave-management-page">
      <div className="leave-page-header">
        <div>
          <p className="leave-page-eyebrow">STAFF MANAGEMENT</p>
          <h1>休假管理</h1>
          <p>請假前先找好代理人、填好交接單，送出後由主管確認。</p>
        </div>
      </div>

      <LeaveWorkflowPanel mode="teacher" />
    </div>
  );
}


export default MyLeavePage;
