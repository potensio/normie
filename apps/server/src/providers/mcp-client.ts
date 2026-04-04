import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * MCP Server configuration
 */
interface MCPServerConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * MCP Tool definition
 */
interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * OpenAI-compatible tool format
 */
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * MCP Client for connecting to Model Context Protocol servers
 */
export class MCPClient {
  private clients: Map<string, Client> = new Map();
  private toolsCache: Map<string, MCPTool[]> = new Map();

  async connect(serverName: string, config: MCPServerConfig): Promise<Client> {
    const { url, headers = {} } = config;
    
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!;
    }

    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers
      }
    });

    const client = new Client(
      { name: 'kimi-provider', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    
    this.clients.set(serverName, client);
    console.log(`[MCP] Connected to ${serverName} at ${url}`);
    
    return client;
  }

  async listTools(serverName: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP client not connected: ${serverName}`);
    }

    if (this.toolsCache.has(serverName)) {
      return this.toolsCache.get(serverName)!;
    }

    const result = await client.listTools();
    this.toolsCache.set(serverName, result.tools);
    console.log(`[MCP] Listed ${result.tools.length} tools from ${serverName}`);
    
    return result.tools;
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP client not connected: ${serverName}`);
    }

    console.log(`[MCP] Calling tool ${toolName} on ${serverName} with args:`, args);
    
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });

    return result;
  }

  convertToolsToOpenAIFormat(mcpTools: MCPTool[], serverName: string): OpenAITool[] {
    return mcpTools.map(tool => {
      const inputSchema = tool.inputSchema || { type: 'object', properties: {} };
      
      return {
        type: 'function',
        function: {
          name: `mcp_${serverName}_${tool.name}`,
          description: tool.description || `Tool: ${tool.name}`,
          parameters: inputSchema
        }
      };
    });
  }

  static parseToolCall(toolCallName: string): { serverName: string; toolName: string } | null {
    const match = toolCallName.match(/^mcp_(.+?)_(.+)$/);
    if (match) {
      return {
        serverName: match[1],
        toolName: match[2]
      };
    }
    return null;
  }

  async connectAllServers(mcpServers: Record<string, MCPServerConfig>): Promise<string[]> {
    const connections: string[] = [];
    
    for (const [serverName, config] of Object.entries(mcpServers)) {
      try {
        await this.connect(serverName, config);
        connections.push(serverName);
      } catch (error) {
        console.error(`[MCP] Failed to connect to ${serverName}:`, (error as Error).message);
      }
    }
    
    return connections;
  }

  async getAllTools(mcpServers: Record<string, MCPServerConfig>, allowedTools: string[] | null = null): Promise<OpenAITool[]> {
    await this.connectAllServers(mcpServers);
    
    const allTools: OpenAITool[] = [];
    
    for (const serverName of Object.keys(mcpServers)) {
      try {
        const mcpTools = await this.listTools(serverName);
        const openaiTools = this.convertToolsToOpenAIFormat(mcpTools, serverName);
        allTools.push(...openaiTools);
      } catch (error) {
        console.error(`[MCP] Failed to get tools from ${serverName}:`, (error as Error).message);
      }
    }

    if (allowedTools && allowedTools.length > 0) {
      return allTools.filter(tool => 
        allowedTools.includes(tool.function.name) ||
        tool.function.name.startsWith('mcp_')
      );
    }

    return allTools;
  }

  async executeToolCall(toolCallName: string, toolCallArgs: Record<string, unknown>): Promise<{ success: boolean; content: string }> {
    const parsed = MCPClient.parseToolCall(toolCallName);
    
    if (!parsed) {
      throw new Error(`Invalid tool call name: ${toolCallName}`);
    }

    const { serverName, toolName } = parsed;
    
    try {
      const result = await this.callTool(serverName, toolName, toolCallArgs) as { content?: Array<{ type: string; text?: string; mimeType?: string }>; isError?: boolean };
      
      let content: string;
      if (result.content) {
        content = result.content.map(c => {
          if (c.type === 'text') return c.text || '';
          if (c.type === 'image') return `[Image: ${c.mimeType}]`;
          return JSON.stringify(c);
        }).join('\n');
      } else {
        content = JSON.stringify(result);
      }

      return {
        success: !result.isError,
        content
      };
    } catch (error) {
      return {
        success: false,
        content: `Error executing tool: ${(error as Error).message}`
      };
    }
  }

  async close(): Promise<void> {
    for (const [serverName, client] of this.clients.entries()) {
      try {
        await client.close();
        console.log(`[MCP] Closed connection to ${serverName}`);
      } catch (error) {
        console.error(`[MCP] Error closing ${serverName}:`, (error as Error).message);
      }
    }
    this.clients.clear();
    this.toolsCache.clear();
  }
}

export const mcpClient = new MCPClient();
