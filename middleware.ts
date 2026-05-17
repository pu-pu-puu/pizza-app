import { NextRequest, NextResponse } from 'next/server';

const REQUEST_ID_HEADER = 'x-request-id';

export function middleware(req: NextRequest) {
  const incoming = req.headers.get(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length > 0 ? incoming : crypto.randomUUID();

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
