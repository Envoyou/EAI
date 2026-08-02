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
  leftResizable?: boolean;
  rightResizable?: boolean;
  reversed?: boolean;
}

const DEFAULT_RIGHT_SIZE = 28;

export default function ThreeColumnLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  leftPanelOpen = true,
  rightPanelOpen = true,
  leftDefaultSize,
  rightDefaultSize = DEFAULT_RIGHT_SIZE,
  leftResizable = true,
  rightResizable = true,
  reversed = false,
}: ThreeColumnLayoutProps) {
  const groupRef = useRef<GroupImperativeHandle>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const group = groupRef.current;
    if (!group) return;

    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const standardLeftPercent = (272 / windowWidth) * 100;
    const computedLeftDefault = leftDefaultSize ?? standardLeftPercent;

    let left = leftPanelOpen ? computedLeftDefault : 0;
    let right = rightPanelOpen ? rightDefaultSize : 0;

    try {
      const saved = localStorage.getItem('eai-workspace-layout');
      if (saved) {
        const layout = JSON.parse(saved);
        if (leftPanelOpen && typeof layout['left-panel'] === 'number' && layout['left-panel'] > 5) {
          // Clamp saved layout so old oversized values (e.g. >22%) reset to exact 272px standard width
          if (layout['left-panel'] > 22 || layout['left-panel'] < 12) {
            left = standardLeftPercent;
          } else {
            left = layout['left-panel'];
          }
        }
        if (rightPanelOpen && typeof layout['right-panel'] === 'number' && layout['right-panel'] > 5) {
          right = layout['right-panel'];
        }
      } else if (leftPanelOpen) {
        left = standardLeftPercent;
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

  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const standardLeftPercent = (272 / windowWidth) * 100;
  const activeLeftDefault = leftDefaultSize ?? standardLeftPercent;

  // When reversed=true: document panel swaps to right, AI panel swaps to left
  const firstPanelContent  = reversed ? rightPanel : leftPanel;
  const firstPanelOpen     = reversed ? rightPanelOpen : leftPanelOpen;
  const firstDefaultSize   = reversed ? rightDefaultSize : activeLeftDefault;
  const isFirstResizable   = reversed ? rightResizable : leftResizable;
  const firstMaxSize       = reversed ? '42%' : '24%';
  const firstPanelId       = reversed ? 'right-panel' : 'left-panel';
  const firstPanelClass    = reversed ? 'workspace-right-panel' : 'workspace-left-panel';

  const lastPanelContent   = reversed ? leftPanel : rightPanel;
  const lastPanelOpen      = reversed ? leftPanelOpen : rightPanelOpen;
  const lastDefaultSize    = reversed ? activeLeftDefault : rightDefaultSize;
  const isLastResizable    = reversed ? leftResizable : rightResizable;
  const lastMaxSize        = reversed ? '24%' : '42%';
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
            'left-panel': leftOpen ? layout['left-panel'] : (existing['left-panel'] ?? activeLeftDefault),
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
        className={`${firstPanelClass} ${firstPanelOpen ? 'is-open' : ''} min-w-0`}
        data-open={firstPanelOpen}
        defaultSize={firstPanelOpen ? `${firstDefaultSize}%` : '0%'}
        minSize={isFirstResizable ? (firstPanelOpen ? '14%' : '0%') : (firstPanelOpen ? `${firstDefaultSize}%` : '0%')}
        maxSize={isFirstResizable ? firstMaxSize : (firstPanelOpen ? `${firstDefaultSize}%` : '0%')}
        collapsible
        collapsedSize="0%"
      >
        {firstPanelContent}
      </Panel>

      {isFirstResizable && (
        <Separator id="left-separator" className="panel-resize-handle hidden md:flex" />
      )}

      <Panel
        key="center-panel"
        id="center-panel"
        className="workspace-center-panel min-w-0"
        defaultSize={`${100 - (leftPanelOpen ? activeLeftDefault : 0) - (rightPanelOpen ? rightDefaultSize : 0)}%`}
        minSize="30%"
      >
        {centerPanel}
      </Panel>

      {isLastResizable && (
        <Separator id="right-separator" className="panel-resize-handle hidden md:flex" />
      )}

      <Panel
        key={`${lastPanelId}-${lastPanelOpen}`}
        id={lastPanelId}
        className={`${lastPanelClass} ${lastPanelOpen ? 'is-open' : ''} min-w-0`}
        data-open={lastPanelOpen}
        defaultSize={lastPanelOpen ? `${lastDefaultSize}%` : '0%'}
        minSize={isLastResizable ? (lastPanelOpen ? '15%' : '0%') : (lastPanelOpen ? `${lastDefaultSize}%` : '0%')}
        maxSize={isLastResizable ? lastMaxSize : (lastPanelOpen ? `${lastDefaultSize}%` : '0%')}
        collapsible
        collapsedSize="0%"
      >
        {lastPanelContent}
      </Panel>
    </Group>
  );
}