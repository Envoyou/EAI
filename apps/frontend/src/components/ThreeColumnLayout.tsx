'use client';

import { useEffect, useRef } from 'react';
import { Group, Panel, Separator, type GroupImperativeHandle } from 'react-resizable-panels';
import type { ReactNode } from 'react';

export interface ThreeColumnLayoutProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
  leftDefaultSize?: number;
  rightDefaultSize?: number;
  reversed?: boolean;
}

const DEFAULT_LEFT_SIZE = 20;
const DEFAULT_RIGHT_SIZE = 28;

export default function ThreeColumnLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  leftPanelOpen = true,
  rightPanelOpen = true,
  leftDefaultSize = DEFAULT_LEFT_SIZE,
  rightDefaultSize = DEFAULT_RIGHT_SIZE,
  reversed = false,
}: ThreeColumnLayoutProps) {
  const groupRef = useRef<GroupImperativeHandle>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const group = groupRef.current;
    if (!group) return;

    let left = leftPanelOpen ? leftDefaultSize : 0;
    let right = rightPanelOpen ? rightDefaultSize : 0;

    try {
      const saved = localStorage.getItem('eai-workspace-layout');
      if (saved) {
        const layout = JSON.parse(saved);
        if (leftPanelOpen && typeof layout['left-panel'] === 'number' && layout['left-panel'] > 5) {
          left = layout['left-panel'];
        }
        if (rightPanelOpen && typeof layout['right-panel'] === 'number' && layout['right-panel'] > 5) {
          right = layout['right-panel'];
        }
      }
    } catch (e) {
      console.error('Failed to load layout from localStorage', e);
    }

    const center = Math.max(30, 100 - left - right);

    group.setLayout({
      'left-panel': left,
      'center-panel': center,
      'right-panel': right,
    });
  }, [leftPanelOpen, rightPanelOpen, leftDefaultSize, rightDefaultSize, reversed]);

  // When reversed=true: document panel swaps to right, AI panel swaps to left
  const firstPanelContent  = reversed ? rightPanel : leftPanel;
  const firstPanelOpen     = reversed ? rightPanelOpen : leftPanelOpen;
  const firstDefaultSize   = reversed ? rightDefaultSize : leftDefaultSize;
  const firstMaxSize       = reversed ? '42%' : '35%';
  const firstPanelId       = reversed ? 'right-panel' : 'left-panel';
  const firstPanelClass    = reversed ? 'workspace-right-panel' : 'workspace-left-panel';

  const lastPanelContent   = reversed ? leftPanel : rightPanel;
  const lastPanelOpen      = reversed ? leftPanelOpen : rightPanelOpen;
  const lastDefaultSize    = reversed ? leftDefaultSize : rightDefaultSize;
  const lastMaxSize        = reversed ? '35%' : '42%';
  const lastPanelId        = reversed ? 'left-panel' : 'right-panel';
  const lastPanelClass     = reversed ? 'workspace-left-panel' : 'workspace-right-panel';

  return (
    <Group
      groupRef={groupRef}
      orientation="horizontal"
      className="h-full w-full"
      onLayoutChanged={(layout) => {
        const leftOpen = layout['left-panel'] > 5;
        const rightOpen = layout['right-panel'] > 5;
        
        try {
          const savedStr = localStorage.getItem('eai-workspace-layout');
          const existing = savedStr ? JSON.parse(savedStr) : {};
          
          const newLayout = {
            'left-panel': leftOpen ? layout['left-panel'] : (existing['left-panel'] ?? DEFAULT_LEFT_SIZE),
            'center-panel': layout['center-panel'],
            'right-panel': rightOpen ? layout['right-panel'] : (existing['right-panel'] ?? DEFAULT_RIGHT_SIZE),
          };
          localStorage.setItem('eai-workspace-layout', JSON.stringify(newLayout));
        } catch {
          localStorage.setItem('eai-workspace-layout', JSON.stringify(layout));
        }
      }}
    >
      <Panel
        key={`${firstPanelId}-${firstPanelOpen}`}
        id={firstPanelId}
        className={`${firstPanelClass} ${firstPanelOpen ? 'is-open' : ''}`}
        data-open={firstPanelOpen}
        defaultSize={firstPanelOpen ? `${firstDefaultSize}%` : '0%'}
        minSize={firstPanelOpen ? '15%' : '0%'}
        maxSize={firstMaxSize}
        collapsible
        collapsedSize="0%"
      >
        {firstPanelContent}
      </Panel>

      <Separator id="left-separator" className="panel-resize-handle hidden md:flex" />

      <Panel
        key="center-panel"
        id="center-panel"
        className="workspace-center-panel"
        defaultSize={`${100 - leftDefaultSize - rightDefaultSize}%`}
        minSize="30%"
      >
        {centerPanel}
      </Panel>

      <Separator id="right-separator" className="panel-resize-handle hidden md:flex" />

      <Panel
        key={`${lastPanelId}-${lastPanelOpen}`}
        id={lastPanelId}
        className={`${lastPanelClass} ${lastPanelOpen ? 'is-open' : ''}`}
        data-open={lastPanelOpen}
        defaultSize={lastPanelOpen ? `${lastDefaultSize}%` : '0%'}
        minSize={lastPanelOpen ? '15%' : '0%'}
        maxSize={lastMaxSize}
        collapsible
        collapsedSize="0%"
      >
        {lastPanelContent}
      </Panel>
    </Group>
  );
}