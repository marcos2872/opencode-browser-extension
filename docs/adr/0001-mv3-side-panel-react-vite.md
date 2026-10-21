# 0001 — Extensão MV3 com side panel em React e Vite

## Status

aceito

## Contexto

Precisávamos de uma interface de chat com streaming, seleção de modelos, cards
de ferramenta e prompts de permissão, convivendo com um service worker que
controla abas e páginas. A interface precisa ficar visível ao lado da página
controlada, sem competir com o conteúdo.

## Decisão

Usar Manifest V3 com **side panel** (`chrome.sidePanel`) e UI em **React 19 +
TypeScript + Vite 7**, com builds separados para as páginas (ESM), o service
worker (ESM) e os content scripts (IIFE).

## Consequências

- (+) Painel integrado ao navegador, sempre à mão e isolado do site.
- (+) React facilita o estado do chat e a reutilização do card de permissão entre
  painel e popup.
- (+) Builds separados respeitam as restrições de módulo de cada contexto.
- (−) Quatro configurações de Vite e necessidade de recarregar a extensão a cada
  build.
- (−) Service worker pode ser suspenso; foi necessário um offscreen com keepalive.
