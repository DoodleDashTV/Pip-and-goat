import type { ControlCenterConfig } from "./config";
import { sanitizeVendorFailure, SanitizedError } from "./errors";

export interface CursorGitBranch {
  repoUrl: string;
  branch?: string;
  prUrl?: string;
}

export interface CursorAgentRef {
  agentId: string;
  runId?: string;
  url?: string;
  status: string;
  name?: string;
  workOnCurrentBranch?: boolean;
  autoCreatePR?: boolean;
  branches?: CursorGitBranch[];
}

export interface CursorClient {
  createAgent(input: {
    prompt: string;
    name: string;
    repoUrl: string;
    startingRef: string;
    agentId: string;
    autoCreatePR?: boolean;
  }): Promise<CursorAgentRef>;
  getAgent(agentId: string): Promise<CursorAgentRef>;
  getRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string; branches?: CursorGitBranch[]; text?: string }>;
  cancelRun(agentId: string, runId: string): Promise<{ id: string; status: string }>;
  listAgents(limit?: number): Promise<CursorAgentRef[]>;
}

function cryptoRandom(): string {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
}

export class MockCursorClient implements CursorClient {
  private agents = new Map<
    string,
    CursorAgentRef & { prompt: string; cancelled?: boolean }
  >();
  createCalls = 0;
  cancelShouldFail = false;

  async createAgent(input: {
    prompt: string;
    name: string;
    repoUrl: string;
    startingRef: string;
    agentId: string;
    autoCreatePR?: boolean;
  }): Promise<CursorAgentRef> {
    this.createCalls += 1;
    const existing = this.agents.get(input.agentId);
    if (existing) {
      // Simulate 409 idempotent conflict → return existing
      return existing;
    }
    const runId = `run-mock-${cryptoRandom()}`;
    const ref: CursorAgentRef & { prompt: string } = {
      agentId: input.agentId,
      runId,
      url: `https://cursor.com/agents/${input.agentId}`,
      status: "ACTIVE",
      name: input.name,
      workOnCurrentBranch: false,
      autoCreatePR: false,
      branches: [
        {
          repoUrl: input.repoUrl.replace(/^https?:\/\//, ""),
          branch: `cursor/ddp-cc-${cryptoRandom().slice(0, 6)}`,
        },
      ],
      prompt: input.prompt,
    };
    this.agents.set(input.agentId, ref);
    // Mock finishes quickly on getRun
    return ref;
  }

  async getAgent(agentId: string): Promise<CursorAgentRef> {
    const found = this.agents.get(agentId);
    if (!found) {
      throw new SanitizedError({
        message: "Cursor agent not found",
        category: "cursor",
        statusCode: 404,
        provider: "cursor",
      });
    }
    return {
      ...found,
      status: found.cancelled ? "CANCELLED" : found.status,
    };
  }

  async getRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string; branches?: CursorGitBranch[]; text?: string }> {
    const found = this.agents.get(agentId);
    if (!found || found.runId !== runId) {
      throw new SanitizedError({
        message: "Cursor run not found",
        category: "cursor",
        statusCode: 404,
        provider: "cursor",
      });
    }
    if (found.cancelled) {
      return { id: runId, status: "CANCELLED", branches: found.branches };
    }
    // Immediate finish for mock
    found.status = "FINISHED";
    return {
      id: runId,
      status: "FINISHED",
      branches: found.branches,
      text: "SAFE_TEST_OK",
    };
  }

  async cancelRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string }> {
    if (this.cancelShouldFail) {
      throw new SanitizedError({
        message: "Cursor cancel failed",
        category: "cursor",
        statusCode: 502,
        provider: "cursor",
      });
    }
    const found = this.agents.get(agentId);
    if (!found) {
      throw new SanitizedError({
        message: "Cursor agent not found",
        category: "cursor",
        statusCode: 404,
        provider: "cursor",
      });
    }
    found.cancelled = true;
    found.status = "CANCELLED";
    return { id: runId, status: "CANCELLED" };
  }

  async listAgents(): Promise<CursorAgentRef[]> {
    return [...this.agents.values()];
  }

  /** Test helper: inject agent as if create returned but local save failed. */
  injectAgent(ref: CursorAgentRef & { prompt?: string }): void {
    this.agents.set(ref.agentId, {
      prompt: ref.prompt || "",
      ...ref,
    });
  }
}

export class HttpCursorClient implements CursorClient {
  constructor(private readonly config: ControlCenterConfig) {
    if (!config.cursorApiKey) {
      throw new SanitizedError({
        message: "CURSOR_API_KEY is required for live Cursor client",
        category: "config",
        statusCode: 500,
      });
    }
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.config.cursorApiKey}:`).toString("base64");
    return `Basic ${token}`;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.cursorApiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 409) {
        throw new SanitizedError({
          message: "Cursor agent_id_conflict",
          category: "cursor",
          statusCode: 409,
          provider: "cursor",
        });
      }
      throw sanitizeVendorFailure(
        "cursor",
        res.status,
        text,
        `Cursor API request failed (${res.status})`,
      );
    }
    return (await res.json()) as T;
  }

  async createAgent(input: {
    prompt: string;
    name: string;
    repoUrl: string;
    startingRef: string;
    agentId: string;
    autoCreatePR?: boolean;
  }): Promise<CursorAgentRef> {
    try {
      const data = await this.request<{
        agent: {
          id: string;
          name?: string;
          status: string;
          url?: string;
          latestRunId?: string;
          workOnCurrentBranch?: boolean;
          autoCreatePR?: boolean;
        };
        run?: { id: string; status: string };
      }>("/v1/agents", {
        method: "POST",
        body: JSON.stringify({
          agentId: input.agentId,
          prompt: { text: input.prompt },
          name: input.name.slice(0, 100),
          repos: [{ url: input.repoUrl, startingRef: input.startingRef }],
          autoCreatePR: false,
          workOnCurrentBranch: false,
        }),
      });
      return {
        agentId: data.agent.id,
        runId: data.run?.id || data.agent.latestRunId,
        url: data.agent.url,
        status: data.agent.status,
        name: data.agent.name,
        workOnCurrentBranch: data.agent.workOnCurrentBranch ?? false,
        autoCreatePR: data.agent.autoCreatePR ?? false,
      };
    } catch (err) {
      if (err instanceof SanitizedError && err.statusCode === 409) {
        return this.getAgent(input.agentId);
      }
      throw err;
    }
  }

  async getAgent(agentId: string): Promise<CursorAgentRef> {
    const data = await this.request<{
      id: string;
      name?: string;
      status: string;
      url?: string;
      latestRunId?: string;
      workOnCurrentBranch?: boolean;
      autoCreatePR?: boolean;
    }>(`/v1/agents/${agentId}`);
    return {
      agentId: data.id,
      runId: data.latestRunId,
      url: data.url,
      status: data.status,
      name: data.name,
      workOnCurrentBranch: data.workOnCurrentBranch,
      autoCreatePR: data.autoCreatePR,
    };
  }

  async getRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string; branches?: CursorGitBranch[]; text?: string }> {
    const data = await this.request<{
      id: string;
      status: string;
      git?: { branches?: CursorGitBranch[] };
    }>(`/v1/agents/${agentId}/runs/${runId}`);
    return {
      id: data.id,
      status: data.status,
      branches: data.git?.branches,
    };
  }

  async cancelRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string }> {
    const data = await this.request<{ id: string; status: string }>(
      `/v1/agents/${agentId}/runs/${runId}/cancel`,
      { method: "POST" },
    );
    return { id: data.id, status: data.status };
  }

  async listAgents(limit = 20): Promise<CursorAgentRef[]> {
    const data = await this.request<{
      items?: Array<{
        id: string;
        name?: string;
        status: string;
        url?: string;
        latestRunId?: string;
      }>;
      agents?: Array<{
        id: string;
        name?: string;
        status: string;
        url?: string;
        latestRunId?: string;
      }>;
    }>(`/v1/agents?limit=${limit}`);
    const list = data.items || data.agents || [];
    return list.map((a) => ({
      agentId: a.id,
      runId: a.latestRunId,
      url: a.url,
      status: a.status,
      name: a.name,
    }));
  }
}

export function createCursorClient(config: ControlCenterConfig): CursorClient {
  if (config.safeMode || !config.cursorApiKey) {
    return new MockCursorClient();
  }
  return new HttpCursorClient(config);
}
