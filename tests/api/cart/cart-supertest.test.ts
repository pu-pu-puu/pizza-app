import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { NextRequest } from 'next/server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/cart/route';
import { prisma } from '@/prisma/prisma-client';

/**
 * Supertest works against a real HTTP server. Next.js App Router
 * handlers don't run on a Node `http.Server` by default — they are
 * pure async functions over `Request` / `Response`. We wrap the
 * handler in a minimal HTTP adapter so we can exercise the full
 * HTTP round-trip (status code, response headers, JSON body) the
 * way an external client would observe it.
 *
 * This is intentionally lighter than booting `next start`: it does
 * not run middleware, page rendering, or static asset routing, but
 * it does give us a real HTTP socket to assert against.
 */
describe('GET /api/cart (HTTP via supertest)', () => {
  let server: Server;
  let agent: ReturnType<typeof request>;

  beforeAll(() => {
    server = createServer(async (req, res) => {
      try {
        const url = `http://localhost${req.url ?? '/'}`;
        const headers = req.headers as Record<string, string>;
        const nextReq = new NextRequest(url, {
          method: req.method,
          headers,
        });
        const webResponse = await GET(nextReq);
        res.statusCode = webResponse.status;
        webResponse.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        const buf = Buffer.from(await webResponse.arrayBuffer());
        res.end(buf);
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ message: 'adapter_error', err: String(err) }));
      }
    });
    server.listen(0);
    const address = server.address() as AddressInfo;
    agent = request(`http://127.0.0.1:${address.port}`);
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it('returns the empty-cart shape over the wire when no cartToken cookie is set', async () => {
    const res = await agent.get('/api/cart');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ totalAmount: 0, items: [] });
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });

  it('forwards the cartToken cookie through the cookie header and returns the cart payload', async () => {
    const fakeCart = { id: 1, token: 'tok-wire', totalAmount: 700, items: [] };
    vi.mocked(prisma.cart.findFirst).mockResolvedValue(
      fakeCart as unknown as Awaited<ReturnType<typeof prisma.cart.findFirst>>,
    );

    const res = await agent.get('/api/cart').set('Cookie', 'cartToken=tok-wire');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeCart);
    expect(prisma.cart.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ token: 'tok-wire' }] },
      }),
    );
  });
});
