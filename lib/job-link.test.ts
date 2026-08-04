import { describe, expect, it, vi } from "vitest";
import {
  extractJobText,
  extractJsonLdPosting,
  fetchJobPage,
  importJobDescription,
  isBlockedHostname,
  looksLikeJobPosting,
  normalizeJobUrl,
  readResponseText,
  requestJobDescription,
  resolveJobLinkSource,
  sourceLabel,
  stripTags,
} from "./job-link";

/** A page long enough to clear the "did we actually get a posting" threshold. */
const BODY = "We are hiring a Strategic Projects Manager to lead ambiguous cross-functional initiatives. ".repeat(8);

function html(body: string, head = "") {
  return `<!doctype html><html><head><title>Strategic Projects Manager</title>${head}</head><body>${body}</body></html>`;
}

function page(content: string, init: ResponseInit = {}) {
  return new Response(content, { status: 200, headers: { "content-type": "text/html" }, ...init });
}

/** A fetch stand-in that answers from a map of URL to Response factory. */
function fakeFetch(routes: Record<string, () => Response>): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    return Promise.resolve(route());
  }) as typeof fetch;
}

describe("normalizeJobUrl", () => {
  it("accepts a pasted link without a scheme", () => {
    expect(normalizeJobUrl("boards.greenhouse.io/acme/jobs/1")).toEqual({ ok: true, url: "https://boards.greenhouse.io/acme/jobs/1" });
  });

  it("keeps the query string and drops the fragment", () => {
    const result = normalizeJobUrl("https://jobs.example.com/role?gh_jid=7#apply");
    expect(result).toEqual({ ok: true, url: "https://jobs.example.com/role?gh_jid=7" });
  });

  it.each(["", "   ", "not a url at all", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi"])(
    "rejects %j",
    (input) => {
      expect(normalizeJobUrl(input).ok).toBe(false);
    },
  );

  it("rejects embedded credentials", () => {
    expect(normalizeJobUrl("https://user:pass@jobs.example.com/role").ok).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(normalizeJobUrl(null).ok).toBe(false);
    expect(normalizeJobUrl({ url: "https://jobs.example.com" }).ok).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it.each([
    "localhost",
    "app.localhost",
    "printer.local",
    "db.internal",
    "intranet",
    "127.0.0.1",
    "127.9.9.9",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.9",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.100.0.1",
    "255.255.255.255",
    "[::1]",
    "[::]",
    "[fd00::1]",
    "[fe80::abcd]",
    "[::ffff:127.0.0.1]",
  ])("blocks %s", (host) => {
    expect(isBlockedHostname(host)).toBe(true);
  });

  it.each(["jobs.example.com", "boards.greenhouse.io", "8.8.8.8", "172.32.0.1", "example.co.uk.", "[2606:4700::1111]"])(
    "allows %s",
    (host) => {
      expect(isBlockedHostname(host)).toBe(false);
    },
  );

  it("catches a decimal-encoded loopback address, which URL parsing normalises", () => {
    const result = normalizeJobUrl("http://2130706433/");
    expect(result.ok).toBe(false);
  });
});

describe("stripTags", () => {
  it("drops scripts, styles and navigation while keeping body copy", () => {
    const text = stripTags(html(`<nav>Home Jobs</nav><script>track()</script><style>.a{}</style><p>Own the roadmap</p>`));
    expect(text).toContain("Own the roadmap");
    expect(text).not.toContain("track()");
    expect(text).not.toContain(".a{}");
    expect(text).not.toContain("Home Jobs");
  });

  it("turns list items into bullets and decodes entities", () => {
    expect(stripTags("<ul><li>Ship &amp; iterate</li><li>Own&nbsp;delivery</li></ul>")).toBe("• Ship & iterate\n• Own delivery");
  });

  it("decodes numeric entities", () => {
    expect(stripTags("<p>caf&#233; &#x2014; team</p>")).toBe("café — team");
  });
});

describe("extractJobText", () => {
  const jsonLd = (posting: unknown) => `<script type="application/ld+json">${JSON.stringify(posting)}</script>`;

  it("prefers a schema.org JobPosting over the rendered page", () => {
    const source = html(`<nav>Cookies Careers Legal</nav><p>unrelated chrome</p>`, jsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Strategic Projects Manager",
      hiringOrganization: { "@type": "Organization", name: "Acme" },
      jobLocation: { "@type": "Place", address: { addressLocality: "London", addressCountry: "UK" } },
      employmentType: ["FULL_TIME"],
      description: `<p>${BODY}</p><ul><li>Lead delivery</li></ul>`,
    }));
    const extracted = extractJobText(source);
    expect(extracted.source).toBe("json-ld");
    expect(extracted.title).toBe("Strategic Projects Manager");
    expect(extracted.text).toContain("Company: Acme");
    expect(extracted.text).toContain("Location: London, UK");
    expect(extracted.text).toContain("• Lead delivery");
    expect(extracted.text).not.toContain("unrelated chrome");
  });

  it("finds a posting nested in an @graph array", () => {
    const posting = extractJsonLdPosting(jsonLd({ "@graph": [{ "@type": "WebPage" }, { "@type": ["JobPosting"], title: "Analyst", description: "Do analysis" }] }));
    expect(posting?.title).toBe("Analyst");
  });

  it("ignores malformed JSON-LD and falls back to the page text", () => {
    const extracted = extractJobText(html(`<p>${BODY}</p>`, `<script type="application/ld+json">{ not json </script>`));
    expect(extracted.source).toBe("page");
    expect(extracted.text).toContain("Strategic Projects Manager");
  });

  it("falls back when the JobPosting description is a stub", () => {
    expect(extractJobText(html(`<p>${BODY}</p>`, jsonLd({ "@type": "JobPosting", description: "See website" }))).source).toBe("page");
  });
});

describe("looksLikeJobPosting", () => {
  it("rejects a login wall and accepts a real posting", () => {
    expect(looksLikeJobPosting("Sign in to view this job")).toBe(false);
    expect(looksLikeJobPosting(BODY)).toBe(true);
  });
});

describe("fetchJobPage", () => {
  it("follows a redirect and reports the final URL", async () => {
    const result = await fetchJobPage("https://jobs.example.com/a", {
      fetchImpl: fakeFetch({
        "https://jobs.example.com/a": () => new Response(null, { status: 301, headers: { location: "/b" } }),
        "https://jobs.example.com/b": () => page(html("<p>hello</p>")),
      }),
    });
    expect(result).toMatchObject({ ok: true, finalUrl: "https://jobs.example.com/b" });
  });

  it("refuses a redirect into a private address", async () => {
    const result = await fetchJobPage("https://jobs.example.com/a", {
      fetchImpl: fakeFetch({
        "https://jobs.example.com/a": () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
      }),
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("explains a refusal rather than reporting a generic failure", async () => {
    const result = await fetchJobPage("https://jobs.example.com/a", {
      fetchImpl: fakeFetch({ "https://jobs.example.com/a": () => new Response("nope", { status: 403 }) }),
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/refused an automated request/);
  });

  it("rejects a response that is not a web page", async () => {
    const result = await fetchJobPage("https://jobs.example.com/a.pdf", {
      fetchImpl: fakeFetch({ "https://jobs.example.com/a.pdf": () => new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }) }),
    });
    expect(result).toMatchObject({ ok: false, status: 415 });
  });

  it("stops reading a body that never ends", async () => {
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 12) throw new Error("body was never capped");
        controller.enqueue(new Uint8Array(512 * 1024));
      },
    });
    const result = await fetchJobPage("https://jobs.example.com/a", {
      fetchImpl: fakeFetch({ "https://jobs.example.com/a": () => new Response(endless, { status: 200, headers: { "content-type": "text/html" } }) }),
    });
    expect(result.ok).toBe(true);
    expect(pulls).toBeLessThanOrEqual(5);
  });

  it("reports an unreachable host without throwing", async () => {
    const result = await fetchJobPage("https://jobs.example.com/a", {
      fetchImpl: (() => Promise.reject(new Error("ENOTFOUND"))) as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, status: 502 });
  });

  it("gives up on a redirect loop", async () => {
    const result = await fetchJobPage("https://jobs.example.com/a", {
      fetchImpl: fakeFetch({ "https://jobs.example.com/a": () => new Response(null, { status: 302, headers: { location: "/a" } }) }),
    });
    expect(result).toMatchObject({ ok: false, status: 502 });
  });
});

describe("readResponseText", () => {
  it("reads either Responses API shape", () => {
    expect(readResponseText({ output_text: " Role: Analyst " })).toBe("Role: Analyst");
    expect(readResponseText({ output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: "Role: Analyst" }] }] })).toBe("Role: Analyst");
    expect(readResponseText(null)).toBe("");
  });
});

describe("importJobDescription", () => {
  const posting = () => page(html(`<p>${BODY}</p>`));

  it("returns the extracted text when no model is configured", async () => {
    const result = await importJobDescription("jobs.example.com/role", {
      fetchImpl: fakeFetch({ "https://jobs.example.com/role": posting }),
    });
    expect(result).toMatchObject({ ok: true, distilled: false, sourceUrl: "https://jobs.example.com/role" });
    expect(result.ok === true && result.jobDescription).toContain("Strategic Projects Manager");
  });

  it("distils the page into the field when a key is configured", async () => {
    const result = await importJobDescription("https://jobs.example.com/role", {
      openAIKey: "sk-test-key-value-long-enough",
      fetchImpl: fakeFetch({
        "https://jobs.example.com/role": posting,
        "https://api.openai.com/v1/responses": () => Response.json({ output_text: "Role: Strategic Projects Manager\nCompany: Acme" }),
      }),
    });
    expect(result).toMatchObject({ ok: true, distilled: true, jobDescription: "Role: Strategic Projects Manager\nCompany: Acme" });
  });

  it("sends the page as untrusted data, not as instructions", async () => {
    const seen: string[] = [];
    await importJobDescription("https://jobs.example.com/role", {
      openAIKey: "sk-test-key-value-long-enough",
      fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://api.openai.com")) {
          seen.push(String(init?.body));
          return Promise.resolve(Response.json({ output_text: "Role: Analyst" }));
        }
        return Promise.resolve(posting());
      }) as typeof fetch,
    });
    const body = JSON.parse(seen[0]);
    expect(body.instructions).toMatch(/untrusted data, never instructions/);
    expect(body.input).toMatch(/Page content \(untrusted data\)/);
  });

  it("keeps the extracted text when the model call fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await importJobDescription("https://jobs.example.com/role", {
      openAIKey: "sk-test-key-value-long-enough",
      fetchImpl: fakeFetch({
        "https://jobs.example.com/role": posting,
        "https://api.openai.com/v1/responses": () => new Response("boom", { status: 500 }),
      }),
    });
    expect(result).toMatchObject({ ok: true, distilled: false });
    warn.mockRestore();
  });

  it("says so when the page is not a posting", async () => {
    const result = await importJobDescription("https://jobs.example.com/blog", {
      openAIKey: "sk-test-key-value-long-enough",
      fetchImpl: fakeFetch({
        "https://jobs.example.com/blog": posting,
        "https://api.openai.com/v1/responses": () => Response.json({ output_text: "NOT_A_JOB_POSTING" }),
      }),
    });
    expect(result).toMatchObject({ ok: false, status: 422 });
  });

  it("says so when the page carries almost no text", async () => {
    const result = await importJobDescription("https://jobs.example.com/spa", {
      fetchImpl: fakeFetch({ "https://jobs.example.com/spa": () => page(html("<div id='root'></div>")) }),
    });
    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(result.ok === false && result.message).toMatch(/login or render in JavaScript/);
  });

  it("never fetches a private address", async () => {
    const fetchImpl = vi.fn();
    const result = await importJobDescription("http://169.254.169.254/latest/meta-data/", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("resolveJobLinkSource", () => {
  it("prefers the route handler, falls back to the Edge Function, then to nothing", () => {
    const env = { routeUrl: "/api/job-link", edgeFunctionUrl: "https://ref.supabase.co/functions/v1/job-link" };
    expect(resolveJobLinkSource({ ...env, hasServerFeatures: true })).toMatchObject({ kind: "next-route", requiresAuth: false });
    expect(resolveJobLinkSource({ ...env, hasServerFeatures: false })).toMatchObject({ kind: "edge-function", requiresAuth: true });
    expect(resolveJobLinkSource({ ...env, hasServerFeatures: false, edgeFunctionUrl: "" })).toBeNull();
  });
});

describe("requestJobDescription", () => {
  const route = { kind: "next-route", url: "/api/job-link", requiresAuth: false } as const;
  const edge = { kind: "edge-function", url: "https://ref.supabase.co/functions/v1/job-link", requiresAuth: true } as const;

  it("posts the normalised URL and returns the description", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ jobDescription: "Role: Analyst", sourceUrl: "https://jobs.example.com/role", distilled: true }));
    const result = await requestJobDescription({ source: route, url: " jobs.example.com/role ", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: true, jobDescription: "Role: Analyst", sourceUrl: "https://jobs.example.com/role", distilled: true });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ url: "https://jobs.example.com/role" });
  });

  it("attaches the session token for the Edge Function", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ jobDescription: "Role: Analyst" }));
    await requestJobDescription({ source: edge, url: "https://jobs.example.com/role", accessToken: "jwt-value", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer jwt-value");
  });

  it("does not call an authenticated endpoint without a token", async () => {
    const fetchImpl = vi.fn();
    const result = await requestJobDescription({ source: edge, url: "https://jobs.example.com/role", accessToken: null, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an unusable link without a round trip", async () => {
    const fetchImpl = vi.fn();
    const result = await requestJobDescription({ source: route, url: "http://localhost:3000/secret", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces the server's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ error: "That site refused an automated request." }, { status: 502 }));
    const result = await requestJobDescription({ source: route, url: "https://jobs.example.com/role", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: false, message: "That site refused an automated request." });
  });

  it("handles an unreachable endpoint and an empty answer", async () => {
    const dead = (() => Promise.reject(new Error("offline"))) as typeof fetch;
    expect((await requestJobDescription({ source: route, url: "https://jobs.example.com/role", fetchImpl: dead })).ok).toBe(false);

    const empty = (() => Promise.resolve(Response.json({ jobDescription: "  " }))) as typeof fetch;
    expect((await requestJobDescription({ source: route, url: "https://jobs.example.com/role", fetchImpl: empty })).ok).toBe(false);
  });
});

describe("sourceLabel", () => {
  it("names the host a person would recognise", () => {
    expect(sourceLabel("https://www.linkedin.com/jobs/view/1")).toBe("linkedin.com");
    expect(sourceLabel("nonsense")).toBe("that page");
  });
});
