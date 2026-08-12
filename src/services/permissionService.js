export function isAdmin(currentTeacher) {
  return currentTeacher?.role === "admin";
}


export function getPagePermissionLevel(
  currentTeacher,
  pageKey
) {
  if (isAdmin(currentTeacher)) {
    return "edit";
  }


  const permissions =
    currentTeacher?.permissions;


  if (!permissions) {
    return "hidden";
  }


  const pagePermission =
    permissions?.[pageKey];


  if (!pagePermission) {
    return "hidden";
  }


  if (
    pagePermission.level === "edit"
    || pagePermission.edit === true
  ) {
    return "edit";
  }


  if (
    pagePermission.level === "view"
    || pagePermission.view === true
  ) {
    return "view";
  }


  return "hidden";
}


export function hasPagePermission(
  currentTeacher,
  pageKey
) {
  const level =
    getPagePermissionLevel(
      currentTeacher,
      pageKey
    );


  return (
    level === "view"
    || level === "edit"
  );
}


export function canEditPage(
  currentTeacher,
  pageKey
) {
  return (
    getPagePermissionLevel(
      currentTeacher,
      pageKey
    ) === "edit"
  );
}


export function hasActionPermission(
  currentTeacher,
  pageKey,
  action
) {
  if (isAdmin(currentTeacher)) {
    return true;
  }


  const permissions =
    currentTeacher?.permissions;


  if (!permissions) {
    return false;
  }


  const pagePermission =
    permissions?.[pageKey];


  if (!pagePermission) {
    return false;
  }


  if (action === "view") {
    return hasPagePermission(
      currentTeacher,
      pageKey
    );
  }


  if (
    action === "edit"
    || action === "create"
    || action === "update"
    || action === "delete"
  ) {
    return canEditPage(
      currentTeacher,
      pageKey
    );
  }


  return (
    pagePermission?.[action]
    === true
  );
}