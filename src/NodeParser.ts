import * as ast from 'py-ast';

type Dict = ast.ExprNode & { nodeType: 'Dict' };
type Tuple = ast.ExprNode & { nodeType: 'Tuple' };
export interface NodeInputs {
  all: {
    required: NodeInput[];
    optional?: NodeInput[];
  };
  links: NodeInput[];
  widgets: NodeInput[];
}

export interface NodeInput {
  type: string;
  name: string;
  options?: Record<string, unknown>;
}

export interface NodeInfo {
  name: string;
  inputs: NodeInputs;
  output: string[];
  category: string;
}

/*
const logFile = (
  code: string,
  lineNumberRange?: [number, number],
  withLineNumbers = true
) => {
  const lines = code.split('\n');
  const startLine = lineNumberRange ? Math.max(0, lineNumberRange[0] - 2) : 0;
  const endLine = lineNumberRange
    ? Math.min(lines.length - 1, lineNumberRange[1] + 2)
    : lines.length;
  let result = '';
  for (let i = startLine; i < endLine; i++) {
    if (withLineNumbers) {
      result += `${i + 1}: ${lines[i]}\n`;
    } else {
      result += `${lines[i]}\n`;
    }
  }

  console.log(result);
};
*/

/**
 * replaces multiline string blocks with extensions. uses regex to find the instances and then replace them (instead of splitting by line) e.g.
 *
 * BEFORE:
 * "enable_vae_tiling": ("BOOLEAN", {"default": False, "tooltip": (
 *                       "Drastically reduces memory use but will introduce seams at tile stride boundaries. "
 *                       "Which is to say if you use a stride width of 160, the seams are barely noticeable with a tile width of 320."
 *                       )}),
 * AFTER:
 * "enable_vae_tiling": ("BOOLEAN", {"default": False, "tooltip": ("Drastically reduces memory use but will introduce seams at tile stride boundaries. Which is to say if you use a stride width of 160, the seams are barely noticeable with a tile width of 320.")})
 */
const replaceMultilineStrings = (code: string): string => {
  // This regex finds parenthesized groups that ONLY contain adjacent string literals.
  const multilineStringRegex = /\((\s*"[^"]*?"(?:\s*"[^"]*?")*\s*)\)/g;
  return code.replace(multilineStringRegex, (_, content) => {
    // content is a string like ` "foo" "bar" `
    // Extract the string values from the literals.
    const stringValues = [];
    const stringLiteralRegex = /"([^"]*?)"/g;
    let stringMatch;
    while ((stringMatch = stringLiteralRegex.exec(content)) !== null) {
      stringValues.push(stringMatch[1]);
    }
    // Join the values and wrap in a single set of quotes.
    return `("${stringValues.join('')}")`;
  });
};

const trivializeFunctionBodies = (code: string): string => {
  const lines = code.split('\n');
  const newLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i++];
    const match = /^(\s*)def\s+(?!INPUT_TYPES)/.exec(line);

    if (match) {
      const indentation = match[1];
      newLines.push(`${indentation}def function():`);
      newLines.push(`${indentation}    return None`);

      // Keep going until the indentation size returns to equal or less than declaration
      while (i < lines.length) {
        const nextLine = lines[i++];

        if (
          `${nextLine}`.trim() === '' ||
          nextLine.startsWith('#') ||
          nextLine.trim().startsWith('):')
        ) {
          continue;
        }

        const nextMatch = /^(\s*)/.exec(nextLine);
        if (nextMatch) {
          const nextIndentation = nextMatch[1];
          if (nextIndentation.length <= indentation.length) {
            // We exited the method.
            i--;
            break;
          }
        } else {
          console.warn("Didn't find indentation");
        }
      }
    } else {
      newLines.push(line);
    }
  }
  return newLines.join('\n');
};

export class NodeParser {
  private code: string;

  constructor(code: string) {
    this.code = code;
  }

  public parse(): Record<string, NodeInfo> {
    let processedCode = trivializeFunctionBodies(this.code);
    processedCode = replaceMultilineStrings(processedCode);

    const result: Record<string, NodeInfo> = {};
    const tree = ast.parse(processedCode, { feature_version: 3 });

    for (const node of tree.body) {
      if (node.nodeType === 'ClassDef') {
        const nodeInfo = this.parseClass(node);
        if (nodeInfo) {
          result[node.name] = nodeInfo;
        }
      }
    }

    // log information about what we just parsed
    const nodes = Object.keys(result);

    console.log('Added', nodes.length, 'nodes');
    console.log(nodes);

    return result;
  }

  private parseClass(classNode: ast.ClassDef): NodeInfo | null {
    let inputTypes:
      | { required: NodeInput[]; optional?: NodeInput[] }
      | undefined = undefined;
    let returnTypes: string[] = [];
    let category = '';

    for (const item of classNode.body) {
      if (item.nodeType === 'FunctionDef' && item.name === 'INPUT_TYPES') {
        const returnStmt = item.body.find((b) => b.nodeType === 'Return');
        if (returnStmt?.value) {
          inputTypes = this.parseInputTypes(
            returnStmt.value as unknown as Dict
          );
        }
      } else if (
        item.nodeType === 'Assign' &&
        item.targets.length === 1 &&
        item.targets[0].nodeType === 'Name'
      ) {
        const targetName = (item.targets[0] as ast.Name).id;
        if (targetName === 'RETURN_TYPES') {
          const value = item.value as Tuple;
          returnTypes = value.elts.map(
            (e) => (e as ast.Constant).value as string
          );
        } else if (targetName === 'CATEGORY') {
          category = (item.value as ast.Constant).value as string;
        }
      }
    }

    if (inputTypes) {
      return {
        name: classNode.name,
        inputs: this.sortInputs(inputTypes),
        output: returnTypes,
        category: category,
      };
    }

    return null;
  }

  // sorts inputs by pulling up custom data types to the top of the list, otherwise keeps everything else in order
  private sortInputs(inputs: {
    required: NodeInput[];
    optional?: NodeInput[];
  }): NodeInputs {
    const allInputs = [...inputs.required, ...(inputs.optional || [])];

    const knownDataTypes = ['FLOAT', 'INT', 'STRING', 'BOOLEAN'];
    const links: NodeInput[] = [];
    const widgets: NodeInput[] = [];

    for (const input of allInputs) {
      if (knownDataTypes.includes(input.type)) {
        widgets.push(input);
      } else {
        links.push(input);
      }
    }

    return {
      all: inputs,
      links,
      widgets,
    };
  }

  private parseInputTypes(dict: Dict): {
    required: NodeInput[];
    optional?: NodeInput[];
  } {
    const result: { required: NodeInput[]; optional?: NodeInput[] } = {
      required: [],
    };

    for (let i = 0; i < dict.keys.length; i++) {
      const key = (dict.keys[i] as ast.Constant).value;
      const value = dict.values[i];

      if (key === 'required') {
        result.required = this.parseInputArray(value as Dict);
      } else if (key === 'optional') {
        result.optional = this.parseInputArray(value as Dict);
      }
    }
    return result;
  }

  private parseInputArray(dict: Dict): NodeInput[] {
    const result: NodeInput[] = [];

    for (let i = 0; i < dict.keys.length; i++) {
      const name = (dict.keys[i] as ast.Constant).value as string;
      const tuple = dict.values[i] as Tuple;
      const type = (tuple.elts[0] as ast.Constant).value as string;
      const options: Record<string, unknown> = {};
      if (tuple.elts.length > 1) {
        const optionsDict = tuple.elts[1] as Dict;
        for (let j = 0; j < optionsDict.keys.length; j++) {
          const key = (optionsDict.keys[j] as ast.Constant).value as string;
          const value = (optionsDict.values[j] as ast.Constant).value;
          options[key] = value;
        }
      }
      result.push({ name, type, options });
    }

    return result;
  }
}
