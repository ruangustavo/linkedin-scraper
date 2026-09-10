export async function GET(request: Request) {
  const source = new URL(request.url);
  const url = new URL(process.env.API_ORIGIN ?? "http://127.0.0.1:3001");
  url.pathname = source.pathname.slice(4);
  url.search = source.search;

  try {
    return await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      redirect: "error",
    });
  } catch {
    return Response.json({ message: "The jobs API is unavailable." }, { status: 502 });
  }
}
