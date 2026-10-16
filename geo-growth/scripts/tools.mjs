import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
export function tool(name) {
  try {
    return require(name);
  } catch (error) {
    for (const directory of (process.env.GEO_TOOL_MODULES || '')
      .split(path.delimiter)
      .filter(Boolean)) {
      try {
        return require(path.join(directory, name));
      } catch {}
    }
    throw new Error(
      `Build tool ${name} is missing. Install devDependencies or set GEO_TOOL_MODULES.`,
      { cause: error },
    );
  }
}
