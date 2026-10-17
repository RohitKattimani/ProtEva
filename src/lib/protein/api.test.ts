import { describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  createApiClient,
  HttpApiClient,
  MockApiClient,
  mockClient,
  normalizeApiBaseUrl,
} from "./api";
import type { Experiment, SearchConfig, SequenceInput, TargetLandscape } from "./types";

const draft = {
  input: { experimentName: "HTTP contract", sequence: "MKTAYIAK" } satisfies SequenceInput,
  target: {
    objectiveText: "Explore",
    targetStateDescription: "Open",
    structuralMetric: "rmsd",
    thresholdAngstrom: 6,
    residueRegion: "1-4",
    preservationConstraints: "None",
  } satisfies TargetLandscape,
  config: {
    populationSize: 2,
    generations: 1,
    maxSubstitutions: 1,
    screeningSamples: 1,
    finalistSamples: 1,
    mutationStrategy: "balanced",
    diversityPreference: 50,
    randomSeed: 7,
  } satisfies SearchConfig,
};

function installFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => response.clone());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("HttpApiClient", () => {
  it("normalizes an HTTP API base URL and constructs encoded endpoints", async () => {
    const fetchMock = installFetch(new Response("[]", { status: 200 }));
    const client = new HttpApiClient(" https://api.example.test/api/v1/ ");

    await client.getExperiment("exp/a b");
    await client.getCandidates({ experimentId: "exp/a b", generation: 3, search: "A42V" });

    expect(normalizeApiBaseUrl("https://api.example.test/api/v1/")).toBe(
      "https://api.example.test/api/v1",
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/api/v1/experiments/exp%2Fa%20b",
      "https://api.example.test/api/v1/candidates?experimentId=exp%2Fa+b&generation=3&search=A42V",
    ]);
  });

  it("sends JSON POST requests with the complete draft payload", async () => {
    const response = { id: "EXP-1", name: "HTTP contract" } as Experiment;
    const fetchMock = installFetch(
      new Response(JSON.stringify(response), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      new HttpApiClient("https://api.example.test").createExperiment(draft),
    ).resolves.toEqual(response);

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.test/experiments");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("content-type")).toBe("application/json");
    expect(options?.body).toBe(JSON.stringify(draft));
  });

  it("uses POST for cancellation and JSON headers for every JSON endpoint", async () => {
    const fetchMock = installFetch(new Response(JSON.stringify({}), { status: 200 }));

    await new HttpApiClient("https://api.example.test").cancelExperiment("EXP-1");

    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example.test/experiments/EXP-1/cancel");
    expect(options?.method).toBe("POST");
    expect(new Headers(options?.headers).get("content-type")).toBe("application/json");
  });

  it.each([
    [422, "REQUEST_VALIDATION_FAILED"],
    [404, "HTTP_ERROR"],
    [501, "LIVE_EXECUTION_UNAVAILABLE"],
  ])("preserves structured backend errors for HTTP %i", async (status, code) => {
    installFetch(
      new Response(JSON.stringify({ error: { code, message: `backend ${status}` } }), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      new HttpApiClient("https://api.example.test").listExperiments(),
    ).rejects.toMatchObject({
      name: "ApiClientError",
      status,
      code,
      message: `backend ${status}`,
      path: "/experiments",
    } satisfies Partial<ApiClientError>);
  });

  it("reports unexpected server and malformed success responses", async () => {
    installFetch(new Response("proxy failure", { status: 500 }));
    await expect(
      new HttpApiClient("https://api.example.test").listExperiments(),
    ).rejects.toMatchObject({
      status: 500,
      message: "Backend request failed (500) for /experiments",
    } satisfies Partial<ApiClientError>);

    installFetch(new Response("not json", { status: 200 }));
    await expect(
      new HttpApiClient("https://api.example.test").listExperiments(),
    ).rejects.toMatchObject({
      status: 200,
      message: "Backend returned malformed JSON for /experiments",
    } satisfies Partial<ApiClientError>);
  });

  it("surfaces network failures", async () => {
    const networkError = new TypeError("Network unavailable");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(networkError));

    await expect(new HttpApiClient("https://api.example.test").listExperiments()).rejects.toBe(
      networkError,
    );
  });

  it("uses mock mode only when the configured base URL is missing and never issues HTTP requests", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    expect(createApiClient(undefined)).toBe(mockClient);
    expect(createApiClient("   ")).toBe(mockClient);
    expect(createApiClient(undefined)).toBeInstanceOf(MockApiClient);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid base URLs before issuing a request", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => new HttpApiClient("api.example.test")).toThrow(
      "VITE_API_BASE_URL must be an absolute HTTP(S) URL.",
    );
    expect(() => new HttpApiClient("ftp://api.example.test")).toThrow(
      "VITE_API_BASE_URL must use HTTP or HTTPS.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
