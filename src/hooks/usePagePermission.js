import {
  canEditPage,
  getPagePermissionLevel,
  hasPagePermission,
  isAdmin,
} from "../services/permissionService";


export function usePagePermission(
  currentTeacher,
  pageKey
) {
  const level = getPagePermissionLevel(
    currentTeacher,
    pageKey
  );


  return {
    level,

    isAdmin: isAdmin(
      currentTeacher
    ),

    canView: hasPagePermission(
      currentTeacher,
      pageKey
    ),

    canEdit: canEditPage(
      currentTeacher,
      pageKey
    ),

    isHidden:
      level === "hidden",

    isViewOnly:
      level === "view",

    isEditable:
      level === "edit",
  };
}