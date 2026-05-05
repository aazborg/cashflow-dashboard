import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const BASE_PATH = "/cashflow";

// Public paths are written WITHOUT the basePath; we strip the basePath from
// `request.nextUrl.pathname` before comparing.
const PUBLIC_PATHS = ["/login", "/auth/callback"];

function stripBasePath(p: string): string {
  if (p === BASE_PATH) return "/";
  if (p.startsWith(BASE_PATH + "/")) return p.slice(BASE_PATH.length);
  return p;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await sb.auth.getUser();
  const fullPath = request.nextUrl.pathname;
  const path = stripBasePath(fullPath);

  const isPublic =
    PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/")) ||
    fullPath.startsWith(BASE_PATH + "/api/webhooks/") ||
    fullPath.startsWith("/api/webhooks/");

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `${BASE_PATH}/login`;
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (data.user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = `${BASE_PATH}/`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|aazb-logo.jpg).*)",
  ],
};
