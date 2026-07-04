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
  }, [leftPanelOpen, rightPanelOpen, leftDefaultSize, rightDefaultSize]);

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
        id="left-panel"
        className="workspace-left-panel"
        data-open={leftPanelOpen}
        defaultSize={leftPanelOpen ? `${leftDefaultSize}%` : '0%'}
        minSize={leftPanelOpen ? '15%' : '0%'}
        maxSize="35%"
        collapsible
        collapsedSize="0%"
      >
        {leftPanel}
      </Panel>

      <Separator id="left-separator" className="panel-resize-handle hidden md:flex" />

      <Panel
        id="center-panel"
        className="workspace-center-panel"
        defaultSize={`${100 - leftDefaultSize - rightDefaultSize}%`}
        minSize="30%"
      >
        {centerPanel}
      </Panel>

      <Separator id="right-separator" className="panel-resize-handle hidden md:flex" />

      <Panel
        id="right-panel"
        className="workspace-right-panel"
        data-open={rightPanelOpen}
        defaultSize={rightPanelOpen ? `${rightDefaultSize}%` : '0%'}
        minSize={rightPanelOpen ? '15%' : '0%'}
        maxSize="42%"
        collapsible
        collapsedSize="0%"
      >
        {rightPanel}
      </Panel>
    </Group>
  );
}