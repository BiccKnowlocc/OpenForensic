import type { Connect } from "vite";
import type { Context } from "@netlify/functions";
import ai from "./netlify/functions/ai";
import cases from "./netlify/functions/cases";

export function localFunctionsPlugin() {
  return {
    name: "openforensic-local-functions",
    apply: "serve" as const,
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/api/")) {
          next();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          const body = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
          }
          const request = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" || body.length === 0 ? undefined : body,
          });
          const id = url.pathname.match(/^\/api\/cases\/([^/]+)$/)?.[1];
          const context = { params: id ? { id } : {} } as Context;
          const handler = url.pathname === "/api/ai" ? ai : cases;
          const response = await handler(request, context);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ message: error instanceof Error ? error.message : "Local function failed." }));
        }
      });
    },
  };
}
