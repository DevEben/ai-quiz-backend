"use client";

import Script from "next/script";

export default function ApiDocPage() {
  return (
    <>
      <style>{`
        body {
          background: #fafafa;
        }
      `}</style>
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
      <div id="swagger-ui" />
      <Script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" strategy="afterInteractive" />
      <Script
        src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => {
          // @ts-ignore
          window.ui = SwaggerUIBundle({
            url: "/openapi.json",
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              // @ts-ignore
              SwaggerUIBundle.presets.apis,
              // @ts-ignore
              SwaggerUIStandalonePreset
            ],
            plugins: [
              // @ts-ignore
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout"
          });
        }}
      />
    </>
  );
}
