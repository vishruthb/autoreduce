import { NextRequest } from "next/server";

const API_BASE =
  process.env.AUTOREDUCE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

type RouteContext = {
  params: {
    path?: string[];
  };
};

function targetUrl(path: string[] | undefined, request: NextRequest): string {
  const url = new URL(request.url);
  const target = new URL((path ?? []).join("/"), `${API_BASE.replace(/\/$/, "")}/`);
  target.search = url.search;
  return target.toString();
}

function forwardHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const upstream = await fetch(targetUrl(context.params.path, request), {
    method,
    headers: forwardHeaders(request),
    body: hasBody ? request.body : undefined,
    cache: "no-store",
    // Required when forwarding a streamed request body in Node fetch.
    ...(hasBody ? { duplex: "half" as const } : {}),
  });

  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
