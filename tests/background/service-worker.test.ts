import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeAgent,
  makeCommand,
  makeModel,
  makeSession,
} from "../helpers/factories";

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = 0;
  listeners = new Map<string, Array<(event: unknown) => void>>();
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code: 1000, reason: "" });
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  message(payload: unknown): void {
    this.emit("message", { data: JSON.stringify(payload) });
  }

  sentJson(): any[] {
    return this.sent.map((item) => JSON.parse(item));
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let sseController: ReadableStreamDefaultController<Uint8Array> | null = null;

function sseResponse(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      sseController = controller;
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function pushEvent(type: string, data: Record<string, unknown>): void {
  const frame = `data: ${JSON.stringify({ type, data })}\n\n`;
  sseController?.enqueue(new TextEncoder().encode(frame));
}

const apiCalls: Array<{ url: string; method: string; body: unknown }> = [];

function installFetch(options: { sessions?: unknown[] } = {}): void {
  apiCalls.length = 0;
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    apiCalls.push({
      url,
      method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });

    const pathname = new URL(url).pathname;
    if (pathname === "/health") return new Response("{}", { status: 404 });
    if (pathname.startsWith("/auth/connect/"))
      return jsonResponse({ token: "token-teste" });
    if (pathname === "/api/model") return jsonResponse({ data: [makeModel()] });
    if (pathname === "/api/model/default")
      return jsonResponse({ data: makeModel({ id: "model-1" }) });
    if (pathname === "/api/agent") return jsonResponse({ data: [makeAgent()] });
    if (pathname === "/api/command")
      return jsonResponse({ data: [makeCommand()] });
    if (pathname === "/api/event") return sseResponse();
    if (pathname === "/api/experimental/generate")
      return jsonResponse({ data: { text: "ok" } });
    if (pathname === "/api/session" && method === "GET") {
      return jsonResponse({ data: options.sessions ?? [makeSession()] });
    }
    if (pathname === "/api/session" && method === "POST") {
      return jsonResponse({
        data: makeSession({ id: "ses_nova", title: "Nova" }),
      });
    }
    if (pathname.endsWith("/context")) return jsonResponse({ data: [] });
    if (
      pathname.endsWith("/prompt") ||
      pathname.endsWith("/command") ||
      pathname.endsWith("/interrupt")
    ) {
      return jsonResponse({});
    }
    if (pathname.endsWith("/model") || pathname.endsWith("/agent"))
      return jsonResponse({});
    if (pathname.startsWith("/api/session/")) return jsonResponse({});
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
}

function flush(times = 12): Promise<void> {
  let chain = Promise.resolve();
  for (let index = 0; index < times; index += 1) {
    chain = chain.then(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  return chain;
}

async function loadWorker(): Promise<void> {
  vi.resetModules();
  await import("../../src/background/service-worker");
  await flush();
}

function workerListener(): Listener {
  const listeners = chrome.runtime.onMessage.listeners as unknown as Listener[];
  return listeners[listeners.length - 1];
}

function callWorker(message: unknown, sender: unknown = {}): Promise<any> {
  return new Promise((resolve) => {
    workerListener()(message, sender, resolve);
  });
}

async function pairWorker(): Promise<any> {
  return callWorker({
    type: "pair",
    link: "http://127.0.0.1:49374/auth/connect/abc123",
  });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  sseController = null;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  installFetch();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("service-worker: inicialização", () => {
  it("configura keepalive, offscreen, side panel e badge sem configuração", async () => {
    await loadWorker();
    expect(chrome.alarms.create).toHaveBeenCalledWith("keepalive", {
      periodInMinutes: 0.5,
    });
    expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
    expect(chrome.offscreen.createDocument).toHaveBeenCalled();
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "!" });
    expect(FakeWebSocket.instances.length).toBeGreaterThan(0);
  });

  it("carrega a configuração salva e busca modelos, agentes e comandos", async () => {
    await chrome.storage.local.set({
      "opencode.config": {
        baseUrl: "http://127.0.0.1:49374",
        token: "tok",
        permissionMode: "ask",
      },
    });
    await loadWorker();
    const response = await callWorker({ type: "state:get" });
    expect(response.ok).toBe(true);
    expect(response.snapshot.models).toHaveLength(1);
    expect(response.snapshot.agents[0].id).toBe("build");
    expect(response.snapshot.commands[0].name).toBe("review");
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
  });

  it("publica snapshot ao conectar um port e remove ao desconectar", async () => {
    await loadWorker();
    const port = chrome.runtime.connect({ name: "opencode-browser-ui" });
    expect(port.sent.some((message: any) => message?.type === "snapshot")).toBe(
      true,
    );
    port.disconnect();
    expect(port.disconnected).toBe(true);
  });
});

describe("service-worker: pareamento", () => {
  it("pareia, salva a configuração e cria a primeira sessão", async () => {
    await loadWorker();
    const response = await pairWorker();
    expect(response.ok).toBe(true);
    const stored = await chrome.storage.local.get("opencode.config");
    expect(stored["opencode.config"]).toMatchObject({
      baseUrl: "http://127.0.0.1:49374",
      token: "token-teste",
    });
    expect(apiCalls.some((call) => call.url.includes("/api/model"))).toBe(true);
    expect(response.snapshot.activeSessionID).toBe("ses_test");
  });

  it("devolve erro de pareamento sem derrubar o worker", async () => {
    await loadWorker();
    const response = await callWorker({ type: "pair", link: "não é url" });
    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/Link inválido/);
  });

  it("desconecta e limpa o estado", async () => {
    await loadWorker();
    await pairWorker();
    const response = await callWorker({ type: "unpair" });
    expect(response.ok).toBe(true);
    expect(response.snapshot.config).toBeNull();
    expect(response.snapshot.models).toEqual([]);
  });

  it("atualiza configurações e recria o cliente quando o servidor muda", async () => {
    await loadWorker();
    await pairWorker();
    const response = await callWorker({
      type: "settings:update",
      patch: { baseUrl: "http://127.0.0.1:9999", permissionMode: "allow" },
    });
    expect(response.ok).toBe(true);
    expect(response.snapshot.config.baseUrl).toBe("http://127.0.0.1:9999");
  });
});

describe("service-worker: sessões e conversa", () => {
  it("cria sessão com modelo e agente escolhidos", async () => {
    await loadWorker();
    await pairWorker();
    const response = await callWorker({
      type: "session:new",
      model: { id: "model-1", providerID: "provider-1" },
      agent: "plan",
    });
    expect(response.ok).toBe(true);
    const created = apiCalls.find(
      (call) => call.method === "POST" && call.url.endsWith("/api/session"),
    );
    expect(created?.body).toMatchObject({
      model: { id: "model-1", providerID: "provider-1" },
      agent: "plan",
    });
  });

  it("envia prompt e marca a sessão como ocupada", async () => {
    await loadWorker();
    const paired = await pairWorker();
    expect(paired.ok, paired.error).toBe(true);
    const response = await callWorker({ type: "prompt", text: "olá" });
    expect(response.ok, response.error).toBe(true);
    expect(response.snapshot.busy).toBe(true);
    expect(response.snapshot.messages[0]).toMatchObject({
      kind: "user",
      text: "olá",
    });
    expect(apiCalls.some((call) => call.url.includes("/prompt"))).toBe(true);
  });

  it("executa comando com barra", async () => {
    await loadWorker();
    const paired = await pairWorker();
    expect(paired.ok, paired.error).toBe(true);
    const response = await callWorker({
      type: "command",
      name: "review",
      text: "tudo",
    });
    expect(response.ok, response.error).toBe(true);
    expect(response.snapshot.messages[0]).toMatchObject({
      text: "/review tudo",
    });
    expect(apiCalls.some((call) => call.url.includes("/command"))).toBe(true);
  });

  it("troca modelo e agente da sessão ativa", async () => {
    await loadWorker();
    await pairWorker();
    await callWorker({
      type: "session:model",
      model: { id: "model-2", providerID: "provider-1" },
    });
    await callWorker({ type: "session:agent", agent: "ask" });
    expect(apiCalls.some((call) => call.url.endsWith("/model"))).toBe(true);
    expect(apiCalls.some((call) => call.url.endsWith("/agent"))).toBe(true);
  });

  it("hidrata a conversa ao selecionar uma sessão", async () => {
    await loadWorker();
    await pairWorker();
    const response = await callWorker({
      type: "session:select",
      id: "ses_test",
    });
    expect(response.ok).toBe(true);
    expect(apiCalls.some((call) => call.url.includes("/context"))).toBe(true);
  });

  it("exclui a sessão ativa", async () => {
    await loadWorker();
    await pairWorker();
    const response = await callWorker({
      type: "session:delete",
      id: "ses_test",
    });
    expect(response.ok).toBe(true);
    expect(apiCalls.some((call) => call.method === "DELETE")).toBe(true);
  });

  it("interrompe a execução e limpa o estado ocupado", async () => {
    await loadWorker();
    await pairWorker();
    await callWorker({ type: "prompt", text: "olá" });
    const response = await callWorker({ type: "interrupt" });
    expect(response.ok).toBe(true);
    expect(response.snapshot.busy).toBe(false);
    expect(apiCalls.some((call) => call.url.includes("/interrupt"))).toBe(true);
  });

  it("anexa a aba ativa ao grupo da sessão", async () => {
    await loadWorker();
    await pairWorker();
    await callWorker({
      type: "settings:update",
      patch: { permissionMode: "allow" },
    });
    chrome.__state.addTab({
      id: 77,
      url: "https://exemplo.com/",
      active: true,
    });
    const response = await callWorker({ type: "tabs:attach-current" });
    expect(response.ok).toBe(true);
    expect(chrome.tabs.group).toHaveBeenCalled();
    const context = await callWorker({
      type: "tabs:list",
      sessionID: "ses_test",
    });
    expect(context.tabs).toContainEqual({
      id: 77,
      title: "Example",
      url: "https://exemplo.com/",
      active: true,
    });
    const detached = await callWorker({
      type: "tabs:detach",
      sessionID: "ses_test",
      tabID: 77,
    });
    expect(detached.ok).toBe(true);
    expect(detached.tabs.some((tab: { id: number }) => tab.id === 77)).toBe(
      false,
    );
    await expect(chrome.tabs.get(77)).resolves.toMatchObject({ id: 77 });
  });

  it("responde a comandos desconhecidos com erro", async () => {
    await loadWorker();
    const response = await callWorker({ type: "nada:disso" });
    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/Comando desconhecido/);
  });
});

describe("service-worker: pasta das conversas", () => {
  it("adota a pasta anunciada pelo plugin e passa a usá-la nas chamadas", async () => {
    await loadWorker();
    await pairWorker();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();
    apiCalls.length = 0;

    socket.message({
      type: "ready",
      v: 1,
      home: "/home/teste",
      workspace: "/home/teste/.opencode-browser-extensions",
    });
    await flush(20);

    const stored = await chrome.storage.local.get("opencode.config");
    expect(stored["opencode.config"]).toMatchObject({
      directory: "/home/teste/.opencode-browser-extensions",
    });
    expect(
      apiCalls.some((call) =>
        decodeURIComponent(call.url).includes(
          "directory=/home/teste/.opencode-browser-extensions",
        ),
      ),
    ).toBe(true);
  });

  it("não sobrescreve a pasta escolhida pelo usuário", async () => {
    await loadWorker();
    await pairWorker();
    await callWorker({
      type: "settings:update",
      patch: { directory: "/tmp/minha-pasta" },
    });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();

    socket.message({
      type: "ready",
      v: 1,
      workspace: "/home/teste/.opencode-browser-extensions",
    });
    await flush(20);

    const stored = await chrome.storage.local.get("opencode.config");
    expect(stored["opencode.config"]).toMatchObject({
      directory: "/tmp/minha-pasta",
    });
  });

  it("lista apenas sessões da pasta configurada", async () => {
    installFetch({
      sessions: [
        makeSession({ id: "ses_dentro", location: { directory: "/tmp/ws" } }),
        makeSession({
          id: "ses_fora",
          location: { directory: "/home/marcos" },
        }),
      ],
    });
    await loadWorker();
    await pairWorker();
    await callWorker({
      type: "settings:update",
      patch: { directory: "/tmp/ws" },
    });
    apiCalls.length = 0;

    const response = await callWorker({ type: "sessions:list" });

    expect(
      response.snapshot.sessions.map((session: { id: string }) => session.id),
    ).toEqual(["ses_dentro"]);
    expect(
      apiCalls.some((call) =>
        decodeURIComponent(call.url).includes("/api/session?directory=/tmp/ws"),
      ),
    ).toBe(true);
  });

  it("sessão sem location continua visível quando há pasta configurada", async () => {
    installFetch({
      sessions: [makeSession({ id: "ses_sem_location", location: undefined })],
    });
    await loadWorker();
    await pairWorker();
    await callWorker({
      type: "settings:update",
      patch: { directory: "/tmp/ws" },
    });

    const response = await callWorker({ type: "sessions:list" });

    expect(
      response.snapshot.sessions.map((session: { id: string }) => session.id),
    ).toEqual(["ses_sem_location"]);
  });
});

describe("service-worker: eventos SSE", () => {
  async function withSse(): Promise<void> {
    await loadWorker();
    await pairWorker();
    await flush();
  }

  it("acompanha texto, raciocínio e ferramentas", async () => {
    await withSse();
    pushEvent("session.text.started", {
      sessionID: "ses_test",
      assistantMessageID: "msg_a",
    });
    pushEvent("session.text.delta", {
      sessionID: "ses_test",
      assistantMessageID: "msg_a",
      delta: "Olá ",
    });
    pushEvent("session.reasoning.delta", {
      sessionID: "ses_test",
      assistantMessageID: "msg_a",
      delta: "pensando",
    });
    pushEvent("session.tool.input.started", {
      sessionID: "ses_test",
      id: "call_1",
      name: "shell",
    });
    pushEvent("session.tool.called", {
      sessionID: "ses_test",
      assistantMessageID: "msg_a",
      id: "call_1",
      input: { command: "ls" },
    });
    pushEvent("session.tool.success", {
      sessionID: "ses_test",
      assistantMessageID: "msg_a",
      id: "call_1",
      content: [{ type: "text", text: "saída" }],
    });
    await flush();
    const response = await callWorker({ type: "state:get" });
    const message = response.snapshot.messages.find(
      (item: any) => item.id === "msg_a",
    );
    expect(message.text).toContain("Olá ");
    expect(message.reasoning).toContain("pensando");
    expect(message.tools[0]).toMatchObject({
      id: "call_1",
      name: "shell",
      status: "ok",
      output: "saída",
    });
  });

  it("acompanha tokens e custo e orienta quando faltam créditos", async () => {
    await withSse();
    pushEvent("message.updated", {
      info: {
        id: "msg_usage",
        sessionID: "ses_test",
        role: "assistant",
        tokens: {
          total: 120,
          input: 80,
          output: 40,
          reasoning: 5,
          cache: { read: 10, write: 2 },
        },
        cost: 0.0004,
      },
    });
    pushEvent("session.usage.updated", {
      sessionID: "ses_test",
      messageID: "msg_usage",
      usage: {
        tokens: {
          total: 128,
          input: 83,
          output: 45,
          reasoning: 5,
          cache: { read: 12, write: 3 },
        },
        cost: 0.0005,
      },
    });
    pushEvent("session.error", {
      sessionID: "ses_test",
      error: { name: "ProviderError", data: { message: "insufficient funds" } },
    });
    await flush();

    const response = await callWorker({ type: "state:get" });
    const assistant = response.snapshot.messages.find(
      (item: any) => item.id === "msg_usage",
    );
    expect(assistant.usage).toEqual({
      total: 128,
      input: 83,
      output: 45,
      reasoning: 5,
      cacheRead: 12,
      cacheWrite: 3,
      cost: 0.0005,
    });
    expect(assistant.error).toContain("insufficient funds");
    expect(assistant.error).toMatch(/saldo e os limites de gastos/i);
  });

  it("trata retry, erro, status idle e conclusão", async () => {
    await withSse();
    pushEvent("session.retry.scheduled", {
      sessionID: "ses_test",
      attempt: 2,
      message: "sobrecarga",
    });
    await flush();
    let response = await callWorker({ type: "state:get" });
    expect(response.snapshot.statusMessage).toMatch(/tentativa 2/);

    pushEvent("session.error", {
      sessionID: "ses_test",
      error: { message: "falhou" },
    });
    await flush();
    response = await callWorker({ type: "state:get" });
    expect(response.snapshot.statusMessage).toBeNull();

    pushEvent("session.execution.succeeded", { sessionID: "ses_test" });
    await flush();
    expect(chrome.notifications.create).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "PLAY_NOTIFICATION",
    });

    pushEvent("session.status", {
      sessionID: "ses_test",
      status: { type: "idle" },
    });
    await flush();
    response = await callWorker({ type: "state:get" });
    expect(response.snapshot.busy).toBe(false);
  });

  it("mostra no chat o erro enviado por session.execution.failed", async () => {
    await withSse();
    pushEvent("session.execution.started", { sessionID: "ses_test" });
    pushEvent("session.execution.failed", {
      sessionID: "ses_test",
      error: {
        name: "ProviderError",
        data: { message: "insufficient funds" },
      },
    });
    await flush();

    const response = await callWorker({ type: "state:get" });
    const assistant = response.snapshot.messages.find(
      (item: any) => item.kind === "assistant",
    );
    expect(response.snapshot.busy).toBe(false);
    expect(assistant.error).toContain("insufficient funds");
    expect(assistant.error).toMatch(/saldo e os limites de gastos/i);
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it("atualiza título de sessão renomeada", async () => {
    await withSse();
    pushEvent("session.renamed", {
      sessionID: "ses_test",
      title: "Novo título",
    });
    await flush();
    const response = await callWorker({ type: "state:get" });
    expect(
      response.snapshot.sessions.find((item: any) => item.id === "ses_test")
        .title,
    ).toBe("Novo título");
  });
});

describe("service-worker: relay e ferramentas", () => {
  async function withSocket(): Promise<FakeWebSocket> {
    await loadWorker();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    await flush();
    return socket;
  }

  it("responde hello ao abrir o socket", async () => {
    const socket = await withSocket();
    expect(socket.sentJson()[0]).toMatchObject({
      type: "hello",
      extensionId: "test-extension-id",
    });
  });

  it("executa tool_request e devolve tool_result", async () => {
    const socket = await withSocket();
    socket.message({
      type: "tool_request",
      id: "t1",
      tool: "tabs_context",
      args: { createIfEmpty: true },
      sessionID: "ses_relay",
    });
    await flush(20);
    const result = socket
      .sentJson()
      .find((message) => message.type === "tool_result");
    expect(result).toMatchObject({ id: "t1", ok: true });
    expect(result.content).toContain("tabGroupId");
  });

  it("devolve erro quando a ferramenta falha", async () => {
    const socket = await withSocket();
    socket.message({
      type: "tool_request",
      id: "t2",
      tool: "navigate",
      args: { url: "ftp://exemplo.com" },
      sessionID: "ses_relay",
    });
    await flush(20);
    const result = socket
      .sentJson()
      .find((message) => message.type === "tool_result" && message.id === "t2");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/http/);
  });

  it("ignora cancelamento de chamada inexistente", async () => {
    const socket = await withSocket();
    socket.message({ type: "cancel", id: "nao-existe" });
    await flush();
    expect(
      socket.sentJson().some((message) => message.type === "tool_result"),
    ).toBe(false);
  });

  it("para a execução com browser:stop", async () => {
    await withSocket();
    const response = await callWorker(
      { type: "browser:stop" },
      { tab: { id: 5 } },
    );
    expect(response).toEqual({ ok: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, {
      type: "indicator:hide",
    });
  });

  it("reconecta o relay a pedido", async () => {
    await withSocket();
    const response = await callWorker({ type: "relay:reconnect" });
    await flush();
    expect(response.ok).toBe(true);
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
  });
});

describe("service-worker: alarmes, atalhos e storage", () => {
  it("trata alarme de keepalive", async () => {
    await loadWorker();
    chrome.offscreen.hasDocument = vi.fn(async () => true);
    chrome.offscreen.createDocument.mockClear();
    chrome.alarms.onAlarm.emit({ name: "keepalive" });
    await flush();
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  it("abre o side panel pelo atalho", async () => {
    await loadWorker();
    chrome.commands.onCommand.emit("toggle-side-panel");
    await flush();
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 1 });
  });

  it("recarrega listas quando o storage muda", async () => {
    await loadWorker();
    chrome.__state.emitStorageChanged(
      { "permissions.allow": { newValue: ["example.com"] } },
      "local",
    );
    await flush();
    const response = await callWorker({ type: "state:get" });
    expect(response.ok).toBe(true);
  });

  it("abre as opções", async () => {
    await loadWorker();
    await callWorker({ type: "open:options" });
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });
});
