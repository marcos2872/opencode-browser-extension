import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OpencodeClient,
  OpencodeError,
} from "../../../src/background/opencode/client";
import type { AgentInfo, ModelInfo } from "../../../src/shared/types";
import {
  makeAgent,
  makeCommand,
  makeModel,
  makeSession,
} from "../../helpers/factories";

const BASE = "http://127.0.0.1:49374";
const TOKEN = "tok-secreto";

function expectedAuth(token = TOKEN): string {
  return `Basic ${btoa(`opencode:${token}`)}`;
}

interface FakeResponseInit {
  status?: number;
  json?: () => Promise<unknown>;
  body?: ReadableStream<Uint8Array> | null;
}

/** Resposta falsa de fetch: sem body por padrão e json() que falha (simula corpo não-JSON). */
function response(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json:
      init.json ??
      (async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      }),
    body: init.body ?? null,
  } as unknown as Response;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return response({ status, json: async () => payload });
}

function sseBody(...frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

function sseFrame(type: string, data?: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...(data ? { data } : {}) })}\n\n`;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

function makeClient(directory?: string): OpencodeClient {
  return new OpencodeClient(BASE, TOKEN, directory);
}

function lastCall(): {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
} {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit] | undefined;
  if (!call) throw new Error("fetch não foi chamado");
  const init = call[1] ?? {};
  return {
    url: call[0],
    init,
    headers: (init.headers ?? {}) as Record<string, string>,
  };
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map(([url]) => url as string);
}

async function captureError(promise: Promise<unknown>): Promise<OpencodeError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(OpencodeError);
  return error as OpencodeError;
}

describe("OpencodeClient.parsePairLink", () => {
  it("extrai baseUrl e código de um link válido", () => {
    expect(
      OpencodeClient.parsePairLink(
        "http://127.0.0.1:49374/auth/connect/abc_123-XYZ",
      ),
    ).toEqual({
      baseUrl: "http://127.0.0.1:49374",
      code: "abc_123-XYZ",
    });
  });

  it("aceita query/hash, espaços ao redor e https", () => {
    expect(
      OpencodeClient.parsePairLink(
        "  https://relay.example.com/auth/connect/CODE9?utm=1#top  ",
      ),
    ).toEqual({ baseUrl: "https://relay.example.com", code: "CODE9" });
  });

  it("encontra o código mesmo com prefixo no caminho", () => {
    expect(
      OpencodeClient.parsePairLink("http://host:1234/x/auth/connect/code1"),
    ).toEqual({
      baseUrl: "http://host:1234",
      code: "code1",
    });
  });

  it("rejeita link que não é URL", () => {
    let error: unknown;
    try {
      OpencodeClient.parsePairLink("opencode pair");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(OpencodeError);
    expect((error as OpencodeError).name).toBe("OpencodeError");
    expect((error as OpencodeError).message).toMatch(/Link inválido/);
  });

  it("rejeita protocolo que não seja http/https", () => {
    for (const link of [
      "ftp://host/auth/connect/x",
      "ws://127.0.0.1:8799/auth/connect/x",
    ]) {
      expect(() => OpencodeClient.parsePairLink(link)).toThrow(
        /http:\/\/ ou https:\/\//,
      );
    }
  });

  it("rejeita link sem /auth/connect/<código>", () => {
    for (const link of [
      "http://host/",
      "http://host/other/path",
      "http://host/auth/connect",
      "http://host/auth/connect/",
    ]) {
      expect(() => OpencodeClient.parsePairLink(link)).toThrow(
        /não contém \/auth\/connect/,
      );
    }
  });
});

describe("OpencodeClient.pair", () => {
  it("troca o código por um token sem enviar authorization", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "tok-abc" }));

    await expect(
      OpencodeClient.pair("http://127.0.0.1:49374/auth/connect/CODE"),
    ).resolves.toEqual({
      baseUrl: "http://127.0.0.1:49374",
      token: "tok-abc",
    });

    const { url, init, headers } = lastCall();
    expect(url).toBe("http://127.0.0.1:49374/auth/connect/CODE");
    expect(init.cache).toBe("no-store");
    expect(headers).toEqual({ accept: "application/json" });
    expect(headers.authorization).toBeUndefined();
  });

  it("explica link expirado quando o servidor responde 401", async () => {
    fetchMock.mockResolvedValue(
      response({ status: 401, json: async () => ({}) }),
    );

    const error = await captureError(
      OpencodeClient.pair("http://host/auth/connect/CODE"),
    );
    expect(error.message).toMatch(/Link expirado ou já usado/);
    expect(error.status).toBe(401);
  });

  it("usa mensagem genérica quando o corpo do erro não é JSON", async () => {
    fetchMock.mockResolvedValue(response({ status: 500 }));

    const error = await captureError(
      OpencodeClient.pair("http://host/auth/connect/CODE"),
    );
    expect(error.message).toBe("Falha ao parear (HTTP 500).");
    expect(error.status).toBe(500);
  });

  it("rejeita quando o servidor não devolve token", async () => {
    for (const payload of [
      {},
      { token: "" },
      { token: 123 },
      { token: null },
    ]) {
      fetchMock.mockResolvedValue(jsonResponse(payload));
      await expect(
        OpencodeClient.pair("http://host/auth/connect/CODE"),
      ).rejects.toThrow(/não devolveu um token/);
    }
  });

  it("devolve mensagem amigável quando a rede falha", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(
      OpencodeClient.pair("http://host/auth/connect/CODE"),
    ).rejects.toThrow(
      "Não foi possível falar com o OpenCode em http://host. Ele está rodando?",
    );
  });
});

describe("OpencodeClient.request (via métodos públicos)", () => {
  it("envia authorization Basic de opencode:<token>, content-type e cache no-store", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await makeClient().listSessions();

    const { url, init, headers } = lastCall();
    expect(url).toBe(`${BASE}/api/session`);
    expect(headers).toEqual({
      authorization: expectedAuth(),
      "content-type": "application/json",
      accept: "application/json",
    });
    expect(init.cache).toBe("no-store");
  });

  it("propaga a mensagem de erro em JSON do servidor", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: "sessão não encontrada" }, 404),
    );

    const error = await captureError(makeClient().listSessions());
    expect(error.message).toBe("sessão não encontrada");
    expect(error.status).toBe(404);
  });

  it("usa HTTP <status> quando o corpo do erro não é JSON", async () => {
    fetchMock.mockResolvedValue(response({ status: 503 }));

    const error = await captureError(makeClient().listSessions());
    expect(error.message).toBe("HTTP 503");
    expect(error.status).toBe(503);
  });

  it("mostra detalhes estruturados do corpo de erro", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ _tag: "Error", detail: "x" }, 500),
    );

    const error = await captureError(makeClient().listSessions());
    expect(error.message).toBe("x");
    expect(error.status).toBe(500);
  });

  it("orienta quando a resposta da API indica créditos insuficientes", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { errors: [{ message: "insufficient_quota: no credits" }] },
        402,
      ),
    );

    const error = await captureError(makeClient().listSessions());
    expect(error.message).toContain("insufficient_quota: no credits");
    expect(error.message).toMatch(/saldo e os limites de gastos/i);
    expect(error.status).toBe(402);
  });

  it("traduz falha de rede em mensagem amigável", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await captureError(makeClient().listSessions());
    expect(error.message).toBe(
      `Não foi possível falar com o OpenCode em ${BASE}. Ele está rodando?`,
    );
    expect(error.status).toBeUndefined();
  });

  it("não lê o corpo em respostas 204", async () => {
    const json = vi.fn(async () => ({}));
    fetchMock.mockResolvedValue(response({ status: 204, json }));

    await expect(makeClient().deleteSession("ses_1")).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("codifica o id da sessão na URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await makeClient().prompt("ses/1 2", "oi");

    const { url } = lastCall();
    expect(new URL(url).pathname).toBe("/api/session/ses%2F1%202/prompt");
  });

  it("inclui ?directory= quando configurado e omite quando não", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await makeClient("proj/α β").listSessions();
    const withDirectory = new URL(lastCall().url);
    expect(withDirectory.searchParams.get("directory")).toBe("proj/α β");

    await makeClient().listSessions();
    expect(new URL(lastCall().url).searchParams.has("directory")).toBe(false);
  });

  it("propaga o erro cru quando o corpo 200 não é JSON (comportamento atual)", async () => {
    fetchMock.mockResolvedValue(response({ status: 200 }));

    await expect(makeClient().listSessions()).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });
});

describe("OpencodeClient.listModels", () => {
  it("aceita o formato { data } e filtra modelos desabilitados", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          makeModel({ id: "a", providerID: "p" }),
          makeModel({ id: "b", providerID: "p", disabled: true }),
        ],
      }),
    );

    await expect(makeClient().listModels()).resolves.toEqual([
      makeModel({ id: "a", providerID: "p" }),
    ]);
    expect(lastCall().url).toBe(`${BASE}/api/model`);
  });

  it("aceita array direto no corpo", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        makeModel({ id: "a", providerID: "p" }),
        makeModel({ id: "b", providerID: "p", disabled: true }),
      ]),
    );

    const models = await makeClient().listModels();
    expect(models.map((model) => model.id)).toEqual(["a"]);
  });

  it("devolve lista vazia quando o corpo não traz data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(makeClient().listModels()).resolves.toEqual([]);
  });

  it("trata corpo null como lista vazia", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    await expect(makeClient().listModels()).resolves.toEqual([]);
  });
});

describe("OpencodeClient.defaultModel", () => {
  it("extrai o ref de um corpo { data }", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: makeModel({ id: "m1", providerID: "p1" }) }),
    );

    await expect(makeClient().defaultModel()).resolves.toEqual({
      id: "m1",
      providerID: "p1",
    });
    expect(lastCall().url).toBe(`${BASE}/api/model/default`);
  });

  it("aceita objeto direto no corpo", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(makeModel({ id: "m2", providerID: "p2" })),
    );

    await expect(makeClient().defaultModel()).resolves.toEqual({
      id: "m2",
      providerID: "p2",
    });
  });

  it("devolve null sem id/providerID ou sem corpo", async () => {
    const payloads: unknown[] = [
      { data: null },
      null,
      {},
      { data: {} },
      { data: { id: "m1" } },
      { data: { providerID: "p1" } },
      { data: { id: "", providerID: "p1" } },
    ];

    for (const payload of payloads) {
      fetchMock.mockResolvedValue(jsonResponse(payload));
      await expect(makeClient().defaultModel()).resolves.toBeNull();
    }
  });
});

describe("OpencodeClient.listAgents", () => {
  it("filtra subagents e agentes ocultos", async () => {
    const payload = {
      data: [
        makeAgent({ id: "build" }),
        makeAgent({ id: "explore", mode: "subagent" }),
        makeAgent({ id: "oculto", hidden: true }),
        makeAgent({ id: "general", mode: "subagent", hidden: true }),
        makeAgent({ id: "plan", mode: "primary" }),
      ] satisfies AgentInfo[],
    };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    const agents = await makeClient().listAgents();
    expect(agents.map((agent) => agent.id)).toEqual(["build", "plan"]);
    expect(lastCall().url).toBe(`${BASE}/api/agent`);
  });

  it("devolve lista vazia quando o corpo não traz data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(makeClient().listAgents()).resolves.toEqual([]);
  });
});

describe("OpencodeClient.listCommands", () => {
  it("devolve os comandos do corpo", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [makeCommand(), makeCommand({ name: "test" })] }),
    );

    await expect(makeClient().listCommands()).resolves.toEqual([
      makeCommand(),
      makeCommand({ name: "test" }),
    ]);
    expect(lastCall().url).toBe(`${BASE}/api/command`);
  });

  it("devolve lista vazia quando o corpo não traz data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(makeClient().listCommands()).resolves.toEqual([]);
  });
});

describe("OpencodeClient.listSessions", () => {
  it("devolve as sessões do corpo", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [makeSession(), makeSession({ id: "ses_2" })] }),
    );

    await expect(makeClient().listSessions()).resolves.toEqual([
      makeSession(),
      makeSession({ id: "ses_2" }),
    ]);
  });

  it("devolve lista vazia quando o corpo não traz data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(makeClient().listSessions()).resolves.toEqual([]);
  });
});

describe("OpencodeClient.createSession", () => {
  it("envia model, agent e location no body", async () => {
    const model = { id: "m1", providerID: "p1" };
    fetchMock.mockResolvedValue(
      jsonResponse({ data: makeSession({ id: "ses_nova" }) }),
    );

    await expect(
      makeClient("/proj").createSession(model, "build"),
    ).resolves.toEqual(makeSession({ id: "ses_nova" }));

    const { url, init, headers } = lastCall();
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe("/api/session");
    expect(new URL(url).searchParams.get("directory")).toBe("/proj");
    expect(JSON.parse(init.body as string)).toEqual({
      model,
      agent: "build",
      location: { directory: "/proj" },
    });
    expect(headers.authorization).toBe(expectedAuth());
  });

  it("envia body vazio sem model/agent/directory", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: makeSession() }));

    await makeClient().createSession();

    expect(JSON.parse(lastCall().init.body as string)).toEqual({});
    expect(new URL(lastCall().url).searchParams.has("directory")).toBe(false);
  });

  it("rejeita sessão criada sem id", async () => {
    for (const payload of [
      {},
      { data: {} },
      { data: null },
      { data: { title: "sem id" } },
    ]) {
      fetchMock.mockResolvedValue(jsonResponse(payload));
      await expect(makeClient().createSession()).rejects.toThrow(
        /Sessão criada sem id/,
      );
    }
  });
});

describe("OpencodeClient.deleteSession", () => {
  it("faz DELETE na sessão", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));

    await expect(makeClient().deleteSession("ses_1")).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(init.method).toBe("DELETE");
    expect(new URL(url).pathname).toBe("/api/session/ses_1");
  });
});

describe("OpencodeClient.switchModel", () => {
  it("faz POST com o model no body", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));
    const model = { id: "m9", providerID: "p9", variant: "fast" };

    await expect(
      makeClient().switchModel("ses_1", model),
    ).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe("/api/session/ses_1/model");
    expect(JSON.parse(init.body as string)).toEqual({ model });
  });
});

describe("OpencodeClient.switchAgent", () => {
  it("faz POST com o agent no body", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));

    await expect(
      makeClient().switchAgent("ses_1", "plan"),
    ).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe("/api/session/ses_1/agent");
    expect(JSON.parse(init.body as string)).toEqual({ agent: "plan" });
  });
});

describe("OpencodeClient.context", () => {
  it("devolve o contexto da sessão", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "msg_1" }, { id: "msg_2" }] }),
    );

    await expect(makeClient().context("ses_1")).resolves.toEqual([
      { id: "msg_1" },
      { id: "msg_2" },
    ]);
    expect(new URL(lastCall().url).pathname).toBe("/api/session/ses_1/context");
  });

  it("devolve lista vazia quando o corpo não traz data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(makeClient().context("ses_1")).resolves.toEqual([]);
  });
});

describe("OpencodeClient.prompt", () => {
  it("faz POST com o texto", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));

    await expect(makeClient().prompt("ses_1", "olá")).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe("/api/session/ses_1/prompt");
    expect(JSON.parse(init.body as string)).toEqual({ text: "olá" });
  });
});

describe("OpencodeClient.runCommand", () => {
  it("faz POST com nome e texto do comando", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));

    await expect(
      makeClient().runCommand("ses_1", "review", "revise isso"),
    ).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe("/api/session/ses_1/command");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "review",
      text: "revise isso",
    });
  });
});

describe("OpencodeClient.interrupt", () => {
  it("faz POST sem body", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));

    await expect(makeClient().interrupt("ses_1")).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(new URL(url).pathname).toBe("/api/session/ses_1/interrupt");
  });
});

describe("OpencodeClient.generate", () => {
  it("envia o model quando informado", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { text: "resposta" } }));
    const model = { id: "m1", providerID: "p1" };

    await expect(makeClient().generate("pergunta", model)).resolves.toBe(
      "resposta",
    );

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe("/api/experimental/generate");
    expect(JSON.parse(init.body as string)).toEqual({
      prompt: "pergunta",
      model,
    });
  });

  it("omite o model quando não informado", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { text: "ok" } }));

    await makeClient().generate("pergunta");

    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      prompt: "pergunta",
    });
    expect(JSON.parse(lastCall().init.body as string)).not.toHaveProperty(
      "model",
    );
  });

  it("devolve string vazia quando o corpo não traz texto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: {} }));
    await expect(makeClient().generate("pergunta")).resolves.toBe("");

    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(makeClient().generate("pergunta")).resolves.toBe("");
  });
});

describe("OpencodeClient.subscribe", () => {
  it("falha quando a resposta não é ok", async () => {
    fetchMock.mockResolvedValue(response({ status: 500, body: null }));

    const error = await captureError(
      makeClient().subscribe(vi.fn(), new AbortController().signal),
    );
    expect(error.message).toBe("Stream de eventos indisponível (HTTP 500).");
    expect(error.status).toBe(500);
  });

  it("falha quando a resposta não tem body", async () => {
    fetchMock.mockResolvedValue(response({ status: 200, body: null }));

    const error = await captureError(
      makeClient().subscribe(vi.fn(), new AbortController().signal),
    );
    expect(error.message).toBe("Stream de eventos indisponível (HTTP 200).");
    expect(error.status).toBe(200);
  });

  it("entrega os eventos do stream, ignorando frames inválidos", async () => {
    const signal = new AbortController().signal;
    fetchMock.mockResolvedValue(
      response({
        status: 200,
        body: sseBody(
          sseFrame("session.updated", { id: "ses_1" }),
          ": heartbeat\n\n",
          "data: {quebrado\n\n",
          sseFrame("message.updated"),
        ),
      }),
    );
    const onEvent = vi.fn();

    await makeClient().subscribe(onEvent, signal);

    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
      { type: "session.updated", data: { id: "ses_1" } },
      { type: "message.updated" },
    ]);

    const { url, init, headers } = lastCall();
    expect(url).toBe(`${BASE}/api/event`);
    expect(init.signal).toBe(signal);
    expect(headers.accept).toBe("text/event-stream");
    expect(headers.authorization).toBe(expectedAuth());
  });

  it("avisa quando o stream abre e não avisa em erro", async () => {
    const onOpen = vi.fn();
    fetchMock.mockResolvedValue(
      response({ status: 200, body: sseBody(sseFrame("server.connected")) }),
    );

    await makeClient().subscribe(vi.fn(), new AbortController().signal, onOpen);
    expect(onOpen).toHaveBeenCalledTimes(1);

    onOpen.mockClear();
    fetchMock.mockResolvedValue(response({ status: 401, body: null }));
    await captureError(
      makeClient().subscribe(vi.fn(), new AbortController().signal, onOpen),
    );
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("OpencodeClient.timeout", () => {
  it("aborta e sinaliza timeout quando o servidor não responde", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const client = new OpencodeClient(BASE, TOKEN, undefined, 30);

    const promise = expect(client.listSessions()).rejects.toMatchObject({
      timedOut: true,
      message: expect.stringContaining("não respondeu em"),
    });
    await vi.advanceTimersByTimeAsync(30);
    await promise;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("limpa o timer quando a requisição termina", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await makeClient().listSessions();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("probe consulta /api/agent", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await makeClient().probe();

    expect(lastCall().url).toBe(`${BASE}/api/agent`);
  });
});

describe("OpencodeClient.listForms", () => {
  it("devolve os forms pendentes da sessão", async () => {
    const form = {
      id: "frm_1",
      sessionID: "ses_1",
      title: "Questions",
      fields: [{ key: "q0", type: "string" }],
    };
    fetchMock.mockResolvedValue(jsonResponse({ data: [form] }));

    await expect(makeClient().listForms("ses_1")).resolves.toEqual([form]);
    expect(new URL(lastCall().url).pathname).toBe("/api/session/ses_1/form");
  });

  it("devolve lista vazia quando o corpo não traz data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(makeClient().listForms("ses_1")).resolves.toEqual([]);
  });
});

describe("OpencodeClient.replyForm", () => {
  it("faz POST com a resposta no body", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));

    await expect(
      makeClient().replyForm("ses_1", "frm_1", { q0: "Sim", q1: ["a", "b"] }),
    ).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(init.method).toBe("POST");
    expect(new URL(url).pathname).toBe("/api/session/ses_1/form/frm_1/reply");
    expect(JSON.parse(init.body as string)).toEqual({
      answer: { q0: "Sim", q1: ["a", "b"] },
    });
  });
});

describe("OpencodeClient.cancelForm", () => {
  it("faz DELETE sem mensagem", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));
    await expect(
      makeClient().cancelForm("ses_1", "frm_1"),
    ).resolves.toBeUndefined();
    const { url, init } = lastCall();
    expect(init.method).toBe("DELETE");
    expect(new URL(url).pathname).toBe("/api/session/ses_1/form/frm_1");
    expect(new URL(url).search).toBe("");
  });

  it("faz DELETE com ?message= codificado", async () => {
    fetchMock.mockResolvedValue(response({ status: 204 }));
    await expect(
      makeClient().cancelForm("ses_1", "frm_1", "não agora"),
    ).resolves.toBeUndefined();
    expect(new URL(lastCall().url).searchParams.get("message")).toBe("não agora");
  });
});
