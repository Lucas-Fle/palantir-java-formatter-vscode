import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

import { isProtocolResponse, type ProtocolRequest } from "./protocol";

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class WorkerProtocolError extends Error {
  public constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "WorkerProtocolError";
  }
}

export class WorkerClient {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly lines: Interface;
  private closed = false;

  public constructor(
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly onProtocolWarning: (message: string) => void = () => undefined
  ) {
    this.lines = createInterface({ input: process.stdout, crlfDelay: Number.POSITIVE_INFINITY });
    this.lines.on("line", (line) => this.handleLine(line));
    process.once("exit", (code, signal) => {
      this.close(new Error(`Formatter worker exited (code=${String(code)}, signal=${String(signal)}).`));
    });
    process.once("error", (error) => this.close(error));
  }

  public request(
    request: ProtocolRequest,
    timeoutMs: number
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("Formatter worker is not running."));
    }

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Formatter worker request '${request.method}' timed out after ${timeoutMs} ms.`));
      }, timeoutMs);

      this.pending.set(request.id, {
        resolve,
        reject,
        timer
      });

      const payload = `${JSON.stringify(request)}\n`;
      this.process.stdin.write(payload, "utf8", (error) => {
        if (error !== null && error !== undefined) {
          const pending = this.pending.get(request.id);
          if (pending !== undefined) {
            clearTimeout(pending.timer);
            this.pending.delete(request.id);
            pending.reject(error);
          }
        }
      });
    });
  }

  public rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  public dispose(): void {
    this.close(new Error("Formatter worker client disposed."));
  }

  private handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.onProtocolWarning("Worker emitted invalid JSON on stdout.");
      return;
    }

    if (!isProtocolResponse(parsed)) {
      this.onProtocolWarning("Worker emitted an invalid protocol response.");
      return;
    }

    const response = parsed;
    if (response.id === null) {
      this.onProtocolWarning(
        "error" in response ? response.error.message : "Worker returned an uncorrelated response."
      );
      return;
    }

    const pending = this.pending.get(response.id);
    if (pending === undefined) {
      this.onProtocolWarning(`Worker returned an unknown response id '${response.id}'.`);
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if ("error" in response) {
      pending.reject(new WorkerProtocolError(response.error.code, response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private close(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.lines.close();
    this.rejectAll(error);
  }
}
