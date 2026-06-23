'use client';

import React from 'react';

export function SettingSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="settings-page-section">
      <div className="settings-page-section-heading">
        <h2 className="text-balance">{title}</h2>
        <p className="text-pretty">{description}</p>
      </div>
      <div className="settings-page-section-body">{children}</div>
    </section>
  );
}

export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-page-row">
      <div className="min-w-0">
        <h3>{title}</h3>
        <p className="text-pretty">{description}</p>
      </div>
      <div className="settings-page-control">{children}</div>
    </div>
  );
}
