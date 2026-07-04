'use client';

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
  leftMinSize?: number;
  rightMinSize?: number;
  leftMaxSize?: number;
  rightMaxSize?: number;
  groupRef?: React.Ref<GroupImperativeHandle>;
  onLayoutChange?: (layout: { [panelId: string]: number }) => void;
}

const DEFAULT_LEFT_SIZE = 20;
const DEFAULT_RIGHT_SIZE = 28;
const PANEL_MIN = 15;
const PANEL_MAX_LEFT = 35;
const PANEL_MAX_RIGHT = 42;

export default function ThreeColumnLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  leftPanelOpen = true,
  rightPanelOpen = true,
  leftDefaultSize = DEFAULT_LEFT_SIZE,
  rightDefaultSize = DEFAULT_RIGHT_SIZE,
  leftMinSize = PANEL_MIN,
  rightMinSize = PANEL_MIN,
  leftMaxSize = PANEL_MAX_LEFT,
  rightMaxSize = PANEL_MAX_RIGHT,
  groupRef,
  onLayoutChange,
}: ThreeColumnLayoutProps) {
  return (
    <Group
      groupRef={groupRef}
      orientation="horizontal"
      onLayoutChange={onLayoutChange}
      className="h-full w-full"
    >
      <Panel
        id="left-panel"
        defaultSize={leftPanelOpen ? leftDefaultSize : 0}
        minSize={leftPanelOpen ? leftMinSize : 0}
        maxSize={leftPanelOpen ? leftMaxSize : 0}
        collapsible
      >
        {leftPanel}
      </Panel>

      <Separator id="left-separator" className="panel-resize-handle" />

      <Panel id="center-panel" defaultSize={100 - leftDefaultSize - rightDefaultSize} minSize={30}>
        {centerPanel}
      </Panel>

      <Separator id="right-separator" className="panel-resize-handle" />

      <Panel
        id="right-panel"
        defaultSize={rightPanelOpen ? rightDefaultSize : 0}
        minSize={rightPanelOpen ? rightMinSize : 0}
        maxSize={rightPanelOpen ? rightMaxSize : 0}
        collapsible
      >
        {rightPanel}
      </Panel>
    </Group>
  );
}