import React, { useEffect, useMemo, useRef } from 'react';
import {
  LGraph,
  LGraphCanvas,
  LGraphNode,
  LiteGraph,
  type widgetTypes,
} from 'litegraph.js';
import type { WorkflowSchema } from './workflow_schema';
import './WorkflowViewer.css';
import { NodeParser, type NodeInfo } from './NodeParser';

interface WorkflowViewerProps {
  workflow: WorkflowSchema;
  pythonFiles: Record<string, string>;
}

const WIDGET_TYPE_MAP: Record<string, widgetTypes> = {
  FLOAT: 'number',
  INT: 'number',
  STRING: 'text',
  BOOLEAN: 'toggle',
};

const getWidgetTypeFromValue = (value: unknown | undefined): widgetTypes => {
  if (typeof value === 'number') {
    return 'number';
  } else if (typeof value === 'boolean') {
    return 'toggle';
  }
  return 'text';
};

const WorkflowViewer: React.FC<WorkflowViewerProps> = ({
  workflow,
  pythonFiles,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graphRef = useRef<LGraph | null>(null);
  const canvasInstanceRef = useRef<LGraphCanvas | null>(null);

  const parsedMappingsFromFiles = useMemo(() => {
    const mappings = new Map<string, NodeInfo>();
    for (const [fileName, fileContent] of Object.entries(pythonFiles)) {
      console.log('parsing', fileName);
      const parser = new NodeParser(fileContent);
      try {
        const nodes = parser.parse();
        for (const nodeName in nodes) {
          mappings.set(nodeName, nodes[nodeName]);
        }
      } catch (e) {
        console.error('Error parsing python file ' + fileName, e);
        alert(`Couldn't parse ${fileName}. Check console logs.`);
      }
    }
    return mappings;
  }, [pythonFiles]);

  useEffect(() => {
    if (!canvasRef.current || !workflow) {
      return;
    }

    const initGraph = async () => {
      try {
        const processedWorkflow = JSON.parse(
          JSON.stringify(workflow)
        ) as WorkflowSchema;

        processedWorkflow.nodes.forEach((node) => {
          if (LiteGraph.registered_node_types[node.type]) {
            LiteGraph.unregisterNodeType(node.type);
          }
          const customInfo = parsedMappingsFromFiles.get(node.type);

          class CustomMissingNode extends LGraphNode {
            static title = node.type + (customInfo ? '' : '(?)');
            constructor() {
              super(node.type);

              if (node.inputs) {
                node.inputs.forEach((input) => {
                  this.addInput(input.name, input.type as string);
                });
              }

              if (Array.isArray(node.widgets_values)) {
                node.widgets_values?.forEach((value, index) => {
                  const inputInfo = customInfo?.inputs?.widgets[index];

                  if (inputInfo) {
                    // we may have already aadded it as a link (if there was a link)
                    if (
                      node.inputs?.find(
                        (input) => input.name === inputInfo.name
                      )
                    ) {
                      return;
                    }
                  }

                  const type: widgetTypes =
                    WIDGET_TYPE_MAP[inputInfo?.type ?? ''] ??
                    getWidgetTypeFromValue(value);
                  const name = inputInfo?.name ?? `Widget ${index}`;
                  this.addWidget(type, name, value, () => {});
                });
              } else if (node.widgets_values) {
                Object.keys(node.widgets_values)?.forEach((widgetName) => {
                  const value = (
                    node.widgets_values as Record<string, unknown>
                  )[widgetName];
                  this.addWidget(
                    getWidgetTypeFromValue(value),
                    widgetName,
                    value
                  );
                });
              }
              // Process outputs
              if (node.outputs) {
                node.outputs.forEach((output) => {
                  this.addOutput(output.name, output.type as string);
                });
              } else if (customInfo?.output) {
                // Fallback to python schema for outputs
                customInfo.output.forEach((outputType: string) => {
                  this.addOutput(outputType, outputType);
                });
              }
            }
          }

          LiteGraph.registerNodeType(node.type, CustomMissingNode);
        });

        if (!graphRef.current && canvasRef.current) {
          const graph = new LGraph();
          graphRef.current = graph;

          const canvasEl = canvasRef.current;
          const dpr = window.devicePixelRatio || 1;
          const rect = canvasEl.getBoundingClientRect();
          canvasEl.width = rect.width * dpr;
          canvasEl.height = rect.height * dpr;

          const canvas = new LGraphCanvas(canvasEl, graph);
          canvasInstanceRef.current = canvas;

          graph.configure(processedWorkflow);
          graph.start();

          setTimeout(() => {
            if (canvasInstanceRef.current) {
              canvasInstanceRef.current.draw(true, true);
              const canvas = canvasInstanceRef.current;
              const bounds = canvas.visible_area;
              canvas.setZoom(0.5, [bounds[0] / 2, bounds[1] / 2]);
            }
          }, 100);
        } else {
          graphRef.current!.configure(processedWorkflow);
        }
      } catch (error) {
        console.error('Error initializing graph:', error);
      }
    };

    initGraph();

    const handleResize = () => {
      if (canvasInstanceRef.current && canvasRef.current) {
        const canvasEl = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvasEl.getBoundingClientRect();
        canvasEl.width = rect.width * dpr;
        canvasEl.height = rect.height * dpr;
        canvasInstanceRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [parsedMappingsFromFiles, workflow]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

export default WorkflowViewer;
