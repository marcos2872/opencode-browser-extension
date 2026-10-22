import { describe, expect, it, vi } from "vitest"
import type { Cdp } from "../../src/background/cdp"
import { Recording } from "../../src/background/recording"

function makeRecording(screenshot = vi.fn(async (_tabId: number): Promise<string> => "data")) {
  const recording = new Recording({ screenshot } as unknown as Cdp)
  return { recording, screenshot }
}

function deferredScreenshots() {
  const resolvers: Array<(value: string) => void> = []
  const screenshot = vi.fn(
    (_tabId: number) =>
      new Promise<string>((resolve) => {
        resolvers.push(resolve)
      }),
  )
  return { screenshot, resolvers }
}

describe("background/recording", () => {
  describe("start/stop", () => {
    it("start ativa a gravação e zera os quadros", async () => {
      const { recording, screenshot } = makeRecording()
      expect(recording.active).toBe(false)
      expect(recording.count).toBe(0)

      await recording.capture(1, "ignorado")
      expect(screenshot).not.toHaveBeenCalled()

      recording.start("ses_1")
      expect(recording.active).toBe(true)
      expect(recording.count).toBe(0)
    })

    it("start zera os quadros de uma gravação anterior", async () => {
      const { recording } = makeRecording()
      recording.start("ses_1")
      await recording.capture(1, "antigo")
      expect(recording.count).toBe(1)

      recording.start("ses_2")
      expect(recording.count).toBe(0)
      await expect(recording.take()).resolves.toEqual([])
    })

    it("stop aguarda a fila e desativa", async () => {
      const { screenshot, resolvers } = deferredScreenshots()
      const { recording } = makeRecording(screenshot)
      recording.start("ses_1")

      const pending = recording.capture(1, "lento")
      let stopped = false
      const stop = recording.stop().then(() => {
        stopped = true
      })

      await vi.waitFor(() => expect(screenshot).toHaveBeenCalledTimes(1))
      expect(stopped).toBe(false)

      resolvers[0]!("dados")
      await stop

      expect(stopped).toBe(true)
      expect(recording.active).toBe(false)
      expect(recording.count).toBe(1)
      await expect(pending).resolves.toBeUndefined()
    })

    it("capture após stop é ignorado", async () => {
      const { recording, screenshot } = makeRecording()
      recording.start("ses_1")
      await recording.stop()

      await recording.capture(1, "depois")
      expect(screenshot).not.toHaveBeenCalled()
      expect(recording.count).toBe(0)
    })
  })

  describe("take/clear/flush", () => {
    it("take aguarda a fila e devolve os quadros", async () => {
      const { screenshot, resolvers } = deferredScreenshots()
      const { recording } = makeRecording(screenshot)
      recording.start("ses_1")

      void recording.capture(1, "um")
      void recording.capture(2, "dois")
      const taking = recording.take()

      await vi.waitFor(() => expect(screenshot).toHaveBeenCalledTimes(1))
      resolvers[0]!("d1")
      await vi.waitFor(() => expect(screenshot).toHaveBeenCalledTimes(2))
      resolvers[1]!("d2")

      await expect(taking).resolves.toEqual([
        { data: "d1", label: "um" },
        { data: "d2", label: "dois" },
      ])
    })

    it("take devolve uma cópia dos quadros", async () => {
      const { recording } = makeRecording()
      recording.start("ses_1")
      await recording.capture(1, "um")

      const frames = await recording.take()
      frames.push({ data: "intruso", label: "extra" })

      expect(recording.count).toBe(1)
      expect(frames).toHaveLength(2)
    })

    it("clear zera os quadros sem desativar", async () => {
      const { recording } = makeRecording()
      recording.start("ses_1")
      await recording.capture(1, "um")

      recording.clear()

      expect(recording.count).toBe(0)
      expect(recording.active).toBe(true)
      await expect(recording.take()).resolves.toEqual([])
    })

    it("flush espera a fila terminar", async () => {
      const { screenshot, resolvers } = deferredScreenshots()
      const { recording } = makeRecording(screenshot)
      recording.start("ses_1")

      void recording.capture(1, "lento")
      await vi.waitFor(() => expect(screenshot).toHaveBeenCalledTimes(1))

      let flushed = false
      const flush = recording.flush().then(() => {
        flushed = true
      })
      await Promise.resolve()
      expect(flushed).toBe(false)

      resolvers[0]!("dados")
      await flush

      expect(flushed).toBe(true)
      expect(recording.count).toBe(1)
    })
  })

  describe("capture", () => {
    it("ignora quando a gravação está inativa", async () => {
      const { recording, screenshot } = makeRecording()
      await recording.capture(1, "x")
      expect(screenshot).not.toHaveBeenCalled()
      expect(recording.count).toBe(0)
    })

    it("ignora após 30 quadros", async () => {
      const { recording, screenshot } = makeRecording()
      recording.start("ses_1")

      for (let index = 0; index < 30; index += 1) {
        await recording.capture(1, `q${index}`)
      }
      expect(recording.count).toBe(30)

      await recording.capture(1, "extra")
      expect(screenshot).toHaveBeenCalledTimes(30)
      expect(recording.count).toBe(30)
    })

    it("reverifica o limite de 30 quadros dentro da fila", async () => {
      let release: (() => void) | undefined
      let calls = 0
      const screenshot = vi.fn((_tabId: number) => {
        calls += 1
        if (calls === 1) {
          return new Promise<string>((resolve) => {
            release = () => resolve("d0")
          })
        }
        return Promise.resolve("data")
      })
      const { recording } = makeRecording(screenshot)
      recording.start("ses_1")

      const initial = recording.capture(1, "inicial")
      const queued: Array<Promise<void>> = []
      for (let index = 0; index < 30; index += 1) {
        queued.push(recording.capture(1, `q${index}`))
      }

      await vi.waitFor(() => expect(screenshot).toHaveBeenCalledTimes(1))
      release?.()
      await Promise.all([initial, ...queued])

      expect(recording.count).toBe(30)
      expect(screenshot).toHaveBeenCalledTimes(30)
    })

    it("engole erro do screenshot", async () => {
      const screenshot = vi.fn(async (): Promise<string> => {
        throw new Error("DevTools aberto")
      })
      const { recording } = makeRecording(screenshot)
      recording.start("ses_1")

      await expect(recording.capture(1, "erro")).resolves.toBeUndefined()
      expect(recording.count).toBe(0)
    })

    it("serializa capturas na ordem de chamada", async () => {
      const { screenshot, resolvers } = deferredScreenshots()
      const { recording } = makeRecording(screenshot)
      recording.start("ses_1")

      const first = recording.capture(1, "primeiro")
      const second = recording.capture(2, "segundo")

      await vi.waitFor(() => expect(screenshot).toHaveBeenCalledTimes(1))
      expect(screenshot).toHaveBeenNthCalledWith(1, 1)

      resolvers[0]!("d1")
      await vi.waitFor(() => expect(screenshot).toHaveBeenCalledTimes(2))
      expect(screenshot).toHaveBeenNthCalledWith(2, 2)

      resolvers[1]!("d2")
      await Promise.all([first, second])

      const frames = await recording.take()
      expect(frames.map((frame) => frame.label)).toEqual(["primeiro", "segundo"])
      expect(frames.map((frame) => frame.data)).toEqual(["d1", "d2"])
    })
  })
})
