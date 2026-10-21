# Arquitetura

O sistema tem três processos/contextos:

| Componente | Responsabilidade | Tecnologia | Endereço |
|---|---|---|---|
| **Extensão** | UI, sessões, streaming, execução das ações no navegador | TypeScript, React 19, MV3 | `chrome-extension://<id>` |
| **OpenCode local** | Modelos, sessões, agente, histórico, SSE | OpenCode v2 (API HTTP) | `http://127.0.0.1:<porta>` |
| **Plugin `browser-relay`** | Registra as tools `browser_*` e faz a ponte com a extensão | TypeScript no runtime do OpenCode | `ws://127.0.0.1:8799` (ou 8800–8802) |

```mermaid
flowchart LR
    subgraph Navegador["Chrome / Chromium"]
        UI["Side panel (React)<br/>chat, modelos, permissões"]
        SW["Service worker<br/>API, SSE, CDP, grupos de abas"]
        CS["Content scripts<br/>árvore de acessibilidade + indicador"]
        OFF["Offscreen<br/>keepalive, som, GIF"]
        UI <-->|"chrome.runtime<br/>(port + mensagens)"| SW
        SW -->|"chrome.scripting / debugger"| CS
        SW <-->|"mensagens"| OFF
    end

    subgraph Maquina["Máquina local"]
        OC["OpenCode v2<br/>modelos, sessões, agente"]
        PL["Plugin browser-relay<br/>tools browser_*"]
        OC --- PL
    end

    SW -->|"HTTP + SSE<br/>Basic auth"| OC
    SW <-->|"WebSocket + fallback HTTP<br/>token local"| PL
```

## Fluxo de uma conversa

```mermaid
sequenceDiagram
    participant U as Usuário
    participant UI as Side panel
    participant SW as Service worker
    participant OC as OpenCode
    participant PL as Plugin
    participant CH as Chrome

    U->>UI: escreve e envia
    UI->>SW: prompt
    SW->>OC: POST /api/session/:id/prompt
    OC-->>SW: SSE session.text.delta
    SW-->>UI: snapshot com streaming
    OC->>PL: tool browser_navigate
    PL->>SW: tool_request (WebSocket)
    SW->>CH: permissão + navegação
    CH-->>SW: resultado
    SW-->>PL: tool_result
    PL-->>OC: conteúdo da tool
    OC-->>SW: SSE session.tool.success
    SW-->>UI: card de ferramenta atualizado
```

## Fluxo de pareamento

```mermaid
sequenceDiagram
    participant U as Usuário
    participant UI as Side panel
    participant SW as Service worker
    participant OC as OpenCode

    U->>OC: opencode pair
    OC-->>U: link http://127.0.0.1:<porta>/auth/connect/<code>
    U->>UI: cola o link
    UI->>SW: pair(link)
    SW->>OC: GET /auth/connect/<code> (Accept: application/json)
    OC-->>SW: { token }
    SW->>SW: salva baseUrl + token
    SW->>OC: GET /api/model, /api/agent, /api/command
    SW-->>UI: snapshot com modelos, agentes e comandos
```

## Fluxo de ferramenta e permissão

```mermaid
flowchart TD
    A["Plugin envia tool_request"] --> B{"Tool é de leitura?"}
    B -->|"sim"| C["Executa direto"]
    B -->|"não"| D{"Host já liberado?"}
    D -->|"sim"| C
    D -->|"não"| E{"Painel aberto?"}
    E -->|"sim"| F["Card no side panel"]
    E -->|"não"| G["Popup de permissão"]
    F --> H{"Decisão"}
    G --> H
    H -->|"permitir uma vez"| C
    H -->|"permitir nesta sessão"| I["Allowlist da sessão"] --> C
    H -->|"permitir sempre"| J["Allowlist persistente"] --> C
    H -->|"negar / timeout"| K["Resultado negado"]
```

## Camadas da extensão

| Camada | Arquivos | Papel |
|---|---|---|
| Background | `src/background/**` | Cliente do OpenCode, SSE, relay, CDP, grupos de abas, permissões, registro de tools |
| Conteúdo | `src/content/**` | Árvore de acessibilidade com refs, ações de DOM, indicador visual e botão Parar |
| UI | `src/sidepanel`, `src/options`, `src/permission` | Chat, configurações e popup de permissão |
| Offscreen | `src/offscreen.ts` | Keepalive do service worker, aviso sonoro e codificação de GIF |
| Compartilhado | `src/shared/**` | Tipos, protocolo do relay, armazenamento |

## Decisões registradas

As escolhas estruturais estão em [adr/](adr/): MV3 + side panel, pareamento por
link, plugin local com relay, permissões por ação/domínio, CDP com fallback,
grupos de abas por sessão, ranking opcional no `find` e GIF no offscreen.
