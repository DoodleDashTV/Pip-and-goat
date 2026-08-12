import type { ControlCenterConfig } from "./config";

export interface CursorAgentRef {
  agentId: string;
  runId?: string;
  url?: string;
  status: string;
  name?: string;
}

export interface CursorClient {
  createAgent(input: {
    prompt: string;
    name: string;
    repoUrl: string;
    startingRef: string;
    autoCreatePR?: boolean;
  }): Promise<CursorAgentRef>;
  getAgent(agentId: string): Promise<CursorAgentRef>;
  getRun(agentId: string, runId: string): Promise<{ id: string; status: string }>;
  cancelRun(agentId: string, runId: string): Promise<{ id: string; status: string }>;
  listAgents(limit?: number): Promise<CursorAgentRef[]>;
}

class MockCursorClient implements CursorClient {
  private agents = new Map<string, CursorAgentRef & { prompt: string }>();

  async createAgent(input: {
    prompt: string;
    name: string;
    repoUrl: string;
    startingRef: string;
  }): Promise<CursorAgentRef> {
    const agentId = `bc-mock-${cryptoRandom()}`;
    const runId = `run-mock-${cryptoRandom()}`;
    const ref: CursorAgentRef & { prompt: string } = {
      agentId,
      runId,
      url: `https://cursor.com/agents/${agentId}`,
      status: "SUCCEEDED",
      name: input.name,
      prompt: input.prompt,
    };
    this.agents.set(agentId, ref);
    return ref;
  }

  async getAgent(agentId: string): Promise<CursorAgentRef> {
    const found = this.agents.get(agentId);
    if (!found) throw new Error(`Mock agent not found: ${agentId}`);
    return found;
  }

  async getRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string }> {
    const found = this.agents.get(agentId);
    if (!found || found.runId !== runId) {
      throw new Error(`Mock run not found: ${agentId}/${runId}`);
    }
    return { id: runId, status: found.status === "ACTIVE" ? "RUNNING" : "FINISHED" };
  }

  async cancelRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string }> {
    const found = this.agents.get(agentId);
    if (!found) throw new Error(`Mock agent not found: ${agentId}`);
    found.status = "CANCELLED";
    return { id: runId, status: "CANCELLED" };
  }

  async listAgents(): Promise<CursorAgentRef[]> {
    return [...this.agents.values()];
  }
}

function cryptoRandom(): string {
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6);
}

export class HttpCursorClient implements CursorClient {
  constructor(private readonly config: ControlCenterConfig) {
    if (!config.cursorApiKey) {
      throw new Error("CURSOR_API_KEY is required for live Cursor client");
    }
  }

  private authHeader(): string {
    // Basic auth with API key as username (Cursor docs support -u KEY:)
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
      throw new Error(`Cursor API ${path} failed (${res.status}): ${text.slice(0, 400)}`);
    }
    return (await res.json()) as T;
  }

  async createAgent(input: {
    prompt: string;
    name: string;
    repoUrl: string;
    startingRef: string;
    autoCreatePR?: boolean;
  }): Promise<CursorAgentRef> {
    const data = await this.request<{
      agent: { id: string; name?: string; status: string; url?: string; latestRunId?: string };
      run?: { id: string; status: string };
    }>("/v1/agents", {
      method: "POST",
      body: JSON.stringify({
        prompt: { text: input.prompt },
        name: input.name.slice(0, 100),
        repos: [{ url: input.repoUrl, startingRef: input.startingRef }],
        autoCreatePR: input.autoCreatePR ?? false,
        workOnCurrentBranch: false,
      }),
    });
    return {
      agentId: data.agent.id,
      runId: data.run?.id || data.agent.latestRunId,
      url: data.agent.url,
      status: data.agent.status,
      name: data.agent.name,
    };
  }

  async getAgent(agentId: string): Promise<CursorAgentRef> {
    const data = await this.request<{
      id: string;
      name?: string;
      status: string;
      url?: string;
      latestRunId?: string;
    }>(`/v1/agents/${agentId}`);
    return {
      agentId: data.id,
      runId: data.latestRunId,
      url: data.url,
      status: data.status,
      name: data.name,
    };
  }

  async getRun(
    agentId: string,
    runId: string,
  ): Promise<{ id: string; status: string }> {
    const data = await this.request<{ id: string; status: string }>(
      `/v1/agents/${agentId}/runs/${runId}`,
    );
    return { id: data.id, status: data.status };
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
      agents?: Array<{
        id: string;
        name?: string;
        status: string;
        url?: string;
        latestRunId?: string;
      }>;
    }>(`/v1/agents?limit=${limit}`);
    return (data.agents || []).map((a) => ({
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

export { MockCursorClient };
