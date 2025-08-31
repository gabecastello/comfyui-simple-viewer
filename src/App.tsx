import WorkflowViewer from './WorkflowViewer';
import './App.css';
import type { WorkflowSchema } from './workflow_schema';
import { useEffect, useState } from 'react';
import Toolbar from './Toolbar';

function App() {
  const [workflow, setWorkflow] = useState<WorkflowSchema>();
  const [pythonFiles, setPythonFiles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      fetch('/wanvideo_Fun_2_2_control_example_03.json')
        .then((response) => response.json())
        .then(setWorkflow);

      fetch('/samplenodes.py')
        .then((response) => response.text())
        .then((content) => setPythonFiles({ 'samplenodes.py': content }));
    }
  }, []);

  const processPastedText = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (data && Array.isArray(data.nodes) && Array.isArray(data.links)) {
        setWorkflow(data);
      }
      return;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      if (text.includes('import') || text.includes('def')) {
        // set the key to "pasted [formatted time]"
        const key = `pasted ${new Date().toLocaleTimeString()}`;
        setPythonFiles((prev) => ({ ...prev, [key]: text }));
      }
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (event.clipboardData) {
        if (event.clipboardData.files && event.clipboardData.files.length > 0) {
          const file = event.clipboardData.files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            processPastedText(content);
          };
          reader.readAsText(file);
        } else {
          const text = event.clipboardData.getData('text');
          if (text) {
            processPastedText(text);
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  const handleUploadWorkflow = (workflowContent: string) => {
    try {
      const workflowJSON = JSON.parse(workflowContent);
      setWorkflow(workflowJSON);
    } catch (e) {
      console.error('Error parsing workflow JSON', e);
      alert('Invalid workflow file. Please upload a valid JSON file.');
    }
  };

  const handleUploadNodes = (filename: string, nodesContent: string) => {
    setPythonFiles((prev) => ({ ...prev, [filename]: nodesContent }));
  };

  const handleFetchWorkflow = (url: string) => {
    fetch(url)
      .then((response) => response.json())
      .then(setWorkflow)
      .catch((e) => {
        console.error('Error fetching workflow', e);
        alert('Failed to fetch workflow from the provided URL.');
      });
  };

  const handleFetchNodes = (url: string) => {
    fetch(url)
      .then((response) => response.text())
      .then((content) =>
        setPythonFiles((prev) => ({ ...prev, [url]: content }))
      )
      .catch((e) => {
        console.error('Error fetching nodes', e);
        alert('Failed to fetch nodes from the provided URL.');
      });
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Toolbar
        onUploadWorkflow={handleUploadWorkflow}
        onUploadNodes={handleUploadNodes}
        onFetchWorkflow={handleFetchWorkflow}
        onFetchNodes={handleFetchNodes}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {workflow ? (
          <WorkflowViewer workflow={workflow} pythonFiles={pythonFiles} />
        ) : null}
      </div>
    </div>
  );
}

export default App;
