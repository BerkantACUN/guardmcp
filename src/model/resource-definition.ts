/**
 * A resource as advertised by an MCP server's `resources/list`.
 *
 * Resources differ from tools and prompts in one way that matters: they carry
 * a URI. A tool is described; a resource POINTS somewhere. So the URI is part
 * of the attack surface on its own — a server offering
 * `file:///home/u/.ssh/id_rsa` is offering to read a private key into the
 * model's context, and its `name` never has to admit that.
 */
export interface ResourceDefinition {
  readonly serverName: string;
  readonly name: string;
  readonly uri: string;
  readonly description: string;
  readonly mimeType?: string;
}
