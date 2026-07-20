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
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Edge Function 環境變數尚未設定完整。" }, 500);
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
      return jsonResponse({ error: "登入狀態無效，請重新登入。" }, 401);
    }

    const { data: adminTeacher, error: adminTeacherError } = await adminClient
      .from("teachers")
      .select("id, role, status")
      .eq("auth_user_id", caller.id)
      .maybeSingle();

    if (adminTeacherError) {
      throw adminTeacherError;
    }

    if (
      !adminTeacher ||
      adminTeacher.role !== "admin" ||
      adminTeacher.status !== "active"
    ) {
      return jsonResponse({ error: "只有在職管理員可以執行這項操作。" }, 403);
    }

    const body = await request.json();
    const action = body?.action;

    if (action === "invite") {
      const teacher = body?.teacher ?? {};
      const chineseName = cleanNullableText(teacher.chinese_name);
      const email = cleanNullableText(teacher.email)?.toLowerCase();
      const redirectTo = cleanNullableText(body?.redirectTo);

      if (!chineseName) {
        return jsonResponse({ error: "請輸入老師中文姓名。" }, 400);
      }

      if (!email) {
        return jsonResponse({ error: "請輸入老師登入 Email。" }, 400);
      }

      if (!redirectTo) {
        return jsonResponse({ error: "缺少邀請信返回網址。" }, 400);
      }

      const { data: duplicateTeacher } = await adminClient
        .from("teachers")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (duplicateTeacher) {
        return jsonResponse({ error: "這個 Email 已經綁定其他老師。" }, 409);
      }

      const { data: invited, error: inviteError } =
        await adminClient.auth.admin.inviteUserByEmail(email, {
          redirectTo,
          data: {
            chinese_name: chineseName,
            role: "teacher",
          },
        });

      if (inviteError) {
        if (
          inviteError.message?.toLowerCase().includes("already") ||
          inviteError.message?.toLowerCase().includes("registered")
        ) {
          return jsonResponse(
            { error: "這個 Email 已經有 Supabase 登入帳號，無法重複邀請。" },
            409
          );
        }

        throw inviteError;
      }

      const authUserId = invited?.user?.id;

      if (!authUserId) {
        return jsonResponse({ error: "建立登入帳號後未取得使用者 ID。" }, 500);
      }

      const insertPayload = {
        chinese_name: chineseName,
        english_name: cleanNullableText(teacher.english_name),
        position: cleanNullableText(teacher.position),
        phone: cleanNullableText(teacher.phone),
        email,
        hire_date: teacher.hire_date || null,
        leave_date: null,
        notes: cleanNullableText(teacher.notes),
        status: "active",
        role: "teacher",
        auth_user_id: authUserId,
        permissions: defaultTeacherPermissions,
      };

      const { data: createdTeacher, error: insertError } = await adminClient
        .from("teachers")
        .insert(insertPayload)
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

    if (action === "set-status") {
      const teacherId = cleanNullableText(body?.teacherId);
      const status = body?.status;

      if (!teacherId || !["active", "inactive"].includes(status)) {
        return jsonResponse({ error: "老師 ID 或狀態不正確。" }, 400);
      }

      const payload = {
        status,
        leave_date:
          status === "inactive"
            ? new Date().toISOString().slice(0, 10)
            : null,
      };

      const { data: updatedTeacher, error: updateError } = await adminClient
        .from("teachers")
        .update(payload)
        .eq("id", teacherId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return jsonResponse({
        message: status === "inactive" ? "老師已停用。" : "老師已恢復在職。",
        teacher: updatedTeacher,
      });
    }

    if (action === "delete") {
      const teacherId = cleanNullableText(body?.teacherId);

      if (!teacherId) {
        return jsonResponse({ error: "缺少老師 ID。" }, 400);
      }

      const { data: targetTeacher, error: targetError } = await adminClient
        .from("teachers")
        .select("id, role, auth_user_id")
        .eq("id", teacherId)
        .single();

      if (targetError) {
        throw targetError;
      }

      if (targetTeacher.role === "admin") {
        return jsonResponse({ error: "不可從老師管理永久刪除管理員帳號。" }, 400);
      }

      const { error: deleteTeacherError } = await adminClient
        .from("teachers")
        .delete()
        .eq("id", teacherId);

      if (deleteTeacherError) {
        throw deleteTeacherError;
      }

      if (targetTeacher.auth_user_id) {
        const { error: deleteAuthError } =
          await adminClient.auth.admin.deleteUser(targetTeacher.auth_user_id);

        if (deleteAuthError) {
          console.error("老師資料已刪除，但 Auth 帳號刪除失敗：", deleteAuthError);
          return jsonResponse(
            {
              error:
                "老師資料已刪除，但登入帳號刪除失敗，請到 Supabase Auth 手動確認。",
            },
            500
          );
        }
      }

      return jsonResponse({ message: "老師與登入帳號已永久刪除。" });
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
