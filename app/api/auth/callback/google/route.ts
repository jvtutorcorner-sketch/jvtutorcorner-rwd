import { NextResponse } from 'next/server';

// Google SSO is not wired up yet — there is no token exchange, JWT verification, or
// domain whitelist behind this route. It previously treated ANY "code" query param as a
// successful login (see git history), which meant anyone could hit this URL directly and
// have the client believe it was signed in via Google. There is also no "Sign in with
// Google" button anywhere in the UI that links here — this route is unreachable through
// normal navigation, only via a hand-crafted URL. Until real OAuth is implemented, this
// route must never report success; password login remains the supported path.
export async function GET(request: Request) {
    return NextResponse.redirect(new URL('/login?error=google_auth_unavailable', request.url));
}
