/**
 * Build a typed `Request` for direct route-handler invocation. We use the
 * Web `Request` constructor (provided globally in Node 20+) so each call
 * site can spell out method/body/headers without ceremony.
 */
export const buildJsonRequest = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Request => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(extraHeaders ?? {}),
  };
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};
