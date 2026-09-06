import type { ResourceDefinition } from '../model/resource-definition.js';

/** One entry from a real `resources/list` response, narrowed to the fields
 * rules read. Optional fields carry `| undefined` because this project runs
 * with `exactOptionalPropertyTypes` and the SDK declares them that way. */
export interface RawResource {
  readonly uri: string;
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
}

export function toResourceDefinition(
  serverName: string,
  resource: RawResource,
): ResourceDefinition {
  return {
    serverName,
    // A resource's name is optional in the protocol; the URI is not. Falling
    // back to it keeps every finding able to say WHICH resource it means.
    name: resource.name ?? resource.uri,
    uri: resource.uri,
    description: resource.description ?? '',
    ...(resource.mimeType !== undefined ? { mimeType: resource.mimeType } : {}),
  };
}
