import React, { useState } from 'react';
import { importComponentLibraryFromJson, exportComponentLibraryToJson } from '../model/componentLibrary';
import { exportProjectToJson, importProjectFromJson } from '../model/serialization';
import { useProjectStore } from '../store/projectStore';

type BrowserFsWindow = Window & typeof globalThis & {
  showOpenFilePicker?: (options?: {
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
    types?: Array<{
      accept: Record<string, string[]>;
      description: string;
    }>;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    excludeAcceptAllOption?: boolean;
    suggestedName?: string;
    types?: Array<{
      accept: Record<string, string[]>;
      description: string;
    }>;
  }) => Promise<FileSystemFileHandle>;
};

const PROJECT_FILE_TYPE = {
  description: 'StripBoard Studio Project',
  accept: {
    'application/json': ['.json'],
  },
};

function getSuggestedProjectFileName(projectName: string): string {
  const safeName = projectName.trim().length > 0 ? projectName : 'stripboard-project';
  return `${safeName.replace(/\s+/g, '_').toLowerCase()}.json`;
}

async function writeTextToFileHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

function downloadTextFile(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export const Toolbar: React.FC = () => {
  const {
    project,
    setSelectedTool,
    setSelectedId,
    setProject,
    selectedTool,
    selectedId,
    deleteSelected,
    componentDefinitions,
    setComponentDefinitions,
    setAutoHighlightNets,
  } = useProjectStore();
  const [projectFileHandle, setProjectFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [projectFileProjectId, setProjectFileProjectId] = useState<string | null>(null);
  const boardPrepMode = project?.settings.boardPrepMode ?? false;
  const canDeleteSelected =
    !!selectedId &&
    (
      selectedId.type === 'wire' ||
      selectedId.type === 'component' ||
      selectedId.type === 'solder' ||
      selectedId.type === 'cut' ||
      selectedId.type === 'annotation'
    );

  const handleToggleView = () => {
    if (!project || boardPrepMode) return;

    setProject({
      ...project,
      settings: {
        ...project.settings,
        activeView: project.settings.activeView === 'top' ? 'bottom' : 'top',
      },
    });
  };

  const handleSaveJson = async (forceSaveAs = false) => {
    if (!project) return;

    const json = exportProjectToJson(project);
    const fsWindow = window as BrowserFsWindow;
    const canReuseHandle =
      !forceSaveAs &&
      projectFileHandle &&
      projectFileProjectId === project.id;

    try {
      if (canReuseHandle) {
        await writeTextToFileHandle(projectFileHandle, json);
        return;
      }

      if (fsWindow.showSaveFilePicker) {
        const nextHandle = await fsWindow.showSaveFilePicker({
          excludeAcceptAllOption: true,
          suggestedName: getSuggestedProjectFileName(project.name),
          types: [PROJECT_FILE_TYPE],
        });
        await writeTextToFileHandle(nextHandle, json);
        setProjectFileHandle(nextHandle);
        setProjectFileProjectId(project.id);
        return;
      }

      const requestedName = window.prompt(
        'Save project as',
        getSuggestedProjectFileName(project.name)
      );
      if (!requestedName) {
        return;
      }

      downloadTextFile(json, requestedName.endsWith('.json') ? requestedName : `${requestedName}.json`);
      setProjectFileHandle(null);
      setProjectFileProjectId(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Failed to save project:', error);
      alert('Failed to save project file');
    }
  };

  const handleToggleOverlay = () => {
    if (!project || boardPrepMode) return;

    setProject({
      ...project,
      settings: {
        ...project.settings,
        showOppositeSideOverlay: !project.settings.showOppositeSideOverlay,
      },
    });
  };

  const handleToggleAutoNetHighlight = () => {
    if (!project) return;
    setAutoHighlightNets(!project.settings.autoHighlightNets);
  };

  const handleToggleBoardPrepMode = () => {
    if (!project) return;

    const nextBoardPrepMode = !project.settings.boardPrepMode;
    setSelectedId(null);

    if (nextBoardPrepMode) {
      setSelectedTool('select');
    }

    setProject({
      ...project,
      settings: {
        ...project.settings,
        boardPrepMode: nextBoardPrepMode,
        showOppositeSideOverlay: nextBoardPrepMode
          ? false
          : project.settings.showOppositeSideOverlay,
      },
    });
  };

  const handleLoadJson = async () => {
    const fsWindow = window as BrowserFsWindow;

    const loadFile = (file: File, nextHandle: FileSystemFileHandle | null) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const loadedProject = importProjectFromJson(json);
          setProject(loadedProject);
          setProjectFileHandle(nextHandle);
          setProjectFileProjectId(nextHandle ? loadedProject.id : null);
        } catch (error) {
          console.error('Failed to load project:', error);
          alert('Failed to load project file');
        }
      };
      reader.readAsText(file);
    };

    try {
      if (fsWindow.showOpenFilePicker) {
        const [handle] = await fsWindow.showOpenFilePicker({
          excludeAcceptAllOption: true,
          multiple: false,
          types: [PROJECT_FILE_TYPE],
        });
        const file = await handle.getFile();
        loadFile(file, handle);
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Failed to open project picker:', error);
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      loadFile(file, null);
    };
    input.click();
  };

  const handleSaveLibrary = () => {
    const json = exportComponentLibraryToJson(componentDefinitions);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'component-library.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleLoadLibrary = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        try {
          const json = loadEvent.target?.result as string;
          const loadedDefinitions = importComponentLibraryFromJson(json);
          setComponentDefinitions(loadedDefinitions);
        } catch (error) {
          console.error('Failed to load component library:', error);
          alert('Failed to load component library file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportSvg = () => {
    const svgElement = document.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project?.name.replace(/\s+/g, '_').toLowerCase() || 'stripboard'}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const toolButtons = [
    { tool: 'select' as const, label: 'Select', color: '#4a90d9' },
    { tool: 'cut' as const, label: 'Cut', color: '#ff6b6b' },
    { tool: 'solder' as const, label: 'Solder', color: '#51cf66' },
    { tool: 'wire' as const, label: 'Wire', color: '#cc5de8' },
    { tool: 'component' as const, label: 'Component', color: '#ffd43b' },
    { tool: 'annotation' as const, label: 'Annotate', color: '#74c0fc' },
  ];

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 shadow-md"
      style={{ background: '#1a1a2e', borderBottom: '1px solid #2d2d44' }}
    >
      <h1 className="text-lg font-bold mr-4" style={{ color: '#e0e0e0' }}>
        StripBoard Studio
      </h1>
      <div className="flex gap-1">
        {toolButtons.map(({ tool, label, color }) => {
          const isDisabled = boardPrepMode && tool !== 'select' && tool !== 'cut';

          return (
            <button
              key={tool}
              onClick={() => {
                if (!isDisabled) {
                  setSelectedTool(tool);
                }
              }}
              disabled={isDisabled}
              className="px-3 py-1 rounded text-sm font-medium transition-colors"
              style={{
                background: selectedTool === tool ? color : '#2d2d44',
                color: isDisabled ? '#667085' : selectedTool === tool ? '#fff' : '#aaa',
                border: selectedTool === tool ? `1px solid ${color}` : '1px solid transparent',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.55 : 1,
              }}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={deleteSelected}
          disabled={!canDeleteSelected}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{
            background: canDeleteSelected ? '#9f2f2f' : '#2d2d44',
            color: canDeleteSelected ? '#fff5f5' : '#667085',
            border: canDeleteSelected ? '1px solid #e57373' : '1px solid #3d3d55',
            cursor: canDeleteSelected ? 'pointer' : 'not-allowed',
            opacity: canDeleteSelected ? 1 : 0.65,
          }}
        >
          Delete
        </button>
        <button
          onClick={handleToggleView}
          disabled={boardPrepMode}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{
            background: '#2d2d44',
            color: boardPrepMode ? '#667085' : '#aaa',
            border: '1px solid #3d3d55',
            cursor: boardPrepMode ? 'not-allowed' : 'pointer',
            opacity: boardPrepMode ? 0.55 : 1,
          }}
        >
          {boardPrepMode ? 'View Locked' : project?.settings.activeView === 'top' ? 'Bottom View' : 'Top View'}
        </button>
        <button
          onClick={handleToggleOverlay}
          disabled={boardPrepMode}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{
            background:
              !boardPrepMode && project?.settings.showOppositeSideOverlay ? '#3f6f63' : '#2d2d44',
            color:
              boardPrepMode
                ? '#667085'
                : project?.settings.showOppositeSideOverlay
                  ? '#e8fff8'
                  : '#aaa',
            border: !boardPrepMode && project?.settings.showOppositeSideOverlay
              ? '1px solid #63b49e'
              : '1px solid #3d3d55',
            cursor: boardPrepMode ? 'not-allowed' : 'pointer',
            opacity: boardPrepMode ? 0.55 : 1,
          }}
        >
          {boardPrepMode ? 'Overlay Off' : 'Overlay'}
        </button>
        <button
          onClick={handleToggleBoardPrepMode}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{
            background: project?.settings.boardPrepMode ? '#3f6f63' : '#2d2d44',
            color: project?.settings.boardPrepMode ? '#e8fff8' : '#aaa',
            border: project?.settings.boardPrepMode
              ? '1px solid #63b49e'
              : '1px solid #3d3d55',
          }}
        >
          Prep View
        </button>
        <button
          onClick={handleToggleAutoNetHighlight}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{
            background: project?.settings.autoHighlightNets ? '#5c4c9d' : '#2d2d44',
            color: project?.settings.autoHighlightNets ? '#f4f0ff' : '#aaa',
            border: project?.settings.autoHighlightNets
              ? '1px solid #8b7ed1'
              : '1px solid #3d3d55',
          }}
        >
          Net Follow
        </button>
      </div>
      <div className="flex gap-1 ml-auto">
        <button
          onClick={() => {
            void handleSaveJson(false);
          }}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ background: '#2d2d44', color: '#aaa', border: '1px solid #3d3d55' }}
        >
          Save JSON
        </button>
        <button
          onClick={() => {
            void handleSaveJson(true);
          }}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ background: '#2d2d44', color: '#aaa', border: '1px solid #3d3d55' }}
        >
          Save As
        </button>
        <button
          onClick={handleSaveLibrary}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ background: '#2d2d44', color: '#aaa', border: '1px solid #3d3d55' }}
        >
          Save Library
        </button>
        <button
          onClick={() => {
            void handleLoadJson();
          }}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ background: '#2d2d44', color: '#aaa', border: '1px solid #3d3d55' }}
        >
          Load JSON
        </button>
        <button
          onClick={handleLoadLibrary}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ background: '#2d2d44', color: '#aaa', border: '1px solid #3d3d55' }}
        >
          Load Library
        </button>
        <button
          onClick={handleExportSvg}
          className="px-3 py-1 rounded text-sm font-medium transition-colors"
          style={{ background: '#2d2d44', color: '#aaa', border: '1px solid #3d3d55' }}
        >
          Export SVG
        </button>
      </div>
    </div>
  );
};
