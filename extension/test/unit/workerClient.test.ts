import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import { createRequest } from "../../src/protocol";
import { WorkerClient, WorkerProtocolError } from "../../src/workerClient";

class FakeProcess extends EventEmitter {
  public readonly stdin = new PassThrough();
  public readonly stdout = new PassThrough();
  public readonly stderr = new PassThrough();

  public asChild(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams;
  }
}

describe("WorkerClient", () => {
  it("correlates concurrent responses by id", async () => {
    const process = new FakeProcess();
    const client = new WorkerClient(process.asChild());
    const firstRequest = createRequest("formatDocument", { source: "first" });
    const secondRequest = createRequest("formatDocument", { source: "second" });
    const first = client.request(firstRequest, 1_000);
    const second = client.request(secondRequest, 1_000);

    process.stdout.write(
      `${JSON.stringify({ protocolVersion: 1, id: secondRequest.id, result: { formatted: "2" } })}\n`
    );
    process.stdout.write(
      `${JSON.stringify({ protocolVersion: 1, id: firstRequest.id, result: { formatted: "1" } })}\n`
    );

    await expect(first).resolves.toEqual({ formatted: "1" });
    await expect(second).resolves.toEqual({ formatted: "2" });
  });

  it("rejects structured errors", async () => {
    const process = new FakeProcess();
    const client = new WorkerClient(process.asChild());
    const request = createRequest("formatDocument", { source: "bad" });
    const pending = client.request(request, 1_000);
    process.stdout.write(
      `${JSON.stringify({
        protocolVersion: 1,
        id: request.id,
        error: { code: "FORMAT_ERROR", message: "invalid source" }
      })}\n`
    );
    await expect(pending).rejects.toEqual(
      expect.objectContaining<Partial<WorkerProtocolError>>({ code: "FORMAT_ERROR" })
    );
  });

  it("ignores responses containing both result and error", async () => {
    vi.useFakeTimers();
    const process = new FakeProcess();
    const warning = vi.fn();
    const client = new WorkerClient(process.asChild(), warning);
    const request = createRequest("initialize", {});
    const pending = client.request(request, 50);
    process.stdout.write(
      `${JSON.stringify({
        protocolVersion: 1,
        id: request.id,
        result: {},
        error: { code: "INVALID", message: "invalid" }
      })}\n`
    );
    expect(warning).toHaveBeenCalledWith("Worker emitted an invalid protocol response.");
    const assertion = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
    vi.useRealTimers();
  });

  it("ignores malformed protocol errors", () => {
    const process = new FakeProcess();
    const warning = vi.fn();
    new WorkerClient(process.asChild(), warning);
    process.stdout.write(
      `${JSON.stringify({ protocolVersion: 1, id: "request", error: { code: "INVALID" } })}\n`
    );
    expect(warning).toHaveBeenCalledWith("Worker emitted an invalid protocol response.");
  });

  it("ignores malformed protocol results", () => {
    const process = new FakeProcess();
    const warning = vi.fn();
    new WorkerClient(process.asChild(), warning);
    process.stdout.write(
      `${JSON.stringify({ protocolVersion: 1, id: "request", result: { formatted: 42 } })}\n`
    );
    expect(warning).toHaveBeenCalledWith("Worker emitted an invalid protocol response.");
  });

  it("times out a request", async () => {
    vi.useFakeTimers();
    const process = new FakeProcess();
    const client = new WorkerClient(process.asChild());
    const pending = client.request(createRequest("initialize", {}), 50);
    const assertion = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
    vi.useRealTimers();
  });

  it("rejects all pending requests when the worker crashes", async () => {
    const process = new FakeProcess();
    const client = new WorkerClient(process.asChild());
    const first = client.request(createRequest("initialize", {}), 1_000);
    const second = client.request(createRequest("formatDocument", { source: "" }), 1_000);
    process.emit("exit", 1, null);
    await expect(first).rejects.toThrow("exited");
    await expect(second).rejects.toThrow("exited");
  });

  it("warns without resolving when stdout is not protocol JSON", () => {
    const process = new FakeProcess();
    const warning = vi.fn();
    new WorkerClient(process.asChild(), warning);
    process.stdout.write("not-json\n");
    expect(warning).toHaveBeenCalledWith("Worker emitted invalid JSON on stdout.");
  });
});
