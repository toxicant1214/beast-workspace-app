import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_VIEWER_MODULES = new Set([
  "dashboard",
  "students",
  "camps",
  "calendar",
  "pickup",
  "snack_management",
  "learning_reports",
  "score_analysis",
]);

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
        "Content-Type":
          "application/json; charset=utf-8",
      },
    },
  );
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanUsername(value: unknown) {
  return cleanText(value).toLowerCase();
}

function buildInternalEmail(
  username: string,
) {
  return `${username}@viewer.beast.local`;
}

function cleanPermissions(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) =>
          cleanText(item),
        )
        .filter((item) =>
          ALLOWED_VIEWER_MODULES.has(
            item,
          ),
        ),
    ),
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed",
      },
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

  const adminClient =
    createClient(
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
        {
          error: "缺少登入憑證。",
        },
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
    // 2. 讀取與驗證建立資料
    // --------------------------------------------------
    const body =
      await request.json();

    const displayName =
      cleanText(
        body?.displayName,
      );

    const username =
      cleanUsername(
        body?.username,
      );

    const password =
      cleanText(
        body?.password,
      );

    const permissions =
      cleanPermissions(
        body?.permissions,
      );

    if (!displayName) {
      return jsonResponse(
        {
          error:
            "請輸入檢視帳號名稱。",
        },
        400,
      );
    }

    if (!username) {
      return jsonResponse(
        {
          error:
            "請輸入登入帳號。",
        },
        400,
      );
    }

    if (
      !/^[a-z0-9_]+$/.test(
        username,
      )
    ) {
      return jsonResponse(
        {
          error:
            "登入帳號只能使用英文字母、數字與底線。",
        },
        400,
      );
    }

    if (username.length < 3) {
      return jsonResponse(
        {
          error:
            "登入帳號至少需要 3 個字元。",
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

    if (permissions.length === 0) {
      return jsonResponse(
        {
          error:
            "請至少選擇一個可查看頁面。",
        },
        400,
      );
    }

    // --------------------------------------------------
    // 3. 檢查 username 是否重複
    // --------------------------------------------------
    const {
      data: duplicateViewer,
      error: duplicateViewerError,
    } = await adminClient
      .from("workspace_viewers")
      .select(
        `
        id,
        display_name,
        username,
        auth_user_id
        `,
      )
      .ilike(
        "username",
        username,
      )
      .maybeSingle();

    if (duplicateViewerError) {
      throw duplicateViewerError;
    }

    if (duplicateViewer) {
      return jsonResponse(
        {
          error:
            `這個登入帳號已經被「${duplicateViewer.display_name}」使用。`,
        },
        409,
      );
    }

    // --------------------------------------------------
    // 4. 建立 Supabase Auth
    // --------------------------------------------------
    const internalEmail =
      buildInternalEmail(
        username,
      );

    const {
      data: authCreated,
      error: createAuthError,
    } =
      await adminClient.auth.admin
        .createUser({
          email:
            internalEmail,
          password,
          email_confirm: true,
          user_metadata: {
            display_name:
              displayName,
            workspace_role:
              "viewer",
            username,
          },
        });

    if (createAuthError) {
      const message =
        createAuthError.message ||
        "";

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
              "這個登入帳號已經存在，請改用其他帳號。",
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
        username,
        email:
          internalEmail,
        is_active: true,
        updated_at:
          new Date().toISOString(),
      })
      .select()
      .single();

    if (insertViewerError) {
      await adminClient.auth.admin
        .deleteUser(
          authUserId,
        );

      throw insertViewerError;
    }

    // --------------------------------------------------
    // 6. 建立 viewer 權限
    // --------------------------------------------------
    const permissionRows =
      permissions.map(
        (moduleKey) => ({
          viewer_id:
            createdViewer.id,
          module_key:
            moduleKey,
          can_view: true,
          updated_at:
            new Date().toISOString(),
        }),
      );

    const {
      error: insertPermissionError,
    } = await adminClient
      .from(
        "workspace_viewer_permissions",
      )
      .insert(
        permissionRows,
      );

    if (insertPermissionError) {
      // 回滾 viewer 資料與 Auth，
      // 避免留下只有帳號但沒有權限的半成品。
      await adminClient
        .from("workspace_viewers")
        .delete()
        .eq(
          "id",
          createdViewer.id,
        );

      await adminClient.auth.admin
        .deleteUser(
          authUserId,
        );

      throw insertPermissionError;
    }

    return jsonResponse({
      message:
        "檢視帳號與查看權限已建立完成。",
      viewer:
        createdViewer,
      permissions,
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