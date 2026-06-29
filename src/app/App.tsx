import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { BoardSvg } from '../render/BoardSvg';
import { Toolbar } from '../components/Toolbar';
import { LeftPanel } from '../components/LeftPanel';
import { PropertiesPanel } from '../components/PropertiesPanel';

function App() {
  const { project, resetProject, selectedId, deleteSelected, setSelectedId } = useProjectStore();

  useEffect(() => {
    resetProject();
  }, [resetProject]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (
          selectedId &&
          (
            selectedId.type === 'wire' ||
            selectedId.type === 'component' ||
            selectedId.type === 'solder' ||
            selectedId.type === 'cut' ||
            selectedId.type === 'annotation'
          )
        ) {
          e.preventDefault();
          deleteSelected();
        }
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, deleteSelected, setSelectedId]);

  if (!project) {
    return <div style={{ background: '#1a1a2e', color: '#888', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  const svgWidth = project.settings.canvasWidthPx ?? 1000;
  const svgHeight = project.settings.canvasHeightPx ?? 700;
  const maxRenderScale = 10;
  const viewLabel = project.settings.boardPrepMode ? 'board prep' : project.settings.activeView;

  return (
    <div className="flex flex-col h-screen" style={{ background: '#1a1a2e', color: '#e0e0e0' }}>
      <Toolbar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <LeftPanel />
        <div className="flex-1 overflow-auto min-h-0" style={{ background: '#12122a' }}>
          <div className="min-w-full min-h-full flex items-center justify-center p-4">
            <div className="rounded-lg overflow-hidden shadow-2xl" style={{ border: '1px solid #2d2d44' }}>
              <BoardSvg width={svgWidth} height={svgHeight} scale={maxRenderScale} />
            </div>
          </div>
        </div>
        <PropertiesPanel />
      </div>
      <div className="flex items-center gap-3 px-4 py-2" style={{ background: '#0f0f23', borderTop: '1px solid #2d2d44', color: '#888', fontSize: '12px' }}>
        <span style={{ color: '#e0e0e0' }}>StripBoard Studio MVP</span>
        <span>|</span>
        <span>{project.board.strips.length} strips</span>
        <span>|</span>
        <span>{project.board.holes.length} holes</span>
        <span>|</span>
        <span>View: {viewLabel}</span>
        <span>|</span>
        <span>Canvas: {svgWidth} x {svgHeight}</span>
        <span>|</span>
        <span>Pitch: {project.board.pitchMm}mm</span>
      </div>
    </div>
  );
}

export default App;

