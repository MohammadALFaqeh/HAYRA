import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ACCESS_COOKIE, readAccessToken } from "@/lib/access";

// مسارات لا تحتاج رمز الدخول المشترك
const PUBLIC_PATTERNS = [
  /^\/login$/,
  /^\/api\/access\//,
  /^\/api\/time$/,
  /^\/qr\//,
  /^\/api\/qr\//,
  /^\/game\/[^/]+\/(tv|watch|host)$/,
  /^\/api\/game\/[^/]+(\/.*)?$/, // محمية بمفتاح المضيف
];

async function refreshAdminSession(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  return { res, user: data.user };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---------- لوحة الإدارة: Supabase Auth
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const { res, user } = await refreshAdminSession(req);
    if (!user && pathname !== "/admin/login") {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return res;
  }

  if (PUBLIC_PATTERNS.some((p) => p.test(pathname)) && pathname !== "/api/game/create") {
    return NextResponse.next();
  }

  // ---------- باقي الموقع: كوكي الدخول المشترك
  const token = await readAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);
  if (!token) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "يلزم تسجيل الدخول" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|sounds/|icon.png|apple-icon.png|favicon.ico|robots.txt).*)"],
};
