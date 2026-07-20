import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const defaultTeacherPermissions = {
  dashboard: {
    view: true,
  },
  calendar: {
    view: true,
    create: false,
    edit: false,
    delete: false,
  },
  cleaning: {
    view: true,
    manage: false,
    view_scope: "all",
  },
  teacher_assignments: {
    view: true,
    create: false,
    edit: false,
    delete: false,
    view_scope: "own",
    confirm_own: true,
    admin_confirm: false,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanNullableText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned || null;
}

function cleanTeacherPayload(rawTeacher: Record<string, unknown>) {
  return {
    chinese_name: cleanNullableText(rawTeacher.chinese_name),
    english_name: cleanNullableText(rawTeacher.english_name),
    position: cleanNullableText(rawTeacher.position),
    phone: cleanNullableText(rawTeacher.phone),
    email: cleanNullableText(rawTeacher.email)?.toLowerCase() ?? null,
    hire_date:
      typeof rawTeacher.hire_date === "string" && rawTeacher.hire_date
        ? rawTeacher.hire_date
        : null,
    notes: cleanNullableText(rawTeacher.notes),
    status:
      rawTeacher.status === "inactive"
        ? "inactive"
        : "active",
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "Edge Function 環境變數尚未設定完整。" },
      500
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const authorization = request.headers.get("Authorization");
    const accessToken = authorization?.replace(/^Bearer\s+/i, "");

    if (!accessToken) {
      return jsonResponse({ error: "缺少登入憑證。" }, 401);
    }

    const {
      data: { user: caller },
      error: callerError,
    } = await adminClient.auth.getUser(accessToken);

    if (callerError || !caller) {
      return jsonResponse(
        { error: "登入狀態無效，請重新登入。" },
        401
      );
    }

    const { data: callerTeacher, error: callerTeacherError } =
      await adminClient
        .from("teachers")
        .select("id, role, status")
        .eq("auth_user_id", caller.id)
        .maybeSingle();

    if (callerTeacherError) {
      throw callerTeacherError;
    }

    if (
      !callerTeacher ||
      callerTeacher.role !== "admin" ||
      callerTeacher.status !== "active"
    ) {
      return jsonResponse(
        { error: "只有在職管理員可以執行這項操作。" },
        403
      );
    }

    const body = await request.json();
    const action = body?.action;

    if (action === "invite-new") {
      const teacher = cleanTeacherPayload(body?.teacher ?? {});
      const redirectTo = cleanNullableText(body?.redirectTo);

      if (!teacher.chinese_name) {
        return jsonResponse(
          { error: "請輸入老師中文姓名。" },
          400
        );
      }

      if (!teacher.email) {
        return jsonResponse(
          { error: "請輸入老師登入 Email。" },
          400
        );
      }

      if (!redirectTo) {
        return jsonResponse(
          { error: "缺少邀請信返回網址。" },
          400
        );
      }

      const { data: duplicateTeacher, error: duplicateError } =
        await adminClient
          .from("teachers")
          .select("id, chinese_name")
          .ilike("email", teacher.email)
          .maybeSingle();

      if (duplicateError) {
        throw duplicateError;
      }

      if (duplicateTeacher) {
        return jsonResponse(
          {
            error:
              `這個 Email 已經綁定「${duplicateTeacher.chinese_name}」，` +
              "請改用編輯原本老師資料的方式補建帳號。",
          },
          409
        );
      }

      const { data: invited, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(
          teacher.email,
          {
            redirectTo,
            data: {
              chinese_name: teacher.chinese_name,
              role: "teacher",
            },
          }
        );

      if (inviteError) {
        if (
          inviteError.message?.toLowerCase().includes("already") ||
          inviteError.message?.toLowerCase().includes("registered")
        ) {
          return jsonResponse(
            {
              error:
                "這個 Email 已經存在 Supabase Auth，無法重複建立登入帳號。",
            },
            409
          );
        }

        throw inviteError;
      }

      const authUserId = invited?.user?.id;

      if (!authUserId) {
        return jsonResponse(
          { error: "建立登入帳號後未取得使用者 ID。" },
          500
        );
      }

      const { data: createdTeacher, error: insertError } =
        await adminClient
          .from("teachers")
          .insert({
            ...teacher,
            leave_date: null,
            role: "teacher",
            auth_user_id: authUserId,
            permissions: defaultTeacherPermissions,
          })
          .select()
          .single();

      if (insertError) {
        await adminClient.auth.admin.deleteUser(authUserId);
        throw insertError;
      }

      return jsonResponse({
        message: "老師帳號已建立，邀請信已寄出。",
        teacher: createdTeacher,
      });
    }

    if (action === "invite-existing") {
      const teacherId = cleanNullableText(body?.teacherId);
      const teacher = cleanTeacherPayload(body?.teacher ?? {});
      const redirectTo = cleanNullableText(body?.redirectTo);

      if (!teacherId) {
        return jsonResponse({ error: "缺少老師 ID。" }, 400);
      }

      if (!teacher.chinese_name) {
        return jsonResponse(
          { error: "請輸入老師中文姓名。" },
          400
        );
      }

      if (!teacher.email) {
        return jsonResponse(
          { error: "請輸入老師登入 Email。" },
          400
        );
      }

      if (!redirectTo) {
        return jsonResponse(
          { error: "缺少邀請信返回網址。" },
          400
        );
      }

      const { data: existingTeacher, error: existingTeacherError } =
        await adminClient
          .from("teachers")
          .select("id, auth_user_id, role")
          .eq("id", teacherId)
          .single();

      if (existingTeacherError) {
        throw existingTeacherError;
      }

      if (existingTeacher.role === "admin") {
        return jsonResponse(
          { error: "管理員帳號不可透過這個功能重新綁定。" },
          400
        );
      }

      if (existingTeacher.auth_user_id) {
        return jsonResponse(
          { error: "這位老師已經建立登入帳號。" },
          409
        );
      }

      const { data: duplicateTeacher, error: duplicateError } =
        await adminClient
          .from("teachers")
          .select("id, chinese_name")
          .ilike("email", teacher.email)
          .neq("id", teacherId)
          .maybeSingle();

      if (duplicateError) {
        throw duplicateError;
      }

      if (duplicateTeacher) {
        return jsonResponse(
          {
            error:
              `這個 Email 已經綁定「${duplicateTeacher.chinese_name}」。`,
          },
          409
        );
      }

      const { data: invited, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(
          teacher.email,
          {
            redirectTo,
            data: {
              chinese_name: teacher.chinese_name,
              role: "teacher",
            },
          }
        );

      if (inviteError) {
        if (
          inviteError.message?.toLowerCase().includes("already") ||
          inviteError.message?.toLowerCase().includes("registered")
        ) {
          return jsonResponse(
            {
              error:
                "這個 Email 已經存在 Supabase Auth，無法再建立邀請帳號。",
            },
            409
          );
        }

        throw inviteError;
      }

      const authUserId = invited?.user?.id;

      if (!authUserId) {
        return jsonResponse(
          { error: "建立登入帳號後未取得使用者 ID。" },
          500
        );
      }

      const { data: updatedTeacher, error: updateError } =
        await adminClient
          .from("teachers")
          .update({
            ...teacher,
            leave_date:
              teacher.status === "inactive"
                ? new Date().toISOString().slice(0, 10)
                : null,
            role: "teacher",
            auth_user_id: authUserId,
            permissions: defaultTeacherPermissions,
          })
          .eq("id", teacherId)
          .select()
          .single();

      if (updateError) {
        await adminClient.auth.admin.deleteUser(authUserId);
        throw updateError;
      }

      return jsonResponse({
        message: "既有老師資料已更新，登入邀請已寄出。",
        teacher: updatedTeacher,
      });
    }

    if (action === "set-status") {
      const teacherId = cleanNullableText(body?.teacherId);
      const status = body?.status;

      if (
        !teacherId ||
        !["active", "inactive"].includes(status)
      ) {
        return jsonResponse(
          { error: "老師 ID 或狀態不正確。" },
          400
        );
      }

      const { data: updatedTeacher, error: updateError } =
        await adminClient
          .from("teachers")
          .update({
            status,
            leave_date:
              status === "inactive"
                ? new Date().toISOString().slice(0, 10)
                : null,
          })
          .eq("id", teacherId)
          .select()
          .single();

      if (updateError) {
        throw updateError;
      }

      return jsonResponse({
        message:
          status === "inactive"
            ? "老師已停用。"
            : "老師已恢復在職。",
        teacher: updatedTeacher,
      });
    }

    if (action === "delete") {
      const teacherId = cleanNullableText(body?.teacherId);

      if (!teacherId) {
        return jsonResponse({ error: "缺少老師 ID。" }, 400);
      }

      const { data: targetTeacher, error: targetError } =
        await adminClient
          .from("teachers")
          .select("id, chinese_name, role, auth_user_id")
          .eq("id", teacherId)
          .single();

      if (targetError) {
        throw targetError;
      }

      if (targetTeacher.role === "admin") {
        return jsonResponse(
          { error: "不可永久刪除管理員帳號。" },
          400
        );
      }

      // 先刪 teachers。若受到其他資料的外鍵保護，會在這裡明確失敗，
      // 不會先把 Auth 帳號刪掉而留下不完整資料。
      const { error: deleteTeacherError } =
        await adminClient
          .from("teachers")
          .delete()
          .eq("id", teacherId);

      if (deleteTeacherError) {
        if (deleteTeacherError.code === "23503") {
          return jsonResponse(
            {
              error:
                "這位老師已有任務、排班或其他歷史紀錄，因此不能永久刪除。請改用「停用老師」。",
            },
            409
          );
        }

        throw deleteTeacherError;
      }

      if (targetTeacher.auth_user_id) {
        const { error: deleteAuthError } =
          await adminClient.auth.admin.deleteUser(
            targetTeacher.auth_user_id
          );

        if (deleteAuthError) {
          console.error(
            "老師資料已刪除，但 Auth 帳號刪除失敗：",
            deleteAuthError
          );

          return jsonResponse(
            {
              error:
                "老師資料已刪除，但登入帳號刪除失敗，請到 Supabase Authentication → Users 手動確認。",
            },
            500
          );
        }
      }

      return jsonResponse({
        message:
          targetTeacher.auth_user_id
            ? "老師資料與登入帳號已永久刪除。"
            : "老師資料已永久刪除。",
      });
    }

    return jsonResponse({ error: "不支援的操作。" }, 400);
  } catch (error) {
    console.error("invite-teacher function error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "伺服器處理失敗，請稍後再試。",
      },
      500
    );
  }
});
