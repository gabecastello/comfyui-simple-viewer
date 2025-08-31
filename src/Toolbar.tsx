import './Toolbar.css';

type Props = {
  onUploadWorkflow: (workflow: string) => void;
  onUploadNodes: (name: string, nodes: string) => void;
  onFetchWorkflow: (url: string) => void;
  onFetchNodes: (url: string) => void;
};

const COMMON_FILE_LOCATIONS = {
  'comfyanonymous/ComfyUI':
    'https://raw.githubusercontent.com/comfyanonymous/ComfyUI/refs/heads/master/nodes.py',
  'kijai/ComfyUI-WanVideoWrapper':
    'https://raw.githubusercontent.com/kijai/ComfyUI-WanVideoWrapper/refs/heads/main/nodes.py',
  'Kosinkadink/ComfyUI-VideoHelperSuite/videohelpersuite':
    'https://raw.githubusercontent.com/Kosinkadink/ComfyUI-VideoHelperSuite/refs/heads/main/videohelpersuite/nodes.py',
};

function Toolbar(props: Props) {
  const handleWorkflowFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        props.onUploadWorkflow(content);
      };
      reader.readAsText(file);
    }
  };

  const handleNodesFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        props.onUploadNodes(file.name, content);
      };
      reader.readAsText(file);
    }
  };

  const handleFetchWorkflow = () => {
    const url = prompt('Enter workflow URL:');
    if (url) {
      props.onFetchWorkflow(url);
    }
  };

  const handleFetchNodes = () => {
    const url = prompt('Enter nodes.py URL:');
    if (url) {
      props.onFetchNodes(url);
    }
  };

  const handleNodeFileSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const url =
      COMMON_FILE_LOCATIONS[
        e.target.value as keyof typeof COMMON_FILE_LOCATIONS
      ];
    if (url) {
      props.onFetchNodes(url);
    }
  };

  return (
    <div className="toolbar">
      <label htmlFor="workflow-upload">
        Upload workflow
        <input
          id="workflow-upload"
          type="file"
          style={{ display: 'none' }}
          onChange={handleWorkflowFile}
        />
      </label>
      <label htmlFor="nodes-upload">
        Upload nodes.py
        <input
          id="nodes-upload"
          type="file"
          style={{ display: 'none' }}
          onChange={handleNodesFile}
        />
      </label>
      <button onClick={handleFetchWorkflow}>Fetch workflow</button>
      <button onClick={handleFetchNodes}>Fetch nodes.py</button>
      <select onChange={handleNodeFileSelection} defaultValue="">
        <option value="" disabled>
          Fetch from common locations
        </option>
        {Object.keys(COMMON_FILE_LOCATIONS).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default Toolbar;
