export function isAdmin(currentTeacher) {
  return currentTeacher?.role === "admin";
}

export function hasPagePermission(currentTeacher, pageKey) {
  if (isAdmin(currentTeacher)) {
    return true;
  }

  const permissions = currentTeacher?.permissions;

  if (!permissions) {
    return false;
  }

  return permissions?.[pageKey]?.view === true;
}

export function hasActionPermission(
  currentTeacher,
  pageKey,
  action
) {
  if (isAdmin(currentTeacher)) {
    return true;
  }

  const permissions = currentTeacher?.permissions;

  if (!permissions) {
    return false;
  }

  return permissions?.[pageKey]?.[action] === true;
}