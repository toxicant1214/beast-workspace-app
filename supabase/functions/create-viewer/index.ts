import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const serviceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        error:
          "Edge Function 環境變數尚未設定完整。",
      },
      500,
    );
  }

  const adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );

  try {
    // --------------------------------------------------
    // 1. 驗證呼叫者本人
    // --------------------------------------------------
    const authorization =
      request.headers.get(
        "Authorization",
      );

    const accessToken =
      authorization?.replace(
        /^Bearer\s+/i,
        "",
      );

    if (!accessToken) {
      return jsonResponse(
        { error: "缺少登入憑證。" },
        401,
      );
    }

    const {
      data: { user: caller },
      error: callerError,
    } =
      await adminClient.auth.getUser(
        accessToken,
      );

    if (callerError || !caller) {
      return jsonResponse(
        {
          error:
            "登入狀態無效，請重新登入。",
        },
        401,
      );
    }

    // 檢視帳號只能由在職 admin 建立。
    // 沿用你目前 invite-teacher 的管理員判斷方式。
    const {
      data: callerTeacher,
      error: callerTeacherError,
    } = await adminClient
      .from("teachers")
      .select("id, role, status")
      .eq(
        "auth_user_id",
        caller.id,
      )
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
        {
          error:
            "只有在職管理員可以建立檢視帳號。",
        },
        403,
      );
    }

    // --------------------------------------------------
    // 2. 讀取建立資料
    // --------------------------------------------------
    const body =
      await request.json();

    const displayName =
      cleanText(body?.displayName);

    const email =
      cleanEmail(body?.email);

    const password =
      cleanText(body?.password);

    if (!displayName) {
      return jsonResponse(
        {
          error:
            "請輸入檢視帳號名稱。",
        },
        400,
      );
    }

    if (!email) {
      return jsonResponse(
        {
          error:
            "請輸入登入 Email。",
        },
        400,
      );
    }

    if (
      !email.includes("@")
    ) {
      return jsonResponse(
        {
          error:
            "登入 Email 格式不正確。",
        },
        400,
      );
    }

    if (!password) {
      return jsonResponse(
        {
          error:
            "請輸入初始密碼。",
        },
        400,
      );
    }

    if (password.length < 8) {
      return jsonResponse(
        {
          error:
            "初始密碼至少需要 8 個字元。",
        },
        400,
      );
    }

    // --------------------------------------------------
    // 3. 防止資料表重複
    // --------------------------------------------------
    const {
      data: duplicateViewer,
      error: duplicateViewerError,
    } = await adminClient
      .from("workspace_viewers")
      .select(
        "id, display_name, email, auth_user_id",
      )
      .ilike(
        "email",
        email,
      )
      .maybeSingle();

    if (duplicateViewerError) {
      throw duplicateViewerError;
    }

    if (duplicateViewer) {
      return jsonResponse(
        {
          error:
            `這個 Email 已經建立檢視帳號「${duplicateViewer.display_name}」。`,
        },
        409,
      );
    }

    // --------------------------------------------------
    // 4. 直接建立 Supabase Auth 帳號
    //    不寄邀請信、不要求首次設定密碼
    // --------------------------------------------------
    const {
      data: authCreated,
      error: createAuthError,
    } =
      await adminClient.auth.admin
        .createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            display_name:
              displayName,
            workspace_role:
              "viewer",
          },
        });

    if (createAuthError) {
      const message =
        createAuthError.message || "";

      if (
        message
          .toLowerCase()
          .includes("already") ||
        message
          .toLowerCase()
          .includes("registered") ||
        message
          .toLowerCase()
          .includes("exists")
      ) {
        return jsonResponse(
          {
            error:
              "這個 Email 已經存在 Supabase Auth，請改用其他 Email。",
          },
          409,
        );
      }

      throw createAuthError;
    }

    const authUserId =
      authCreated?.user?.id;

    if (!authUserId) {
      return jsonResponse(
        {
          error:
            "建立登入帳號後未取得使用者 ID。",
        },
        500,
      );
    }

    // --------------------------------------------------
    // 5. 建立 workspace_viewers
    // --------------------------------------------------
    const {
      data: createdViewer,
      error: insertViewerError,
    } = await adminClient
      .from("workspace_viewers")
      .insert({
        auth_user_id:
          authUserId,
        display_name:
          displayName,
        email,
        is_active: true,
        updated_at:
          new Date().toISOString(),
      })
      .select()
      .single();

    if (insertViewerError) {
      // 避免留下孤兒 Auth 帳號
      await adminClient.auth.admin
        .deleteUser(authUserId);

      throw insertViewerError;
    }

    return jsonResponse({
      message:
        "檢視帳號已建立，可以直接使用帳號密碼登入。",
      viewer:
        createdViewer,
    });
  } catch (error) {
    console.error(
      "create-viewer function error:",
      error,
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "伺服器處理失敗，請稍後再試。",
      },
      500,
    );
  }
});