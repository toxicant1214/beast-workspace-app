import { supabase } from "../lib/supabase";


export async function getTeacherPermissions(
  teacherId
) {
  const { data, error } = await supabase
    .from("teacher_permissions")
    .select(
      "id, teacher_id, module_key, permission_level, data_scope"
    )
    .eq("teacher_id", teacherId);


  if (error) {
    throw error;
  }


  return data || [];
}


export async function saveTeacherPermissions(
  teacherId,
  permissions
) {
  const rows = permissions.map(
    (permission) => ({
      teacher_id: teacherId,
      module_key: permission.module_key,
      permission_level:
        permission.permission_level,
      data_scope:
        permission.data_scope || "own",
      updated_at: new Date().toISOString(),
    })
  );


  if (rows.length === 0) {
    return [];
  }


  const { data, error } = await supabase
    .from("teacher_permissions")
    .upsert(rows, {
      onConflict: "teacher_id,module_key",
    })
    .select();


  if (error) {
    throw error;
  }


  return data || [];
}