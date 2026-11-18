/* global window, document, localStorage, IntersectionObserver */
(() => {
  // O site tem uma árvore por idioma (web/ e web/en/) e os dois usam este mesmo
  // script: os textos de interface saem de `lang` do documento.
  const textos = {
    pt: {
      tema: "Tema",
      alternar: "clique para alternar",
      temaRotulos: { sistema: "sistema", claro: "claro", escuro: "escuro" },
      contador: (atual, total) => `${atual} de ${total}`,
      copiar: "Copiar",
      copiada: "Copiado!",
      copiarAria: "Copiar comando do bloco",
      copiadoAria: "Comando copiado",
      falhou: "Falha ao copiar",
      falhouAria: "Falha ao copiar comando",
      falhouTitulo: "Selecione o comando e copie manualmente.",
      erroCopia: "Não foi possível copiar o comando.",
    },
    en: {
      tema: "Theme",
      alternar: "click to switch",
      temaRotulos: { sistema: "system", claro: "light", escuro: "dark" },
      contador: (atual, total) => `${atual} of ${total}`,
      copiar: "Copy",
      copiada: "Copied!",
      copiarAria: "Copy the block command",
      copiadoAria: "Command copied",
      falhou: "Copy failed",
      falhouAria: "Failed to copy the command",
      falhouTitulo: "Select the command and copy it manually.",
      erroCopia: "Could not copy the command.",
    },
  };
  const textosDaPagina =
    document.documentElement.lang.toLowerCase().startsWith("pt")
      ? textos.pt
      : textos.en;
  const chave = "guia-do-usuario-tema";
  const sistema = window.matchMedia("(prefers-color-scheme: light)");
  const guardado = localStorage.getItem(chave);
  let preferencia = ["claro", "escuro", "sistema"].includes(guardado)
    ? guardado
    : "sistema";
  const resolver = (valor) =>
    valor === "claro" || valor === "escuro"
      ? valor
      : sistema.matches
        ? "claro"
        : "escuro";
  const aplicar = () => {
    document.documentElement.dataset.tema = resolver(preferencia);
  };

  aplicar();
  document.addEventListener("DOMContentLoaded", () => {
    const botao = document.getElementById("alternar-tema");
    if (botao) {
      const rotulo = botao.querySelector(".rotulo");
      const icone = botao.querySelector(".icone");
      const ordem = ["sistema", "claro", "escuro"];
      const icones = { sistema: "◐", claro: "☀", escuro: "☾" };
      const atualizarBotao = () => {
        aplicar();
        rotulo.textContent = textosDaPagina.temaRotulos[preferencia];
        icone.textContent = icones[preferencia];
        botao.setAttribute(
          "aria-label",
          `${textosDaPagina.tema}: ${textosDaPagina.temaRotulos[preferencia]}`,
        );
        botao.title = `${textosDaPagina.tema}: ${textosDaPagina.temaRotulos[preferencia]} (${textosDaPagina.alternar})`;
        localStorage.setItem(chave, preferencia);
      };
      botao.addEventListener("click", () => {
        preferencia = ordem[(ordem.indexOf(preferencia) + 1) % ordem.length];
        atualizarBotao();
      });
      sistema.addEventListener("change", () => {
        if (preferencia === "sistema") atualizarBotao();
      });
      atualizarBotao();
    }

    const menuPaginas = document.querySelector(".menu-paginas");
    if (menuPaginas) {
      document.addEventListener("click", (event) => {
        if (menuPaginas.open && !menuPaginas.contains(event.target)) {
          menuPaginas.open = false;
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && menuPaginas.open) {
          menuPaginas.open = false;
          menuPaginas.querySelector("summary")?.focus();
        }
      });
    }

    const carrossel = document.querySelector(".carrossel-videos");
    if (carrossel) {
      const faixa = carrossel.querySelector(".videos");
      const slides = [...carrossel.querySelectorAll(".video-card")];
      const videos = [...carrossel.querySelectorAll("video")];
      const anterior = carrossel.querySelector("#video-anterior");
      const proximo = carrossel.querySelector("#video-proximo");
      const contador = carrossel.querySelector("#video-contador");
      let indice = 0;
      let frameAtualizacao = 0;

      videos.forEach((video) => {
        video.defaultPlaybackRate = 1.5;
        video.playbackRate = 1.5;
      });

      const atualizarControles = () => {
        anterior.disabled = indice === 0;
        proximo.disabled = indice === slides.length - 1;
        contador.textContent = textosDaPagina.contador(indice + 1, slides.length);
      };
      const irPara = (novoIndice) => {
        indice = Math.max(0, Math.min(novoIndice, slides.length - 1));
        faixa.scrollTo({ left: indice * faixa.clientWidth, behavior: "smooth" });
        atualizarControles();
      };

      anterior.addEventListener("click", () => irPara(indice - 1));
      proximo.addEventListener("click", () => irPara(indice + 1));
      faixa.addEventListener("scroll", () => {
        if (frameAtualizacao) return;
        frameAtualizacao = window.requestAnimationFrame(() => {
          frameAtualizacao = 0;
          indice = Math.round(faixa.scrollLeft / faixa.clientWidth);
          atualizarControles();
        });
      }, { passive: true });
      faixa.addEventListener("keydown", (event) => {
        if (event.target !== faixa) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          irPara(indice - 1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          irPara(indice + 1);
        }
      });
      window.addEventListener("resize", () => {
        faixa.scrollTo({ left: indice * faixa.clientWidth });
      });
      atualizarControles();
    }

    const copiarTexto = async (texto) => {
      try {
        await window.navigator.clipboard.writeText(texto);
        return;
      } catch {
        // Em contexto sem Clipboard API, tenta a cópia por seleção.
      }

      const campo = document.createElement("textarea");
      campo.value = texto;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.top = "-9999px";
      document.body.appendChild(campo);
      campo.select();
      campo.setSelectionRange(0, texto.length);
      let copiado;
      try {
        copiado = document.execCommand?.("copy") ?? false;
      } catch {
        copiado = false;
      } finally {
        campo.remove();
      }
      if (!copiado) throw new Error(textosDaPagina.erroCopia);
    };

    document.querySelectorAll("pre[data-linguagem]").forEach((bloco) => {
      const codigo = bloco.querySelector("code");
      if (!codigo) return;

      const botao = document.createElement("button");
      botao.className = "botao-copiar";
      botao.type = "button";
      botao.textContent = textosDaPagina.copiar;
      botao.setAttribute("aria-label", textosDaPagina.copiarAria);
      const moldura = document.createElement("div");
      moldura.className = "bloco-terminal";
      bloco.parentNode.insertBefore(moldura, bloco);
      moldura.appendChild(bloco);
      moldura.appendChild(botao);

      botao.addEventListener("click", async () => {
        botao.disabled = true;
        try {
          await copiarTexto(codigo.textContent ?? "");
          botao.textContent = textosDaPagina.copiada;
          botao.classList.add("copiado");
          botao.setAttribute("aria-label", textosDaPagina.copiadoAria);
        } catch {
          botao.textContent = textosDaPagina.falhou;
          botao.title = textosDaPagina.falhouTitulo;
          botao.setAttribute("aria-label", textosDaPagina.falhouAria);
        }
        window.setTimeout(() => {
          botao.disabled = false;
          botao.textContent = textosDaPagina.copiar;
          botao.title = "";
          botao.classList.remove("copiado");
          botao.setAttribute("aria-label", textosDaPagina.copiarAria);
        }, 1600);
      });
    });

    const links = [...document.querySelectorAll("aside a[href^='#']")];
    const secoes = links
      .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
      .filter(Boolean);
    if (!secoes.length || !("IntersectionObserver" in window)) return;
    let visivel = null;
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) visivel = entrada.target;
        }
        if (!visivel) return;
        links.forEach((link) =>
          link.classList.toggle(
            "ativo",
            decodeURIComponent(link.hash.slice(1)) === visivel.id,
          ),
        );
      },
      { rootMargin: "-72px 0px -70% 0px", threshold: 0 },
    );
    secoes.forEach((secao) => observador.observe(secao));
  });
})();
