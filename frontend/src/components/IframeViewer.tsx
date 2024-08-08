// src/components/IframeViewer.tsx
import React from 'react';

interface IframeViewerProps {
  url: string;
}

const IframeViewer: React.FC<IframeViewerProps> = ({ url }) => {
  const urlWithoutQuery = url.split('?')[0];
  const isDocx = urlWithoutQuery.endsWith('.doc') || urlWithoutQuery.endsWith('.docx');

  const viewerUrl = isDocx
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
    : url;

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <iframe
        src={viewerUrl}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="Document Viewer"
      />
    </div>
  );
};

export default IframeViewer;
